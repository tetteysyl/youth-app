import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const uid = new URL(req.url).searchParams.get("uid");

    if (uid) {
      // Only allow fetching your own profile (or if you're the same user)
      if (uid !== authed.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const snap = await adminDb.collection("members").get();
    const members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => m.role !== "pending" && m.role !== "rejected");
    return NextResponse.json(members, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
