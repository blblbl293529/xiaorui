const CACHE = 'xiaorui-v11-douyin-auto';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './daily-content.js',
  './daily-content.css',
  './manifest.webmanifest',
  './icon-1024.png',
  './icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('xiaorui-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 天气等外部 API 直接走网络
  if (url.origin !== location.origin) return;
  // 每日内容必须由服务端核对日期，绝不缓存 API 响应。
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === new URL('./daily.json', self.registration.scope).pathname) return;
  const asset = ASSETS.some((path) => new URL(path, self.registration.scope).pathname === url.pathname);
  if (!asset && e.request.mode !== 'navigate') return;

  e.respondWith(
    fetch(e.request).then(async (res) => {
      if (res.ok && asset) {
        const cache = await caches.open(CACHE);
        await cache.put(e.request, res.clone());
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const page = await caches.match('./index.html');
        if (page) return page;
      }
      return Response.error();
    })
  );
});
