import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuth, requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req);
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
  if (caller.role !== "president") return forbidden();
  try {
    const { subject, message } = await req.json();
    if (!subject || !message) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const ref = await adminDb.collection("broadcasts").add({
      subject, message, sentBy: caller.uid, sentByName: caller.displayName,
      sentAt: FieldValue.serverTimestamp(),
    });

    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    const batch = adminDb.batch();
    const now = new Date();
    const preview = message.length > 80 ? message.slice(0, 80) + "…" : message;
    snap.docs.forEach((d) => {
      if (d.data().role === "rejected") return;
      const notifRef = adminDb.collection("notifications").doc();
      batch.set(notifRef, { userId: d.id, title: `${subject}`, body: preview, type: "broadcast", read: false, createdAt: now });
    });
    await batch.commit();

    try {
      const recipients = snap.docs.map((d) => ({ email: d.data().email, name: d.data().displayName })).filter((r) => r.email);
      await sendBroadcastEmail(recipients, subject, message, caller.displayName);
    } catch (emailErr) { console.error("Broadcast email failed:", emailErr); }

    return NextResponse.json({ id: ref.id, sent: snap.size });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
