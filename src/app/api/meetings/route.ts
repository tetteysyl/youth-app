import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ORGANIZERS = ["president", "general_secretary", "male_organizer", "female_organizer"];

let _cache: { data: any; ts: number } | null = null;
const TTL = 20_000;

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    if (_cache && Date.now() - _cache.ts < TTL) {
      return NextResponse.json(_cache.data, { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=40" } });
    }
    const snap = await adminDb.collection("meetings").get();
    const meetings = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id, title: data.title ?? "", date: data.date ?? "",
          time: data.time ?? "", location: data.location ?? "", agenda: data.agenda ?? "",
          status: data.status ?? "scheduled", attendees: data.attendees ?? [],
          selfCheckIns: data.selfCheckIns ?? [], excludedMemberIds: data.excludedMemberIds ?? [],
          createdBy: data.createdBy ?? "", createdAt: data.createdAt?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => {
        const aEnded = a.status === "ended" ? 1 : 0;
        const bEnded = b.status === "ended" ? 1 : 0;
        if (aEnded !== bEnded) return aEnded - bEnded;
        return b.createdAt - a.createdAt;
      });
    _cache = { data: meetings, ts: Date.now() };
    return NextResponse.json(meetings, { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=40" } });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  try {
    const body = await req.json();
    const { title, date, time, agenda, location, includeDistantMembers = true } = body;
    if (!title || !date || !time) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    let excludedMemberIds: string[] = [];
    if (!includeDistantMembers) {
      const distantSnap = await adminDb.collection("members").where("isDistantMember", "==", true).get();
      excludedMemberIds = distantSnap.docs.map((d) => d.id);
    }
    const ref = await adminDb.collection("meetings").add({
      title, date, time, agenda: agenda || "", location: location || "",
      status: "scheduled", createdBy: caller.uid, createdAt: FieldValue.serverTimestamp(),
      attendees: [], excludedMemberIds,
    });
    _cache = null;
    return NextResponse.json({ id: ref.id });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
