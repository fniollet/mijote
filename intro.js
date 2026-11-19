// ─────────────────────────────────────────────────────────────
// Écran d'ouverture (≈2,6 s) et écran de fermeture « À bientôt »
// ─────────────────────────────────────────────────────────────
import { esc } from './utils.js';

const POT = `
<svg viewBox="0 0 150 150" aria-hidden="true">
  <g class="sp-steam" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9">
    <path d="M55 40c-8-10 8-16 0-28"/><path d="M75 36c-8-10 8-16 0-28"/><path d="M95 40c-8-10 8-16 0-28"/>
  </g>
  <g class="sp-lid">
    <rect x="66" y="48" width="18" height="9" rx="4.5" fill="#fff"/>
    <path d="M22 66c0-8 24-12 53-12s53 4 53 12z" fill="#fff"/>
  </g>
  <path d="M10 76h14M126 76h14" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
  <path d="M24 70h102v34c0 18-14 30-32 30H56c-18 0-32-12-32-30z" fill="#fff"/>
  <path d="M38 92c10 6 22 8 37 8s27-2 37-8" stroke="#FF5B2E" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"/>
</svg>`;

const FLOAT = ['🍅', '🥕', '🧄', '🥖', '🧀', '🍋', '🌿', '🥚', '🍄', '🫑', '🧅', '🥔'];

export function playIntro({ familyName = '', duration = 2600 } = {}) {
  const el = document.getElementById('splash');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const word = 'Mijoté';
  const floats = FLOAT.map((e, i) => {
    const a = (i / FLOAT.length) * Math.PI * 2;
    const r = 46 + Math.random() * 18;
    return `<span class="sp-float" style="--x0:${Math.cos(a) * r}vmin;--y0:${Math.sin(a) * r}vmin;--rot:${(Math.random() - 0.5) * 720}deg;animation-delay:${0.05 * i}s">${e}</span>`;
  }).join('');
  el.innerHTML = `
    ${floats}
    <div class="sp-center">
      <div class="sp-pot">${POT}</div>
      <div class="sp-title">${[...word].map((c, i) => `<span style="animation-delay:${0.35 + i * 0.07}s">${c}</span>`).join('')}</div>
      <div class="sp-tag">${familyName ? `Bon retour, ${esc(familyName)} 👋` : 'Les repas de la famille, mijotés ensemble.'}</div>
    </div>
    <div class="sp-bar" style="--dur:${duration}ms"><i></i></div>
    <div class="sp-skip">Touchez pour passer</div>`;
  el.className = 'splash';
  el.hidden = false;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      resolve();
      setTimeout(() => { el.hidden = true; el.innerHTML = ''; el.className = 'splash'; }, 820);
    };
    setTimeout(finish, reduced ? 300 : duration);
    el.addEventListener('click', finish, { once: true });
  });
}

/** Écran de fermeture : animation « bonne nuit » puis veille (touchez pour revenir). */
export function playGoodbye({ title = 'À bientôt !', message = '', onResume }) {
  const el = document.getElementById('splash');
  const stars = Array.from({ length: 40 }, () =>
    `<i style="left:${Math.random() * 100}%;top:${Math.random() * 70}%;animation-delay:${Math.random() * 2.4}s;opacity:${0.3 + Math.random() * 0.7}"></i>`).join('');
  el.className = 'splash goodbye';
  el.innerHTML = `
    <div class="stars">${stars}</div>
    <div class="sp-center" style="padding:24px">
      <div class="moon">🌙</div>
      <h2>${esc(title)}</h2>
      <p>${message}</p>
      <button class="btn ghost resume">Revenir dans Mijoté</button>
    </div>`;
  el.hidden = false;
  document.getElementById('app').setAttribute('aria-hidden', 'true');
  el.querySelector('.resume').addEventListener('click', () => {
    document.getElementById('app').removeAttribute('aria-hidden');
    onResume && onResume();
  });
}
