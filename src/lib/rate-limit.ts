import { NextResponse } from "next/server";

/**
 * Lightweight fixed-window rate limiter.
 *
 * Backed by an in-process Map. On a serverless platform (Vercel) this is
 * PER-INSTANCE — each warm lambda keeps its own counters — so it is best-effort
 * abuse/burst protection rather than a hard global cap. That is sufficient for
 * this app's scale and threat model (stopping a single client from hammering the
 * email/message endpoints). To make it a hard global limit, swap the body of
 * `rateLimit` for an Upstash Redis / Vercel KV counter — the call sites don't change.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

// Drop expired buckets occasionally so the Map can't grow unbounded.
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key);
}

export interface RateResult { ok: boolean; retryAfter: number; remaining: number }

/**
 * @param key      unique bucket key, e.g. `broadcast:${uid}`
 * @param limit    max requests allowed within the window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000), remaining: 0 };
  }
  b.count++;
  return { ok: true, retryAfter: 0, remaining: limit - b.count };
}

/** Standard 429 response with a Retry-After header. */
export function rateLimited(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } }
  );
}
