const CACHE_NAME = 'chronica-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/src/main.js',
  '/src/engine.js',
  '/src/database.js',
  '/src/i18n/en.json',
  '/src/i18n/es.json',
  '/src/i18n/fr.json',
  '/src/i18n/de.json',
  '/src/i18n/zh.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
