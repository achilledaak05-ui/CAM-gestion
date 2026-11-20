/* ============================================================
   Authentification de l'administration web (espace administratif
   et financier réservé aux personnes autorisées — guide §1).
   Stockage local tant que le backend / MySQL n'est pas déployé ;
   la table `users` du backend reprend les mêmes rôles (§4).
   ============================================================ */
(function (global) {
  'use strict';
  var E = global.EGL;
  var SESSION = 'eglise_session';
  var LOGIN_PAGE = 'connexion.html'; // nom EXACT de la page de connexion (dossier admin/)
  // Le backend est obligatoire : la page du tableau de bord est verrouillée côté
  // serveur. L'ancien mode local (localStorage) ne peut donc plus authentifier.
  var BACKEND_HINT = 'Ouvrez le tableau de bord depuis le serveur CAM : '
    + 'http://<adresse-du-serveur>:3000/1-Web-Tableau-de-bord/connexion.html '
    + '(pas en double-cliquant sur le fichier, ni avec VS Code Live Server).';
  var backendMode = false;
  var remoteUser = null;
  var remoteUsers = [];
  var remoteRequests = [];
  function loadAdminData() {
    if (!backendMode || !remoteUser || remoteUser.role !== 'admin_general') return Promise.resolve();
    return Promise.all([
      fetch(global.location.origin + '/api/admin/users', { credentials: 'same-origin' }),
      fetch(global.location.origin + '/api/admin/membership-requests', { credentials: 'same-origin' }),
      fetch(global.location.origin + '/api/admin/members', { credentials: 'same-origin' }),
      fetch(global.location.origin + '/api/admin/events', { credentials: 'same-origin' }),
      fetch(global.location.origin + '/api/admin/registrations', { credentials: 'same-origin' }),
      fetch(global.location.origin + '/api/admin/attendance', { credentials: 'same-origin' })
    ]).then(function (responses) {
      if (responses.some(function (response) { return !response.ok; })) throw new Error('Impossible de charger les données administrateur.');
      return Promise.all(responses.map(function (response) { return response.json(); }));
    }).then(function (data) {
      remoteUsers = data[0].users || [];
      remoteRequests = data[1].requests || [];
      E.state.membership_requests = remoteRequests;
      E.state.members = data[2].members || [];
      E.state.events = data[3].events || [];
      E.state.registrations = (data[4].registrations || []).concat(data[5].attendance || []);
    }).catch(function (err) {
      // Un échec de chargement des données admin ne doit JAMAIS empêcher
      // l'administrateur de se connecter ou bloquer les champs.
      console.warn('[CAM] Données administrateur indisponibles :', err && err.message);
    });
  }
  var backendReady = (function () {
    /* Mode autonome : la couche CAM_LOCAL simule le backend en file://. */
    if (global.CAM_LOCAL && global.CAM_LOCAL.enabled) { backendMode = true; }
    else if (!global.location || !/^https?:$/.test(global.location.protocol)) return Promise.resolve(false);
    // Page servie en HTTP(S) : le backend est considéré disponible dès le départ.
    // On ne bloque JAMAIS les champs de connexion à cause d'un contrôle réseau
    // transient — c'est le serveur qui décide, via /api/auth/login.
    backendMode = true;
    return fetch(global.location.origin + '/api/health', { credentials: 'same-origin' })
      .then(function (response) {
        if (response.status === 404) { backendMode = false; return false; }
        if (!response.ok) throw new Error('Le backend CAM est indisponible.');
        return response.json().then(function (data) { return data.status === 'ok'; });
      })
      .then(function (available) {
        if (!backendMode) return false;
        return fetch(global.location.origin + '/api/auth/me', { credentials: 'same-origin' })
          .then(function (response) { return response.ok ? response.json() : { user: null }; })
          .then(function (data) {
            var user = data.user;
            remoteUser = user ? {
              id: user.id, identifiant: user.username, nom: user.username,
              role: user.role, statut: 'actif'
            } : null;
            return loadAdminData().then(function () { return true; });
          });
      })
      .catch(function () {
        // Surtout ne pas rejeter : loginRemote doit pouvoir tenter l'API et
        // afficher une vraie erreur serveur au lieu d'un formulaire figé.
        return true;
      });
  })();

  var mem = {};
  /* Session : localStorage en priorité, sessionStorage en complément, mémoire en repli.
     En file:// (double-clic), Firefox et Safari isolent le stockage de CHAQUE fichier :
     la session créée dans connexion.html est alors invisible dans index.html.
     Repli : window.name, qui survit à la navigation dans le même onglet (file:// uniquement). */
  var FILE = (global.location && global.location.protocol === 'file:');
  var WN = 'cam_' + SESSION + '=';
  function wnGet() {
    try { var n = String(global.name || ''); return n.indexOf(WN) === 0 ? decodeURIComponent(n.slice(WN.length)) : null; } catch (e) { return null; }
  }
  function ssGet(k) {
    try { var v = localStorage.getItem(k); if (v) return v; } catch (e) {}
    try { var w = sessionStorage.getItem(k); if (w) return w; } catch (e) {}
    return mem[k] || (FILE && k === SESSION ? wnGet() : null) || null;
  }
  function ssSet(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, v); } catch (e) {}
    try { sessionStorage.setItem(k, v); } catch (e) {}
    if (FILE && k === SESSION) { try { global.name = WN + encodeURIComponent(v); } catch (e) {} }
  }
  function ssDel(k) {
    delete mem[k];
    try { localStorage.removeItem(k); } catch (e) {}
    try { sessionStorage.removeItem(k); } catch (e) {}
    if (FILE && k === SESSION) { try { global.name = ''; } catch (e) {} }
  }

  if (!Array.isArray(E.state.users)) E.state.users = [];
  E.state.users = E.state.users.filter(function (u) {
    return !(u.identifiant === 'admin' && u.salt === 'eglise-admin-salt');
  }).map(function (u) {
    if (!u.statut) u.statut = 'actif';
    if (!u.role) u.role = 'responsable';
    if (u.activationReviewed === undefined && u.role !== 'admin_general') {
      u.statut = 'inactif';
      u.activationReviewed = true;
    }
    if (!u.salt) u.salt = 'eglise-' + u.id + '-salt';
    if (!u.passwordHash) {
      u.statut = 'inactif';
      u.passwordHash = E.hashPassword(E.uid('disabled'), u.salt);
    }
    if (u.mustChangePassword === undefined) u.mustChangePassword = false;
    return u;
  });
  E.save();

  function roleLabel(r) {
    var x = E.ROLES.find(function (o) { return o.id === r; });
    return x ? x.label : (r || '—');
  }
  var FINANCE_PAGES = ['offrandes', 'projets', 'budgets', 'retraits', 'depenses', 'transactions', 'rapports'];
  var GENERAL_PAGES = [
    'events', 'departments', 'preparations', 'programmes', 'reports', 'ressources',
    'prayers', 'testimonies', 'pastoral', 'media', 'notifications', 'newcomers',
    'children', 'house_groups', 'equipment', 'trainings', 'library', 'volunteers',
    'documents', 'announcements'
  ];
  var EXECUTIVE_ROLES = ['admin_general', 'pasteur', 'assistante'];
  var GENERAL_ROLES = ['responsable', 'resp_financier', 'auditeur'];
  function isAdmin() {
    var u = current();
    return !!u && u.role === 'admin_general';
  }
  function can(page) {
    var u = current();
    if (!u || !page) return false;
    if (EXECUTIVE_ROLES.indexOf(u.role) !== -1) return true;
    if (u.role === 'tresorier' || u.role === 'tresoriere') {
      return GENERAL_PAGES.indexOf(page) !== -1 || FINANCE_PAGES.indexOf(page) !== -1;
    }
    return GENERAL_ROLES.indexOf(u.role) !== -1 && GENERAL_PAGES.indexOf(page) !== -1;
  }
  function createUser(data) {
    if (!isAdmin()) return { ok: false, message: 'Seul l’administrateur peut créer un compte.' };
    var identifiant = String(data.identifiant || '').trim();
    var nom = String(data.nom || '').trim();
    var email = String(data.email || '').trim();
    var role = String(data.role || '').trim();
    var password = String(data.password || '');
    if (!identifiant || !nom || !role || !password) return { ok: false, message: 'Tous les champs obligatoires doivent être renseignés.' };
    if (password.length < 12) return { ok: false, message: 'Le mot de passe doit contenir au moins 12 caractères.' };
    if (GENERAL_ROLES.indexOf(role) === -1) {
      return { ok: false, message: 'Seuls les profils responsables peuvent être créés ici.' };
    }
    if (find(identifiant) || (email && find(email))) return { ok: false, message: 'Cet identifiant ou cet e-mail est déjà utilisé.' };
    var id = E.uid('usr'), salt = E.uid('salt');
    var user = E.add('users', {
      id: id, identifiant: identifiant, nom: nom, prenom: '', email: email, role: role,
      statut: 'inactif', salt: salt, passwordHash: E.hashPassword(password, salt),
      mustChangePassword: false, activationReviewed: false, createdAt: new Date().toISOString()
    });
    E.audit('Compte créé', 'Compte créé inactif; activation requise', identifiant, current().nom);
    return { ok: true, user: user, message: 'Compte créé inactif. Activez-le après vérification.' };
  }
  function setUserStatus(id, status) {
    if (!isAdmin()) return { ok: false, message: 'Seul l’administrateur peut gérer les comptes.' };
    if (status !== 'actif' && status !== 'inactif') return { ok: false, message: 'Statut invalide.' };
    var user = E.find('users', id);
    if (!user) return { ok: false, message: 'Compte introuvable.' };
    if (user.id === current().id && status !== 'actif') return { ok: false, message: 'Vous ne pouvez pas désactiver votre propre compte.' };
    if (user.role === 'admin_general' && status !== 'actif' &&
        E.list('users').filter(function (u) { return u.role === 'admin_general' && u.statut === 'actif'; }).length <= 1) {
      return { ok: false, message: 'Le dernier compte administrateur actif ne peut pas être désactivé.' };
    }
    E.update('users', user.id, { statut: status, activationReviewed: true });
    E.audit(status === 'actif' ? 'Compte activé' : 'Compte désactivé', 'Gestion des accès', user.identifiant, current().nom);
    return { ok: true, message: status === 'actif' ? 'Compte activé.' : 'Compte désactivé.' };
  }
  function homePage() {
    var u = current();
    if (!u) return 'board';
    if (EXECUTIVE_ROLES.indexOf(u.role) !== -1) return 'board';
    if (u.role === 'tresorier' || u.role === 'tresoriere') return 'offrandes';
    if (GENERAL_ROLES.indexOf(u.role) !== -1) return 'events';
    return 'access-denied';
  }
  function find(id) {
    var k = String(id || '').trim().toLowerCase();
    if (!k) return null;
    return E.list('users').find(function (u) {
      return [u.identifiant, u.email].some(function (v) { return String(v || '').trim().toLowerCase() === k; });
    });
  }
  function current() {
    if (backendMode) return remoteUser;
    var id = ssGet(SESSION);
    if (!id) return null;
    return E.list('users').find(function (u) { return u.id === id && u.statut === 'actif'; }) || null;
  }
  function isActive() { return !!current(); }

  function login(id, pw) {
    // Ancien mode local désactivé : il produisait « Identifiant introuvable »
    // alors que le vrai problème était l'absence de backend.
    if (backendMode) return { ok: false, message: 'Utilisez la connexion sécurisée du serveur.' };
    return { ok: false, message: BACKEND_HINT };
  }
  function loginRemote(id, pw) {
    return backendReady.then(function () {
      if (!backendMode) return { ok: false, message: BACKEND_HINT };
      return fetch(global.location.origin + '/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id, password: pw })
      }).then(function (response) {
        return response.text().then(function (texte) {
          var data = {};
          try { data = texte ? JSON.parse(texte) : {}; } catch (e) { /* réponse non JSON */ }
          if (!response.ok) {
            return { ok: false, message: data.message || ('Le serveur a répondu ' + response.status + '. Réessayez.') };
          }
          var user = data.user;
          if (!user) return { ok: false, message: 'Réponse du serveur invalide. Réessayez.' };
          remoteUser = { id: user.id, identifiant: user.username, nom: user.username, role: user.role, statut: 'actif' };
          return loadAdminData().then(function () {
            return { ok: true, user: remoteUser, mustChange: false };
          });
        });
      }, function () {
        return { ok: false, message: 'Serveur CAM injoignable. Vérifiez votre connexion puis réessayez.' };
      });
    });
  }
  function remoteRequest(url, method, body) {
    return fetch(global.location.origin + url, {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.message || 'La demande serveur a échoué.');
        return data;
      });
    });
  }
  function createUserRemote(data) {
    if (!backendMode) return Promise.resolve(createUser(data));
    return remoteRequest('/api/admin/users', 'POST', data).then(function (user) {
      remoteUsers.push(user);
      return { ok: true, user: user, message: 'Compte créé inactif. Activez-le après vérification.' };
    }).catch(function (error) { return { ok: false, message: error.message }; });
  }
  function setUserStatusRemote(id, status) {
    if (!backendMode) return Promise.resolve(setUserStatus(id, status));
    return remoteRequest('/api/admin/users/' + encodeURIComponent(id) + '/activation', 'PATCH', { active: status === 'actif' })
      .then(function (updated) {
        var user = remoteUsers.find(function (item) { return item.id === id; });
        if (user) user.statut = updated.statut;
        return { ok: true, message: updated.statut === 'actif' ? 'Compte activé.' : 'Compte désactivé.' };
      }).catch(function (error) { return { ok: false, message: error.message }; });
  }
  function reviewMembershipRequest(id, decision) {
    if (!backendMode) return Promise.resolve({ ok: false, message: 'Action serveur indisponible.' });
    return remoteRequest('/api/admin/membership-requests/' + encodeURIComponent(id), 'PATCH', { decision: decision })
      .then(function (result) {
        var request = remoteRequests.find(function (item) { return item.id === id; });
        if (result.memberId && request) {
          E.state.members.unshift({
            id: result.memberId, nom: request.nom, prenom: request.prenom, tel: request.tel,
            email: request.email || '', adresse: request.adresse || '', statut: 'actif'
          });
        }
        remoteRequests = remoteRequests.filter(function (item) { return item.id !== id; });
        E.state.membership_requests = remoteRequests;
        return { ok: true, result: result, message: result.statut === 'acceptée' ? 'Demande approuvée.' : 'Demande refusée.' };
      }).catch(function (error) { return { ok: false, message: error.message }; });
  }
  function saveRecordRemote(collection, id, data) {
    if (collection !== 'members' && collection !== 'events') {
      return Promise.resolve({ ok: false, message: 'Cette collection n’est pas encore reliée au serveur.' });
    }
    var method = id ? 'PATCH' : 'POST';
    var url = '/api/admin/' + collection + (id ? '/' + encodeURIComponent(id) : '');
    return remoteRequest(url, method, data).then(function (record) {
      return { ok: true, record: record, message: 'Enregistrement sauvegardé.' };
    }).catch(function (error) { return { ok: false, message: error.message }; });
  }
  function deleteRecordRemote(collection, id) {
    if (collection !== 'members' && collection !== 'events') {
      return Promise.resolve({ ok: false, message: 'Cette collection n’est pas encore reliée au serveur.' });
    }
    return remoteRequest('/api/admin/' + collection + '/' + encodeURIComponent(id), 'DELETE')
      .then(function () { return { ok: true }; })
      .catch(function (error) { return { ok: false, message: error.message }; });
  }
  function changePasswordRemote(oldPw, newPw) {
    if (!backendMode) return Promise.resolve(changePassword(oldPw, newPw));
    return fetch(global.location.origin + '/api/auth/change-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: oldPw, newPassword: newPw })
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, message: data.message || (response.ok ? 'Mot de passe modifié.' : 'Modification refusée.') };
      });
    });
  }
  function logout() {
    if (backendMode) {
      return fetch(global.location.origin + '/api/auth/logout', {
        method: 'POST', credentials: 'same-origin'
      }).then(function () {
        remoteUser = null;
        global.location.href = LOGIN_PAGE;
      });
    }
    var u = current();
    if (u) E.audit('Déconnexion', 'Fin de session', u.identifiant, u.nom);
    ssDel(SESSION);
    location.href = LOGIN_PAGE;
  }
  function changePassword(oldPw, newPw) {
    var u = current();
    if (!u) return { ok: false, message: 'Session expirée.' };
    if (E.hashPassword(oldPw, u.salt) !== u.passwordHash) return { ok: false, message: 'Ancien mot de passe incorrect.' };
    if (String(newPw).length < 6) return { ok: false, message: '6 caractères minimum.' };
    var salt = E.uid('salt');
    E.update('users', u.id, { salt: salt, passwordHash: E.hashPassword(newPw, salt), mustChangePassword: false });
    E.audit('Mot de passe modifié', 'Administration web', u.identifiant, u.nom);
    return { ok: true, message: '✅ Mot de passe modifié.' };
  }
  function requireLogin() {
    if (isActive()) return true;
    // Garde anti-boucle : si on est DÉJÀ sur la page de connexion, ne pas se rediriger vers elle-même
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (here === LOGIN_PAGE.toLowerCase()) return false;
    try {
      var p = document.getElementById('page');
      if (p) p.innerHTML =
        '<div class="card" style="border-left:4px solid var(--accent);max-width:620px">' +
        '<h2>🔒 Accès réservé</h2>' +
        '<p class="mu">Connectez-vous pour accéder à l’administration et aux graphiques.</p>' +
        '<a class="btn pri" href="' + LOGIN_PAGE + '">Ouvrir la page de connexion →</a></div>';
    } catch (e) {}
    try { location.replace(LOGIN_PAGE); } catch (e) {
      try { location.href = LOGIN_PAGE; } catch (e2) {}
    }
    return false;
  }

  global.EGLAuth = {
    SESSION: SESSION, LOGIN_PAGE: LOGIN_PAGE,
    current: current, isActive: isActive, roleLabel: roleLabel,
    isAdmin: isAdmin, can: can, homePage: homePage,
    createUser: createUser, setUserStatus: setUserStatus,
    login: login, loginRemote: loginRemote, logout: logout, changePassword: changePassword,
    changePasswordRemote: changePasswordRemote, backendReady: backendReady,
    isBackendMode: function () { return backendMode; }, requireLogin: requireLogin,
    users: function () { return backendMode ? remoteUsers : E.list('users'); },
    createUserRemote: createUserRemote,
    setUserStatusRemote: setUserStatusRemote,
    reviewMembershipRequest: reviewMembershipRequest, saveRecordRemote: saveRecordRemote,
    deleteRecordRemote: deleteRecordRemote
  };
})(window);