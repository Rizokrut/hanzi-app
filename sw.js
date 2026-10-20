/* Service worker: скачивает приложение в кэш и дальше работает без сети.
   Адрес: sw.js?v=ВЕРСИЯ&lv=ВЕРСИЯ_СЛОВАРЯ (их считает server.py / tools/release.py).
   Большой словарь кладётся в отдельный кэш по мере использования. */
const P = new URL(self.location).searchParams;
const VERSION = P.get('v') || 'dev';
const CACHE = 'hanzi-' + VERSION;
const LAZY = 'hzlazy-' + (P.get('lv') || 'dev');
const isLazy = path => /\/data\/(dict\.json|extra\/)/.test(path);

async function broadcast(msg) {
  const cs = await self.clients.matchAll({ includeUncontrolled: true });
  cs.forEach(c => c.postMessage(msg));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const tmp = await caches.open(CACHE + '-tmp');
    const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
    const files = list.files;
    let done = 0;
    const old = (await caches.keys()).filter(k => k.startsWith('hanzi-') && !k.endsWith('-tmp'));
    const queue = [...files];
    async function worker() {
      while (queue.length) {
        const f = queue.shift();
        const res = await fetch(new Request(f, { cache: 'reload' }));
        if (!res.ok) throw new Error(f + ': ' + res.status);
        await tmp.put(f, res);
        done++;
        if (done % 5 === 0 || done === files.length) broadcast({ type: 'progress', done, total: files.length });
      }
    }
    try {
      await Promise.all([worker(), worker(), worker(), worker()]);
    } catch (e) {
      broadcast({ type: 'error', message: String(e.message || e) });
      throw e;
    }
    const final = await caches.open(CACHE);
    for (const req of await tmp.keys()) await final.put(req, await tmp.match(req));
    await caches.delete(CACHE + '-tmp');
    broadcast({ type: 'installed', update: old.length > 0 });
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('hanzi-') && k !== CACHE) await caches.delete(k);
      if (k.startsWith('hzlazy-') && k !== LAZY) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/precache.json')) return; // всегда из сети
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('./')) || (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (isLazy(url.pathname)) {
      const lazy = await caches.open(LAZY);
      const lhit = await lazy.match(req, { ignoreSearch: true });
      if (lhit) return lhit;
      const res = await fetch(req);
      if (res.ok) await lazy.put(req, res.clone());
      return res;
    }
    try { return await fetch(req); }
    catch (e) { return new Response('offline', { status: 503 }); }
  })());
});
