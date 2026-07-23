import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can, Role } from "@/lib/roles";
import { ELECTABLE_POSITIONS } from "@/lib/elections";

// POST /api/elections/candidates — nominate a member for a position
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.manageElections(caller.role as Role)) return forbidden();

  try {
    const { electionId, memberId, position } = await req.json();
    if (!electionId || !memberId || !position) {
      return NextResponse.json({ error: "electionId, memberId and position are required" }, { status: 400 });
    }
    if (!ELECTABLE_POSITIONS.includes(position)) {
      return NextResponse.json({ error: "That position is not an elected office." }, { status: 400 });
    }

    const elRef = adminDb.collection("elections").doc(electionId);
    const elSnap = await elRef.get();
    if (!elSnap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    const el = elSnap.data() as any;
    if (el.status !== "draft") {
      return NextResponse.json({ error: "Candidates can only be changed while the election is a draft." }, { status: 400 });
    }
    if (!(el.positions ?? []).includes(position)) {
      return NextResponse.json({ error: "That position is not part of this election." }, { status: 400 });
    }

    // The candidate must be a real member (never the super admin).
    const memSnap = await adminDb.collection("members").doc(memberId).get();
    if (!memSnap.exists) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const mem = memSnap.data() as any;
    if (["pending", "rejected", "super_admin"].includes(mem.role)) {
      return NextResponse.json({ error: "That account cannot stand for election." }, { status: 400 });
    }

    // No duplicate nomination for the same person in the same position.
    const dup = await elRef.collection("candidates")
      .where("memberId", "==", memberId).where("position", "==", position).get();
    if (!dup.empty) {
      return NextResponse.json({ error: "That member is already standing for this position." }, { status: 409 });
    }

    const ref = await elRef.collection("candidates").add({
      memberId,
      memberName: mem.displayName ?? "",
      photoURL: mem.photoURL ?? null,
      position,
      addedAt: new Date(),
    });
    return NextResponse.json({ id: ref.id });
  } catch {
    return NextResponse.json({ error: "Failed to add candidate" }, { status: 500 });
  }
}

// DELETE /api/elections/candidates — withdraw a candidate (draft only)
export async function DELETE(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.manageElections(caller.role as Role)) return forbidden();

  try {
    const { electionId, candidateId } = await req.json();
    if (!electionId || !candidateId) {
      return NextResponse.json({ error: "electionId and candidateId are required" }, { status: 400 });
    }
    const elRef = adminDb.collection("elections").doc(electionId);
    const elSnap = await elRef.get();
    if (!elSnap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    if ((elSnap.data() as any).status !== "draft") {
      return NextResponse.json({ error: "Candidates can only be changed while the election is a draft." }, { status: 400 });
    }
    await elRef.collection("candidates").doc(candidateId).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove candidate" }, { status: 500 });
  }
}
