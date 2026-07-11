import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole } from "@/lib/auth-server";

// Fields only executives/president/fin roles can see
const SENSITIVE_FIELDS = ["dateOfBirth", "gender", "isDistantMember", "cellChoice", "removalWarningSent", "approvedAt"];
const EXEC_ROLES = ["president", "vice_president", "general_secretary", "assistant_general_secretary", "financial_secretary", "treasurer", "male_organizer", "female_organizer", "evangelism_coordinator"];

let _membersCache: { data: any[]; ts: number } | null = null;
const MEMBERS_TTL = 60_000;

export function invalidateMembersCache() { _membersCache = null; }

function stripSensitiveFields(member: any) {
  const stripped = { ...member };
  for (const f of SENSITIVE_FIELDS) delete stripped[f];
  return stripped;
}

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isExec = EXEC_ROLES.includes(caller.role);

  try {
    const uid = new URL(req.url).searchParams.get("uid");

    if (uid) {
      if (uid !== caller.uid && !isExec) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const snap = await adminDb.collection("members").doc(uid).get();
      if (!snap.exists) return NextResponse.json(null);
      const data = snap.data() as any;
      const result = {
        uid: snap.id, ...data,
        createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? "",
        yafStartedAt: data.yafStartedAt?.toMillis?.() ?? data.yafStartedAt ?? null,
      };
      return NextResponse.json(
        uid === caller.uid || isExec ? result : stripSensitiveFields(result),
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }

    if (_membersCache && Date.now() - _membersCache.ts < MEMBERS_TTL) {
      const cached = _membersCache.data;
      return NextResponse.json(
        isExec ? cached : cached.map(stripSensitiveFields),
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=50" } }
      );
    }
    const snap = await adminDb.collection("members").get();
    const members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => m.role !== "pending" && m.role !== "rejected");
    _membersCache = { data: members, ts: Date.now() };
    return NextResponse.json(
      isExec ? members : members.map(stripSensitiveFields),
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=50" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
