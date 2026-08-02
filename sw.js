const CACHE_NAME = 'apextech-v3-cache';
const ASSETS_TO_CACHE = [
  '/',
  '/admin.html',
  '/admin.css',
  '/admin.js',
  '/style.css',
  '/script.js',
  '/assets/img/apexlogo.png',
  '/assets/img/logo (2).png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Ignora requisições de APIs internas ou externas para não quebrar a lógica de dados dinâmicos
  if (event.request.url.includes('/api/')) return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Valida se a resposta da rede é válida antes de tentar salvar no cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se a rede falhar, tenta responder com o item em cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Caso não haja cache e nem rede, retorna uma resposta de erro amigável ao invés de quebrar
          return new Response('Sem conexão com a internet e sem dados no cache local.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
      })
  );
});
