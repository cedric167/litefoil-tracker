/* Traduction de l'appli Lite Foil (français → anglais, espagnol), commune à toutes les pages.

   Le texte est écrit en français dans le HTML et le JavaScript ; ce script traduit ce qui s'affiche,
   y compris ce que les pages ajoutent ensuite (MutationObserver), les fenêtres confirm/alert et le
   texte des graphiques (canvas). Le français d'origine est gardé, si bien qu'on change de langue
   sans recharger la page (et donc sans couper le Bluetooth).

   Dictionnaires : i18n/en.json et i18n/es.json, { "texte français": "traduction" }. Les nombres y
   sont remplacés par {#} pour qu'une seule entrée couvre « 12 cellules », « 13 cellules »… */
(function () {
  'use strict';

  var BASE = new URL('.', document.currentScript.src);
  var KEY = 'lf-lang';
  var LANGS = [
    { id: 'fr', name: 'Français' },
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Español' },
  ];
  var FLAGS = {
    fr: '<svg viewBox="0 0 30 30"><clipPath id="lfc-fr"><circle cx="15" cy="15" r="15"/></clipPath><g clip-path="url(#lfc-fr)">'
      + '<rect width="10" height="30" fill="#0055a4"/><rect x="10" width="10" height="30" fill="#fff"/><rect x="20" width="10" height="30" fill="#ef4135"/></g></svg>',
    en: '<svg viewBox="0 0 30 30"><clipPath id="lfc-en"><circle cx="15" cy="15" r="15"/></clipPath><g clip-path="url(#lfc-en)">'
      + '<rect width="30" height="30" fill="#012169"/><path d="M0 0L30 30M30 0L0 30" stroke="#fff" stroke-width="6"/>'
      + '<path d="M0 0L30 30M30 0L0 30" stroke="#c8102e" stroke-width="2"/><path d="M15 0V30M0 15H30" stroke="#fff" stroke-width="10"/>'
      + '<path d="M15 0V30M0 15H30" stroke="#c8102e" stroke-width="6"/></g></svg>',
    es: '<svg viewBox="0 0 30 30"><clipPath id="lfc-es"><circle cx="15" cy="15" r="15"/></clipPath><g clip-path="url(#lfc-es)">'
      + '<rect width="30" height="30" fill="#aa151b"/><rect y="7.5" width="30" height="15" fill="#f1bf00"/></g></svg>',
  };

  function initialLang() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'fr' || saved === 'en' || saved === 'es') return saved;
    } catch (e) { /* stockage bloqué */ }
    var nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
    return nav === 'es' ? 'es' : nav === 'fr' ? 'fr' : nav === 'en' ? 'en' : 'fr';
  }

  var lang = initialLang();
  var exact = null; // Map texte → traduction
  var templ = null; // Map texte avec {#} → traduction avec {#}
  var fragRe = null; // morceaux de phrases (texte construit par concaténation)
  var fragMap = null;
  var cache = {};
  var cacheSize = 0;

  var NUM = /\d+(?:[.,]\d+)?/g;
  var listeners = [];

  function build(dict) {
    exact = new Map();
    templ = new Map();
    fragMap = new Map();
    var frags = [];
    Object.keys(dict).forEach(function (fr) {
      var tr = dict[fr];
      if (!tr || tr === fr) return;
      exact.set(fr, tr);
      if (/\d/.test(fr)) templ.set(fr.replace(NUM, '{#}'), tr.replace(NUM, '{#}'));
      else if (fr.length >= 4 && /[a-zà-ÿ]/i.test(fr)) { fragMap.set(fr, tr); frags.push(fr); }
    });
    frags.sort(function (a, b) { return b.length - a.length; });
    var esc = frags.map(function (f) { return f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    fragRe = esc.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + esc.join('|') + ')(?![\\p{L}\\p{N}])', 'gu') : null;
  }

  function trCore(s) {
    if (exact.has(s)) return exact.get(s);
    if (/\d/.test(s)) {
      var nums = s.match(NUM);
      var t = templ.get(s.replace(NUM, '{#}'));
      if (t) {
        var i = 0;
        return t.replace(/\{#\}/g, function () { return nums[i++] || ''; });
      }
    }
    if (fragRe) {
      var changed = false;
      var out = s.replace(fragRe, function (m) { changed = true; return fragMap.get(m); });
      if (changed) return out;
    }
    return s;
  }

  // Traduit un texte français (espaces de début et de fin conservés, lignes traduites une à une).
  function t(s) {
    if (lang === 'fr' || !exact || typeof s !== 'string' || !/[a-zA-Zà-ÿ]/.test(s)) return s;
    if (cache[s] !== undefined) return cache[s];
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var core = m[2];
    var res = exact.has(core) ? exact.get(core) : null;
    if (res === null && core.indexOf('\n') >= 0) {
      res = core.split('\n').map(function (line) {
        var lm = /^(\s*)(.*?)(\s*)$/.exec(line);
        return lm[1] + (lm[2] ? trCore(lm[2]) : '') + lm[3];
      }).join('\n');
    }
    if (res === null) res = trCore(core);
    var out = m[1] + res + m[3];
    // Les valeurs en direct changent sans cesse : on borne le cache.
    if (++cacheSize > 4000) { cache = {}; cacheSize = 0; }
    cache[s] = out;
    return out;
  }

  // ---------------------------------------------------------------- DOM

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var origText = new WeakMap(); // nœud texte → français
  var lastText = new WeakMap(); // nœud texte → dernière valeur écrite par nous
  var origAttr = new WeakMap(); // élément → { attr: français }
  var lastAttr = new WeakMap();

  function skipped(node) {
    for (var el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE') return true;
      if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    }
    return false;
  }

  function doText(node) {
    var v = node.nodeValue;
    if (!v || !/[a-zA-Zà-ÿ]/.test(v)) return;
    if (lastText.get(node) !== v) origText.set(node, v); // l'appli a écrit un nouveau texte (en français)
    var fr = origText.get(node);
    var out = lang === 'fr' ? fr : t(fr);
    if (out !== v) node.nodeValue = out;
    lastText.set(node, out);
  }

  function doAttrs(el) {
    var o = origAttr.get(el);
    var l = lastAttr.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      if (!o) { o = {}; origAttr.set(el, o); }
      if (!l) { l = {}; lastAttr.set(el, l); }
      if (l[a] !== v) o[a] = v;
      var out = lang === 'fr' ? o[a] : t(o[a]);
      if (out !== v) el.setAttribute(a, out);
      l[a] = out;
    }
  }

  function walk(root) {
    if (!root || skipped(root)) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doAttrs(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          var tag = n.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || n.hasAttribute('data-no-i18n')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
    }
  }

  var titleFr = null;
  function doTitle() {
    if (titleFr === null || (document.title !== t(titleFr) && document.title !== titleFr)) titleFr = document.title;
    document.title = lang === 'fr' ? titleFr : t(titleFr);
  }

  function applyAll() {
    document.documentElement.lang = lang;
    walk(document.body);
    doTitle();
    document.documentElement.classList.remove('lf-i18n-wait');
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) { /* écouteur fautif */ } });
    syncPickers();
  }

  var observer = new MutationObserver(function (records) {
    if (lang === 'fr' && !exact) return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') { if (!skipped(r.target)) doText(r.target); }
      else if (r.type === 'attributes') { if (!skipped(r.target)) doAttrs(r.target); }
      else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
    }
  });

  function load(l) {
    if (l === 'fr') return Promise.resolve();
    return fetch(new URL(l + '.json', BASE)).then(function (r) { return r.json(); }).then(function (d) {
      build(d);
      cache = {};
    });
  }

  function setLang(l) {
    if (LANGS.every(function (x) { return x.id !== l; })) return Promise.resolve();
    try { localStorage.setItem(KEY, l); } catch (e) { /* stockage bloqué */ }
    var prev = lang;
    return load(l).then(function () {
      lang = l;
      if (l === 'fr') cache = {};
      if (prev !== l || l !== 'fr') applyAll();
    });
  }

  // ---------------------------------------------------------------- confirm, alert, canvas

  ['confirm', 'alert', 'prompt'].forEach(function (name) {
    var orig = window[name];
    if (!orig) return;
    window[name] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof msg === 'string') args[0] = t(msg);
      return orig.apply(window, args);
    };
  });

  if (window.CanvasRenderingContext2D) {
    var ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof text === 'string') args[0] = t(text);
      return ft.apply(this, args);
    };
  }

  // ---------------------------------------------------------------- choix de la langue (drapeaux)

  var pickers = [];
  function syncPickers() {
    pickers.forEach(function (p) { p(); });
  }

  // Rangée de drapeaux (variant « row ») ou bouton drapeau avec menu (variant « menu »).
  function mountPicker(host, variant) {
    if (!host) return;
    host.classList.add('lf-lang', variant === 'menu' ? 'lf-lang-menu' : 'lf-lang-row');
    host.setAttribute('data-no-i18n', '');
    if (variant === 'menu') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lf-lang-current';
      var menu = document.createElement('div');
      menu.className = 'lf-lang-pop';
      menu.hidden = true;
      LANGS.forEach(function (L) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.lang = L.id;
        b.innerHTML = FLAGS[L.id] + '<span>' + L.name + '</span>';
        b.onclick = function () { menu.hidden = true; setLang(L.id); };
        menu.appendChild(b);
      });
      btn.onclick = function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; };
      document.addEventListener('click', function () { menu.hidden = true; });
      host.append(btn, menu);
      pickers.push(function () {
        btn.innerHTML = FLAGS[lang];
        btn.setAttribute('aria-label', LANGS.filter(function (x) { return x.id === lang; })[0].name);
        Array.prototype.forEach.call(menu.children, function (b) { b.classList.toggle('on', b.dataset.lang === lang); });
      });
    } else {
      LANGS.forEach(function (L) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.lang = L.id;
        b.title = L.name;
        b.setAttribute('aria-label', L.name);
        b.innerHTML = FLAGS[L.id];
        b.onclick = function () { setLang(L.id); };
        host.appendChild(b);
      });
      pickers.push(function () {
        Array.prototype.forEach.call(host.children, function (b) { b.classList.toggle('on', b.dataset.lang === lang); });
      });
    }
    syncPickers();
  }

  var css = document.createElement('style');
  css.textContent = 'html.lf-i18n-wait body{visibility:hidden}'
    + '.lf-lang{display:inline-flex;gap:6px;align-items:center}'
    + '.lf-lang button{border:0;padding:0;background:none;cursor:pointer;border-radius:50%;line-height:0}'
    + '.lf-lang svg{width:28px;height:28px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 1px 4px rgba(0,0,0,.25)}'
    + '.lf-lang-row button{opacity:.55;transition:opacity .2s,transform .2s}'
    + '.lf-lang-row button.on{opacity:1;transform:scale(1.12)}'
    + '.lf-lang-menu{position:relative}'
    + '.lf-lang-pop{position:absolute;right:0;top:38px;z-index:60;background:#fff;border-radius:16px;padding:6px;'
    + 'box-shadow:0 10px 30px rgba(11,13,16,.18);border:1px solid #eef2f5;display:flex;flex-direction:column;min-width:150px}'
    + '.lf-lang-pop[hidden]{display:none}'
    + '.lf-lang-pop button{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;line-height:1.2;'
    + 'font:600 14px "Instrument Sans",system-ui,sans-serif;color:#0b0d10;text-align:left}'
    + '.lf-lang-pop button.on{background:#dff5f6}'
    + '.lf-lang-pop svg{width:24px;height:24px}';
  document.head.appendChild(css);

  window.LF_I18N = {
    t: t,
    get lang() { return lang; },
    set: setLang,
    langs: LANGS,
    onChange: function (fn) { listeners.push(fn); },
    mountPicker: mountPicker,
  };

  // Démarrage : on cache la page le temps de charger le dictionnaire (au plus 1,5 s).
  if (lang !== 'fr') {
    document.documentElement.classList.add('lf-i18n-wait');
    setTimeout(function () { document.documentElement.classList.remove('lf-i18n-wait'); }, 1500);
  }
  function start() {
    document.querySelectorAll('[data-lang-picker]').forEach(function (h) { mountPicker(h, h.getAttribute('data-lang-picker')); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    load(lang).then(applyAll, function () { lang = 'fr'; applyAll(); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
