// Petites fonctions d'interface partagées par les pages de l'atelier.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = null;
export function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 6000 : 2800);
}

export const fmt = (v, dec = 1) => (Number.isFinite(v) ? v.toFixed(dec) : '—');
export const fmtInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '—');
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
}

export function download(name, content, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function setKv(container, pairs) {
  container.replaceChildren();
  for (const [k, v, opts = {}] of pairs) {
    const box = el('div', 'kv' + (opts.full ? ' full' : ''));
    box.append(el('div', 'k', k), el('div', 'v' + (opts.mono ? ' mono' : '') + (opts.cls ? ' ' + opts.cls : ''), v));
    container.append(box);
  }
}

export function haptic(ms) {
  try { navigator.vibrate?.(ms); } catch (e) { /* non pris en charge */ }
}

// Feuille modale : titre, contenu (éléments), boutons [{label, value, cls}] ; résout la valeur choisie.
export function sheet(title, content, buttons = [{ label: 'Fermer', value: 'close' }]) {
  const dlg = el('dialog', 'sheet');
  dlg.append(el('div', 'sheet-grab'), el('h3', 'serif', title));
  const body = el('div', 'sheet-body');
  body.append(...[].concat(content));
  const form = el('form', buttons.length > 1 ? 'row2' : '');
  form.method = 'dialog';
  for (const b of buttons) {
    const btn = el('button', 'btn ' + (b.cls || '') + (buttons.length === 1 ? ' wide' : ''), b.label);
    btn.value = b.value;
    form.append(btn);
  }
  dlg.append(body, form);
  document.body.append(dlg);
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => { resolve(dlg.returnValue); dlg.remove(); }, { once: true });
  });
}
