import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// PATCH /api/member-settings — a member updates their own distant-member status
export async function PATCH(req: NextRequest) {
  try {
    const { uid, isDistantMember } = await req.json();
    if (!uid || typeof isDistantMember !== "boolean") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await adminDb.collection("members").doc(uid).update({ isDistantMember });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
