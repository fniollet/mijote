// ─────────────────────────────────────────────────────────────
// MIJOTÉ — point d'entrée : démarrage, routeur, navigation, PWA   (v1.1)
// ─────────────────────────────────────────────────────────────
import { store, LS } from './store.js';
import { settings, members, shopping, memberName, mealsOn, mealTitle } from './model.js';
import { SLOTS } from './domain.js';
import { esc, todayISO, addDays, debounce } from './utils.js';
import { icon } from './icons.js';
import { toast, avatar, closeTopSheet } from './ui.js';
import { playIntro, playGoodbye } from './intro.js';
import { runOnboarding, askNewPassword } from './onboarding.js';
import { updateSyncBadges } from './views/shared.js';
import * as Home from './views/home.js';
import * as Planning from './views/planning.js';
import * as Recipes from './views/recipes.js';
import * as Recipe from './views/recipe.js';
import * as Shopping from './views/shopping.js';
import * as Cook from './views/cook.js';
import * as Settings from './views/settings.js';

const NAV = [
  { id: 'home', hash: '#/', label: 'Accueil', icon: 'home' },
  { id: 'planning', hash: '#/planning', label: 'Planning', icon: 'calendar' },
  { id: 'recettes', hash: '#/recettes', label: 'Recettes', icon: 'book' },
  { id: 'courses', hash: '#/courses', label: 'Courses', icon: 'cart' },
  { id: 'reglages', hash: '#/reglages', label: 'Réglages', icon: 'settings' },
];
const ROUTES = {
  '': [Home, 'home'], planning: [Planning, 'planning'], recettes: [Recipes, 'recettes'], recette: [Recipe, 'recettes'],
  courses: [Shopping, 'courses'], reglages: [Settings, 'reglages'], cuisine: [Cook, null],
};

const view = document.getElementById('view');
let current = null;
let currentKey = '';
let deferredInstall = null;

// ── Thème ───────────────────────────────────────────────────
function applyTheme() {
  const t = LS.get('theme', 'auto');
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#15110d' : '#fbf6ef';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ── Navigation ──────────────────────────────────────────────
function renderNav(active) {
  const remaining = store.mode ? shopping().toBuy.filter((i) => !i.pantry).length : 0;
  const idx = Math.max(0, NAV.findIndex((n) => n.id === active));
  const badge = (n) => (n.id === 'courses' && remaining ? `<span class="badge">${remaining > 99 ? '99+' : remaining}</span>` : '');
  const tb = document.getElementById('tabbar');
  if (!tb.querySelector('.tab-indicator')) {
    tb.innerHTML = `<span class="tab-indicator"></span>${NAV.map((n) => `
      <a class="tab" href="${n.hash}" data-nav="${n.id}" aria-label="${n.label}">${icon(n.icon, 23)}<span>${n.label}</span><span class="badge" hidden></span></a>`).join('')}`;
  }
  tb.querySelector('.tab-indicator').style.transform = `translateX(${idx * 100}%)`;
  tb.querySelectorAll('.tab').forEach((a) => {
    const on = a.dataset.nav === active;
    a.classList.toggle('on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    const b = a.querySelector('.badge');
    const html = badge(NAV.find((n) => n.id === a.dataset.nav));
    b.hidden = !html;
    if (html) b.textContent = remaining > 99 ? '99+' : remaining;
  });
  const me = store.member;
  document.getElementById('sidebar').innerHTML = `
    <a class="brand" href="#/"><img src="icons/icon-192.png" alt=""><b>Mijoté</b></a>
    ${NAV.map((n) => `<a class="side-link ${n.id === active ? 'on' : ''}" href="${n.hash}">${icon(n.icon, 21)}${n.label}${badge(n)}</a>`).join('')}
    <div class="side-foot">${avatar(me, 38)}<div style="min-width:0;flex:1"><b>${esc(me?.name || '')}</b><small>${esc(settings().name)}</small></div><span class="sync-dot" data-s="${store.status}" data-sync title="Synchroniser" style="padding:6px"><i></i></span></div>`;
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (id) params.id = decodeURIComponent(id);
  if (params.d) params.date = params.d;
  return { name: name || '', params };
}

function route() {
  const { name, params } = parseHash();
  const entry = ROUTES[name] || ROUTES[''];
  const key = location.hash;
  if (key === currentKey && current) return;
  while (closeTopSheet());
  try { current?.destroy?.(); } catch (e) { console.warn(e); }
  currentKey = key;
  const [mod, nav] = entry;
  if (mod === Cook) {
    current = mod.mount(view, params, api) || {};
    return;
  }
  view.innerHTML = '';
  view.scrollTop = 0;
  scrollTo({ top: 0, behavior: 'instant' });
  current = mod.mount(view, params, api) || {};
  renderNav(nav);
  view.focus({ preventScroll: true });
}

const refresh = debounce(() => {
  if (!store.mode) return;
  current?.refresh?.();
  const { name } = parseHash();
  renderNav((ROUTES[name] || ROUTES[''])[1]);
}, 60);

// ── Notifications des changements faits par les autres membres ──
const remoteQueue = [];
const flushRemote = debounce(() => {
  const msgs = remoteQueue.splice(0);
  if (!msgs.length) return;
  const uniq = [...new Set(msgs)];
  toast(uniq.length > 2 ? `${uniq.length} mises à jour de la famille` : uniq.join(' · '), { icon: 'users2' });
}, 700);
function onRemote({ col, id, by, prev }) {
  if (!by || by === store.memberId) return;
  const who = memberName(by) || 'Quelqu’un';
  const rec = store.getAny(col, id);
  if (!rec) return;
  let msg = '';
  if (col === 'items' && !prev) msg = `${who} a ajouté ${rec.name} aux courses`;
  else if (col === 'items' && rec.checked && !prev?.checked) msg = `${who} a acheté ${rec.name}`;
  else if (col === 'purchases' && !prev && !rec.deleted) msg = `${who} a acheté ${rec.name}`;
  else if (col === 'meals' && !prev) msg = `${who} a planifié ${mealTitle(rec)}`;
  else if (col === 'recipes' && !prev) msg = `${who} a ajouté la recette ${rec.title}`;
  if (msg) { remoteQueue.push(esc(msg)); flushRemote(); }
}

// ── API partagée avec les vues ───────────────────────────────
const api = {
  applyTheme,
  canInstall: () => !!deferredInstall,
  promptInstall: async () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } },
  goodbye() {
    const t = todayISO();
    const h = new Date().getHours();
    const upcoming = [...mealsOn(t), ...mealsOn(addDays(t, 1))].find((m) => m.date > t || SLOTS.findIndex((s) => s.id === m.slot) >= (h < 10 ? 0 : h < 14 ? 1 : 2));
    const name = store.member?.name;
    const msg = upcoming
      ? `Prochain repas : <b style="color:#fff">${esc(mealTitle(upcoming))}</b> ${upcoming.date === t ? 'tout à l’heure' : 'demain'}.<br>Bonne ${h >= 17 || h < 5 ? 'soirée' : 'journée'}${name ? ', ' + esc(name) : ''} !`
      : `Bonne ${h >= 17 || h < 5 ? 'soirée' : 'journée'}${name ? ', ' + esc(name) : ''} ! Tout est enregistré.`;
    store.flush();
    playGoodbye({ title: 'À bientôt !', message: msg, onResume: () => playIntro({ familyName: settings().name, duration: 1400 }) });
  },
  async logout() {
    await store.signOut();
    document.getElementById('app').hidden = true;
    api.goodbyeThen(start);
  },
  goodbyeThen(fn) {
    playGoodbye({ title: 'À bientôt !', message: 'Vous êtes déconnecté. Vos données sont en sécurité.', onResume: fn });
  },
};

// ── Démarrage ───────────────────────────────────────────────
async function start() {
  applyTheme();
  const knownFamily = LS.get('lastFamily', '');
  const introP = playIntro({ familyName: knownFamily, duration: knownFamily ? 2200 : 2800 });
  let state = 'onboarding';
  try { state = await store.boot(); } catch (e) { console.error(e); }
  await introP;

  if (state !== 'ready' || !members(true).length || !store.member || store.member.active === false) {
    await runOnboarding();
  }
  LS.set('lastFamily', settings().name);
  document.getElementById('app').hidden = false;
  currentKey = '';
  route();
}

store.on('change', (d) => {
  if (d?.remote) onRemote(d);
  refresh();
});
store.on('status', updateSyncBadges);
store.on('error', (e) => toast(esc(e.message), { icon: 'info', duration: 7000 }));
store.on('recovery', () => askNewPassword());
store.on('signedout', () => location.reload());

addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

// ── Service worker (hors ligne + mises à jour) ────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && hadController) {
          toast('Nouvelle version de Mijoté disponible', { icon: 'sparkles', action: 'Recharger', onAction: () => location.reload(), duration: 10000 });
        }
      });
    });
  }).catch((e) => console.warn('SW', e));
}

start();
