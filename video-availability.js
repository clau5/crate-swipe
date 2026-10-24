// Public metadata preflight, not a guarantee of playback in every country/device.
// Transport failures are unknown: they must never blacklist an otherwise valid video.
export class VideoAvailability {
  constructor({fetcher = (...args) => fetch(...args), storage, now = Date.now, timeout = 4000, concurrency = 3} = {}) {
    Object.assign(this, {fetcher, storage, now, timeout, concurrency});
    this.key = 'crate_video_availability_v1'; this.pending = new Map(); this.queue = []; this.running = 0; this.retryAfter = 0;
    const saved = storage?.get(this.key, []);
    this.cache = new Map((Array.isArray(saved) ? saved : []).filter(row => Array.isArray(row) && /^[\w-]{11}$/.test(row[0]) && typeof row[1]?.available === 'boolean' && row[1].expires > now()));
  }
  remember(id, available) {
    this.cache.delete(id);
    this.cache.set(id, {available, expires:this.now() + (available ? 6 : 24) * 3600000});
    while (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value);
    this.storage?.set(this.key, [...this.cache]);
  }
  clear() { this.cache.clear(); this.retryAfter = 0; this.storage?.set(this.key, []); }
  check(id) {
    if (!/^[\w-]{11}$/.test(id)) return Promise.resolve(false);
    const cached = this.cache.get(id);
    if (cached?.expires > this.now()) return Promise.resolve(cached.available);
    if (this.retryAfter > this.now()) return Promise.resolve(null);
    if (this.pending.has(id)) return this.pending.get(id);
    const promise = new Promise(resolve => this.queue.push({id, resolve}));
    this.pending.set(id, promise); this.pump(); return promise;
  }
  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const {id, resolve} = this.queue.shift(); this.running++;
      const probe = this.retryAfter > this.now() ? Promise.resolve(null) : this.probe(id);
      probe.then(resolve, () => resolve(null)).finally(() => { this.pending.delete(id); this.running--; this.pump(); });
    }
  }
  async probe(id) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const url = new URL('https://www.youtube.com/oembed');
      url.searchParams.set('url', 'https://www.youtube.com/watch?v=' + id); url.searchParams.set('format', 'json');
      const response = await this.fetcher(url.href, {signal:controller.signal, credentials:'omit'});
      let available = null;
      if ([401,404,410].includes(response.status)) available = false;
      else if (response.ok && (await response.json()).type === 'video') available = true;
      if (available !== null) this.remember(id, available);
      else this.retryAfter = this.now() + 30000;
      return available;
    } catch { this.retryAfter = this.now() + 30000; return null; }
    finally { clearTimeout(timer); }
  }
}
