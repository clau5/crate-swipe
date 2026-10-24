import {Discogs} from './core.js';

// Public throwaway account, explicitly shared for guest browsing. Personal accounts use
// their own client. Never read the shared wantlist or delete communal records here.
export class CatalogueClient {
  constructor(token, {dryRun=false,client}={}) {
    this.api = client || new Discogs(token,{dryRun}); this.owner = null; this.copies = new Map();
  }
  get count() { return this.api.count || 0; }
  get(path, priority) {
    if (path.startsWith('/database/search?') || /^\/releases\/[1-9]\d*$/.test(path)) return this.api.get(path,priority);
    return Promise.reject(Error('Unsupported catalogue request'));
  }
  addShared(id) {
    if (!Number.isSafeInteger(id) || id <= 0) return Promise.reject(Error('Invalid release'));
    if (this.copies.has(id)) return this.copies.get(id);
    const job = (async()=>{
      if (!this.owner) this.owner = this.api.get('/oauth/identity',3).then(identity=>{
        if (typeof identity.username !== 'string' || !identity.username) throw Error('Shared account unavailable');
        return identity.username;
      }).catch(error=>{this.owner=null;throw error;});
      const username = await this.owner;
      return this.api.req('PUT','/users/'+encodeURIComponent(username)+'/wants/'+id,3);
    })().catch(error=>{this.copies.delete(id);throw error;});
    this.copies.set(id,job); return job;
  }
}
