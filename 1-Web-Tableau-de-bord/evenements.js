/* ==========================================================================
   CAM — Module Événements (tableau de bord web)
   Calendrier · Fiche A–E · Statuts & validation · Inscriptions · Budget
   Équipes & tâches · Ressources · Communication · Rapports · Historique
   Les données enrichies sont stockées dans `evenement.details` (jsonb côté
   serveur) : les 2 PC partagent donc les mêmes informations.
   ========================================================================== */

const EV_STATUTS = ["Brouillon", "En attente de validation", "Programmé", "En cours", "Terminé", "Annulé", "Reporté"];
const EV_PUBLIES = ["Programmé", "En cours"];
const EV_CATEGORIES = ["Culte dominical", "Culte de prière", "Étude biblique", "Réunion des responsables", "Réunion des départements", "Veillée de prière", "Conférence", "Séminaire", "Retraite spirituelle", "Concert", "Formation", "Jeunesse", "Mission", "Action sociale", "Autre"];
const EV_CIBLES = ["Tout public", "Membres", "Visiteurs", "Responsables"];
const EV_COULEUR = {
  "Brouillon": "#6b7280", "En attente de validation": "#f59e0b", "Programmé": "#2563eb",
  "En cours": "#16a34a", "Terminé": "#7c3aed", "Annulé": "#dc2626", "Reporté": "#db2777"
};
const EV_JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

let EV_VUE = "mois", EV_CUR = new Date(), EV_SEL = "", EV_Q = "", EV_SYNC_CULT = true, EV_PHOTO = "", EV_PHOTO_LOADING = false, EV_RAP_DATA = {};

/* ---- Outils ---- */
const EV_ISO = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const EV_DATE = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
const EV_GET = id => S.evt.find(e => e.id === id);
const EV_X = e => (e && e.details && typeof e.details === "object") ? e.details : {};
const EV_EVENTS = () => [...S.evt].sort((a, b) => String(a.date).localeCompare(String(b.date)));
const EV_VALIDEUR = () => !!(SESSION && ["admin_general", "pasteur"].includes(SESSION.role));
const EV_BADGE = s => { const c = EV_COULEUR[s] || "#6b7280"; return `<span class="st" style="background:${c};color:#fff">${esc(s)}</span>`; };
const EV_QUI = () => SESSION ? SESSION.username : "—";

function EV_DEFAUT() {
  return {
    categorie: "", image: "", description: "", organisateur: "", responsable: "",
    dateDebut: "", heureDebut: "", dateFin: "", heureFin: "", lieu: "", adresse: "",
    publicCible: "Tout public", maxParticipants: "", participantsAttendus: "", departement: "", inscriptionObligatoire: "Non", dateLimite: "",
    participants: [], equipe: [], deptResponsables: "", materiel: "", salle: "", programme: "",
    budgetPrevisionnel: 0, depenses: [], recettes: [], contributions: [],
    statut: "Brouillon", creePar: "", validePar: "", taches: [], annonces: [], historique: []
  };
}
function EV_LOG(e, action) {
  const x = EV_X(e);
  e.details = { ...x, historique: [...(x.historique || []), {
    date: today() + " " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    action, par: EV_QUI()
  }] };
}

/* Envoie la fiche complète au backend (création = POST, sinon PATCH). */
function EV_POST(id, creer) {
  const e = EV_GET(id); if (!e) return Promise.resolve();
  const x = EV_X(e);
  const corps = {
    titre: e.titre, type: e.type || x.categorie || "Autre",
    date: e.date || x.dateDebut || today(),
    heure: x.heureDebut || e.heure || "",
    lieu: e.lieu || x.lieu || "",
    description: e.desc || x.description || "",
    details: e.details || {}
  };
  return fetch("/api/admin/events" + (creer ? "" : "/" + encodeURIComponent(id)), {
    method: creer ? "POST" : "PATCH", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps)
  }).then(r => r.text().then(t => {
    let d = {}; try { d = t ? JSON.parse(t) : {}; } catch (_) {}
    if (!r.ok) throw new Error(d.message || "Erreur " + r.status);
    return d;
  }));
}
function EV_MAJ(id, patch, action) {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const e = EV_GET(id); if (!e) return;
  const detailsAvant = EV_X(e);
  e.details = { ...EV_X(e), ...patch };
  if (action) EV_LOG(e, action);
  save();
  render();
  EV_POST(id).then(() => {
    save();
  }).catch(err => {
    e.details = detailsAvant;
    save();
    render();
    toast("Enregistrement serveur impossible : " + err.message, "warn");
  });
}
function EV_LISTE_PUSH(id, cle, objet, action) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e), l = [...(x[cle] || []), { ...objet, id: uid() }];
  EV_MAJ(id, { [cle]: l }, action || "Ajout " + cle);
}
function EV_LISTE_DEL(id, cle, itemId) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e), l = (x[cle] || []).filter(i => String(i.id) !== String(itemId));
  EV_MAJ(id, { [cle]: l }, "Suppression " + cle);
}

/* ---- Formulaire A–E ---- */
const EV_CHAMP = (lab, n, v, type, opts, full) => `<div class="${full ? "full" : ""}"><label for="ev_${n}">${lab}</label>` +
  (type === "select"
    ? `<select id="ev_${n}">${(opts || []).map(o => `<option${String(v) === String(o) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : type === "textarea"
      ? `<textarea id="ev_${n}" rows="3">${esc(v == null ? "" : v)}</textarea>`
      : `<input id="ev_${n}" type="${type || "text"}" value="${esc(v == null ? "" : v)}">`) + `</div>`;

function EV_LIRE_AFFICHE(input) {
  const f = input.files && input.files[0]; if (!f) return;
  if (!f.type.startsWith("image/")) { toast("Choisissez un fichier image.", "warn"); return; }
  EV_PHOTO_LOADING = true;
  const saveButton = document.getElementById("ev_save");
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Préparation de l’image…"; }
  const r = new FileReader();
  r.onerror = () => {
    EV_PHOTO_LOADING = false;
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "💾 Enregistrer"; }
    toast("Impossible de lire ce fichier image.", "warn");
  };
  r.onload = () => {
    const image = new Image();
    image.onerror = () => {
      EV_PHOTO_LOADING = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = "💾 Enregistrer"; }
      toast("Impossible de traiter ce fichier image.", "warn");
    };
    image.onload = () => {
      const max = 420, scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.55, data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 15000 && quality > 0.2) {
        quality -= 0.1;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      EV_PHOTO_LOADING = false;
      if (data.length > 15000) {
        toast("Image trop volumineuse. Utilisez une image plus petite ou une adresse HTTPS.", "warn");
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = "💾 Enregistrer"; }
        return;
      }
      EV_PHOTO = data;
      const preview = document.getElementById("ev_apercu");
      if (preview) { preview.src = data; preview.style.display = "block"; }
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = "💾 Enregistrer"; }
    };
    image.src = r.result;
  };
  r.readAsDataURL(f);
}

function ouvrirEvenement(id) {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const e = id ? EV_GET(id) : null, x = e ? EV_X(e) : EV_DEFAUT();
  EV_PHOTO = "";
  const v = n => x[n] == null ? "" : x[n];
  const titre = e ? e.titre : "", date = e ? e.date : today(), fin = e ? (e.fin || e.date) : today();
  const statutDefaut = e ? (x.statut || "Programmé") : (EV_VALIDEUR() ? "Programmé" : "En attente de validation");
  const options = EV_STATUTS.filter(s => e || s !== "Terminé");

  const form = `
    <div class="ev-sec"><h4>A · Informations générales</h4><div class="ev-form">
      ${EV_CHAMP("Titre de l’événement *", "titre", titre)}
      ${EV_CHAMP("Catégorie", "categorie", v("categorie") || (e ? e.type : ""), "select", EV_CATEGORIES)}
      ${EV_CHAMP("Organisateur", "organisateur", v("organisateur"))}
      ${EV_CHAMP("Responsable de l’événement", "responsable", v("responsable"))}
      <div class="full"><label for="ev_image">Image / affiche (URL ou fichier)</label>
        <input id="ev_image" type="text" value="${esc(v("image") || "" )}" placeholder="https://… ou choisissez un fichier">
        <input id="ev_fichier" type="file" accept="image/*" onchange="EV_LIRE_AFFICHE(this)" style="margin-top:6px">
        <img id="ev_apercu" src="${esc(v("image") || "")}" alt="" style="display:${v("image") ? "block" : "none"};max-height:90px;border-radius:10px;margin-top:8px">
      </div>
      ${EV_CHAMP("Description", "description", v("description") || (e ? e.desc : ""), "textarea", null, true)}
    </div></div>

    <div class="ev-sec"><h4>B · Programmation</h4><div class="ev-form">
      ${EV_CHAMP("Date de début", "dateDebut", v("dateDebut") || date, "date")}
      ${EV_CHAMP("Heure de début", "heureDebut", v("heureDebut"), "time")}
      ${EV_CHAMP("Date de fin", "dateFin", v("dateFin") || fin, "date")}
      ${EV_CHAMP("Heure de fin", "heureFin", v("heureFin"), "time")}
      ${EV_CHAMP("Lieu", "lieu", v("lieu") || (e ? e.lieu : ""))}
      ${EV_CHAMP("Adresse", "adresse", v("adresse"))}
      <div><label for="ev_departement">Département concerné</label><select id="ev_departement"><option value="">Tous les départements</option>${(S.depts || []).map(d => `<option value="${esc(d.nom)}"${v("departement") === d.nom ? " selected" : ""}>${esc(d.nom)}</option>`).join("")}</select></div>
    </div></div>

    <div class="ev-sec"><h4>C · Participants</h4><div class="ev-form">
      ${EV_CHAMP("Public cible", "publicCible", v("publicCible") || "Tout public", "select", EV_CIBLES)}
      ${EV_CHAMP("Nombre maximum", "maxParticipants", v("maxParticipants"), "number")}
      ${EV_CHAMP("Participants attendus", "participantsAttendus", v("participantsAttendus"), "number")}
      ${EV_CHAMP("Inscription", "inscriptionObligatoire", v("inscriptionObligatoire") || "Non", "select", ["Facultative", "Obligatoire", "Non"])}
      ${EV_CHAMP("Date limite d’inscription", "dateLimite", v("dateLimite"), "date")}
    </div></div>

    <div class="ev-sec"><h4>D · Organisation</h4><div class="ev-form">
      ${EV_CHAMP("Équipe d’organisation (noms séparés par des virgules)", "equipeTxt", (Array.isArray(x.equipe) ? x.equipe.map(a => a.nom).join(", ") : ""), "text", null, true)}
      ${EV_CHAMP("Responsables des départements", "deptResponsables", v("deptResponsables"), "text", null, true)}
      ${EV_CHAMP("Salle à réserver", "salle", v("salle"))}
      ${EV_CHAMP("Matériel nécessaire", "materiel", v("materiel"), "textarea", null, true)}
      ${EV_CHAMP("Programme détaillé", "programme", v("programme"), "textarea", null, true)}
    </div></div>

    <div class="ev-sec"><h4>E · Finances & publication</h4><div class="ev-form">
      ${EV_CHAMP("Budget prévisionnel (FCFA)", "budgetPrevisionnel", v("budgetPrevisionnel") || 0, "number")}
      ${EV_CHAMP("Statut", "statut", statutDefaut, "select", options)}
    </div></div>`;

  showM(`<h3>${e ? "Modifier" : "Créer"} un événement</h3>
    <p class="cards-help">Les champs D et E se complètent aussi ensuite depuis les onglets Équipes, Ressources et Budget.</p>
    ${form}
    <div class="bar" style="margin:14px 0 0">
      <button class="btn" id="ev_save" onclick="EV_SAVE_FORM('${e ? esc(e.id) : ""}')">💾 Enregistrer</button>
      <button class="btn alt" onclick="closeM()">Annuler</button>
    </div>`);
}

function EV_SAVE_FORM(id) {
  const g = n => { const el = document.getElementById("ev_" + n); return el ? String(el.value).trim() : ""; };
  const titre = g("titre"), dateDebut = g("dateDebut") || today();
  const dateFin = g("dateFin") || dateDebut;
  const button = document.getElementById("ev_save");
  if (EV_PHOTO_LOADING) { toast("Attendez la fin de la préparation de l’image.", "warn"); return; }
  if (!titre) { toast("Le titre est obligatoire", "warn"); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut) || !/^\d{4}-\d{2}-\d{2}$/.test(dateFin) || dateFin < dateDebut) {
    toast("Vérifiez les dates de début et de fin.", "warn"); return;
  }
  if (g("maxParticipants") && (!Number.isInteger(Number(g("maxParticipants"))) || Number(g("maxParticipants")) < 0)) {
    toast("Le nombre maximum doit être un entier positif.", "warn"); return;
  }
  if (g("participantsAttendus") && (!Number.isInteger(Number(g("participantsAttendus"))) || Number(g("participantsAttendus")) < 0)) {
    toast("Le nombre attendu doit être un entier positif.", "warn"); return;
  }
  const ancien = id ? EV_X(EV_GET(id)) : EV_DEFAUT();
  const equipe = g("equipeTxt").split(",").map(s => s.trim()).filter(Boolean)
    .map(nom => ({ id: uid(), nom, role: "Bénévole", dept: "" }));
  const details = {
    ...ancien,
    categorie: g("categorie"), image: EV_PHOTO || g("image") || "", description: g("description"),
    organisateur: g("organisateur"), responsable: g("responsable"),
    dateDebut, heureDebut: g("heureDebut"), dateFin, heureFin: g("heureFin"),
    lieu: g("lieu"), adresse: g("adresse"),
    departement: g("departement"), publicCible: g("publicCible"), maxParticipants: g("maxParticipants"),
    participantsAttendus: g("participantsAttendus"),
    inscriptionObligatoire: g("inscriptionObligatoire"), dateLimite: g("dateLimite"),
    equipe, deptResponsables: g("deptResponsables"), materiel: g("materiel"),
    salle: g("salle"), programme: g("programme"),
    budgetPrevisionnel: Number(g("budgetPrevisionnel")) || 0,
    statut: g("statut"), creePar: ancien.creePar || EV_QUI()
  };
  const base = {
    titre, type: details.categorie || "Autre", date: dateDebut,
    fin: details.dateFin || dateDebut, heure: details.heureDebut,
    lieu: details.lieu, desc: details.description
  };
  if (id) {
    const e = EV_GET(id); if (!e) return;
    const ancienEvenement = { ...e, details: EV_X(e) };
    Object.assign(e, base); e.details = details;
    EV_LOG(e, "Modification de la fiche");
    if (button) { button.disabled = true; button.textContent = "Enregistrement…"; }
    EV_POST(id).then(() => {
      save(); EV_SEL = id; closeM(); render(); toast("Événement enregistré");
    }).catch(err => {
      Object.assign(e, ancienEvenement);
      if (button) { button.disabled = false; button.textContent = "💾 Enregistrer"; }
      toast("Serveur : " + err.message, "warn");
    });
  } else {
    const created = { ...base, details: { ...details, historique: [...(details.historique || []), {
      date: today() + " " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      action: "Création de l’événement", par: EV_QUI()
    }] } };
    if (button) { button.disabled = true; button.textContent = "Enregistrement…"; }
    fetch("/api/admin/events", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, description: details.description, heure: details.heureDebut, details: created.details })
    }).then(r => r.text().then(t => { let d = {}; try { d = t ? JSON.parse(t) : {}; } catch (_) {} if (!r.ok) throw new Error(d.message || "Erreur " + r.status); return d; }))
      .then(d => {
        S.evt.push({ id: d.id, ...base, eg: S.eglises[0] ? S.eglises[0].id : "", details: created.details, active: true });
        save(); EV_SEL = d.id; closeM(); render(); toast("Événement créé");
      }).catch(err => {
        if (button) { button.disabled = false; button.textContent = "💾 Enregistrer"; }
        toast("Création impossible : " + err.message, "warn");
      });
  }
}

/* ---- Statuts & validation ---- */
function EV_STATUT(id, s) {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e), avant = x.statut || "Programmé";
  if (s === "Programmé" && avant === "En attente de validation" && !EV_VALIDEUR()) {
    toast("Seul l’administrateur ou le pasteur peut valider la publication", "warn"); return;
  }
  const detailsAvant = x;
  e.details = { ...x, statut: s,
    validePar: s === "Programmé" ? EV_QUI() : (x.validePar || "") };
  EV_LOG(e, "Statut : " + avant + " → " + s);
  save(); EV_POST(id).then(() => { render(); toast("Statut → " + s); }).catch(err => {
    e.details = detailsAvant; save(); render();
    toast("Serveur : " + err.message, "warn");
  });
}

/* ---- Fiche détaillée ---- */
function EV_DETAIL(id) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e);
  const lig = (k, v) => `<div style="display:flex;gap:8px;font-size:13px;padding:3px 0"><span style="color:var(--mut);min-width:150px">${k}</span><b>${esc(v || "—")}</b></div>`;
  const actions = `<div class="bar" style="flex-wrap:wrap">
    ${can("edit") ? `<button class="btn" onclick="closeM();ouvrirEvenement('${esc(id)}')">✎ Modifier</button>` : ""}
    <button class="btn alt" onclick="closeM();EV_AFFICHE('${esc(id)}')">🖼 Affiche</button>
    <button class="btn alt" onclick="closeM();EV_EXPORT_PART('${esc(id)}','csv')">⬇ Excel</button>
    <button class="btn alt" onclick="closeM();EV_EXPORT_PART('${esc(id)}','pdf')">📄 PDF</button>
    <button class="btn alt" onclick="closeM();EV_NOTIFIER('${esc(id)}')">📣 Annonce</button>
    <button class="btn alt" onclick="closeM();EV_RAPPORT('${esc(id)}')">📑 Rapport</button>
  </div>`;
  const selectStatut = can("edit")
    ? `<select id="ev_statut_sel" onchange="EV_STATUT('${esc(id)}',this.value);closeM()">${EV_STATUTS.map(s => `<option${s === (x.statut || "Programmé") ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`
    : EV_BADGE(x.statut || "Programmé");
  showM(`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div><h3 style="margin:0">${esc(e.titre)}</h3><p class="cards-help">${esc(x.categorie || e.type)} · ${fd(e.date)}${x.heureDebut ? " à " + esc(x.heureDebut) : ""}</p></div>
      <div>${EV_BADGE(x.statut || "Programmé")}</div></div>
    ${x.image ? `<img src="${esc(x.image)}" alt="" style="max-height:150px;border-radius:12px;margin:10px 0">` : ""}
    <div class="ev-detail" style="margin-top:12px">
      <div class="card"><h4>A · Général</h4>${lig("Description", x.description || e.desc)}${lig("Organisateur", x.organisateur)}${lig("Responsable", x.responsable)}${lig("Créé par", x.creePar)}${lig("Validé par", x.validePar)}</div>
      <div class="card"><h4>B · Programmation</h4>${lig("Début", fd(x.dateDebut || e.date) + (x.heureDebut ? " · " + x.heureDebut : ""))}${lig("Fin", fd(x.dateFin || e.fin) + (x.heureFin ? " · " + x.heureFin : ""))}${lig("Lieu", x.lieu || e.lieu)}${lig("Adresse", x.adresse)}${lig("Département", x.departement)}</div>
      <div class="card"><h4>C · Participants</h4>${lig("Public cible", x.publicCible)}${lig("Maximum", x.maxParticipants)}${lig("Attendus", x.participantsAttendus)}${lig("Inscription", x.inscriptionObligatoire)}${lig("Date limite", x.dateLimite ? fd(x.dateLimite) : "")}${lig("Inscrits", (x.participants || []).length + (SERVER_REGISTRATIONS || []).filter(r => r.eventId === id).length)}</div>
      <div class="card"><h4>D · Organisation</h4>${lig("Équipe", (x.equipe || []).map(a => a.nom).join(", "))}${lig("Départements", x.deptResponsables)}${lig("Salle", x.salle)}${lig("Matériel", x.materiel)}</div>
    </div>
    <div class="ev-sec" style="margin-top:12px"><h4>Changer le statut</h4>${selectStatut}
      <p class="cards-help" style="margin-top:6px">Un événement créé par un responsable reste « En attente de validation » jusqu’à validation par l’administrateur ou le pasteur. Seuls les statuts Programmé / En cours sont visibles dans l’application mobile.</p></div>
    ${actions}`);
}

/* ---- Affiche automatique ---- */
function EV_AFFICHE(id) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e);
  showM(`<div class="affiche">
    ${logo(60) ? `<div style="margin-bottom:8px">${logo(60)}</div>` : ""}
    <div style="font-size:13px;letter-spacing:3px;opacity:.85">${esc(S.cfg.name)}</div>
    ${x.image ? `<img class="af-img" src="${esc(x.image)}" alt="">` : ""}
    <h2>${esc(e.titre)}</h2>
    <div class="af-date">${fd(x.dateDebut || e.date)}${x.dateFin && x.dateFin !== (x.dateDebut || e.date) ? " → " + fd(x.dateFin) : ""}${x.heureDebut ? " · " + esc(x.heureDebut) : ""}</div>
    <div class="af-lieu">📍 ${esc(x.lieu || e.lieu || "—")}${x.adresse ? " · " + esc(x.adresse) : ""}</div>
    <p style="max-width:520px;margin:18px auto 0;opacity:.92;font-size:14px">${esc(x.description || e.desc || "")}</p>
    <div style="margin-top:24px;font-size:12px;opacity:.7">${esc(x.categorie || e.type || "")} · ${esc(S.cfg.name)}</div>
  </div>
  <div class="bar noprint" style="margin-top:12px"><button class="btn" onclick="imprimerModal()">🖨 Imprimer l’affiche</button><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
}

/* ---- Export participants (Excel = CSV, PDF = impression) ---- */
function EV_EXPORT_PART(id, fmt) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e), p = x.participants || [];
  const cols = ["Nom", "Prénoms", "Téléphone", "Statut", "Date d’inscription"];
  const rows = p.map(a => [a.nom || "", a.prenoms || "", a.tel || "", a.statut || "Inscrit", a.date || ""]);
  if (fmt === "csv") { finCSV("Participants - " + e.titre, cols, rows); return; }
  showM(`<div class="paper"><div class="hd">${logo(46)}${esc(S.cfg.name)}</div>
    <h3>Liste des participants — ${esc(e.titre)}</h3>
    <p>${fd(x.dateDebut || e.date)} · ${esc(x.lieu || e.lieu || "")} · ${p.length} inscrit(s)</p>
    <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="5"><div class="empty">Aucun participant.</div></td></tr>`}</tbody></table>
    <div class="sig">Le responsable de l’événement</div></div>
    <div class="bar noprint" style="margin-top:12px"><button class="btn" onclick="imprimerModal()">🖨 Imprimer / PDF</button><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
}

/* ---- Communication / notifications ---- */
function EV_NOTIFIER(id) {
  const e = EV_GET(id); if (!e) return;
  showM(`<h3>📣 Annonce — ${esc(e.titre)}</h3>
    <p class="cards-help">Le message est déposé dans le fil de chaque membre actif (visible dans l’application mobile) et archivé dans l’historique de l’événement.</p>
    <label for="ev_cible" style="font-size:12px;color:var(--mut)">Public cible</label>
    <select id="ev_cible">${EV_CIBLES.map(c => `<option>${esc(c)}</option>`).join("")}</select>
    <label for="ev_msg" style="font-size:12px;color:var(--mut);display:block;margin-top:8px">Message</label>
    <textarea id="ev_msg" rows="5" placeholder="Ex. : Le séminaire de jeunesse aura lieu samedi à 9h au temple principal.">${esc("Rendez-vous le " + fd(EV_X(e).dateDebut || e.date) + " pour « " + e.titre + " »" + (EV_X(e).lieu ? " à " + EV_X(e).lieu : "") + ".")}</textarea>
    <div class="bar" style="margin-top:12px"><button class="btn" onclick="EV_ENVOYER('${esc(id)}')">📤 Envoyer aux membres</button>
      <button class="btn alt" onclick="EV_ARCHIVER('${esc(id)}')">Archiver sans envoyer</button>
      <button class="btn alt" onclick="closeM()">Annuler</button></div>`);
}
function EV_ENVOYER(id) {
  if (!can("edit")) { toast("Envoi réservé à la direction", "warn"); return; }
  const e = EV_GET(id); if (!e) return;
  const msg = (document.getElementById("ev_msg") || {}).value || "";
  const cible = (document.getElementById("ev_cible") || {}).value || "Membres";
  if (!msg.trim()) { toast("Le message est vide", "warn"); return; }
  const btn = document.querySelector("#modal .btn");
  if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }
  fetch("/api/admin/events/" + encodeURIComponent(id) + "/notify", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, cible })
  }).then(r => r.text().then(t => { let d = {}; try { d = t ? JSON.parse(t) : {}; } catch (_) {} if (!r.ok) throw new Error(d.message || "Erreur " + r.status); return d; }))
    .then(d => {
      EV_LISTE_PUSH(id, "annonces", { titre: "Annonce", message: msg, cible, date: today(), envoyee: true, destinataires: d.destinataires }, "Annonce envoyée à " + d.destinataires + " membre(s)");
      closeM(); toast("Annonce envoyée à " + d.destinataires + " membre(s)");
    })
    .catch(err => { if (btn) { btn.disabled = false; btn.textContent = "📤 Envoyer aux membres"; } toast("Envoi impossible : " + err.message, "warn"); });
}
function EV_ARCHIVER(id) {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const msg = (document.getElementById("ev_msg") || {}).value || "";
  const cible = (document.getElementById("ev_cible") || {}).value || "Membres";
  EV_LISTE_PUSH(id, "annonces", { titre: "Annonce", message: msg, cible, date: today(), envoyee: false }, "Annonce archivée");
  closeM(); toast("Annonce archivée");
}

/* ---- Rapport automatique après événement ---- */
function EV_RAPPORT(id) {
  const e = EV_GET(id); if (!e) return;
  const x = EV_X(e), p = x.participants || [];
  const dep = (x.depenses || []).reduce((a, d) => a + (Number(d.montant) || 0), 0);
  const rec = (x.recettes || []).reduce((a, d) => a + (Number(d.montant) || 0), 0);
  const con = (x.contributions || []).reduce((a, d) => a + (Number(d.montant) || 0), 0);
  const prev = Number(x.budgetPrevisionnel) || 0;
  const taches = x.taches || [], faites = taches.filter(t => t.fait).length;
  const presents = (SERVER_ATTENDANCE || []).filter(r => r.eventId === id && r.present !== false).length;
  const cols = ["Indicateur", "Valeur"];
  const rows = [
    ["Statut", x.statut || "Programmé"], ["Date", fd(x.dateDebut || e.date)],
    ["Lieu", x.lieu || e.lieu || "—"], ["Public cible", x.publicCible || "—"],
    ["Inscrits", p.length], ["Présences enregistrées (QR / badges)", presents],
    ["Budget prévisionnel", fmt(prev)], ["Dépenses engagées", fmt(dep)],
    ["Recettes", fmt(rec)], ["Contributions", fmt(con)],
    ["Bilan financier", fmt(rec + con - dep)], ["Écart / prévision", fmt(prev - dep)],
    ["Tâches réalisées", faites + " / " + taches.length], ["Annonces", (x.annonces || []).length]
  ];
  EV_RAP_DATA[id] = { titre: "Rapport - " + e.titre, cols, rows };
  showM(`<h3>📑 Rapport après événement — ${esc(e.titre)}</h3>
    <p class="cards-help">Généré automatiquement depuis la fiche, les inscriptions, le budget, les tâches et les pointages.</p>
    <div class="tw" style="margin-top:12px"><table><thead><tr><th>Indicateur</th><th>Valeur</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="r"><b>${esc(r[1])}</b></td></tr>`).join("")}</tbody></table></div>
    <div class="bar noprint" style="margin-top:12px"><button class="btn alt" onclick="EV_EXPORT_RAPPORT('${esc(id)}')">⬇ CSV</button><button class="btn" onclick="imprimerModal()">🖨 Imprimer / PDF</button><button class="btn alt" onclick="closeM()">Fermer</button></div>`);
}

/* ---- Calendrier (mois / semaine / jour + synchro activités) ---- */
function EV_ITEMS() {
  const evs = EV_EVENTS().map(e => ({
    id: e.id, titre: e.titre, date: e.date,
    heure: EV_X(e).heureDebut || e.heure || "", statut: EV_X(e).statut || "Programmé", act: false
  }));
  const acts = EV_SYNC_CULT ? S.cult.map(c => ({
    id: "act", titre: c.titre || c.type || "Activité", date: c.date,
    heure: c.heure || "", statut: "", act: true
  })) : [];
  return [...evs, ...acts].sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}
function EV_CHIP(it) {
  const c = it.act ? "" : (EV_COULEUR[it.statut] || "#2563eb");
  const clic = it.act ? "" : `onclick="EV_SEL='${esc(it.id)}';EV_DETAIL('${esc(it.id)}')"`;
  return `<button class="cal-chip${it.act ? " act" : ""}" ${it.act ? "disabled" : clic} style="${it.act ? "" : "background:" + c}">${it.heure ? esc(it.heure) + " · " : ""}${esc(it.titre)}</button>`;
}
function EV_NAV(delta) {
  const d = new Date(EV_CUR);
  if (EV_VUE === "mois") d.setMonth(d.getMonth() + delta);
  else if (EV_VUE === "semaine") d.setDate(d.getDate() + 7 * delta);
  else d.setDate(d.getDate() + delta);
  EV_CUR = d; render();
}
function EV_CAL() {
  const items = EV_ITEMS(), parJour = {};
  items.forEach(i => { (parJour[i.date] = parJour[i.date] || []).push(i); });
  const nav = `<div class="cal-head"><b>${EV_VUE === "mois"
      ? EV_CUR.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      : EV_VUE === "semaine" ? "Semaine du " + fd(EV_ISO(new Date(EV_CUR.getTime() - ((EV_CUR.getDay() + 6) % 7) * 86400000)))
        : fd(EV_ISO(EV_CUR))}</b>
    <div class="cal-nav">
      ${["mois", "semaine", "jour"].map(v => `<button class="btn ${v === EV_VUE ? "" : "alt"}" onclick="EV_VUE='${v}';render()">${v === "mois" ? "Mois" : v === "semaine" ? "Semaine" : "Jour"}</button>`).join("")}
      <button class="btn alt" onclick="EV_NAV(-1)">←</button><button class="btn alt" onclick="EV_CUR=new Date();render()">Aujourd’hui</button><button class="btn alt" onclick="EV_NAV(1)">→</button>
      <button class="btn alt" onclick="EV_SYNC_CULT=!EV_SYNC_CULT;render()">${EV_SYNC_CULT ? "✓" : "◻"} Activités & cultes</button>
    </div></div>`;
  let corps = "";
  if (EV_VUE === "mois") {
    const first = new Date(EV_CUR.getFullYear(), EV_CUR.getMonth(), 1);
    const debut = new Date(first); debut.setDate(1 - ((first.getDay() + 6) % 7));
    const cells = [];
    for (let i = 0; i < 42; i++) { const d = new Date(debut); d.setDate(debut.getDate() + i); cells.push(d); }
    corps = `<div class="cal-grid">${EV_JOURS.map(j => `<div class="cal-lbl">${j}</div>`).join("")}${cells.map(d => {
      const iso = EV_ISO(d), l = parJour[iso] || [];
      const cls = [d.getMonth() !== EV_CUR.getMonth() ? "cal-out" : "", iso === EV_ISO(new Date()) ? "cal-today" : ""].filter(Boolean).join(" ");
      return `<div class="${cls}"><div class="cal-num">${d.getDate()}</div>${l.slice(0, 3).map(EV_CHIP).join("")}${l.length > 3 ? `<small class="ev-vide">+${l.length - 3} autre(s)</small>` : ""}</div>`;
    }).join("")}</div>`;
  } else if (EV_VUE === "semaine") {
    const lundi = new Date(EV_CUR); lundi.setDate(EV_CUR.getDate() - ((EV_CUR.getDay() + 6) % 7));
    corps = `<div class="cal-semaine">${Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lundi); d.setDate(lundi.getDate() + i);
      const iso = EV_ISO(d), l = parJour[iso] || [];
      return `<div class="cal-col"><h4>${EV_JOURS[i]} ${d.getDate()}</h4>${l.map(EV_CHIP).join("") || '<small class="ev-vide">—</small>'}</div>`;
    }).join("")}</div>`;
  } else {
    const iso = EV_ISO(EV_CUR), l = parJour[iso] || [];
    corps = `<div class="cal-liste">${l.length ? l.map(i => `<div class="cal-lig">${EV_BADGE(i.act ? "Activité" : i.statut)}<div style="flex:1"><b>${esc(i.titre)}</b><div class="ev-vide">${i.heure ? esc(i.heure) + " · " : ""}${i.act ? "Culte / activité (calendrier général)" : esc(EV_X(EV_GET(i.id) || {}).lieu || "")}</div></div>${i.act ? "" : `<button class="btn alt" onclick="EV_SEL='${esc(i.id)}';EV_DETAIL('${esc(i.id)}')">Fiche</button>`}</div>`).join("") : '<div class="empty">Rien de programmé ce jour.</div>'}</div>`;
  }
  const legende = `<p class="cards-help" style="margin-top:10px">${EV_STATUTS.map(s => EV_BADGE(s)).join(" ")} <span class="st" style="background:#c9a227;color:#241638">Activité / culte</span></p>`;
  return nav + corps + legende;
}

/* ---- Onglets ---- */
function EV_CHOIX() {
  const l = EV_EVENTS();
  if (!l.some(e => e.id === EV_SEL)) EV_SEL = l[0] ? l[0].id : "";
  return `<select class="ev-sel" onchange="EV_SEL=this.value;render()" aria-label="Événement concerné">` +
    (l.length ? l.map(e => `<option value="${esc(e.id)}"${e.id === EV_SEL ? " selected" : ""}>${esc(e.titre)} · ${fd(e.date)}</option>`).join("") : '<option value="">Aucun événement</option>') + `</select>`;
}
function EV_VIDE() { return `<div class="empty">Créez d’abord un événement pour utiliser cette rubrique.<div class="bar" style="justify-content:center;margin-top:10px"><button class="btn" onclick="ouvrirEvenement()">+ Créer un événement</button></div></div>`; }
function EV_SELECTEUR(titre) { return `<div class="ev-bar">${EV_CHOIX()}${EV_SEL ? `<button class="btn alt" onclick="EV_DETAIL('${esc(EV_SEL)}')">👁 Fiche complète</button><button class="btn alt" onclick="EV_AFFICHE('${esc(EV_SEL)}')">🖼 Affiche</button>` : ""}</div>`; }

function EV_LISTE() {
  const l = EV_EVENTS();
  return `<div class="ev-bar"><input type="search" id="evq" placeholder="Rechercher un événement…" value="${esc(EV_Q)}" oninput="EV_FILTRE(this.value)" style="min-width:240px">
    <button class="btn alt" onclick="EV_EXPORT_LISTE()">⬇ Excel</button></div>
    <div class="tw" id="evliste"><table><thead><tr><th>Événement</th><th>Catégorie</th><th>Dates</th><th>Lieu</th><th>Statut</th><th>Inscrits</th><th></th></tr></thead><tbody>` +
    (l.length ? l.map(e => {
      const x = EV_X(e);
      const filtre = (e.titre + " " + (x.categorie || e.type) + " " + (x.statut || "")).toLowerCase();
      return `<tr data-q="${esc(filtre)}"><td><b>${esc(e.titre)}</b><div class="ev-vide">${esc(x.responsable || "")}</div></td><td>${tag(x.categorie || e.type || "Autre")}</td><td>${fd(e.date)}${e.fin && e.fin !== e.date ? " → " + fd(e.fin) : ""}</td><td>${esc(x.lieu || e.lieu || "—")}</td><td>${EV_BADGE(x.statut || "Programmé")}</td><td>${(x.participants || []).length}${x.maxParticipants ? " / " + esc(x.maxParticipants) : ""}</td>
        <td><button class="ed" onclick="EV_SEL='${esc(e.id)}';EV_DETAIL('${esc(e.id)}')">Fiche</button>${can("edit") ? `<button class="ed" onclick="ouvrirEvenement('${esc(e.id)}')">Modifier</button><button class="del" onclick="EV_SUPPRIMER('${esc(e.id)}')">Supprimer</button>` : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty">Aucun événement.</div></td></tr>`) + `</tbody></table></div>`;
}

function EV_FILTRE(v) {
  EV_Q = v;
  const q = String(v).toLowerCase();
  document.querySelectorAll("#evliste tbody tr[data-q]").forEach(tr => {
    tr.style.display = tr.dataset.q.includes(q) ? "" : "none";
  });
}
function EV_EXPORT_LISTE() {
  const cols = ["Titre", "Catégorie", "Date de début", "Date de fin", "Lieu", "Statut", "Inscrits"];
  const rows = EV_EVENTS().map(e => [e.titre, EV_X(e).categorie || e.type, e.date, e.fin || "",
    EV_X(e).lieu || e.lieu || "", EV_X(e).statut || "Programmé", (EV_X(e).participants || []).length]);
  finCSV("Liste des événements", cols, rows);
}
function EV_EXPORT_RAPPORT(id) { const r = EV_RAP_DATA[id]; if (r) finCSV(r.titre, r.cols, r.rows); }
function EV_SUPPRIMER(id) {
  if (!can("edit")) return;
  const e = EV_GET(id); if (!e) return;
  if (!confirm("Supprimer l’événement « " + e.titre + " » ?")) return;
  fetch("/api/admin/events/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" })
    .then(r => { if (!r.ok) throw new Error("Erreur " + r.status); })
    .catch(err => toast("Suppression serveur impossible : " + err.message, "warn"));
  S.evt = S.evt.filter(x => x.id !== id);
  if (EV_SEL === id) EV_SEL = "";
  save(); render(); toast("Événement supprimé", "warn");
}

function EV_INSCRIPTIONS() {
  EV_CHOIX(); if (!EV_SEL) return EV_VIDE();
  const e = EV_GET(EV_SEL), x = EV_X(e), p = x.participants || [];
  const inscriptions = (SERVER_REGISTRATIONS || []).filter(r => r.eventId === EV_SEL);
  const rows = [
    ...p.map(a => ({ ...a, kind: "local" })),
    ...inscriptions.map(a => ({ nom: a.nom || "", prenoms: a.prenoms || "", tel: a.tel || "", statut: a.present ? "Présent" : "Inscrit", date: a.date || "", id: a.id, kind: "server", present: a.present }))
  ];
  return EV_SELECTEUR() + `<div class="grid fin-kpi">
      <div class="card stat fin-entree"><b>${rows.length}</b><span>Inscrits</span></div>
      <div class="card stat"><b>${esc(x.maxParticipants || "—")}</b><span>Maximum</span></div>
      <div class="card stat fin-solde"><b>${esc(x.inscriptionObligatoire || "Facultative")}</b><span>Inscription</span></div>
      <div class="card stat"><b>${esc(x.publicCible || "Tout public")}</b><span>Public cible</span></div></div>
    <div class="card"><h3>Ajouter un participant</h3><div class="ev-form">
      <div><label for="evp_nom">Nom</label><input id="evp_nom"></div>
      <div><label for="evp_prenoms">Prénoms</label><input id="evp_prenoms"></div>
      <div><label for="evp_tel">Téléphone</label><input id="evp_tel"></div>
      <div><label for="evp_statut">Statut</label><select id="evp_statut"><option>Inscrit</option><option>Confirmé</option><option>Présent</option><option>Absent</option></select></div>
    </div><div class="bar" style="margin-top:10px"><button class="btn" onclick="EV_ADD_PART()">+ Inscrire</button>
      <button class="btn alt" onclick="EV_EXPORT_PART('${esc(EV_SEL)}','csv')">⬇ Excel</button>
      <button class="btn alt" onclick="EV_EXPORT_PART('${esc(EV_SEL)}','pdf')">📄 PDF</button></div></div>
    <div class="tw"><table><thead><tr><th>Nom</th><th>Prénoms</th><th>Téléphone</th><th>Statut</th><th>Inscrit le</th><th></th></tr></thead><tbody>` +
    (rows.length ? rows.map(a => `<tr><td><b>${esc(a.nom || "")}</b></td><td>${esc(a.prenoms || "")}</td><td>${esc(a.tel || "")}</td><td>${tag(a.statut || "Inscrit", a.statut === "Présent" ? "g" : "")}</td><td>${esc(a.date || "")}</td><td>${a.kind === "server" ? `<button class="ed" onclick="EV_SET_PRESENCE('${esc(a.id)}',${!a.present})">${a.present ? "Annuler présence" : "Marquer présent"}</button>` : `<button class="del" onclick="EV_LISTE_DEL('${esc(EV_SEL)}','participants','${esc(a.id)}')">Retirer</button>`}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty">Aucun participant inscrit.</div></td></tr>`) + `</tbody></table></div>`;
}
function EV_SET_PRESENCE(id, present) {
  fetch("/api/admin/registrations/" + encodeURIComponent(id) + "/attendance", {
    method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ present })
  }).then(r => r.text().then(t => { let d = {}; try { d = t ? JSON.parse(t) : {}; } catch (_) {} if (!r.ok) throw new Error(d.message || "Erreur " + r.status); return d; }))
    .then(() => hydrate().then(() => render()))
    .catch(err => toast("Pointage impossible : " + err.message, "warn"));
}
function EV_ADD_PART() {
  const g = n => { const el = document.getElementById("evp_" + n); return el ? el.value.trim() : ""; };
  if (!g("nom")) { toast("Le nom est obligatoire", "warn"); return; }
  EV_LISTE_PUSH(EV_SEL, "participants", { nom: g("nom"), prenoms: g("prenoms"), tel: g("tel"), statut: g("statut"), date: today() }, "Inscription de " + g("nom"));
}

function EV_BUDGET() {
  EV_CHOIX(); if (!EV_SEL) return EV_VIDE();
  const x = EV_X(EV_GET(EV_SEL));
  const total = l => (l || []).reduce((a, d) => a + (Number(d.montant) || 0), 0);
  const dep = total(x.depenses), rec = total(x.recettes), con = total(x.contributions), prev = Number(x.budgetPrevisionnel) || 0;
  const bloc = (titre, cle, libelle, couleur) => `<div class="card"><h3>${titre}</h3>
    <div class="ev-form" style="grid-template-columns:1fr auto auto"><input id="evb_${cle}_lib" placeholder="Libellé"><input id="evb_${cle}_mont" type="number" placeholder="Montant" style="min-width:120px"><button class="btn" onclick="EV_ADD_BUDGET('${cle}')">+</button></div>
    <table class="ev-mini" style="margin-top:8px"><tbody>${(x[cle] || []).map(d => `<tr><td>${esc(d.libelle || "")}</td><td class="r"><b class="${couleur}">${fmt(d.montant)}</b></td><td class="r"><button class="del" onclick="EV_LISTE_DEL('${esc(EV_SEL)}','${cle}','${esc(d.id)}')">✕</button></td></tr>`).join("") || `<tr><td colspan="3" class="ev-vide">Aucune ligne.</td></tr>`}</tbody></table>
    <div class="rep-t"><span>Total</span><span>${fmt(total(x[cle]))}</span></div></div>`;
  return EV_SELECTEUR() + `<div class="grid fin-kpi">
      <div class="card stat"><b>${fmt(prev)}</b><span>Budget prévisionnel</span></div>
      <div class="card stat fin-depense"><b>${fmt(dep)}</b><span>Dépenses</span></div>
      <div class="card stat fin-entree"><b>${fmt(rec + con)}</b><span>Recettes + contributions</span></div>
      <div class="card stat ${rec + con - dep >= 0 ? "fin-solde" : "fin-depense"}"><b>${fmt(rec + con - dep)}</b><span>Bilan financier</span></div></div>
    ${can("edit") ? `<div class="bar"><input id="evb_prev" type="number" value="${prev}" style="max-width:220px"><button class="btn" onclick="EV_MAJ('${esc(EV_SEL)}',{budgetPrevisionnel:Number(document.getElementById('evb_prev').value)||0},'Budget prévisionnel mis à jour')">💾 Enregistrer le prévisionnel</button></div>` : ""}
    <div class="two">${bloc("Dépenses", "depenses", "", "out")}${bloc("Recettes", "recettes", "", "in")}</div>
    <div class="two">${bloc("Contributions", "contributions", "", "in")}
      <div class="card"><h3>Bilan</h3><p class="cards-help">Écart par rapport au prévisionnel, calculé automatiquement.</p>
        <div class="rep-t"><span>Prévu − Dépensé</span><span>${fmt(prev - dep)}</span></div>
        <div class="rep-t"><span>Recettes − Dépenses</span><span>${fmt(rec + con - dep)}</span></div>
        <div class="bar" style="margin-top:12px"><button class="btn alt" onclick="EV_RAPPORT('${esc(EV_SEL)}')">📑 Rapport financier</button></div></div></div>`;
}
function EV_ADD_BUDGET(cle) {
  const lib = (document.getElementById("evb_" + cle + "_lib") || {}).value || "";
  const mont = Number((document.getElementById("evb_" + cle + "_mont") || {}).value) || 0;
  if (!lib.trim() || !mont) { toast("Libellé et montant requis", "warn"); return; }
  EV_LISTE_PUSH(EV_SEL, cle, { libelle: lib.trim(), montant: mont, date: today() }, "Ligne " + cle + " ajoutée");
}

function EV_EQUIPES() {
  EV_CHOIX(); if (!EV_SEL) return EV_VIDE();
  const x = EV_X(EV_GET(EV_SEL)), eq = x.equipe || [], t = x.taches || [];
  return EV_SELECTEUR() + `<div class="two">
    <div class="card"><h3>Équipe d’organisation (${eq.length})</h3>
      <div class="ev-form" style="grid-template-columns:1fr 1fr auto"><input id="eve_nom" placeholder="Nom"><input id="eve_role" placeholder="Rôle"><button class="btn" onclick="EV_ADD_EQUIPE()">+</button></div>
      <table class="ev-mini" style="margin-top:8px"><tbody>${eq.map(a => `<tr><td><b>${esc(a.nom || "")}</b></td><td>${esc(a.role || "Bénévole")}</td><td class="r"><button class="del" onclick="EV_LISTE_DEL('${esc(EV_SEL)}','equipe','${esc(a.id)}')">✕</button></td></tr>`).join("") || `<tr><td colspan="3" class="ev-vide">Aucun membre affecté.</td></tr>`}</tbody></table>
      <div class="rep-t"><span>Responsables de départements</span><span>${esc(x.deptResponsables || "—")}</span></div></div>
    <div class="card"><h3>Tâches (${t.filter(a => a.fait).length}/${t.length})</h3>
      <div class="ev-form" style="grid-template-columns:1fr 1fr auto"><input id="evt_lib" placeholder="Tâche"><input id="evt_resp" placeholder="Responsable"><button class="btn" onclick="EV_ADD_TACHE()">+</button></div>
      <table class="ev-mini" style="margin-top:8px"><tbody>${t.map(a => `<tr><td>${a.fait ? "✅" : "◻"} <button class="ed" onclick="EV_TACHE('${esc(a.id)}')">${a.fait ? "Réouvrir" : "Terminer"}</button> ${esc(a.libelle || "")}</td><td>${esc(a.responsable || "—")}</td><td class="r"><button class="del" onclick="EV_LISTE_DEL('${esc(EV_SEL)}','taches','${esc(a.id)}')">✕</button></td></tr>`).join("") || `<tr><td colspan="3" class="ev-vide">Aucune tâche.</td></tr>`}</tbody></table></div>
  </div>`;
}
function EV_ADD_EQUIPE() {
  const nom = (document.getElementById("eve_nom") || {}).value || "", role = (document.getElementById("eve_role") || {}).value || "Bénévole";
  if (!nom.trim()) { toast("Nom requis", "warn"); return; }
  EV_LISTE_PUSH(EV_SEL, "equipe", { nom: nom.trim(), role: role.trim(), dept: "" }, "Membre ajouté à l’équipe");
}
function EV_ADD_TACHE() {
  const lib = (document.getElementById("evt_lib") || {}).value || "", resp = (document.getElementById("evt_resp") || {}).value || "";
  if (!lib.trim()) { toast("Tâche requise", "warn"); return; }
  EV_LISTE_PUSH(EV_SEL, "taches", { libelle: lib.trim(), responsable: resp.trim(), echeance: "", fait: false }, "Tâche attribuée");
}
function EV_TACHE(tid) {
  const e = EV_GET(EV_SEL), x = EV_X(e);
  EV_MAJ(EV_SEL, { taches: (x.taches || []).map(a => String(a.id) === String(tid) ? { ...a, fait: !a.fait } : a) }, "Tâche mise à jour");
}

function EV_RESSOURCES() {
  EV_CHOIX(); if (!EV_SEL) return EV_VIDE();
  const x = EV_X(EV_GET(EV_SEL));
  const ch = (n, lab, v, ta) => `<div><label for="evr_${n}">${lab}</label>${ta ? `<textarea id="evr_${n}" rows="4">${esc(v || "")}</textarea>` : `<input id="evr_${n}" value="${esc(v || "")}">`}</div>`;
  return EV_SELECTEUR() + `<div class="card"><h3>Salles, matériel et programme</h3>
    <div class="ev-form">${ch("salle", "Salle à réserver", x.salle)}${ch("materiel", "Matériel / équipements", x.materiel, true)}${ch("programme", "Programme détaillé", x.programme, true)}${ch("deptResponsables", "Responsables de départements", x.deptResponsables)}</div>
    ${can("edit") ? `<div class="bar" style="margin-top:10px"><button class="btn" onclick="EV_SAVE_RESS()">💾 Enregistrer</button></div>` : ""}</div>
    <div class="card"><h3>Inventaire disponible</h3><p class="cards-help">Matériel de l’église (module Inventaire) pouvant être mobilisé.</p>
      <div class="tw"><table><thead><tr><th>Bien</th><th>Catégorie</th><th>Qté</th><th>État</th></tr></thead><tbody>${(S.inv || []).map(i => `<tr><td>${esc(i.nom)}</td><td>${tag(i.cat)}</td><td>${i.qte}</td><td>${tag(i.etat, i.etat === "Bon" ? "g" : "")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Inventaire vide.</div></td></tr>`}</tbody></table></div></div>`;
}
function EV_SAVE_RESS() {
  if (!can("edit")) { toast("Modification réservée à la direction", "warn"); return; }
  const g = n => { const el = document.getElementById("evr_" + n); return el ? el.value.trim() : ""; };
  EV_MAJ(EV_SEL, { salle: g("salle"), materiel: g("materiel"), programme: g("programme"), deptResponsables: g("deptResponsables") }, "Ressources mises à jour");
  toast("Ressources enregistrées");
}

function EV_COMM() {
  EV_CHOIX(); if (!EV_SEL) return EV_VIDE();
  const x = EV_X(EV_GET(EV_SEL)), a = x.annonces || [];
  return EV_SELECTEUR() + `<div class="grid fin-kpi">
      <div class="card stat"><b>${a.length}</b><span>Annonces</span></div>
      <div class="card stat fin-entree"><b>${a.filter(v => v.envoyee).length}</b><span>Envoyées aux membres</span></div>
      <div class="card stat fin-solde"><b>${esc(x.publicCible || "Tout public")}</b><span>Public cible</span></div>
      <div class="card stat"><b>${esc(x.dateLimite ? fd(x.dateLimite) : "—")}</b><span>Limite d’inscription</span></div></div>
    <div class="card"><h3>Communication</h3><p class="cards-help">Les annonces envoyées apparaissent dans le fil de chaque membre de l’application mobile.</p>
      <div class="bar" style="margin-top:10px"><button class="btn" onclick="EV_NOTIFIER('${esc(EV_SEL)}')">📣 Nouvelle annonce</button><button class="btn alt" onclick="EV_AFFICHE('${esc(EV_SEL)}')">🖼 Générer l’affiche</button></div></div>
    <div class="tw"><table><thead><tr><th>Date</th><th>Annonce</th><th>Cible</th><th>Statut</th></tr></thead><tbody>${a.map(v => `<tr><td>${esc(v.date || "")}</td><td>${esc(v.message || v.titre || "")}</td><td>${esc(v.cible || "")}</td><td>${v.envoyee ? tag("Envoyée · " + (v.destinataires || "?") + " membre(s)", "g") : tag("Archivée", "w")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Aucune annonce.</div></td></tr>`}</tbody></table></div>`;
}

function EV_RAPPORTS() {
  const l = EV_EVENTS();
  return `<div class="card"><h3>Rapports automatiques après événement</h3><p class="cards-help">Générés depuis la fiche, les inscriptions, le budget, les tâches et les pointages badges/QR.</p></div>
    <div class="tw"><table><thead><tr><th>Événement</th><th>Date</th><th>Statut</th><th>Inscrits</th><th>Bilan</th><th></th></tr></thead><tbody>${l.map(e => {
      const x = EV_X(e), dep = (x.depenses || []).reduce((a, d) => a + (+d.montant || 0), 0), rec = [...(x.recettes || []), ...(x.contributions || [])].reduce((a, d) => a + (+d.montant || 0), 0);
      return `<tr><td><b>${esc(e.titre)}</b></td><td>${fd(e.date)}</td><td>${EV_BADGE(x.statut || "Programmé")}</td><td>${(x.participants || []).length}</td><td class="${rec - dep >= 0 ? "in" : "out"}">${fmt(rec - dep)}</td><td><button class="ed" onclick="EV_RAPPORT('${esc(e.id)}')">📑 Rapport</button></td></tr>`;
    }).join("") || `<tr><td colspan="6"><div class="empty">Aucun événement.</div></td></tr>`}</tbody></table></div>`;
}

function EV_HISTORIQUE() {
  const l = EV_EVENTS();
  const entrees = [];
  l.forEach(e => (EV_X(e).historique || []).forEach(h => entrees.push({ titre: e.titre, ...h })));
  entrees.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="grid fin-kpi">
      <div class="card stat"><b>${l.length}</b><span>Événements organisés</span></div>
      <div class="card stat fin-entree"><b>${l.filter(e => EV_X(e).statut === "Terminé").length}</b><span>Terminés</span></div>
      <div class="card stat fin-depense"><b>${l.filter(e => EV_X(e).statut === "Annulé").length}</b><span>Annulés</span></div>
      <div class="card stat fin-solde"><b>${l.filter(e => EV_X(e).statut === "En attente de validation").length}</b><span>À valider</span></div></div>
    <div class="card"><h3>Journal des actions</h3><div class="tw"><table><thead><tr><th>Date / heure</th><th>Événement</th><th>Action</th><th>Par</th></tr></thead><tbody>${entrees.slice(0, 60).map(h => `<tr><td>${esc(h.date)}</td><td>${esc(h.titre)}</td><td>${esc(h.action)}</td><td>${esc(h.par || "—")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Aucune action enregistrée.</div></td></tr>`}</tbody></table></div></div>`;
}

/* ---- Vue principale ---- */
function evt() {
  const [t, tb] = tabs(["Calendrier", "Liste", "Inscriptions", "Budget", "Équipes & tâches", "Ressources", "Communication", "Rapports", "Historique"]);
  const l = EV_EVENTS(), x = l.length ? EV_X(EV_GET(EV_SEL) || l[0]) : {};
  const vides = l.filter(e => EV_X(e).statut === "En attente de validation").length;
  const bar = `<div class="ev-bar">
    ${can("edit") ? `<button class="btn" onclick="ouvrirEvenement()">+ Créer un événement</button>` : ""}
    ${can("edit") ? `<button class="btn alt" onclick="openF('cult')">+ Programmer une activité</button>` : ""}
    <button class="btn alt" onclick="window.print()">🖨 Imprimer</button>
    ${vides ? `<span class="st" style="background:#f59e0b;color:#fff">${vides} en attente de validation</span>` : ""}
  </div>`;
  const corps = t === "Calendrier" ? EV_CAL()
    : t === "Liste" ? EV_LISTE()
    : t === "Inscriptions" ? EV_INSCRIPTIONS()
    : t === "Budget" ? EV_BUDGET()
    : t === "Équipes & tâches" ? EV_EQUIPES()
    : t === "Ressources" ? EV_RESSOURCES()
    : t === "Communication" ? EV_COMM()
    : t === "Rapports" ? EV_RAPPORTS()
    : EV_HISTORIQUE();
  return hdr("Événements", "Calendrier général, fiches complètes, inscriptions, budget, équipes et rapports — synchronisés entre les PC.", bar) + tb + corps;
}
