// ─────────────────────────────────────────────────────────────
// PARAMÈTRES (spec §9) — famille, membres, préférences, données
// ─────────────────────────────────────────────────────────────
import { store, LS } from '../store.js';
import { settings, saveSettings, members, seedDemoWeek } from '../model.js';
import { SLOTS } from '../domain.js';
import { esc, uid, haptic } from '../utils.js';
import { icon } from '../icons.js';
import { sheet, actionSheet, confirmDialog, toast, avatar, stepper, MEMBER_COLORS, MEMBER_EMOJIS } from '../ui.js';
import { syncBadge } from './shared.js';

const row = (ic, color, title, sub = '', act = '', right = icon('right', 18, 'chev'), extra = '') =>
  `<button class="set-row ${extra}" ${act}><span class="sr-ic" style="background:${color}">${icon(ic, 20)}</span><span class="sr-body"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right}</button>`;

export function mount(root, _p, app) {
  let first = true;
  const paint = () => {
    const s = settings();
    const all = members(true);
    const theme = LS.get('theme', 'auto');
    const cloud = store.mode === 'cloud';
    root.innerHTML = `
      <div class="${first ? 'view-in' : ''}">
        <header class="page-head"><div><div class="eyebrow">Réglages</div><h1>La maison</h1></div>${syncBadge()}</header>
        <div class="family-card">
          <h2>${esc(s.name)}</h2>
          <p>${all.filter((m) => m.active !== false).length} membre${all.length > 1 ? 's' : ''} · ${cloud ? 'synchronisé entre vos appareils' : 'données sur cet appareil'}</p>
          <div class="avatar-stack">${all.filter((m) => m.active !== false).map((m) => avatar(m, 42)).join('')}</div>
        </div>

        <div class="set-group"><h3>Famille</h3><div class="set-list">
          ${row('edit', '#ff8a3d', 'Nom de la famille', esc(s.name), 'data-a="name"')}
          ${row('users', '#4fa772', 'Portions par défaut', `${s.defaultServings} personnes par repas`, 'data-a="servings"')}
          ${row('clock', '#4f86f7', 'Horaires des repas', SLOTS.map((x) => `${x.short} ${s.times[x.id]}`).join(' · '), 'data-a="times"')}
          ${row('sun', '#8d6e63', 'Fuseau horaire · unités', `${esc(s.timezone)} · système métrique`, 'data-a="tz"')}
        </div></div>

        <div class="set-group"><h3>Membres</h3><div class="set-list">
          ${all.map((m) => `<button class="set-row ${m.active === false ? 'inactive' : ''}" data-member="${m.id}">${avatar(m, 38)}<span class="sr-body"><b>${esc(m.name)}${m.id === store.memberId ? ' · <span class="faint">cet appareil</span>' : ''}</b><small>${m.active === false ? 'Profil désactivé' : 'Actif'}</small></span>${icon('right', 18, 'chev')}</button>`).join('')}
          ${row('plus', '#ff5b2e', 'Ajouter un membre', '', 'data-a="add-member"', '')}
        </div></div>

        <div class="set-group"><h3>Préférences alimentaires</h3><div class="set-list">
          ${row('info', '#e5484d', 'Allergies, intolérances, à éviter', [...s.allergies, ...s.intolerances, ...s.avoid].map(esc).join(', ') || 'Aucune renseignée', 'data-a="diet"')}
        </div></div>

        <div class="set-group"><h3>Affichage</h3><div class="set-list" style="padding:12px">
          <div class="seg" id="theme">${[['auto', 'Auto'], ['light', '☀️ Clair'], ['dark', '🌙 Sombre']].map(([v, l]) => `<button class="${v === theme ? 'on' : ''}" data-t="${v}">${l}</button>`).join('')}</div>
        </div></div>

        <div class="set-group"><h3>Synchronisation & données</h3><div class="set-list">
          ${cloud ? row('cloud', '#4fa772', 'Compte familial', esc(store.user?.email || ''), 'data-a="account"')
            : row('cloudOff', '#4f86f7', 'Synchroniser la famille', store.cloudAvailable ? 'Connecter un compte familial' : 'Configurer Supabase (gratuit, 5 min)', 'data-a="cloud"')}
          ${row('download', '#8c6cf0', 'Exporter une sauvegarde', 'Fichier JSON de toutes vos données', 'data-a="export"')}
          ${row('upload', '#8c6cf0', 'Importer une sauvegarde', '', 'data-a="import"')}
          ${row('sparkles', '#ffb547', 'Ajouter une semaine d’exemple', 'Remplit les 7 prochains jours', 'data-a="demo"')}
          ${row('archive', '#8d6e63', 'Recettes archivées', '', 'data-a="archived"')}
        </div></div>

        <div class="set-group"><h3>Application</h3><div class="set-list">
          ${row('bolt', '#23190f', 'Installer sur l’écran d’accueil', 'iPhone, Android, ordinateur', 'data-a="install"')}
          ${row('moon', '#3a2416', 'Fermer Mijoté', 'Écran « À bientôt » et mise en veille', 'data-a="goodbye"')}
          ${row('logout', '#e5484d', cloud ? 'Se déconnecter de cet appareil' : 'Quitter l’espace local', '', 'data-a="logout"', '')}
        </div></div>
        <p class="foot-note">Mijoté 1.0 · fait avec ❤️ pour les familles<br>Les indications d’allergènes ne sont jamais garanties.</p>
      </div>`;
    first = false;
  };

  root.onclick = async (e) => {
    const m = e.target.closest('[data-member]');
    if (m) return editMember(store.get('members', m.dataset.member));
    const a = e.target.closest('[data-a]')?.dataset.a;
    const s = settings();
    switch (a) {
      case 'name': return simpleInput('Nom de la famille', s.name, (v) => saveSettings({ name: v || s.name }));
      case 'servings': return sheet({
        title: 'Portions par défaut', subtitle: 'Utilisé lors de l’ajout d’un repas, modifiable à chaque fois.',
        body: `<div style="display:grid;place-items:center;padding:10px 0 20px">${stepper('ds', s.defaultServings, { min: 1, max: 20, label: 'pers.' })}</div>`,
        footer: `<button class="btn primary" data-ok>Enregistrer</button>`,
        onMount(el, close) { el.querySelector('[data-ok]').onclick = () => { saveSettings({ defaultServings: +el.querySelector('[name=ds]').value }); close(); toast('Enregistré'); }; },
      });
      case 'times': return sheet({
        title: 'Horaires des repas', subtitle: 'Servent à déterminer le « prochain repas » de l’accueil.',
        body: SLOTS.map((x) => `<label class="field"><span>${x.emoji} ${x.label}</span><input class="input" type="time" data-slot="${x.id}" value="${s.times[x.id]}"></label>`).join(''),
        footer: `<button class="btn primary" data-ok>Enregistrer</button>`,
        onMount(el, close) { el.querySelector('[data-ok]').onclick = () => { const t = {}; el.querySelectorAll('[data-slot]').forEach((i) => (t[i.dataset.slot] = i.value || s.times[i.dataset.slot])); saveSettings({ times: t }); close(); toast('Horaires enregistrés'); }; },
      });
      case 'tz': return simpleInput('Fuseau horaire', s.timezone, (v) => saveSettings({ timezone: v || s.timezone }), 'Ex. Europe/Paris, America/Montreal');
      case 'add-member': return editMember(null);
      case 'diet': return dietSheet();
      case 'account': return actionSheet({
        title: 'Compte familial', subtitle: esc(store.user?.email || ''),
        actions: [
          { icon: 'info', label: 'Comment connecter un autre téléphone ?', run: () => toast('Ouvrez Mijoté sur l’autre appareil → « Rejoindre ma famille » → même e-mail et mot de passe.', { icon: 'info', duration: 7000 }) },
          { icon: 'edit', label: 'Changer le mot de passe', run: async () => { const { askNewPassword } = await import('../onboarding.js'); askNewPassword(); } },
          { icon: 'reset', label: 'Forcer une synchronisation', run: () => { store.pull(true); store.flush(); } },
        ],
      });
      case 'cloud': return cloudSheet();
      case 'export': {
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: `mijote-sauvegarde-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return toast('Sauvegarde exportée', { icon: 'download' });
      }
      case 'import': {
        const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
        inp.onchange = async () => {
          try {
            const text = await inp.files[0].text();
            if (!(await confirmDialog({ title: 'Importer cette sauvegarde ?', text: 'Les éléments du fichier seront ajoutés ou remplaceront ceux portant le même identifiant.', ok: 'Importer', icon: 'upload' }))) return;
            store.importJSON(text); toast('Sauvegarde importée', { icon: 'upload' });
          } catch (err) { toast(esc(err.message), { icon: 'info', tone: 'err' }); }
        };
        return inp.click();
      }
      case 'demo': seedDemoWeek(s.defaultServings); return toast('Semaine d’exemple ajoutée', { icon: 'sparkles', action: 'Voir', onAction: () => (location.hash = '#/planning') });
      case 'archived': return (location.hash = '#/recettes?f=archived');
      case 'install': return installSheet();
      case 'goodbye': return app.goodbye();
      case 'logout': {
        const ok = await confirmDialog({
          title: store.mode === 'cloud' ? 'Se déconnecter ?' : 'Quitter l’espace local ?',
          text: store.mode === 'cloud' ? 'Vos données restent en sécurité dans le compte familial.' : 'Les données restent sur cet appareil et seront retrouvées si vous recréez un espace local. Exportez une sauvegarde au besoin.',
          ok: 'Se déconnecter', danger: true, icon: 'logout',
        });
        if (ok) app.logout();
      }
    }
  };
  root.querySelector && root.addEventListener('click', (e) => {
    const t = e.target.closest('#theme [data-t]');
    if (!t) return;
    LS.set('theme', t.dataset.t); app.applyTheme(); haptic(6); paint();
  });

  const simpleInput = (title, value, save, placeholder = '') => sheet({
    title,
    body: `<input class="input" id="v" value="${esc(value)}" placeholder="${esc(placeholder)}">`,
    footer: `<button class="btn primary" data-ok>Enregistrer</button>`,
    onMount(el, close) {
      const i = el.querySelector('#v'); setTimeout(() => i.focus(), 300);
      const ok = () => { save(i.value.trim()); close(); toast('Enregistré'); };
      el.querySelector('[data-ok]').onclick = ok; i.onkeydown = (e) => e.key === 'Enter' && ok();
    },
  });

  const editMember = (m) => {
    const st = { name: m?.name || '', color: m?.color || MEMBER_COLORS[members(true).length % MEMBER_COLORS.length], emoji: m?.emoji ?? MEMBER_EMOJIS[members(true).length % MEMBER_EMOJIS.length], active: m?.active !== false };
    sheet({
      title: m ? 'Modifier le profil' : 'Nouveau membre',
      body: `<div style="display:grid;place-items:center;margin-bottom:16px" id="prev">${avatar(st, 88)}</div>
        <label class="field"><span>Prénom</span><input class="input" id="n" value="${esc(st.name)}" placeholder="Prénom"></label>
        <div class="field"><span>Couleur</span><div class="color-row" id="col">${MEMBER_COLORS.map((c) => `<button type="button" style="--c:${c}" class="${c === st.color ? 'on' : ''}" data-c="${c}"></button>`).join('')}</div></div>
        <div class="field"><span>Avatar</span><div class="emoji-grid" id="emo"><button type="button" class="${!st.emoji ? 'on' : ''}" data-e="" style="font-size:15px;font-weight:800">Aa</button>${MEMBER_EMOJIS.map((x) => `<button type="button" class="${x === st.emoji ? 'on' : ''}" data-e="${x}">${x}</button>`).join('')}</div></div>
        ${m ? `<label class="set-row card" style="border-radius:20px"><span class="sr-body"><b>Profil actif</b><small>Un profil inactif n’apparaît plus dans les choix, son historique est conservé.</small></span><span class="switch"><input type="checkbox" id="act" ${st.active ? 'checked' : ''}><span></span></span></label>` : ''}`,
      footer: `${m && m.id !== store.memberId ? `<button class="btn ghost" data-a="use" style="flex:0 0 auto">C’est moi</button>` : ''}<button class="btn primary" data-a="ok">${m ? 'Enregistrer' : 'Ajouter'}</button>`,
      onMount(el, close) {
        const prev = () => (el.querySelector('#prev').innerHTML = avatar({ ...st, name: el.querySelector('#n').value || '?' }, 88));
        el.querySelector('#n').oninput = prev;
        el.querySelector('#col').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; st.color = b.dataset.c; el.querySelectorAll('#col button').forEach((x) => x.classList.toggle('on', x === b)); prev(); };
        el.querySelector('#emo').onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; st.emoji = b.dataset.e; el.querySelectorAll('#emo button').forEach((x) => x.classList.toggle('on', x === b)); prev(); };
        el.querySelector('[data-a=use]')?.addEventListener('click', () => { store.memberId = m.id; close(); toast(`Cet appareil est maintenant celui de ${esc(m.name)}`, { icon: 'users2' }); });
        el.querySelector('[data-a=ok]').onclick = () => {
          const name = el.querySelector('#n').value.trim();
          if (!name) return el.querySelector('#n').focus();
          const active = el.querySelector('#act') ? el.querySelector('#act').checked : true;
          if (m && !active && m.id === store.memberId && members().length > 1) toast('Pensez à choisir un autre profil pour cet appareil', { icon: 'info' });
          store.put('members', m?.id || uid('u-'), { name, color: st.color, emoji: st.emoji, active, ...(m ? {} : { order: members(true).length, createdAt: new Date().toISOString() }) });
          close(); toast(m ? 'Profil mis à jour' : `${esc(name)} rejoint la famille 🎉`, { icon: 'users2' });
        };
      },
    });
  };

  const dietSheet = () => {
    const s = settings();
    const field = (key, label, ph) => `<div class="field"><span>${label}</span><div class="tags-input" data-key="${key}">${(s[key] || []).map((t) => `<span class="tg">${esc(t)}<button type="button" data-rm>${icon('x', 14)}</button></span>`).join('')}<input placeholder="${ph}" enterkeyhint="done"></div></div>`;
    sheet({
      title: 'Préférences alimentaires',
      subtitle: 'Mijoté signale les recettes concernées. Ce n’est jamais une garantie : vérifiez toujours les étiquettes.',
      body: field('allergies', 'Allergies', 'Ex. arachide, gluten…') + field('intolerances', 'Intolérances', 'Ex. lactose…') + field('preferences', 'Préférences', 'Ex. peu épicé, bio…') + field('avoid', 'Aliments à éviter', 'Ex. champignons…'),
      footer: `<button class="btn primary" data-ok>Enregistrer</button>`,
      onMount(el, close) {
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !e.target.closest('.tags-input')) return;
          e.preventDefault();
          const v = e.target.value.trim(); if (!v) return;
          e.target.insertAdjacentHTML('beforebegin', `<span class="tg">${esc(v)}<button type="button" data-rm>${icon('x', 14)}</button></span>`);
          e.target.value = '';
        });
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) b.parentElement.remove(); });
        el.querySelector('[data-ok]').onclick = () => {
          const patch = {};
          el.querySelectorAll('.tags-input').forEach((t) => {
            const pending = t.querySelector('input').value.trim();
            patch[t.dataset.key] = [...t.querySelectorAll('.tg')].map((x) => x.textContent.trim()).concat(pending ? [pending] : []);
          });
          saveSettings(patch); close(); toast('Préférences enregistrées');
        };
      },
    });
  };

  const cloudSheet = () => {
    const o = LS.get('supabase') || {};
    sheet({
      title: 'Synchronisation familiale',
      subtitle: 'Gratuit avec Supabase. Toutes les étapes sont dans le README du projet.',
      body: `<div class="note" style="margin-bottom:16px">1. Créez un projet sur <b>supabase.com</b><br>2. Exécutez <b>supabase/schema.sql</b> dans « SQL Editor »<br>3. Collez ci-dessous l’URL et la clé <b>anon public</b> (Project Settings → API)<br><br>💡 Pour que tous les appareils soient configurés automatiquement, mettez plutôt ces valeurs dans <b>config.js</b> sur GitHub.</div>
        <label class="field"><span>Project URL</span><input class="input" id="u" value="${esc(o.url || '')}" placeholder="https://xxxx.supabase.co"></label>
        <label class="field"><span>Clé anon public</span><input class="input" id="k" value="${esc(o.key || '')}" placeholder="eyJhbGciOi…"></label>`,
      footer: `<button class="btn primary" data-ok>Enregistrer et redémarrer</button>`,
      onMount(el, close) {
        el.querySelector('[data-ok]').onclick = async () => {
          const url = el.querySelector('#u').value.trim(), key = el.querySelector('#k').value.trim();
          if (!/^https:\/\/.+/.test(url) || key.length < 20) return toast('URL ou clé invalide', { icon: 'info' });
          LS.set('supabase', { url, key });
          close();
          if (await confirmDialog({ title: 'Synchronisation configurée', text: 'Mijoté va redémarrer. Choisissez ensuite « Créer notre espace familial » (vos données locales peuvent être transférées via Exporter → Importer).', ok: 'Redémarrer', icon: 'cloud' })) {
            await store.signOut(); location.reload();
          }
        };
      },
    });
  };

  const installSheet = () => sheet({
    title: 'Installer Mijoté',
    body: `
      <div class="steps">
        <div class="step"><span class="num">🍎</span><div><h4>Sur iPhone / iPad (Safari)</h4><p>Touchez <b>Partager</b> ${icon('upload', 16)} en bas de Safari, puis <b>« Sur l’écran d’accueil »</b> et <b>Ajouter</b>. Ouvrez ensuite Mijoté depuis son icône : plein écran, comme une vraie app.</p></div></div>
        <div class="step"><span class="num">🤖</span><div><h4>Sur Android (Chrome)</h4><p>Menu <b>⋮</b> → <b>« Installer l’application »</b> (ou « Ajouter à l’écran d’accueil »).</p></div></div>
        <div class="step"><span class="num">💻</span><div><h4>Sur ordinateur (Chrome / Edge)</h4><p>Cliquez sur l’icône d’installation ${icon('download', 16)} dans la barre d’adresse.</p></div></div>
      </div>
      ${app.canInstall() ? `<button class="btn primary block" data-inst style="margin-top:16px">${icon('download', 20)} Installer maintenant</button>` : ''}`,
    onMount(el, close) { el.querySelector('[data-inst]')?.addEventListener('click', () => { app.promptInstall(); close(); }); },
  });

  paint();
  return { refresh: paint };
}
