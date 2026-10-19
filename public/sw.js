/* Last Car Standing — offline service worker.
 *
 * `npm run build` runs scripts/pwa.mjs, which fills in VERSION and PRECACHE below with every file of the
 * build. Without that step (e.g. `vite dev`) the worker still works: it just caches files as they load.
 *
 *  - PRECACHE files are downloaded on install, so the whole game works offline after the first visit.
 *  - Pages (navigations): network first, cached copy when offline.
 *  - Everything else (same-origin GET): cache first. Built files have hashed names, so they never go stale.
 *  - A new build gets a new VERSION -> new cache; the old cache is deleted once the new worker takes over
 *    (on the next launch, never in the middle of a match).
 */
const VERSION = "dev";
const PRECACHE = [];

const CACHE = "lcs-" + VERSION;
const SCOPE = self.registration.scope;
const abs = (p) => new URL(p, SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // one missing file must not abort the install
      await Promise.allSettled(
        [SCOPE, ...PRECACHE.map(abs)].map((u) => cache.add(new Request(u, { cache: "reload" }))),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("lcs-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(SCOPE, res.clone()); // keep the latest page for offline start-up
          return res;
        } catch {
          return (await cache.match(SCOPE)) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
