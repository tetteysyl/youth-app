import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// GET /api/messages?conversationId=xxx  OR  ?type=group
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const type = searchParams.get("type");

    let snap;
    if (type === "group") {
      snap = await adminDb.collection("messages").where("type", "==", "group").get();
    } else if (conversationId) {
      snap = await adminDb.collection("messages").where("conversationId", "==", conversationId).get();
    } else {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const msgs = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() ?? null,
        };
      })
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return NextResponse.json(msgs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/messages  — send a message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { senderId, senderName, content, type, conversationId, recipientId } = body;

    if (!senderId || !content || !type) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const payload: any = {
      senderId,
      senderName,
      content,
      type,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (type === "direct") {
      payload.conversationId = conversationId;
      payload.recipientId = recipientId;
    }

    const ref = await adminDb.collection("messages").add(payload);
    return NextResponse.json({ id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
