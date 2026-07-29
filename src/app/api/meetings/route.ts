import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ORGANIZERS = ["super_admin", "president", "general_secretary", "male_organizer", "female_organizer"];

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
          mcId: data.mcId ?? "", mcName: data.mcName ?? "",
          leaderId: data.leaderId ?? "", leaderName: data.leaderName ?? "",
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
    const { title, date, time, agenda, location, includeDistantMembers = true, mcId, leaderId } = body;
    if (!title || !date || !time) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    let excludedMemberIds: string[] = [];
    if (!includeDistantMembers) {
      const distantSnap = await adminDb.collection("members").where("isDistantMember", "==", true).get();
      excludedMemberIds = distantSnap.docs.map((d) => d.id);
    }

    // Resolve the MC and Leader server-side so the stored name always matches the
    // real member record (the client only sends ids). Both are optional.
    const resolveDuty = async (uid?: string) => {
      if (!uid) return { id: "", name: "" };
      const snap = await adminDb.collection("members").doc(uid).get();
      if (!snap.exists) return { id: "", name: "" };
      const d = snap.data() as any;
      // The super admin is not a member and never takes a meeting duty.
      if (["pending", "rejected", "super_admin"].includes(d.role)) return { id: "", name: "" };
      return { id: snap.id, name: d.displayName ?? "" };
    };
    const [mc, leader] = await Promise.all([resolveDuty(mcId), resolveDuty(leaderId)]);

    const ref = await adminDb.collection("meetings").add({
      title, date, time, agenda: agenda || "", location: location || "",
      status: "scheduled", createdBy: caller.uid, createdAt: FieldValue.serverTimestamp(),
      attendees: [], excludedMemberIds,
      mcId: mc.id, mcName: mc.name,
      leaderId: leader.id, leaderName: leader.name,
    });

    // Tell the MC / Leader immediately that they have been assigned. The timed
    // reminders (3 days + 24 hours out) are handled by /api/cron/meeting-reminders.
    const now = new Date();
    const duties: [string, string, string][] = [];
    if (mc.id) duties.push([mc.id, "MC", "Master of Ceremonies"]);
    if (leader.id) duties.push([leader.id, "Leader", "Meeting Leader"]);
    if (duties.length) {
      const batch = adminDb.batch();
      duties.forEach(([uid, , label]) => {
        batch.set(adminDb.collection("notifications").doc(), {
          userId: uid,
          title: `You are the ${label}`,
          body: `You have been assigned as ${label} for "${title}" on ${date} at ${time}.`,
          type: "meeting", read: false, createdAt: now,
        });
      });
      await batch.commit();
    }

    _cache = null;
    return NextResponse.json({ id: ref.id });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
