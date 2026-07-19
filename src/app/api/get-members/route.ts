import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole } from "@/lib/auth-server";

// Fields only executives/president/fin roles can see
const SENSITIVE_FIELDS = ["dateOfBirth", "gender", "isDistantMember", "cellChoice", "removalWarningSent", "approvedAt"];
const EXEC_ROLES = ["super_admin", "president", "vice_president", "general_secretary", "assistant_general_secretary", "financial_secretary", "treasurer", "male_organizer", "female_organizer", "evangelism_coordinator"];
// Date of birth is more restricted than the other exec-only fields: only these
// roles may ever see another member's DOB (mirrors can.viewDateOfBirth).
const DOB_ROLES = ["super_admin", "president", "vice_president", "general_secretary"];

let _membersCache: { data: any[]; ts: number } | null = null;
const MEMBERS_TTL = 60_000;

export function invalidateMembersCache() { _membersCache = null; }

function stripSensitiveFields(member: any) {
  const stripped = { ...member };
  for (const f of SENSITIVE_FIELDS) delete stripped[f];
  return stripped;
}

// Remove dateOfBirth for callers who aren't allowed to see it (applied even to
// execs, since DOB is limited to a narrower set than the other exec fields).
function stripDob(member: any) {
  const { dateOfBirth, ...rest } = member;
  return rest;
}

export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isExec = EXEC_ROLES.includes(caller.role);
  const canSeeDob = DOB_ROLES.includes(caller.role);

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
      // Own doc: always full. Otherwise strip exec-only fields for non-execs, and
      // strip DOB for anyone who isn't allowed to see other members' birthdates.
      if (uid === caller.uid) {
        return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
      }
      const base = isExec ? result : stripSensitiveFields(result);
      return NextResponse.json(
        canSeeDob ? base : stripDob(base),
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }

    const shape = (list: any[]) => {
      const byRole = isExec ? list : list.map(stripSensitiveFields);
      return canSeeDob ? byRole : byRole.map(stripDob);
    };

    if (_membersCache && Date.now() - _membersCache.ts < MEMBERS_TTL) {
      return NextResponse.json(shape(_membersCache.data), {
        headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=50" },
      });
    }
    const snap = await adminDb.collection("members").get();
    const members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => m.role !== "pending" && m.role !== "rejected" && m.role !== "super_admin");
    _membersCache = { data: members, ts: Date.now() };
    return NextResponse.json(shape(members), {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=50" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
