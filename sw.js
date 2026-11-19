// ─────────────────────────────────────────────────────────────
// Service worker Mijoté
//  • Fichiers de l'app : « réseau d'abord » (toujours à jour en ligne),
//    repli sur le cache hors ligne → l'app s'ouvre même sans réseau.
//  • Polices & bibliothèque Supabase (CDN versionnés) : cache puis mise à jour.
//  • Appels API Supabase : jamais mis en cache (données temps réel).
// ⚠️ Augmenter VERSION à chaque publication pour mettre à jour les téléphones.
// ─────────────────────────────────────────────────────────────
const VERSION = 'mijote-v1.0.3';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/utils.js', './js/icons.js', './js/ui.js', './js/store.js', './js/model.js',
  './js/domain.js', './js/intro.js', './js/onboarding.js',
  './js/data/ingredients.js', './js/data/recipes.js',
  './js/views/home.js', './js/views/planning.js', './js/views/recipes.js', './js/views/recipe.js',
  './js/views/editor.js', './js/views/shopping.js', './js/views/cook.js', './js/views/settings.js', './js/views/shared.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'mijote-cdn').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Données Supabase : jamais interceptées
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in') || url.protocol.startsWith('ws')) return;

  // CDN (polices, supabase-js) : stale-while-revalidate
  if (/fonts\.(googleapis|gstatic)\.com|esm\.sh/.test(url.hostname)) {
    e.respondWith(
      caches.open('mijote-cdn').then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // App : réseau d'abord (4 s max), puis cache
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return new Response('', { status: 504 });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list[0];
      return c ? c.focus() : self.clients.openWindow('./');
    }),
  );
});
