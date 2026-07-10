import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

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
      // Fetch only unread received + last 200 sent/received to build the inbox summary.
      // This avoids scanning the full messages collection as history grows.
      const [unreadSnap, recentSnap] = await Promise.all([
        adminDb.collection("messages").where("recipientId", "==", inbox).where("type", "==", "direct").where("read", "==", false).get(),
        adminDb.collection("messages").where("recipientId", "==", inbox).where("type", "==", "direct").orderBy("createdAt", "desc").limit(200).get(),
      ]);
      const convMap: Record<string, { unread: number; lastAt: number }> = {};
      // Count unread per peer
      unreadSnap.docs.forEach((d) => {
        const data = d.data();
        const convId: string = data.conversationId ?? "";
        if (!convId) return;
        const [a, b] = convId.split("__");
        const peerId = a === inbox ? b : a;
        if (!convMap[peerId]) convMap[peerId] = { unread: 0, lastAt: 0 };
        convMap[peerId].unread += 1;
      });
      // Track last message time from recent received messages
      recentSnap.docs.forEach((d) => {
        const data = d.data();
        const convId: string = data.conversationId ?? "";
        if (!convId) return;
        const [a, b] = convId.split("__");
        const peerId = a === inbox ? b : a;
        const ts: number = data.createdAt?.toMillis?.() ?? 0;
        if (!convMap[peerId]) convMap[peerId] = { unread: 0, lastAt: 0 };
        if (ts > convMap[peerId].lastAt) convMap[peerId].lastAt = ts;
      });
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
      const snap = await adminDb.collection("messages").where("cellId", "==", cellId)
        .orderBy("createdAt", "desc").limit(100).get();
      let msgs = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
        .reverse();
      if (viewerApprovedAt) msgs = msgs.filter((m: any) => (m.createdAt ?? 0) >= viewerApprovedAt!);
      return NextResponse.json(msgs);
    }

    if (type === "group") {
      const snap = await adminDb.collection("messages").where("type", "==", "group")
        .orderBy("createdAt", "desc").limit(100).get();
      let msgs = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
        .reverse();
      if (viewerApprovedAt) msgs = msgs.filter((m: any) => (m.createdAt ?? 0) >= viewerApprovedAt!);
      return NextResponse.json(msgs);
    }

    if (conversationId) {
      const [idA, idB] = conversationId.split("__");
      if (caller.uid !== idA && caller.uid !== idB) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const snap = await adminDb.collection("messages").where("conversationId", "==", conversationId)
        .orderBy("createdAt", "desc").limit(100).get();
      const msgs = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() ?? null }))
        .reverse();
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

  try {
    const body = await req.json();
    const { content, type, conversationId, recipientId, cellId } = body;

    if (!content || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const ALLOWED_TYPES = ["group", "direct", "cell"];
    if (!ALLOWED_TYPES.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

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
    const now = new Date();
    const preview = safeContent.length > 60 ? safeContent.slice(0, 60) + "…" : safeContent;

    if (type === "direct" && recipientId) {
      await adminDb.collection("notifications").add({
        userId: recipientId,
        title: `New message from ${caller.displayName}`,
        body: preview, type: "message", read: false, createdAt: now,
      });
    } else if (type === "group") {
      const membersSnap = await adminDb.collection("members").get();
      const batch = adminDb.batch();
      membersSnap.docs.forEach((d) => {
        if (d.id === caller.uid || ["pending", "rejected"].includes(d.data().role)) return;
        const notifRef = adminDb.collection("notifications").doc();
        batch.set(notifRef, {
          userId: d.id, title: `${caller.displayName} sent a group message`,
          body: preview, type: "message", read: false, createdAt: now,
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
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
