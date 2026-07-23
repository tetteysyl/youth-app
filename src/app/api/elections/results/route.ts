import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can, Role } from "@/lib/roles";

/**
 * GET /api/elections/results?id=xxx
 *
 * Tally per position. Results are withheld while voting is open — only the
 * organisers may monitor a live count; everyone can see them once closed.
 */
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const elRef = adminDb.collection("elections").doc(id);
    const elSnap = await elRef.get();
    if (!elSnap.exists) return NextResponse.json({ error: "Election not found" }, { status: 404 });
    const el = elSnap.data() as any;

    const isManager = can.manageElections(caller.role as Role);
    if (el.status !== "closed" && !isManager) {
      return forbidden();
    }

    const [candSnap, voteSnap, ballotSnap] = await Promise.all([
      elRef.collection("candidates").get(),
      elRef.collection("votes").get(),
      elRef.collection("ballots").get(),
    ]);

    const counts: Record<string, number> = {};
    voteSnap.docs.forEach((d) => {
      const cid = (d.data() as any).candidateId as string;
      counts[cid] = (counts[cid] ?? 0) + 1;
    });

    // Group candidates by position, ranked by votes.
    const byPosition: Record<string, any[]> = {};
    candSnap.docs.forEach((d) => {
      const c = d.data() as any;
      (byPosition[c.position] ??= []).push({
        candidateId: d.id,
        memberName: c.memberName ?? "",
        photoURL: c.photoURL ?? null,
        votes: counts[d.id] ?? 0,
      });
    });

    const positions = (el.positions ?? []).map((position: Role) => {
      const list = (byPosition[position] ?? []).sort((a, b) => b.votes - a.votes);
      const total = list.reduce((s, c) => s + c.votes, 0);
      const top = list.length ? list[0].votes : 0;
      const leaders = list.filter((c) => c.votes === top && top > 0);
      return {
        position,
        candidates: list,
        totalVotes: total,
        // A tie is surfaced rather than silently picking one.
        winner: leaders.length === 1 ? leaders[0] : null,
        tied: leaders.length > 1 ? leaders : null,
      };
    });

    return NextResponse.json(
      {
        status: el.status,
        title: el.title,
        year: el.year,
        ballotsCast: ballotSnap.size,
        positions,
        live: el.status === "open",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }
}
