/**
 * Panorama Service Worker
 * Strategy: Network-first for HTML/API, Cache-first for static assets
 */

const CACHE_NAME  = "panorama-v1";
const STATIC_CACHE = "panorama-static-v1";

// Core pages to pre-cache on install
const PRE_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.png",
];

// Patterns to always skip (realtime data, auth, external CDNs)
const SKIP_PATTERNS = [
  "firebaseio.com",
  "firebase.googleapis.com",
  "firebasestorage.googleapis.com",
  "googleapis.com",
  "gstatic.com",
  "r2.dev",
  "r2.cloudflarestorage.com",
  "/api/",
  "cloudflare-static",
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRE_CACHE); })
      .then(function() { return self.skipWaiting(); })
      .catch(function() { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return k !== CACHE_NAME && k !== STATIC_CACHE; })
            .map(function(k)    { return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  var url = event.request.url;

  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip patterns that must always be live
  for (var i = 0; i < SKIP_PATTERNS.length; i++) {
    if (url.indexOf(SKIP_PATTERNS[i]) !== -1) return;
  }

  // Static assets (fonts, images from same origin) → Cache-first
  if (/\.(woff2?|ttf|eot|png|jpg|jpeg|gif|webp|svg|ico|css)(\?|$)/.test(url)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(STATIC_CACHE).then(function(c) { c.put(event.request, clone); });
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML pages → Network-first, fall back to cache for offline
  event.respondWith(
    fetch(event.request)
      .then(function(res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
        }
        return res;
      })
      .catch(function() {
        return caches.match(event.request)
          .then(function(cached) {
            return cached || caches.match("/index.html");
          });
      })
  );
});