import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { quote, reference, recipientIds, senderName } = await req.json();

    const recipients: { email: string; name: string }[] = [];
    await Promise.all(
      recipientIds.map(async (uid: string) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (snap.exists && snap.data()?.email) {
          recipients.push({ email: snap.data()!.email, name: snap.data()!.displayName });
        }
      })
    );

    const subject = reference ? `Devotional: ${reference}` : "Daily Devotional from YPG";
    const message = reference
      ? `"${quote}"\n\n— ${reference}\n\nShared by ${senderName}`
      : `${quote}\n\nShared by ${senderName}`;

    // Send emails
    let emailError = null;
    try {
      await sendBroadcastEmail(recipients, subject, message, senderName);
    } catch (e: any) {
      emailError = e.message;
    }

    // In-app notifications
    const now = new Date();
    await Promise.all(
      recipientIds.map((uid: string) =>
        adminDb.collection("notifications").add({
          userId: uid,
          title: reference ? `📖 ${reference}` : "Daily Devotional",
          body: quote.length > 100 ? quote.slice(0, 100) + "…" : quote,
          type: "evangelism",
          read: false,
          createdAt: now,
        })
      )
    );

    return NextResponse.json({ sent: recipients.length, emailError });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
