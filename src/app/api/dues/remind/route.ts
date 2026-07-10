import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { sendDuesReminderEmail } from "@/lib/email";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// POST /api/dues/remind — financial_secretary only
// Sends email reminder to members who haven't paid dues for current month
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (caller.role !== "financial_secretary") return forbidden();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const monthName = MONTH_NAMES[month - 1];

  // Get all active members
  const membersSnap = await adminDb.collection("members")
    .where("role", "!=", "pending").get();
  const activeMembers = membersSnap.docs
    .filter((d) => !["pending", "rejected"].includes(d.data().role))
    .map((d) => ({ id: d.id, email: d.data().email as string, name: d.data().displayName as string }));

  // Get dues for current month — check who already paid
  const duesSnap = await adminDb.collection("dues").get();
  const paidIds = new Set<string>();
  duesSnap.docs.forEach((d) => {
    if (d.data().payments?.[key]?.paid) paidIds.add(d.id);
  });

  const unpaid = activeMembers.filter((m) => !paidIds.has(m.id) && m.email);

  if (unpaid.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "All members have paid for this month" });
  }

  // Send email (best-effort)
  try {
    await sendDuesReminderEmail(unpaid, caller.displayName, monthName, year);
  } catch (e) { console.error("Dues reminder email failed:", e); }

  // In-app notifications to unpaid members
  const batch = adminDb.batch();
  const nowDate = new Date();
  unpaid.forEach((m) => {
    const ref = adminDb.collection("notifications").doc();
    batch.set(ref, {
      userId: m.id,
      title: "Dues Reminder",
      body: `Your dues for ${monthName} ${year} have not been recorded yet. Please pay at your earliest convenience.`,
      type: "dues",
      read: false,
      createdAt: nowDate,
    });
  });
  await batch.commit();

  return NextResponse.json({ ok: true, sent: unpaid.length });
}
