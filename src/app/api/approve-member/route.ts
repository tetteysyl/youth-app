import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (caller.role !== "president") return forbidden();
  try {
    const { email, name } = await req.json();
    await sendWelcomeEmail(email, name);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
