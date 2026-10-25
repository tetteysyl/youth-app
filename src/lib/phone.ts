/**
 * Phone number normalisation to E.164, which is what WhatsApp requires.
 *
 * Members enter Ghanaian numbers in local form ("0545461866", sometimes with
 * spaces or dashes). WhatsApp needs "233545461866" — country code, no plus,
 * no leading zero.
 */

/** Default country calling code. Ghana unless overridden. */
const DEFAULT_CC = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "233";

/**
 * Returns the number in E.164 digits (no leading "+"), or null if it can't be
 * understood. Never throws — a bad number simply means "no WhatsApp for them".
 */
export function toE164(raw: string | undefined | null, countryCode = DEFAULT_CC): string | null {
  if (!raw) return null;

  // Strip everything that isn't a digit or a leading plus.
  let s = String(raw).trim().replace(/[^\d+]/g, "");
  if (!s) return null;

  // +233545461866  ->  233545461866
  if (s.startsWith("+")) s = s.slice(1);

  // 00233545461866 -> 233545461866  (international prefix)
  if (s.startsWith("00")) s = s.slice(2);

  // 0545461866 -> 233545461866  (local trunk prefix)
  if (s.startsWith("0")) s = countryCode + s.slice(1);

  // 545461866 -> 233545461866  (bare subscriber number)
  else if (!s.startsWith(countryCode)) {
    // Only prepend when the length looks like a bare subscriber number,
    // otherwise assume it already carries some other country code.
    if (s.length === 9) s = countryCode + s;
  }

  // Sanity: E.164 is 8–15 digits.
  if (!/^\d{8,15}$/.test(s)) return null;
  return s;
}

/** Pretty form for display/logs: +233 54 546 1866 */
export function formatE164(e164: string): string {
  return "+" + e164;
}
