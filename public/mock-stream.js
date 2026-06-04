/**
 * mock-stream.js — Cockpit stream mock (browser-only, no Node)
 * Expose window.MockStream.connect(url, onMessage)
 * Détecte les URLs mock:* et lance un setInterval simulant la source.
 *
 * Sources mock supportées :
 *   mock:counter   — incrémente +1 toutes les 1000ms
 *   mock:price     — prix BTC oscillant ±2% toutes les 500ms (random walk)
 *   mock:pulse     — agent qui alterne idle(3s) → thinking(2s) → running(4s)
 */

(function (global) {
  'use strict';

  /* ── State BTC pour le random walk ─────────────────────────── */
  let _btcPrice = 67_420.00;

  /* ── Séquence état agent ────────────────────────────────────── */
  const _agentSequence = [
    { state: 'idle',     dur: 3000 },
    { state: 'thinking', dur: 2000 },
    { state: 'running',  dur: 4000 },
  ];

  /* ── Helpers ────────────────────────────────────────────────── */
  function _walk(price, maxPct = 0.02) {
    const delta = price * maxPct * (Math.random() * 2 - 1);
    return Math.max(1, price + delta);
  }

  /* ─────────────────────────────────────────────────────────────
   * connect(url, onMessage) → cleanup()
   *
   * Retourne une fonction cleanup() qui stoppe les intervals/timeouts
   * et doit être appelée au disconnectedCallback de l'hôte.
   * ───────────────────────────────────────────────────────────── */
  function connect(url, onMessage) {
    if (typeof url !== 'string') throw new TypeError('[MockStream] url must be a string');
    if (typeof onMessage !== 'function') throw new TypeError('[MockStream] onMessage must be a function');

    /* Déléguer aux vrais WebSocket/SSE si l'URL n'est pas mock */
    if (!url.startsWith('mock:')) {
      console.warn('[MockStream] Non-mock URL forwarded — pas de polyfill WebSocket ici :', url);
      return () => {};
    }

    const type = url.split(':')[1]; // 'counter', 'price', 'pulse', ou 'interval'
    let handle = null;
    let _cancelled = false;

    /* ── mock:counter ────────────────────────────────────────── */
    if (type === 'counter') {
      let count = 0;
      handle = setInterval(() => {
        if (_cancelled) return;
        count++;
        onMessage({ type: 'counter', value: count });
      }, 1000);
      return () => { _cancelled = true; clearInterval(handle); };
    }

    /* ── mock:price ──────────────────────────────────────────── */
    if (type === 'price') {
      let prev = _btcPrice;
      handle = setInterval(() => {
        if (_cancelled) return;
        const next = _walk(_btcPrice, 0.02);
        const change = ((next - prev) / prev) * 100;
        _btcPrice = next;
        prev = next;
        onMessage({ type: 'price', value: next, change: change });
      }, 500);
      return () => { _cancelled = true; clearInterval(handle); };
    }

    /* ── mock:pulse ──────────────────────────────────────────── */
    if (type === 'pulse') {
      let seqIdx = 0;
      function scheduleNext() {
        if (_cancelled) return;
        const step = _agentSequence[seqIdx % _agentSequence.length];
        onMessage({ type: 'pulse', state: step.state });
        seqIdx++;
        handle = setTimeout(scheduleNext, step.dur);
      }
      scheduleNext();
      return () => { _cancelled = true; clearTimeout(handle); };
    }

    /* ── mock:interval:<ms> (générique) ─────────────────────── */
    if (type === 'interval') {
      const ms = parseInt(url.split(':')[2], 10) || 1000;
      let tick = 0;
      handle = setInterval(() => {
        if (_cancelled) return;
        onMessage({ type: 'tick', tick: ++tick });
      }, ms);
      return () => { _cancelled = true; clearInterval(handle); };
    }

    console.warn('[MockStream] Type mock inconnu :', type);
    return () => {};
  }

  /* ── Export ──────────────────────────────────────────────────── */
  global.MockStream = { connect };

})(typeof window !== 'undefined' ? window : globalThis);
