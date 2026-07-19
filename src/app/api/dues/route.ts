import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { sendDuesPaidEmail } from "@/lib/email";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DEFAULT_DUES_AMOUNT = 5;

async function getDuesAmount(year: number): Promise<number> {
  try {
    const snap = await adminDb.collection("settings").doc("dues").get();
    const yearData = snap.exists ? (snap.data() as any)?.[String(year)] : null;
    return yearData?.amount ?? DEFAULT_DUES_AMOUNT;
  } catch { return DEFAULT_DUES_AMOUNT; }
}

// GET /api/dues?memberId=xxx  — president, fin_sec, treasurer, or self
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const allowed = ["super_admin", "president", "financial_secretary", "treasurer"].includes(caller.role) || caller.uid === memberId;
  if (!allowed) return forbidden();

  const snap = await adminDb.collection("dues").doc(memberId).get();
  const payments = snap.exists ? (snap.data()?.payments ?? {}) : {};
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
  if (!["super_admin", "financial_secretary", "treasurer"].includes(caller.role)) return forbidden();

  const { memberId, months, year } = await req.json();
  if (!memberId || !Array.isArray(months) || months.length === 0 || !year) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const validMonths: number[] = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (validMonths.length === 0) return NextResponse.json({ error: "Invalid months" }, { status: 400 });

  const duesRef = adminDb.collection("dues").doc(memberId);
  const snap = await duesRef.get();
  const existing: Record<string, any> = snap.exists ? (snap.data()?.payments ?? {}) : {};

  const newMonths = validMonths.filter((m) => {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    return !existing[key]?.paid;
  });

  if (newMonths.length === 0) {
    return NextResponse.json({ error: "All selected months are already recorded" }, { status: 409 });
  }

  const now = new Date();

  // Write dues payments
  if (snap.exists) {
    const updates: Record<string, any> = {};
    for (const m of newMonths) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      updates[`payments.${key}`] = { paid: true, paidAt: FieldValue.serverTimestamp(), markedBy: caller.uid, markedByName: caller.displayName };
    }
    await duesRef.update(updates);
  } else {
    const payments: Record<string, any> = {};
    for (const m of newMonths) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      payments[key] = { paid: true, paidAt: FieldValue.serverTimestamp(), markedBy: caller.uid, markedByName: caller.displayName };
    }
    await duesRef.set({ payments });
  }

  // Get member info + dues amount in parallel
  const [memberSnap, duesAmount] = await Promise.all([
    adminDb.collection("members").doc(memberId).get(),
    getDuesAmount(year),
  ]);
  const memberData = memberSnap.data() as any;
  const memberEmail: string = memberData?.email ?? "";
  const memberName: string = memberData?.displayName ?? "Member";

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

  const totalAmount = duesAmount * newMonths.length;
  const todayStr = now.toISOString().split("T")[0];

  // Record financial transaction + in-app notification in parallel
  await Promise.all([
    // Auto-record to guild financials
    adminDb.collection("transactions").add({
      type: "income",
      amount: totalAmount,
      description: `Dues — ${memberName} (${sorted.length === 12 ? `Annual ${year}` : sorted.map((m) => MONTH_NAMES[m - 1]).join(", ") + ` ${year}`})`,
      date: todayStr,
      category: "Dues",
      recordedBy: caller.displayName,
      memberId,
      memberName,
      createdAt: FieldValue.serverTimestamp(),
    }),
    // In-app notification
    adminDb.collection("notifications").add({
      userId: memberId,
      title: "Dues Payment Recorded",
      body: `Your dues for ${periodStr} have been recorded as paid.`,
      type: "dues",
      read: false,
      createdAt: now,
    }),
  ]);

  // Email (best-effort)
  if (memberEmail) {
    try { await sendDuesPaidEmail(memberEmail, memberName, newMonths, year); }
    catch (e) { console.error("Dues paid email failed:", e); }
  }

  return NextResponse.json({ ok: true, recorded: newMonths.length, amount: totalAmount });
}
