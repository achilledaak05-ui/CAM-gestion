/* ============================================================
   CAM FX — moteur d'animations (compagnon de cam-fx.css).
   Vanilla JS, aucune dépendance, respecte prefers-reduced-motion.
   Auto-init via attributs data-fx-*, + API globale window.CAMFX.
   ============================================================ */
(function () {
  'use strict';
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* 01. Splash ---------------------------------------------------- */
  function splash(el, delai) {
    if (!el) return;
    setTimeout(function () { el.classList.add('fx-out'); }, delai || 1600);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, (delai || 1600) + 600);
  }

  /* 11. Compteur animé ------------------------------------------- */
  function counter(el, cible, duree) {
    if (!el) return;
    cible = Number(cible || el.getAttribute('data-fx-counter') || 0);
    if (REDUCED || !isFinite(cible)) { el.textContent = String(cible); return; }
    var debut = performance.now(), d = duree || 1100;
    function pas(t) {
      var p = clamp((t - debut) / d, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(cible * e));
      if (p < 1) requestAnimationFrame(pas);
      else { el.textContent = String(cible); el.classList.add('fx-bump'); }
    }
    requestAnimationFrame(pas);
  }

  /* 22. Toast ----------------------------------------------------- */
  function toast(texte, duree) {
    var t = document.createElement('div');
    t.className = 'fx-toast'; t.textContent = texte;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('fx-out'); }, duree || 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, (duree || 2600) + 300);
    return t;
  }

  /* 30. Retour haptique ------------------------------------------- */
  function haptic(el) {
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    if (el) { el.classList.remove('fx-haptic'); void el.offsetWidth; el.classList.add('fx-haptic'); }
  }

  /* 40. Confettis -------------------------------------------------- */
  function confetti(nombre) {
    if (REDUCED) return;
    var couleurs = ['#2f55ff', '#6d8bff', '#ffffff', '#1e3ad9', '#a9c0ff'];
    for (var i = 0; i < (nombre || 60); i++) {
      (function (i) {
        var p = document.createElement('i');
        p.className = 'fx-confetti';
        p.style.left = (Math.random() * 100) + 'vw';
        p.style.background = couleurs[i % couleurs.length];
        p.style.setProperty('--fx-dur', (2 + Math.random() * 1.8) + 's');
        p.style.animationDelay = (Math.random() * .45) + 's';
        p.style.transform = 'rotate(' + (Math.random() * 180) + 'deg)';
        document.body.appendChild(p);
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 4600);
      })(i);
    }
  }

  /* 06. Checkmark de succès --------------------------------------- */
  function checkmark(conteneur) {
    if (!conteneur) return;
    conteneur.innerHTML =
      '<svg class="fx-check" viewBox="0 0 60 60" width="72" height="72" aria-hidden="true">' +
      '<circle cx="30" cy="30" r="27" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path d="M17 31l9 9 18-19"/></svg>';
  }

  /* 08. Bottom sheet ---------------------------------------------- */
  function sheet(contenu, options) {
    options = options || {};
    var bd = document.createElement('div'); bd.className = 'fx-sheet-backdrop';
    var sh = document.createElement('div'); sh.className = 'fx-sheet fx-glass';
    sh.innerHTML = '<div style="width:44px;height:4px;border-radius:9px;background:rgba(255,255,255,.3);margin:10px auto 14px"></div>' + contenu;
    bd.appendChild(sh); document.body.appendChild(bd);
    function fermer() { if (bd.parentNode) bd.parentNode.removeChild(bd); }
    bd.addEventListener('click', function (e) { if (e.target === bd) fermer(); });
    if (options.onClose) bd.addEventListener('DOMNodeRemoved', options.onClose);
    return { element: sh, close: fermer };
  }

  /* 23. Modal ------------------------------------------------------ */
  function modal(contenu) {
    var bd = document.createElement('div'); bd.className = 'fx-modal-backdrop';
    var m = document.createElement('div'); m.className = 'fx-modal fx-glass';
    m.style.padding = '20px'; m.style.borderRadius = '18px'; m.innerHTML = contenu;
    bd.appendChild(m); document.body.appendChild(bd);
    function fermer() { if (bd.parentNode) bd.parentNode.removeChild(bd); }
    bd.addEventListener('click', function (e) { if (e.target === bd) fermer(); });
    return { element: m, close: fermer };
  }

  /* 24. Accordéon -------------------------------------------------- */
  function accordion(trigger, panneau) {
    if (!trigger || !panneau) return;
    trigger.addEventListener('click', function () {
      var ouvert = panneau.getAttribute('data-open') === 'true';
      panneau.setAttribute('data-open', String(!ouvert));
      panneau.style.maxHeight = ouvert ? '0px' : panneau.scrollHeight + 'px';
      haptic(trigger);
    });
  }

  /* 18. Carte 3D --------------------------------------------------- */
  function flip(el) {
    if (!el) return;
    el.addEventListener('click', function () { el.classList.toggle('flipped'); haptic(el); });
  }

  /* 34. Toggle ----------------------------------------------------- */
  function toggle(el, onChange) {
    if (!el) return;
    el.addEventListener('click', function () {
      el.classList.toggle('on');
      el.setAttribute('aria-checked', String(el.classList.contains('on')));
      haptic(el);
      if (onChange) onChange(el.classList.contains('on'));
    });
  }

  /* 37. Bouton magnétique ------------------------------------------ */
  function magnetic(el, force) {
    if (!el || REDUCED) return;
    var f = force || .28;
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) * f;
      var y = (e.clientY - r.top - r.height / 2) * f;
      el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; });
  }

  /* 13 / 32. Swipe & swipe-to-delete -------------------------------- */
  function swipeDelete(el, onDelete) {
    if (!el) return;
    var x0 = null, dx = 0;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; dx = 0; }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (x0 === null) return;
      dx = e.touches[0].clientX - x0;
      var cont = $('.fx-delete-content', el);
      if (cont) cont.style.transform = 'translateX(' + clamp(dx, -110, 0) + 'px)';
    }, { passive: true });
    el.addEventListener('touchend', function () {
      var ouvert = dx < -45;
      el.classList.toggle('open', ouvert);
      var cont = $('.fx-delete-content', el); if (cont) cont.style.transform = '';
      if (ouvert) haptic(el);
      x0 = null;
    });
    var bg = $('.fx-delete-bg', el);
    if (bg) bg.addEventListener('click', function () {
      el.style.transition = 'opacity .3s,transform .3s,max-height .3s';
      el.style.maxHeight = el.offsetHeight + 'px';
      requestAnimationFrame(function () { el.style.opacity = '0'; el.style.transform = 'translateX(-100%)'; el.style.maxHeight = '0'; });
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (onDelete) onDelete(el); }, 320);
    });
  }

  /* 14. Pull-to-refresh -------------------------------------------- */
  function pullToRefresh(zone, rappel) {
    if (!zone || typeof rappel !== 'function') return;
    var y0 = null, actif = false, ptr = $('.fx-ptr', zone.parentNode) || null;
    zone.addEventListener('touchstart', function (e) { if (zone.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    zone.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 70 && !actif && ptr) { actif = true; ptr.classList.add('fx-active'); }
    }, { passive: true });
    zone.addEventListener('touchend', function () {
      if (actif && ptr) {
        Promise.resolve(rappel()).then(function () { ptr.classList.remove('fx-active'); });
      }
      actif = false; y0 = null;
    });
  }

  /* 15. Parallaxe --------------------------------------------------- */
  function parallax(el, facteur) {
    if (!el || REDUCED) return;
    var f = facteur || .25;
    window.addEventListener('scroll', function () {
      el.style.transform = 'translateY(' + (window.scrollY * f) + 'px)';
    }, { passive: true });
  }

  /* 31. Drag & drop ------------------------------------------------- */
  function draggable(el, cibles, onDrop) {
    if (!el) return;
    el.classList.add('fx-drag');
    el.addEventListener('dragstart', function () { el.classList.add('dragging'); });
    el.addEventListener('dragend', function () {
      el.classList.remove('dragging');
      $$('.fx-drop-target').forEach(function (c) { c.classList.remove('fx-drop-target'); });
    });
    $$(cibles || '[data-fx-drop]').forEach(function (c) {
      c.addEventListener('dragover', function (e) { e.preventDefault(); c.classList.add('fx-drop-target'); });
      c.addEventListener('dragleave', function () { c.classList.remove('fx-drop-target'); });
      c.addEventListener('drop', function (e) {
        e.preventDefault(); c.classList.remove('fx-drop-target');
        haptic(c); if (onDrop) onDrop(el, c);
      });
    });
  }

  /* 09 / 10 / 28 / 36. Révélations au scroll ------------------------ */
  function observeReveal() {
    if (!('IntersectionObserver' in window) || REDUCED) {
      $$('[data-fx-reveal]').forEach(function (el) { el.classList.add('fx-profile-reveal'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var type = el.getAttribute('data-fx-reveal') || 'profile';
        el.classList.add(type === 'logo' ? 'fx-logo-reveal' : 'fx-profile-reveal');
        if (el.hasAttribute('data-fx-counter')) counter(el);
        io.unobserve(el);
      });
    }, { threshold: .12 });
    $$('[data-fx-reveal]').forEach(function (el) { io.observe(el); });
  }

  /* 20/21. Barres & anneaux ---------------------------------------- */
  function progress(el, valeur) {
    if (!el) return;
    var i = $('i', el); if (i) i.style.width = clamp(valeur, 0, 100) + '%';
  }
  function ring(el, pourcent) {
    if (!el) return;
    var c = $('circle', el); if (!c) return;
    var len = 2 * Math.PI * (Number(c.getAttribute('r')) || 46);
    el.style.setProperty('--fx-ring-len', len);
    el.style.setProperty('--fx-ring-to', len * (1 - clamp(pourcent, 0, 100) / 100));
  }

  /* 27. Indicateur de page ------------------------------------------ */
  function dots(el, index, total) {
    if (!el) return;
    var html = '';
    for (var i = 0; i < total; i++) html += '<i class="' + (i === index ? 'on' : '') + '"></i>';
    el.innerHTML = html;
  }

  /* 12. Scan QR ------------------------------------------------------ */
  function qrScan(el, duree) {
    if (!el) return;
    el.classList.add('fx-qr-scan');
    setTimeout(function () { el.classList.remove('fx-qr-scan'); }, duree || 2600);
  }

  /* Auto-init -------------------------------------------------------- */
  function init(root) {
    root = root || document;
    $$('[data-fx-splash]', root).forEach(function (el) { splash(el, Number(el.getAttribute('data-fx-splash')) || 1600); });
    $$('[data-fx-counter]:not([data-fx-reveal])', root).forEach(function (el) { counter(el); });
    $$('[data-fx-toggle]', root).forEach(function (el) { toggle(el); });
    $$('[data-fx-flip]', root).forEach(function (el) { flip(el); });
    $$('[data-fx-magnetic]', root).forEach(function (el) { magnetic(el); });
    $$('[data-fx-swipe-delete]', root).forEach(function (el) { swipeDelete(el); });
    $$('[data-fx-accordion]', root).forEach(function (t) {
      var p = document.getElementById(t.getAttribute('data-fx-accordion'));
      accordion(t, p);
    });
    $$('[data-fx-stagger]', root).forEach(function (el) { el.classList.add('fx-stagger'); });
    $$('[data-fx-parallax]', root).forEach(function (el) { parallax(el, Number(el.getAttribute('data-fx-parallax')) || .25); });
    $$('[data-fx-ptr]', root).forEach(function (el) {
      pullToRefresh(el, function () { return new Promise(function (r) { setTimeout(r, 900); }); });
    });
    $$('[data-fx-micro]', root).forEach(function (el) { el.classList.add('fx-micro'); });
    $$('[data-fx-ring]', root).forEach(function (el) { ring(el, Number(el.getAttribute('data-fx-ring')) || 70); });
    $$('[data-fx-progress]', root).forEach(function (el) { progress(el, Number(el.getAttribute('data-fx-progress')) || 60); });
    observeReveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();

  window.CAMFX = {
    init: init, splash: splash, counter: counter, toast: toast, haptic: haptic,
    confetti: confetti, checkmark: checkmark, sheet: sheet, modal: modal,
    accordion: accordion, flip: flip, toggle: toggle, magnetic: magnetic,
    swipeDelete: swipeDelete, pullToRefresh: pullToRefresh, parallax: parallax,
    draggable: draggable, progress: progress, ring: ring, dots: dots, qrScan: qrScan,
    reduced: REDUCED
  };
})();
