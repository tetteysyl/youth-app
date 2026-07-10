import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { sendDuesPaidEmail } from "@/lib/email";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// GET /api/dues?memberId=xxx  — president, fin_sec, treasurer, or self
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const allowed = ["president", "financial_secretary", "treasurer"].includes(caller.role) || caller.uid === memberId;
  if (!allowed) return forbidden();

  const snap = await adminDb.collection("dues").doc(memberId).get();
  const payments = snap.exists ? (snap.data()?.payments ?? {}) : {};
  // Serialize Timestamps
  const serialized: Record<string, any> = {};
  for (const [key, val] of Object.entries(payments as Record<string, any>)) {
    serialized[key] = { ...val, paidAt: val.paidAt?.toMillis?.() ?? val.paidAt ?? null };
  }
  return NextResponse.json(serialized);
}

// POST /api/dues — fin_sec or treasurer marks dues paid
// body: { memberId, months: number[], year: number }
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!["financial_secretary", "treasurer"].includes(caller.role)) return forbidden();

  const { memberId, months, year } = await req.json();
  if (!memberId || !Array.isArray(months) || months.length === 0 || !year) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Validate months are 1-12
  const validMonths: number[] = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (validMonths.length === 0) return NextResponse.json({ error: "Invalid months" }, { status: 400 });

  const duesRef = adminDb.collection("dues").doc(memberId);
  const snap = await duesRef.get();
  const existing: Record<string, any> = snap.exists ? (snap.data()?.payments ?? {}) : {};

  // Only process months not already paid
  const newMonths = validMonths.filter((m) => {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    return !existing[key]?.paid;
  });

  if (newMonths.length === 0) {
    return NextResponse.json({ error: "All selected months are already recorded" }, { status: 409 });
  }

  const updates: Record<string, any> = {};
  const now = new Date();
  for (const m of newMonths) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    updates[`payments.${key}`] = {
      paid: true,
      paidAt: FieldValue.serverTimestamp(),
      markedBy: caller.uid,
      markedByName: caller.displayName,
    };
  }

  if (snap.exists) {
    await duesRef.update(updates);
  } else {
    // Build initial doc from flat update keys
    const payments: Record<string, any> = {};
    for (const m of newMonths) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      payments[key] = { paid: true, paidAt: FieldValue.serverTimestamp(), markedBy: caller.uid, markedByName: caller.displayName };
    }
    await duesRef.set({ payments });
  }

  // Fetch member info for notification + email
  const memberSnap = await adminDb.collection("members").doc(memberId).get();
  const memberData = memberSnap.data() as any;
  const memberEmail: string = memberData?.email ?? "";
  const memberName: string = memberData?.displayName ?? "Member";

  // Build notification body
  const sorted = [...newMonths].sort((a, b) => a - b);
  let periodStr: string;
  if (sorted.length === 12) {
    periodStr = `the full year of ${year}`;
  } else if (sorted.length === 1) {
    periodStr = `${MONTH_NAMES[sorted[0] - 1]} ${year}`;
  } else {
    const names = sorted.map((m) => MONTH_NAMES[m - 1]);
    const last = names.pop();
    periodStr = `${names.join(", ")} and ${last} ${year}`;
  }

  // In-app notification
  await adminDb.collection("notifications").add({
    userId: memberId,
    title: "Dues Payment Recorded",
    body: `Your dues for ${periodStr} have been recorded as paid.`,
    type: "dues",
    read: false,
    createdAt: now,
  });

  // Email (best-effort)
  if (memberEmail) {
    try {
      await sendDuesPaidEmail(memberEmail, memberName, newMonths, year);
    } catch (e) { console.error("Dues paid email failed:", e); }
  }

  return NextResponse.json({ ok: true, recorded: newMonths.length });
}
