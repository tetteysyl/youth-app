import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

// GET /api/admin/members — list all active (non-pending/rejected) members,
// auto-pruning any Firestore doc whose Firebase Auth account no longer exists
// (e.g. someone was deleted directly from the Firebase Auth console).
export async function GET() {
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
          // Unrelated error (network etc.) — don't treat as orphaned, just pass through
          return { id: d.id, ...d.data(), orphaned: false };
        }
      })
    );

    const orphaned = results.filter((m) => m.orphaned);
    if (orphaned.length > 0) {
      const batch = adminDb.batch();
      orphaned.forEach((m) => batch.delete(adminDb.collection("members").doc(m.id)));
      await batch.commit();

      // Also strip them out of any cell they were left in
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/members — President removes a member entirely (Firestore doc + Auth account + cell membership)
export async function DELETE(req: NextRequest) {
  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    try {
      await adminAuth.deleteUser(uid);
    } catch (e: any) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    await adminDb.collection("members").doc(uid).delete();

    const cellsSnap = await adminDb.collection("cells").where("memberIds", "array-contains", uid).get();
    const batch = adminDb.batch();
    cellsSnap.docs.forEach((c) => {
      const ids: string[] = c.data().memberIds || [];
      const updates: any = { memberIds: ids.filter((id) => id !== uid) };
      if (c.data().leaderId === uid) { updates.leaderId = ""; updates.leaderName = ""; }
      batch.update(c.ref, updates);
    });
    if (cellsSnap.docs.length > 0) await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
