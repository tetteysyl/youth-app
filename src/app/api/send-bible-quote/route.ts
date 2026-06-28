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

    await sendBroadcastEmail(recipients, subject, message, senderName);
    return NextResponse.json({ sent: recipients.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
