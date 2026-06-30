// Simple in-memory fetch cache — persists across page navigations within the same session.
// Data is shown instantly from cache; a background refresh updates it silently.

const store = new Map<string, { data: any; ts: number }>();

export async function cachedFetch(url: string, ttlMs = 30_000): Promise<any> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await fetch(url).then((r) => r.json());
  store.set(url, { data, ts: Date.now() });
  return data;
}

// Show cached data instantly, then refresh in background and call onUpdate with fresh data
export function staleWhileRevalidate(
  url: string,
  ttlMs: number,
  onData: (data: any, fromCache: boolean) => void
) {
  const hit = store.get(url);
  if (hit) {
    onData(hit.data, true); // instant — from cache
    if (Date.now() - hit.ts < ttlMs) return; // still fresh, skip refetch
  }
  fetch(url)
    .then((r) => r.json())
    .then((data) => {
      store.set(url, { data, ts: Date.now() });
      onData(data, false); // background update
    })
    .catch(() => {});
}

export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
