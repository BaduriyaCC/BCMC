/* Baduriya Media Portal — offline support.
   The app page is fetched fresh when online (so updates arrive) and served
   from the cache when offline. Fonts and the helper libraries are kept after
   the first visit so posters and videos can be made without internet. */
const VERSION = '202611120447';
const APP_CACHE = 'bmp-app-' + VERSION, LIB_CACHE = 'bmp-libs-v1';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Anek+Tamil:wdth,wght@75..100,400..800&family=Bebas+Neue&family=Mukta+Malar:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
const LIB_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'staticimgly.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP_CACHE);
    await c.addAll(APP_FILES);
    // keep the brand fonts (English + Tamil) for offline use
    try {
      const lib = await caches.open(LIB_CACHE);
      const r = await fetch(FONT_CSS, { mode: 'cors' });
      if (r.ok) {
        const css = await r.clone().text();
        await lib.put(FONT_CSS, r);
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(fr => fr.ok && lib.put(u, fr)).catch(() => {})));
      }
    } catch (err) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('bmp-app-') && k !== APP_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  // the app page: network first, cache when offline
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      try {
        // always ask GitHub for the newest page (skips the browser's 10-minute cache)
        const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (r.ok) { const c = await caches.open(APP_CACHE); c.put('./index.html', r.clone()); }
        return r;
      } catch (err) {
        return (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  // our own icons / manifest
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }
  // fonts, pdf reader, AI background-removal files: cache after first use
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const lib = await caches.open(LIB_CACHE);
      const hit = await lib.match(req, { ignoreVary: true });
      if (hit) return hit;
      const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
      if (r.ok || r.type === 'opaque') lib.put(req, r.clone()).catch(() => {});
      return r;
    })());
  }
});
