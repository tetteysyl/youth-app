import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ORGANIZERS = ["president", "general_secretary", "male_organizer", "female_organizer"];

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    const meetingId = new URL(req.url).searchParams.get("meetingId");
    if (!meetingId) return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    const snap = await adminDb.collection("meetings").doc(meetingId).get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = snap.data() as any;
    return NextResponse.json({
      id: snap.id, title: data.title ?? "", date: data.date ?? "",
      time: data.time ?? "", location: data.location ?? "", agenda: data.agenda ?? "",
      status: data.status ?? "scheduled", attendees: data.attendees ?? [],
      selfCheckIns: data.selfCheckIns ?? [], excludedMemberIds: data.excludedMemberIds ?? "",
      createdBy: data.createdBy ?? "",
    });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ORGANIZERS.includes(caller.role)) return forbidden();
  try {
    const { meetingId, presentIds, action } = await req.json();
    if (!meetingId || !presentIds) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const snap = await adminDb.collection("meetings").doc(meetingId).get();
    if (!snap.exists) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];
    const cleanPresentIds = presentIds.filter((id: string) => !excludedMemberIds.includes(id));
    const update: any = { attendees: cleanPresentIds };
    if (action === "end") { update.status = "ended"; update.endedAt = new Date().toISOString(); update.selfCheckIns = []; }
    else update.status = "ongoing";
    await adminDb.collection("meetings").doc(meetingId).update(update);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  try {
    const { meetingId, userId, action } = await req.json();
    if (!meetingId || !userId || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Self check-in: can only mark yourself
    if (action === "selfCheckin" && userId !== caller.uid) return forbidden();
    // Approve/reject: organizers only
    if ((action === "approve" || action === "reject") && !ORGANIZERS.includes(caller.role)) return forbidden();

    const ref = adminDb.collection("meetings").doc(meetingId);

    if (action === "selfCheckin") {
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];
      if (excludedMemberIds.includes(userId)) {
        return NextResponse.json({ error: "You are not included in this meeting." }, { status: 403 });
      }
      await ref.update({ selfCheckIns: FieldValue.arrayUnion(userId) });
      return NextResponse.json({ ok: true });
    }
    if (action === "approve") {
      const snap = await ref.get();
      const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];
      if (excludedMemberIds.includes(userId)) {
        return NextResponse.json({ error: "This member is excluded from this meeting." }, { status: 403 });
      }
      await ref.update({ selfCheckIns: FieldValue.arrayRemove(userId), attendees: FieldValue.arrayUnion(userId) });
      return NextResponse.json({ ok: true });
    }
    if (action === "reject") {
      await ref.update({ selfCheckIns: FieldValue.arrayRemove(userId) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
