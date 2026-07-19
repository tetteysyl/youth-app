import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendWelcomeEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

function calcAge(dob: string): number | null {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!["super_admin", "president"].includes(caller.role)) return forbidden();
  try {
    const { memberId, action = "approve" } = await req.json();
    if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
    const snap = await adminDb.collection("members").doc(memberId).get();
    if (!snap.exists) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const data = snap.data() as any;
    if (data.role !== "pending") return NextResponse.json({ error: "Member is not pending" }, { status: 400 });
    if (action === "reject") {
      await adminDb.collection("members").doc(memberId).update({ role: "rejected" });
      return NextResponse.json({ ok: true });
    }
    // Server-side age enforcement at the approval gate: registration validates age
    // client-side, but the server is the source of truth for who becomes a member.
    const age = calcAge(data.dateOfBirth);
    if (age === null || age < 18 || age > 30) {
      return NextResponse.json({ error: "This applicant's age is outside the YPG range (18–30) and cannot be approved." }, { status: 400 });
    }
    await adminDb.collection("members").doc(memberId).update({ role: "member", approvedAt: new Date(), approvedBy: caller.uid });
    if (data.email) await sendWelcomeEmail(data.email, data.displayName ?? "Member");
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
