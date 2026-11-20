/* ============================================================
   Application d'église — couche de données partagée
   Guide : "APPLICATION D'ÉGLISE — Fonctionnalités, gestion
   communautaire et paiement externe par QR Code" (9 pages)
   Le schéma miroite la base MySQL du §6 ; stockage local tant que
   le backend n'est pas déployé.
   ============================================================ */
(function (global) {
  'use strict';
  var KEY = 'eglise_db_v1';

  /* ---------- Utilitaires ---------- */
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(s) { if (!s) return ''; try { return new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return s; } }
  function fmtShort(s) { if (!s) return ''; try { return new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return s; } }
  function fmtTime(s) { if (!s) return ''; try { var d = new Date(s); return pad(d.getHours()) + 'h' + pad(d.getMinutes()); } catch (e) { return s; } }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function fullName(m) { return ((m && m.prenom) || '') + ' ' + ((m && m.nom) || ''); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function money(v) { return num(v).toLocaleString('fr-FR') + ' FCFA'; }
  function ref(prefix) { return (prefix || 'EGL') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  /* ---------- Hachage local synchrone (SHA-256) ---------- */
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(str) {
    var bytes = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
      else if (c < 55296 || c >= 57344) bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      else { c = 65536 + (((c & 1023) << 10) | (str.charCodeAt(++i) & 1023)); bytes.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    }
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var len = bytes.length; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    var bits = len * 8, hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64), t, s0, s1, a, b, cc, d, e, f, g, h, S0, S1, ch, maj, t1, t2;
    for (var j = 0; j < bytes.length; j += 64) {
      for (t = 0; t < 16; t++) w[t] = ((bytes[j+t*4] << 24) | (bytes[j+t*4+1] << 16) | (bytes[j+t*4+2] << 8) | bytes[j+t*4+3]) | 0;
      for (t = 16; t < 64; t++) { s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3); s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10); w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0; }
      a=H[0];b=H[1];cc=H[2];d=H[3];e=H[4];f=H[5];g=H[6];h=H[7];
      for (t = 0; t < 64; t++) { S1 = rotr(e,6)^rotr(e,11)^rotr(e,25); ch = (e&f)^((~e)&g); t1 = (h+S1+ch+K[t]+w[t])|0; S0 = rotr(a,2)^rotr(a,13)^rotr(a,22); maj = (a&b)^(a&cc)^(b&cc); t2 = (S0+maj)|0; h=g;g=f;f=e;e=(d+t1)|0;d=cc;cc=b;b=a;a=(t1+t2)|0; }
      H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+cc)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function hashPassword(pw, salt) { return sha256(String(salt) + '|CAM2|' + String(pw)); }

  /* ---------- Constantes REPRISES DU GUIDE ---------- */
  // §3 — nature des contributions
  var TYPES_CONTRIB = ['Offrande', 'Dîme', 'Don', 'Projet spécial'];
  // §3 — moyens de paiement
  var MOYENS = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Carte bancaire'];
  // §4 — catégories du tableau de bord
  var CATEGORIES = ['Offrandes', 'Dîmes', 'Dons', 'Projets spéciaux'];
  // Statuts des demandes de paiement
  var STATUTS_PAIEMENT = ['en attente', 'confirmé', 'échoué', 'expiré', 'remboursé'];
  // Catégories de dépenses
  var TYPES_DEPENSE = ['Factures', 'Entretien', 'Achats', 'Actions sociales', 'Indemnités', 'Dépenses des départements'];
  // Périodes de rapport
  var RAPPORTS = ['Journalier', 'Hebdomadaire', 'Mensuel', 'Annuel'];
  // Rôles et permissions
  var ROLES = [
    { id: 'tresorier', label: 'Trésorière / Trésorier', droit: 'Accès aux modules financiers.' },
    { id: 'resp_financier', label: 'Responsable financier', droit: 'Validation des dépenses et rapprochements.' },
    { id: 'admin_general', label: 'Administrateur', droit: 'Vue globale et gestion des autorisations.' },
    { id: 'pasteur', label: 'Pasteur', droit: 'Accès complet aux modules réservés.' },
    { id: 'assistante', label: 'Assistante du Pasteur', droit: 'Accès complet aux modules réservés.' },
    { id: 'auditeur', label: 'Auditeur ou contrôleur', droit: 'Accès en lecture aux journaux et justificatifs, si l’église le souhaite.' },
    { id: 'responsable', label: 'Responsable', droit: 'Gestion de son département et des présences autorisées.' },
    { id: 'membre', label: 'Membre', droit: 'Espace membres : profil, activités, présences, enseignements et contributions.' }
  ];
  // Motifs de retrait
  var MOTIFS_RETRAIT = ['Fonctionnement', 'Aide sociale', 'Facture', 'Activité', 'Autre'];
  // Menu de l'application mobile
  var MENU_MOBILE = [
    { id: 'accueil', label: 'Accueil', contenu: 'Actualités, annonces et informations principales.', ico: '🏠' },
    { id: 'membres', label: 'Membres', contenu: 'Profil, annuaire, carte numérique.', ico: '👥' },
    { id: 'activites', label: 'Activités', contenu: 'Cultes, événements, calendrier et inscriptions.', ico: '📅' },
    { id: 'presences', label: 'Présences', contenu: 'QR Code, recherche et historique.', ico: '✅' },
    { id: 'enseignements', label: 'Enseignements', contenu: 'Prédications, Bible et médiathèque.', ico: '📖' },
    { id: 'vie-spirituelle', label: 'Vie spirituelle', contenu: 'Prières, témoignages et accompagnement.', ico: '🙏' },
    { id: 'contributions', label: 'Contributions', contenu: 'Offrandes, dîmes, dons et projets spéciaux.', ico: '💰' },
    { id: 'departements', label: 'Départements', contenu: 'Groupes, responsables et plannings.', ico: '🎛️' },
    { id: 'notifications', label: 'Notifications', contenu: 'Communications et rappels.', ico: '🔔' }
  ];
  // §2 — départements
  var DEPARTEMENTS = ['Chorale et louange', 'Accueil', 'Intercession', 'Protocole', 'Jeunesse', 'Évangélisation', 'Média / Technique', 'Enseignement', 'Femmes', 'Hommes'];
  // §2 — types d'événements
  var TYPES_EVENEMENT = ['Culte', 'Réunion', 'Séminaire', 'Conférence', 'Veillée', 'Formation', 'Concert', 'Baptême', 'Mariage'];
  // §11 — destinations de retrait
  var DESTINATIONS = [
    { nom: 'Wave', utilisation: 'Transfert vers le compte Wave officiel de l’église.', infos: 'Nom du bénéficiaire, numéro associé, référence du transfert.' },
    { nom: 'Orange Money', utilisation: 'Transfert vers le compte Orange Money officiel.', infos: 'Nom du bénéficiaire, numéro associé, référence du transfert.' },
    { nom: 'Compte bancaire', utilisation: 'Virement vers le compte bancaire de l’église.', infos: 'Titulaire, banque, IBAN ou coordonnées bancaires nécessaires.' }
  ];

  /* ---------- Collections (miroir MySQL §6) ---------- */
  var COLLECTIONS = [
    'users', 'members', 'membership_requests', 'departments', 'events', 'attendance', 'registrations',
    'contributions', 'transactions', 'expenses', 'withdrawals', 'beneficiaries',
    'prayers', 'testimonies', 'pastoral', 'media', 'notifications',
    'newcomers', 'children', 'house_groups', 'equipment', 'trainings', 'library', 'volunteers',
    'projects', 'families', 'preparations', 'programmes', 'reports', 'budgets', 'access_files', 'followups',
    'documents', 'announcements', 'audit'
  ];

  // L'adresse du QR d'offrandes doit être joignable par le téléphone qui scanne :
  // on la déduit de l'origine courante au lieu d'utiliser un domaine fictif.
  function adresseOffrandes() {
    if (global.location && /^https?:$/.test(global.location.protocol)) {
      try { return new URL('../3-E-Offring/', global.location.href).href; } catch (e) {}
    }
    return 'https://paiement.nomdeleglise.com';
  }

  function defaults() {
    var d = {
      version: 1,
      settings: {
        church: 'CAM',
        short: 'CAM',
        domainePaiement: adresseOffrandes(),
        attendanceUrl: '',
        apiBase: global.location && /^https?:$/.test(global.location.protocol) ? global.location.origin : '',
        devise: 'FCFA',
        compteMarchand: 'Compte marchand à confirmer',
        beneficiaire: 'Personne morale bénéficiaire à confirmer',
        anonymeAutorise: true,
        seuilDoubleValidation: 500000,
        soldeDisponible: 0,
        payoutDisponible: false,
        prestataire: 'Prestataire à confirmer'
      },
      audit: []
    };
    COLLECTIONS.forEach(function (c) { if (!d[c]) d[c] = []; });
    return d;
  }

  /* ---------- État initial sans données d'exemple ---------- */
  function seed() {
    return defaults();
  }

  var db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db || !db.version) { db = seed(); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  var base = defaults();
  Object.keys(base).forEach(function (k) { if (db[k] === undefined) db[k] = base[k]; });
  if (!db.settings || typeof db.settings !== 'object' || Array.isArray(db.settings)) db.settings = {};
  Object.keys(base.settings).forEach(function (k) {
    if (db.settings[k] === undefined || db.settings[k] === null) db.settings[k] = base.settings[k];
  });
  // Ancienne valeur fictive déjà enregistrée dans les navigateurs : la corriger.
  if (db.settings.domainePaiement === 'https://paiement.nomdeleglise.com') {
    db.settings.domainePaiement = base.settings.domainePaiement;
  }
  COLLECTIONS.forEach(function (c) {
    if (!Array.isArray(db[c])) db[c] = [];
    else db[c] = db[c].filter(function (item) { return !item || item.demo !== true; });
  });
  db.audit = db.audit.filter(function (entry) {
    return !(entry.action === 'Initialisation' && entry.motif === 'Création des données de démonstration');
  });

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; } }
  function list(c) { return db[c] || []; }
  function find(c, id) { return list(c).find(function (x) { return x.id === id; }); }
  function add(c, o) {
    o.id = o.id || uid(c.slice(0, 3)); o.createdAt = o.createdAt || new Date().toISOString();
    o.updatedAt = new Date().toISOString(); db[c].unshift(o); save(); return o;
  }
  function update(c, id, patch) {
    var x = find(c, id); if (!x) return null;
    Object.keys(patch).forEach(function (k) { x[k] = patch[k]; });
    x.updatedAt = new Date().toISOString(); save(); return x;
  }
  function remove(c, id) { var n = db[c].length; db[c] = db[c].filter(function (x) { return x.id !== id; }); save(); return db[c].length !== n; }
  function audit(action, motif, detail, auteur) {
    db.audit.unshift({ id: uid('log'), at: new Date().toISOString(), auteur: auteur || 'utilisateur', action: action, motif: motif || '', detail: detail || '' });
    if (db.audit.length > 800) db.audit.length = 800; save();
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  function mask(v) {
    var s = String(v || ''); if (s.length < 5) return '••••';
    return s.slice(0, 2) + '••••' + s.slice(-2);
  }
  /* Graphique en barres CSS — même rendu que l'application CAM */
  function cssChart(items, title) {
    var vals = items.map(function (i) { return num(i.value); });
    var max = Math.max.apply(null, [1].concat(vals));
    return (title ? '<p class="chart-title">' + esc(title) + '</p>' : '') +
      '<div class="chart">' + items.map(function (i) {
        var v = num(i.value), pct = Math.round(v / max * 100);
        return '<div class="chart-row">' +
          '<span class="chart-label">' + esc(i.label) + '</span>' +
          '<div class="chart-track"><div class="chart-fill ' + esc(i.kind || '') + '" style="width:' + pct + '%"></div></div>' +
          '<span class="chart-val">' + esc(v.toLocaleString('fr-FR')) + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }
  function csv(rows, filename) {
    var txt = '\ufeff' + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  global.EGL = {
    KEY: KEY, COLLECTIONS: COLLECTIONS,
    TYPES_CONTRIB: TYPES_CONTRIB, MOYENS: MOYENS, CATEGORIES: CATEGORIES,
    STATUTS_PAIEMENT: STATUTS_PAIEMENT,
    TYPES_DEPENSE: TYPES_DEPENSE, RAPPORTS: RAPPORTS,
    ROLES: ROLES, DEPARTEMENTS: DEPARTEMENTS, TYPES_EVENEMENT: TYPES_EVENEMENT,
    DESTINATIONS: DESTINATIONS, MOTIFS_RETRAIT: MOTIFS_RETRAIT,
    MENU_MOBILE: MENU_MOBILE,
    state: db, save: save, list: list, find: find, add: add, update: update, remove: remove,
    audit: audit, toast: toast, mask: mask, csv: csv, cssChart: cssChart,
    sha256: sha256, hashPassword: hashPassword,
    uid: uid, esc: esc, pad: pad, today: today, fmtDate: fmtDate, fmtShort: fmtShort,
    fmtTime: fmtTime, norm: norm, fullName: fullName, num: num, money: money, ref: ref
  };
})(window);
