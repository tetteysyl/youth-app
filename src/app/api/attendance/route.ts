import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// GET /api/attendance?meetingId=xxx
export async function GET(req: NextRequest) {
  try {
    const meetingId = new URL(req.url).searchParams.get("meetingId");
    if (!meetingId) return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });

    const snap = await adminDb.collection("meetings").doc(meetingId).get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = snap.data() as any;
    return NextResponse.json({
      id: snap.id,
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/attendance — save or end meeting attendance (leaders only)
export async function POST(req: NextRequest) {
  try {
    const { meetingId, presentIds, action } = await req.json();
    if (!meetingId || !presentIds) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const snap = await adminDb.collection("meetings").doc(meetingId).get();
    if (!snap.exists) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];

    // Defensive: never let an excluded member end up marked present
    const cleanPresentIds = presentIds.filter((id: string) => !excludedMemberIds.includes(id));

    const update: any = { attendees: cleanPresentIds };
    if (action === "end") {
      update.status = "ended";
      update.endedAt = new Date().toISOString();
      update.selfCheckIns = []; // clear pending check-ins on end
    } else {
      update.status = "ongoing";
    }

    await adminDb.collection("meetings").doc(meetingId).update(update);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/attendance — member self-check-in OR leader approve/reject
export async function PATCH(req: NextRequest) {
  try {
    const { meetingId, userId, action } = await req.json();
    if (!meetingId || !userId || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const ref = adminDb.collection("meetings").doc(meetingId);

    if (action === "selfCheckin") {
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];
      if (excludedMemberIds.includes(userId)) {
        return NextResponse.json(
          { error: "You are not included in this meeting and cannot mark yourself present." },
          { status: 403 }
        );
      }
      // Member indicates they are present — adds to pending selfCheckIns
      await ref.update({
        selfCheckIns: FieldValue.arrayUnion(userId),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      const snap = await ref.get();
      const excludedMemberIds: string[] = snap.data()?.excludedMemberIds ?? [];
      if (excludedMemberIds.includes(userId)) {
        return NextResponse.json(
          { error: "This member is not included in this meeting." },
          { status: 403 }
        );
      }
      // Leader approves: move from selfCheckIns → attendees
      await ref.update({
        selfCheckIns: FieldValue.arrayRemove(userId),
        attendees: FieldValue.arrayUnion(userId),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      // Leader rejects self-check-in
      await ref.update({
        selfCheckIns: FieldValue.arrayRemove(userId),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
