const CACHE_NAME = "k22-shell-v23";
const APP_SHELL = [
  "./",
  "./index.html",
  "./calendar.html",
  "./today.html",
  "./notes.html",
  "./categories.html",
  "./category.html",
  "./css.css",
  "./js.js",
  "./js/home/home.js",
  "./js/calendar/calendar.js",
  "./js/today/today.js",
  "./js/notes/notes.js",
  "./js/categories/categories.js",
  "./js/category/category.js",
  "./js/shared/attachments.js",
  "./js/shared/search.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
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

  if (url.origin === self.location.origin) {
    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            return response;
          })
          .catch(async () => {
            return (await caches.match(event.request)) || (await caches.match("./index.html"));
          })
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then(cached => {
        const network = fetch(event.request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("unpkg.com")
  ) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
      )
    );
  }
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
