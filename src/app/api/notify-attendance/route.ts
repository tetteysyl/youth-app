import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { meetingTitle, presentIds } = await req.json();

    if (!presentIds?.length) return NextResponse.json({ sent: 0 });

    const recipients: { email: string; name: string }[] = [];
    await Promise.all(
      presentIds.map(async (uid: string) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (snap.exists && snap.data()?.email) {
          recipients.push({ email: snap.data()!.email, name: snap.data()!.displayName });
        }
      })
    );

    await sendBroadcastEmail(
      recipients,
      `Attendance Confirmed: ${meetingTitle}`,
      `Dear Member,\n\nThis is to confirm that your attendance at the following meeting has been recorded:\n\n📋 ${meetingTitle}\n\nThank you for being present. God bless you!\n\nYours in Service,\nYPG Secretariat`,
      "YPG Secretariat"
    );

    return NextResponse.json({ sent: recipients.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
