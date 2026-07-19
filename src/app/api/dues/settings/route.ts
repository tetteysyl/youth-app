import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const DEFAULT_AMOUNT = 5;

// GET /api/dues/settings?year=2025
export async function GET(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();

  const year = parseInt(new URL(req.url).searchParams.get("year") ?? String(new Date().getFullYear()));
  const snap = await adminDb.collection("settings").doc("dues").get();
  const data = snap.exists ? snap.data() : {};
  const yearData = (data as any)?.[String(year)];
  return NextResponse.json({ year, amount: yearData?.amount ?? DEFAULT_AMOUNT, setByName: yearData?.setByName ?? null });
}

// POST /api/dues/settings — treasurer only
// body: { year, amount }
export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!["super_admin", "treasurer"].includes(caller.role)) return forbidden();

  const { year, amount } = await req.json();
  if (!year || !amount || amount <= 0) return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

  await adminDb.collection("settings").doc("dues").set({
    [String(year)]: { amount: parseFloat(amount), setBy: caller.uid, setByName: caller.displayName, setAt: new Date() },
  }, { merge: true });

  return NextResponse.json({ ok: true, year, amount });
}
