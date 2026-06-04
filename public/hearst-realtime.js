/**
 * hearst-realtime.js — Live propagation layer for <hearst-asset>
 * Hearst Cockpit Design System — B3 Squad
 *
 * 3 modes :
 *   - broadcast (default) : BroadcastChannel API, local cross-tab same-origin
 *   - supabase            : Supabase Realtime (requires client passed in opts)
 *   - polling             : fetch _index.json + assets at interval (fallback)
 *
 * Usage :
 *   // 1. Global enable (default broadcast on channel 'hearst:catalog')
 *   HearstRealtime.enable();
 *
 *   // 2. Or with options
 *   HearstRealtime.enable({ mode: 'supabase', client: supabaseClient, table: 'cockpit_assets' });
 *   HearstRealtime.enable({ mode: 'polling',  intervalMs: 5000, base: './catalog/' });
 *
 *   // 3. Publish an update (broadcast mode → reaches every open tab)
 *   HearstRealtime.publish({
 *     type: 'asset-updated',
 *     id:   'chart:progress-circle',
 *     spec: { ... new .asset.json content ... }
 *   });
 *
 *   // 4. Per-element opt-in
 *   <hearst-asset id="chart:progress-circle" realtime="broadcast"></hearst-asset>
 *
 *   // 5. Cleanup
 *   HearstRealtime.disable();
 */

(function (global) {
  'use strict';

  // ─── Internal state ─────────────────────────────────────────────────────
  const state = {
    enabled: false,
    enabling: false,                   // F7: guard against double-enable race
    mode: null,                       // 'broadcast' | 'supabase' | 'polling'
    channelName: 'hearst:catalog',
    bc: null,                         // BroadcastChannel instance
    supabase: null,                   // { client, channel, table }
    polling: null,                    // { timer, intervalMs, base, lastIndex }
    elements: new Set(),              // tracked <hearst-asset> elements
    listeners: new Set()              // user listeners (fn(event))
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  function log(...args) {
    if (global.HEARST_REALTIME_DEBUG) console.log('[hearst-realtime]', ...args);
  }

  function _emitEvent(evt) {
    // Notify all <hearst-asset> elements with matching id
    if (evt && evt.type === 'asset-updated' && evt.id) {
      // Update DOM elements whose id matches (registered or live)
      const live = document.querySelectorAll(`hearst-asset[id="${cssEscape(evt.id)}"]`);
      live.forEach(el => applyUpdate(el, evt.spec));
    }
    // Notify user listeners
    state.listeners.forEach(fn => {
      try { fn(evt); } catch (e) { console.warn('[hearst-realtime] listener error:', e); }
    });
  }

  function cssEscape(str) {
    // Minimal CSS escape for attribute selectors (handle colon)
    return String(str).replace(/(["\\:])/g, '\\$1');
  }

  function applyUpdate(el, spec) {
    if (!el || !spec) return;
    // Replace internal asset spec then re-render with current data
    el._asset = spec;
    if (typeof el._render === 'function') {
      el._render();
    }
    el.dispatchEvent(new CustomEvent('asset-updated', {
      bubbles: true,
      composed: true,
      detail: { id: el.getAttribute('id'), source: state.mode }
    }));
    log('applied update on', el.getAttribute('id'));
  }

  // ─── Mode : broadcast ───────────────────────────────────────────────────
  function enableBroadcast(opts) {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[hearst-realtime] BroadcastChannel not supported, falling back to polling');
      return enablePolling(opts);
    }
    state.channelName = opts.channel || state.channelName;
    state.bc = new BroadcastChannel(state.channelName);
    state.bc.onmessage = (msg) => {
      log('broadcast recv', msg.data);
      _emitEvent(msg.data);
    };
    state.mode = 'broadcast';
    log('broadcast enabled on channel', state.channelName);
  }

  function publishBroadcast(evt) {
    if (!state.bc) return false;
    state.bc.postMessage(evt);
    // Same-tab apply (BroadcastChannel does NOT echo to sender)
    _emitEvent(evt);
    return true;
  }

  // ─── Mode : supabase ────────────────────────────────────────────────────
  function enableSupabase(opts) {
    if (!opts.client) {
      console.warn('[hearst-realtime] supabase mode requires opts.client');
      return;
    }
    const table = opts.table || 'cockpit_assets';
    state.supabase = { client: opts.client, table, channel: null };

    const channel = opts.client.channel(`realtime:public:${table}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            log('supabase change', payload);
            const row = payload.new || payload.old;
            if (!row || !row.id) return;
            _emitEvent({
              type: 'asset-updated',
              id: row.id,
              spec: row.spec,
              version: row.version,
              source: 'supabase'
            });
          })
      .subscribe();

    state.supabase.channel = channel;
    state.mode = 'supabase';
    log('supabase enabled on table', table);
  }

  async function publishSupabase(evt) {
    if (!state.supabase) return false;
    const { client, table } = state.supabase;
    const row = {
      id: evt.id,
      category: evt.id.split(':')[0],
      spec: evt.spec,
      updated_at: new Date().toISOString()
    };
    const { error } = await client
      .from(table)
      .upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[hearst-realtime] supabase upsert error:', error);
      return false;
    }
    // Trigger will broadcast back via realtime; no local apply needed
    return true;
  }

  // ─── Mode : polling ─────────────────────────────────────────────────────
  function enablePolling(opts) {
    const intervalMs = opts.intervalMs || 5000;
    const base = (opts.base || (global.HEARST_CATALOG_BASE || './catalog/')).replace(/\/?$/, '/');
    state.polling = { timer: null, intervalMs, base, lastIndex: null, lastSpecs: new Map() };

    async function tick() {
      try {
        const resp = await fetch(base + '_index.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const idx = await resp.json();
        const key = JSON.stringify(idx.updated || '') + ':' + (idx.version || '');
        if (state.polling.lastIndex !== null && state.polling.lastIndex === key) {
          return; // unchanged
        }
        state.polling.lastIndex = key;

        // Fetch each asset and diff against cache
        for (const a of (idx.assets || [])) {
          const r = await fetch(base + a.path, { cache: 'no-store' });
          if (!r.ok) continue;
          const spec = await r.json();
          const prev = state.polling.lastSpecs.get(a.id);
          const stringified = JSON.stringify(spec);
          if (prev !== stringified) {
            state.polling.lastSpecs.set(a.id, stringified);
            if (prev !== undefined) {
              _emitEvent({ type: 'asset-updated', id: a.id, spec, source: 'polling' });
            }
          }
        }
      } catch (err) {
        log('polling error:', err.message);
      }
    }

    state.polling.timer = setInterval(tick, intervalMs);
    tick(); // initial
    state.mode = 'polling';
    log('polling enabled, interval', intervalMs, 'base', base);
  }

  function publishPolling(_evt) {
    console.warn('[hearst-realtime] publish() not supported in polling mode (read-only)');
    return false;
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  const HearstRealtime = {
    enable(opts) {
      opts = opts || {};
      if (state.enabled || state.enabling) return this;
      state.enabling = true;
      try {
        const mode = opts.mode || 'broadcast';
        if (mode === 'broadcast')      enableBroadcast(opts);
        else if (mode === 'supabase')  enableSupabase(opts);
        else if (mode === 'polling')   enablePolling(opts);
        else { console.warn('[hearst-realtime] unknown mode:', mode); state.enabling = false; return; }
        state.enabled = true;
      } finally {
        state.enabling = false;
      }
      return this;
    },

    disable() {
      if (state.bc)       { state.bc.close(); state.bc = null; }
      if (state.supabase && state.supabase.channel) {
        try { state.supabase.client.removeChannel(state.supabase.channel); } catch (_) {}
        state.supabase = null;
      }
      if (state.polling)  { clearInterval(state.polling.timer); state.polling = null; }
      state.enabled = false;
      state.mode = null;
      log('disabled');
      return this;
    },

    publish(evt) {
      if (!state.enabled) {
        console.warn('[hearst-realtime] not enabled, call enable() first');
        return false;
      }
      if (!evt || !evt.type) {
        console.warn('[hearst-realtime] publish requires { type, id, spec }');
        return false;
      }
      if (state.mode === 'broadcast')  return publishBroadcast(evt);
      if (state.mode === 'supabase')   return publishSupabase(evt);
      if (state.mode === 'polling')    return publishPolling(evt);
      return false;
    },

    on(fn)  { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    off(fn) { state.listeners.delete(fn); },

    register(el) { state.elements.add(el); },
    unregister(el) { state.elements.delete(el); },

    get mode()    { return state.mode; },
    get enabled() { return state.enabled; },
    get channel() { return state.channelName; }
  };

  // ─── Per-element opt-in via [realtime] attribute ────────────────────────
  // F6: use MutationObserver to detect DOM removal instead of the non-standard
  //     'disconnected' event (which never fires, causing a memory leak in state.elements).
  function watchRemoval(el, callback) {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const removed of m.removedNodes) {
          if (removed === el || (removed.contains && removed.contains(el))) {
            callback(el);
            observer.disconnect();
            return;
          }
        }
      }
    });
    const target = el.parentNode || document.body;
    observer.observe(target, { childList: true, subtree: true });
    return observer;
  }

  // Monkey-patch HearstAsset to honor the [realtime] attribute on connect.
  function wireElement(el) {
    if (!el || el.__realtimeWired) return;
    el.__realtimeWired = true;
    HearstRealtime.register(el);
    // F6: watch for DOM removal to clean up state.elements (prevents memory leak)
    watchRemoval(el, (removed) => {
      HearstRealtime.unregister(removed);
      removed.__realtimeWired = false;
    });
  }

  // Observe DOM for new <hearst-asset realtime="..."> elements
  function observeDom() {
    if (typeof MutationObserver === 'undefined') return;
    const scan = (root) => {
      root.querySelectorAll && root.querySelectorAll('hearst-asset[realtime]').forEach(el => {
        const m = el.getAttribute('realtime');
        if (!state.enabled && m) {
          HearstRealtime.enable({ mode: m });
        }
        wireElement(el);
      });
    };
    scan(document);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'HEARST-ASSET' && node.hasAttribute('realtime')) {
            const mode = node.getAttribute('realtime');
            if (!state.enabled) HearstRealtime.enable({ mode });
            wireElement(node);
          }
          scan(node);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeDom);
    } else {
      observeDom();
    }
  }

  global.HearstRealtime = HearstRealtime;

})(typeof window !== 'undefined' ? window : globalThis);
