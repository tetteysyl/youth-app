import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { subject, message, senderName } = await req.json();

    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    const recipients = snap.docs.map((d) => ({
      email: d.data().email,
      name: d.data().displayName,
    })).filter((r) => r.email);

    await sendBroadcastEmail(recipients, subject, message, senderName);
    return NextResponse.json({ sent: recipients.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
