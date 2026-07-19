import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { format } from "date-fns";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

const ORGANIZERS = ["super_admin", "president", "general_secretary", "male_organizer", "female_organizer"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  const rl = rateLimit(`notify-meeting:${caller.uid}`, 15, 10 * 60_000);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    const { title, date, time, includeDistantMembers = true } = await req.json();
    const formattedDate = date ? format(new Date(date), "MMMM d, yyyy") : date;
    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    const members = snap.docs.filter((d) => d.data().role !== "rejected");
    const emailEligible = includeDistantMembers ? members : members.filter((d) => !d.data().isDistantMember);
    const recipients = emailEligible.map((d) => ({ email: d.data().email, name: d.data().displayName })).filter((r) => r.email);
    try { await sendBroadcastEmail(recipients, `Meeting Notice: ${title}`, `There is a meeting on ${formattedDate} at ${time}.`, caller.displayName); } catch {}
    return NextResponse.json({ sent: recipients.length });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
