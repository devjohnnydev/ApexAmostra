// Service Worker - Passthrough Mode (sem cache agressivo)
// Versao: v11 - Pass-through apenas, sem interceptacao de navegacao HTML/JS

const CACHE_NAME = 'apextech-v11-cache';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpar todos os caches antigos
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// NÃO interceptar nenhuma requisição - deixar o browser tratar tudo
// Isso evita o TypeError: Failed to convert value to 'Response'
self.addEventListener('fetch', (event) => {
  // Apenas requisições de outros recursos (imagens, fonts) podem ser cacheadas
  const url = event.request.url;

  // Nunca interceptar: navegação HTML, JS, CSS, API
  if (
    event.request.mode === 'navigate' ||
    url.includes('.html') ||
    url.includes('.js') ||
    url.includes('.css') ||
    url.includes('/api/')
  ) {
    return; // Deixar o browser tratar normalmente
  }

  // Para outros assets (imagens, fontes) - cache simples sem erros
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Se falhar, retornar resposta vazia válida (nunca undefined)
        return new Response('', { status: 408, statusText: 'Network timeout' });
      });
    })
  );
});
