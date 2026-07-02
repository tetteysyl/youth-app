import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const EVANGELISM_ROLES = ["president", "evangelism_coordinator"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!EVANGELISM_ROLES.includes(caller.role)) return forbidden();
  try {
    const { quote, reference, recipientIds } = await req.json();
    const recipients: { email: string; name: string }[] = [];
    await Promise.all(
      (recipientIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (snap.exists && snap.data()?.email) recipients.push({ email: snap.data()!.email, name: snap.data()!.displayName });
      })
    );
    const subject = reference ? `Devotional: ${reference}` : "Daily Devotional from YPG";
    const message = reference ? `"${quote}"\n\n— ${reference}\n\nShared by ${caller.displayName}` : `${quote}\n\nShared by ${caller.displayName}`;
    let emailError = null;
    try { await sendBroadcastEmail(recipients, subject, message, caller.displayName); } catch (e: any) { emailError = e.message; }
    const now = new Date();
    await Promise.all(
      (recipientIds as string[]).map((uid) =>
        adminDb.collection("notifications").add({
          userId: uid, title: reference ? `📖 ${reference}` : "Daily Devotional",
          body: quote.length > 100 ? quote.slice(0, 100) + "…" : quote,
          type: "evangelism", read: false, createdAt: now,
        })
      )
    );
    return NextResponse.json({ sent: recipients.length, emailError });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
