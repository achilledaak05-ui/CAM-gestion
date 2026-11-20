(function (global) {
  'use strict';

  const STATUTS = ['present', 'late', 'absent', 'excused'];
  const FILTER_STATUTS = [...STATUTS, 'registered'];
  const MOTIFS = ['Maladie', 'Voyage', 'Raisons professionnelles', 'Raisons familiales', 'Indisponibilité personnelle', 'Autres'];
  const LABELS = { present: 'Présent', late: 'En retard', absent: 'Absent', excused: 'Absence justifiée', registered: 'Inscrit' };
  let eventId = '', section = 'Vue d’ensemble', query = '', filterEvent = '', filterDepartment = '', filterStatus = '';
  let fromDate = '', toDate = '', page = 1, pageSize = 25, sortBy = 'date', sortDirection = 'desc';
  let memberQuery = '', memberDepartment = '', selectedMembers = new Set();
  let apiError = '';

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const normalize = value => String(value == null ? '' : value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const localToday = () => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0');
  };
  const events = () => (S.evt || []).filter(event =>
    event.id && event.active !== false && (!event.details || event.details.statut !== 'Annulé'));
  const activeMembers = () => (S.members || []).filter(member => member.statut === 'Membre');
  const eventFor = row => events().find(event => event.id === row.eventId);
  const rows = () => Array.isArray(SERVER_ATTENDANCE) ? SERVER_ATTENDANCE : [];
  const departmentOf = member => nm('depts', member.dept) === '—' ? '' : nm('depts', member.dept);
  const memberById = id => (S.members || []).find(member => member.id === id);
  const arrivalTime = row => {
    if (!row.presentAt) return '';
    const date = new Date(row.presentAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const lateMinutes = row => {
    const event = eventFor(row), planned = row.eventTime || (event && (event.details || {}).heureDebut) || '';
    if (!planned || !row.presentAt) return 0;
    const actual = new Date(row.presentAt);
    if (Number.isNaN(actual.getTime())) return 0;
    const [hour, minute] = planned.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    return Math.max(0, actual.getHours() * 60 + actual.getMinutes() - hour * 60 - minute);
  };
  const statusOf = row => {
    const status = row.attendanceStatus || (row.presentAt ? 'present' : 'absent');
    if (status === 'registered') return row.presentAt ? 'present' : (row.date > localToday() ? 'registered' : (row.absenceJustified ? 'excused' : 'absent'));
    if (status === 'present' && lateMinutes(row) > 0) return 'late';
    return STATUTS.includes(status) ? status : (row.presentAt ? 'present' : 'absent');
  };
  const statusTag = row => {
    const status = statusOf(row), cls = status === 'present' ? 'g' : (status === 'late' || status === 'excused' ? 'w' : '');
    return `<span class="tag ${cls}">${LABELS[status]}</span>`;
  };
  const eventSelect = (selected, id, label, handler = 'selectEvent') => `<label for="${id}">${label}</label><select id="${id}" onchange="CAMAttendance.${handler}(this.value)"><option value="">Toutes les séances</option>${events().map(event =>
    `<option value="${escape(event.id)}"${event.id === selected ? ' selected' : ''}>${escape(event.titre)} · ${fd(event.date)}</option>`
  ).join('')}</select>`;
  const departments = () => {
    const userDepartment = SESSION && SESSION.role === 'responsable' ? SESSION.department : '';
    return (S.depts || []).map(department => department.nom)
      .filter(name => !userDepartment || name === userDepartment);
  };

  function api(path, body, method) {
    return fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(response => response.text().then(text => {
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) {}
      if (!response.ok) throw new Error(data.message || `Erreur ${response.status}`);
      return data;
    }));
  }

  function refresh() {
    api('/api/admin/attendance').then(data => {
      SERVER_ATTENDANCE = data.attendance || [];
      apiError = '';
      global.render();
    }).catch(error => {
      apiError = error.message || 'Impossible de charger les présences.';
      global.render();
    });
  }

  function defaultEvent() {
    if (eventId && events().some(event => event.id === eventId)) return;
    const today = localToday();
    eventId = (events().find(event => event.date === today)
      || events().find(event => event.date >= today) || events()[0] || {}).id || '';
  }

  function stats() {
    const today = localToday(), todayRows = rows().filter(row => row.date === today);
    const sessionsToday = events().filter(event => event.date === today);
    const now = new Date();
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const presentToday = new Set(todayRows.filter(row => row.category === 'Membre'
      && ['present', 'late'].includes(statusOf(row))).map(row => row.memberId)).size;
    const total = activeMembers().length;
    const month = today.slice(0, 7);
    return {
      members: total, present: presentToday, absent: sessionsToday.length ? Math.max(0, total - presentToday) : 0,
      late: todayRows.filter(row => row.category === 'Membre' && statusOf(row) === 'late').length,
      visitors: todayRows.filter(row => row.category === 'Invité(e)' && ['present', 'late'].includes(statusOf(row))).length,
      rate: total && sessionsToday.length ? Math.round(presentToday / total * 100) : 0,
      sessions: events().filter(event => event.date < today
        || (event.date === today && ((event.details || {}).statut === 'Terminé'
          || ((event.details || {}).heureFin || '') <= currentTime && !!(event.details || {}).heureFin))).length,
      month: rows().filter(row => String(row.date || '').startsWith(month)
        && ['present', 'late'].includes(statusOf(row))).length
    };
  }

  function chart(items, title) {
    const max = Math.max(1, ...items.map(item => item.count));
    return `<div class="card att-chart"><h3>${title}</h3>${items.map(item =>
      `<div class="att-chart-row"><span>${escape(item.label)}</span><div><i style="width:${Math.round(item.count / max * 100)}%"></i></div><b>${item.count}</b></div>`
    ).join('') || '<p class="empty">Pas encore de données.</p>'}</div>`;
  }

  function overview() {
    const k = stats(), today = localToday();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() - (6 - index));
      const iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      return { label: date.toLocaleDateString('fr-FR', { weekday: 'short' }), count: rows().filter(row => row.date === iso && ['present', 'late'].includes(statusOf(row))).length };
    });
    const alerts = new Map();
    rows().filter(row => row.category === 'Membre' && statusOf(row) === 'absent' && row.date <= today)
      .forEach(row => alerts.set(row.memberId, (alerts.get(row.memberId) || 0) + 1));
    const repeated = [...alerts.entries()].filter(([, count]) => count >= 3).length;
    return `<div class="grid att-kpis">
      ${[['Membres actifs', k.members], ['Présents aujourd’hui', k.present], ['Absents aujourd’hui', k.absent],
        ['En retard aujourd’hui', k.late], ['Visiteurs aujourd’hui', k.visitors], ['Taux de présence', k.rate + '%'],
        ['Séances organisées', k.sessions], ['Présences ce mois', k.month]].map(([label, value]) =>
        `<div class="card stat"><b>${value}</b><span>${label}</span></div>`).join('')}
    </div>
    ${repeated ? `<div class="card att-alert" role="status">${repeated} membre(s) ont au moins trois absences enregistrées. Consultez l’onglet Absences.</div>` : ''}
    <div class="two">${chart(days, 'Présences enregistrées — 7 derniers jours')}
      <div class="card"><h3>Accès rapide</h3>${events().length ? `<p class="sub">Séance sélectionnée : ${escape((events().find(event => event.id === eventId) || {}).titre || '—')}</p>` : '<p class="sub">Créez une séance dans Événements pour commencer.</p>'}
        <div class="bar"><button class="btn" onclick="CAMAttendance.setSection('Pointage')">✅ Enregistrer des présences</button><button class="btn alt" onclick="CAMAttendance.setSection('Historique')">Voir l’historique</button></div>
      </div>
    </div>`;
  }

  function sessionOptions() {
    const event = events().find(item => item.id === eventId);
    const eventDepartment = event && event.details ? event.details.departement || '' : '';
    const available = activeMembers().filter(member => !eventDepartment || departmentOf(member) === eventDepartment);
    return available;
  }

  function memberPicker() {
    const list = sessionOptions().filter(member => {
      const name = normalize(member.nom + ' ' + (member.mat || '') + ' ' + departmentOf(member));
      return name.includes(normalize(memberQuery))
        && (!memberDepartment || departmentOf(member) === memberDepartment);
    });
    return `<div class="card"><h3>Appel collectif</h3>
      <p class="sub">Cochez les personnes présentes. À la validation, les autres membres actifs du périmètre seront enregistrés absents.</p>
      <div class="bar"><input type="search" id="att-member-q" placeholder="Nom, prénoms ou matricule" value="${escape(memberQuery)}" oninput="CAMAttendance.searchMembers(this.value)">
        <select onchange="CAMAttendance.setMemberDepartment(this.value)" aria-label="Département"><option value="">Tous les départements</option>${departments().map(name => `<option${name === memberDepartment ? ' selected' : ''}>${escape(name)}</option>`).join('')}</select>
        <button class="btn alt" onclick="CAMAttendance.toggleVisible()">${list.every(member => selectedMembers.has(member.id)) && list.length ? 'Désélectionner la liste' : 'Sélectionner la liste'}</button>
      </div>
      <div class="tw"><table><thead><tr><th>Présent</th><th>Matricule</th><th>Membre</th><th>Département</th><th>Pointage individuel</th></tr></thead><tbody>${list.map(member =>
        `<tr><td><input type="checkbox" aria-label="Présence de ${escape(member.nom)}" ${selectedMembers.has(member.id) ? 'checked' : ''} onchange="CAMAttendance.toggleMember('${escape(member.id)}',this.checked)"></td>
          <td>${escape(member.mat || '—')}</td><td><b>${escape(member.nom)}</b></td><td>${escape(departmentOf(member) || '—')}</td>
          <td><select id="att-individual-${escape(member.id)}" aria-label="Statut ${escape(member.nom)}">${STATUTS.map(status => `<option value="${status}">${LABELS[status]}</option>`).join('')}</select>
            <button class="ed" onclick="CAMAttendance.markMember('${escape(member.id)}',document.getElementById('att-individual-${escape(member.id)}').value)">Enregistrer</button></td></tr>`
      ).join('') || '<tr><td colspan="5"><div class="empty">Aucun membre actif dans ce périmètre.</div></td></tr>'}</tbody></table></div>
      <div class="bar"><button class="btn" onclick="CAMAttendance.saveBulk()">Enregistrer l’appel (${selectedMembers.size} présent(s))</button>
        <small>Les membres non cochés seront considérés absents pour cette séance.</small></div>
    </div>`;
  }

  function visitorForm() {
    return `<div class="card"><h3>Enregistrer un visiteur</h3><div class="ev-form">
      <div><label for="att-guest-last">Nom</label><input id="att-guest-last" required></div>
      <div><label for="att-guest-first">Prénoms</label><input id="att-guest-first" required></div>
      <div><label for="att-guest-phone">Téléphone</label><input id="att-guest-phone" type="tel" required></div>
      <div><label for="att-guest-email">E-mail (facultatif)</label><input id="att-guest-email" type="email"></div>
      <div><label for="att-guest-sex">Sexe (facultatif)</label><select id="att-guest-sex"><option value="">Non communiqué</option><option>Femme</option><option>Homme</option><option>Autre</option></select></div>
      <div><label for="att-guest-host">Accueilli(e) par</label><input id="att-guest-host"></div>
    </div><div class="bar" style="margin-top:10px"><button class="btn" onclick="CAMAttendance.addVisitor()">Enregistrer le visiteur</button></div></div>`;
  }

  function attendanceEntry() {
    if (!eventId) return `<div class="card"><p class="empty">Créez ou sélectionnez une séance avant d’enregistrer des présences.</p></div>`;
    const event = events().find(item => item.id === eventId);
    const scoped = event && event.details ? event.details.departement : '';
    return `<div class="card att-session">
      ${eventSelect(eventId, 'att-entry-event', 'Séance')}
      <p class="sub">${escape(event ? event.details && event.details.description || '' : '')}</p>
      ${scoped ? `<p class="tag">${escape(scoped)}</p>` : ''}
    </div>${memberPicker()}${visitorForm()}`;
  }

  function filteredRows() {
    return rows().filter(row => {
      const text = normalize([row.nom, row.prenoms, row.memberName, row.memberId, row.eventName, row.department, row.telephone].join(' '));
      return (!query || text.includes(normalize(query)))
        && (!filterEvent || row.eventId === filterEvent)
        && (!filterDepartment || row.department === filterDepartment)
        && (!filterStatus || statusOf(row) === filterStatus)
        && (!fromDate || row.date >= fromDate)
        && (!toDate || row.date <= toDate);
    }).sort((a, b) => {
      const left = sortBy === 'name' ? normalize(a.memberName) : sortBy === 'status' ? statusOf(a) : String(a[sortBy] || '');
      const right = sortBy === 'name' ? normalize(b.memberName) : sortBy === 'status' ? statusOf(b) : String(b[sortBy] || '');
      return left.localeCompare(right) * (sortDirection === 'asc' ? 1 : -1);
    });
  }

  function avatar(row) {
    const member = memberById(row.memberId);
    if (member && member.photo) return `<img class="att-avatar" src="${escape(member.photo)}" alt="">`;
    const initials = String(row.memberName || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    return `<span class="att-avatar" aria-hidden="true">${escape(initials || '?')}</span>`;
  }

  function history() {
    const filtered = filteredRows(), pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages);
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    return `<div class="card">
      <div class="bar att-filters"><input type="search" id="att-q" placeholder="Recherche rapide" value="${escape(query)}" oninput="CAMAttendance.search(this.value)">
        ${eventSelect(filterEvent, 'att-filter-event', 'Séance', 'setFilterEvent')}
        <label for="att-filter-from">Du</label><input id="att-filter-from" type="date" value="${fromDate}" onchange="CAMAttendance.setDate('from',this.value)">
        <label for="att-filter-to">Au</label><input id="att-filter-to" type="date" value="${toDate}" onchange="CAMAttendance.setDate('to',this.value)">
        <select aria-label="Département" onchange="CAMAttendance.setDepartment(this.value)"><option value="">Tous les départements</option>${departments().map(name => `<option${name === filterDepartment ? ' selected' : ''}>${escape(name)}</option>`).join('')}</select>
        <select aria-label="Statut" onchange="CAMAttendance.setStatus(this.value)"><option value="">Tous les statuts</option>${FILTER_STATUTS.map(status => `<option value="${status}"${status === filterStatus ? ' selected' : ''}>${LABELS[status]}</option>`).join('')}</select>
        <button class="btn alt" onclick="CAMAttendance.exportCsv()">Excel / CSV</button><button class="btn alt" onclick="CAMAttendance.exportPdf()">PDF / Imprimer</button>
      </div>
      ${apiError ? `<p class="att-alert" role="alert">${escape(apiError)}</p>` : ''}
      <div class="tw"><table><thead><tr>
        ${[['id','N° enregistrement'],['matricule','Matricule'],['photo','Photo'],['name','Nom et prénoms'],['department','Département'],['eventName','Séance'],['date','Date'],['presentAt','Heure'],['status','Statut'],['method','Méthode'],['recordedBy','Responsable'],['actions','Actions']].map(([key,label]) =>
          `<th>${key === 'photo' || key === 'actions' ? label : `<button class="att-sort" onclick="CAMAttendance.sort('${key}')">${label}${sortBy === (key === 'name' ? 'name' : key) ? sortDirection === 'asc' ? ' ▲' : ' ▼' : ''}</button>`}</th>`
        ).join('')}
      </tr></thead><tbody>${visible.map(row =>
        `<tr><td>${escape(String(row.id || '').slice(0, 8))}</td>        <td>${escape((memberById(row.memberId) || {}).mat || row.matricule || row.memberId || '—')}</td>
        <td>${avatar(row)}</td><td><b>${escape(row.memberName || '—')}</b></td><td>${escape(row.department || '—')}</td>
        <td>${escape(row.eventName || '—')}</td><td>${fd(row.date)}</td><td>${statusOf(row) === 'absent' || statusOf(row) === 'excused' ? '—' : escape(arrivalTime(row) || '—')}</td>
        <td>${statusTag(row)}${statusOf(row) === 'late' && lateMinutes(row) ? `<small> +${lateMinutes(row)} min</small>` : ''}</td>
        <td>${escape(methodName(row.method))}</td><td>${escape(row.recordedBy || '—')}</td>
        <td><button class="ed" onclick="CAMAttendance.edit('${escape(row.id)}')">Modifier</button></td></tr>`
      ).join('') || '<tr><td colspan="12"><div class="empty">Aucun résultat pour ces filtres.</div></td></tr>'}</tbody></table></div>
      <div class="bar att-pagination"><span>${filtered.length} résultat(s) · Page ${page}/${pages}</span>
        <label for="att-page-size">Lignes</label><select id="att-page-size" onchange="CAMAttendance.setPageSize(this.value)">${[10, 25, 50, 100].map(size => `<option${size === pageSize ? ' selected' : ''}>${size}</option>`).join('')}</select>
        <button class="btn alt" ${page <= 1 ? 'disabled' : ''} onclick="CAMAttendance.setPage(${page - 1})">Précédent</button><button class="btn alt" ${page >= pages ? 'disabled' : ''} onclick="CAMAttendance.setPage(${page + 1})">Suivant</button>
      </div>
    </div>`;
  }

  function methodName(method) {
    return ({ manual: 'Manuel', qr: 'QR', member: 'Compte membre', scanner: 'Badge', registration: 'Inscription', visitor: 'Formulaire visiteur' })[method] || method || '—';
  }

  function absenceSection() {
    const absentRows = rows().filter(row => row.date <= localToday()
      && ['absent', 'excused'].includes(statusOf(row)));
    const totals = new Map();
    absentRows.forEach(row => totals.set(row.memberId, (totals.get(row.memberId) || 0) + 1));
    const repeated = [...totals.entries()].filter(([, count]) => count >= 3);
    return `<div class="grid att-kpis"><div class="card stat"><b>${absentRows.length}</b><span>Absences enregistrées</span></div><div class="card stat"><b>${repeated.length}</b><span>Membres avec 3 absences ou plus</span></div></div>
      ${repeated.length ? `<div class="card"><h3>Absences répétitives</h3>${repeated.map(([id, count]) => `<p>${escape((memberById(id) || {}).nom || id)} — ${count} absence(s)</p>`).join('')}</div>` : ''}
      <div class="card"><h3>Motifs et historique des absences</h3>${historyTable(absentRows)}</div>`;
  }

  function lateSection() {
    const lateRows = rows().filter(row => statusOf(row) === 'late');
    const byDepartment = new Map();
    lateRows.forEach(row => byDepartment.set(row.department || 'Sans département', (byDepartment.get(row.department || 'Sans département') || 0) + 1));
    return `<div class="grid att-kpis"><div class="card stat"><b>${lateRows.length}</b><span>Retards enregistrés</span></div><div class="card stat"><b>${lateRows.reduce((sum, row) => sum + lateMinutes(row), 0)}</b><span>Minutes de retard cumulées</span></div></div>
      <div class="card"><h3>Retards par département</h3>${[...byDepartment.entries()].map(([name, count]) => `<p>${escape(name)} — ${count}</p>`).join('') || '<p class="empty">Aucun retard enregistré.</p>'}</div>
      <div class="card"><h3>Historique des retards</h3>${historyTable(lateRows)}</div>`;
  }

  function historyTable(data) {
    return `<div class="tw"><table><thead><tr><th>Membre</th><th>Séance</th><th>Date</th><th>Heure</th><th>Motif / observation</th><th>Statut</th><th></th></tr></thead><tbody>${data.map(row =>
      `<tr><td>${escape(row.memberName || '—')}</td><td>${escape(row.eventName || '—')}</td><td>${fd(row.date)}</td>
        <td>${escape(arrivalTime(row) || '—')}</td><td>${escape([row.absenceReason, row.comments].filter(Boolean).join(' · ') || '—')}</td>
        <td>${statusTag(row)}</td><td><button class="ed" onclick="CAMAttendance.edit('${escape(row.id)}')">Modifier</button></td></tr>`
    ).join('') || '<tr><td colspan="7"><div class="empty">Aucun enregistrement.</div></td></tr>'}</tbody></table></div>`;
  }

  function visitors() {
    const guests = rows().filter(row => row.category === 'Invité(e)');
    const groups = new Map();
    guests.forEach(row => {
      const key = String(row.telephone || '').replace(/\D/g, '') || normalize(row.memberName);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return `<div class="card"><h3>Suivi des visiteurs</h3><p class="sub">Les visites sont rapprochées par numéro de téléphone. L’intégration comme membre reste manuelle.</p>
      <div class="tw"><table><thead><tr><th>Nom et prénoms</th><th>Téléphone</th><th>Première visite</th><th>Dernière visite</th><th>Visites</th><th>Accueilli par</th><th>Historique</th></tr></thead><tbody>${[...groups.values()].map(visits => {
        visits.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const first = visits[0], last = visits[visits.length - 1];
        return `<tr><td><b>${escape(first.memberName || '—')}</b><div class="ev-vide">${visits.length >= 3 ? 'Visiteur régulier' : 'Nouveau visiteur'}</div></td><td>${escape(first.telephone || '—')}</td><td>${fd(first.date)}</td><td>${fd(last.date)}</td><td>${visits.length}</td><td>${escape(last.welcomedBy || '—')}</td><td><details><summary>Voir</summary>${visits.map(visit => `<p>${fd(visit.date)} · ${escape(visit.eventName || '')} · ${escape(visit.welcomedBy || '—')}</p>`).join('')}</details></td></tr>`;
      }).join('') || '<tr><td colspan="7"><div class="empty">Aucun visiteur enregistré.</div></td></tr>'}</tbody></table></div></div>`;
  }

  function sessions() {
    return `<div class="card"><h3>Séances et événements</h3><p class="sub">Les séances utilisent les fiches du module Événements. Configurez la date, les heures, le lieu et le département dans cette fiche.</p>
      ${can('edit') ? '<button class="btn" onclick="ouvrirEvenement()">+ Créer une séance</button>' : ''}
      <div class="tw" style="margin-top:12px"><table><thead><tr><th>Séance</th><th>Catégorie</th><th>Date</th><th>Début</th><th>Fin</th><th>Lieu</th><th>Responsable</th><th>Département</th><th>Attendus</th><th>Présents</th><th>Absents</th><th>Statut</th><th></th></tr></thead><tbody>${events().map(event => {
        const details = event.details || {}, sessionRows = rows().filter(row => row.eventId === event.id);
        const present = sessionRows.filter(row => ['present', 'late'].includes(statusOf(row))).length;
        const absent = sessionRows.filter(row => ['absent', 'excused'].includes(statusOf(row))).length;
        return `<tr><td>${escape(event.titre)}</td><td>${escape(details.categorie || event.type || '—')}</td><td>${fd(event.date)}</td>
          <td>${escape(details.heureDebut || event.heure || '—')}</td><td>${escape(details.heureFin || '—')}</td><td>${escape(details.lieu || event.lieu || '—')}</td>
          <td>${escape(details.responsable || details.organisateur || '—')}</td><td>${escape(details.departement || 'Tous')}</td><td>${escape(details.participantsAttendus || '—')}</td><td>${present}</td><td>${absent}</td>
          <td>${escape(details.statut || 'Programmé')}</td><td><button class="ed" onclick="CAMAttendance.selectEvent('${escape(event.id)}');CAMAttendance.setSection('Pointage')">Ouvrir</button>${can('edit') ? `<button class="ed" onclick="ouvrirEvenement('${escape(event.id)}')">Modifier</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="13"><div class="empty">Aucune séance créée.</div></td></tr>'}</tbody></table></div></div>`;
  }

  function reports() {
    const eventsMap = new Map();
    const activeByDepartment = new Map();
    const presentByDepartment = new Map();
    const diligent = new Map();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setMonth(monthStart.getMonth() - 11);
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(monthStart); date.setMonth(monthStart.getMonth() + index);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      return { label: date.toLocaleDateString('fr-FR', { month: 'short' }), count: rows().filter(row =>
        String(row.date || '').startsWith(key) && ['present', 'late'].includes(statusOf(row))).length };
    });
    activeMembers().forEach(member => {
      const department = departmentOf(member) || 'Sans département';
      activeByDepartment.set(department, (activeByDepartment.get(department) || 0) + 1);
    });
    rows().filter(row => ['present', 'late'].includes(statusOf(row))).forEach(row => {
      eventsMap.set(row.eventName || 'Séance inconnue', (eventsMap.get(row.eventName || 'Séance inconnue') || 0) + 1);
      if (row.category === 'Membre') diligent.set(row.memberId, (diligent.get(row.memberId) || 0) + 1);
    });
    activeMembers().forEach(member => {
      const department = departmentOf(member) || 'Sans département';
      const present = rows().some(row => row.memberId === member.id && row.date === localToday()
        && ['present', 'late'].includes(statusOf(row)));
      if (present) presentByDepartment.set(department, (presentByDepartment.get(department) || 0) + 1);
    });
    const departmentRows = [...activeByDepartment.entries()].map(([name, count]) => {
      const present = presentByDepartment.get(name) || 0;
      return `<tr><td>${escape(name)}</td><td>${count}</td><td>${present}</td><td>${Math.max(0, count - present)}</td><td>${count ? Math.round(present / count * 100) : 0}%</td></tr>`;
    }).join('');
    const diligentRows = [...diligent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, count]) => `<tr><td>${escape((memberById(id) || {}).nom || id)}</td><td>${count}</td></tr>`).join('');
    return `${chart(monthly, 'Évolution mensuelle — 12 derniers mois')}
      <div class="card"><h3>Participation par département aujourd’hui</h3><div class="tw"><table><thead><tr><th>Département</th><th>Effectif</th><th>Présents</th><th>Absents</th><th>Taux</th></tr></thead><tbody>${departmentRows || '<tr><td colspan="5"><div class="empty">Aucun département renseigné.</div></td></tr>'}</tbody></table></div></div>
      <div class="grid att-kpis"><div class="card"><h3>Présences par séance</h3>${[...eventsMap.entries()].map(([name, count]) => `<p>${escape(name)} — ${count}</p>`).join('') || '<p class="empty">Pas encore de données.</p>'}</div>
      <div class="card"><h3>Membres les plus assidus</h3><div class="tw"><table><thead><tr><th>Membre</th><th>Présences</th></tr></thead><tbody>${diligentRows || '<tr><td colspan="2"><div class="empty">Pas encore de données.</div></td></tr>'}</tbody></table></div></div></div>
      <div class="card"><h3>Rapports</h3><p class="sub">Choisissez une période dans l’onglet Historique pour générer un rapport journalier, hebdomadaire, mensuel ou annuel, par département, séance ou membre.</p>
      <button class="btn alt" onclick="CAMAttendance.setSection('Historique')">Ouvrir les filtres et rapports</button><button class="btn alt" onclick="CAMAttendance.exportCsv()">Exporter le rapport CSV</button><button class="btn alt" onclick="CAMAttendance.exportPdf()">Imprimer / PDF</button></div>`;
  }

  function render() {
    defaultEvent();
    if (SERVER_ATTENDANCE === null && !apiError) {
      apiError = 'Les présences du serveur ne sont pas disponibles. Actualisez la page ou vérifiez votre accès.';
    }
    const sections = ['Vue d’ensemble', 'Pointage', 'Historique', 'Absences', 'Retards', 'Séances', 'Visiteurs', 'Rapports'];
    const content = section === 'Pointage' ? attendanceEntry()
      : section === 'Historique' ? history()
        : section === 'Absences' ? absenceSection()
          : section === 'Retards' ? lateSection()
            : section === 'Séances' ? sessions()
              : section === 'Visiteurs' ? visitors()
                : section === 'Rapports' ? reports() : overview();
    const qr = typeof attendanceQr === 'function' ? attendanceQr() : '';
    return `<header class="att-header"><div><h2>Présences</h2><p class="sub">Séances, pointages, absences, retards et visiteurs.</p></div>
      <div class="bar"><button class="btn alt" onclick="CAMAttendance.refresh()">⟳ Actualiser</button>${can('edit') ? '<button class="btn" onclick="ouvrirEvenement()">+ Créer une séance</button>' : ''}</div></header>
      <div class="tabs att-tabs">${sections.map(name => `<button class="${section === name ? 'on' : ''}" onclick="CAMAttendance.setSection('${name}')">${name}</button>`).join('')}</div>
      ${apiError ? `<p class="att-alert" role="alert">${escape(apiError)}</p>` : ''}
      ${section === 'Vue d’ensemble' ? qr : ''}
      ${content}`;
  }

  function toggleVisible() {
    const list = sessionOptions().filter(member => {
      return normalize(member.nom + ' ' + (member.mat || '') + ' ' + departmentOf(member)).includes(normalize(memberQuery))
        && (!memberDepartment || departmentOf(member) === memberDepartment);
    });
    const allSelected = list.length && list.every(member => selectedMembers.has(member.id));
    list.forEach(member => allSelected ? selectedMembers.delete(member.id) : selectedMembers.add(member.id));
    global.render();
  }

  function arrivalFor(event, value) {
    if (!value) return new Date().toISOString();
    const date = event ? event.date : localToday();
    const parsed = new Date(date + 'T' + value + ':00');
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  function markMember(memberId, status = 'present') {
    const event = events().find(item => item.id === eventId);
    if (!eventId || !memberId) { global.toast('Sélectionnez une séance et un membre.', 'warn'); return; }
    if (!STATUTS.includes(status)) { global.toast('Statut de présence invalide.', 'warn'); return; }
    if (!global.confirm(`Confirmer l’enregistrement « ${LABELS[status]} » ?`)) return;
    api('/api/admin/attendance', {
      eventId, memberId, category: 'Membre', status,
      arrivalAt: ['present', 'late'].includes(status) ? new Date().toISOString() : null,
      absenceReason: status === 'excused' ? 'Autres' : '',
      absenceJustified: status === 'excused',
      absenceStart: ['absent', 'excused'].includes(status) && event ? event.date : '',
      absenceEnd: ['absent', 'excused'].includes(status) && event ? event.date : ''
    }).then(() => refresh()).catch(error => global.toast(error.message, 'warn'));
  }

  function addVisitor() {
    const event = events().find(item => item.id === eventId);
    const nom = document.getElementById('att-guest-last').value.trim();
    const prenoms = document.getElementById('att-guest-first').value.trim();
    const telephone = document.getElementById('att-guest-phone').value.trim();
    const email = document.getElementById('att-guest-email').value.trim();
    const sex = document.getElementById('att-guest-sex').value;
    const welcomedBy = document.getElementById('att-guest-host').value.trim();
    if (!eventId || !nom || !prenoms || !telephone) { global.toast('Séance, nom, prénoms et téléphone requis.', 'warn'); return; }
    api('/api/admin/attendance', {
      eventId, category: 'Invité(e)', nom, prenoms, telephone, email, sex, welcomedBy,
      status: 'present', arrivalAt: arrivalFor(event, new Date().toTimeString().slice(0, 5))
    }).then(() => refresh()).catch(error => global.toast(error.message, 'warn'));
  }

  function saveBulk() {
    if (!eventId) { global.toast('Sélectionnez une séance.', 'warn'); return; }
    const department = memberDepartment || ((events().find(event => event.id === eventId) || {}).details || {}).departement || '';
    const presentMemberIds = [...selectedMembers];
    if (!global.confirm(`Enregistrer l’appel complet ? Les ${presentMemberIds.length} membre(s) cochés seront présents et les autres membres actifs de ce périmètre seront marqués absents.`)) return;
    api('/api/admin/attendance/bulk', { eventId, department, presentMemberIds })
      .then(result => {
        selectedMembers.clear();
        global.toast(`Appel enregistré : ${result.presents} présent(s), ${result.absents} absent(s).`);
        return refresh();
      }).catch(error => global.toast(error.message, 'warn'));
  }

  function edit(id) {
    const row = rows().find(item => item.id === id);
    if (!row) { global.toast('Présence introuvable.', 'warn'); return; }
    const status = statusOf(row), arrival = arrivalTime(row);
    showM(`<h3>Modifier la présence</h3><p class="sub">${escape(row.memberName || 'Visiteur')} · ${escape(row.eventName || 'Séance')} · ${fd(row.date)}</p>
      <label for="att-edit-status">Statut</label><select id="att-edit-status">${(row.category === 'Invité(e)' ? ['present', 'late'] : STATUTS).map(value => `<option value="${value}"${value === status ? ' selected' : ''}>${LABELS[value]}</option>`).join('')}</select>
      <label for="att-edit-time">Heure d’arrivée</label><input id="att-edit-time" type="time" value="${escape(arrival)}">
      <label for="att-edit-reason">Motif d’absence</label><select id="att-edit-reason"><option value="">Aucun</option>${MOTIFS.map(value => `<option${value === row.absenceReason ? ' selected' : ''}>${value}</option>`).join('')}</select>
      <label><input id="att-edit-justified" type="checkbox" ${row.absenceJustified ? 'checked' : ''} style="width:auto"> Absence justifiée</label>
      <div class="ev-form"><div><label for="att-edit-from">Début de l’absence</label><input id="att-edit-from" type="date" value="${escape(row.absenceStart || '')}"></div>
      <div><label for="att-edit-to">Fin de l’absence</label><input id="att-edit-to" type="date" value="${escape(row.absenceEnd || '')}"></div></div>
      ${row.category === 'Invité(e)' ? `<label for="att-edit-name">Nom du visiteur</label><input id="att-edit-name" value="${escape(row.nom || '')}">
      <label for="att-edit-first">Prénoms du visiteur</label><input id="att-edit-first" value="${escape(row.prenoms || '')}">
      <label for="att-edit-phone">Téléphone</label><input id="att-edit-phone" value="${escape(row.telephone || '')}">
      <label for="att-edit-sex">Sexe (facultatif)</label><select id="att-edit-sex"><option value="">Non communiqué</option>${['Femme','Homme','Autre'].map(value => `<option${row.visitorSex === value ? ' selected' : ''}>${value}</option>`).join('')}</select>
      <label for="att-edit-host">Accueilli(e) par</label><input id="att-edit-host" value="${escape(row.welcomedBy || '')}">` : ''}
      <label for="att-edit-comments">Commentaires / observations</label><textarea id="att-edit-comments" rows="3">${escape(row.comments || '')}</textarea>
      <div class="bar" style="margin-top:12px"><button class="btn" onclick="CAMAttendance.saveEdit('${escape(id)}')">Enregistrer la modification</button><button class="btn alt" onclick="closeM()">Annuler</button></div>`);
  }

  function saveEdit(id) {
    const row = rows().find(item => item.id === id), event = row && eventFor(row);
    const status = document.getElementById('att-edit-status').value;
    const time = document.getElementById('att-edit-time').value;
    const body = {
      status,
      arrivalAt: ['present', 'late'].includes(status) ? arrivalFor(event, time) : null,
      absenceReason: document.getElementById('att-edit-reason').value,
      absenceJustified: document.getElementById('att-edit-justified').checked,
      absenceStart: document.getElementById('att-edit-from').value,
      absenceEnd: document.getElementById('att-edit-to').value,
      comments: document.getElementById('att-edit-comments').value.trim()
    };
    if (row && row.category === 'Invité(e)') {
      body.nom = document.getElementById('att-edit-name').value.trim();
      body.prenoms = document.getElementById('att-edit-first').value.trim();
      body.telephone = document.getElementById('att-edit-phone').value.trim();
      body.sex = document.getElementById('att-edit-sex').value;
      body.welcomedBy = document.getElementById('att-edit-host').value.trim();
    }
    api('/api/admin/attendance/' + encodeURIComponent(id), body, 'PATCH')
      .then(() => { closeM(); refresh(); })
      .catch(error => global.toast(error.message, 'warn'));
  }

  function exportRows() {
    return filteredRows().map(row => [
      row.id, (memberById(row.memberId) || {}).mat || row.matricule || row.memberId || '',
      row.memberName || '', row.department || '', row.eventName || '', row.date || '',
      arrivalTime(row), LABELS[statusOf(row)], methodName(row.method), row.recordedBy || '',
      row.absenceReason || '', row.comments || ''
    ]);
  }

  function exportCsv() {
    const headers = ['N° enregistrement', 'Matricule', 'Nom et prénoms', 'Département', 'Séance',
      'Date', 'Heure d’arrivée', 'Statut', 'Méthode', 'Responsable', 'Motif d’absence', 'Observations'];
    const text = '\ufeff' + [headers, ...exportRows()].map(line => line.map(value =>
      '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'
    ).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    link.download = 'rapport-presences-' + localToday() + '.csv';
    document.body.appendChild(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
  }

  function exportPdf() {
    const data = exportRows(), headers = ['N°', 'Matricule', 'Nom', 'Département', 'Séance', 'Date', 'Heure', 'Statut'];
    const tableRows = data.map(row => `<tr>${row.slice(0, 8).map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('');
    showM(`<div class="paper"><div class="hd">${hd()}</div><h3>Rapport des présences</h3>
      <p>${data.length} enregistrement(s) · Généré le ${fd(localToday())}</p><table><thead><tr>${headers.map(value => `<th>${value}</th>`).join('')}</tr></thead>
      <tbody>${tableRows || `<tr><td colspan="8">Aucun enregistrement.</td></tr>`}</tbody></table></div>
      <div class="bar noprint"><button class="btn" onclick="imprimerModal()">Imprimer / Enregistrer en PDF</button><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
  }

  global.CAMAttendance = {
    render, refresh, setSection(value) { section = value; page = 1; global.render(); },
    selectEvent(value) { eventId = value; selectedMembers.clear(); global.render(); },
    setFilterEvent(value) { filterEvent = value; page = 1; global.render(); },
    setDate(which, value) { if (which === 'from') fromDate = value; else toDate = value; page = 1; global.render(); },
    setDepartment(value) { filterDepartment = value; page = 1; global.render(); },
    setStatus(value) { filterStatus = value; page = 1; global.render(); },
    setPage(value) { page = value; global.render(); },
    setPageSize(value) { pageSize = Number(value) || 25; page = 1; global.render(); },
    sort(key) { const field = key === 'name' ? 'name' : key; sortDirection = sortBy === field && sortDirection === 'asc' ? 'desc' : 'asc'; sortBy = field; global.render(); },
    search(value) { query = value; page = 1; global.render(); const input = document.getElementById('att-q'); if (input) { input.focus(); input.setSelectionRange(query.length, query.length); } },
    searchMembers(value) { memberQuery = value; global.render(); const input = document.getElementById('att-member-q'); if (input) { input.focus(); input.setSelectionRange(memberQuery.length, memberQuery.length); } },
    setMemberDepartment(value) { memberDepartment = value; selectedMembers.clear(); global.render(); },
    toggleMember(id, selected) { selected ? selectedMembers.add(id) : selectedMembers.delete(id); },
    toggleVisible, markMember, addVisitor, saveBulk, edit, saveEdit, exportCsv, exportPdf
  };
})(window);
