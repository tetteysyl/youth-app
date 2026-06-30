import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

let _cache: { data: any; ts: number } | null = null;
const TTL = 20_000;

// GET /api/meetings — list all meetings: active (non-ended) first (newest scheduled on top),
// then ended meetings below (also newest first).
export async function GET() {
  try {
    if (_cache && Date.now() - _cache.ts < TTL) {
      return NextResponse.json(_cache.data, {
        headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=40" },
      });
    }

    const snap = await adminDb.collection("meetings").get();
    const meetings = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? "",
          date: data.date ?? "",
          time: data.time ?? "",
          location: data.location ?? "",
          agenda: data.agenda ?? "",
          status: data.status ?? "scheduled",
          attendees: data.attendees ?? [],
          selfCheckIns: data.selfCheckIns ?? [],
          excludedMemberIds: data.excludedMemberIds ?? [],
          createdBy: data.createdBy ?? "",
          createdAt: data.createdAt?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => {
        const aEnded = a.status === "ended" ? 1 : 0;
        const bEnded = b.status === "ended" ? 1 : 0;
        if (aEnded !== bEnded) return aEnded - bEnded; // active (0) before ended (1)
        return b.createdAt - a.createdAt; // newest scheduled first within each group
      });

    _cache = { data: meetings, ts: Date.now() };
    return NextResponse.json(meetings, {
      headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=40" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/meetings — create a new meeting (bust cache)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, date, time, agenda, location, createdBy, includeDistantMembers = true } = body;
    if (!title || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Snapshot which distant members are excluded from this specific meeting
    let excludedMemberIds: string[] = [];
    if (!includeDistantMembers) {
      const distantSnap = await adminDb.collection("members").where("isDistantMember", "==", true).get();
      excludedMemberIds = distantSnap.docs.map((d) => d.id);
    }

    const ref = await adminDb.collection("meetings").add({
      title, date, time,
      agenda: agenda || "",
      location: location || "",
      status: "scheduled",
      createdBy: createdBy || "",
      createdAt: FieldValue.serverTimestamp(),
      attendees: [],
      excludedMemberIds,
    });
    _cache = null; // bust cache
    return NextResponse.json({ id: ref.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
