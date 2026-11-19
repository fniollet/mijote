// ─────────────────────────────────────────────────────────────
// STORE — source de vérité côté client
//
//  • Mode « local »  : données sur l'appareil (IndexedDB), idéal pour essayer.
//  • Mode « famille » : Supabase (Auth + Postgres + RLS + Realtime).
//
// Synchronisation (spec §2.4, §6.9, §8.5, §12.4) :
//  - chaque écriture est appliquée localement tout de suite (UI instantanée),
//    mise dans une file d'attente persistante (outbox) puis envoyée ;
//  - le serveur fusionne CHAMP PAR CHAMP (jsonb ||) via la fonction
//    patch_record → deux personnes qui modifient des champs différents
//    du même repas conservent toutes les deux leur modification ;
//  - hors ligne, la file est conservée et rejouée au retour du réseau ;
//  - les changements des autres appareils arrivent en temps réel.
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
    this._saveT = null;
    this._flushing = false;
  }

  get cloudAvailable() { return !!cloudConfig(); }

  // ── Démarrage ──────────────────────────────────────────────
  /** Retourne 'ready' si une famille est ouverte, sinon 'onboarding'. */
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
    this.sb.auth.onAuthStateChange((evt) => {
      if (evt === 'PASSWORD_RECOVERY') this.emit('recovery');
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

  // ── Authentification famille (compte partagé, spec §2.2) ─────
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
      await this.sb.auth.signOut().catch(() => {});
    } else {
      LS.del('localFamily');
    }
    LS.del('member:' + this.ns);
    this.mode = null; this.user = null;
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));
  }
  /** Efface complètement les données locales de cet espace (mode local). */
  async wipeLocal() {
    await idb.del('data:local'); await idb.del('outbox:local');
  }

  // ── Membre utilisant cet appareil (spec §2.2-4) ───────────────
  get memberId() { return LS.get('member:' + this.ns); }
  set memberId(id) { LS.set('member:' + this.ns, id); this.emit('change', { member: true }); }
  get member() { return this.get('members', this.memberId); }

  // ── Lecture ───────────────────────────────────────────────
  get(col, id) { const r = this.data[col]?.[id]; return r && !r.deleted ? r : null; }
  getAny(col, id) { return this.data[col]?.[id] || null; }
  all(col) { return Object.values(this.data[col] || {}).filter((r) => !r.deleted); }
  get settings() { return this.get('settings', 'family') || {}; }

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
  /** Écritures groupées : une seule notification à l'interface. */
  batch(fn) {
    this._batching = true;
    try { fn(); } finally { this._batching = false; this.emit('change', { batch: true }); }
  }

  _enqueue(op) {
    if (this.mode === 'cloud') {
      // compacte les opérations successives sur le même enregistrement
      const last = this.outbox.at(-1);
      if (last && last.col === op.col && last.id === op.id && !last.sending) {
        last.patch = { ...last.patch, ...op.patch }; last.deleted = op.deleted;
      } else this.outbox.push({ ...op, k: uid() });
      idb.set('outbox:' + this.ns, this.outbox.map(({ sending, ...o }) => o)).catch(() => {});
      queueMicrotask(() => this.flush());
    }
    this._persist();
  }
  _persist() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => idb.set('data:' + this.ns, this.data).catch((e) => console.warn(e)), 250);
  }

  // ── Synchronisation cloud ──────────────────────────────────
  async flush() {
    if (this.mode !== 'cloud' || this._flushing || !this.outbox.length) {
      if (this.mode === 'cloud' && !this.outbox.length && navigator.onLine) this.setStatus('synced');
      return;
    }
    if (!navigator.onLine) return this.setStatus('offline');
    this._flushing = true;
    this.setStatus('syncing');
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        op.sending = true;
        const { data, error } = await this.sb.rpc('patch_record', {
          p_collection: op.col, p_id: op.id, p_patch: op.patch, p_deleted: op.deleted,
        });
        if (error) {
          const network = !navigator.onLine || /fetch|network|timeout/i.test(error.message || '');
          op.sending = false;
          if (network) { this.setStatus('offline'); break; }
          console.error('[mijote] rejet serveur', error, op);
          this.emit('error', { message: 'Une modification a été refusée par le serveur.' });
          this.outbox.shift();
        } else {
          this.outbox.shift();
          if (data) this._applyRow(Array.isArray(data) ? data[0] : data, true);
        }
        await idb.set('outbox:' + this.ns, this.outbox.map(({ sending, ...o }) => o)).catch(() => {});
      }
      if (!this.outbox.length) this.setStatus('synced');
    } catch (e) {
      console.warn('[mijote] flush', e);
      this.outbox.forEach((o) => (o.sending = false));
      this.setStatus('offline');
    } finally {
      this._flushing = false;
    }
  }

  /** Télécharge les enregistrements modifiés depuis la dernière synchro. */
  async pull(full = false) {
    if (this.mode !== 'cloud' || !navigator.onLine) return this.setStatus(navigator.onLine ? this.status : 'offline');
    this.setStatus('syncing');
    try {
      const since = full ? null : this.lastSync;
      let from = 0;
      const page = 1000;
      for (;;) {
        let q = this.sb.from('records').select('*').order('updated_at', { ascending: true }).range(from, from + page - 1);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q;
        if (error) throw error;
        data.forEach((row) => this._applyRow(row, false));
        if (data.length < page) break;
        from += page;
      }
      this._persist();
      idb.set('sync:' + this.ns, this.lastSync).catch(() => {});
      this.emit('change', { all: true });
      this.setStatus(this.outbox.length ? 'syncing' : 'synced');
    } catch (e) {
      console.warn('[mijote] pull', e);
      this.setStatus('offline');
    }
  }

  _applyRow(row, emit = true) {
    if (!row || !COLLECTIONS.includes(row.collection)) return;
    if (!this.lastSync || row.updated_at > this.lastSync) this.lastSync = row.updated_at;
    let rec = { ...row.data, id: row.id, deleted: row.deleted, _srv: row.updated_at };
    // les modifications locales encore en attente restent prioritaires
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
    if (this.channel) this.sb.removeChannel(this.channel);
    let wasDown = false;
    this.channel = this.sb
      .channel('family-' + this.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `family_id=eq.${this.user.id}` }, (p) => {
        if (p.new && p.new.id) this._applyRow(p.new, true);
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') { if (wasDown) this.pull(); wasDown = false; }
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') wasDown = true;
      });
  }

  _wireNetwork() {
    if (this._wired) return;
    this._wired = true;
    addEventListener('online', () => { this.flush(); this.pull(); });
    addEventListener('offline', () => this.setStatus('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.mode === 'cloud') { this.pull(); this.flush(); }
    });
    setInterval(() => this.mode === 'cloud' && this.outbox.length && this.flush(), 15000);
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

  // ── Sauvegarde / restauration (spec §13 « sauvegardes ») ─────
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
