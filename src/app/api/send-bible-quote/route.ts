import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const EVANGELISM_ROLES = ["super_admin", "president", "evangelism_coordinator"];

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!EVANGELISM_ROLES.includes(caller.role)) return forbidden();
  try {
    const { quote, reference, recipientIds } = await req.json();
    if (!quote || !Array.isArray(recipientIds) || recipientIds.length === 0) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (recipientIds.length > 500) return NextResponse.json({ error: "Too many recipients" }, { status: 400 });
    const safeQuote = String(quote).slice(0, 2000);
    const safeReference = reference ? String(reference).slice(0, 200) : null;
    const recipients: { email: string; name: string }[] = [];
    await Promise.all(
      (recipientIds as string[]).map(async (uid) => {
        const snap = await adminDb.collection("members").doc(uid).get();
        if (snap.exists && snap.data()?.email) recipients.push({ email: snap.data()!.email, name: snap.data()!.displayName });
      })
    );
    const subject = safeReference ? `Devotional: ${safeReference}` : "Daily Devotional from YPG";
    const message = safeReference ? `"${safeQuote}"\n\n— ${safeReference}\n\nShared by ${caller.displayName}` : `${safeQuote}\n\nShared by ${caller.displayName}`;
    let emailError = null;
    try { await sendBroadcastEmail(recipients, subject, message, caller.displayName); } catch (e: any) { emailError = e.message; }
    const now = new Date();
    await Promise.all(
      (recipientIds as string[]).map((uid) =>
        adminDb.collection("notifications").add({
          userId: uid, title: safeReference ? `📖 ${safeReference}` : "Daily Devotional",
          body: safeQuote.length > 100 ? safeQuote.slice(0, 100) + "…" : safeQuote,
          type: "evangelism", read: false, createdAt: now,
        })
      )
    );
    return NextResponse.json({ sent: recipients.length, emailError });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}
