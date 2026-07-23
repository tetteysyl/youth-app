import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

const GROUP_MESSAGE_ROLES = ["president", "vice_president", "general_secretary", "assistant_general_secretary", "male_organizer", "female_organizer", "financial_secretary", "treasurer", "evangelism_coordinator"];

// Short-lived server cache for group and cell messages (invalidated on write)
const _groupCache: { data: any[]; ts: number } | null = null;
let groupCache: { data: any[]; ts: number } | null = _groupCache;
const _cellCache = new Map<string, { data: any[]; ts: number }>();
const MSG_TTL = 5_000;

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  // The super admin is a back-office monitor and takes no part in messaging —
  // it cannot read direct, group, or cell messages.
  if (caller.role === "super_admin") return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const type = searchParams.get("type");
    const unreadCount = searchParams.get("unreadCount");
    const cellId = searchParams.get("cellId");
    const inbox = searchParams.get("inbox");
    const viewerId = searchParams.get("viewerId");

    if (unreadCount) {
      if (unreadCount !== caller.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const directSnap = await adminDb.collection("messages")
        .where("recipientId", "==", unreadCount).where("read", "==", false).get();
      const cellsSnap = await adminDb.collection("cells").where("memberIds", "array-contains", unreadCount).get();
      let cellUnread = 0;
      for (const cellDoc of cellsSnap.docs) {
        const cellMsgSnap = await adminDb.collection("messages")
          .where("cellId", "==", cellDoc.id).where("read", "==", false).get();
        cellUnread += cellMsgSnap.docs.filter((d) => d.data().senderId !== unreadCount).length;
      }
      return NextResponse.json({ count: directSnap.size + cellUnread });
    }

    if (inbox) {
      if (inbox !== caller.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      // Two single-field queries (no orderBy) to avoid composite index requirement.
      // Firestore auto-indexes each field individually.
      const [unreadSnap, recentSnap] = await Promise.all([
        adminDb.collection("messages").where("recipientId", "==", inbox).where("read", "==", false).get(),
        adminDb.collection("messages").where("recipientId", "==", inbox).get(),
      ]);
      const convMap: Record<string, { unread: number; lastAt: number }> = {};
      unreadSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.type !== "direct") return;
        const convId: string = data.conversationId ?? "";
        if (!convId) return;
        const [a, b] = convId.split("__");
        const peerId = a === inbox ? b : a;
        if (!convMap[peerId]) convMap[peerId] = { unread: 0, lastAt: 0 };
        convMap[peerId].unread += 1;
      });
      recentSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.type !== "direct") return;
        const convId: string = data.conversationId ?? "";
        if (!convId) return;
        const [a, b] = convId.split("__");
        const peerId = a === inbox ? b : a;
        const ts: number = data.createdAt?.toMillis?.() ?? 0;
        if (!convMap[peerId]) convMap[peerId] = { unread: 0, lastAt: 0 };
        if (ts > convMap[peerId].lastAt) convMap[peerId].lastAt = ts;
      });

      // Enrich with peer names so the client doesn't need a separate members lookup
      const peerIds = Object.keys(convMap);
      if (peerIds.length > 0) {
        const peerDocs = await Promise.all(
          peerIds.map((id) => adminDb.collection("members").doc(id).get())
        );
        peerDocs.forEach((snap, i) => {
          const peerId = peerIds[i];
          const d = snap.exists ? snap.data() : null;
          (convMap[peerId] as any).peerName = d?.displayName ?? null;
          (convMap[peerId] as any).peerRole = d?.role ?? null;
        });
      }

      return NextResponse.json(convMap);
    }

    let viewerApprovedAt: number | null = null;
    const effectiveViewerId = viewerId === caller.uid ? viewerId : null;
    if (effectiveViewerId) {
      const viewerSnap = await adminDb.collection("members").doc(effectiveViewerId).get();
      const approvedAt = viewerSnap.data()?.approvedAt;
      viewerApprovedAt = approvedAt?.toMillis?.() ?? null;
    }

    if (cellId) {
      const cached = _cellCache.get(cellId);
      let msgs: any[];
      if (cached && Date.now() - cached.ts < MSG_TTL) {
        msgs = cached.data;
      } else {
        const snap = await adminDb.collection("messages").where("cellId", "==", cellId).get();
        msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
          .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .slice(-100);
        _cellCache.set(cellId, { data: msgs, ts: Date.now() });
      }
      if (viewerApprovedAt) msgs = msgs.filter((m: any) => (m.createdAt ?? 0) >= viewerApprovedAt!);
      return NextResponse.json(msgs);
    }

    if (type === "group") {
      let msgs: any[];
      if (groupCache && Date.now() - groupCache.ts < MSG_TTL) {
        msgs = groupCache.data;
      } else {
        const snap = await adminDb.collection("messages").where("type", "==", "group").get();
        msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
          .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .slice(-100);
        groupCache = { data: msgs, ts: Date.now() };
      }
      if (viewerApprovedAt) msgs = msgs.filter((m: any) => (m.createdAt ?? 0) >= viewerApprovedAt!);
      return NextResponse.json(msgs);
    }

    if (conversationId) {
      const [idA, idB] = conversationId.split("__");
      if (caller.uid !== idA && caller.uid !== idB) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const snap = await adminDb.collection("messages").where("conversationId", "==", conversationId).get();
      const msgs = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
        .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        .slice(-100);
      return NextResponse.json(msgs);
    }

    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  // The super admin cannot send any message (direct, group, or cell).
  if (caller.role === "super_admin") return forbidden();
  const rl = rateLimit(`msg:${caller.uid}`, 40, 60_000);
  if (!rl.ok) return rateLimited(rl.retryAfter);

  try {
    const body = await req.json();
    const { content, type, conversationId, recipientId, cellId } = body;

    if (!content || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const ALLOWED_TYPES = ["group", "direct", "cell"];
    if (!ALLOWED_TYPES.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    if (type === "group" && !GROUP_MESSAGE_ROLES.includes(caller.role)) return forbidden();

    const safeContent = String(content).slice(0, 2000);

    const payload: any = {
      senderId: caller.uid,
      senderName: caller.displayName,
      content: safeContent,
      type,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (type === "direct") {
      payload.conversationId = conversationId;
      payload.recipientId = recipientId;
    }
    if (type === "cell") payload.cellId = cellId;

    const ref = await adminDb.collection("messages").add(payload);
    // Invalidate read caches so the sender sees their own message immediately
    if (type === "group") groupCache = null;
    if (type === "cell" && cellId) _cellCache.delete(cellId);
    const now = new Date();
    const preview = safeContent.length > 60 ? safeContent.slice(0, 60) + "…" : safeContent;

    // Top-level fields (not nested) avoid Firestore composite index requirements
    if (type === "direct" && recipientId) {
      await adminDb.collection("notifications").add({
        userId: recipientId,
        title: `New message from ${caller.displayName}`,
        body: preview, type: "message", read: false, createdAt: now,
        notifConvId: conversationId,
      });
    } else if (type === "group") {
      const membersSnap = await adminDb.collection("members").get();
      const batch = adminDb.batch();
      membersSnap.docs.forEach((d) => {
        // The super admin takes no part in messaging, so it is never notified.
        if (d.id === caller.uid || ["pending", "rejected", "super_admin"].includes(d.data().role)) return;
        const notifRef = adminDb.collection("notifications").doc();
        batch.set(notifRef, {
          userId: d.id, title: `${caller.displayName} sent a group message`,
          body: preview, type: "message", read: false, createdAt: now,
          notifGroup: true,
        });
      });
      await batch.commit();
    } else if (type === "cell" && cellId) {
      const cellSnap = await adminDb.collection("cells").doc(cellId).get();
      if (cellSnap.exists) {
        const memberIds: string[] = cellSnap.data()?.memberIds || [];
        const batch = adminDb.batch();
        memberIds.forEach((uid) => {
          if (uid === caller.uid) return;
          const notifRef = adminDb.collection("notifications").doc();
          batch.set(notifRef, {
            userId: uid, title: `${caller.displayName} in ${cellSnap.data()?.name}`,
            body: preview, type: "message", read: false, createdAt: now,
            notifCellId: cellId,
          });
        });
        await batch.commit();
      }
    }

    return NextResponse.json({ id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  try {
    const { conversationId, cellId, userId, type } = await req.json();

    // Can only mark messages read for yourself
    if (userId && userId !== caller.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let snap;
    if (type === "group") {
      snap = await adminDb.collection("messages").where("type", "==", "group").get();
    } else if (type === "cell" && cellId) {
      snap = await adminDb.collection("messages").where("cellId", "==", cellId).get();
    } else if (conversationId && userId) {
      snap = await adminDb.collection("messages")
        .where("recipientId", "==", userId).where("conversationId", "==", conversationId).get();
    } else {
      return NextResponse.json({ ok: true });
    }

    const batch = adminDb.batch();
    snap.docs.forEach((d) => {
      if (d.data().read === false) batch.update(d.ref, { read: true });
    });
    await batch.commit();

    // Mark related message notifications as read (best-effort — never fails the response)
    try {
      let notifQuery;
      if (type === "group") {
        notifQuery = adminDb.collection("notifications")
          .where("userId", "==", caller.uid).where("notifGroup", "==", true).where("read", "==", false);
      } else if (type === "cell" && cellId) {
        notifQuery = adminDb.collection("notifications")
          .where("userId", "==", caller.uid).where("notifCellId", "==", cellId).where("read", "==", false);
      } else if (conversationId && userId) {
        notifQuery = adminDb.collection("notifications")
          .where("userId", "==", caller.uid).where("notifConvId", "==", conversationId).where("read", "==", false);
      }
      if (notifQuery) {
        const notifSnap = await notifQuery.get();
        if (!notifSnap.empty) {
          const notifBatch = adminDb.batch();
          notifSnap.docs.forEach((d) => notifBatch.update(d.ref, { read: true }));
          await notifBatch.commit();
        }
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
