"use client";
import { authFetch } from "./auth-fetch";

const SESSION_PREFIX = "ypg_c_";
const store = new Map<string, { data: any; ts: number }>();

function readSession(url: string): { data: any; ts: number } | null {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_PREFIX + url) : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSession(url: string, data: any) {
  try {
    if (typeof sessionStorage !== "undefined")
      sessionStorage.setItem(SESSION_PREFIX + url, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export async function cachedFetch(url: string, ttlMs = 30_000): Promise<any> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await authFetch(url).then((r) => r.json());
  store.set(url, { data, ts: Date.now() });
  writeSession(url, data);
  return data;
}

export function staleWhileRevalidate(url: string, ttlMs: number, onData: (data: any, fromCache: boolean) => void) {
  // 1. Serve from in-memory store immediately
  const mem = store.get(url);
  if (mem) {
    onData(mem.data, true);
    if (Date.now() - mem.ts < ttlMs) return;
  } else {
    // 2. Serve from sessionStorage on page refresh (in-memory miss)
    const sess = readSession(url);
    if (sess) {
      store.set(url, sess);
      onData(sess.data, true);
      if (Date.now() - sess.ts < ttlMs) return;
    }
  }
  // 3. Revalidate in background
  authFetch(url)
    .then((r) => r.json())
    .then((data) => {
      store.set(url, { data, ts: Date.now() });
      writeSession(url, data);
      onData(data, false);
    })
    .catch(() => {});
}

export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      try { sessionStorage.removeItem(SESSION_PREFIX + key); } catch {}
    }
  }
}
