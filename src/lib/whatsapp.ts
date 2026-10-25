import { toE164 } from "./phone";

/**
 * WhatsApp notification provider — Meta WhatsApp Cloud API.
 *
 * WhatsApp does not allow arbitrary business-initiated text. Anything sent
 * outside a 24-hour reply window must use a TEMPLATE that Meta has approved in
 * advance. So every send here names a template and supplies its parameters.
 * The exact template bodies to register are in WHATSAPP_SETUP.md.
 *
 * FAIL-SAFE BY DESIGN: if the credentials are absent, every function here is a
 * silent no-op. Email and in-app notifications are unaffected, so the app runs
 * perfectly well with WhatsApp switched off, and lights up the moment the
 * env vars are set — no code change.
 */

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v21.0";
const LANG = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";

/** True only when the provider is fully configured. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);
}

/** Template names. These must match what is approved in Meta Business Manager. */
export const WA_TEMPLATES = {
  meetingNotice: "meeting_notice",
  meetingReminder: "meeting_reminder",
  meetingDuty: "meeting_duty",
} as const;

export interface WhatsAppResult {
  sent: number;
  skipped: number;   // no phone, or unusable number
  failed: number;
  disabled?: boolean;
}

/** Meta rejects empty params; keep every placeholder non-empty. */
function clean(v: string | undefined | null): string {
  const s = (v ?? "").toString().trim();
  return s.length ? s : "-";
}

/**
 * Send one approved template to one number.
 * Returns true on success. Never throws.
 */
export async function sendTemplate(
  rawPhone: string | undefined | null,
  template: string,
  params: (string | undefined | null)[]
): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const to = toE164(rawPhone);
  if (!to) return false;

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: LANG },
          components: params.length
            ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: clean(p) })) }]
            : [],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Log without leaking the token; the number is already the user's own data.
      console.error(`WhatsApp send failed (${res.status}) to ${to} via "${template}": ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`WhatsApp send threw for ${to} via "${template}":`, e);
    return false;
  }
}

/**
 * Send the same template to many recipients, each with their own parameters.
 * Runs in small batches so a large congregation doesn't open hundreds of
 * sockets at once. Never throws — returns a tally.
 */
export async function sendTemplateBulk(
  recipients: { phone?: string | null; params: (string | undefined | null)[] }[],
  template: string,
  batchSize = 10
): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    return { sent: 0, skipped: recipients.length, failed: 0, disabled: true };
  }

  let sent = 0, skipped = 0, failed = 0;
  const deliverable = recipients.filter((r) => {
    if (toE164(r.phone)) return true;
    skipped++;
    return false;
  });

  for (let i = 0; i < deliverable.length; i += batchSize) {
    const batch = deliverable.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((r) => sendTemplate(r.phone, template, r.params))
    );
    results.forEach((ok) => (ok ? sent++ : failed++));
  }
  return { sent, skipped, failed };
}

/* ── Named helpers, one per flow ─────────────────────────────────────────── */

/** A new meeting has been scheduled. params: title, date, time */
export function waMeetingNotice(phone: string | null | undefined, title: string, date: string, time: string) {
  return sendTemplate(phone, WA_TEMPLATES.meetingNotice, [title, date, time]);
}

/** Meeting reminder for the general membership. params: title, when, date, time */
export function waMeetingReminder(phone: string | null | undefined, title: string, when: string, date: string, time: string) {
  return sendTemplate(phone, WA_TEMPLATES.meetingReminder, [title, when, date, time]);
}

/** Duty reminder for the MC / Leader. params: name, duty, title, when, date, time */
export function waMeetingDuty(
  phone: string | null | undefined,
  name: string, duty: string, title: string, when: string, date: string, time: string
) {
  return sendTemplate(phone, WA_TEMPLATES.meetingDuty, [name, duty, title, when, date, time]);
}
