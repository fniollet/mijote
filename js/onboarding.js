// ─────────────────────────────────────────────────────────────
// Onboarding : créer / rejoindre un espace familial, choisir son profil
// ─────────────────────────────────────────────────────────────
import { store, LS } from './store.js';
import { createFamily, members } from './model.js';
import { esc, uid, haptic } from './utils.js';
import { icon } from './icons.js';
import { avatar, stepper, confetti, MEMBER_COLORS, MEMBER_EMOJIS, toast, sheet } from './ui.js';

let host;
const mount = () => {
  host?.remove();
  host = document.createElement('div');
  host.className = 'onb';
  document.body.appendChild(host);
  return host;
};
const unmount = () => { if (host) { host.style.transition = 'opacity .4s'; host.style.opacity = '0'; const h = host; setTimeout(() => h.remove(), 400); host = null; } };
const render = (html) => {
  host.innerHTML = `<div class="onb-in view-in">${html}</div>`;
  host.scrollTop = 0;
  return host.querySelector('.onb-in');
};
const dots = (n, cur) => `<div class="onb-step-dots">${Array.from({ length: n }, (_, i) => `<i class="${i === cur ? 'on' : ''}"></i>`).join('')}</div>`;
const ORBIT = ['🥕', '🍅', '🧀', '🥖', '🍋', '🌿'];
const art = () => `<div class="onb-art"><div class="plate">🍲</div>${ORBIT.map((e, i) => `<span class="orbit" style="--r:${118 + (i % 2) * 22}px;animation-delay:-${i * 2.3}s">${e}</span>`).join('')}</div>`;

/** Lance l'onboarding ; résout quand une famille est ouverte et un membre choisi. */
export function runOnboarding() {
  return new Promise((resolve) => {
    mount();
    const draft = { name: '', people: [], servings: 4, demo: true };
    const cloud = store.cloudAvailable;

    const welcome = () => {
      const el = render(`
        ${art()}
        <h1>Les repas,<br><em>enfin</em> simples.</h1>
        <p class="lead">Planning, recettes et courses partagées pour toute la famille. Tout est relié, tout se synchronise.</p>
        <div class="onb-actions">
          <button class="btn primary" data-a="create">${icon('sparkles', 20)} Créer notre espace familial</button>
          ${cloud ? `<button class="btn dark" data-a="join">${icon('users', 20)} Rejoindre ma famille</button>` : ''}
          <button class="btn ghost" data-a="local">${cloud ? 'Essayer sur cet appareil uniquement' : 'Commencer'}</button>
          ${cloud ? '' : `<p class="note">Synchronisation familiale non configurée : les données restent sur cet appareil. Voir le README pour activer la synchro (5 min, gratuit).</p>`}
        </div>`);
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        haptic();
        if (a === 'create') { draft.mode = cloud ? 'cloud' : 'local'; stepName(); }
        if (a === 'local') { draft.mode = 'local'; stepName(); }
        if (a === 'join') join();
      });
    };

    const total = () => (draft.mode === 'cloud' ? 4 : 3);

    const stepName = () => {
      const el = render(`${dots(total(), 0)}
        <h2>Comment s'appelle votre famille ?</h2>
        <p class="sub">Il apparaîtra en haut de l'application.</p>
        <label class="field"><span>Nom de la famille</span>
          <input class="input" name="fam" placeholder="Famille Martin" value="${esc(draft.name)}" autocomplete="off" enterkeyhint="next"></label>
        <div class="onb-actions"><button class="btn primary" data-next>Continuer ${icon('right', 20)}</button>
        <button class="btn ghost" data-back>Retour</button></div>`);
      const inp = el.querySelector('input');
      setTimeout(() => inp.focus(), 350);
      const go = () => { draft.name = inp.value.trim() || 'Ma famille'; stepPeople(); };
      inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      el.querySelector('[data-next]').onclick = go;
      el.querySelector('[data-back]').onclick = welcome;
    };

    const stepPeople = () => {
      const el = render(`${dots(total(), 1)}
        <h2>Qui mange à la maison ?</h2>
        <p class="sub">Chaque membre aura son profil : auteur des recettes, favoris personnels, qui a acheté quoi…</p>
        <div class="people" id="people"></div>
        <div class="row" style="margin-bottom:18px">
          <input class="input" id="pname" placeholder="Prénom (ex. Florian)" autocomplete="off" enterkeyhint="done">
          <button class="btn dark" id="padd" style="flex:none;width:54px;padding:0">${icon('plus', 22)}</button>
        </div>
        <div class="onb-actions"><button class="btn primary" data-next>Continuer ${icon('right', 20)}</button>
        <button class="btn ghost" data-back>Retour</button></div>`);
      const list = el.querySelector('#people');
      const draw = () => {
        list.innerHTML = draft.people.map((p, i) => `<div class="person">${avatar(p, 44)}<b>${esc(p.name)}</b>
          <button class="icon-btn ghost sm" data-rm="${i}" aria-label="Retirer">${icon('x', 18)}</button></div>`).join('') ||
          `<p class="note">Ajoutez au moins une personne. Vous pourrez en ajouter d'autres plus tard.</p>`;
      };
      const inp = el.querySelector('#pname');
      const add = () => {
        const n = inp.value.trim();
        if (!n) return inp.focus();
        const i = draft.people.length;
        draft.people.push({ id: uid('u-'), name: n, color: MEMBER_COLORS[i % MEMBER_COLORS.length], emoji: MEMBER_EMOJIS[(i * 3) % MEMBER_EMOJIS.length] });
        inp.value = ''; inp.focus(); haptic(); draw();
      };
      el.querySelector('#padd').onclick = add;
      inp.addEventListener('keydown', (e) => e.key === 'Enter' && add());
      list.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { draft.people.splice(+b.dataset.rm, 1); draw(); } };
      el.querySelector('[data-next]').onclick = () => {
        if (inp.value.trim()) add();
        if (!draft.people.length) return toast('Ajoutez au moins un prénom', { icon: 'info' });
        stepServings();
      };
      el.querySelector('[data-back]').onclick = stepName;
      draw();
      setTimeout(() => inp.focus(), 350);
    };

    const stepServings = () => {
      const el = render(`${dots(total(), 2)}
        <h2>Combien de portions par repas ?</h2>
        <p class="sub">Valeur par défaut, modifiable pour chaque repas.</p>
        <div style="display:grid;place-items:center;margin:10px 0 26px">${stepper('serv', draft.servings || draft.people.length || 4, { min: 1, max: 20, label: 'pers.' })}</div>
        <label class="set-row card" style="border-radius:22px;margin-bottom:22px">
          <span class="sr-ic" style="background:var(--plum)">${icon('sparkles', 20)}</span>
          <span class="sr-body"><b>Démarrer avec une semaine d'exemple</b><small>Repas planifiés + courses déjà générées pour découvrir l'app</small></span>
          <span class="switch"><input type="checkbox" id="demo" ${draft.demo ? 'checked' : ''}><span></span></span>
        </label>
        <div class="onb-actions"><button class="btn primary" data-next>${draft.mode === 'cloud' ? 'Continuer' : 'Créer notre espace'} ${icon('right', 20)}</button>
        <button class="btn ghost" data-back>Retour</button></div>`);
      el.querySelector('[data-next]').onclick = async () => {
        draft.servings = +el.querySelector('input[name=serv]').value;
        draft.demo = el.querySelector('#demo').checked;
        if (draft.mode === 'cloud') return stepAccount();
        if (draft.mode === 'local' && !store.mode) await store.startLocal();
        finishCreate();
      };
      el.querySelector('[data-back]').onclick = stepPeople;
    };

    const stepAccount = () => {
      const el = render(`${dots(4, 3)}
        <h2>Votre identifiant familial</h2>
        <p class="sub">Un seul compte pour toute la famille : connectez chaque téléphone avec ces mêmes identifiants.</p>
        <label class="field"><span>E-mail de la famille</span><input class="input" type="email" name="email" autocomplete="username" placeholder="famille.martin@gmail.com"></label>
        <label class="field"><span>Mot de passe (8 caractères min.)</span><input class="input" type="password" name="pw" autocomplete="new-password"></label>
        <div class="err" id="err"></div>
        <div class="onb-actions"><button class="btn primary" data-next>Créer l'espace familial ${icon('check', 20)}</button>
        <button class="btn ghost" data-back>Retour</button></div>`);
      el.querySelector('[data-back]').onclick = stepServings;
      el.querySelector('[data-next]').onclick = async (ev) => {
        const email = el.querySelector('[name=email]').value.trim();
        const pw = el.querySelector('[name=pw]').value;
        const err = el.querySelector('#err');
        if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = 'Adresse e-mail invalide.');
        if (pw.length < 8) return (err.textContent = 'Le mot de passe doit contenir au moins 8 caractères.');
        ev.currentTarget.disabled = true; err.textContent = '';
        try {
          LS.set('pendingFamily', draft);
          const r = await store.signUp(email, pw);
          if (r.needsConfirmation) {
            render(`${art()}<h2 style="text-align:center">Vérifiez votre boîte mail 📬</h2>
              <p class="lead">Un lien de confirmation a été envoyé à <b>${esc(email)}</b>. Cliquez dessus puis revenez vous connecter : votre espace sera créé automatiquement.</p>
              <div class="onb-actions"><button class="btn primary" id="tologin">J'ai confirmé, me connecter</button></div>`)
              .querySelector('#tologin').onclick = () => join(email);
            return;
          }
          finishCreate();
        } catch (e) {
          err.textContent = humanError(e);
          ev.currentTarget.disabled = false;
        }
      };
    };

    const finishCreate = () => {
      LS.del('pendingFamily');
      createFamily(draft);
      confetti();
      render(`${art()}<h1>Bienvenue,<br><em>${esc(draft.name)}</em> !</h1>
        <p class="lead">Votre espace est prêt. ${draft.demo ? 'Une semaine d’exemple vous attend.' : 'À vous de jouer.'}</p>
        <div class="onb-actions"><button class="btn primary" id="go">C'est parti ${icon('right', 20)}</button></div>`)
        .querySelector('#go').onclick = () => (members().length > 1 ? pickMember() : done());
    };

    const join = (prefill = '') => {
      const el = render(`${art()}
        <h2 style="text-align:center">Rejoindre ma famille</h2>
        <p class="sub" style="text-align:center">Utilisez l'identifiant familial déjà créé sur un autre appareil.</p>
        <label class="field"><span>E-mail de la famille</span><input class="input" type="email" name="email" autocomplete="username" value="${esc(prefill)}"></label>
        <label class="field"><span>Mot de passe</span><input class="input" type="password" name="pw" autocomplete="current-password"></label>
        <div class="err" id="err"></div>
        <div class="onb-actions"><button class="btn primary" data-go>Se connecter ${icon('right', 20)}</button>
        <button class="linkish" data-forgot style="padding:10px">Mot de passe oublié ?</button>
        <button class="btn ghost" data-back>Retour</button></div>`);
      el.querySelector('[data-back]').onclick = welcome;
      el.querySelector('[data-forgot]').onclick = async () => {
        const email = el.querySelector('[name=email]').value.trim();
        if (!email) return (el.querySelector('#err').textContent = 'Saisissez d’abord l’e-mail de la famille.');
        try { await store.resetPassword(email); toast('E-mail de réinitialisation envoyé 📬', { icon: 'check' }); }
        catch (e) { el.querySelector('#err').textContent = humanError(e); }
      };
      el.querySelector('[data-go]').onclick = async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          await store.signIn(el.querySelector('[name=email]').value.trim(), el.querySelector('[name=pw]').value);
          const pending = LS.get('pendingFamily');
          if (!members(true).length && pending) { Object.assign(draft, pending); return finishCreate(); }
          if (!members(true).length) { draft.mode = 'cloud-existing'; return stepName(); }
          pickMember();
        } catch (e) {
          el.querySelector('#err').textContent = humanError(e);
          btn.disabled = false;
        }
      };
    };

    const pickMember = () => {
      const el = render(`<h1 style="margin-top:30px">Qui êtes-vous ?</h1>
        <p class="lead">Cet appareil sera associé à votre profil. Vous pourrez changer à tout moment.</p>
        <div class="who-grid stagger">${members().map((m) => `<button class="who" data-id="${m.id}">${avatar(m, 76)}${esc(m.name)}</button>`).join('')}</div>`);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        haptic(12);
        store.memberId = b.dataset.id;
        done();
      });
    };

    const done = () => { unmount(); resolve(); };

    // Point d'entrée
    if (store.mode) {
      // famille ouverte mais pas encore de profil sur cet appareil
      if (!members(true).length) { draft.mode = store.mode === 'cloud' ? 'cloud-existing' : 'local'; stepName(); }
      else pickMember();
    } else welcome();
  });
}

export function askNewPassword() {
  sheet({
    title: 'Nouveau mot de passe',
    body: `<label class="field"><span>Nouveau mot de passe</span><input class="input" type="password" name="pw" autocomplete="new-password"></label><div class="err"></div>`,
    footer: `<button class="btn primary" data-ok>Enregistrer</button>`,
    onMount(el, close) {
      el.querySelector('[data-ok]').onclick = async () => {
        const pw = el.querySelector('[name=pw]').value;
        if (pw.length < 8) return (el.querySelector('.err').textContent = '8 caractères minimum.');
        try { await store.updatePassword(pw); toast('Mot de passe mis à jour'); close(); }
        catch (e) { el.querySelector('.err').textContent = humanError(e); }
      };
    },
  });
}

export function humanError(e) {
  const m = String(e?.message || e || '');
  if (/invalid login/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
  if (/already registered|already exists/i.test(m)) return 'Un espace existe déjà avec cet e-mail : utilisez « Rejoindre ma famille ».';
  if (/email not confirmed/i.test(m)) return 'E-mail pas encore confirmé : cliquez sur le lien reçu par e-mail.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques minutes.';
  if (/fetch|network/i.test(m)) return 'Pas de connexion Internet.';
  return m || 'Une erreur est survenue.';
}
