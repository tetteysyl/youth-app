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

    // Send emails
    let emailError = null;
    try {
      await sendBroadcastEmail(
        recipients,
        `Attendance Confirmed: ${meetingTitle}`,
        `Dear Member,\n\nYour attendance at "${meetingTitle}" has been recorded. Thank you for being present!\n\nYours in Service,\nYPG Secretariat`,
        "YPG Secretariat"
      );
    } catch (e: any) {
      emailError = e.message;
    }

    // Write in-app notifications
    const now = new Date();
    await Promise.all(
      presentIds.map((uid: string) =>
        adminDb.collection("notifications").add({
          userId: uid,
          title: "Attendance Recorded",
          body: `Your attendance at "${meetingTitle}" has been marked. Thank you!`,
          type: "attendance",
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
