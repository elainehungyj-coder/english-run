const CACHE_NAME = "english-run-public-shell-v23-20261123";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js?v=20261123campaign",
  "./data.js?v=20261123campaign",
  "./manifest.json",
  "./iPhone使用說明.txt",
  "./audio/jessica-20261124/w092.mp3",
  "./audio/jessica-20261124/w093.mp3",
  "./audio/jessica-20261124/w094.mp3",
  "./audio/jessica-20261124/w095.mp3",
  "./audio/jessica-20261124/w099.mp3",
  "./audio/jessica-20261124/w106.mp3",
  "./audio/jessica-20261124/w107.mp3",
  "./audio/jessica-20261124/w108.mp3",
  "./audio/jessica-20261124/w109.mp3",
  "./audio/jessica-20261124/w111.mp3",
  "./audio/jessica-20261124/w112.mp3",
  "./audio/jessica-20261124/w113.mp3",
  "./audio/jessica-20261124/w114.mp3",
  "./audio/jessica-20261124/w115.mp3",
  "./audio/jessica-20261124/w116.mp3",
  "./audio/jessica-20261124/w117.mp3",
  "./audio/jessica-20261124/w118.mp3",
  "./audio/jessica-20261124/w119.mp3"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
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
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
