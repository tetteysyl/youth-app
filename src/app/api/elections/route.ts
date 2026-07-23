import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can, Role } from "@/lib/roles";
import { ELECTABLE_POSITIONS, ElectionStatus } from "@/lib/elections";
import { checkDuesEligibility, ms } from "@/lib/elections-server";

/**
 * Elections API.
 *
 * All election data is server-only: the Firestore rules deny client access to
 * these collections (default-deny), so every read/write goes through here where
 * role and eligibility are enforced.
 *
 * Ballot secrecy: a vote writes TWO documents —
 *   ballots/{voterId}_{position}  → records THAT you voted (no candidate)
 *   votes/{autoId}                → records the choice (no voter)
 * so no single document links a member to their selection.
 */

async function loadElection(id: string) {
  const doc = await adminDb.collection("elections").doc(id).get();
  if (!doc.exists) return null;
  const d = doc.data() as any;
  return {
    id: doc.id,
    title: d.title ?? "",
    year: d.year ?? new Date().getFullYear(),
    status: (d.status ?? "draft") as ElectionStatus,
    positions: (d.positions ?? []) as Role[],
    createdByName: d.createdByName ?? "",
    createdAt: ms(d.createdAt),
    openedAt: ms(d.openedAt),
    closedAt: ms(d.closedAt),
  };
}

// GET /api/elections            → all elections (summary)
// GET /api/elections?id=xxx     → one election + candidates + the caller's voting status
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  try {
    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
      const snap = await adminDb.collection("elections").get();
      const elections = snap.docs
        .map((d) => {
          const x = d.data() as any;
          return {
            id: d.id, title: x.title ?? "", year: x.year, status: x.status ?? "draft",
            positions: x.positions ?? [], createdAt: ms(x.createdAt),
          };
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      return NextResponse.json(elections, { headers: { "Cache-Control": "no-store" } });
    }

    const election = await loadElection(id);
    if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 });

    const candSnap = await adminDb.collection("elections").doc(id).collection("candidates").get();
    const candidates = candSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Which positions has the caller already voted in? (ballot markers, not choices)
    const ballotSnap = await adminDb.collection("elections").doc(id)
      .collection("ballots").where("voterId", "==", caller.uid).get();
    const votedPositions = ballotSnap.docs.map((d) => (d.data() as any).position as Role);

    // Eligibility — only meaningful for actual members.
    const isVoter = can.voteInElections(caller.role as Role);
    const eligibility = isVoter
      ? await checkDuesEligibility(caller.uid, election.year)
      : { eligible: false, unpaidMonths: [], monthsChecked: 0 };

    return NextResponse.json(
      { election, candidates, votedPositions, eligibility, isVoter },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to load elections" }, { status: 500 });
  }
}

// POST /api/elections — create an election (draft)
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.manageElections(caller.role as Role)) return forbidden();

  try {
    const { title, year, positions } = await req.json();
    if (!title || !year) return NextResponse.json({ error: "Title and year are required" }, { status: 400 });

    const picked: Role[] = Array.isArray(positions) && positions.length
      ? positions.filter((p: Role) => ELECTABLE_POSITIONS.includes(p))
      : ELECTABLE_POSITIONS;
    if (!picked.length) return NextResponse.json({ error: "No valid positions selected" }, { status: 400 });

    // Only one election may be open at a time.
    const openSnap = await adminDb.collection("elections").where("status", "==", "open").get();
    if (!openSnap.empty) {
      return NextResponse.json({ error: "Another election is already open. Close it first." }, { status: 409 });
    }

    const ref = await adminDb.collection("elections").add({
      title: String(title).slice(0, 120),
      year: Number(year),
      status: "draft" as ElectionStatus,
      positions: picked,
      createdBy: caller.uid,
      createdByName: caller.displayName,
      createdAt: new Date(),
    });
    return NextResponse.json({ id: ref.id });
  } catch {
    return NextResponse.json({ error: "Failed to create election" }, { status: 500 });
  }
}

// PATCH /api/elections — open or close an election
export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.manageElections(caller.role as Role)) return forbidden();

  try {
    const { id, action } = await req.json();
    if (!id || !["open", "close"].includes(action)) {
      return NextResponse.json({ error: "id and action (open|close) are required" }, { status: 400 });
    }
    const ref = adminDb.collection("elections").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    const current = (snap.data() as any).status as ElectionStatus;

    if (action === "open") {
      if (current === "closed") return NextResponse.json({ error: "A closed election cannot be reopened." }, { status: 400 });
      const candSnap = await ref.collection("candidates").get();
      if (candSnap.empty) return NextResponse.json({ error: "Add candidates before opening voting." }, { status: 400 });
      const openSnap = await adminDb.collection("elections").where("status", "==", "open").get();
      if (openSnap.docs.some((d) => d.id !== id)) {
        return NextResponse.json({ error: "Another election is already open." }, { status: 409 });
      }
      await ref.update({ status: "open", openedAt: new Date() });
    } else {
      if (current !== "open") return NextResponse.json({ error: "Only an open election can be closed." }, { status: 400 });
      await ref.update({ status: "closed", closedAt: new Date() });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update election" }, { status: 500 });
  }
}

// DELETE /api/elections — delete a draft election (never one that has run)
export async function DELETE(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!can.manageElections(caller.role as Role)) return forbidden();

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ref = adminDb.collection("elections").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    if ((snap.data() as any).status !== "draft") {
      return NextResponse.json({ error: "Only a draft election can be deleted — voting records are permanent." }, { status: 400 });
    }
    const cands = await ref.collection("candidates").get();
    const batch = adminDb.batch();
    cands.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete election" }, { status: 500 });
  }
}
