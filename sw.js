const CACHE_NAME = "k22-shell-v32";
const APP_SHELL = [
  "./",
  "./index.html",
  "./home/home.html",
  "./home/home.js",
  "./calendar/calendar.html",
  "./calendar/calendar.js",
  "./today/today.html",
  "./today/today.js",
  "./notes/notes.html",
  "./notes/notes.js",
  "./categories/categories.html",
  "./categories/categories.js",
  "./category/category.html",
  "./category/category.js",
  "./shared/attachments.js",
  "./shared/search.js",
  "./css.css",
  "./js.js",
  "./manifest.webmanifest",
  "./icon.svg"
]

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
            // Cached page files do not include query strings. Match the clean
            // pathname first so offline category/subpage deep links keep the
            // requested URL instead of dropping back to Home.
            const cleanUrl=url.origin+url.pathname;
            return (await caches.match(event.request)) ||
              (await caches.match(cleanUrl)) ||
              (await caches.match("./index.html"));
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
