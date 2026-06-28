import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const snap = await adminDb.collection("members").get();
    const members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => m.role !== "pending" && m.role !== "rejected");
    return NextResponse.json(members);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
