/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — SERVICE WORKER v3
   Estratégia:
     · app shell (HTML/CSS/JS/ícones) → cache primeiro, atualiza
       em segundo plano, então abre instantâneo e offline;
     · fontes do Google → cache primeiro, são imutáveis;
     · cotações (brapi) → sempre rede, nunca cache: preço velho
       servido como novo seria pior que nenhum preço.
═══════════════════════════════════════════════════════════════ */

const VERSION = 'v3.0.0';
const SHELL = 'dominus-shell-' + VERSION;
const FONTS = 'dominus-fonts-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/core.js',
  './js/vault.js',
  './js/finance.js',
  './js/charts.js',
  './js/insights.js',
  './js/auth.js',
  './js/ui.js',
  './js/screens-auth.js',
  './js/screens-money.js',
  './js/screens-plan.js',
  './js/screens-extra.js',
  './js/app.js',
  './icon-192.png',
  './icon-512.png'
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(cache =>
      /* um arquivo que falhe não pode abortar a instalação inteira */
      Promise.all(SHELL_FILES.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(err => console.warn('[SW] não cacheei', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== FONTS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* cotações: rede e nada mais */
  if (url.hostname.endsWith('brapi.dev')) return;

  /* fontes: cache primeiro (imutáveis) */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(FONTS).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  /* app shell: cache primeiro + revalidação em segundo plano */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(hit => {
        const network = fetch(request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put(request, copy));
          }
          return res;
        }).catch(() => null);

        if (hit) { event.waitUntil(network); return hit; }

        return network.then(res => {
          if (res) return res;
          /* offline e fora do cache: devolve o app shell para
             qualquer navegação, que o roteamento é no cliente */
          if (request.mode === 'navigate' ||
              (request.headers.get('accept') || '').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'offline' });
        });
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
