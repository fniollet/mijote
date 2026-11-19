// Éléments partagés entre plusieurs vues            (v1.0.1)
import { store } from '../store.js';
import { members, recipe, mealTitle } from '../model.js';
import { esc, norm, haptic } from '../utils.js';
import { cover, avatar, actionSheet, toast } from '../ui.js';
import { icon } from '../icons.js';

export const FREE_PRESETS = [
  ['Restes du frigo', '🥡', 'free'], ['Restaurant', '🍽️', 'out'], ['Chez les grands-parents', '👵', 'out'],
  ['Sandwich', '🥪', 'free'], ['Repas improvisé', '🎲', 'free'], ['Cantine / bureau', '🏫', 'out'], ['Pizza', '🍕', 'free'], ['Pique-nique', '🧺', 'out'],
];
export function freeEmoji(m) {
  const t = norm(m.title);
  const hit = FREE_PRESETS.find(([n]) => t.includes(norm(n).split(' ')[0]));
  if (hit) return hit[1];
  if (/reste/.test(t)) return '🥡';
  if (/resto|restaurant/.test(t)) return '🍽️';
  if (/grand|mamie|papi|chez/.test(t)) return '🏡';
  return m.kind === 'out' ? '📍' : '🥢';
}
export function mealThumb(m, cls = '') {
  const r = m.recipeId ? recipe(m.recipeId) : null;
  return r ? cover(r, { cls }) : `<div class="m-free ${cls}">${freeEmoji(m)}</div>`;
}
export const mealLabel = (m) => esc(mealTitle(m));

export function openMemberSwitch() {
  const list = members();
  actionSheet({
    title: 'Qui utilise cet appareil ?',
    subtitle: 'Les favoris et les actions seront associés à ce profil.',
    actions: [
      ...list.map((m) => ({ icon: m.id === store.memberId ? 'check' : 'users2', label: m.name + (m.id === store.memberId ? ' (actuel)' : ''), run: () => { store.memberId = m.id; haptic(12); toast(`Bonjour ${esc(m.name)} 👋`, { icon: 'users2' }); } })),
      { sep: true },
      { icon: 'settings', label: 'Gérer les membres', run: () => (location.hash = '#/reglages') },
    ],
    header: `<div class="row" style="justify-content:center;margin:-4px 0 12px;gap:0"><div class="avatar-stack">${list.map((m) => avatar(m, 44)).join('')}</div></div>`,
  });
}

export const SYNC_LABELS = { synced: 'Synchronisé', syncing: 'Synchro…', offline: 'Hors ligne', local: 'Cet appareil', idle: '…' };

/** Pastille de synchro — touchez-la pour forcer une synchronisation. */
export function syncBadge() {
  const s = store.status;
  const p = store.pending;
  return `<button type="button" class="sync-dot" data-s="${s}" data-sync title="Toucher pour synchroniser" aria-label="Synchronisation : ${SYNC_LABELS[s] || s}. Toucher pour synchroniser">
    <i></i><span class="sl">${SYNC_LABELS[s] || s}${p && s !== 'synced' ? ` · ${p}` : ''}</span></button>`;
}
export function updateSyncBadges() {
  const p = store.pending;
  document.querySelectorAll('.sync-dot').forEach((el) => {
    el.dataset.s = store.status;
    const l = el.querySelector('.sl');
    if (l) l.textContent = (SYNC_LABELS[store.status] || store.status) + (p && store.status !== 'synced' ? ` · ${p}` : '');
  });
}

let forcing = false;
export async function forceSyncWithFeedback() {
  if (store.mode !== 'cloud') {
    toast('Mode « cet appareil » : aucune synchronisation. Créez un espace familial pour partager.', { icon: 'info', duration: 5000 });
    return;
  }
  if (forcing) return;
  forcing = true;
  haptic(10);
  const anims = [...document.querySelectorAll('.sync-dot i')].map((el) =>
    el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8)', opacity: 0.3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700, iterations: Infinity }));
  const ok = await store.forceSync();
  anims.forEach((a) => a.cancel());
  forcing = false;
  if (ok) toast('Synchronisé ✓ · tout est à jour', { icon: 'cloud' });
  else if (!navigator.onLine) toast('Pas de connexion Internet. Vos modifications sont gardées et partiront dès le retour du réseau.', { icon: 'cloudOff', duration: 5000 });
  else toast(`Synchro impossible — ${esc(store.lastError || 'erreur inconnue')}`, { icon: 'cloudOff', duration: 12000 });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-sync]')) { e.preventDefault(); e.stopPropagation(); forceSyncWithFeedback(); }
}, true);

export const emptyState = (emoji, title, text, action = '') =>
  `<div class="empty-state"><div class="big">${emoji}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;

export const backBtn = (cls = 'glass') => `<button class="icon-btn ${cls}" data-act="back" aria-label="Retour">${icon('left', 22)}</button>`;
