/* ==========================================================================
   CAM — module Finance
   Caisses · Comptabilité · Facturation · Rapports financiers
   Chargé avant le script principal de index.html (fonctions appelées plus tard).
   ========================================================================== */

/* ---- Plan comptable : catégories de charges ---- */
const FIN_CHARGES = [
  ["Fonctionnement", "Électricité, eau, internet", "601"],
  ["Entretien",      "Nettoyage, réparation",      "602"],
  ["Logistique",     "Transport, matériel",        "603"],
  ["Personnel",      "Salaires, indemnités",       "604"],
  ["Ministère",      "Évangélisation, missions",   "605"],
  ["Événements",     "Conférences, séminaires",    "606"]
];

const FIN_ACC = {
  "Dîme": ["701", "Dîmes"], "Offrande": ["702", "Offrandes"], "Don": ["703", "Dons"],
  "Cotisation": ["704", "Cotisations"], "Projet spécial": ["705", "Projets spéciaux"],
  "Dépense": ["601", "Charges de fonctionnement"]
};

const FIN_COMPTE = f => {
  if (inc(f)) { const a = FIN_ACC[f.type] || ["706", "Autres recettes"]; return a[0] + " – " + a[1]; }
  const c = FIN_CHARGES.find(x => x[0] === (f.charge || ""));
  return c ? c[2] + " – " + c[0] : "601 – Charges de fonctionnement";
};

/* ---- Outils communs ---- */
const FIN_ISO = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const FIN_PERIODE = k => {
  const d = new Date(), de = new Date(d);
  if (k === "jour") return { de: FIN_ISO(d), a: FIN_ISO(d), lib: "Journée du " + fd(FIN_ISO(d)) };
  if (k === "semaine") { de.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { de: FIN_ISO(de), a: FIN_ISO(d), lib: "Du " + fd(FIN_ISO(de)) + " au " + fd(FIN_ISO(d)) }; }
  if (k === "mois") { de.setDate(1); return { de: FIN_ISO(de), a: FIN_ISO(d), lib: "Mois en cours · " + d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) }; }
  if (k === "trimestre") { de.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); return { de: FIN_ISO(de), a: FIN_ISO(d), lib: "Trimestre T" + (Math.floor(d.getMonth() / 3) + 1) + " · " + d.getFullYear() }; }
  de.setMonth(0, 1); return { de: FIN_ISO(de), a: FIN_ISO(d), lib: "Année " + d.getFullYear() };
};
const FIN_DANS = (f, p) => String(f.date || "") >= p.de && String(f.date || "") <= p.a;
const FIN_OPS = () => [...S.fin].sort((a, b) => String(a.date).localeCompare(String(b.date)));
const FIN_SOMME = l => l.reduce((a, f) => a + (Number(f.montant) || 0), 0);
const FIN_CELL_HTML = v => (v && typeof v === "object" && "html" in v) ? v.html : esc(v);
const FIN_CELL_TXT = v => (v && typeof v === "object" && "html" in v) ? v.text : (v == null ? "" : v);

let FIN_RAP_DATA = {}, FIN_FQ = "";
function FIN_FILTRE(v) {
  FIN_FQ = v;
  const q = String(v).toLowerCase();
  document.querySelectorAll("#fqtable tbody tr").forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

function finCSV(nom, entetes, lignes) {
  const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const csv = [entetes, ...lignes].map(r => r.map(cell).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = String(nom).replace(/[^\wÀ-ÿ\- ]/g, "_") + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Export CSV généré");
}
function finExport(id) { const r = FIN_RAP_DATA[id]; if (r) finCSV(r.titre, r.cols, r.rows); }

function finCarteRapport(id, titre, lib, cols, rows, totalLib, totalVal, note, extra) {
  FIN_RAP_DATA[id] = { titre, cols, rows: rows.map(r => r.map(FIN_CELL_TXT)) };
  const head = `<div class="rep-h"><div><h3>${titre}</h3><small>${lib}</small></div><div class="rep-b"><button class="btn alt" onclick="finExport('${id}')">⬇ CSV</button></div></div>`;
  const body = rows.length
    ? `<div class="tw"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === r.length - 1 ? ' class="r"' : ''}>${FIN_CELL_HTML(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">Aucune opération sur cette période.</div>';
  return `<div class="card rep" id="${id}">${head}${extra || ""}${body}<div class="rep-t"><span>${esc(totalLib)}</span><span>${esc(totalVal)}</span></div>${note ? `<p class="rep-n">${note}</p>` : ""}</div>`;
}

/* ==========================================================================
   1 · CAISSES
   ========================================================================== */
function cais() {
  const pe = S.fin.filter(f => f.statut === "En attente");
  const v = VO();
  const total = S.caisses.reduce((a, c) => a + bal(c.id), 0);
  const e = FIN_SOMME(v.filter(inc)), d = FIN_SOMME(v.filter(f => !inc(f)));

  const kpi = `<div class="grid fin-kpi">` +
    `<div class="card stat fin-entree"><b>${fmt(e)}</b><span>Entrées validées</span></div>` +
    `<div class="card stat fin-depense"><b>${fmt(d)}</b><span>Dépenses validées</span></div>` +
    `<div class="card stat fin-solde"><b>${fmt(total)}</b><span>Solde total · ${S.caisses.length} caisse(s)</span></div>` +
    `</div>`;

  const cartes = `<div class="caisse-grid">${S.caisses.map(c => {
    const ops = v.filter(f => f.caisse === c.id);
    const ce = FIN_SOMME(ops.filter(inc)), cd = FIN_SOMME(ops.filter(f => !inc(f)));
    const last = ops.length ? ops.map(f => f.date).sort().slice(-1)[0] : "";
    return `<div class="caisse-card">
      <div class="caisse-h"><div><b>${esc(c.nom)}</b><br>${tag(c.type || "Caisse")}</div><b class="${bal(c.id) >= 0 ? "in" : "out"}">${fmt(bal(c.id))}</b></div>
      <div class="caisse-meta">Responsable : ${esc(c.resp || "—")}${c.banque ? " · " + esc(c.banque) : ""}${c.numero ? " · " + esc(c.numero) : ""}</div>
      <div class="caisse-flux"><span>Entrées <b class="in">${fmt(ce)}</b></span><span>Sorties <b class="out">${fmt(cd)}</b></span><span>Ouverture <b>${fmt(Number(c.soldeInitial) || 0)}</b></span></div>
      <div class="caisse-act">${can("edit") ? `<button class="btn alt" onclick="openF('fin',null,{type:'Offrande',caisse:'${c.id}'})">+ Encaisser</button><button class="btn alt" onclick="openF('fin',null,{type:'Dépense',caisse:'${c.id}'})">− Décaisser</button>` : ""}${last ? `<small style="color:var(--mut)">Dernière opération : ${fd(last)}</small>` : ""}</div>
    </div>`;
  }).join("") || '<div class="empty">Aucune caisse ni compte. Cliquez sur « Nouvelle caisse / compte » pour commencer.</div>'}</div>`;

  const gestion = `<details class="card"><summary class="bloc-titre" style="cursor:pointer">⚙ Gérer les caisses et comptes (${S.caisses.length})</summary>` +
    tbl("caisse", [
      ["Nom", r => `<b>${esc(r.nom)}</b>`],
      ["Type", r => tag(r.type || "Caisse")],
      ["Responsable", r => esc(r.resp || "—")],
      ["Banque / N°", r => esc([r.banque, r.numero].filter(Boolean).join(" · ") || "—")],
      ["Ouverture", r => fmt(Number(r.soldeInitial) || 0)],
      ["Solde", r => `<b class="${bal(r.id) >= 0 ? "in" : "out"}">${fmt(bal(r.id))}</b>`]
    ], S.caisses) + `</details>`;

  const attente = `<div class="card"><h3>⚠ Décaissements à valider (${pe.length})</h3>` + (pe.length
    ? `<div class="tw"><table><thead><tr><th>Date</th><th>Caisse</th><th>Catégorie</th><th>Département</th><th>Montant</th><th>Motif</th><th></th></tr></thead><tbody>${pe.map(f => `<tr><td>${fd(f.date)}</td><td>${esc(nm("caisses", f.caisse))}</td><td>${esc(f.charge || "Non classée")}</td><td>${esc(nm("depts", f.dept) === "—" ? "—" : nm("depts", f.dept))}</td><td class="out">${fmt(f.montant)}</td><td>${esc(f.note || "")}</td><td>${can("valid") ? `<button class="ed" onclick="val('${f.id}')">Valider</button><button class="del" onclick="val('${f.id}',false)">Refuser</button>` : tag("Contrôle requis", "w")}</td></tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">Aucun décaissement en attente.</div>') + `</div>`;

  const journal = `<div class="card"><h3>Journal des 10 dernières opérations</h3>${tbl("fin", finCols, FIN_OPS().slice(-10).reverse(), finX)}</div>`;

  return hdr("Caisses", "Caisses, comptes bancaires, soldes d’ouverture, encaissements et décaissements.", add("caisse", "Nouvelle caisse / compte")) +
    kpi + cartes + gestion + attente + journal;
}

/* ==========================================================================
   2 · COMPTABILITÉ
   ========================================================================== */
function cpt() {
  const [t, tb] = tabs(["Plan comptable", "Résultat", "Bilan", "Grand livre", "Journal"]);
  const v = VO();
  const charges = v.filter(f => !inc(f));
  const parCharge = n => FIN_SOMME(charges.filter(f => (f.charge || "") === n));
  const nonClasse = FIN_SOMME(charges.filter(f => !f.charge));
  const produits = ["Dîme", "Offrande", "Don", "Cotisation", "Projet spécial"].map(k => [FIN_ACC[k][1], FIN_SOMME(v.filter(f => f.type === k))]);
  const pt = produits.reduce((a, x) => a + x[1], 0), ch = FIN_SOMME(charges), res = pt - ch;
  const iv = S.inv.reduce((a, i) => a + i.qte * i.val, 0);
  const tr = S.caisses.map(c => [c.nom, bal(c.id)]), trt = tr.reduce((a, x) => a + x[1], 0);
  let b;

  const row = (a, bb, s) => `<tr><td>${esc(a)}</td><td class="r">${s ? `<b>${fmt(bb)}</b>` : fmt(bb)}</td></tr>`;
  const T = (h, r) => `<div class="tw"><table><thead><tr><th>${h}</th><th class="r">Montant</th></tr></thead><tbody>${r}</tbody></table></div>`;

  if (t === "Plan comptable") {
    b = `<div class="card"><h3>Catégories de dépenses</h3><p class="cards-help">Référentiel utilisé pour classer chaque décaissement. La catégorie se choisit dans <b>Finances → Nouvelle opération</b> ou depuis <b>Caisses → Décaisser</b>.</p>` +
      `<div class="tw" style="margin-top:12px"><table><thead><tr><th>Catégorie</th><th>Exemples</th><th>N° compte</th><th class="r">Dépenses validées</th><th class="r">Nb</th></tr></thead><tbody>` +
      FIN_CHARGES.map(c => `<tr><td><b>${esc(c[0])}</b></td><td class="plan-ex">${esc(c[1])}</td><td>${tag(c[2])}</td><td class="r">${fmt(parCharge(c[0]))}</td><td class="r">${charges.filter(f => f.charge === c[0]).length}</td></tr>`).join("") +
      `<tr><td><b>Non classées</b></td><td class="plan-ex">Dépenses sans catégorie renseignée</td><td>${tag("601")}</td><td class="r">${fmt(nonClasse)}</td><td class="r">${charges.filter(f => !f.charge).length}</td></tr>` +
      `</tbody></table></div></div>` +
      `<div class="grid fin-kpi"><div class="card stat fin-depense"><b>${fmt(ch)}</b><span>Total des charges validées</span></div><div class="card stat fin-entree"><b>${fmt(pt)}</b><span>Total des produits</span></div><div class="card stat fin-solde"><b>${fmt(res)}</b><span>${res >= 0 ? "Excédent" : "Déficit"}</span></div></div>`;
  } else if (t === "Résultat") {
    b = T("Produits", produits.map(x => row(x[0], x[1])).join("") + row("Total produits", pt, 1)) +
      T("Charges", FIN_CHARGES.map(c => row(c[2] + " – " + c[0], parCharge(c[0]))).join("") + row("Non classées", nonClasse) + row("Total charges", ch, 1)) +
      `<div class="card stat ${res >= 0 ? "fin-entree" : "fin-depense"}"><b>${fmt(res)}</b><span>${res >= 0 ? "Excédent" : "Déficit"} de l’exercice</span></div>`;
  } else if (t === "Bilan") {
    b = `<div class="two">${T("Actif", tr.map(x => row("Trésorerie – " + x[0], x[1])).join("") + row("Matériel (inventaire)", iv) + row("Total actif", trt + iv, 1))}${T("Passif", row("Fonds associatif (matériel)", iv) + row("Résultat de l’exercice", res) + row("Total passif", iv + res, 1))}</div>`;
  } else if (t === "Grand livre") {
    const G = {};
    v.forEach(f => {
      const a = "571 – " + nm("caisses", f.caisse), cpt = FIN_COMPTE(f);
      const lib = f.type + (f.note ? " : " + f.note : "");
      (G[a] = G[a] || []).push({ d: f.date, l: lib, D: inc(f) ? f.montant : 0, C: inc(f) ? 0 : f.montant });
      (G[cpt] = G[cpt] || []).push({ d: f.date, l: lib, D: inc(f) ? 0 : f.montant, C: inc(f) ? f.montant : 0 });
    });
    b = Object.keys(G).sort().map(a => {
      const R = G[a].sort((x, y) => x.d.localeCompare(y.d));
      const D = R.reduce((s, e) => s + e.D, 0), Cc = R.reduce((s, e) => s + e.C, 0);
      return `<h3 class="bloc-titre">${esc(a)}</h3><div class="tw"><table><thead><tr><th>Date</th><th>Libellé</th><th class="r">Débit</th><th class="r">Crédit</th></tr></thead><tbody>${R.map(e => `<tr><td>${fd(e.d)}</td><td>${esc(e.l)}</td><td class="r">${e.D ? fmt(e.D) : ""}</td><td class="r">${e.C ? fmt(e.C) : ""}</td></tr>`).join("")}<tr><td></td><td><b>Solde ${fmt(Math.abs(D - Cc))} ${D >= Cc ? "débiteur" : "créditeur"}</b></td><td class="r"><b>${fmt(D)}</b></td><td class="r"><b>${fmt(Cc)}</b></td></tr></tbody></table></div>`;
    }).join("") || '<div class="empty">Aucune écriture validée.</div>';
  } else {
    b = `<div class="tw"><table><thead><tr><th>Date</th><th>N° / Réf.</th><th>Libellé</th><th>Compte</th><th>Caisse</th><th class="r">Débit</th><th class="r">Crédit</th></tr></thead><tbody>` +
      (v.length ? v.slice().sort((x, y) => String(x.date).localeCompare(String(y.date))).map(f => `<tr><td>${fd(f.date)}</td><td>${esc(f.num || f.ref || "—")}</td><td>${esc(f.type + (f.note ? " · " + f.note : ""))}</td><td>${esc(FIN_COMPTE(f))}</td><td>${esc(nm("caisses", f.caisse))}</td><td class="r">${inc(f) ? "" : fmt(f.montant)}</td><td class="r">${inc(f) ? fmt(f.montant) : ""}</td></tr>`).join("") : '<tr><td colspan="7"><div class="empty">Aucune écriture validée.</div></td></tr>') +
      `</tbody></table></div>`;
  }
  return hdr("Comptabilité", "Plan comptable, bilan, résultat, grand livre et journal générés depuis les opérations validées.") + tb + b;
}

/* ==========================================================================
   3 · FACTURATION
   ========================================================================== */
function voirFacture(id) {
  const d = find("docs", id); if (!d) return;
  const l = lines(d.lignes), total = tot(d);
  showM(`<div class="paper">
    <div class="hd">${logo(46)}${esc(S.cfg.name)}</div>
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:14px 0">
      <div><h3 style="margin:0">${esc(String(d.type || "Document").toUpperCase())}</h3><p style="margin:4px 0"><b>N° ${esc(d.num || "—")}</b></p><p style="margin:0;color:#555">Date : ${fd(d.date)}</p></div>
      <div style="text-align:right"><p style="margin:0 0 6px;color:#555">Statut</p>${tag(d.statut || "Brouillon", d.statut === "Payé" ? "g" : d.statut === "Envoyé" ? "w" : "")}</div>
    </div>
    <p><b>Client / fournisseur :</b> ${esc(d.client || "—")}</p>
    <table><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>${l.map(x => `<tr><td>${esc(x[0])}</td><td class="r">${fmt(x[1])}</td></tr>`).join("") || '<tr><td colspan="2"><div class="empty">Aucune ligne.</div></td></tr>'}</tbody></table>
    <div style="display:flex;justify-content:flex-end;gap:24px;margin-top:12px;padding-top:10px;border-top:2px solid #7c3aed;font-size:18px"><b>Total</b><b>${fmt(total)}</b></div>
    <p style="color:#666;font-size:12px;margin-top:18px">Document généré par CAM · ${esc(S.cfg.name)}. Aucun paiement n’est confirmé sans intégration d’un prestataire.</p>
    <div class="sig">Signature / cachet</div>
  </div>`);
}

function cot() {
  const [t, tb] = tabs(["Devis & factures", "Catégories", "Résumé"]);
  const docs = [...S.docs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const paye = FIN_SOMME(docs.filter(d => d.statut === "Payé").map(d => ({ montant: tot(d) })));
  const attente = FIN_SOMME(docs.filter(d => d.statut === "Envoyé").map(d => ({ montant: tot(d) })));
  const brouillons = docs.filter(d => d.statut === "Brouillon").length;
  let b;

  const kpi = `<div class="grid fact-kpi">` +
    `<div class="card stat fin-entree"><b>${fmt(paye)}</b><span>Encaissé (payé)</span></div>` +
    `<div class="card stat fin-solde"><b>${fmt(attente)}</b><span>En attente (envoyé)</span></div>` +
    `<div class="card stat"><b>${docs.length}</b><span>Documents</span></div>` +
    `<div class="card stat fin-depense"><b>${brouillons}</b><span>Brouillons</span></div>` +
    `</div>`;

  if (t === "Devis & factures") {
    const liste = docs;
    b = kpi + `<div class="bar"><input type="search" id="fq" placeholder="Rechercher n°, client, type…" value="${esc(FIN_FQ)}" oninput="FIN_FILTRE(this.value)" aria-label="Rechercher un document" style="min-width:240px">${add("docs", "Nouveau devis / facture")}</div><div id="fqtable">` +
      tbl("docs", [
        ["N°", r => tag(r.num || "—")],
        ["Type", r => tag(r.type || "Document")],
        ["Date", r => fd(r.date)],
        ["Client / fournisseur", r => `<b>${esc(r.client || "—")}</b>`],
        ["Lignes", r => lines(r.lignes).length],
        ["Total", r => `<b>${fmt(tot(r))}</b>`],
        ["Statut", r => tag(r.statut || "Brouillon", r.statut === "Payé" ? "g" : r.statut === "Envoyé" ? "w" : "")]
      ], liste, r => `<button class="ed" onclick="voirFacture('${r.id}')">👁 Voir</button>`) + `</div>`;
  } else if (t === "Catégories") {
    b = add("cats", "Nouvelle catégorie") + tbl("cats", [
      ["Catégorie", r => `<b>${esc(r.nom)}</b>`],
      ["Montant suggéré", r => fmt(r.montant)],
      ["Utilisée", r => tag(S.fin.filter(f => f.cat === r.id).length + " op.")]
    ], S.cats);
  } else {
    const parStatut = ["Brouillon", "Envoyé", "Payé"].map(s => {
      const l = docs.filter(d => d.statut === s);
      return [s, l.length, FIN_SOMME(l.map(d => ({ montant: tot(d) })))];
    });
    const parMois = {};
    docs.forEach(d => { const m = String(d.date || "").slice(0, 7); if (m) parMois[m] = (parMois[m] || 0) + tot(d); });
    b = kpi + T2("Par statut", ["Statut", "Documents", "Montant"], parStatut.map(x => [x[0], x[1], fmt(x[2])]), "Total", fmt(docs.reduce((a, d) => a + tot(d), 0))) +
      T2("Par mois", ["Mois", "Montant"], Object.keys(parMois).sort().reverse().map(m => [m, fmt(parMois[m])]), "Total", fmt(docs.reduce((a, d) => a + tot(d), 0)));
  }
  return hdr("Facturation", "Devis, factures, catégories et suivi des encaissements.", `<button class="btn alt" onclick="window.print()">🖨 Imprimer</button>`) + tb + b;
}

function T2(titre, cols, rows, totalLib, totalVal) {
  return `<div class="card"><h3>${esc(titre)}</h3><div class="tw"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ''}>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}"><div class="empty">Aucune donnée.</div></td></tr>`}</tbody></table></div><div class="rep-t"><span>${esc(totalLib)}</span><span>${esc(totalVal)}</span></div></div>`;
}

/* ==========================================================================
   4 · RAPPORTS FINANCIERS (12 rapports générés automatiquement)
   ========================================================================== */
function finToggleRapproche(id) { const f = find("fin", id); if (!f) return; f.rapproche = !f.rapproche; save(); render(); }

function rap() {
  const v = VO();
  const pJ = FIN_PERIODE("jour"), pS = FIN_PERIODE("semaine"), pM = FIN_PERIODE("mois"), pT = FIN_PERIODE("trimestre"), pA = FIN_PERIODE("annee");
  const rec = f => inc(f), dep = f => !inc(f);
  const aujourd = v.filter(f => FIN_DANS(f, pJ));
  const colsRec = ["Date", "Type", "Caisse", "Référence", "Libellé", "Montant"];
  const colsDep = ["Date", "Catégorie", "Caisse", "Référence", "Libellé", "Montant"];
  const ligRec = f => [fd(f.date), f.type, nm("caisses", f.caisse), f.num || f.ref || "—", f.note || "", fmt(f.montant)];
  const ligDep = f => [fd(f.date), f.charge || "Non classée", nm("caisses", f.caisse), f.ref || "—", f.note || "", fmt(f.montant)];

  const synthese = p => {
    const l = v.filter(f => FIN_DANS(f, p));
    const natures = ["Dîme", "Offrande", "Don", "Cotisation", "Projet spécial", "Dépense"];
    const rows = natures.map(n => { const x = l.filter(f => f.type === n); return [n, x.length, fmt(FIN_SOMME(x)), n === "Dépense" ? "Dépense" : "Recette"]; });
    const e = FIN_SOMME(l.filter(rec)), d = FIN_SOMME(l.filter(dep));
    return { rows, e, d };
  };

  const rapportNature = (id, titre, type) => {
    const l = v.filter(f => f.type === type);
    return finCarteRapport(id, titre, l.length + " opération(s) validée(s) · toutes périodes",
      ["Date", "Caisse", "Membre", "Référence", "Libellé", "Montant"],
      l.map(f => [fd(f.date), nm("caisses", f.caisse), f.membre ? nm("members", f.membre) : "Anonyme", f.num || f.ref || "—", f.note || "", fmt(f.montant)]),
      "Total " + titre.toLowerCase(), fmt(FIN_SOMME(l)));
  };

  const cartes = [];
  cartes.push(finCarteRapport("rap-1", "1 · Rapport journalier des recettes", pJ.lib, colsRec,
    aujourd.filter(rec).map(ligRec), "Total recettes du jour", fmt(FIN_SOMME(aujourd.filter(rec)))));
  cartes.push(finCarteRapport("rap-2", "2 · Rapport journalier des dépenses", pJ.lib, colsDep,
    aujourd.filter(dep).map(ligDep), "Total dépenses du jour", fmt(FIN_SOMME(aujourd.filter(dep)))));

  [["rap-3", "3 · Rapport hebdomadaire", pS], ["rap-4", "4 · Rapport mensuel", pM],
   ["rap-5", "5 · Rapport trimestriel", pT], ["rap-6", "6 · Rapport annuel", pA]].forEach(([id, titre, p]) => {
    const s = synthese(p);
    cartes.push(finCarteRapport(id, titre, p.lib, ["Nature", "Nb op.", "Montant", "Sens"], s.rows,
      "Recettes / Dépenses / Solde", fmt(s.e) + " / " + fmt(s.d) + " / " + fmt(s.e - s.d),
      "Généré automatiquement à partir des seules opérations validées."));
  });

  cartes.push(rapportNature("rap-7", "7 · Rapport des dîmes", "Dîme"));
  cartes.push(rapportNature("rap-8", "8 · Rapport des offrandes", "Offrande"));
  cartes.push(rapportNature("rap-9", "9 · Rapport des dons", "Don"));

  /* 10 · Dépenses par département */
  const depts = [...S.depts.map(d => [d.nom, d.id]), ["Non affecté", ""]];
  const depRows = depts.map(([nom, id]) => {
    const l = v.filter(dep).filter(f => (f.dept || "") === id);
    return [nom, l.length, fmt(FIN_SOMME(l))];
  }).filter(r => r[1] > 0 || r[0] === "Non affecté");
  const totDep = FIN_SOMME(v.filter(dep));
  cartes.push(finCarteRapport("rap-10", "10 · Rapport des dépenses par département", "Toutes périodes · opérations validées",
    ["Département", "Nb op.", "Montant"], depRows, "Total des dépenses", fmt(totDep),
    "Le département se renseigne dans Finances → Nouvelle opération."));

  /* 11 · Soldes par caisse et compte */
  const soldeRows = S.caisses.map(c => {
    const ops = v.filter(f => f.caisse === c.id);
    return [c.nom, c.type || "Caisse", fmt(Number(c.soldeInitial) || 0), fmt(FIN_SOMME(ops.filter(rec))), fmt(FIN_SOMME(ops.filter(dep))), fmt(bal(c.id))];
  });
  cartes.push(finCarteRapport("rap-11", "11 · Rapport des soldes par caisse et compte", "Soldes calculés : ouverture + entrées validées − sorties validées",
    ["Caisse / compte", "Type", "Ouverture", "Entrées", "Sorties", "Solde"], soldeRows,
    "Solde total", fmt(S.caisses.reduce((a, c) => a + bal(c.id), 0))));

  /* 12 · Rapprochement bancaire */
  const comptes = S.caisses.filter(c => c.type === "Compte bancaire").map(c => c.id);
  const banc = v.filter(f => comptes.includes(f.caisse));
  const rapRows = banc.map(f => {
    const ok = !!f.rapproche, ref = f.ref || "";
    return [fd(f.date), ref || "—", f.type + (f.note ? " · " + f.note : ""), inc(f) ? "Entrée" : "Sortie", fmt(f.montant),
      { html: `<button class="ed" onclick="finToggleRapproche('${f.id}')">${ok ? "✅ Rapproché" : "◻ À rapprocher"}</button>`, text: ok ? "Rapproché" : "À rapprocher" }];
  });
  const nbOk = banc.filter(f => f.rapproche).length;
  const noteRap = comptes.length
    ? "Cliquez sur le statut pour marquer une ligne comme rapprochée. Renseignez la « Référence / pièce » de chaque opération bancaire dans Finances."
    : "Aucun compte de type « Compte bancaire » : créez-en un dans Caisses pour activer ce rapport.";
  cartes.push(finCarteRapport("rap-12", "12 · Rapport de rapprochement bancaire", "Opérations des comptes bancaires · toutes périodes",
    ["Date", "Référence", "Libellé", "Sens", "Montant", "Statut"], rapRows,
    "Rapprochées / À rapprocher", nbOk + " / " + (banc.length - nbOk), noteRap));

  const entete = `<div class="grid fin-kpi">` +
    `<div class="card stat fin-entree"><b>${fmt(FIN_SOMME(v.filter(rec)))}</b><span>Total recettes validées</span></div>` +
    `<div class="card stat fin-depense"><b>${fmt(FIN_SOMME(v.filter(dep)))}</b><span>Total dépenses validées</span></div>` +
    `<div class="card stat fin-solde"><b>${fmt(S.caisses.reduce((a, c) => a + bal(c.id), 0))}</b><span>Solde toutes caisses</span></div>` +
    `<div class="card stat"><b>${v.length}</b><span>Opérations validées</span></div>` +
    `</div>`;

  return hdr("Rapports financiers", "12 rapports générés automatiquement depuis les opérations validées · générés le " + fd(FIN_ISO(new Date())),
    `<button class="btn alt" onclick="window.print()">🖨 Imprimer tous les rapports</button>`) +
    entete + `<div class="rep-grid">${cartes.join("")}</div>`;
}
