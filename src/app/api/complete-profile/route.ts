import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, unauth, forbidden } from "@/lib/auth-server";

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
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    const { uid, dateOfBirth, cellChoice, gender, isDistantMember } = await req.json();
    if (!uid || !dateOfBirth || !gender) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (uid !== authed.uid) return forbidden();
    const age = calcAge(dateOfBirth);
    if (age === null) return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
    if (age < 18) return NextResponse.json({ error: "Sorry, your age does not permit you to be a YPG member. Kindly join Children Service." }, { status: 400 });
    if (age > 30) return NextResponse.json({ error: "Sorry, you can't be part of YPG. Your age makes you a YAF member." }, { status: 400 });
    await adminDb.collection("members").doc(uid).update({ dateOfBirth, cellChoice: cellChoice || "none", gender, isDistantMember: !!isDistantMember });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
