import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const user = await requireAuthWithRole(req);
  if (!user) return unauth();
  if (!can.publishFinancialStatement(user.role as any)) return forbidden();

  try {
    const body = await req.json();
    const { title, period, summary, totalIncome, totalExpense, notes } = body;
    if (!title || !period || !summary || !totalIncome || !totalExpense) {
      return NextResponse.json({ error: "All required fields must be filled" }, { status: 400 });
    }
    const ref = await adminDb.collection("financial_statements").add({
      title,
      period,
      summary,
      totalIncome: parseFloat(totalIncome),
      totalExpense: parseFloat(totalExpense),
      notes: notes ?? "",
      publishedBy: user.displayName,
      publishedRole: user.role,
      publishedAt: new Date(),
    });
    return NextResponse.json({ id: ref.id });
  } catch {
    return NextResponse.json({ error: "Failed to publish statement" }, { status: 500 });
  }
}
