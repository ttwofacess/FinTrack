// El nombre de la caché es un hash del contenido del shell, no un número que
// alguien tiene que acordarse de subir.
//
// El fetch de los módulos y las hojas es cache-first: si el nombre no cambia,
// un cliente que ya visité la app sigue sirviendo el código viejo para siempre,
// aunque sw.js se vuelva a descargar. Con el hash, cambiar cualquier archivo
// del shell cambia el nombre de la caché solo, el service worker reinstala y el
// activate borra la caché anterior.
//
// tests/sw-shell.test.js recalcula el hash y falla si no coincide: cuando
// touched, corré el test y copiá el valor que imprime.
const SHELL_HASH = 'c047db723c33';
const CACHE_NAME = `fintrack-${SHELL_HASH}`;

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
  '/recurrentes.js',
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
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
