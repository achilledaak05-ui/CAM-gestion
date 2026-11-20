/* CAM — Service Worker (PWA iOS / Android)
 *
 * Règles strictes :
 *  - JAMAIS d'interception des requêtes /api/ (sessions, données personnelles).
 *  - JAMAIS de requêtes non GET ni de requêtes cross-origin (polices, CDN).
 *  - HTML en « network-first » : on sert toujours la version fraîche du serveur.
 *  - Les fichiers statiques seuls sont mis en cache (stale-while-revalidate).
 *
 * Conséquence : sans réseau, l'app affiche une page mais la connexion échoue
 * proprement. Aucune donnée de membre n'est stockée dans le cache.
 */

const CACHE = 'cam-membres-v3';
const STATIQUES = [
  './',
  './index.html',
  './bienvenue.html',
  './pasteur.html',
  './cam-fx.css',
  './cam-fx.js',
  './pwa.js',
  './icons/metanoia-192.png',
  '../1-Web-Tableau-de-bord/qrcode.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIQUES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  let url;
  try { url = new URL(requete.url); } catch { return; }
  if (url.origin !== self.location.origin) return;      // CDN, polices Google…
  if (url.pathname.indexOf('/api/') === 0) return;      // sessions / données : jamais en cache
  if (url.pathname.indexOf('/telechargements') === 0) return;

  // Pages HTML : réseau d'abord, cache uniquement en secours hors-ligne.
  if (requete.mode === 'navigate') {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => caches.match(requete).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Fichiers statiques : cache pendant que le réseau rafraîchit.
  event.respondWith(
    caches.match(requete).then((enCache) => {
      const reseau = fetch(requete)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || reseau;
    })
  );
});
