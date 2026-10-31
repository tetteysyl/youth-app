/**
 * Create every WhatsApp message template this app sends, via the Graph API.
 *
 *   node scripts/create-wa-templates.mjs [--waba <id>] [--lang en]
 *
 * Reads WHATSAPP_ACCESS_TOKEN from .env.local. The token must carry the
 * `whatsapp_business_management` scope (messaging alone is not enough).
 *
 * Idempotent: a template that already exists is reported and skipped.
 * The placeholder order here MUST match the params in src/lib/whatsapp.ts.
 */
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const WABA = argOf("--waba", "2538626353313549");
const LANG = argOf("--lang", "en");

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  let v = t.slice(i + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const TOKEN = env.WHATSAPP_ACCESS_TOKEN;
if (!TOKEN) { console.error("✗ WHATSAPP_ACCESS_TOKEN missing from .env.local"); process.exit(1); }

/** name, body text, and one sample value per {{n}} — Meta requires samples. */
const TEMPLATES = [
  ["meeting_notice",
   "A new YPG meeting has been scheduled: {{1}}\n\nDate: {{2}}\nTime: {{3}}\n\nPlease make every effort to attend.",
   ["Monthly General Meeting", "Friday, 7 August 2026", "18:00"]],

  ["meeting_reminder",
   "Hello, this is a reminder from the Young People's Guild.\n\nOur meeting {{1}} is coming up {{2}}.\n\nDate: {{3}}\nTime: {{4}}\n\nPlease make every effort to attend and arrive on time. We look forward to seeing you there.",
   ["Monthly General Meeting", "tomorrow", "Friday, 7 August 2026", "18:00"]],

  ["meeting_duty",
   "Hello {{1}}, you are the {{2}} for {{3}}, taking place {{4}}.\n\nDate: {{5}}\nTime: {{6}}\n\nKindly prepare accordingly. If you cannot serve, please inform the executives early.",
   ["Sakitey Ernest", "Master of Ceremonies (MC)", "Monthly General Meeting", "in 3 days", "Friday, 7 August 2026", "18:00"]],

  ["dues_reminder",
   "Hello {{1}}, your YPG dues for {{2}} {{3}} have not been recorded yet.\n\nKindly settle them with the Financial Secretary at your earliest convenience.",
   ["Ebenezer Darteh", "August", "2026"]],

  ["dues_paid",
   "Hello {{1}}, your YPG dues for {{2}} have been recorded as paid.\n\nAmount: {{3}}\n\nThank you.",
   ["Ebenezer Darteh", "August 2026", "GHS 5.00"]],

  ["welcome_member",
   "Welcome to YPG, {{1}}! Your account has been approved and you can now sign in to the YPG app.\n\nGod bless you as you serve in this guild.",
   ["Ebenezer Darteh"]],

  ["birthday_wish",
   "Happy Birthday, {{1}}! The entire YPG family wishes you a blessed new year of life.",
   ["Ebenezer Darteh"]],

  ["absence_inquiry",
   "Hello {{1}}, we noticed you were absent from {{2}} on {{3}}.\n\nWe hope all is well. Kindly let your organizer know the reason for your absence.",
   ["Ebenezer Darteh", "Monthly General Meeting", "7 August 2026"]],

  ["yaf_transition",
   "Congratulations {{1}}! You have officially transitioned to YAF (Young Adult Fellowship).\n\nYou have 1 year remaining in the YPG system. Thank you for your service to the Guild.",
   ["Ebenezer Darteh"]],

  ["yaf_removal_warning",
   "Hello {{1}}, your YPG account is scheduled to close on {{2}}, 30 days from now.\n\nIf you believe this is a mistake, please contact the YPG executives.",
   ["Ebenezer Darteh", "7 September 2026"]],

  ["ypg_announcement",
   "Dear member, there is a new announcement from the Young People's Guild.\n\nSubject: {{1}}\n\n{{2}}\n\nThank you, and God bless you.\nYPG Secretariat",
   ["Harvest Thanksgiving", "This Sunday we gather for our annual harvest service. Please be seated by 8:30am."]],
];

const url = `https://graph.facebook.com/v21.0/${WABA}/message_templates`;
let created = 0, existed = 0, failed = 0;

const existing = new Set();
try {
  const r = await fetch(`${url}?limit=100&access_token=${TOKEN}`);
  const d = await r.json();
  (d.data ?? []).forEach((t) => existing.add(t.name));
} catch { /* duplicates still caught from the error message below */ }

const post = async (payload, attempts = 4) => {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { res, data: await res.json() };
    } catch (e) {
      if (i === attempts) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
};

for (const [name, body, samples] of TEMPLATES) {
  if (existing.has(name)) { console.log(`- exists    ${name}`); existed++; continue; }
  const payload = {
    name,
    language: LANG,
    category: "UTILITY",
    components: [{ type: "BODY", text: body, example: { body_text: [samples] } }],
  };
  try {
    const { res, data } = await post(payload);
    if (res.ok) { console.log(`✅ created   ${name}  (${data.status ?? "PENDING"})`); created++; }
    else {
      const msg = data?.error?.error_user_msg || data?.error?.message || JSON.stringify(data);
      if (/already exists|already English content/i.test(msg)) { console.log(`➖ exists    ${name}`); existed++; }
      else { console.log(`❌ failed    ${name}: ${String(msg).slice(0, 150)}`); failed++; }
    }
  } catch (e) {
    console.log(`❌ error     ${name}: ${e.message}`); failed++;
  }
}
console.log(`\ncreated ${created} | already existed ${existed} | failed ${failed}`);
console.log("Templates start as PENDING and are usually approved within minutes to a few hours.");
