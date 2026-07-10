import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden, invalidateProfileCache } from "@/lib/auth-server";
import { invalidateMembersCache } from "@/app/api/get-members/route";
import { invalidateCellsCache } from "@/app/api/cells/route";

const ADMIN_ROLES = ["president", "general_secretary", "assistant_general_secretary"];

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ADMIN_ROLES.includes(caller.role)) return forbidden();

  try {
    const snap = await adminDb.collection("members")
      .where("role", "not-in", ["pending", "rejected"])
      .get();

    const results = await Promise.all(
      snap.docs.map(async (d) => {
        try {
          await adminAuth.getUser(d.id);
          return { id: d.id, ...d.data(), orphaned: false };
        } catch (e: any) {
          if (e.code === "auth/user-not-found") return { id: d.id, ...d.data(), orphaned: true };
          return { id: d.id, ...d.data(), orphaned: false };
        }
      })
    );

    const orphaned = results.filter((m) => m.orphaned);
    if (orphaned.length > 0) {
      const batch = adminDb.batch();
      orphaned.forEach((m) => batch.delete(adminDb.collection("members").doc(m.id)));
      await batch.commit();
      const cellsSnap = await adminDb.collection("cells").get();
      const cellBatch = adminDb.batch();
      let cellBatchNeeded = false;
      const orphanedIds = new Set(orphaned.map((m) => m.id));
      cellsSnap.docs.forEach((c) => {
        const ids: string[] = c.data().memberIds || [];
        const cleaned = ids.filter((id) => !orphanedIds.has(id));
        if (cleaned.length !== ids.length) {
          cellBatch.update(c.ref, { memberIds: cleaned });
          cellBatchNeeded = true;
        }
      });
      if (cellBatchNeeded) await cellBatch.commit();
    }

    const active = results.filter((m) => !m.orphaned).map(({ orphaned, ...rest }) => rest);
    return NextResponse.json(active, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (caller.role !== "president") return forbidden();

  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    if (uid === caller.uid) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

    try {
      await adminAuth.deleteUser(uid);
    } catch (e: any) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    await adminDb.collection("members").doc(uid).delete();
    invalidateProfileCache(uid);
    invalidateMembersCache();

    const cellsSnap = await adminDb.collection("cells").where("memberIds", "array-contains", uid).get();
    const batch = adminDb.batch();
    cellsSnap.docs.forEach((c) => {
      const ids: string[] = c.data().memberIds || [];
      const updates: any = { memberIds: ids.filter((id) => id !== uid) };
      if (c.data().leaderId === uid) { updates.leaderId = ""; updates.leaderName = ""; }
      batch.update(c.ref, updates);
    });
    if (cellsSnap.docs.length > 0) { await batch.commit(); invalidateCellsCache(); }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
