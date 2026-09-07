const CACHE = "retro-signal-static-v8";
const ASSETS = ["./", "index.html", "style.css", "app.js", "videos.json", "manifest.webmanifest", "favicon.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => { if (new URL(event.request.url).origin !== location.origin) return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
