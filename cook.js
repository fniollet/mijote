// ─────────────────────────────────────────────────────────────
// MODE CUISINE (spec §7) — étapes une par une, minuteurs, portions   (v1.1)
// v1.1 : à la fin, proposition de retirer du stock les ingrédients utilisés.
// Les minuteurs reposent sur une heure de fin absolue : ils restent
// justes même si l'écran se met en veille ou si l'app passe en arrière-plan.
// ─────────────────────────────────────────────────────────────
import { recipe, stockUsedBy, consumeStock } from '../model.js';
import { scaleQty, fmtQty, ingredientName } from '../domain.js';
import { esc, fmtClock, fmtDuration, haptic, norm } from '../utils.js';
import { icon } from '../icons.js';
import { cover, stepper, keepAwake, confetti, toast, undoToast } from '../ui.js';
import { LS } from '../store.js';

let timers = LS.get('timers', []).filter((t) => t.end > Date.now() - 3600e3 || t.paused);
const saveTimers = () => LS.set('timers', timers);

export function mount(root, params) {
  const r = recipe(params.id);
  if (!r) { location.hash = '#/recettes'; return {}; }
  let servings = +params.s || r.servings;
  let phase = 'start'; // start | step | all | finish
  let cur = 0;
  let dir = 'r';
  let stockDone = false;
  const done = new Set(LS.get('cookdone:' + r.id, []));
  const steps = r.steps?.length ? r.steps : [{ title: 'Préparer', text: 'Cette recette n’a pas encore d’étapes détaillées.' }];
  const [c1, c2] = r.palette || ['#ff9b52', '#ff5b2e'];

  const el = document.createElement('div');
  el.className = 'cook';
  el.innerHTML = `<div class="cook-bg" style="background:radial-gradient(60% 50% at 20% 10%, ${c1}, transparent), radial-gradient(60% 50% at 90% 90%, ${c2}, transparent)"></div>
    <div class="cook-top">
      <button class="icon-btn" data-a="close" aria-label="Quitter">${icon('x', 22)}</button>
      <div class="ct-title"><b>${esc(r.title)}</b><small id="ct-sub"></small></div>
      <button class="icon-btn" data-a="all" aria-label="Toutes les étapes">${icon('list', 22)}</button>
    </div>
    <div class="segs" id="segs"></div>
    <div class="cook-stage" id="stage"></div>
    <div class="timers" id="timers"></div>
    <div class="cook-nav" id="nav"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('has-sheet');
  keepAwake(true);

  const scaledIngs = () => (r.ingredients || []).map((i) => ({ ...i, label: `${fmtQty(scaleQty(i.q, r.servings, servings), i.u)}`, name: ingredientName(i) }));
  const ingsInStep = (s) => {
    const t = norm(`${s.title} ${s.text}`);
    return scaledIngs().filter((i) => {
      const words = norm(i.name).split(' ').filter((w) => w.length > 3);
      return words.some((w) => t.includes(w.replace(/s$/, '')));
    });
  };

  const stockBox = () => {
    if (stockDone) return `<div class="cook-stockbox"><b>✅ Stock mis à jour</b></div>`;
    const used = stockUsedBy(r, servings);
    if (!used.length) return '';
    return `<div class="cook-stockbox" id="sbox">
      <b>🧊 Mettre à jour « Chez moi » ?</b>
      <small>Ces ingrédients sont dans votre stock. Décochez ce que vous n’avez pas utilisé.</small>
      ${used.map((u, i) => `<label class="sb-row"><input type="checkbox" data-u="${i}" checked><span>${esc(u.name)}</span><b>${u.qty != null ? '−' + fmtQty(u.qty, u.unit) : 'tout'}</b></label>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-a="nostock" style="color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)">Non merci</button>
      <button class="btn primary" data-a="stock">Mettre à jour</button></div></div>`;
  };

  const paint = () => {
    const stage = el.querySelector('#stage');
    el.querySelector('#ct-sub').textContent = phase === 'step' ? `Étape ${cur + 1} sur ${steps.length} · ${servings} pers.` : `${servings} personne${servings > 1 ? 's' : ''}`;
    el.querySelector('#segs').innerHTML = steps.map((_, k) => `<i class="${done.has(k) || (phase === 'finish') ? 'done' : ''} ${phase === 'step' && k === cur ? 'cur' : ''}"></i>`).join('');
    const nav = el.querySelector('#nav');

    if (phase === 'start') {
      stage.innerHTML = `<div class="cook-start view-in">
        ${cover(r, { eager: true })}
        <h1>${esc(r.title)}</h1>
        <p style="text-align:center;color:#c9b9a8;margin:8px 0 18px">${steps.length} étapes · ${fmtDuration((+r.prep || 0) + (+r.cook || 0))}</p>
        <div style="display:grid;place-items:center">${stepper('cs', servings, { min: 1, max: 40, label: 'personnes' })}</div>
        <div class="ck-ings">${scaledIngs().map((i) => `<div><b>${i.label || '—'}</b><span>${esc(i.name)}${i.opt ? ' <span class="opt">facultatif</span>' : ''}</span></div>`).join('')}</div>
      </div>`;
      nav.innerHTML = `<button class="btn primary next" data-a="begin">${icon('chef', 22)} Commencer à cuisiner</button>`;
    } else if (phase === 'step') {
      const s = steps[cur];
      const ings = ingsInStep(s);
      const running = timers.find((t) => t.rid === r.id && t.step === cur);
      stage.innerHTML = `<div class="cook-step enter-${dir}">
        <div class="cs-n">Étape ${cur + 1}</div>
        <h2>${esc(s.title || `Étape ${cur + 1}`)}</h2>
        <p>${esc(s.text)}</p>
        ${ings.length ? `<div class="cs-ings">${ings.map((i) => `<span><b>${i.label}</b> ${esc(i.name.toLowerCase())}</span>`).join('')}</div>` : ''}
        <div class="cs-chips">
          ${s.dur ? `<button class="timer-btn" data-a="timer">${icon('timer', 24)} ${running ? 'Minuteur en cours' : `Lancer ${fmtDuration(s.dur / 60)}`}</button>` : ''}
          ${s.temp ? `<span class="cs-done">${icon('thermo', 20)} ${esc(s.temp)}</span>` : ''}
          <button class="cs-done ${done.has(cur) ? 'on' : ''}" data-a="done">${icon('check', 20)} ${done.has(cur) ? 'Terminée' : 'Marquer terminée'}</button>
        </div></div>`;
      nav.innerHTML = `<button class="btn prev" data-a="prev" aria-label="Précédente">${icon('left', 24)}</button>
        <button class="btn primary next" data-a="next">${cur === steps.length - 1 ? `${icon('check', 22)} Terminer` : `Étape suivante ${icon('right', 22)}`}</button>`;
    } else if (phase === 'all') {
      stage.innerHTML = `<div class="cook-all view-in">${steps.map((s, k) => `
        <div class="step ${k === cur ? 'cur' : ''} ${done.has(k) ? 'done' : ''}" data-go="${k}"><span class="num">${k + 1}</span><div>${s.title ? `<h4>${esc(s.title)}</h4>` : ''}<p>${esc(s.text)}</p>
        ${s.dur ? `<div class="chips-row"><span class="pill accent">${icon('timer', 14)} ${fmtDuration(s.dur / 60)}</span></div>` : ''}</div></div>`).join('')}</div>`;
      nav.innerHTML = `<button class="btn primary next" data-a="resume">Reprendre à l’étape ${cur + 1}</button>`;
    } else {
      stage.innerHTML = `<div class="cook-finish"><div><div class="big">🍽️</div><h2>Bon appétit !</h2>
        <p style="color:#c9b9a8;font-size:18px">${esc(r.title)} est prêt pour ${servings} personne${servings > 1 ? 's' : ''}.</p>${stockBox()}</div></div>`;
      nav.innerHTML = `<button class="btn primary next" data-a="close">Revenir à l’application</button>`;
    }
    paintTimers();
  };

  // ── Minuteurs ─────────────────────────────────────────────
  let audio;
  const beep = () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = audio.currentTime;
      [0, 0.25, 0.5, 1, 1.25, 1.5].forEach((o, i) => {
        const osc = audio.createOscillator(), g = audio.createGain();
        osc.type = 'sine'; osc.frequency.value = i % 3 === 2 ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, now + o); g.gain.exponentialRampToValueAtTime(0.4, now + o + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + o + 0.2);
        osc.connect(g).connect(audio.destination); osc.start(now + o); osc.stop(now + o + 0.22);
      });
    } catch {}
  };
  const notify = async (t) => {
    haptic([300, 120, 300, 120, 500]);
    beep();
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker?.getRegistration();
        const opts = { body: `${t.label} — c'est prêt !`, icon: 'icons/icon-192.png', tag: 'timer-' + t.id, vibrate: [300, 100, 300] };
        reg ? reg.showNotification('⏰ Minuteur terminé', opts) : new Notification('⏰ Minuteur terminé', opts);
      }
    } catch {}
  };
  const startTimer = () => {
    const s = steps[cur];
    if (!s.dur) return;
    if (timers.find((t) => t.rid === r.id && t.step === cur)) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    timers.push({ id: Date.now(), rid: r.id, step: cur, label: s.title || `Étape ${cur + 1}`, total: s.dur, end: Date.now() + s.dur * 1000, paused: null, rang: false });
    saveTimers(); haptic(12); paint();
  };
  const left = (t) => (t.paused != null ? t.paused : Math.max(0, (t.end - Date.now()) / 1000));
  const paintTimers = () => {
    el.querySelector('#timers').innerHTML = timers.map((t) => {
      const l = left(t), ringing = l <= 0;
      return `<div class="tmr ${ringing ? 'ring' : ''}" data-t="${t.id}"><span class="tm-bar" style="width:${100 - (l / t.total) * 100}%"></span>
        <div><b>${ringing ? '00:00' : fmtClock(l)}</b><small>${esc(t.label)}</small></div>
        ${ringing ? `<button class="icon-btn" data-ta="dismiss">${icon('check', 18)}</button>` : `
        <button class="icon-btn" data-ta="${t.paused != null ? 'resume' : 'pause'}">${icon(t.paused != null ? 'play' : 'pause', 16)}</button>
        <button class="icon-btn" data-ta="reset">${icon('reset', 16)}</button>`}
        <button class="icon-btn" data-ta="dismiss" aria-label="Supprimer" ${ringing ? 'hidden' : ''}>${icon('x', 16)}</button></div>`;
    }).join('');
  };
  const tick = setInterval(() => {
    let changed = false;
    for (const t of timers) {
      if (t.paused == null && !t.rang && t.end <= Date.now()) { t.rang = true; changed = true; notify(t); toast(`⏰ ${esc(t.label)} : terminé !`, { icon: 'timer', duration: 6000 }); }
      if (t.rang && t.end <= Date.now() && (Date.now() - t.end) % 6000 < 1000 && Date.now() - t.end < 60000) beep();
    }
    if (changed) saveTimers();
    paintTimers();
  }, 1000);

  el.querySelector('#timers').onclick = (e) => {
    const b = e.target.closest('[data-ta]'); if (!b) return;
    const t = timers.find((x) => x.id === +b.closest('[data-t]').dataset.t); if (!t) return;
    switch (b.dataset.ta) {
      case 'pause': t.paused = left(t); break;
      case 'resume': t.end = Date.now() + t.paused * 1000; t.paused = null; break;
      case 'reset': t.end = Date.now() + t.total * 1000; t.paused = t.paused != null ? t.total : null; t.rang = false; break;
      case 'dismiss': timers = timers.filter((x) => x !== t); break;
    }
    haptic(6); saveTimers(); paint();
  };

  // ── Navigation ────────────────────────────────────────────
  const go = (k) => {
    if (k < 0) return;
    if (k >= steps.length) { phase = 'finish'; done.clear(); LS.del('cookdone:' + r.id); confetti(); paint(); return; }
    dir = k > cur ? 'r' : 'l'; cur = k; phase = 'step'; haptic(6); paint();
  };
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) return go(+g.dataset.go);
    const a = e.target.closest('[data-a]')?.dataset.a;
    switch (a) {
      case 'close': return close();
      case 'begin': phase = 'step'; cur = 0; return paint();
      case 'next': done.add(cur); LS.set('cookdone:' + r.id, [...done]); return go(cur + 1);
      case 'prev': return go(cur - 1);
      case 'all': phase = phase === 'all' ? 'step' : 'all'; return paint();
      case 'resume': phase = 'step'; return paint();
      case 'timer': return startTimer();
      case 'done': done.has(cur) ? done.delete(cur) : done.add(cur); LS.set('cookdone:' + r.id, [...done]); haptic(8); return paint();
      case 'nostock': el.querySelector('#sbox')?.remove(); return;
      case 'stock': {
        const used = stockUsedBy(r, servings);
        const picked = [...el.querySelectorAll('#sbox [data-u]')].filter((c) => c.checked).map((c) => used[+c.dataset.u]).filter(Boolean);
        const undos = picked.map((u) => consumeStock(u.key, u.qty, u.lots));
        stockDone = true; haptic(12); paint();
        undoToast(`Stock mis à jour · ${picked.length} produit${picked.length > 1 ? 's' : ''}`, () => { undos.reverse().forEach((u) => u()); }, { icon: 'fridge' });
        return;
      }
    }
  });
  el.addEventListener('change', (e) => { if (e.target.name === 'cs') { servings = +e.target.value; paint(); } });

  let x0 = null, y0 = null;
  const stage = el.querySelector('#stage');
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null || phase !== 'step') return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  const onKey = (e) => {
    if (phase !== 'step') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft') go(cur - 1);
  };
  addEventListener('keydown', onKey);
  const onVis = () => { if (document.visibilityState === 'visible') keepAwake(true); };
  document.addEventListener('visibilitychange', onVis);

  const close = () => (history.length > 1 ? history.back() : (location.hash = `#/recette/${r.id}`));

  paint();
  return {
    refresh() {},
    destroy() {
      clearInterval(tick); removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
      keepAwake(false);
      el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
      if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('has-sheet');
    },
  };
}
