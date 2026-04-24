/* ═══════════════════════════════════════════════════
   Dominus Finance — Service Worker v1.0
   Estratégia: Cache First para assets estáticos,
   Network First para requests externos (fontes CDN).
═══════════════════════════════════════════════════ */

const CACHE_NAME   = 'dominus-v1';
const CACHE_STATIC = 'dominus-static-v1';

// Arquivos que serão cacheados na instalação
const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
];

/* ── INSTALL: pré-cacheia os arquivos estáticos ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Pre-caching static files');
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting(); // ativa imediatamente sem esperar o antigo SW terminar
});

/* ── ACTIVATE: limpa caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim(); // assume controle imediato das páginas abertas
});

/* ── FETCH: Cache First para assets locais, Network First para externos ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Para assets do mesmo domínio (app shell): Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        // Não estava no cache — busca na rede e cacheia
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => {
          // Fallback offline: retorna index.html para navegação
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Para recursos externos (fontes Google, Tailwind CDN): Network First com fallback de cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request)) // fallback para versão cacheada
  );
});