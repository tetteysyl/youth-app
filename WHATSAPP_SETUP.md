# WhatsApp Notifications — Setup

WhatsApp is a **second notification provider** alongside email. It is **off by
default**: with no credentials set, the app behaves exactly as it does today
(email + in-app notifications), and WhatsApp sends become silent no-ops.
Setting the two env vars switches it on — no code change, no redeploy of logic.

---

## The one thing to understand first

WhatsApp does **not** let a business send free-form text to someone who hasn't
messaged you in the last 24 hours. Every message the app sends is
"business-initiated", so each one must use a **template that Meta has approved
in advance**. Approval usually takes minutes to a few hours.

That means: **you cannot change the wording of these messages in code.** The
wording lives in Meta's template, and the app only fills in the blanks.

You also need **opt-in**: WhatsApp policy requires members to have agreed to be
contacted. Announcing it at a meeting and recording consent is enough; don't
import numbers that never agreed.

---

## 1. Create the Meta app

1. Go to <https://business.facebook.com> and create (or use) a **Meta Business
   account** for the congregation.
2. Go to <https://developers.facebook.com/apps> → **Create app** → type
   **Business** → name it (e.g. "Saviour YPG").
3. In the app dashboard, add the **WhatsApp** product.
4. Under **WhatsApp → API Setup** you'll see a test number and a
   **Phone number ID**. Copy the Phone number ID.

> The free test number only sends to up to 5 numbers you register manually —
> fine for testing. For the whole congregation you must add and verify a **real
> business phone number** (one that is *not* already on a personal WhatsApp
> account).

## 2. Get a permanent access token

The token shown on the API Setup page expires in 24 hours. For production:

1. **Business Settings → Users → System users** → **Add** → name it
   (e.g. "ypg-notifier"), role **Admin**.
2. **Add assets** → your WhatsApp app → enable **Manage**.
3. **Generate new token** → select the app → tick **whatsapp_business_messaging**
   and **whatsapp_business_management** → generate.
4. Copy it — **it is shown once**. This is a permanent token.

## 3. Register the templates

**WhatsApp Manager → Account tools → Message templates → Create template.**
For each: Category **Utility**, Language **English**.

Use these **exact names** — the app looks them up by name. Keep the `{{n}}`
placeholders in the same order; if you reword, the number and order of
placeholders must not change or values land in the wrong slots.

> Meta rejects anything that reads as marketing, so keep the Utility category
> and this factual tone.

### Meetings

**`meeting_notice`** — a meeting has been scheduled
```
A new YPG meeting has been scheduled: {{1}}

Date: {{2}}
Time: {{3}}

Please make every effort to attend.
```
Samples: `Monthly General Meeting` · `Friday, 7 August 2026` · `18:00`

**`meeting_reminder`** — 24 hours before, to all members
```
Reminder: {{1}} is {{2}}.

Date: {{3}}
Time: {{4}}

Please be punctual.
```
Samples: `Monthly General Meeting` · `tomorrow` · `Friday, 7 August 2026` · `18:00`

**`meeting_duty`** — 3 days and 24 hours before, to the MC and Leader
```
Hello {{1}}, you are the {{2}} for {{3}}, taking place {{4}}.

Date: {{5}}
Time: {{6}}

Kindly prepare accordingly. If you cannot serve, please inform the executives early.
```
Samples: `Sakitey Ernest` · `Master of Ceremonies (MC)` · `Monthly General Meeting` · `in 3 days` · `Friday, 7 August 2026` · `18:00`

### Dues

**`dues_reminder`** — monthly dues outstanding
```
Hello {{1}}, your YPG dues for {{2}} {{3}} have not been recorded yet.

Kindly settle them with the Financial Secretary at your earliest convenience.
```
Samples: `Ebenezer Darteh` · `August` · `2026`

**`dues_paid`** — payment recorded
```
Hello {{1}}, your YPG dues for {{2}} have been recorded as paid.

Amount: {{3}}

Thank you.
```
Samples: `Ebenezer Darteh` · `August 2026` · `GH₵5.00`

### Membership

**`welcome_member`** — account approved
```
Welcome to YPG, {{1}}! Your account has been approved and you can now sign in to the YPG app.

God bless you as you serve in this guild.
```
Samples: `Ebenezer Darteh`

**`birthday_wish`** — birthday greeting
```
Happy Birthday, {{1}}! The entire YPG family wishes you a blessed new year of life.

"To Know His Will and To Do It"
```
Samples: `Ebenezer Darteh`

**`absence_inquiry`** — marked absent from a meeting
```
Hello {{1}}, we noticed you were absent from {{2}} on {{3}}.

We hope all is well. Kindly let your organizer know the reason for your absence.
```
Samples: `Ebenezer Darteh` · `Monthly General Meeting` · `7 August 2026`

**`yaf_transition`** — turned 30, moving to YAF
```
Congratulations {{1}}! You have officially transitioned to YAF (Young Adult Fellowship).

You have 1 year remaining in the YPG system. Thank you for your service to the Guild.
```
Samples: `Ebenezer Darteh`

**`yaf_removal_warning`** — account closing in 30 days
```
Hello {{1}}, your YPG account is scheduled to close on {{2}}, 30 days from now.

If you believe this is a mistake, please contact the YPG executives.
```
Samples: `Ebenezer Darteh` · `7 September 2026`

### General

**`ypg_announcement`** — broadcasts, devotionals, attendance confirmations
```
{{1}}

{{2}}
```
Samples: `Harvest Thanksgiving` · `This Sunday we gather for our annual harvest service. Please be seated by 8:30am.`

> Because the body is only placeholders, Meta may ask for more context — if it
> is rejected, add a fixed first line such as `YPG Notice:` above `{{1}}`.
> The app passes the subject as `{{1}}` and the message as `{{2}}`.
>
> **Note:** WhatsApp forbids newlines inside a parameter, so multi-line
> broadcasts are flattened to a single paragraph in the WhatsApp copy. The
> email keeps the original formatting.

## 4. Set the environment variables

Locally in `.env.local`, and in **Vercel → Settings → Environment Variables →
Production**:

```
WHATSAPP_PHONE_NUMBER_ID=<from step 1>
WHATSAPP_ACCESS_TOKEN=<from step 2>
```

Optional: `WHATSAPP_API_VERSION` (default `v21.0`),
`WHATSAPP_TEMPLATE_LANG` (default `en`),
`NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (default `233` — Ghana).

Then redeploy: `npx vercel --prod` (env changes only apply to new deployments).

## 5. Verify

Trigger the reminder cron and read the tally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/meeting-reminders
```

```json
{ "ok": true, "notified": 8, "emailed": 8, "whatsapped": 6, "whatsappEnabled": true }
```

- `whatsappEnabled: false` → credentials not picked up (check Vercel + redeploy)
- `whatsapped` lower than `emailed` → normal: members with no phone number, or
  an unusable one, are skipped. Everyone still gets the email.

---

## What gets sent over WhatsApp

| Event | Who | Template |
|---|---|---|
| Meeting scheduled | all eligible members | `meeting_notice` |
| 3 days before a meeting | MC and Leader only | `meeting_duty` |
| 24 hours before | MC and Leader | `meeting_duty` |
| 24 hours before | all other members | `meeting_reminder` |
| Attendance recorded | members marked present | `ypg_announcement` |
| Marked absent | the absent members | `absence_inquiry` |
| Dues reminder sent | members who haven't paid | `dues_reminder` |
| Dues recorded as paid | that member | `dues_paid` |
| Member approved | the new member | `welcome_member` |
| Birthday | that member | `birthday_wish` |
| Turns 30 (YAF) | that member | `yaf_transition` |
| 30 days before removal | that member | `yaf_removal_warning` |
| Broadcast | all members | `ypg_announcement` |
| Bible quote / devotional | chosen recipients | `ypg_announcement` |

Members excluded from a meeting (distant members) and the super admin are
skipped, exactly as with email.

## Phone numbers

Members enter Ghanaian numbers locally (`0545461866`); the app converts to
E.164 (`233545461866`) automatically. It also accepts `+233…`, `00233…`, and
numbers with spaces or dashes. **A member with no phone number on file simply
gets no WhatsApp** — they still get the email and the in-app notification.

Worth checking who's missing one before you switch this on.

## Cost

Meta gives a monthly allowance of free service conversations; beyond that,
business-initiated "utility" conversations are charged per 24-hour window per
recipient (Ghana rates are low, but not zero). A meeting reminder to 50 members
is 50 conversations. Check current pricing on Meta's site and watch the first
month's billing.

## Switching provider later

All WhatsApp logic lives in `src/lib/whatsapp.ts` behind `sendTemplate()` /
`sendTemplateBulk()`. To move to Twilio or another provider, rewrite the body of
those two functions — no call site changes.
