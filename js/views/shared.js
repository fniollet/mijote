// Éléments partagés entre plusieurs vues
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

export function syncBadge() {
  const s = store.status;
  const label = { synced: 'Synchronisé', syncing: 'Synchro…', offline: 'Hors ligne', local: 'Cet appareil', idle: '…' }[s] || s;
  return `<span class="sync-dot" data-s="${s}"><i></i><span class="sl">${label}</span></span>`;
}
export const SYNC_LABELS = { synced: 'Synchronisé', syncing: 'Synchro…', offline: 'Hors ligne', local: 'Cet appareil', idle: '…' };
export function updateSyncBadges() {
  document.querySelectorAll('.sync-dot').forEach((el) => {
    el.dataset.s = store.status;
    const l = el.querySelector('.sl');
    if (l) l.textContent = SYNC_LABELS[store.status] || store.status;
  });
}

export const emptyState = (emoji, title, text, action = '') =>
  `<div class="empty-state"><div class="big">${emoji}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;

export const backBtn = (cls = 'glass') => `<button class="icon-btn ${cls}" data-act="back" aria-label="Retour">${icon('left', 22)}</button>`;
