import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden, invalidateProfileCache } from "@/lib/auth-server";
import { invalidateMembersCache } from "@/app/api/get-members/route";
import { invalidateCellsCache } from "@/app/api/cells/route";

const EXECUTIVE_ROLES = ["super_admin", "president", "vice_president", "general_secretary", "assistant_general_secretary", "financial_secretary", "treasurer", "evangelism_coordinator", "male_organizer", "female_organizer"];

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!EXECUTIVE_ROLES.includes(caller.role)) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    // Return pending members list for admin approval panel
    if (status === "pending") {
      const snap = await adminDb.collection("members").where("role", "==", "pending").get();
      return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    const snap = await adminDb.collection("members")
      .where("role", "not-in", ["pending", "rejected", "super_admin"])
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

export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!EXECUTIVE_ROLES.includes(caller.role)) return forbidden();

  try {
    const body = await req.json();
    const { memberId, role: newRole, fields } = body;
    if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

    const snap = await adminDb.collection("members").doc(memberId).get();
    if (!snap.exists) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    // The super admin (software owner) is not manageable from the app: its record
    // and role can only change via the setup script (Admin SDK).
    if (snap.data()?.role === "super_admin") {
      return NextResponse.json({ error: "The super admin account cannot be modified from the app." }, { status: 403 });
    }
    // super_admin is never assignable through the app — only the setup script grants it.
    if (newRole === "super_admin") {
      return NextResponse.json({ error: "The super admin role cannot be assigned from the app." }, { status: 403 });
    }

    // Editing a member's record fields (name, phone, DOB, gender, distant flag) is
    // reserved for the system owner and the President — not every executive.
    if (fields && typeof fields === "object") {
      if (!["super_admin", "president"].includes(caller.role)) return forbidden();
      const EDITABLE = ["displayName", "phone", "dateOfBirth", "gender", "isDistantMember", "cellChoice"];
      const patch: any = {};
      for (const k of EDITABLE) if (k in fields) patch[k] = fields[k];
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No editable fields" }, { status: 400 });
      await adminDb.collection("members").doc(memberId).update(patch);
      invalidateProfileCache(memberId);
      invalidateMembersCache();
      return NextResponse.json({ ok: true });
    }

    if (!newRole) return NextResponse.json({ error: "Missing role" }, { status: 400 });

    // Singleton roles can only be held by one member. If the role is already held
    // by someone else, block the change — UNLESS the current holder is the caller,
    // in which case this is a deliberate transfer: elevate the recipient and demote
    // the caller to member atomically (doing it in two requests would fail, since
    // demoting the caller first strips their own authorization for the second call).
    const SINGLETON = ["president","vice_president","general_secretary","assistant_general_secretary","financial_secretary","treasurer","evangelism_coordinator","male_organizer","female_organizer"];
    let transferFromCaller = false;
    if (SINGLETON.includes(newRole)) {
      const existing = await adminDb.collection("members").where("role", "==", newRole).get();
      const holder = existing.docs.find(d => d.id !== memberId);
      if (holder) {
        if (holder.id === caller.uid) transferFromCaller = true;
        else return NextResponse.json({ error: `${newRole} is already assigned to another member` }, { status: 409 });
      }
    }

    if (transferFromCaller) {
      const batch = adminDb.batch();
      batch.update(adminDb.collection("members").doc(memberId), { role: newRole });
      batch.update(adminDb.collection("members").doc(caller.uid), { role: "member" });
      await batch.commit();
      invalidateProfileCache(memberId);
      invalidateProfileCache(caller.uid);
    } else {
      await adminDb.collection("members").doc(memberId).update({ role: newRole });
      invalidateProfileCache(memberId);
    }
    invalidateMembersCache();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!["super_admin", "president"].includes(caller.role)) return forbidden();

  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    if (uid === caller.uid) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

    // The super admin (software owner) can never be deleted from the app.
    const targetSnap = await adminDb.collection("members").doc(uid).get();
    if (targetSnap.exists && targetSnap.data()?.role === "super_admin") {
      return NextResponse.json({ error: "The super admin account cannot be deleted from the app." }, { status: 403 });
    }

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
