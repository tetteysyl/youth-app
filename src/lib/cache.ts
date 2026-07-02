"use client";
import { authFetch } from "./auth-fetch";

const store = new Map<string, { data: any; ts: number }>();

export async function cachedFetch(url: string, ttlMs = 30_000): Promise<any> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await authFetch(url).then((r) => r.json());
  store.set(url, { data, ts: Date.now() });
  return data;
}

export function staleWhileRevalidate(url: string, ttlMs: number, onData: (data: any, fromCache: boolean) => void) {
  const hit = store.get(url);
  if (hit) {
    onData(hit.data, true);
    if (Date.now() - hit.ts < ttlMs) return;
  }
  authFetch(url)
    .then((r) => r.json())
    .then((data) => { store.set(url, { data, ts: Date.now() }); onData(data, false); })
    .catch(() => {});
}

export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
