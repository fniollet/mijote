// ─────────────────────────────────────────────────────────────
// Utilitaires génériques (aucune dépendance)
// ─────────────────────────────────────────────────────────────

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = (prefix = '') =>
  prefix + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** Normalise une chaîne pour la recherche : minuscules, sans accents, espaces simples. */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const debounce = (fn, ms = 120) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// ── Dates (toujours en heure locale, format ISO AAAA-MM-JJ) ──────────
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const startOfWeek = (iso) => {
  const d = fromISO(iso);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  return toISO(d);
};
export const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);

const DAY = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTH_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const dayName = (iso, short = false) => {
  const n = DAY[fromISO(iso).getDay()];
  return short ? cap(n.slice(0, 3)) : cap(n);
};
export const fmtDate = (iso, opts = {}) => {
  const d = fromISO(iso);
  const s = `${opts.noDay ? '' : DAY[d.getDay()] + ' '}${d.getDate()} ${opts.shortMonth ? MONTH_S[d.getMonth()] : MONTH[d.getMonth()]}`;
  return cap(s.trim());
};
export const relDay = (iso) => {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return fmtDate(iso);
};
export const fmtDuration = (min) => {
  min = Math.round(min || 0);
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
};
export const fmtClock = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
export const timeAgo = (ts) => {
  if (!ts) return '';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = new Date(ts);
  return `le ${d.getDate()} ${MONTH[d.getMonth()]}`;
};

export const haptic = (ms = 8) => {
  try { navigator.vibrate && navigator.vibrate(ms); } catch {}
};

/** Compresse une image (fichier) en JPEG data-URL, côté max = size. */
export async function compressImage(file, size = 1000, quality = 0.74) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const r = Math.min(1, size / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
