import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can, Role } from "@/lib/roles";
import { checkDuesEligibility } from "@/lib/elections-server";
import { MONTH_NAMES } from "@/lib/elections";

/**
 * Cast a ballot: POST /api/elections/vote  { electionId, position, candidateId }
 *
 * Guarantees:
 *  - only an open election accepts votes
 *  - only real members vote (never the super admin)
 *  - only members clear of dues for the election year
 *  - exactly ONE vote per member per position, enforced atomically by creating
 *    ballots/{voterId}_{position} with .create() (fails if it already exists)
 *  - secrecy: the ballot marker holds no candidate, the tally row holds no voter
 */
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.voteInElections(caller.role as Role)) return forbidden();

  try {
    const { electionId, position, candidateId } = await req.json();
    if (!electionId || !position || !candidateId) {
      return NextResponse.json({ error: "electionId, position and candidateId are required" }, { status: 400 });
    }

    const elRef = adminDb.collection("elections").doc(electionId);
    const elSnap = await elRef.get();
    if (!elSnap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    const el = elSnap.data() as any;
    if (el.status !== "open") {
      return NextResponse.json({ error: "Voting is not open for this election." }, { status: 400 });
    }

    // Dues eligibility for the election year.
    const elig = await checkDuesEligibility(caller.uid, el.year);
    if (!elig.eligible) {
      const names = elig.unpaidMonths.map((m) => MONTH_NAMES[m - 1]).join(", ");
      return NextResponse.json(
        { error: `You are owing dues for ${el.year} (${names}). Settle your dues to vote.` },
        { status: 403 }
      );
    }

    // The candidate must belong to this election and stand for this position.
    const candSnap = await elRef.collection("candidates").doc(candidateId).get();
    if (!candSnap.exists) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if ((candSnap.data() as any).position !== position) {
      return NextResponse.json({ error: "That candidate is not standing for this position." }, { status: 400 });
    }

    // One vote per position — .create() throws if the ballot marker already exists,
    // and because both writes share a batch, nothing is recorded on a repeat attempt.
    const ballotRef = elRef.collection("ballots").doc(`${caller.uid}_${position}`);
    const voteRef = elRef.collection("votes").doc();
    const batch = adminDb.batch();
    batch.create(ballotRef, { voterId: caller.uid, position, votedAt: new Date() });
    batch.set(voteRef, { position, candidateId, castAt: new Date() });

    try {
      await batch.commit();
    } catch (e: any) {
      if (e?.code === 6 || String(e?.message ?? "").includes("ALREADY_EXISTS")) {
        return NextResponse.json({ error: "You have already voted for this position." }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to record your vote" }, { status: 500 });
  }
}
