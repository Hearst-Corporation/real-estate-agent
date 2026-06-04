/**
 * hearst-asset.esm.js — ESM version of the Hearst Asset Renderer
 * Import in modern bundlers / <script type="module">
 */

// ─── Global config ─────────────────────────────────────────────────────────
export let HEARST_CATALOG_BASE =
  (typeof window !== 'undefined' && window.HEARST_CATALOG_BASE) || './catalog/';

// ─── Template engine v2 ────────────────────────────────────────────────────
// {{x}} escapes HTML; {{{x}}} raw (SVG). Supports:
//   {{var}}, {{obj.prop}}, {{math expr}}, {{helperName args}}
//   {{#each arr as |item|}}...{{/each}}  (array, integer range, or helper result)
//   {{#if expr}}...{{else}}...{{/if}}    (expression truthy check)

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ─── Helpers ───────────────────────────────────────────────────────────────
export const HELPERS = {
  polygonFromValues(values) {
    if (!Array.isArray(values)) return '';
    const n = values.length;
    return values.map((v, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return `${(v * Math.cos(a)).toFixed(2)},${(v * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
  },
  pointsFromValues(values) {
    if (!Array.isArray(values)) return [];
    const n = values.length;
    return values.map((v, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return { x: v * Math.cos(a), y: v * Math.sin(a) };
    });
  },
  areaPath(points) {
    if (!Array.isArray(points) || !points.length) return '';
    const xs = points.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i].x},${points[i].y}`;
    d += ` L ${maxX},100 L ${minX},100 Z`;
    return d;
  },
  linePath(points) {
    if (!Array.isArray(points) || !points.length) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i].x},${points[i].y}`;
    return d;
  }
};

// ─── getPath: resolve "obj.prop.sub" ───────────────────────────────────────
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o == null ? undefined : o[k], obj);
}

// ─── evalExpr: safe expression evaluator ──────────────────────────────────
export function evalExpr(expr, ctx) {
  const e = expr.trim();

  // 1. Direct key lookup (handles keys with hyphens like "agent-id")
  if (Object.prototype.hasOwnProperty.call(ctx, e)) return ctx[e];

  // 2. Pure identifier path (must start with letter/underscore, not a bare number/operator)
  if (/^[a-zA-Z_$][\w$.]*$/.test(e)) return getPath(ctx, e);

  // 3. Helper call: "helperName arg"
  const helperMatch = e.match(/^(\w+)\s+(.+)$/);
  if (helperMatch && HELPERS[helperMatch[1]]) {
    const helperArg = evalExpr(helperMatch[2], ctx);
    return HELPERS[helperMatch[1]](helperArg);
  }

  // 4. Math / comparison expression — sandboxed new Function
  // Filter out JS reserved words (e.g. 'this', 'arguments') invalid in var declarations
  const JS_RESERVED = { 'this':1,'arguments':1,'eval':1,'let':1,'const':1,'var':1,'function':1,
    'return':1,'if':1,'else':1,'for':1,'while':1,'do':1,'break':1,'continue':1,'switch':1,
    'case':1,'default':1,'try':1,'catch':1,'finally':1,'throw':1,'new':1,'delete':1,
    'typeof':1,'instanceof':1,'void':1,'in':1,'of':1,'import':1,'export':1,'class':1,
    'extends':1,'super':1,'static':1,'yield':1,'async':1,'await':1,'debugger':1,'with':1,
    'null':1,'true':1,'false':1,'undefined':1 };
  const keys = Object.keys(ctx).filter(k => /^[a-zA-Z_$][\w$]*$/.test(k) && !JS_RESERVED[k]);
  const vals = keys.map(k => ctx[k]);
  try {
    const varDecl = keys.length
      ? 'var ' + keys.map((k, i) => `${k}=arguments[${14 + i}]`).join(',') + ';'
      : '';
    const fn = new Function(
      'PI', 'E', 'sin', 'cos', 'abs', 'min', 'max', 'sqrt', 'pow', 'floor', 'ceil', 'round',
      'getPath', 'ctx',
      varDecl + `return (${e});`
    );
    return fn(
      Math.PI, Math.E, Math.sin, Math.cos, Math.abs, Math.min, Math.max,
      Math.sqrt, Math.pow, Math.floor, Math.ceil, Math.round,
      getPath, ctx,
      ...vals
    );
  } catch (err) {
    return '';
  }
}

// ─── Block parser helpers ───────────────────────────────────────────────────
// Find the closing {{/tagName}} that matches the {{#tagName}} opener at
// openBodyStart. Returns {start, end} of the closing tag, or null.
function findMatchingClose(tpl, openBodyStart, tagName) {
  const openRe = new RegExp('\\{\\{#' + tagName + '[\\s}]', 'g');
  const closeRe = new RegExp('\\{\\{/' + tagName + '\\}\\}', 'g');
  openRe.lastIndex = openBodyStart;
  closeRe.lastIndex = openBodyStart;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = openRe.exec(tpl);
    const nextClose = closeRe.exec(tpl);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      openRe.lastIndex = nextOpen.index + 1;
      closeRe.lastIndex = nextOpen.index + 1;
    } else {
      depth--;
      if (depth === 0) return { start: nextClose.index, end: nextClose.index + ('{{/' + tagName + '}}').length };
      openRe.lastIndex = nextClose.index + 1;
      closeRe.lastIndex = nextClose.index + 1;
    }
  }
  return null;
}

// Find the first occurrence of {{#tagName ...}} with its matching close.
// Outermost-first: body is rendered recursively via renderTemplate(body, sub).
function findFirstBlock(tpl, tagName) {
  const openRe = new RegExp('\\{\\{#' + tagName + '\\s+([\\s\\S]+?)\\s*\\}\\}', 'g');
  let m;
  while ((m = openRe.exec(tpl)) !== null) {
    const bodyStart = m.index + m[0].length;
    const closeInfo = findMatchingClose(tpl, bodyStart, tagName);
    if (!closeInfo) continue;
    return { blockStart: m.index, expr: m[1].trim(), body: tpl.slice(bodyStart, closeInfo.start), closeEnd: closeInfo.end };
  }
  return null;
}

// ─── resolveOutermostBlock ────────────────────────────────────────────────
// Resolves the first (outermost) {{#each}} or {{#if}} block. Nested blocks
// are handled recursively inside renderTemplate(body, sub).
function resolveOutermostBlock(tpl, ctx) {
  const eachLeaf = findFirstBlock(tpl, 'each');
  const ifLeaf = findFirstBlock(tpl, 'if');
  const useEach = eachLeaf && (!ifLeaf || eachLeaf.blockStart <= ifLeaf.blockStart);

  if (useEach && eachLeaf) {
    const { expr: token, body, blockStart, closeEnd } = eachLeaf;

    let alias = null;
    let arrToken = token;
    const asMatch = token.match(/^([\s\S]+?)\s+as\s+\|(\w+)\|$/);
    if (asMatch) { arrToken = asMatch[1].trim(); alias = asMatch[2]; }

    let arr;
    const helperCallMatch = arrToken.match(/^(\w+)\s+(.+)$/);
    if (helperCallMatch && HELPERS[helperCallMatch[1]]) {
      arr = HELPERS[helperCallMatch[1]](evalExpr(helperCallMatch[2], ctx));
    } else {
      arr = evalExpr(arrToken, ctx);
    }

    if (typeof arr === 'number') arr = Array.from({ length: arr }, (_, k) => k);

    let replacement = '';
    if (Array.isArray(arr)) {
      replacement = arr.map((item, idx) => {
        const sub = Object.assign({}, ctx);
        sub['this'] = item;
        sub['@index'] = idx;
        if (alias) sub[alias] = item;
        if (item && typeof item === 'object') Object.keys(item).forEach(k => { sub[k] = item[k]; });
        return renderTemplate(body, sub);
      }).join('');
    }

    return tpl.slice(0, blockStart) + replacement + tpl.slice(closeEnd);
  }

  if (ifLeaf) {
    const { expr: condExpr, body: fullBody, blockStart, closeEnd } = ifLeaf;
    const elseIdx = fullBody.indexOf('{{else}}');
    const thenBody = elseIdx !== -1 ? fullBody.slice(0, elseIdx) : fullBody;
    const elseBody = elseIdx !== -1 ? fullBody.slice(elseIdx + '{{else}}'.length) : '';
    const condVal = evalExpr(condExpr, ctx);
    return tpl.slice(0, blockStart) + (condVal ? thenBody : elseBody) + tpl.slice(closeEnd);
  }

  return tpl;
}

// ─── substituteExpressions ─────────────────────────────────────────────────
function substituteExpressions(tpl, ctx) {
  // {{{raw}}} first (triple braces, no escape)
  tpl = tpl.replace(/\{\{\{([\s\S]+?)\}\}\}/g, (_, rawExpr) => {
    const val = evalExpr(rawExpr.trim(), ctx);
    return val == null ? '' : String(val);
  });
  // {{expr}} escaped
  tpl = tpl.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => {
    const e = expr.trim();
    if (/^[#\/]/.test(e)) return _;
    const val = evalExpr(e, ctx);
    const str = val == null ? '' : String(val);
    return escapeHtml(str);
  });
  return tpl;
}

// ─── renderTemplate (v2) ───────────────────────────────────────────────────
export function renderTemplate(tpl, params) {
  if (!tpl) return '';

  // Phase 1: resolve all block constructs outermost-first (iterative until stable)
  let prev;
  let curr = tpl;
  const MAX_TEMPLATE_ITER = 200;
  let iter = 0;
  while (curr !== prev && iter++ < MAX_TEMPLATE_ITER) {
    if (curr.indexOf('{{#') === -1) break;
    prev = curr;
    curr = resolveOutermostBlock(curr, params);
  }

  // Phase 2: substitute remaining {{expr}} and {{{expr}}}
  return substituteExpressions(curr, params);
}

// ─── ID → file path ────────────────────────────────────────────────────────
export function idToPath(id) {
  const colonIdx = id.indexOf(':');
  if (colonIdx === -1) return `${id}.asset.json`;
  const category = id.slice(0, colonIdx);
  const name = id.slice(colonIdx + 1);
  const folderMap = { chart: 'charts', kpi: 'kpis', viz: 'viz' };
  const folder = folderMap[category] || category + 's';
  return `${folder}/${name}.asset.json`;
}

// ─── Default canvas renderer ───────────────────────────────────────────────
function _defaultCanvasRender(ctx, canvas, segments) {
  const W = canvas.width, H = canvas.height;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;
  const colors = ['#cba6f7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5'];
  const barW = Math.floor(W / segments.length) - 6;
  const maxH = H - 40;

  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, W, H);

  segments.forEach((seg, i) => {
    const barH = Math.round((seg.value / total) * maxH);
    const x = i * (barW + 6) + 3;
    const y = H - barH - 20;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#cdd6f4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(seg.label || '', x + barW / 2, H - 4);
  });
}

// ─── CSS injection ──────────────────────────────────────────────────
function _injectAssetCss(shadowRoot, css) {
  const STYLE_ID = 'ha-asset-css';
  if (!shadowRoot) return;
  let el = shadowRoot.querySelector('#' + STYLE_ID);
  if (css) {
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      shadowRoot.appendChild(el);
    }
    el.textContent = css;
  } else if (el) {
    el.remove();
  }
}

// ─── Renderers ─────────────────────────────────────────────────────────────
export const Renderers = {
  svg(container, asset, params) {
    const tpl = (asset.template && (asset.template.inline || asset.template.svg))
             || asset.svg
             || (asset.render && asset.render.svg)
             || '';
    if (!tpl) {
      container.innerHTML = '<div class="asset-empty">Pas de template SVG</div>';
      return;
    }
    _injectAssetCss(container.getRootNode(), asset.render?.css || '');
    container.innerHTML = renderTemplate(tpl, params);
  },

  html(container, asset, params) {
    const tpl = (asset.template && (asset.template.inline || asset.template.html))
             || asset.html
             || (asset.render && asset.render.html)
             || '';
    if (!tpl) {
      container.innerHTML = '<div class="asset-empty">Pas de template HTML</div>';
      return;
    }
    _injectAssetCss(container.getRootNode(), asset.render?.css || '');
    container.innerHTML = renderTemplate(tpl, params);
    const initSrc = asset.render?.canvas?.init;
    if (initSrc && typeof initSrc === 'string') {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('container', 'params', initSrc + ';\ninit(container, params);');
        fn(container, params);
      } catch (e) {
        console.warn('[hearst-asset] html init error:', e);
      }
    }
  },

  canvas(container, asset, params) {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = params.width || asset.defaults?.width || 300;
    canvas.height = params.height || asset.defaults?.height || 200;
    container.appendChild(canvas);

    // initSrc declares `function init(canvas, params){...}`.
    // wrappedRAF is passed as parameter so all recursive rAF calls inside initSrc
    // use the wrapper — updates canvas.__rafHandle and no-ops once canvas.__alive === false.
    const initSrc = asset.render?.canvas?.init;
    if (initSrc && typeof initSrc === 'string') {
      try {
        const _win = typeof window !== 'undefined' ? window : globalThis;
        canvas.__alive = true;
        const wrappedRAF = (cb) => {
          if (!canvas.__alive) return 0;
          const h = _win.requestAnimationFrame(cb);
          canvas.__rafHandle = h;
          return h;
        };
        const wrappedCAF = (h) => _win.cancelAnimationFrame(h);
        // eslint-disable-next-line no-new-func
        new Function('canvas', 'params', 'requestAnimationFrame', 'cancelAnimationFrame',
          initSrc + ';\ninit(canvas, params);')(canvas, params, wrappedRAF, wrappedCAF);
      } catch (e) {
        console.warn('[hearst-asset] canvas init error:', e);
        container.innerHTML = '<div class="asset-empty">Erreur rendu canvas</div>';
      }
    } else if (typeof initSrc === 'function') {
      try { initSrc(canvas, params); } catch { container.innerHTML = '<div class="asset-empty">Erreur rendu canvas</div>'; }
    } else {
      const ctx = canvas.getContext('2d');
      if (ctx && params.segments && Array.isArray(params.segments)) {
        _defaultCanvasRender(ctx, canvas, params.segments);
      } else if (ctx) {
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#7f849c';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('canvas: pas de données', canvas.width / 2, canvas.height / 2);
      }
    }
  },

  vega(container, _asset, _params) {
    console.warn('[hearst-asset] vega: render TBD');
    container.innerHTML = '<div class="asset-placeholder">Vega: render TBD</div>';
  },

  stream(container, asset, params) {
    container.innerHTML = '';
    const el = document.createElement('hearst-stream');
    el.setAttribute('asset-id', asset.id || '');
    if (params) el.data = params;
    container.appendChild(el);
  }
};

// ─── Web Component ─────────────────────────────────────────────────────────
export class HearstAsset extends HTMLElement {
  static get observedAttributes() {
    return ['id', 'data', 'catalog-base', 'width', 'height'];
  }

  constructor() {
    super();
    this._data = null;
    this._asset = null;
    this._rafHandle = null;
    this._loadSeq = 0;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: inherit; }
        .asset-error { color: #f38ba8; padding: 8px; font-size: 13px; border: 1px solid #f38ba8; border-radius: 4px; }
        .asset-empty { color: #7f849c; padding: 8px; font-size: 13px; font-style: italic; }
        .asset-placeholder { color: #89b4fa; padding: 8px; font-size: 13px; border: 1px dashed #89b4fa; border-radius: 4px; }
        .asset-loading { color: #7f849c; padding: 8px; font-size: 12px; }
      </style>
      <div class="asset-root"></div>
    `;
  }

  get container() { return this.shadowRoot.querySelector('.asset-root'); }
  get data() { return this._data; }
  set data(val) { this._data = val; this._render(); }

  connectedCallback() { this._load(); }

  _cleanupCanvasAnimations() {
    const root = this.shadowRoot || this;
    root.querySelectorAll('canvas').forEach(c => {
      c.__alive = false;
      if (c.__rafHandle) {
        cancelAnimationFrame(c.__rafHandle);
        c.__rafHandle = null;
      }
    });
  }

  disconnectedCallback() {
    this._cleanupCanvasAnimations();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'data') {
      try { this._data = newVal ? JSON.parse(newVal) : null; } catch { this._data = null; }
      if (this._asset) this._render();
    } else if (name === 'id' || name === 'catalog-base') {
      this._load();
    } else if ((name === 'width' || name === 'height') && this._asset) {
      this._render();
    }
  }

  _catalogBase() {
    return this.getAttribute('catalog-base') || HEARST_CATALOG_BASE;
  }

  async _load() {
    const assetId = this.getAttribute('id');
    if (!assetId) return;

    const dataAttr = this.getAttribute('data');
    if (dataAttr && !this._data) {
      try { this._data = JSON.parse(dataAttr); } catch { /* ignore */ }
    }

    this._cleanupCanvasAnimations();
    this.container.innerHTML = '<div class="asset-loading">Chargement…</div>';

    // Sequence token — invalidates concurrent fetches.
    const seq = ++this._loadSeq;

    const base = this._catalogBase().replace(/\/?$/, '/');
    const url = base + idToPath(assetId);

    try {
      const resp = await fetch(url);
      // Abandon if a newer _load() started after us.
      if (seq !== this._loadSeq) return;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const spec = await resp.json();
      // Double-check after second await.
      if (seq !== this._loadSeq) return;
      this._asset = spec;
      this._render();
    } catch (err) {
      // Only report error if this load is still the current one.
      if (seq !== this._loadSeq) return;
      console.warn(`[hearst-asset] fetch failed "${assetId}" (${url}):`, err.message);
      this.container.innerHTML = `<div class="asset-error">Asset introuvable: ${assetId}</div>`;
      this._emit('asset-error', { id: assetId, error: err.message });
    }
  }

  _render() {
    if (!this._asset) return;
    this._cleanupCanvasAnimations();
    const params = this._buildParams(this._asset);

    // Only show "Pas de données" when the asset declares params but none are provided.
    // Assets without a params schema are self-sufficient and render with an empty merged object.
    const declaredParams = this._asset.params && Object.keys(this._asset.params).length > 0;
    const noProvidedData = !params || Object.keys(params).length === 0;
    if (declaredParams && noProvidedData) {
      this.container.innerHTML = '<div class="asset-empty">Pas de données</div>';
      return;
    }

    const kind = this._asset.kind || 'html';
    const renderer = Renderers[kind] || Renderers.html;

    try {
      if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
      renderer(this.container, this._asset, params);
      if (kind === 'canvas') {
        const c = this.container.querySelector('canvas');
        if (c && c.__rafHandle) { this._rafHandle = c.__rafHandle; }
      }
      this._emit('asset-ready', { id: this.getAttribute('id'), kind });
    } catch (err) {
      console.error('[hearst-asset] render error:', err);
      this.container.innerHTML = `<div class="asset-error">Erreur de rendu: ${err.message}</div>`;
      this._emit('asset-error', { id: this.getAttribute('id'), error: err.message });
    }
  }

  _buildParams(asset) {
    // Support both asset.defaults (flat map) and asset.params (JSON-schema with .default per key).
    // Shallow-clone to avoid mutating asset.defaults in-memory.
    const defaults = Object.assign({}, asset.defaults || {});
    if (asset.params && typeof asset.params === 'object') {
      for (const [k, schema] of Object.entries(asset.params)) {
        if (!(k in defaults) && 'default' in schema) defaults[k] = schema.default;
      }
    }
    const userdata = this._data || {};
    const merged = Object.assign({}, defaults, userdata);
    const w = this.getAttribute('width');
    const h = this.getAttribute('height');
    if (w) merged.width = Number(w);
    if (h) merged.height = Number(h);
    return merged;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

// ─── Register ──────────────────────────────────────────────────────────────
if (!customElements.get('hearst-asset')) {
  customElements.define('hearst-asset', HearstAsset);
}

export default HearstAsset;
