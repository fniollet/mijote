// ─────────────────────────────────────────────────────────────
// STORE — source de vérité côté client            (v1.0.1)
//
//  • Mode « local »  : données sur l'appareil (IndexedDB), idéal pour essayer.
//  • Mode « famille » : Supabase (Auth + Postgres + RLS + Realtime).
//
// Synchronisation :
//  - chaque écriture est appliquée localement tout de suite (UI instantanée),
//    mise dans une file d'attente persistante (outbox) puis envoyée ;
//  - le serveur fusionne CHAMP PAR CHAMP (jsonb ||) via patch_record ;
//  - hors ligne, la file est conservée et rejouée au retour du réseau ;
//  - les changements des autres appareils arrivent en temps réel.
//
// v1.0.1 — robustesse (iPhone / veille) :
//  - le jeton de connexion est vérifié et rafraîchi AVANT chaque synchro
//    (cause n°1 du « Hors ligne » après une mise en veille) ;
//  - une erreur d'authentification ne supprime plus jamais une modification ;
//  - nouvelles tentatives automatiques (2 s → 5 s → 15 s → 30 s → 60 s) ;
//  - le temps réel est reconnecté au retour au premier plan ;
//  - synchro de secours toutes les 60 s quand l'app est ouverte ;
//  - forceSync() : synchro complète à la demande (toucher la pastille).
// ─────────────────────────────────────────────────────────────
import { uid } from './utils.js';

export const COLLECTIONS = ['settings', 'members', 'recipes', 'meals', 'items', 'purchases', 'favorites'];

// ── Mini clé/valeur IndexedDB ────────────────────────────────
const idb = (() => {
  let dbp;
  const db = () =>
    (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('mijote', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
  };
})();

const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem('mijote:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('mijote:' + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem('mijote:' + k); } catch {} },
};
export { LS };

function cloudConfig() {
  const c = window.MIJOTE_CONFIG || {};
  const o = LS.get('supabase') || {};
  const url = (c.SUPABASE_URL || o.url || '').trim();
  const key = (c.SUPABASE_ANON_KEY || o.key || '').trim();
  return url && key ? { url, key } : null;
}

const isAuthError = (e) => e && (e.status === 401 || e.code === 'PGRST301' || /jwt|token|unauthori|not authenticated|non authentifi/i.test(e.message || ''));
const isNetworkError = (e) => !navigator.onLine || /fetch|network|timeout|load failed|abort/i.test((e && (e.message || String(e))) || '');
const tsMs = (s) => { const t = Date.parse(String(s || '').replace(' ', 'T')); return isNaN(t) ? 0 : t; };
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

class Store extends EventTarget {
  constructor() {
    super();
    this.mode = null; // 'local' | 'cloud'
    this.status = 'idle'; // idle | syncing | synced | offline | local
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));
    this.outbox = [];
    this.sb = null;
    this.user = null;
    this.ns = null;
    this.lastSync = null;
    this.lastSyncOkAt = null;
    this.rtState = 'closed';
    this._saveT = null;
    this._flushing = false;
    this._pulling = null;
    this._retryT = null;
    this._retryN = 0;
  }

  get cloudAvailable() { return !!cloudConfig(); }

  // ── Démarrage ──────────────────────────────────────────────
  async boot() {
    const cfg = cloudConfig();
    if (cfg) {
      try {
        await this._initClient(cfg);
        const { data } = await this.sb.auth.getSession();
        if (data?.session?.user) { await this._openCloud(data.session.user); return 'ready'; }
      } catch (e) { console.warn('[mijote] Supabase indisponible', e); }
    }
    if (LS.get('localFamily')) { await this._openLocal(); return 'ready'; }
    return 'onboarding';
  }

  async _initClient(cfg) {
    if (this.sb) return;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    this.sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.sb.auth.onAuthStateChange((evt, session) => {
      if (evt === 'PASSWORD_RECOVERY') this.emit('recovery');
      if (evt === 'TOKEN_REFRESHED' && session?.access_token) { try { this.sb.realtime?.setAuth?.(session.access_token); } catch {} }
      if (evt === 'SIGNED_OUT' && this.mode === 'cloud') this.emit('signedout');
    });
  }

  async _load(ns) {
    this.ns = ns;
    const cached = await idb.get('data:' + ns).catch(() => null);
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, cached?.[c] || {}]));
    this.outbox = (await idb.get('outbox:' + ns).catch(() => null)) || [];
    this.lastSync = (await idb.get('sync:' + ns).catch(() => null)) || null;
  }

  async _openLocal() {
    this.mode = 'local';
    await this._load('local');
    this.setStatus('local');
    this.emit('change', { all: true });
  }

  async _openCloud(user) {
    this.mode = 'cloud';
    this.user = user;
    await this._load('u:' + user.id);
    this.emit('change', { all: true });
    this._wireNetwork();
    await this.pull(true);
    this._subscribe();
    this.flush();
  }

  // ── Authentification famille ─────────────────────────────────
  async signUp(email, password) {
    await this._initClient(cloudConfig());
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
    if (error) throw error;
    if (!data.session) return { needsConfirmation: true };
    await this._openCloud(data.user);
    return { ok: true };
  }
  async signIn(email, password) {
    await this._initClient(cloudConfig());
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this._openCloud(data.user);
  }
  async resetPassword(email) {
    await this._initClient(cloudConfig());
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) throw error;
  }
  async updatePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }
  async startLocal() {
    LS.set('localFamily', true);
    await this._openLocal();
  }
  async signOut() {
    if (this.mode === 'cloud') {
      try { this.channel && this.sb.removeChannel(this.channel); } catch {}
      this.channel = null;
      await this.sb.auth.signOut().catch(() => {});
    } else {
      LS.del('localFamily');
    }
    LS.del('member:' + this.ns);
    clearTimeout(this._retryT);
    this.mode = null; this.user = null;
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));
  }
  async wipeLocal() {
    await idb.del('data:local'); await idb.del('outbox:local');
  }

  /** Vérifie la session et rafraîchit le jeton s'il expire dans moins de 2 min. */
  async _ensureSession(force = false) {
    if (!this.sb) return false;
    try {
      const { data } = await this.sb.auth.getSession();
      let s = data?.session;
      if (!s) return false;
      if (force || !s.expires_at || s.expires_at * 1000 < Date.now() + 120000) {
        const r = await this.sb.auth.refreshSession();
        if (r?.data?.session) s = r.data.session;
      }
      try { this.sb.realtime?.setAuth?.(s.access_token); } catch {}
      return true;
    } catch (e) {
      console.warn('[mijote] session', e);
      return false;
    }
  }

  // ── Membre utilisant cet appareil ───────────────────────────
  get memberId() { return LS.get('member:' + this.ns); }
  set memberId(id) { LS.set('member:' + this.ns, id); this.emit('change', { member: true }); }
  get member() { return this.get('members', this.memberId); }

  // ── Lecture ───────────────────────────────────────────────
  get(col, id) { const r = this.data[col]?.[id]; return r && !r.deleted ? r : null; }
  getAny(col, id) { return this.data[col]?.[id] || null; }
  all(col) { return Object.values(this.data[col] || {}).filter((r) => !r.deleted); }
  get settings() { return this.get('settings', 'family') || {}; }
  get pending() { return this.outbox.length; }

  // ── Écriture ──────────────────────────────────────────────
  put(col, id, patch) {
    id ||= uid();
    const now = new Date().toISOString();
    const prev = this.data[col][id];
    const meta = { _u: now, _by: this.memberId || null };
    const full = { ...(prev || {}), ...patch, id, deleted: false, ...meta };
    this.data[col][id] = full;
    this._enqueue({ col, id, patch: { ...patch, _u: now, _by: meta._by }, deleted: false });
    this.emit('change', { col, id });
    return full;
  }
  del(col, id) {
    const prev = this.data[col][id];
    if (!prev) return;
    const now = new Date().toISOString();
    this.data[col][id] = { ...prev, deleted: true, _u: now, _by: this.memberId };
    this._enqueue({ col, id, patch: { _u: now, _by: this.memberId }, deleted: true });
    this.emit('change', { col, id });
  }
  batch(fn) {
    this._batching = true;
    try { fn(); } finally { this._batching = false; this.emit('change', { batch: true }); }
  }

  _enqueue(op) {
    if (this.mode === 'cloud') {
      const last = this.outbox.at(-1);
      if (last && last.col === op.col && last.id === op.id && !last.sending) {
        last.patch = { ...last.patch, ...op.patch }; last.deleted = op.deleted;
      } else this.outbox.push({ ...op, k: uid() });
      this._saveOutbox();
      queueMicrotask(() => this.flush());
    }
    this._persist();
  }
  _saveOutbox() {
    return idb.set('outbox:' + this.ns, this.outbox.map(({ sending, ...o }) => o)).catch(() => {});
  }
  _persist() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => idb.set('data:' + this.ns, this.data).catch((e) => console.warn(e)), 250);
  }

  // ── Nouvelles tentatives automatiques ───────────────────────
  _scheduleRetry() {
    if (this.mode !== 'cloud') return;
    clearTimeout(this._retryT);
    const delay = RETRY_DELAYS[Math.min(this._retryN, RETRY_DELAYS.length - 1)];
    this._retryN++;
    this._retryT = setTimeout(() => this.sync(), delay);
  }
  _syncOk() {
    this._retryN = 0;
    clearTimeout(this._retryT);
    this.lastSyncOkAt = Date.now();
  }

  // ── Synchronisation cloud ──────────────────────────────────
  /** Envoie les modifications en attente. Retourne true si tout est parti. */
  async flush() {
    if (this.mode !== 'cloud') return true;
    if (this._flushing) return false;
    if (!this.outbox.length) return true;
    this._flushing = true;
    this.setStatus('syncing');
    let ok = true;
    try {
      if (!(await this._ensureSession())) { ok = false; return false; }
      let authRetried = false;
      while (this.outbox.length) {
        const op = this.outbox[0];
        op.sending = true;
        const { data, error } = await this.sb.rpc('patch_record', {
          p_collection: op.col, p_id: op.id, p_patch: op.patch, p_deleted: op.deleted,
        });
        op.sending = false;
        if (error) {
          if (isAuthError(error) && !authRetried) {
            authRetried = true;
            if (await this._ensureSession(true)) continue; // même opération, nouveau jeton
          }
          if (isAuthError(error) || isNetworkError(error)) { ok = false; break; } // on garde l'opération
          console.error('[mijote] rejet serveur', error, op);
          this.emit('error', { message: 'Une modification a été refusée par le serveur.' });
          this.outbox.shift();
        } else {
          this.outbox.shift();
          if (data) this._applyRow(Array.isArray(data) ? data[0] : data, true);
        }
        await this._saveOutbox();
      }
    } catch (e) {
      console.warn('[mijote] flush', e);
      ok = false;
    } finally {
      this.outbox.forEach((o) => (o.sending = false));
      this._flushing = false;
      if (!ok) { this.setStatus('offline'); this._scheduleRetry(); }
    }
    return ok;
  }

  /** Télécharge les enregistrements modifiés depuis la dernière synchro. */
  pull(full = false) {
    if (this.mode !== 'cloud') return Promise.resolve(true);
    if (this._pulling) return this._pulling;
    this._pulling = this._doPull(full).finally(() => (this._pulling = null));
    return this._pulling;
  }
  async _doPull(full) {
    this.setStatus('syncing');
    try {
      if (!(await this._ensureSession())) throw new Error('session');
      const since = full || !this.lastSync ? null : new Date(tsMs(this.lastSync) - 1000).toISOString();
      let from = 0;
      const page = 1000;
      for (;;) {
        let q = this.sb.from('records').select('*').order('updated_at', { ascending: true }).range(from, from + page - 1);
        if (since) q = q.gt('updated_at', since);
        let { data, error } = await q;
        if (error && isAuthError(error) && (await this._ensureSession(true))) ({ data, error } = await q);
        if (error) throw error;
        data.forEach((row) => this._applyRow(row, false));
        if (data.length < page) break;
        from += page;
      }
      this._persist();
      idb.set('sync:' + this.ns, this.lastSync).catch(() => {});
      this.emit('change', { all: true });
      this._syncOk();
      this.setStatus(this.outbox.length ? 'syncing' : 'synced');
      return true;
    } catch (e) {
      console.warn('[mijote] pull', e);
      this.setStatus('offline');
      this._scheduleRetry();
      return false;
    }
  }

  /** Cycle normal : envoyer puis recevoir. */
  async sync() {
    if (this.mode !== 'cloud') return true;
    const a = await this.flush();
    const b = await this.pull();
    if (a && b && this.rtState !== 'joined') this._subscribe();
    if (a && b && !this.outbox.length) this.setStatus('synced');
    return a && b;
  }

  /** Synchro forcée (pastille, réglages) : nouveau jeton, reconnexion temps réel, relecture complète. */
  async forceSync() {
    if (this.mode !== 'cloud') return false;
    this._retryN = 0;
    clearTimeout(this._retryT);
    this.setStatus('syncing');
    await this._ensureSession(true);
    this._subscribe();
    const a = await this.flush();
    const b = await this.pull(true);
    if (a && b && !this.outbox.length) this.setStatus('synced');
    return a && b;
  }

  _applyRow(row, emit = true) {
    if (!row || !COLLECTIONS.includes(row.collection)) return;
    if (!this.lastSync || tsMs(row.updated_at) > tsMs(this.lastSync)) this.lastSync = row.updated_at;
    let rec = { ...row.data, id: row.id, deleted: row.deleted, _srv: row.updated_at };
    for (const op of this.outbox) {
      if (op.col === row.collection && op.id === row.id) { rec = { ...rec, ...op.patch, deleted: op.deleted }; }
    }
    const prev = this.data[row.collection][row.id];
    this.data[row.collection][row.id] = rec;
    if (emit) {
      this._persist();
      this.emit('change', { col: row.collection, id: row.id, remote: true, prev, by: rec._by });
    }
  }

  _subscribe() {
    if (!this.sb || !this.user) return;
    if (this.channel) { try { this.sb.removeChannel(this.channel); } catch {} }
    this.rtState = 'joining';
    const ch = this.sb
      .channel('family-' + this.user.id + '-' + Date.now().toString(36))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `family_id=eq.${this.user.id}` }, (p) => {
        if (p.new && p.new.id) this._applyRow(p.new, true);
      });
    this.channel = ch;
    ch.subscribe((s) => {
      if (this.channel !== ch) return;
      if (s === 'SUBSCRIBED') { this.rtState = 'joined'; this.pull(); }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        this.rtState = 'closed';
        if (document.visibilityState === 'visible') this._scheduleRetry();
      }
    });
  }

  _wireNetwork() {
    if (this._wired) return;
    this._wired = true;
    addEventListener('online', () => { this._retryN = 0; this.sync(); });
    addEventListener('offline', () => this.setStatus('offline'));
    const wake = () => {
      if (document.visibilityState !== 'visible' || this.mode !== 'cloud') return;
      this._retryN = 0;
      // iOS coupe le temps réel en veille : on reconnecte, puis on rattrape
      if (this.rtState !== 'joined') this._subscribe();
      this.sync();
    };
    document.addEventListener('visibilitychange', wake);
    addEventListener('pageshow', wake);
    addEventListener('focus', wake);
    // Filet de sécurité : envoi toutes les 15 s s'il reste des modifications,
    // relecture différentielle toutes les 60 s quand l'app est au premier plan.
    setInterval(() => {
      if (this.mode !== 'cloud' || document.visibilityState !== 'visible') return;
      if (this.outbox.length) this.flush();
      if (!this.lastSyncOkAt || Date.now() - this.lastSyncOkAt > 60000) this.pull();
    }, 15000);
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }
  emit(type, detail) {
    if (type === 'change' && this._batching) return;
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); }

  // ── Sauvegarde / restauration ────────────────────────────────
  exportJSON() {
    return JSON.stringify({ app: 'mijote', version: 1, exportedAt: new Date().toISOString(), data: this.data }, null, 2);
  }
  importJSON(text) {
    const j = JSON.parse(text);
    if (j.app !== 'mijote' || !j.data) throw new Error('Fichier de sauvegarde invalide');
    this.batch(() => {
      for (const col of COLLECTIONS) {
        for (const [id, rec] of Object.entries(j.data[col] || {})) {
          const { _srv, ...clean } = rec;
          if (clean.deleted) continue;
          this.put(col, id, clean);
        }
      }
    });
  }
}

export const store = new Store();
