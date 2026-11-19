// ─────────────────────────────────────────────────────────────
// Composants d'interface réutilisables
// ─────────────────────────────────────────────────────────────
import { esc, haptic, clamp } from './utils.js';
import { icon } from './icons.js';

// ── Feuilles (bottom sheets sur mobile, modales sur ordinateur) ──
const stack = [];
export function sheet({ title = '', subtitle = '', body = '', footer = '', full = false, cls = '', onMount, onClose } = {}) {
  const root = document.getElementById('layers');
  const el = document.createElement('div');
  el.className = `sheet-wrap ${full ? 'is-full' : ''} ${cls}`;
  el.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab" aria-hidden="true"><span></span></div>
      ${title ? `<header class="sheet-head">
        <div><h2 class="sheet-title">${esc(title)}</h2>${subtitle ? `<p class="sheet-sub">${subtitle}</p>` : ''}</div>
        <button class="icon-btn ghost" data-close aria-label="Fermer">${icon('x', 20)}</button>
      </header>` : ''}
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  root.appendChild(el);
  document.body.classList.add('has-sheet');
  let closed = false;
  const close = (val) => {
    if (closed) return;
    closed = true;
    el.classList.remove('open');
    el.classList.add('closing');
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) document.body.classList.remove('has-sheet');
    setTimeout(() => el.remove(), 380);
    onClose && onClose(val);
  };
  const api = { el, close };
  stack.push(api);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  dragToDismiss(el.querySelector('.sheet'), close);
  onMount && onMount(el.querySelector('.sheet'), close);
  return api;
}
export const closeTopSheet = () => { const s = stack.at(-1); if (s) { s.close(); return true; } return false; };
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopSheet(); });

function dragToDismiss(sheetEl, close) {
  const grab = sheetEl.querySelector('.sheet-grab');
  const head = sheetEl.querySelector('.sheet-head');
  let y0 = null, dy = 0, t0 = 0;
  const start = (e) => {
    if (matchMedia('(min-width: 900px)').matches) return;
    y0 = e.touches ? e.touches[0].clientY : e.clientY; t0 = Date.now(); dy = 0;
    sheetEl.style.transition = 'none';
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, (e.touches ? e.touches[0].clientY : e.clientY) - y0);
    sheetEl.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    sheetEl.style.transition = '';
    const v = dy / Math.max(1, Date.now() - t0);
    if (dy > 110 || v > 0.6) close(); else sheetEl.style.transform = '';
    y0 = null;
  };
  [grab, head].filter(Boolean).forEach((h) => {
    h.addEventListener('touchstart', start, { passive: true });
    h.addEventListener('touchmove', move, { passive: true });
    h.addEventListener('touchend', end);
  });
}

/** Menu d'actions contextuel. */
export function actionSheet({ title, subtitle, header = '', actions }) {
  return new Promise((resolve) => {
    const s = sheet({
      title, subtitle,
      body: `${header}<div class="action-list">${actions
        .filter(Boolean)
        .map((a, i) => a.sep ? '<div class="action-sep"></div>' : `<button class="action-row ${a.danger ? 'danger' : ''}" data-i="${i}">
          <span class="action-ic">${icon(a.icon || 'right', 20)}</span><span class="action-label">${esc(a.label)}${a.hint ? `<small>${esc(a.hint)}</small>` : ''}</span>
        </button>`).join('')}</div>`,
      onMount(el, close) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('.action-row');
          if (!b) return;
          haptic();
          const a = actions.filter(Boolean)[+b.dataset.i];
          close(a);
        });
      },
      onClose: (a) => { resolve(a); a?.run && setTimeout(() => a.run(), 60); },
    });
  });
}

export function confirmDialog({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false, icon: ic = 'info' }) {
  return new Promise((resolve) => {
    sheet({
      cls: 'is-dialog',
      body: `<div class="dialog">
        <div class="dialog-ic ${danger ? 'danger' : ''}">${icon(ic, 26)}</div>
        <h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
        <div class="dialog-actions">
          <button class="btn ghost" data-r="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
        </div></div>`,
      onMount(el, close) {
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r === '1'); });
      },
      onClose: (v) => resolve(!!v),
    });
  });
}

// ── Toasts ──────────────────────────────────────────────────
export function toast(msg, { icon: ic = 'check', action, onAction, duration = 3200, tone = '' } = {}) {
  const host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${tone}`;
  t.innerHTML = `<span class="toast-ic">${icon(ic, 18)}</span><span class="toast-msg">${msg}</span>${action ? `<button class="toast-act">${esc(action)}</button>` : ''}`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  const kill = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); };
  const timer = setTimeout(kill, duration);
  t.querySelector('.toast-act')?.addEventListener('click', () => { clearTimeout(timer); kill(); onAction && onAction(); });
  t.addEventListener('click', (e) => { if (!e.target.closest('.toast-act')) kill(); });
}

// ── Couvertures de recettes (photo ou illustration générative) ──
export function cover(r, { cls = '', eager = false } = {}) {
  if (!r) return `<div class="cover cover-empty ${cls}"><span class="cover-emoji">🍽️</span></div>`;
  const [a, b] = r.palette || paletteFor(r.title || r.id);
  if (r.photo) {
    return `<div class="cover ${cls}" style="--c1:${a};--c2:${b}"><img src="${esc(r.photo)}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async" onload="this.classList.add('ld')"></div>`;
  }
  return `<div class="cover cover-art ${cls}" style="--c1:${a};--c2:${b}"><span class="cover-emoji">${esc(r.emoji || '🍽️')}</span></div>`;
}
const PALETTES = [['#FFB86B', '#FF6A3D'], ['#FFD3A5', '#FD6E6A'], ['#C2E9FB', '#7AA7EC'], ['#D4FC79', '#58B368'], ['#E7D7FF', '#9B7BEA'], ['#FFE29A', '#F2A541'], ['#FBC2EB', '#E26D9F'], ['#B8F1E3', '#3BB3A0']];
export function paletteFor(seed = '') {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// ── Avatars ─────────────────────────────────────────────────
export const MEMBER_COLORS = ['#FF6A3D', '#F2A541', '#58B368', '#3BB3A0', '#4F86F7', '#9B7BEA', '#E26D9F', '#8D6E63'];
export const MEMBER_EMOJIS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐨', '🐰', '🦄', '🐙', '🐝', '🦉', '🐧', '🐳', '🌻', '⭐'];
export function avatar(m, size = 32, cls = '') {
  if (!m) return `<span class="avatar ${cls}" style="--s:${size}px;--c:#bbb">?</span>`;
  const inner = m.emoji ? `<span class="av-emoji">${esc(m.emoji)}</span>` : esc((m.name || '?').slice(0, 1).toUpperCase());
  return `<span class="avatar ${cls}" title="${esc(m.name)}" style="--s:${size}px;--c:${esc(m.color || '#FF6A3D')}">${inner}</span>`;
}

// ── Stepper (− 4 +) ─────────────────────────────────────────
export const stepper = (name, value, { min = 1, max = 40, label = '' } = {}) => `
  <div class="stepper" data-min="${min}" data-max="${max}">
    <button type="button" class="st-btn" data-delta="-1" aria-label="Moins">${icon('minus', 18)}</button>
    <output class="st-val"><b data-val>${value}</b>${label ? `<small>${esc(label)}</small>` : ''}</output>
    <input type="hidden" name="${name}" value="${value}">
    <button type="button" class="st-btn" data-delta="1" aria-label="Plus">${icon('plus', 18)}</button>
  </div>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('.st-btn');
  if (!b) return;
  const st = b.closest('.stepper');
  const inp = st.querySelector('input');
  const v = clamp(+inp.value + +b.dataset.delta, +st.dataset.min, +st.dataset.max);
  if (v === +inp.value) return;
  inp.value = v;
  const out = st.querySelector('[data-val]');
  out.textContent = v;
  out.classList.remove('bump'); void out.offsetWidth; out.classList.add('bump');
  haptic(5);
  inp.dispatchEvent(new Event('change', { bubbles: true }));
});

// ── Confettis (célébration de fin de courses / création) ──────
export function confetti({ count = 140, origin } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#FF6A3D', '#FFC94A', '#58B368', '#4F86F7', '#E26D9F', '#9B7BEA'];
  const ox = origin?.x ?? innerWidth / 2, oy = origin?.y ?? innerHeight * 0.35;
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: 4 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, shape: Math.random() > 0.5 };
  });
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - frame / 150);
      if (p.shape) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2.4, 0, 7); ctx.fill(); }
      ctx.restore();
    });
    if (++frame < 150) requestAnimationFrame(tick); else c.remove();
  };
  tick();
}

// ── Puces de sélection (chips) ────────────────────────────────
export const chips = (name, options, selected = [], { multi = true } = {}) => `
  <div class="chip-set" data-name="${name}" data-multi="${multi ? 1 : 0}">
    ${options.map(([v, l]) => `<button type="button" class="chip ${selected.includes(v) ? 'on' : ''}" data-v="${esc(v)}">${l}</button>`).join('')}
  </div>`;
document.addEventListener('click', (e) => {
  const c = e.target.closest('.chip-set .chip');
  if (!c) return;
  const set = c.closest('.chip-set');
  if (set.dataset.multi === '1') c.classList.toggle('on');
  else { set.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); }
  haptic(4);
  set.dispatchEvent(new Event('change', { bubbles: true }));
});
export const chipValues = (root, name) => [...root.querySelectorAll(`.chip-set[data-name="${name}"] .chip.on`)].map((c) => c.dataset.v);

/** Écran « veille » (wake lock) — garde l'écran allumé en cuisine / au magasin. */
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      return true;
    }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
  return false;
}
