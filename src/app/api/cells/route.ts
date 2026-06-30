import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// The four standing YPG cells — must always exist for the President to manage.
export const DEFAULT_CELLS = ["Charis", "Eleos", "Kleos", "Dunamis"];

async function ensureDefaultCells() {
  const snap = await adminDb.collection("cells").get();
  const existingNames = new Set(snap.docs.map((d) => d.data().name));
  const missing = DEFAULT_CELLS.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;

  const batch = adminDb.batch();
  missing.forEach((name) => {
    const ref = adminDb.collection("cells").doc();
    batch.set(ref, {
      name,
      leaderId: "",
      leaderName: "",
      memberIds: [],
      createdBy: "system",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

// Removes references to members that no longer exist in the `members` collection
// (e.g. deleted by the YAF auto-removal cron, or manually) from every cell's
// memberIds/leaderId. Keeps the President's Cells view accurate without manual cleanup.
async function pruneDeletedMembers(cellDocs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const allMemberIds = new Set<string>();
  cellDocs.forEach((d) => (d.data().memberIds || []).forEach((id: string) => allMemberIds.add(id)));
  if (allMemberIds.size === 0) return new Map<string, boolean>();

  const existing = new Set<string>();
  const ids = Array.from(allMemberIds);
  // Firestore "in" queries on document references are capped at 30 ids per call
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const refs = chunk.map((id) => adminDb.collection("members").doc(id));
    const docs = await adminDb.getAll(...refs);
    docs.forEach((d) => { if (d.exists) existing.add(d.id); });
  }

  const batch = adminDb.batch();
  let needsCommit = false;
  cellDocs.forEach((d) => {
    const data = d.data();
    const memberIds: string[] = data.memberIds || [];
    const cleaned = memberIds.filter((id) => existing.has(id));
    const updates: any = {};
    if (cleaned.length !== memberIds.length) updates.memberIds = cleaned;
    if (data.leaderId && !existing.has(data.leaderId)) { updates.leaderId = ""; updates.leaderName = ""; }
    if (Object.keys(updates).length > 0) {
      batch.update(d.ref, updates);
      needsCommit = true;
      Object.assign(data, updates); // reflect locally for this response
    }
  });
  if (needsCommit) await batch.commit();
  return existing;
}

// GET /api/cells           — all cells (bootstraps the 4 default cells if missing)
// GET /api/cells?userId=X  — cells where memberIds array-contains X
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      await ensureDefaultCells();
      const allSnap = await adminDb.collection("cells").get();
      await pruneDeletedMembers(allSnap.docs);
    }

    let snap;
    if (userId) {
      snap = await adminDb.collection("cells").where("memberIds", "array-contains", userId).get();
    } else {
      snap = await adminDb.collection("cells").get();
    }

    const cells = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() ?? null,
    }));

    return NextResponse.json(cells, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/cells — create cell
export async function POST(req: NextRequest) {
  try {
    const { name, leaderId, leaderName, memberIds, createdBy } = await req.json();
    if (!name || !leaderId || !createdBy) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Ensure leader is included in memberIds
    const allMemberIds: string[] = Array.from(new Set([leaderId, ...(memberIds || [])]));

    // Remove these members from any other cell they're in
    await removeMembersFromOtherCells(allMemberIds, null);

    const ref = await adminDb.collection("cells").add({
      name,
      leaderId,
      leaderName,
      memberIds: allMemberIds,
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/cells — update cell (add/remove members, change leader). Notifies affected members.
export async function PATCH(req: NextRequest) {
  try {
    const { cellId, ...fields } = await req.json();
    if (!cellId) {
      return NextResponse.json({ error: "Missing cellId" }, { status: 400 });
    }

    const existingSnap = await adminDb.collection("cells").doc(cellId).get();
    if (!existingSnap.exists) return NextResponse.json({ error: "Cell not found" }, { status: 404 });
    const existing = existingSnap.data() as any;
    const oldMemberIds: string[] = existing.memberIds || [];
    const oldLeaderId: string = existing.leaderId || "";
    const cellName: string = fields.name ?? existing.name ?? "";

    // If memberIds are being updated, enforce one-cell-only
    if (fields.memberIds) {
      const leaderId = fields.leaderId ?? oldLeaderId;
      const allMemberIds: string[] = Array.from(
        new Set([...(leaderId ? [leaderId] : []), ...fields.memberIds])
      );
      fields.memberIds = allMemberIds;
      await removeMembersFromOtherCells(allMemberIds, cellId);
    }

    await adminDb.collection("cells").doc(cellId).update(fields);

    // Notify newly-added/reassigned members
    const now = new Date();
    const newMemberIds: string[] = fields.memberIds ?? oldMemberIds;
    const addedMemberIds = newMemberIds.filter((id: string) => !oldMemberIds.includes(id));
    const newLeaderId: string = fields.leaderId ?? oldLeaderId;

    const batch = adminDb.batch();
    for (const memberId of addedMemberIds) {
      if (memberId === newLeaderId && newLeaderId !== oldLeaderId) continue; // leader gets the leadership notification instead
      const ref = adminDb.collection("notifications").doc();
      batch.set(ref, {
        userId: memberId,
        title: "You've been reassigned to a new cell",
        body: `The President has assigned you to ${cellName}.`,
        type: "broadcast",
        read: false,
        createdAt: now,
      });
    }
    if (newLeaderId && newLeaderId !== oldLeaderId) {
      const ref = adminDb.collection("notifications").doc();
      batch.set(ref, {
        userId: newLeaderId,
        title: "You've been appointed Cell Leader",
        body: `The President has appointed you as the leader of ${cellName}.`,
        type: "broadcast",
        read: false,
        createdAt: now,
      });
    }
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/cells — disabled. Cells cannot be deleted, only have members added/removed.
export async function DELETE() {
  return NextResponse.json({ error: "Cells cannot be deleted." }, { status: 403 });
}

// Helper: remove given member IDs from any cell other than excludeCellId
async function removeMembersFromOtherCells(memberIds: string[], excludeCellId: string | null) {
  for (const memberId of memberIds) {
    let q = adminDb.collection("cells").where("memberIds", "array-contains", memberId);
    const snap = await q.get();
    const batch = adminDb.batch();
    let hasBatch = false;
    snap.docs.forEach((d) => {
      if (excludeCellId && d.id === excludeCellId) return;
      const currentIds: string[] = d.data().memberIds || [];
      const updated = currentIds.filter((id) => id !== memberId);
      batch.update(d.ref, { memberIds: updated });
      hasBatch = true;
    });
    if (hasBatch) await batch.commit();
  }
}
