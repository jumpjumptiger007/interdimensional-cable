const CACHE = "interdem-phosphor-3d-v41";
const ASSETS = ["./", "index.html", "style.css?v=41", "app.js?v=41", "environment-3d.js?v=41", "videos.json", "manifest.webmanifest", "favicon.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => {
  const upgrading = keys.some(key => key !== CACHE && key.indexOf("interdem-phosphor-") === 0);
  return Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))).then(() => self.clients.claim()).then(() => {
    if (!upgrading) return;
    return self.clients.matchAll({ type: "window" }).then(clients => {
      // Let activation finish before the new navigation is handled.
      clients.forEach(client => { if (client.navigate) client.navigate(client.url).catch(() => {}); });
    });
  });
})));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (new URL(request.url).origin !== location.origin) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request, { cache: "no-cache" }).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      return caches.open(CACHE).then(cache => cache.put("index.html", copy)).then(() => response);
    }).catch(() => caches.match("index.html").then(cached => cached || caches.match("./"))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
