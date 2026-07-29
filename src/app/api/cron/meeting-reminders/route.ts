import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendMeetingRoleEmail, sendMeetingReminderEmail } from "@/lib/email";
import { format } from "date-fns";

/**
 * GET /api/cron/meeting-reminders — runs daily via Vercel Cron.
 *
 * Reminds EVERYONE about an upcoming meeting on the same cadence:
 *   • 3 days before the meeting
 *   • 1 day (24 hours) before the meeting
 *
 * The MC and the Meeting Leader get a duty-specific reminder naming their role;
 * every other eligible member gets the general meeting reminder. Both are an
 * in-app notification AND an email. Members the organiser excluded from the
 * meeting (distant members) are skipped, as is the super admin.
 *
 * Meetings carry `remind3DaySent` / `remind1DaySent` flags so a reminder is
 * never sent twice, even if the cron runs more than once in a day.
 *
 * Ghana is GMT year-round (no DST), so the server's UTC date matches local date.
 */

/** YYYY-MM-DD for today + `offset` days. */
function dateKey(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const windows: { offset: number; flag: "remind3DaySent" | "remind1DaySent"; label: string }[] = [
      { offset: 3, flag: "remind3DaySent", label: "in 3 days" },
      { offset: 1, flag: "remind1DaySent", label: "tomorrow" },
    ];

    let notified = 0;
    let emailed = 0;
    let meetingsProcessed = 0;

    for (const w of windows) {
      const target = dateKey(w.offset);
      const snap = await adminDb.collection("meetings").where("date", "==", target).get();

      for (const doc of snap.docs) {
        const m = doc.data() as any;
        if (m.status === "ended") continue;
        if (m[w.flag]) continue; // already reminded for this window

        const duties: { uid: string; duty: "MC" | "Leader"; label: string }[] = [];
        if (m.mcId) duties.push({ uid: m.mcId, duty: "MC", label: "Master of Ceremonies (MC)" });
        if (m.leaderId) duties.push({ uid: m.leaderId, duty: "Leader", label: "Meeting Leader" });

        const prettyDate = m.date ? format(new Date(m.date), "EEEE, MMMM d, yyyy") : m.date;
        const meetingInfo = {
          title: m.title ?? "", date: prettyDate, time: m.time ?? "",
          location: m.location, agenda: m.agenda,
        };

        for (const d of duties) {
          const memberSnap = await adminDb.collection("members").doc(d.uid).get();
          if (!memberSnap.exists) continue;
          const member = memberSnap.data() as any;

          // In-app notification
          await adminDb.collection("notifications").add({
            userId: d.uid,
            title: `Reminder: you are ${d.duty} ${w.label}`,
            body: `You are the ${d.label} for "${m.title}" on ${prettyDate} at ${m.time}.`,
            type: "meeting",
            read: false,
            createdAt: now,
          });
          notified++;

          // Email (best-effort — a failed send must not block the rest)
          if (member.email) {
            try {
              await sendMeetingRoleEmail(
                member.email,
                member.displayName ?? "Member",
                d.duty,
                meetingInfo,
                w.label
              );
              emailed++;
            } catch (e) {
              console.error(`Meeting role email failed for ${member.email}:`, e);
            }
          }
        }

        // ── General membership ──────────────────────────────────────────────
        // Members are reminded ONLY 24 hours before. The 3-day reminder is for
        // the MC and Leader alone, since they need lead time to prepare.
        // The MC/Leader are skipped in this blast — their duty reminder above
        // already carries every meeting detail.
        const remindMembers = w.offset === 1;
        const excluded: string[] = m.excludedMemberIds ?? [];
        const dutyIds = new Set(duties.map((d) => d.uid));
        // Skip the members read entirely on the 3-day pass.
        const audience = remindMembers
          ? (await adminDb.collection("members").get()).docs.filter((d) => {
              const x = d.data() as any;
              if (["pending", "rejected", "super_admin"].includes(x.role)) return false;
              if (excluded.includes(d.id)) return false;
              if (dutyIds.has(d.id)) return false;
              return true;
            })
          : [];

        if (audience.length > 0) {
          const batch = adminDb.batch();
          audience.forEach((d) => {
            batch.set(adminDb.collection("notifications").doc(), {
              userId: d.id,
              title: `Reminder: ${m.title} — ${w.label}`,
              body: `The meeting is ${w.label} on ${prettyDate} at ${m.time}.`,
              type: "meeting", read: false, createdAt: now,
            });
          });
          await batch.commit();
          notified += audience.length;

          // One BCC send for the whole membership rather than N individual emails.
          const recipients = audience
            .map((d) => ({ email: (d.data() as any).email, name: (d.data() as any).displayName ?? "Member" }))
            .filter((r) => r.email);
          if (recipients.length) {
            try {
              await sendMeetingReminderEmail(recipients, meetingInfo, w.label, {
                mcName: m.mcName || undefined,
                leaderName: m.leaderName || undefined,
              });
              emailed += recipients.length;
            } catch (e) {
              console.error("Meeting reminder bulk email failed:", e);
            }
          }
        }

        await doc.ref.update({ [w.flag]: true });
        meetingsProcessed++;
      }
    }

    return NextResponse.json({ ok: true, meetingsProcessed, notified, emailed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
