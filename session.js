// Remote wants are records. Session discoveries are the tracks explicitly liked here.
export function trackKey(song) {
  return `${song.releaseId}:${song.conf === 'high' && song.trackTitle ? song.position + ':' + song.trackTitle : song.vid}`;
}

export class SessionDiscoveries {
  constructor(username, storage, request, changed = () => {}) {
    this.username = username;
    this.storage = storage;
    this.request = request;
    this.changed = changed;
    this.key = 'crate_session_v1:' + username;
    const saved = storage.get(this.key, null);
    this.session = saved?.version === 1 && Array.isArray(saved.items)
      ? saved : this.empty();
    this.session.items = this.session.items.filter(s => s && Number.isInteger(s.releaseId) && Number.isInteger(s.wantedReleaseId) && /^[\w-]{11}$/.test(s.vid));
    const cachedWants = storage.get('crate_wants_v1:' + username, []);
    this.wanted = new Map(Array.isArray(cachedWants) ? cachedWants.filter(r => Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1])) : []);
    this.pending = new Set();
    this.health = 'unknown';
    this.revision = 0;
    this.mutations = new Map();
    this.error = '';
  }
  empty() { return {version: 1, started: Date.now(), items: []}; }
  save() {
    const sessionSaved = this.storage.set(this.key, this.session);
    const wantsSaved = this.storage.set('crate_wants_v1:' + this.username, [...this.wanted]);
    if (sessionSaved === false || wantsSaved === false) this.error = 'Your wantlist is up to date, but this browser couldn’t save the session. Check available browser storage.';
    this.changed();
  }
  target(song) {
    if (song.wantedReleaseId && this.wanted.has(song.wantedReleaseId)) return song.wantedReleaseId;
    if (this.wanted.has(song.releaseId)) return song.releaseId;
    if (song.masterId) for (const [id, master] of this.wanted) if (master === song.masterId) return id;
    return null;
  }
  has(song) { return this.target(song) !== null; }
  lock(song) { return song.masterId ? 'm:' + song.masterId : 'r:' + (song.wantedReleaseId || song.releaseId); }
  busy(song) { return this.pending.has(this.lock(song)); }
  async ensureWanted(song) {
    if (this.health !== 'ready' || this.busy(song)) return {ok:false};
    const lock = this.lock(song); this.pending.add(lock); this.changed();
    // Guest sync metadata must not influence the destination account's pressing selection.
    const {wantedReleaseId:ignored, sync:ignoredSync, ...source} = song;
    let id = this.target(source);
    try {
      if (id === null) {
        id = source.releaseId;
        await this.request('PUT', '/users/' + encodeURIComponent(this.username) + '/wants/' + id, 3);
        this.wanted.set(id, source.masterId || 0); this.mutations.set(id, ++this.revision);
      }
      if (!this.session.items.some(s => trackKey(s) === trackKey(source))) this.session.items.push({...source,wantedReleaseId:id});
      this.save(); return {ok:true,id};
    } catch {
      this.error = 'Some records couldn’t be saved. Your guest finds are kept for retry.';
      this.changed(); return {ok:false};
    } finally { this.pending.delete(lock); this.changed(); }
  }
  async refresh(loader) {
    if (this.health === 'loading') return;
    const revision = this.revision;
    this.health = 'loading'; this.error = ''; this.changed();
    try {
      const records = await loader();
      const next = new Map(records.map(r => [r.id, r.masterId || 0]));
      // Do not overwrite writes completed while a paginated snapshot was loading.
      for (const [id, changedAt] of this.mutations) if (changedAt > revision) {
        if (this.wanted.has(id)) next.set(id, this.wanted.get(id)); else next.delete(id);
      }
      this.wanted = next;
      this.session.items = this.session.items.filter(s => next.has(s.wantedReleaseId));
      this.health = 'ready'; this.save();
    } catch (error) {
      this.health = 'unknown'; this.error = 'Couldn’t refresh your wantlist. Your session is saved. Retry to enable changes.';
      this.changed();
    }
  }
  async toggle(song) {
    if (this.health !== 'ready' || this.busy(song)) return false;
    const target = this.target(song), adding = target === null;
    const id = adding ? song.releaseId : target;
    const lock = this.lock(song);
    this.pending.add(lock); this.error = ''; this.changed();
    try {
      await this.request(adding ? 'PUT' : 'DELETE', '/users/' + encodeURIComponent(this.username) + '/wants/' + id, 3);
      this.mutations.set(id, ++this.revision);
      if (adding) {
        this.wanted.set(id, song.masterId || 0);
        const item = {...song, wantedReleaseId: id, likedAt: Date.now()};
        if (!this.session.items.some(s => trackKey(s) === trackKey(item))) this.session.items.push(item);
      } else {
        this.wanted.delete(id);
        this.session.items = this.session.items.filter(s => s.wantedReleaseId !== id);
      }
      this.save();
      return {adding, id};
    } catch (error) {
      // No whole-list rollback: leave independent successful writes intact.
      this.error = `Couldn’t ${adding ? 'add' : 'remove'} this record. Nothing changed. Try again.`;
      this.changed(); return false;
    } finally { this.pending.delete(lock); this.changed(); }
  }
  reset() {
    if (this.pending.size) return false;
    this.session = this.empty(); this.save(); return true;
  }
}

export function guestStatus(song, username) { return song.sync?.['user:' + username]?.state || 'local'; }

// Guest hearts and review are device-local; the shared account is only an optional copy.
export class GuestDiscoveries {
  constructor(storage, mirror = async()=>{}, changed = ()=>{}) {
    Object.assign(this, {storage, mirror, changed}); this.isGuest = true; this.username = '';
    this.key = 'crate_guest_session_v1'; this.health = 'ready'; this.pending = new Set(); this.error = ''; this.syncing = false;
    const saved = storage.get(this.key, null);
    this.session = saved?.version === 1 && typeof saved.id === 'string' && Array.isArray(saved.items) ? saved : this.empty();
    this.session.items = this.session.items.filter(s=>s && Number.isInteger(s.releaseId) && /^[\w-]{11}$/.test(s.vid));
    for (const item of this.session.items) {
      if (!item.sync || typeof item.sync !== 'object' || Array.isArray(item.sync)) item.sync = {};
      for (const state of Object.values(item.sync)) if (state?.state === 'pending') state.state = 'failed';
    }
    this.save();
  }
  empty() { return {version:1,id:globalThis.crypto?.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2),started:Date.now(),items:[]}; }
  save() {
    if (this.storage.set(this.key, this.session) === false) this.error = 'This browser couldn’t save your finds. Keep this page open and try again.';
    this.changed();
  }
  has(song) { return this.session.items.some(s=>trackKey(s) === trackKey(song)); }
  busy() { return this.syncing; }
  async toggle(song) {
    if (this.syncing) return false;
    const adding = !this.has(song); this.error = '';
    if (adding) this.session.items.push({...song,likedAt:Date.now(),sync:{}});
    else this.session.items = this.session.items.filter(s=>trackKey(s) !== trackKey(song));
    this.save();
    if (adding) Promise.resolve().then(()=>this.mirror(song.releaseId)).catch(()=>{});
    return {adding,id:song.releaseId};
  }
  unsaved(username) { return this.session.items.filter(s=>guestStatus(s, username) !== 'saved'); }
  syncTo(account) {
    if (this.job) return this.job;
    if (account.health !== 'ready') { this.error = 'Refresh your Discogs wantlist before syncing.'; this.changed(); return Promise.resolve(false); }
    this.syncing = true; this.error = ''; this.changed();
    this.job = this.syncRecords(account).finally(()=>{ this.syncing = false; this.job = null; this.changed(); });
    return this.job;
  }
  async syncRecords(account) {
    const username = account.username, key = 'user:' + username, groups = new Map();
    for (const song of this.unsaved(username)) {
      const lock = account.lock(song);
      if (!groups.has(lock)) groups.set(lock, []);
      groups.get(lock).push(song);
    }
    for (const songs of groups.values()) {
      for (const song of songs) { song.sync ||= {}; song.sync[key] = {state:'pending'}; }
      this.save();
      let result = await account.ensureWanted(songs[0]);
      if (result.ok) for (const song of songs.slice(1)) {
        const added = await account.ensureWanted(song);
        if (!added.ok) result = added;
      }
      for (const song of songs) song.sync[key] = result.ok ? {state:'saved',wantedReleaseId:result.id} : {state:'failed'};
      this.save();
    }
    const complete = this.unsaved(username).length === 0;
    if (!complete && !this.error) this.error = 'Some records couldn’t be saved. Retry to save the remaining finds.';
    this.changed(); return complete;
  }
  reset() {
    if (this.syncing) return false;
    this.session = this.empty(); this.error = ''; this.save(); return true;
  }
}
