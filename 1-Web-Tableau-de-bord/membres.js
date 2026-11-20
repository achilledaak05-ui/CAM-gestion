/* ==========================================================================
   CAM — Module Membres (tableau de bord web)
   Statistiques · Dossiers · Familles · Suivi · Alertes · Administration
   Rapports · Connexion avec les autres modules.
   `S.memExt` complète les champs de base synchronisés depuis PostgreSQL.
   ========================================================================== */

const MB_STATUTS = ["Membre", "Nouveau converti", "Visiteur", "Inactif", "Transféré", "Décédé"];
const MB_TRANCHES = ["0-17 ans", "18-25 ans", "26-35 ans", "36-50 ans", "51-65 ans", "66 ans et +"];
const MB_COULEURS = ["#7c3aed", "#c9a227", "#2563eb", "#16a34a", "#db2777", "#0891b2", "#ea580c", "#4f46e5"];

let MB_TAB = "Vue d’ensemble", MB_Q = "", MB_SEL = "", MB_FAM_Q = "", MB_RAP_DATA = {}, MB_NOUVEAU = false;

/* ---- Socle ---- */
const MB_MEM = () => (S.members || []);
const MB_GET = id => MB_MEM().find(m => m.id === id);
const MB_EXT = m => (m && S.memExt && S.memExt[m.id]) ? S.memExt[m.id] : {};
const MB_NOM = m => m ? (m.nom || "—") : "—";
const MB_AGE = m => {
  const n = m && m.naissance ? String(m.naissance) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null;
  const d = new Date(n + "T12:00:00"), a = new Date();
  let age = a.getFullYear() - d.getFullYear();
  if (a.getMonth() < d.getMonth() || (a.getMonth() === d.getMonth() && a.getDate() < d.getDate())) age--;
  return age;
};
const MB_TRANCHE = age => age == null ? "Non renseigné"
  : age < 18 ? "0-17 ans" : age < 26 ? "18-25 ans" : age < 36 ? "26-35 ans" : age < 51 ? "36-50 ans" : age < 66 ? "51-65 ans" : "66 ans et +";
const MB_ANNEE = () => new Date().getFullYear();
const MB_MAJ = (id, patch, action) => {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const e = MB_GET(id); if (!e) return;
  S.memExt = S.memExt || {};
  const ex = MB_EXT(e);
  S.memExt[id] = { ...ex, ...patch,
    historique: [...(ex.historique || []), {
      date: today() + " " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      action: action || "Modification", par: SESSION ? SESSION.username : "—"
    }]
  };
  if (patch.statut) e.statut = patch.statut;
  if (patch.dept !== undefined) e.dept = patch.dept;
  if (patch.photo !== undefined) e.photo = patch.photo;
  save(); render();
};
const MB_COMPLET = m => {
  const x = MB_EXT(m);
  return [m.nom, m.tel, m.sexe, m.naissance, m.adresse, m.dept, x.situationMatrimoniale, x.fonction]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== "").length;
};
const MB_INCOMPLET = m => MB_COMPLET(m) < 7;
const MB_INTEGRE = m => {
  const x = MB_EXT(m);
  const d = x.dateIntegration || "";
  return String(d).slice(0, 4) === String(MB_ANNEE());
};

/* ---- Graphiques SVG (sans dépendance) ---- */
function MB_BARS(donnees, max) {
  const l = donnees.filter(d => d[1] > 0);
  if (!l.length) return '<div class="empty">Aucune donnée.</div>';
  const m = max || Math.max(1, ...l.map(d => d[1]));
  return `<div class="mb-bars">${l.map((d, i) => `<div class="mb-bar"><span>${esc(d[0])}</span><div class="mb-track"><i style="width:${Math.round(d[1] / m * 100)}%;background:${MB_COULEURS[i % MB_COULEURS.length]}"></i></div><b>${d[1]}</b></div>`).join("")}</div>`;
}
function MB_DONUT(donnees) {
  const l = donnees.filter(d => d[1] > 0), t = l.reduce((a, d) => a + d[1], 0) || 1;
  let o = 25;
  const arcs = l.map((d, i) => {
    const p = d[1] / t * 100, s = `<circle class="mb-arc" style="--i:${i}" cx="21" cy="21" r="15.9155" fill="none" stroke="${MB_COULEURS[i % MB_COULEURS.length]}" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${o}"><title>${esc(d[0])} : ${d[1]}</title></circle>`;
    o -= p; return s;
  }).join("");
  return `<div class="mb-donut"><svg viewBox="0 0 42 42" width="150" aria-label="Répartition"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--ln)" stroke-width="6"/>${arcs}<text x="21" y="22" text-anchor="middle" font-size="8" font-weight="700" fill="var(--ink)">${t}</text></svg><div class="mb-legend">${l.map((d, i) => `<div><i style="background:${MB_COULEURS[i % MB_COULEURS.length]}"></i>${esc(d[0])} <b>${d[1]}</b></div>`).join("")}</div></div>`;
}
function MB_LINE(donnees) {
  if (!donnees.length) return '<div class="empty">Aucune donnée.</div>';
  const W = 480, H = 180, mx = Math.max(1, ...donnees.map(d => d[1]));
  const px = i => 34 + i * (W - 50) / Math.max(1, donnees.length - 1);
  const py = v => H - 24 - v / mx * (H - 46);
  const path = donnees.map((d, i) => (i ? "L" : "M") + px(i).toFixed(1) + "," + py(d[1]).toFixed(1)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution">
    ${[0, 1, 2, 3].map(i => `<line x1="34" x2="${W - 16}" y1="${20 + i * 38}" y2="${20 + i * 38}" stroke="var(--ln)"/>`).join("")}
    <path d="${path}L${px(donnees.length - 1)},${H - 24}L${px(0)},${H - 24}Z" fill="rgba(124,58,237,.14)"/>
    <path d="${path}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${donnees.map((d, i) => `<circle cx="${px(i)}" cy="${py(d[1])}" r="4" fill="var(--sf)" stroke="#7c3aed" stroke-width="2.5"><title>${esc(d[0])} : ${d[1]}</title></circle><text x="${px(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--mut)">${esc(d[0])}</text>`).join("")}
  </svg>`;
}
const MB_CARTE = (titre, contenu) => `<div class="card"><h3>${esc(titre)}</h3>${contenu}</div>`;

/* ---- 1 · Indicateurs ---- */
function MB_KPI() {
  const l = MB_MEM(), x = l.filter(m => (m.statut || "Membre") === "Membre").length;
  const nouveaux = l.filter(m => ["Nouveau converti", "Visiteur"].includes(m.statut)).length;
  const inactifs = l.filter(m => ["Inactif", "Transféré"].includes(m.statut)).length;
  const hommes = l.filter(m => m.sexe === "Homme").length, femmes = l.filter(m => m.sexe === "Femme").length;
  const mineurs = l.filter(m => { const a = MB_AGE(m); return a != null && a < 18; }).length;
  const avecDept = l.filter(m => m.dept).length;
  const incomplets = l.filter(MB_INCOMPLET).length, integres = l.filter(MB_INTEGRE).length;
  const valeurs = [l.length, x, nouveaux, inactifs, hommes, femmes, mineurs, avecDept, incomplets, integres];
  const noms = ["Total membres", "Membres actifs", "Nouveaux / visiteurs", "Inactifs / transférés", "Hommes", "Femmes", "Mineurs (-18 ans)", "Avec département", "Dossiers incomplets", "Intégrés cette année"];
  const classes = ["", "fin-entree", "fin-solde", "fin-depense", "", "", "", "", "fin-depense", "fin-entree"];
  return `<div class="mb-kpi">${valeurs.map((v, i) => `<div class="card stat ${classes[i]}"><b>${v}</b><span>${esc(noms[i])}</span></div>`).join("")}</div>`;
}

/* ---- 2 · Graphiques ---- */
function MB_DONNEES() {
  const l = MB_MEM();
  const par = f => { const o = {}; l.forEach(m => { const k = f(m) || "Non renseigné"; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const mois = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    return [d.toLocaleDateString("fr-FR", { month: "short" }), l.filter(m => String(MB_EXT(m).dateIntegration || "").startsWith(k)).length];
  });
  const annees = {};
  l.forEach(m => { const a = String(MB_EXT(m).dateIntegration || "").slice(0, 4); if (a) annees[a] = (annees[a] || 0) + 1; });
  return {
    sexe: [["Hommes", l.filter(m => m.sexe === "Homme").length], ["Femmes", l.filter(m => m.sexe === "Femme").length], ["Non renseigné", l.filter(m => !m.sexe).length]],
    age: MB_TRANCHES.map(t => [t, l.filter(m => MB_TRANCHE(MB_AGE(m)) === t).length]),
    matrimoniale: par(m => MB_EXT(m).situationMatrimoniale),
    commune: par(m => MB_EXT(m).commune || (m.adresse || "").split(",").pop().trim()),
    dept: par(m => m.dept ? nm("depts", m.dept) : "Sans département"),
    fonction: par(m => MB_EXT(m).fonction).slice(0, 10),
    bapteme: [["Baptisés", l.filter(m => MB_EXT(m).dateBapteme).length], ["Non baptisés", l.filter(m => !MB_EXT(m).dateBapteme).length]],
    integration: [["En période d’intégration", l.filter(m => m.statut === "Nouveau converti").length], ["Récemment intégrés", l.filter(m => MB_INTEGRE(m)).length]],
    mois, annees: Object.entries(annees).sort(),
    departs: par(m => MB_EXT(m).transfert ? "Transférés" : null).filter(d => d[0] !== "Non renseigné")
  };
}
function MB_GRAPHIQUES(compact) {
  const d = MB_DONNEES();
  const bloc = (t, c) => MB_CARTE(t, c);
  const grille = `<div class="mb-charts">
    ${bloc("Évolution mensuelle des adhésions", MB_LINE(d.mois))}
    ${bloc("Comparaison par année", MB_BARS(d.annees))}
    ${bloc("Répartition hommes / femmes", MB_DONUT(d.sexe))}
    ${bloc("Tranches d’âge", MB_BARS(d.age))}
    ${bloc("Situation matrimoniale", MB_BARS(d.matrimoniale))}
    ${bloc("Répartition par commune", MB_BARS(d.commune.slice(0, 10)))}
    ${bloc("Membres par département", MB_BARS(d.dept))}
    ${bloc("Membres par fonction", MB_BARS(d.fonction))}
    ${bloc("Baptisés / non baptisés", MB_DONUT(d.bapteme))}
    ${bloc("Intégration", MB_BARS(d.integration))}
    ${bloc("Départs & transferts", d.departs.length ? MB_BARS(d.departs) : '<div class="empty">Aucun transfert enregistré.</div>')}
    ${bloc("Nouvelles adhésions (6 mois)", MB_BARS(d.mois))}
  </div>`;
  return compact ? grille : grille;
}

/* ---- 3 · Dossiers individuels ---- */
function MB_FICHE(id) {
  const m = MB_GET(id); if (!m) return;
  const x = MB_EXT(m);
  const lig = (k, v) => `<div class="mb-lig"><span>${k}</span><b>${esc(v || "—")}</b></div>`;
  const doc = x.documents || [];
  const parc = x.parcours || [];
  showM(`<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div class="ph" style="width:74px;height:74px;font-size:26px">${m.photo ? `<img src="${esc(m.photo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc((m.nom || "?").slice(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:200px"><h3 style="margin:0">${esc(MB_NOM(m))}</h3><p class="cards-help">${tag(m.mat || "—")} ${tag(m.statut || "Membre")} · ${esc(nm("depts", m.dept))}</p>
      <div class="bar" style="margin-top:8px">
        ${can("edit") ? `<button class="btn" onclick="closeM();openF('mem','${esc(id)}')">✎ Modifier</button>` : ""}
        <button class="btn alt" onclick="closeM();MB_IMPRIMER('${esc(id)}')">🖨 Imprimer</button>
        <button class="btn alt" onclick="closeM();MB_SUIVI('${esc(id)}')">📈 Parcours</button>
      </div></div></div>
    <div class="ev-detail" style="margin-top:14px">
      <div class="card"><h4>Identité</h4>${lig("Matricule", m.mat)}${lig("Nom", m.nom)}${lig("Prénom", m.prenom)}${lig("Sexe", m.sexe)}${lig("Naissance", m.naissance ? fd(m.naissance) : "")}${lig("Âge", MB_AGE(m) == null ? "—" : MB_AGE(m) + " ans")}${lig("Profession", m.prof || x.profession)}${lig("Situation matrimoniale", x.situationMatrimoniale)}${lig("Fonction", x.fonction)}</div>
      <div class="card"><h4>Contact & église</h4>${lig("Téléphone", m.tel)}${lig("Adresse", m.adresse)}${lig("Commune", x.commune)}${lig("Église", nm("eglises", m.eg))}${lig("Département", nm("depts", m.dept))}${lig("Responsable de suivi", x.responsableSuivi)}</div>
      <div class="card"><h4>Parcours spirituel</h4>${lig("1re visite", x.datePremiereVisite ? fd(x.datePremiereVisite) : "")}${lig("Intégration", x.dateIntegration ? fd(x.dateIntegration) : "")}${lig("Baptême", x.dateBapteme ? fd(x.dateBapteme) : "")}${lig("Statut", m.statut)}</div>
      <div class="card"><h4>Suivi</h4>${lig("Dossiers joints", doc.length)}${lig("Événements du parcours", parc.length)}${lig("Complétude", MB_COMPLET(m) + " / 8 champs")}${MB_INCOMPLET(m) ? tag("Dossier incomplet", "w") : tag("Dossier complet", "g")}</div>
    </div>
    <div class="ev-sec" style="margin-top:12px"><h4>Actions rapides</h4>
      <div class="bar" style="flex-wrap:wrap">
        <select id="mbd_statut" onchange="MB_MAJ('${esc(id)}',{statut:this.value},'Changement de statut');closeM()">${MB_STATUTS.map(s => `<option${s === (m.statut || "Membre") ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <select id="mbd_dept" onchange="MB_MAJ('${esc(id)}',{dept:this.value},'Affectation département');closeM()"><option value="">Sans département</option>${(S.depts || []).map(d => `<option value="${esc(d.id)}"${d.id === m.dept ? " selected" : ""}>${esc(d.nom)}</option>`).join("")}</select>
        <button class="btn alt" onclick="MB_DOSSIER('${esc(id)}')">📎 Ajouter un document</button>
        <button class="btn alt" onclick="MB_PHOTO('${esc(id)}')">🖼 Photo</button>
        <button class="btn alt" onclick="MB_SUIVI_EVENT('${esc(id)}')">➕ Événement de parcours</button>
        <button class="btn alt" onclick="MB_ARCHIVER('${esc(id)}',${x.archive ? "false" : "true"})">${x.archive ? "↩ Restaurer" : "📦 Archiver"}</button>
      </div></div>
    <div class="ev-sec"><h4>Documents (${doc.length})</h4>${doc.map(g => `<div class="mb-lig"><span>${esc(g.nom || "")} · ${esc(g.date || "")}</span><button class="del" onclick="MB_DEL_DOC('${esc(id)}','${esc(g.id)}')">✕</button></div>`).join("") || '<p class="cards-help">Aucun document joint.</p>'}
      <h4 style="margin-top:12px">Historique des modifications (${(x.historique || []).length})</h4>${(x.historique || []).slice(-8).reverse().map(h => `<div class="mb-lig"><span>${esc(h.date)} · ${esc(h.par || "")}</span><b>${esc(h.action || "")}</b></div>`).join("") || '<p class="cards-help">Aucune modification enregistrée.</p>'}</div>`);
}
function MB_IMPRIMER(id) {
  const m = MB_GET(id), x = MB_EXT(m);
  showM(`<div class="paper"><div class="hd">${logo(46)}${esc(S.cfg.name)}</div><h3>FICHE DE MEMBRE</h3>
    <p><b>${esc(MB_NOM(m))}</b> · ${tag(m.mat || "—")} · ${tag(m.statut || "Membre")}</p>
    <table><thead><tr><th>Champ</th><th>Valeur</th></tr></thead><tbody>
    ${[["Nom", m.nom], ["Prénom", m.prenom], ["Téléphone", m.tel], ["Naissance", m.naissance], ["Adresse", m.adresse], ["Profession", m.prof], ["Département", nm("depts", m.dept)], ["Église", nm("eglises", m.eg)], ["Intégration", x.dateIntegration], ["Baptême", x.dateBapteme], ["Responsable de suivi", x.responsableSuivi]].map(r => `<tr><td>${r[0]}</td><td>${esc(r[1] || "—")}</td></tr>`).join("")}
    </tbody></table><div class="sig">Signature du responsable</div></div>
    <div class="bar noprint" style="margin-top:12px"><button class="btn" onclick="imprimerModal()">🖨 Imprimer / PDF</button><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
}
function MB_DOSSIER(id) {
  showM(`<h3>📎 Ajouter un document</h3><label>Nom du document</label><input id="mbdoc_nom" placeholder="Ex. : Acte de naissance">
    <label style="margin-top:8px;display:block">Date</label><input id="mbdoc_date" type="date" value="${today()}">
    <div class="bar" style="margin-top:12px"><button class="btn" onclick="MB_ADD_DOC('${esc(id)}')">Ajouter</button><button class="btn alt" onclick="closeM()">Annuler</button></div>`);
}
function MB_ADD_DOC(id) {
  const nom = (document.getElementById("mbdoc_nom") || {}).value || "", date = (document.getElementById("mbdoc_date") || {}).value || today();
  if (!nom.trim()) { toast("Nom requis", "warn"); return; }
  const d = MB_EXT(MB_GET(id)).documents || [];
  MB_MAJ(id, { documents: [...d, { id: uid(), nom: nom.trim(), date }] }, "Document ajouté");
  closeM(); toast("Document ajouté");
}
function MB_DEL_DOC(id, did) {
  const d = MB_EXT(MB_GET(id)).documents || [];
  MB_MAJ(id, { documents: d.filter(g => String(g.id) !== String(did)) }, "Document retiré");
}
function MB_PHOTO(id) {
  showM(`<h3>🖼 Photo du membre</h3><input type="file" id="mbphoto" accept="image/*" onchange="MB_LIRE_PHOTO(this)">
    <img id="mbphoto_prev" src="${esc((MB_GET(id) || {}).photo || "")}" alt="" style="display:block;max-height:160px;border-radius:12px;margin-top:10px">
    <div class="bar" style="margin-top:12px"><button class="btn" onclick="MB_SAVE_PHOTO('${esc(id)}')">💾 Enregistrer</button><button class="btn alt" onclick="closeM()">Annuler</button></div>`);
}
let MB_PHOTO_DATA = "";
function MB_LIRE_PHOTO(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { MB_PHOTO_DATA = r.result; const p = document.getElementById("mbphoto_prev"); if (p) p.src = r.result; };
  r.readAsDataURL(f);
}
function MB_SAVE_PHOTO(id) {
  if (!MB_PHOTO_DATA) { toast("Choisissez une image", "warn"); return; }
  MB_MAJ(id, { photo: MB_PHOTO_DATA }, "Photo mise à jour"); MB_PHOTO_DATA = ""; closeM(); toast("Photo enregistrée");
}
function MB_ARCHIVER(id, etat) { MB_MAJ(id, { archive: etat }, etat ? "Dossier archivé" : "Dossier restauré"); closeM(); toast(etat ? "Dossier archivé" : "Dossier restauré"); }

/* ---- 4 · Familles ---- */
const MB_FAM = () => { if (!S.familles) { S.familles = []; save(); } return S.familles; };
function MB_FAMILLES() {
  const q = MB_FAM_Q.toLowerCase();
  const l = MB_FAM().filter(f => (f.nom || "").toLowerCase().includes(q));
  const membres = MB_MEM();
  return `<div class="ev-bar"><button class="btn" onclick="MB_FAM_FORM()">+ Nouvelle famille</button><input type="search" placeholder="Rechercher une famille…" value="${esc(MB_FAM_Q)}" oninput="MB_FAM_FILTRE(this.value)" style="min-width:220px"></div>
    <div id="mbfamlist" class="mb-familles">${l.length ? l.map(f => {
      const ids = [f.chefId, f.conjointId, ...(f.enfants || [])].filter(Boolean);
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 style="margin:0">🏠 Famille ${esc(f.nom)}</h3><div class="bar" style="margin:0"><button class="ed" onclick="MB_FAM_FORM('${esc(f.id)}')">Modifier</button><button class="del" onclick="MB_FAM_DEL('${esc(f.id)}')">Supprimer</button></div></div>
        <p class="cards-help">${tag(ids.length + " personne(s)")} ${f.adresse ? "· " + esc(f.adresse) : ""} ${f.contacts ? "· " + esc(f.contacts) : ""}</p>
        <div class="mb-lig"><span>Chef de famille</span><b>${esc(MB_NOM(MB_GET(f.chefId)))}</b></div>
        <div class="mb-lig"><span>Conjoint(e)</span><b>${esc(MB_NOM(MB_GET(f.conjointId)))}</b></div>
        <div class="mb-lig"><span>Enfants</span><b>${(f.enfants || []).map(i => MB_NOM(MB_GET(i))).join(", ") || "—"}</b></div>
        <div class="bar" style="margin-top:8px"><button class="btn alt" onclick="MB_FAM_VOIR('${esc(f.id)}')">👥 Voir le foyer</button></div></div>`;
    }).join("") : '<div class="empty">Aucune famille enregistrée.</div>'}</div>`;
}
function MB_FAM_FILTRE(v) {
  MB_FAM_Q = v; const q = String(v).toLowerCase();
  document.querySelectorAll("#mbfamlist > .card").forEach(c => { c.style.display = c.textContent.toLowerCase().includes(q) ? "" : "none"; });
}
const MB_OPT_MEMBRES = (sel) => `<option value="">— Choisir —</option>` + MB_MEM().map(m => `<option value="${esc(m.id)}"${m.id === sel ? " selected" : ""}>${esc(MB_NOM(m))}</option>`).join("");
function MB_FAM_FORM(id) {
  const f = id ? MB_FAM().find(a => a.id === id) : {};
  showM(`<h3>${id ? "Modifier" : "Créer"} une famille</h3>
    <label>Nom de famille</label><input id="mbf_nom" value="${esc(f.nom || "")}" placeholder="Ex. : Famille Kouassi">
    <label style="display:block;margin-top:8px">Chef de famille</label><select id="mbf_chef">${MB_OPT_MEMBRES(f.chefId)}</select>
    <label style="display:block;margin-top:8px">Conjoint(e)</label><select id="mbf_conjoint">${MB_OPT_MEMBRES(f.conjointId)}</select>
    <label style="display:block;margin-top:8px">Enfants (sélection multiple)</label><select id="mbf_enfants" multiple size="5">${MB_MEM().map(m => `<option value="${esc(m.id)}"${(f.enfants || []).includes(m.id) ? " selected" : ""}>${esc(MB_NOM(m))}</option>`).join("")}</select>
    <label style="display:block;margin-top:8px">Adresse familiale</label><input id="mbf_adresse" value="${esc(f.adresse || "")}">
    <label style="display:block;margin-top:8px">Contacts familiaux</label><input id="mbf_contacts" value="${esc(f.contacts || "")}">
    <div class="bar" style="margin-top:12px"><button class="btn" onclick="MB_FAM_SAVE('${esc(id || "")}')">💾 Enregistrer</button><button class="btn alt" onclick="closeM()">Annuler</button></div>`);
}
function MB_FAM_SAVE(id) {
  const g = n => (document.getElementById("mbf_" + n) || {}).value || "";
  const sel = document.getElementById("mbf_enfants");
  const enfants = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
  const nom = g("nom").trim(); if (!nom) { toast("Nom requis", "warn"); return; }
  const o = { nom, chefId: g("chef"), conjointId: g("conjoint"), enfants, adresse: g("adresse"), contacts: g("contacts") };
  if (id) Object.assign(MB_FAM().find(f => f.id === id), o);
  else MB_FAM().push({ id: uid(), ...o });
  save(); closeM(); render(); toast("Famille enregistrée");
}
function MB_FAM_DEL(id) { if (!confirm("Supprimer cette fiche familiale ?")) return; S.familles = MB_FAM().filter(f => f.id !== id); save(); render(); }
function MB_FAM_VOIR(id) {
  const f = MB_FAM().find(a => a.id === id); if (!f) return;
  const ids = [f.chefId, f.conjointId, ...(f.enfants || [])].filter(Boolean);
  showM(`<h3>Foyer ${esc(f.nom)} — ${ids.length} personne(s)</h3><div class="tw"><table><thead><tr><th>Rôle</th><th>Membre</th><th>Téléphone</th><th></th></tr></thead><tbody>
    ${ids.map(i => { const m = MB_GET(i); return `<tr><td>${i === f.chefId ? "Chef de famille" : i === f.conjointId ? "Conjoint(e)" : "Enfant"}</td><td><b>${esc(MB_NOM(m))}</b></td><td>${esc(m ? m.tel : "")}</td><td><button class="ed" onclick="closeM();MB_FICHE('${esc(i)}')">Fiche</button></td></tr>`; }).join("") || `<tr><td colspan="4"><div class="empty">Aucun membre associé.</div></td></tr>`}
    </tbody></table></div><div class="bar" style="margin-top:12px"><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
}

/* ---- 5 · Suivi ---- */
function MB_SUIVI(id) {
  const m = MB_GET(id); if (!m) return;
  const x = MB_EXT(m), parc = x.parcours || [];
  return `<div class="ev-bar"><select onchange="MB_SEL=this.value;render()">${MB_MEM().map(a => `<option value="${esc(a.id)}"${a.id === id ? " selected" : ""}>${esc(MB_NOM(a))}</option>`).join("")}</select><button class="btn" onclick="MB_SUIVI_EVENT('${esc(id)}')">+ Événement de parcours</button></div>
    ${MB_CARTE("Étapes clés", `<div class="mb-lig"><span>Première visite</span><b>${x.datePremiereVisite ? fd(x.datePremiereVisite) : "—"}</b></div><div class="mb-lig"><span>Intégration</span><b>${x.dateIntegration ? fd(x.dateIntegration) : "—"}</b></div><div class="mb-lig"><span>Baptême</span><b>${x.dateBapteme ? fd(x.dateBapteme) : "—"}</b></div><div class="mb-lig"><span>Département actuel</span><b>${esc(nm("depts", m.dept))}</b></div><div class="mb-lig"><span>Responsable de suivi</span><b>${esc(x.responsableSuivi || "—")}</b></div>`)}
    ${MB_CARTE("Historique du parcours", `<div class="mb-timeline">${parc.length ? parc.slice().reverse().map(p => `<div class="mb-time"><b>${esc(p.date || "")}</b><div><b>${esc(p.type || "Événement")}</b> — ${esc(p.detail || "")}</div></div>`).join("") : '<div class="empty">Aucun événement de parcours enregistré.</div>'}</div>`)}
    ${MB_CARTE("Évolution spirituelle", `<div class="bar"><button class="btn alt" onclick="MB_ETAPE('${esc(id)}','datePremiereVisite','Première visite')">Première visite</button><button class="btn alt" onclick="MB_ETAPE('${esc(id)}','dateIntegration','Intégration')">Intégrer</button><button class="btn alt" onclick="MB_ETAPE('${esc(id)}','dateBapteme','Baptême')">Baptiser</button></div>`)}`;
}
function MB_ETAPE(id, cle, libelle) {
  const x = MB_EXT(MB_GET(id));
  MB_MAJ(id, { [cle]: today() }, libelle + " enregistré");
  toast(libelle + " enregistré");
}
function MB_SUIVI_EVENT(id) {
  showM(`<h3>➕ Événement de parcours</h3><label>Type</label><select id="mbs_type">${["Changement de département", "Attribution de responsabilité", "Transfert vers une autre église", "Passage au statut inactif", "Autre"].map(t => `<option>${esc(t)}</option>`).join("")}</select>
    <label style="display:block;margin-top:8px">Date</label><input id="mbs_date" type="date" value="${today()}">
    <label style="display:block;margin-top:8px">Détail</label><textarea id="mbs_detail" rows="3"></textarea>
    <div class="bar" style="margin-top:12px"><button class="btn" onclick="MB_ADD_PARCOURS('${esc(id)}')">Ajouter</button><button class="btn alt" onclick="closeM()">Annuler</button></div>`);
}
function MB_ADD_PARCOURS(id) {
  const t = (document.getElementById("mbs_type") || {}).value || "", d = (document.getElementById("mbs_date") || {}).value || today(), det = (document.getElementById("mbs_detail") || {}).value || "";
  const p = MB_EXT(MB_GET(id)).parcours || [];
  MB_MAJ(id, { parcours: [...p, { id: uid(), type: t, date: d, detail: det }] }, t);
  closeM(); toast("Événement ajouté au parcours");
}

/* ---- 6 · Alertes ---- */
function MB_ALERTES() {
  const l = MB_MEM().filter(m => !MB_EXT(m).archive);
  const auj = today().slice(5), semaine = new Date(); semaine.setDate(semaine.getDate() + 7);
  const finSem = FIN_ISO(semaine).slice(5);
  const annivJour = l.filter(m => String(m.naissance || "").slice(5) === auj);
  const annivSem = l.filter(m => { const s = String(m.naissance || "").slice(5); return s && s > auj && s <= finSem; });
  const incomplets = l.filter(MB_INCOMPLET), sansDept = l.filter(m => !m.dept), sansResp = l.filter(m => !MB_EXT(m).responsableSuivi);
  const aValider = l.filter(m => m.statut === "Nouveau converti" || MB_EXT(m).aValider);
  const statuts = l.filter(m => MB_EXT(m).changementStatutAExaminer);
  const blocs = [
    ["🎂 Anniversaires du jour", annivJour], ["🎂 Anniversaires de la semaine", annivSem],
    ["📋 Dossiers incomplets", incomplets], ["🕊️ Sans département", sansDept],
    ["👤 Sans responsable de suivi", sansResp], ["✅ Nouvelles adhésions à valider", aValider],
    ["🔔 Changements de statut à examiner", statuts]
  ];
  return `<div class="mb-kpi">${blocs.map(b => `<div class="card stat ${b[1].length ? "fin-solde" : ""}"><b>${b[1].length}</b><span>${esc(b[0].replace(/^[^ ]+ /, ""))}</span></div>`).join("")}</div>` +
    blocs.map(([titre, liste]) => MB_CARTE(titre, liste.length ? `<div class="tw"><table><thead><tr><th>Membre</th><th>Téléphone</th><th></th></tr></thead><tbody>${liste.slice(0, 20).map(m => `<tr><td>${esc(MB_NOM(m))}</td><td>${esc(m.tel || "—")}</td><td><button class="ed" onclick="MB_FICHE('${esc(m.id)}')">Fiche</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Rien à signaler.</div>')).join("");
}

/* ---- 7 · Administration ---- */
function MB_ADMIN() {
  const l = MB_MEM();
  const doublons = [];
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    if (l[i].nom && l[i].nom.toLowerCase() === l[j].nom.toLowerCase()) doublons.push([l[i], l[j]]);
  }
  const archives = l.filter(m => MB_EXT(m).archive), aValider = l.filter(m => m.statut === "Nouveau converti" || MB_EXT(m).aValider);
  const journal = [];
  l.forEach(m => (MB_EXT(m).historique || []).forEach(h => journal.push({ nom: MB_NOM(m), ...h })));
  journal.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="grid fin-kpi">
      <div class="card stat fin-solde"><b>${aValider.length}</b><span>Adhésions à valider</span></div>
      <div class="card stat fin-depense"><b>${doublons.length}</b><span>Doublons détectés</span></div>
      <div class="card stat"><b>${archives.length}</b><span>Dossiers archivés</span></div>
      <div class="card stat"><b>${l.filter(m => !m.mat).length}</b><span>Sans matricule</span></div></div>
    ${MB_CARTE("Validation des adhésions", aValider.length ? `<div class="tw"><table><thead><tr><th>Membre</th><th>Date</th><th></th></tr></thead><tbody>${aValider.map(m => `<tr><td>${esc(MB_NOM(m))}</td><td>${esc(m.naissance ? fd(m.naissance) : "—")}</td><td><button class="btn sm" onclick="MB_VALIDER('${esc(m.id)}')">Valider</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune adhésion en attente.</div>')}
    ${MB_CARTE("Doublons détectés (même nom)", doublons.length ? `<div class="tw"><table><thead><tr><th>Membre A</th><th>Membre B</th></tr></thead><tbody>${doublons.slice(0, 20).map(d => `<tr><td>${esc(MB_NOM(d[0]))} · ${esc(d[0].tel || "")}</td><td>${esc(MB_NOM(d[1]))} · ${esc(d[1].tel || "")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun doublon détecté.</div>')}
    ${MB_CARTE("Archives", archives.length ? `<div class="tw"><table><thead><tr><th>Membre</th><th></th></tr></thead><tbody>${archives.map(m => `<tr><td>${esc(MB_NOM(m))}</td><td><button class="btn alt" onclick="MB_ARCHIVER('${esc(m.id)}',false)">↩ Restaurer</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucun dossier archivé.</div>')}
    ${MB_CARTE("Sauvegarde & export", `<div class="bar"><button class="btn alt" onclick="MB_EXPORT_JSON()">💾 Sauvegarde JSON</button><button class="btn alt" onclick="MB_EXPORT_CSV()">⬇ Export Excel (CSV)</button><button class="btn alt" onclick="go('adm')">⚙ Accès et permissions</button></div>`)}
    ${MB_CARTE("Journal des opérations", `<div class="tw"><table><thead><tr><th>Date</th><th>Membre</th><th>Action</th><th>Par</th></tr></thead><tbody>${journal.slice(0, 30).map(h => `<tr><td>${esc(h.date)}</td><td>${esc(h.nom)}</td><td>${esc(h.action)}</td><td>${esc(h.par || "—")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Aucune opération.</div></td></tr>`}</tbody></table></div>`)}`;
}
function MB_VALIDER(id) {
  const m = MB_GET(id);
  if (!m.mat) {
    const n = MB_MEM().filter(a => a.mat).map(a => +(String(a.mat).split("-").pop()) || 0);
    m.mat = "EG-" + String(Math.max(0, ...n) + 1).padStart(4, "0");
  }
  m.statut = "Membre"; MB_MAJ(id, { aValider: false, dateIntegration: today(), statut: "Membre" }, "Adhésion validée · matricule " + m.mat);
  if (typeof syncMembre === "function") syncMembre(m, true);
  save(); toast("Adhésion validée · " + m.mat);
}
function MB_EXPORT_JSON() {
  const b = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "CAM-sauvegarde-" + today() + ".json"; a.click();
  toast("Sauvegarde générée");
}
function MB_EXPORT_CSV() {
  const cols = ["Matricule", "Nom", "Prénom", "Sexe", "Naissance", "Téléphone", "Adresse", "Profession", "Département", "Statut"];
  const rows = MB_MEM().map(m => [m.mat || "", m.nom || "", m.prenom || "", m.sexe || "", m.naissance || "", m.tel || "", m.adresse || "", m.prof || "", nm("depts", m.dept), m.statut || ""]);
  finCSV("Membres CAM", cols, rows);
}

/* ---- 8 · Rapports ---- */
function MB_RAPPORTS() {
  const l = MB_MEM();
  const defs = [
    ["Rapport général de l’effectif", () => [["Total", l.length], ["Actifs", l.filter(m => (m.statut || "Membre") === "Membre").length], ["Nouveaux", l.filter(m => m.statut === "Nouveau converti").length], ["Inactifs", l.filter(m => m.statut === "Inactif").length]]],
    ["Rapport démographique", () => [["Hommes", l.filter(m => m.sexe === "Homme").length], ["Femmes", l.filter(m => m.sexe === "Femme").length], ["Mineurs", l.filter(m => { const a = MB_AGE(m); return a != null && a < 18; }).length], ...MB_TRANCHES.map(t => [t, l.filter(m => MB_TRANCHE(MB_AGE(m)) === t).length])]],
    ["Rapport par département", () => (S.depts || []).map(d => [d.nom, l.filter(m => m.dept === d.id).length])],
    ["Rapport par famille", () => MB_FAM().map(f => [f.nom, [f.chefId, f.conjointId, ...(f.enfants || [])].filter(Boolean).length])],
    ["Rapport des nouvelles adhésions", () => [["Cette année", l.filter(MB_INTEGRE).length], ["À valider", l.filter(m => m.statut === "Nouveau converti").length]]],
    ["Rapport des membres inactifs", () => l.filter(m => m.statut === "Inactif").map(m => [MB_NOM(m), m.tel || "—"])],
    ["Rapport des baptêmes", () => l.filter(m => MB_EXT(m).dateBapteme).map(m => [MB_NOM(m), MB_EXT(m).dateBapteme])],
    ["Rapport des transferts", () => l.filter(m => m.statut === "Transféré" || MB_EXT(m).transfert).map(m => [MB_NOM(m), MB_EXT(m).transfert || m.statut])],
    ["Rapport des anniversaires", () => l.filter(m => m.naissance).map(m => [MB_NOM(m), m.naissance]).sort((a, b) => a[1].slice(5).localeCompare(b[1].slice(5)))],
    ["Rapport annuel d’évolution", () => Object.entries(MB_DONNEES().annees).map(a => [a[0], a[1]])]
  ];
  defs.forEach((d, i) => { MB_RAP_DATA[i] = { titre: d[0], cols: ["Indicateur", "Valeur"], rows: d[1]() }; });
  return `<div class="ev-bar"><button class="btn alt" onclick="window.print()">🖨 Imprimer tous les rapports</button><button class="btn alt" onclick="MB_EXPORT_JSON()">💾 Sauvegarde</button></div>
    <div class="mb-rapports">${defs.map((d, i) => {
      const r = MB_RAP_DATA[i];
      return `<div class="card rep"><div class="rep-h"><div><h3>${esc(d[0])}</h3><small>${r.rows.length} ligne(s)</small></div><div class="rep-b"><button class="btn alt" onclick="MB_EXPORT_RAP(${i})">⬇ CSV</button></div></div>
        <div class="tw"><table><thead><tr><th>Indicateur</th><th class="r">Valeur</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x[0])}</td><td class="r"><b>${esc(x[1])}</b></td></tr>`).join("") || `<tr><td colspan="2"><div class="empty">Aucune donnée.</div></td></tr>`}</tbody></table></div></div>`;
    }).join("")}</div>`;
}
function MB_EXPORT_RAP(i) { const r = MB_RAP_DATA[i]; if (r) finCSV(r.titre, r.cols, r.rows); }

/* ---- 9 · Connexion avec les autres modules ---- */
function MB_CONNEXION() {
  const l = MB_MEM();
  const contributions = (S.fin || []).filter(f => f.membre && f.statut === "Validé").length;
  const inscrits = (S.evt || []).reduce((a, e) => a + ((e.details && e.details.participants) || []).length, 0);
  const anniv = l.filter(m => String(m.naissance || "").slice(5) === today().slice(5)).length;
  const cartes = [
    ["✅ Présences", (SERVER_ATTENDANCE || []).length, "pointages enregistrés", "att"],
    ["💰 Finances", contributions, "contributions liées à des membres", "fin"],
    ["🎪 Événements", inscrits, "inscriptions aux événements", "evt"],
    ["🕊️ Départements", l.filter(m => m.dept).length, "membres affectés", "dep"],
    ["🔔 Notifications", anniv, "anniversaires du jour", ""],
    ["📊 Tableau de bord", l.length, "membres pris en compte", "dash"]
  ];
  return `<div class="mb-kpi">${cartes.map(c => `<div class="card stat"><b>${c[1]}</b><span>${esc(c[0])}<br><small>${esc(c[2])}</small></span>${c[3] ? `<div class="bar" style="justify-content:center;margin-top:8px"><button class="btn alt" onclick="go('${c[3]}')">Ouvrir</button></div>` : ""}</div>`).join("")}</div>` +
    MB_CARTE("Synchronisation", `<p class="cards-help">Les statistiques de ce module alimentent le tableau de bord général. Les fiches membres et leurs extensions sont conservées dans la base de données CAM et dans la sauvegarde locale du navigateur.</p>`);
}

/* ---- Vue principale ---- */
function mem() {
  const [t, tb] = tabs(["Vue d’ensemble", "Tous les membres", "Nouveau membre", "Nouvelles adhésions", "Gestion des familles", "Départements", "Statistiques & graphiques", "Suivi des membres", "Alertes", "Gestion administrative", "Rapports & exports", "Connexion modules", "Historique", "Paramètres"]);
  const l = MB_MEM();
  let b = "";
  if (t === "Vue d’ensemble") {
    b = MB_KPI() + `<div class="two">${MB_CARTE("Répartition hommes / femmes", MB_DONUT(MB_DONNEES().sexe))}${MB_CARTE("Membres par département", MB_BARS(MB_DONNEES().dept))}</div>` +
      MB_CARTE("Alertes du moment", `<div class="bar">${[["🎂 Anniversaires aujourd’hui", l.filter(m => String(m.naissance || "").slice(5) === today().slice(5)).length], ["📋 Dossiers incomplets", l.filter(MB_INCOMPLET).length], ["✅ À valider", l.filter(m => m.statut === "Nouveau converti").length]].map(a => `<span class="st" style="background:var(--p2);color:#fff">${esc(a[0])} : ${a[1]}</span>`).join("")}</div>`);
  } else if (t === "Tous les membres") {
    b = `<div class="ev-bar"><input type="search" id="mbq" placeholder="Rechercher nom, prénom, matricule, téléphone…" value="${esc(MB_Q)}" oninput="MB_FILTRE(this.value)" style="min-width:260px"><button class="btn alt" onclick="MB_EXPORT_CSV()">⬇ Excel</button></div>
      <div class="tw" id="mblist"><table><thead><tr><th>Nom</th><th>Prénom</th><th>Téléphone</th><th>Sexe</th><th>Adresse</th><th>Profession</th><th>Département</th><th>Église</th><th>Statut</th><th></th></tr></thead><tbody>` +
      (l.length ? l.map(m => `<tr data-q="${esc((m.nom + " " + (m.prenom || "") + " " + (m.tel || "") + " " + (m.adresse || "")).toLowerCase())}"><td><b>${esc(MB_NOM(m))}</b></td><td>${esc(m.prenom || "—")}</td><td>${esc(m.tel || "—")}</td><td>${esc(m.sexe || "—")}</td><td>${esc(m.adresse || "—")}</td><td>${esc(m.prof || "—")}</td><td>${esc(nm("depts", m.dept))}</td><td>${esc(nm("eglises", m.eg))}</td><td>${tag(m.statut || "Membre", (m.statut || "Membre") === "Membre" ? "g" : "w")}</td><td><button class="ed" onclick="MB_FICHE('${esc(m.id)}')">Fiche</button>${can("edit") ? `<button class="ed" onclick="openF('mem','${esc(m.id)}')">Modifier</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="10"><div class="empty">Aucun membre.</div></td></tr>`) + `</tbody></table></div>`;
  } else if (t === "Nouveau membre") {
    b = `<div class="card"><p class="cards-help">Créez la fiche depuis le formulaire standard, puis complétez le parcours, les documents et la famille depuis la fiche du membre.</p><div class="bar">${can("edit") ? `<button class="btn" onclick="openF('mem')">+ Nouveau membre</button>` : ""}<button class="btn alt" onclick="go('mem')">Voir la liste</button></div></div>`;
  } else if (t === "Nouvelles adhésions") {
    const a = l.filter(m => m.statut === "Nouveau converti" || MB_EXT(m).aValider);
    b = MB_CARTE("Adhésions à valider", a.length ? `<div class="tw"><table><thead><tr><th>Membre</th><th>Contact</th><th></th></tr></thead><tbody>${a.map(m => `<tr><td>${esc(MB_NOM(m))}</td><td>${esc(m.tel || "—")}</td><td><button class="btn sm" onclick="MB_VALIDER('${esc(m.id)}')">Valider</button><button class="btn alt" onclick="MB_FICHE('${esc(m.id)}')">Fiche</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Aucune adhésion en attente.</div>');
  } else if (t === "Gestion des familles") b = MB_FAMILLES();
  else if (t === "Départements") {
    b = MB_CARTE("Effectifs par département", `<div class="tw"><table><thead><tr><th>Département</th><th>Responsable</th><th class="r">Membres</th></tr></thead><tbody>${(S.depts || []).map(d => `<tr><td><b>${esc(d.nom)}</b></td><td>${esc(nm("members", d.resp))}</td><td class="r">${l.filter(m => m.dept === d.id).length}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty">Aucun département.</div></td></tr>`}</tbody></table></div>`);
  } else if (t === "Statistiques & graphiques") b = MB_GRAPHIQUES();
  else if (t === "Suivi des membres") b = MB_SEL ? MB_SUIVI(MB_SEL) : `<div class="ev-bar"><select onchange="MB_SEL=this.value;render()">${MB_OPT_MEMBRES("")}</select></div>` + MB_CARTE("Parcours individuel", '<div class="empty">Choisissez un membre pour voir son parcours.</div>');
  else if (t === "Alertes") b = MB_ALERTES();
  else if (t === "Gestion administrative") b = MB_ADMIN();
  else if (t === "Rapports & exports") b = MB_RAPPORTS();
  else if (t === "Connexion modules") b = MB_CONNEXION();
  else if (t === "Historique") {
    const j = []; l.forEach(m => (MB_EXT(m).historique || []).forEach(h => j.push({ nom: MB_NOM(m), ...h })));
    j.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    b = MB_CARTE("Journal des modifications", `<div class="tw"><table><thead><tr><th>Date</th><th>Membre</th><th>Action</th><th>Par</th></tr></thead><tbody>${j.slice(0, 80).map(h => `<tr><td>${esc(h.date)}</td><td>${esc(h.nom)}</td><td>${esc(h.action)}</td><td>${esc(h.par || "—")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Aucune modification.</div></td></tr>`}</tbody></table></div>`);
  } else b = MB_CARTE("Paramètres des membres", `<p class="cards-help">Statuts utilisés : ${MB_STATUTS.map(s => tag(s)).join(" ")}</p><p class="cards-help" style="margin-top:10px">Tranches d’âge : ${MB_TRANCHES.map(s => tag(s)).join(" ")}</p><div class="bar" style="margin-top:12px"><button class="btn alt" onclick="MB_EXPORT_JSON()">💾 Sauvegarde complète</button><button class="btn alt" onclick="go('adm')">⚙ Administration générale</button></div>`);

  return hdr("Membres", "Vue d’ensemble, statistiques, familles, suivi, alertes et rapports de l’effectif.", `<button class="btn alt" onclick="window.print()">🖨 Imprimer</button>`) + tb + b;
}

function MB_FILTRE(v) {
  MB_Q = v; const q = String(v).toLowerCase();
  document.querySelectorAll("#mblist tbody tr[data-q]").forEach(tr => { tr.style.display = tr.dataset.q.includes(q) ? "" : "none"; });
}
