import { adminDb } from "./firebase-admin";
import { Eligibility, monthsRequiredFor } from "./elections";

/**
 * A member may vote only if they are not owing dues for the election year.
 * "Owing" = any elapsed month of that year is unpaid (see monthsRequiredFor).
 *
 * Server-side only — dues are never exposed to the client for other members.
 */
export async function checkDuesEligibility(uid: string, year: number): Promise<Eligibility> {
  const monthsChecked = monthsRequiredFor(year);
  if (monthsChecked === 0) return { eligible: true, unpaidMonths: [], monthsChecked: 0 };

  const snap = await adminDb.collection("dues").doc(uid).get();
  const payments: Record<string, { paid?: boolean }> = snap.exists ? (snap.data()?.payments ?? {}) : {};

  const unpaidMonths: number[] = [];
  for (let m = 1; m <= monthsChecked; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    if (!payments[key]?.paid) unpaidMonths.push(m);
  }
  return { eligible: unpaidMonths.length === 0, unpaidMonths, monthsChecked };
}

/** Millis helper for Firestore Timestamps / Dates / ISO strings. */
export function ms(v: any): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "string") { const t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  if (typeof v._seconds === "number") return v._seconds * 1000;
  return null;
}
