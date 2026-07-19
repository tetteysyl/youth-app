import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendAbsenceInquiry } from "@/lib/email";
import { format } from "date-fns";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

const ORGANIZERS = ["super_admin", "president", "general_secretary", "male_organizer", "female_organizer"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  const rl = rateLimit(`absence:${caller.uid}`, 15, 10 * 60_000);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    const { meetingTitle, meetingDate, absentIds } = await req.json();
    if (!absentIds?.length) return NextResponse.json({ sent: 0 });
    if (!Array.isArray(absentIds) || absentIds.length > 500) return NextResponse.json({ error: "Invalid absentIds" }, { status: 400 });
    const safeMeetingTitle = String(meetingTitle ?? "").slice(0, 200);
    const formattedDate = meetingDate ? format(new Date(meetingDate), "MMMM d, yyyy") : meetingDate;
    const now = new Date();
    let emailError = null;
    await Promise.all(
      (absentIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (!snap.exists) return;
        const member = snap.data()!;
        if (member.email) {
          try { await sendAbsenceInquiry(member.email, member.displayName, safeMeetingTitle, formattedDate); } catch (e: any) { emailError = e.message; }
        }
        await adminDb.collection("notifications").add({
          userId: uid, title: "Absence Noticed",
          body: `You were marked absent from "${safeMeetingTitle}" on ${formattedDate}. Please let your organizer know.`,
          type: "absence", read: false, createdAt: now,
        });
      })
    );
    return NextResponse.json({ sent: absentIds.length, emailError });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
