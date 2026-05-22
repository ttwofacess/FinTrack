const CACHE_NAME = 'fintrack-v2';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/main.js',
  '/constants.js',
  '/dashboard.js',
  '/dataIO.js',
  '/donate.js',
  '/gastos.js',
  '/ingresos.js',
  '/presupuesto.js',
  '/store.js',
  '/ui.js',
  '/utils.js',
  '/styles/main.css',
  '/styles/base/animations.css',
  '/styles/base/reset.css',
  '/styles/base/tokens.css',
  '/styles/components/badge.css',
  '/styles/components/balance-hero.css',
  '/styles/components/bottom-nav.css',
  '/styles/components/card.css',
  '/styles/components/charts.css',
  '/styles/components/donate.css',
  '/styles/components/fab.css',
  '/styles/components/filter-chips.css',
  '/styles/components/form.css',
  '/styles/components/gastos-list.css',
  '/styles/components/header.css',
  '/styles/components/ingreso.css',
  '/styles/components/modal.css',
  '/styles/components/presupuesto.css',
  '/styles/components/tabs.css',
  '/styles/components/toast.css',
  '/styles/components/utilities.css',
  '/styles/layout/app.css',
  '/styles/layout/scrollbar.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
