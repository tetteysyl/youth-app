import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, unauth, forbidden } from "@/lib/auth-server";

export async function PATCH(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    const { uid, isDistantMember } = await req.json();
    if (!uid || typeof isDistantMember !== "boolean") return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (uid !== authed.uid) return forbidden();
    await adminDb.collection("members").doc(uid).update({ isDistantMember });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
