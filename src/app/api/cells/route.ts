import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

export const DEFAULT_CELLS = ["Charis", "Eleos", "Kleos", "Dunamis"];

let _allCellsCache: { data: any[]; ts: number } | null = null;
const CELLS_TTL = 60_000;
export function invalidateCellsCache() { _allCellsCache = null; }

const CELL_MANAGERS = ["president", "general_secretary"];

async function ensureDefaultCells() {
  const snap = await adminDb.collection("cells").get();
  const existingNames = new Set(snap.docs.map((d) => d.data().name));
  const missing = DEFAULT_CELLS.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;
  const batch = adminDb.batch();
  missing.forEach((name) => {
    const ref = adminDb.collection("cells").doc();
    batch.set(ref, { name, leaderId: "", leaderName: "", memberIds: [], createdBy: "system", createdAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

async function pruneDeletedMembers(cellDocs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const allMemberIds = new Set<string>();
  cellDocs.forEach((d) => (d.data().memberIds || []).forEach((id: string) => allMemberIds.add(id)));
  if (allMemberIds.size === 0) return;
  const existing = new Set<string>();
  const ids = Array.from(allMemberIds);
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
    if (Object.keys(updates).length > 0) { batch.update(d.ref, updates); needsCommit = true; }
  });
  if (needsCommit) await batch.commit();
}

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (userId) {
      // Per-user query — not cached, but bounded and fast (indexed)
      const snap = await adminDb.collection("cells").where("memberIds", "array-contains", userId).get();
      const cells = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }));
      return NextResponse.json(cells, { headers: { "Cache-Control": "no-store" } });
    }

    // All-cells view: serve from cache, prune/seed only when cache is cold
    if (_allCellsCache && Date.now() - _allCellsCache.ts < CELLS_TTL) {
      return NextResponse.json(_allCellsCache.data, { headers: { "Cache-Control": "no-store" } });
    }
    await ensureDefaultCells();
    const allSnap = await adminDb.collection("cells").get();
    await pruneDeletedMembers(allSnap.docs);
    const cells = allSnap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }));
    _allCellsCache = { data: cells, ts: Date.now() };
    return NextResponse.json(cells, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!CELL_MANAGERS.includes(caller.role)) return forbidden();

  try {
    const { name, leaderId, leaderName, memberIds } = await req.json();
    if (!name || !leaderId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const allMemberIds: string[] = Array.from(new Set([leaderId, ...(memberIds || [])]));
    await removeMembersFromOtherCells(allMemberIds, null);
    const ref = await adminDb.collection("cells").add({
      name, leaderId, leaderName, memberIds: allMemberIds,
      createdBy: caller.uid, createdAt: FieldValue.serverTimestamp(),
    });
    invalidateCellsCache();
    return NextResponse.json({ id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!CELL_MANAGERS.includes(caller.role)) return forbidden();

  try {
    const { cellId, ...fields } = await req.json();
    if (!cellId) return NextResponse.json({ error: "Missing cellId" }, { status: 400 });
    const existingSnap = await adminDb.collection("cells").doc(cellId).get();
    if (!existingSnap.exists) return NextResponse.json({ error: "Cell not found" }, { status: 404 });
    const existing = existingSnap.data() as any;
    const oldMemberIds: string[] = existing.memberIds || [];
    const oldLeaderId: string = existing.leaderId || "";
    const cellName: string = fields.name ?? existing.name ?? "";
    if (fields.memberIds || fields.leaderId) {
      const leaderId = fields.leaderId ?? oldLeaderId;
      const baseMemberIds: string[] = fields.memberIds ?? oldMemberIds;
      const allMemberIds: string[] = Array.from(new Set([...(leaderId ? [leaderId] : []), ...baseMemberIds]));
      fields.memberIds = allMemberIds;
      await removeMembersFromOtherCells(allMemberIds, cellId);
    }
    await adminDb.collection("cells").doc(cellId).update(fields);
    invalidateCellsCache();
    const now = new Date();
    const newMemberIds: string[] = fields.memberIds ?? oldMemberIds;
    const addedMemberIds = newMemberIds.filter((id: string) => !oldMemberIds.includes(id));
    const newLeaderId: string = fields.leaderId ?? oldLeaderId;
    const batch = adminDb.batch();
    for (const memberId of addedMemberIds) {
      if (memberId === newLeaderId && newLeaderId !== oldLeaderId) continue;
      const ref = adminDb.collection("notifications").doc();
      batch.set(ref, { userId: memberId, title: "You've been reassigned to a new cell", body: `The President has assigned you to ${cellName}.`, type: "broadcast", read: false, createdAt: now });
    }
    if (newLeaderId && newLeaderId !== oldLeaderId) {
      const ref = adminDb.collection("notifications").doc();
      batch.set(ref, { userId: newLeaderId, title: "You've been appointed Cell Leader", body: `The President has appointed you as the leader of ${cellName}.`, type: "broadcast", read: false, createdAt: now });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "Cells cannot be deleted." }, { status: 403 });
}

async function removeMembersFromOtherCells(memberIds: string[], excludeCellId: string | null) {
  for (const memberId of memberIds) {
    const snap = await adminDb.collection("cells").where("memberIds", "array-contains", memberId).get();
    const batch = adminDb.batch();
    let hasBatch = false;
    snap.docs.forEach((d) => {
      if (excludeCellId && d.id === excludeCellId) return;
      const currentIds: string[] = d.data().memberIds || [];
      batch.update(d.ref, { memberIds: currentIds.filter((id) => id !== memberId) });
      hasBatch = true;
    });
    if (hasBatch) await batch.commit();
  }
}
