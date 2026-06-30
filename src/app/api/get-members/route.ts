import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = new URL(req.url).searchParams.get("uid");

    // Single member lookup (used by AuthProvider on boot)
    if (uid) {
      const snap = await adminDb.collection("members").doc(uid).get();
      if (!snap.exists) return NextResponse.json(null);
      const data = snap.data() as any;
      return NextResponse.json(
        {
          uid: snap.id, ...data,
          createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? "",
          yafStartedAt: data.yafStartedAt?.toMillis?.() ?? data.yafStartedAt ?? null,
        },
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }

    // All members list
    const snap = await adminDb.collection("members").get();
    const members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => m.role !== "pending" && m.role !== "rejected");
    return NextResponse.json(members, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
