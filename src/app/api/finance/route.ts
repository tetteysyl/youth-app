import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";
import { can } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await requireAuthWithRole(req);
  if (!user) return unauth();
  if (!can.viewFinance(user.role as any)) return forbidden();

  try {
    const [txSnap, stmtSnap] = await Promise.all([
      adminDb.collection("transactions").orderBy("date", "desc").get(),
      adminDb.collection("financial_statements").orderBy("publishedAt", "desc").get(),
    ]);

    const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const statements = stmtSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        publishedAt: data.publishedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ transactions, statements });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to load finance data", detail: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAuthWithRole(req);
  if (!user) return unauth();
  if (!can.editFinance(user.role as any)) return forbidden();

  try {
    const body = await req.json();
    const { type, amount, description, date, category } = body;
    if (!amount || !description || !date) {
      return NextResponse.json({ error: "amount, description, and date are required" }, { status: 400 });
    }
    const ref = await adminDb.collection("transactions").add({
      type: type ?? "income",
      amount: parseFloat(amount),
      description,
      date,
      category: category ?? "",
      recordedBy: user.displayName,
      createdAt: new Date(),
    });
    return NextResponse.json({ id: ref.id });
  } catch {
    return NextResponse.json({ error: "Failed to save transaction" }, { status: 500 });
  }
}

// Edit a transaction — finance roles (and super admin) only.
export async function PATCH(req: NextRequest) {
  const user = await requireAuthWithRole(req);
  if (!user) return unauth();
  if (!can.editFinance(user.role as any)) return forbidden();
  try {
    const { id, type, amount, description, date, category } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    const patch: any = {};
    if (type !== undefined) patch.type = type;
    if (amount !== undefined) patch.amount = parseFloat(amount);
    if (description !== undefined) patch.description = description;
    if (date !== undefined) patch.date = date;
    if (category !== undefined) patch.category = category;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    patch.updatedBy = user.displayName;
    patch.updatedAt = new Date();
    await adminDb.collection("transactions").doc(id).update(patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

// Delete a transaction — finance roles (and super admin) only.
export async function DELETE(req: NextRequest) {
  const user = await requireAuthWithRole(req);
  if (!user) return unauth();
  if (!can.editFinance(user.role as any)) return forbidden();
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    await adminDb.collection("transactions").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
