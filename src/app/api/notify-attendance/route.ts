import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ORGANIZERS = ["president", "general_secretary", "male_organizer", "female_organizer"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  try {
    const { meetingTitle, presentIds } = await req.json();
    if (!presentIds?.length) return NextResponse.json({ sent: 0 });
    const recipients: { email: string; name: string }[] = [];
    await Promise.all(
      (presentIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (snap.exists && snap.data()?.email) recipients.push({ email: snap.data()!.email, name: snap.data()!.displayName });
      })
    );
    try { await sendBroadcastEmail(recipients, `Attendance Confirmed: ${meetingTitle}`, `Your attendance at "${meetingTitle}" has been recorded. Thank you for attending.`, caller.displayName); } catch {}
    return NextResponse.json({ sent: recipients.length });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
