/* ============================================================
   MODULES CAM — reproduction de l'application « Base des données CAM »
   Chargé après shared/store.js dans mobile/ et web/.
   Reprend mot pour mot les départements, feuilles de route, ordre du
   culte, check-list, fiches et statistiques de l'ancienne application.
   ============================================================ */
(function (global) {
  'use strict';
  var E = global.EGL;

  /* Départements de l'application CAM */
  var DEPARTEMENTS = [
    'Chorale et louange', 'Louange & musique', 'Accueil', 'Intercession',
    'Protocole', 'Jeunesse', 'Évangélisation', 'Média / Technique',
    'Enseignement', 'Femmes', 'Hommes', 'Groupe musicale'
  ];

  var newCols = ['families', 'preparations', 'programmes', 'reports', 'budgets', 'access_files', 'followups'];
  function install() {
    newCols.forEach(function (c) { if (!Array.isArray(E.state[c])) E.state[c] = []; });
    E.COLLECTIONS.forEach(function (c) {
      if (Array.isArray(E.state[c])) {
        E.state[c] = E.state[c].filter(function (item) { return !item || item.demo !== true; });
      }
    });
    E.save();
  }
  install();

  var CAM = { DEPARTEMENTS: DEPARTEMENTS };
  global.EGLCAM = CAM;
  if (E) E.CAM = CAM;
})(window);
