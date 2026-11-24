// Offline-first app shell. Once MIA has been opened (or added to the Home
// Screen) while the laptop test server was reachable, it opens from this cache
// even when the laptop is off or on another network. Recordings never pass
// through the service worker; they stay in IndexedDB on the iPhone.
//
// To ship an update, change CACHE_NAME. The new version is downloaded the next
// time MIA is opened while the server is reachable, and is used from the
// launch after that.
const CACHE_NAME = "mia-pwa-v0.15.1";
const SHELL = "./index.html";
const ASSETS = ["./", SHELL, "./app.js", "./agent.js", "./backup.js", "./manifest.webmanifest", "./icon.svg", "./icon-180.png", "./fonts/fredoka-latin-600-normal.woff2", "./fonts/nunito-latin-700-normal.woff2", "./fonts/nunito-latin-800-normal.woff2"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // "reload" skips the HTTP cache so a new version never mixes old files.
      cache.addAll(ASSETS.map(path => new Request(path, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    // Cache first: do not wait for a laptop that may be switched off.
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => cache.match(SHELL))
        .then(cached => cached || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then(cache => cache.match(event.request, { ignoreSearch: true }))
      .then(cached => cached || fetch(event.request))
  );
});
