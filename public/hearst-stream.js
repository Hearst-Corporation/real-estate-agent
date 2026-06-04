/**
 * hearst-stream.js — <hearst-stream> Custom Element
 * Étend le comportement de <hearst-asset> pour les assets de catégorie stream.
 *
 * Usage :
 *   <hearst-stream
 *     asset-id="stream:counter-live"
 *     source="mock:counter"
 *     label="EN LIGNE"
 *     initial="0">
 *   </hearst-stream>
 *
 * Sources supportées :
 *   ws://…        → WebSocket natif
 *   sse://…       → EventSource (converti en https://)
 *   http://…      → polling fetch toutes les [poll-interval]ms
 *   mock:*        → window.MockStream.connect()
 *
 * Events émis (sur l'élément lui-même) :
 *   stream-message  { detail: { raw, parsed } }
 *   stream-error    { detail: { error } }
 *   stream-close    { detail: {} }
 */

class HearstStream extends HTMLElement {
  /* ── Observed attributes ─────────────────────────────────────── */
  static get observedAttributes() {
    return ['source', 'asset-id', 'label', 'initial', 'symbol',
            'precision', 'agent-id', 'poll-interval'];
  }

  constructor() {
    super();
    this._cleanup = null;   // fonction retournée par le connecteur
    this._ws = null;
    this._es = null;
    this._pollHandle = null;
    this._connected = false;
  }

  /* ── Lifecycle ───────────────────────────────────────────────── */
  connectedCallback() {
    this._render();
    this._connect();
    this._connected = true;
  }

  disconnectedCallback() {
    this._disconnect();
    this._connected = false;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (this._connected) {
      this._disconnect();
      this._render();
      this._connect();
    }
  }

  /* ── Render initial ──────────────────────────────────────────── */
  _render() {
    const assetId = this.getAttribute('asset-id') || '';
    const source  = this.getAttribute('source') || 'mock:counter';

    if (assetId.startsWith('stream:counter')) {
      this._renderCounter();
    } else if (assetId.startsWith('stream:price')) {
      this._renderTicker();
    } else if (assetId.startsWith('stream:agent-pulse')) {
      this._renderPulse();
    } else {
      // Fallback générique
      this.innerHTML = `<div class="ct-stream-generic" style="color:rgba(245,245,245,0.72);padding:16px;font-family:monospace;font-size:12px;">[${assetId}] connecting to ${source}…</div>`;
    }
  }

  _renderCounter() {
    const label   = this.getAttribute('label')   || 'EN LIGNE';
    const initial = this.getAttribute('initial') || '0';
    this.innerHTML = `
<style>
.ct-counter-live{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px 32px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:16px;backdrop-filter:blur(24px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),0 20px 60px -24px rgba(0,0,0,0.65);position:relative;min-width:180px;}
.ct-counter-dot{width:8px;height:8px;border-radius:50%;background:#e11d48;box-shadow:0 0 0 0 rgba(225,29,72,.7);animation:ct-heartbeat 1.4s cubic-bezier(.2,.7,.2,1) infinite;position:absolute;top:16px;right:16px;}
.ct-counter-value{font-family:'Satoshi Variable',Inter,system-ui,sans-serif;font-size:56px;font-weight:800;color:#fff;line-height:1;letter-spacing:-2px;transition:transform 120ms cubic-bezier(.2,.7,.2,1);}
.ct-counter-value.ct-flash{transform:scale(1.08);color:#e11d48;}
.ct-counter-label{font-family:'Satoshi Variable',Inter,system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(245,245,245,.48);}
@keyframes ct-heartbeat{0%,100%{box-shadow:0 0 0 0 rgba(225,29,72,.7);}50%{box-shadow:0 0 0 8px rgba(225,29,72,0);}}
</style>
<div class="ct-counter-live">
  <div class="ct-counter-dot"></div>
  <div class="ct-counter-value" id="cv">${initial}</div>
  <div class="ct-counter-label">${label}</div>
</div>`;
  }

  _renderTicker() {
    const symbol    = this.getAttribute('symbol')    || 'BTC/USD';
    const precision = this.getAttribute('precision') || '2';
    this.innerHTML = `
<style>
.ct-ticker{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:12px;backdrop-filter:blur(24px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),0 20px 60px -24px rgba(0,0,0,0.65);gap:16px;min-width:280px;font-family:'Satoshi Variable',Inter,system-ui,sans-serif;}
.ct-ticker-symbol{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(245,245,245,.48);flex-shrink:0;font-family:'JetBrains Mono',ui-monospace,monospace;}
.ct-ticker-price{font-size:28px;font-weight:800;color:#fff;letter-spacing:-.5px;transition:color 180ms cubic-bezier(.2,.7,.2,1);flex:1;text-align:center;}
.ct-ticker-price.ct-flash-up{animation:ct-flash-up 300ms ease-out;}
.ct-ticker-price.ct-flash-down{animation:ct-flash-down 300ms ease-out;}
.ct-ticker-change{font-size:13px;font-weight:700;min-width:80px;text-align:right;}
.ct-ticker-up{color:#22c55e;}.ct-ticker-down{color:#e11d48;}.ct-ticker-neutral{color:rgba(245,245,245,.48);}
@keyframes ct-flash-up{0%{color:#22c55e;text-shadow:0 0 12px rgba(34,197,94,.6);}100%{color:#fff;text-shadow:none;}}
@keyframes ct-flash-down{0%{color:#e11d48;text-shadow:0 0 12px rgba(225,29,72,.6);}100%{color:#fff;text-shadow:none;}}
</style>
<div class="ct-ticker">
  <span class="ct-ticker-symbol">${symbol}</span>
  <span class="ct-ticker-price" id="tp">—</span>
  <span class="ct-ticker-change ct-ticker-neutral" id="tc">—</span>
</div>`;
    this._precision = parseInt(precision, 10);
  }

  _renderPulse() {
    const agentId = this.getAttribute('agent-id') || 'agent-01';
    this.innerHTML = `
<style>
.ct-pulse-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:20px;backdrop-filter:blur(24px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),0 20px 60px -24px rgba(0,0,0,0.65);position:relative;width:160px;min-height:160px;}
.ct-pulse-core{width:48px;height:48px;border-radius:50%;background:var(--cp,#48bb78);box-shadow:0 0 16px var(--cp,#48bb78);transition:background 400ms cubic-bezier(.2,.7,.2,1),box-shadow 400ms cubic-bezier(.2,.7,.2,1);margin-bottom:4px;}
.ct-pulse-ring{width:80px;height:80px;border-radius:50%;border:2px solid var(--cp,#48bb78);opacity:.5;animation:ct-pulse-halo var(--pd,1.4s) cubic-bezier(.2,.7,.2,1) infinite;position:absolute;top:28px;left:50%;transform:translateX(-50%);transition:border-color 400ms cubic-bezier(.2,.7,.2,1);}
.ct-pulse-state{font-family:'Satoshi Variable',Inter,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--cp,#48bb78);transition:color 400ms cubic-bezier(.2,.7,.2,1);}
.ct-pulse-label{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:rgba(245,245,245,.48);letter-spacing:.5px;}
@keyframes ct-pulse-halo{0%{transform:translateX(-50%) scale(1);opacity:.5;}70%{transform:translateX(-50%) scale(1.6);opacity:0;}100%{transform:translateX(-50%) scale(1.6);opacity:0;}}
</style>
<div class="ct-pulse-wrap" id="pw">
  <div class="ct-pulse-ring" id="pr"></div>
  <div class="ct-pulse-core" id="pc"></div>
  <div class="ct-pulse-state" id="ps">idle</div>
  <div class="ct-pulse-label">${agentId}</div>
</div>`;

    this._stateColors = {
      idle:     '#48bb78',
      thinking: '#e11d48',
      running:  '#3b82f6',
    };
    const custom = this.getAttribute('states');
    if (custom) {
      try { Object.assign(this._stateColors, JSON.parse(custom)); } catch (_) {}
    }
  }

  /* ── Connexion source ────────────────────────────────────────── */
  _connect() {
    const source = this.getAttribute('source') || 'mock:counter';

    if (source.startsWith('mock:')) {
      this._connectMock(source);
    } else if (source.startsWith('ws://') || source.startsWith('wss://')) {
      this._connectWebSocket(source);
    } else if (source.startsWith('sse://')) {
      this._connectSSE(source.replace('sse://', 'https://'));
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      const ms = parseInt(this.getAttribute('poll-interval') || '2000', 10);
      this._connectPolling(source, ms);
    }
  }

  _connectMock(url) {
    if (!window.MockStream) {
      console.error('[HearstStream] MockStream non chargé — inclure mock-stream.js');
      return;
    }
    this._cleanup = window.MockStream.connect(url, (msg) => this._handleMessage(msg));
  }

  _connectWebSocket(url) {
    try {
      this._ws = new WebSocket(url);
      this._ws.addEventListener('message', (e) => {
        let parsed = e.data;
        try { parsed = JSON.parse(e.data); } catch (_) {}
        const payload = (parsed && typeof parsed === 'object')
          ? { ...parsed, _raw: e.data }
          : parsed;
        this._handleMessage(payload);
      });
      this._ws.addEventListener('error', (e) => {
        this.dispatchEvent(new CustomEvent('stream-error', { detail: { error: e }, bubbles: true }));
      });
      this._ws.addEventListener('close', () => {
        this.dispatchEvent(new CustomEvent('stream-close', { detail: {}, bubbles: true }));
      });
      this._cleanup = () => {
        if (this._ws) { this._ws.close(); this._ws = null; }
      };
    } catch (err) {
      this.dispatchEvent(new CustomEvent('stream-error', { detail: { error: err }, bubbles: true }));
    }
  }

  _connectSSE(url) {
    try {
      this._es = new EventSource(url);
      this._es.addEventListener('message', (e) => {
        let parsed = e.data;
        try { parsed = JSON.parse(e.data); } catch (_) {}
        const payload = (parsed && typeof parsed === 'object')
          ? { ...parsed, _raw: e.data }
          : parsed;
        this._handleMessage(payload);
      });
      this._es.addEventListener('error', (e) => {
        this.dispatchEvent(new CustomEvent('stream-error', { detail: { error: e }, bubbles: true }));
      });
      this._cleanup = () => {
        if (this._es) { this._es.close(); this._es = null; }
      };
    } catch (err) {
      this.dispatchEvent(new CustomEvent('stream-error', { detail: { error: err }, bubbles: true }));
    }
  }

  _connectPolling(url, intervalMs) {
    const poll = async () => {
      try {
        const res = await fetch(url);
        const text = await res.text();
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (_) {}
        const payload = (parsed && typeof parsed === 'object')
          ? { ...parsed, _raw: text }
          : parsed;
        this._handleMessage(payload);
      } catch (err) {
        this.dispatchEvent(new CustomEvent('stream-error', { detail: { error: err }, bubbles: true }));
      }
    };
    poll();
    this._pollHandle = setInterval(poll, intervalMs);
    this._cleanup = () => {
      clearInterval(this._pollHandle);
      this._pollHandle = null;
    };
  }

  /* ── Dispatch message vers le DOM de l'asset ─────────────────── */
  _handleMessage(msg) {
    const raw = (msg && msg._raw !== undefined) ? msg._raw : undefined;
    const parsed = (msg && msg._raw !== undefined) ? (delete msg._raw, msg) : msg;
    this.dispatchEvent(new CustomEvent('stream-message', { detail: { raw, parsed }, bubbles: true }));

    const assetId = this.getAttribute('asset-id') || '';

    if (assetId.startsWith('stream:counter') && msg && msg.type === 'counter') {
      this._updateCounter(msg.value);
    } else if (assetId.startsWith('stream:price') && msg && msg.type === 'price') {
      this._updateTicker(msg.value, msg.change);
    } else if (assetId.startsWith('stream:agent-pulse') && msg && msg.type === 'pulse') {
      this._updatePulse(msg.state);
    }
  }

  _updateCounter(value) {
    const el = this.querySelector('#cv');
    if (!el) return;
    el.textContent = value;
    el.classList.add('ct-flash');
    setTimeout(() => el.classList.remove('ct-flash'), 140);
  }

  _updateTicker(price, change) {
    const priceEl  = this.querySelector('#tp');
    const changeEl = this.querySelector('#tc');
    if (!priceEl || !changeEl) return;
    const precision = this._precision ?? 2;
    priceEl.textContent = price.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
    changeEl.textContent = `${arrow} ${Math.abs(change).toFixed(2)}%`;
    changeEl.className = `ct-ticker-change ct-ticker-${dir}`;
    priceEl.classList.remove('ct-flash-up', 'ct-flash-down');
    void priceEl.offsetWidth; // force reflow pour relancer animation
    if (dir !== 'neutral') priceEl.classList.add(`ct-flash-${dir}`);
  }

  _updatePulse(state) {
    const wrap  = this.querySelector('#pw');
    const ring  = this.querySelector('#pr');
    const core  = this.querySelector('#pc');
    const badge = this.querySelector('#ps');
    if (!core || !badge) return;
    const color = (this._stateColors || {})[state] || '#48bb78';
    const durMap = { idle: '1.4s', thinking: '0.7s', running: '0.35s' };
    const dur = durMap[state] || '1.4s';
    if (wrap) wrap.style.setProperty('--cp', color);
    if (wrap) wrap.style.setProperty('--pd', dur);
    badge.textContent = state;
  }

  /* ── Disconnect / cleanup ────────────────────────────────────── */
  _disconnect() {
    if (typeof this._cleanup === 'function') {
      this._cleanup();
      this._cleanup = null;
    }
    if (this._ws)          { this._ws.close();  this._ws = null; }
    if (this._es)          { this._es.close();  this._es = null; }
    if (this._pollHandle)  { clearInterval(this._pollHandle); this._pollHandle = null; }
  }
}

customElements.define('hearst-stream', HearstStream);
