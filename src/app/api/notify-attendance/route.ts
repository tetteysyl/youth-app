import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { rateLimit, rateLimited } from "@/lib/rate-limit";
import { sendTemplateBulk, WA_TEMPLATES } from "@/lib/whatsapp";

const ORGANIZERS = ["super_admin", "president", "general_secretary", "male_organizer", "female_organizer"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  const rl = rateLimit(`notify-attendance:${caller.uid}`, 15, 10 * 60_000);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    const { meetingTitle, presentIds } = await req.json();
    if (!presentIds?.length) return NextResponse.json({ sent: 0 });
    if (!Array.isArray(presentIds) || presentIds.length > 500) return NextResponse.json({ error: "Invalid presentIds" }, { status: 400 });
    const safeMeetingTitle = String(meetingTitle ?? "").slice(0, 200);
    const recipients: { email: string; name: string }[] = [];
    const waTargets: { phone?: string | null; params: string[] }[] = [];
    await Promise.all(
      (presentIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (!snap.exists) return;
        const x = snap.data()!;
        if (x.email) recipients.push({ email: x.email, name: x.displayName });
        waTargets.push({ phone: x.phone, params: [`Attendance Confirmed: ${safeMeetingTitle}`, `Your attendance at "${safeMeetingTitle}" has been recorded. Thank you for attending.`] });
      })
    );
    try { await sendBroadcastEmail(recipients, `Attendance Confirmed: ${safeMeetingTitle}`, `Your attendance at "${safeMeetingTitle}" has been recorded. Thank you for attending.`, caller.displayName); } catch {}
    const wa = await sendTemplateBulk(waTargets, WA_TEMPLATES.announcement);
    return NextResponse.json({ sent: recipients.length, whatsapp: wa });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
