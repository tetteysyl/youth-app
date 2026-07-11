import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const ALLOWED_ROLES = ["president", "financial_secretary", "treasurer"];

// GET /api/dues/summary?year=2025&month=6
// Returns { [memberId]: { paid: boolean, paidAt: number|null } } for the given month — single Firestore read
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ALLOWED_ROLES.includes(caller.role)) return forbidden();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }
  const key = `${year}-${String(month).padStart(2, "0")}`;

  const snap = await adminDb.collection("dues").get();
  const summary: Record<string, { paid: boolean; paidAt: number | null }> = {};
  snap.docs.forEach((d) => {
    const payment = d.data().payments?.[key];
    summary[d.id] = {
      paid: payment?.paid ?? false,
      paidAt: payment?.paidAt?.toMillis?.() ?? null,
    };
  });

  return NextResponse.json(summary, { headers: { "Cache-Control": "private, max-age=30" } });
}
