/* ============================================================================
   CAM — Mode autonome (sans backend)
   ----------------------------------------------------------------------------
   Intercepte tous les appels fetch('/api/...') et les sert depuis localStorage.
   Aucun serveur, aucun réseau : l'application fonctionne en file://.
   Pour revenir au mode serveur : supprimer ce <script> des pages HTML.
   ========================================================================== */
(function () {
  'use strict';

  var DB_KEY   = 'cam_local_db_v2';
  var ADM_KEY  = 'cam_local_admin_session';
  var MB_KEY   = 'cam_local_member_session';

  /* ---------- stockage (localStorage + repli window.name pour file://) ------ */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
    try {
      var bag = {};
      try { bag = JSON.parse(window.name || '{}'); } catch (e) {}
      bag[k] = v;
      window.name = JSON.stringify(bag);
    } catch (e) {}
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
    try {
      var bag = {};
      try { bag = JSON.parse(window.name || '{}'); } catch (e) {}
      delete bag[k];
      window.name = JSON.stringify(bag);
    } catch (e) {}
  }
  function readKey(k) {
    var v = lsGet(k);
    if (v) return v;
    try {
      var bag = JSON.parse(window.name || '{}');
      return bag[k] || null;
    } catch (e) { return null; }
  }

  /* ---------- base locale ------------------------------------------------- */
  function defaults() {
    return {
      users: [{
        id: 'u-admin',
        username: 'admin',
        identifiant: 'admin',
        password: '1f2ca8e43c30aecf74dcfa1171b47217',
        role: 'admin_general',
        department: '',
        statut: 'actif',
        active: true
      }],
      members: [],
      memberAccounts: [],
      events: [],
      registrations: [],
      attendance: [],
      messages: [],
      membership_requests: [],
      contributions: [],
      settings: {}
    };
  }

  function loadDB() {
    var raw = readKey(DB_KEY);
    if (!raw) { var d = defaults(); saveDB(d); return d; }
    try {
      var db = JSON.parse(raw);
      ['users','members','memberAccounts','events','registrations',
       'attendance','messages','membership_requests','contributions'].forEach(function (k) {
        if (!Array.isArray(db[k])) db[k] = [];
      });
      if (!db.settings) db.settings = {};
      return db;
    } catch (e) {
      var d2 = defaults(); saveDB(d2); return d2;
    }
  }
  function saveDB(db) { lsSet(DB_KEY, JSON.stringify(db || loadDB())); }

  var db = loadDB();

  /* ---------- utilitaires ------------------------------------------------- */
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 8);
  }
  function now() { return new Date().toISOString(); }
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  function empty(status) { return new Response(null, { status: status || 204 }); }
  function err(message, status) { return json({ message: message }, status || 400); }
  function bodyOf(opt) {
    try { return opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { return {}; }
  }
  function normalize(u) {
    var s = String(u || '');
    var i = s.indexOf('/api/');
    if (i >= 0) s = s.slice(i);
    return s.split('?')[0];
  }
  function adminSession() {
    try { return JSON.parse(readKey(ADM_KEY) || 'null'); } catch (e) { return null; }
  }
  function memberSession() {
    try { return JSON.parse(readKey(MB_KEY) || 'null'); } catch (e) { return null; }
  }
  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id, username: u.username || u.identifiant, identifiant: u.identifiant || u.username,
      nom: u.nom || u.username, role: u.role, department: u.department || '',
      statut: u.statut || 'actif', active: u.active !== false
    };
  }
  function publicMember(m, account) {
    if (!m) return null;
    return {
      id: m.id, memberId: m.memberId || m.id,
      username: m.username || (account && account.username) || '',
      prenom: m.prenom || '', nom: m.nom || '',
      tel: m.tel || '', email: m.email || '', statut: m.statut || 'actif'
    };
  }

  /* ---------- routeur ----------------------------------------------------- */
  function route(path, method, body) {
    var p = path.replace(/\/+$/, '') || '/';

    /* --- santé / session admin --- */
    if (p === '/api/health' && method === 'GET') {
      return json({ status: 'ok', ok: true, mode: 'local' });
    }
    if (p === '/api/auth/me' && method === 'GET') {
      var s = adminSession();
      var u = s ? db.users.find(function (x) { return x.id === s.id && x.active !== false; }) : null;
      return json({ user: publicUser(u) });
    }
    if (p === '/api/auth/login' && method === 'POST') {
      var found = db.users.find(function (x) {
        return String(x.username || x.identifiant || '').toLowerCase() === String(body.username || '').toLowerCase();
      });
      if (!found || String(found.password) !== String(body.password || '')) {
        return err('Identifiant ou mot de passe incorrect.', 401);
      }
      if (found.active === false) return err('Ce compte est désactivé.', 403);
      lsSet(ADM_KEY, JSON.stringify({ id: found.id, at: now() }));
      return json({ ok: true, user: publicUser(found), user_id: found.id });
    }
    if (p === '/api/auth/logout' && method === 'POST') {
      lsDel(ADM_KEY); return empty();
    }
    if (p === '/api/auth/change-password' && method === 'POST') {
      var cs = adminSession();
      var cu = cs ? db.users.find(function (x) { return x.id === cs.id; }) : null;
      if (!cu) return err('Session introuvable.', 401);
      if (String(cu.password) !== String(body.currentPassword || '')) return err('Mot de passe actuel incorrect.', 400);
      if (String(body.newPassword || '').length < 12) return err('12 caractères minimum.', 400);
      cu.password = String(body.newPassword); saveDB(db);
      return json({ message: 'Mot de passe modifié.' });
    }

    /* --- session membre --- */
    if (p === '/api/member/auth/register' && method === 'POST') {
      var username = String(body.username || '').trim();
      if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) return err('Identifiant invalide.', 400);
      if (String(body.password || '').length < 12) return err('Le mot de passe doit contenir au moins 12 caractères.', 400);
      if (db.memberAccounts.some(function (a) { return a.username.toLowerCase() === username.toLowerCase(); })) {
        return err('Cet identifiant existe déjà.', 409);
      }
      var mid = uid('m'), aid = uid('a');
      db.members.push({
        id: mid, memberId: mid, username: username,
        prenom: body.prenom || '', nom: body.nom || '',
        tel: body.tel || '', email: body.email || '', statut: 'actif', createdAt: now()
      });
      db.memberAccounts.push({
        id: aid, memberId: mid, username: username,
        password: String(body.password), createdAt: now()
      });
      saveDB(db);
      lsSet(MB_KEY, JSON.stringify({ id: aid, memberId: mid, at: now() }));
      var newM = db.members[db.members.length - 1];
      return json({ member: publicMember(newM) });
    }
    if (p === '/api/member/auth/login' && method === 'POST') {
      var acc = db.memberAccounts.find(function (a) {
        return a.username.toLowerCase() === String(body.username || '').toLowerCase() &&
               String(a.password) === String(body.password || '');
      });
      if (!acc) return err('Identifiant ou mot de passe incorrect.', 401);
      var mm = db.members.find(function (m) { return m.memberId === acc.memberId || m.id === acc.memberId; });
      if (!mm) return err('Compte membre introuvable.', 404);
      lsSet(MB_KEY, JSON.stringify({ id: acc.id, memberId: acc.memberId, at: now() }));
      return json({ member: publicMember(mm, acc) });
    }
    if (p === '/api/member/auth/me' && method === 'GET') {
      var ms = memberSession();
      if (!ms) return json({ member: null });
      var acc2 = db.memberAccounts.find(function (a) { return a.id === ms.id; });
      var mem2 = db.members.find(function (m) { return m.memberId === ms.memberId || m.id === ms.memberId; });
      return json({ member: mem2 ? publicMember(mem2, acc2) : null });
    }
    if (p === '/api/member/auth/logout' && method === 'POST') {
      lsDel(MB_KEY); return empty();
    }

    /* --- données publiques --- */
    if (p === '/api/public/bootstrap' && method === 'GET') {
      return json({ events: db.events, members: db.members, ok: true });
    }
    if (p === '/api/public/membership-requests' && method === 'POST') {
      var req = Object.assign({ id: uid('req'), createdAt: now(), status: 'en_attente' }, body);
      db.membership_requests.push(req); saveDB(db);
      return json({ ok: true, request: req });
    }
    if (p.indexOf('/api/public/attendance') === 0 && method === 'POST') {
      var att = Object.assign({ id: uid('att'), createdAt: now() }, body);
      db.attendance.push(att); saveDB(db);
      return json({ ok: true, attendance: att });
    }
    if (p === '/api/contributions' && method === 'POST') {
      var c = Object.assign({ id: uid('don'), createdAt: now() }, body);
      db.contributions.push(c); saveDB(db);
      return json({ ok: true, contribution: c });
    }

    /* --- données admin (listes) --- */
    var lists = {
      '/api/admin/users': 'users',
      '/api/admin/members': 'members',
      '/api/admin/events': 'events',
      '/api/admin/attendance': 'attendance',
      '/api/admin/registrations': 'registrations',
      '/api/admin/membership-requests': 'membership_requests',
      '/api/admin/messages': 'messages'
    };
    if (lists[p] && method === 'GET') {
      var key = lists[p];
      var out = {};
      out[key] = db[key];
      out[key.replace(/s$/, '')] = db[key][0] || null;
      out.ok = true;
      return json(out);
    }

    /* --- données membre (listes / écriture) --- */
    if (p === '/api/member/registrations') {
      if (method === 'GET') return json({ registrations: db.registrations, ok: true });
      if (method === 'POST') {
        var r = Object.assign({ id: uid('reg'), createdAt: now() }, body);
        db.registrations.push(r); saveDB(db);
        return json({ ok: true, registration: r });
      }
    }
    if (p === '/api/member/messages') {
      if (method === 'GET') return json({ messages: db.messages, ok: true });
      if (method === 'POST') {
        var m3 = Object.assign({ id: uid('msg'), createdAt: now(), read: false }, body);
        db.messages.push(m3); saveDB(db);
        return json({ ok: true, message: m3 });
      }
    }
    if (p.indexOf('/api/member/messages/') === 0 && method === 'PATCH') {
      var mid2 = p.split('/').pop();
      var msg = db.messages.find(function (x) { return x.id === mid2; });
      if (msg) { Object.assign(msg, body); saveDB(db); }
      return json({ ok: true, message: msg });
    }
    if (p.indexOf('/api/admin/messages/') === 0 && method === 'PATCH') {
      var mid3 = p.split('/').filter(Boolean).pop();
      var msg2 = db.messages.find(function (x) { return x.id === mid3; });
      if (msg2) { Object.assign(msg2, body); saveDB(db); }
      return json({ ok: true, message: msg2 });
    }

    /* --- CRUD générique events / members / users / registrations --- */
    var coll = null;
    if (p.indexOf('/api/admin/events') === 0) coll = 'events';
    else if (p.indexOf('/api/admin/members') === 0) coll = 'members';
    else if (p.indexOf('/api/admin/users') === 0) coll = 'users';
    else if (p.indexOf('/api/admin/registrations') === 0) coll = 'registrations';
    else if (p.indexOf('/api/admin/membership-requests') === 0) coll = 'membership_requests';
    else if (p.indexOf('/api/admin/attendance') === 0) coll = 'attendance';

    if (coll) {
      var parts = p.split('/').filter(Boolean);
      var id = parts.length >= 4 ? decodeURIComponent(parts[3]) : null;
      var tail = parts.length >= 5 ? parts[4] : null;

      if (method === 'GET' && !id) return json({}); // déjà géré ci-dessus
      if (method === 'POST' && !id) {
        var o = Object.assign({ id: uid(coll.slice(0, 2)), createdAt: now() }, body);
        db[coll].push(o); saveDB(db);
        var sing = coll.replace(/s$/, '');
        var resp = { ok: true, id: o.id };
        resp[sing] = o; resp[coll] = [o];
        return json(resp);
      }
      var idx = db[coll].findIndex(function (x) {
        return x.id === id || x.username === id || x.identifiant === id;
      });
      if (idx < 0) return err('Élément introuvable.', 404);
      if (method === 'PATCH') {
        if (tail === 'activation' || tail === 'department') {
          Object.assign(db[coll][idx], body);
        } else {
          Object.assign(db[coll][idx], body);
        }
        saveDB(db);
        return json({ ok: true, item: db[coll][idx] });
      }
      if (method === 'DELETE') {
        var removed = db[coll].splice(idx, 1)[0]; saveDB(db);
        return json({ ok: true, item: removed });
      }
      if (method === 'GET') return json(db[coll][idx]);
    }

    if (p.indexOf('/notify') >= 0 && method === 'POST') return json({ ok: true, notified: true });

    /* --- rattrapage générique : action locale sans effet de bord --- */
    if (method === 'GET') return json({ ok: true, items: [] });
    return json({ ok: true });
  }

  /* ---------- interception de fetch --------------------------------------- */
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
    if (String(url).indexOf('/api/') !== -1) {
      var opt = init || {};
      var method = (opt.method || 'GET').toUpperCase();
      var b = bodyOf(opt);
      try {
        return Promise.resolve(route(normalize(url), method, b));
      } catch (e) {
        return Promise.resolve(err('Erreur locale : ' + e.message, 500));
      }
    }
    if (nativeFetch) return nativeFetch(input, init);
    return Promise.reject(new Error('fetch indisponible'));
  };

  /* ---------- API publique de debug --------------------------------------- */
  window.CAM_LOCAL = {
    enabled: true,
    get db() { return loadDB(); },
    save: function () { saveDB(db); },
    reset: function () { lsDel(DB_KEY); lsDel(ADM_KEY); lsDel(MB_KEY); db = loadDB(); return true; },
    loginAdmin: function (u, pw) {
      return route('/api/auth/login', 'POST', { username: u, password: pw });
    }
  };
})();
