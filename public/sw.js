// The Colour Archive service worker: lets the installed app open without a connection.
//
// - Pages: network first, so a new release shows up straight away; offline, the last copy opens.
// - Built files (/assets/…): their names change with every release, so a cached copy is always right.
// - Other files on this site and Google Fonts: served from the cache, then refreshed in the background.
// - Supabase (accounts, synced data, photos) is never cached: it always goes to the network.
//
// Signed out, the archive lives in this browser, so the whole app works offline. Signed in, it
// opens offline but needs a connection to load your account.

const CACHE = "colour-archive-v1";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/theme.js", "/icons/icon-192.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Every page is the same app, so one copy of it serves all of them offline.
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match("/");
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") event.respondWith(networkFirst(request));
    else if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(request));
    else event.respondWith(staleWhileRevalidate(request, event));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(request, event));
  // Anything else (Supabase) is left to the browser.
});
