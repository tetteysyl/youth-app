import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendAbsenceInquiry } from "@/lib/email";
import { format } from "date-fns";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ORGANIZERS = ["president", "general_secretary", "male_organizer", "female_organizer"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  try {
    const { meetingTitle, meetingDate, absentIds } = await req.json();
    if (!absentIds?.length) return NextResponse.json({ sent: 0 });
    const formattedDate = meetingDate ? format(new Date(meetingDate), "MMMM d, yyyy") : meetingDate;
    const now = new Date();
    let emailError = null;
    await Promise.all(
      (absentIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (!snap.exists) return;
        const member = snap.data()!;
        if (member.email) {
          try { await sendAbsenceInquiry(member.email, member.displayName, meetingTitle, formattedDate); } catch (e: any) { emailError = e.message; }
        }
        await adminDb.collection("notifications").add({
          userId: uid, title: "Absence Noticed",
          body: `You were marked absent from "${meetingTitle}" on ${formattedDate}. Please let your organizer know.`,
          type: "absence", read: false, createdAt: now,
        });
      })
    );
    return NextResponse.json({ sent: absentIds.length, emailError });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
