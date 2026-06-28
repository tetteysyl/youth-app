import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendAbsenceInquiry } from "@/lib/email";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { meetingTitle, meetingDate, absentIds } = await req.json();
    if (!absentIds?.length) return NextResponse.json({ sent: 0 });

    const formattedDate = meetingDate ? format(new Date(meetingDate), "MMMM d, yyyy") : meetingDate;
    const now = new Date();

    let emailError = null;
    await Promise.all(
      absentIds.map(async (uid: string) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (!snap.exists) return;
        const member = snap.data()!;

        // Send email
        if (member.email) {
          try {
            await sendAbsenceInquiry(member.email, member.displayName, meetingTitle, formattedDate);
          } catch (e: any) {
            emailError = e.message;
          }
        }

        // In-app notification
        await adminDb.collection("notifications").add({
          userId: uid,
          title: "Absence Noticed",
          body: `You were marked absent from "${meetingTitle}" on ${formattedDate}. Please let your organizer know.`,
          type: "absence",
          read: false,
          createdAt: now,
        });
      })
    );

    return NextResponse.json({ sent: absentIds.length, emailError });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
