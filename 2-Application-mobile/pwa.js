/* Enregistrement du Service Worker.
 * Nécessite un contexte sécurisé (HTTPS ou localhost). Sur le réseau local en
 * HTTP, on n'insiste pas : la PWA iOS complète s'activera avec le domaine HTTPS.
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var securise = location.protocol === 'https:' ||
                 location.hostname === 'localhost' ||
                 location.hostname === '127.0.0.1';
  if (!securise) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
      /* échec silencieux : l'application reste utilisable en simple site web */
    });
  });
})();
