import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendAbsenceInquiry } from "@/lib/email";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { meetingTitle, meetingDate, absentIds } = await req.json();

    if (!absentIds?.length) return NextResponse.json({ sent: 0 });

    const formattedDate = meetingDate ? format(new Date(meetingDate), "MMMM d, yyyy") : meetingDate;

    await Promise.all(
      absentIds.map(async (uid: string) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (!snap.exists) return;
        const member = snap.data()!;
        if (member.email) {
          await sendAbsenceInquiry(member.email, member.displayName, meetingTitle, formattedDate);
        }
      })
    );

    return NextResponse.json({ sent: absentIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
