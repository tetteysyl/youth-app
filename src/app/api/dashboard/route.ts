import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Server-side in-memory cache — survives across requests on the same Vercel instance
let _cache: { data: any; ts: number } | null = null;
const TTL = 30_000;

export async function GET() {
  try {
    if (_cache && Date.now() - _cache.ts < TTL) {
      return NextResponse.json(_cache.data, {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const [membersSnap, meetingsSnap, eventsSnap, upcomingSnap] = await Promise.all([
      adminDb.collection("members").where("role", "!=", "pending").get(),
      adminDb.collection("meetings").get(),
      adminDb.collection("events").get(),
      adminDb.collection("events").where("date", ">=", today).orderBy("date", "asc").limit(3).get(),
    ]);

    const upcoming = upcomingSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, title: data.title ?? "", description: data.description ?? "", date: data.date ?? "", time: data.time ?? "" };
    });

    const result = { stats: { members: membersSnap.size, meetings: meetingsSnap.size, events: eventsSnap.size }, upcoming };
    _cache = { data: result, ts: Date.now() };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
