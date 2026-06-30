import { NextRequest, NextResponse } from "next/server";
import { adminDb, getAdminApp } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { sendBirthdayEmail, sendYafTransitionEmail, sendYafRemovalWarningEmail } from "@/lib/email";
import { format } from "date-fns";

const YAF_GRACE_PERIOD_MS = 60 * 24 * 60 * 60 * 1000; // 2 months (60 days)
const WARNING_THRESHOLD_MS = 57 * 24 * 60 * 60 * 1000; // warn 3 days before removal

function calcAge(dob: string, today: Date): number {
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// GET /api/cron/birthdays — runs daily via Vercel Cron.
// 1. Wishes members happy birthday on their birthday.
// 2. The day a member turns 30, flags them as YAF, starts a 2-month countdown,
//    and sends a one-time congratulatory email + notification.
// 3. Removes any member whose 2-month YAF grace period has elapsed.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const now = new Date();

    const snap = await adminDb.collection("members")
      .where("role", "not-in", ["pending", "rejected"])
      .get();

    let birthdaysSent = 0;
    let yafTransitions = 0;
    let removalWarningsSent = 0;
    let removed = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const dob: string | undefined = data.dateOfBirth;
      if (!dob) continue;

      const birth = new Date(dob);
      if (isNaN(birth.getTime())) continue;

      // ── YAF grace period tracking ──
      if (data.isYaf && data.yafStartedAt) {
        const startedAt = data.yafStartedAt?.toMillis ? data.yafStartedAt.toMillis() : new Date(data.yafStartedAt).getTime();
        const elapsed = now.getTime() - startedAt;

        // Auto-removal: 2 months past becoming YAF
        if (elapsed >= YAF_GRACE_PERIOD_MS) {
          try {
            await getAuth(getAdminApp()).deleteUser(doc.id);
          } catch (e) {
            console.error(`Failed to delete auth user ${doc.id}:`, e);
          }
          await doc.ref.delete();
          removed++;
          continue; // skip further processing for this now-deleted member
        }

        // 3-day pre-removal warning (sent once)
        if (elapsed >= WARNING_THRESHOLD_MS && !data.removalWarningSent) {
          const removalDate = format(new Date(startedAt + YAF_GRACE_PERIOD_MS), "MMMM d, yyyy");
          await adminDb.collection("notifications").add({
            userId: doc.id,
            title: "⏳ Account closing in 3 days",
            body: `Your YPG account will be automatically closed on ${removalDate}.`,
            type: "broadcast",
            read: false,
            createdAt: now,
          });
          if (data.email) {
            try { await sendYafRemovalWarningEmail(data.email, data.displayName || "Member", removalDate); } catch (e) { console.error(e); }
          }
          await doc.ref.update({ removalWarningSent: true });
          removalWarningsSent++;
        }
      }

      const isBirthdayToday = birth.getMonth() === todayMonth && birth.getDate() === todayDate;
      if (!isBirthdayToday) continue;

      const age = calcAge(dob, today);

      if (age >= 18 && age < 30) {
        // Regular birthday wish
        await adminDb.collection("notifications").add({
          userId: doc.id,
          title: "🎂 Happy Birthday!",
          body: `Wishing you a wonderful birthday and a blessed new year of life, ${data.displayName?.split(" ")[0] || ""}!`,
          type: "broadcast",
          read: false,
          createdAt: now,
        });
        if (data.email) {
          try { await sendBirthdayEmail(data.email, data.displayName || "Member"); } catch (e) { console.error(e); }
        }
        birthdaysSent++;
      } else if (age === 30 && !data.isYaf) {
        // Turning 30 today — becomes a YAF member, starts the 2-month countdown
        await adminDb.collection("notifications").add({
          userId: doc.id,
          title: "🎉 Congratulations on becoming a YAF member!",
          body: "Thank you for being part of YPG. We celebrate you today and always.",
          type: "broadcast",
          read: false,
          createdAt: now,
        });
        if (data.email) {
          try { await sendYafTransitionEmail(data.email, data.displayName || "Member"); } catch (e) { console.error(e); }
        }
        await doc.ref.update({ isYaf: true, yafStartedAt: now });
        yafTransitions++;
      }
    }

    return NextResponse.json({ ok: true, birthdaysSent, yafTransitions, removalWarningsSent, removed, checked: snap.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
