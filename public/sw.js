// Offline shell. Model weights are cached separately by transformers.js
// (Cache Storage "transformers-cache"), so the app works offline after first use.
const CACHE = "drape-v4";
const SHELL = ["/", "/style.css", "/manifest.webmanifest", "/icons/icon.svg", "/models/tags.json", "/models/tags.bin",
  "/js/app.js", "/js/ui.js", "/js/db.js", "/js/ml.js", "/js/ml.worker.js", "/js/image.js", "/js/colour.js", "/js/taxonomy.js", "/js/tagging.js", "/js/automask.js", "/js/engine.js", "/js/parsing.js",
  "/js/stores.js", "/js/catalog.js", "/js/views/find.js", "/js/views/look.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("drape-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Network first so deploys show up at once; the cache is the offline fallback.
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) (await caches.open(CACHE)).put(e.request, res.clone());
      return res;
    } catch {
      return (await caches.match(e.request)) ?? (await caches.match("/")) ?? Response.error();
    }
  })());
});
