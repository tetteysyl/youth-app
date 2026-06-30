const CACHE = "ypg-v5";
const OFFLINE_URL = "/";

// Assets to pre-cache on install
const PRECACHE = [
  "/",
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/ypg-logo.png",
  "/pcg-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API/Firebase requests — always go to network
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.hostname.includes("firebase") || url.hostname.includes("googleapis")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((res) => {
          // Cache fresh navigations and static assets
          if (res.ok && (request.mode === "navigate" || url.pathname.match(/\.(png|svg|ico|webp|woff2?)$/))) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match(OFFLINE_URL));

      // Return cached instantly for navigations, network for others
      return request.mode === "navigate" ? networkFetch : cached || networkFetch;
    })
  );
});
