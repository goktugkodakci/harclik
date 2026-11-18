// Bump VERSION whenever any file below changes, or phones keep serving the old copy.
const VERSION = 'harclik-1.1.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/core/budget.js',
  './js/core/categories.js',
  './js/core/dates.js',
  './js/core/money.js',
  './js/core/store.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/entry-sheet.js',
  './js/ui/history.js',
  './js/ui/plan-sheet.js',
  './js/ui/settings.js',
  './js/ui/setup.js',
  './js/ui/sheet.js',
  './js/ui/summary.js',
  './js/ui/toast.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache first: the whole app is a handful of static files, and it must open with no signal.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached ?? fetch(request)));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
