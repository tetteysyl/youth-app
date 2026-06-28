import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendBroadcastEmail } from "@/lib/email";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { title, date, time } = await req.json();
    const formattedDate = date ? format(new Date(date), "MMMM d, yyyy") : date;

    const snap = await adminDb.collection("members").where("role", "!=", "pending").get();
    const members = snap.docs.filter((d) => d.data().role !== "rejected");
    const recipients = members
      .map((d) => ({ email: d.data().email, name: d.data().displayName }))
      .filter((r) => r.email);

    // Send emails
    let emailError = null;
    try {
      await sendBroadcastEmail(
        recipients,
        `Meeting Scheduled: ${title}`,
        `Dear Member,\n\nA meeting has been scheduled:\n\n📅 ${title}\n🗓 Date: ${formattedDate}\n🕐 Time: ${time}\n\nPlease make every effort to attend.\n\nYours in Service,\nYPG Secretariat`,
        "YPG Secretariat"
      );
    } catch (e: any) {
      emailError = e.message;
    }

    // Write in-app notifications for each member
    const now = new Date();
    await Promise.all(
      snap.docs
        .filter((d) => d.data().role !== "rejected")
        .map((d) =>
          adminDb.collection("notifications").add({
            userId: d.id,
            title: `Meeting Scheduled: ${title}`,
            body: `${formattedDate} at ${time}`,
            type: "meeting",
            read: false,
            createdAt: now,
          })
        )
    );

    return NextResponse.json({ sent: recipients.length, emailError });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
