import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { title, date, time } = await req.json();
    const formattedDate = date ? format(new Date(date), "MMMM d, yyyy") : date;

    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    const recipients = snap.docs.map((d) => ({
      email: d.data().email,
      name: d.data().displayName,
    })).filter((r) => r.email);

    await sendBroadcastEmail(
      recipients,
      `Meeting Scheduled: ${title}`,
      `Dear Member,\n\nA meeting has been scheduled:\n\n📅 ${title}\n🗓 Date: ${formattedDate}\n🕐 Time: ${time}\n\nPlease make every effort to attend.\n\nYours in Service,\nYPG Secretariat`,
      "YPG Secretariat"
    );

    return NextResponse.json({ sent: recipients.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
