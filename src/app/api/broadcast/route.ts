import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

const BROADCAST_SENDERS = ["super_admin", "president", "vice_president", "general_secretary", "assistant_general_secretary"];

export async function GET(req: NextRequest) {
  const authed = await requireAuthWithRole(req);
  if (!authed) return unauth();
  try {
    const snap = await adminDb.collection("broadcasts").get();
    const broadcasts = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return { id: d.id, subject: data.subject ?? "", message: data.message ?? "", sentBy: data.sentBy ?? "", sentByName: data.sentByName ?? "", sentAt: data.sentAt?.toMillis?.() ?? null };
      })
      .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
    return NextResponse.json(broadcasts);
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!BROADCAST_SENDERS.includes(caller.role)) return forbidden();
  const rl = rateLimit(`broadcast:${caller.uid}`, 5, 10 * 60_000);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    const { subject, message } = await req.json();
    if (!subject || !message) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const ref = await adminDb.collection("broadcasts").add({
      subject, message, sentBy: caller.uid, sentByName: caller.displayName,
      sentAt: FieldValue.serverTimestamp(),
    });

    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    // Recipients are actual congregation members: exclude rejected users and the
    // super admin (the owner is not a member). Used for BOTH the in-app
    // notifications and the emails, so the two can't drift apart.
    const memberDocs = snap.docs.filter((d) => !["rejected", "super_admin"].includes(d.data().role));
    const batch = adminDb.batch();
    const now = new Date();
    const preview = message.length > 80 ? message.slice(0, 80) + "…" : message;
    memberDocs.forEach((d) => {
      const notifRef = adminDb.collection("notifications").doc();
      batch.set(notifRef, { userId: d.id, title: `${subject}`, body: preview, type: "broadcast", read: false, createdAt: now });
    });
    await batch.commit();

    try {
      const recipients = memberDocs.map((d) => ({ email: d.data().email, name: d.data().displayName })).filter((r) => r.email);
      await sendBroadcastEmail(recipients, subject, message, caller.displayName);
    } catch (emailErr) { console.error("Broadcast email failed:", emailErr); }

    return NextResponse.json({ id: ref.id, sent: memberDocs.length });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
