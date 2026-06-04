/**
 * hearst-asset.js — Universal Catalog Asset Renderer Web Component
 * Hearst Cockpit Design System — A3 Squad Catalog
 *
 * Usage:
 *   <hearst-asset id="chart:progress-circle"></hearst-asset>
 *   <hearst-asset id="kpi:value-trend" data='{"title":"MRR","value":"$42K","delta":"+18%","direction":"up"}'></hearst-asset>
 *   <hearst-asset id="viz:holo-rings"></hearst-asset>
 */

(function (global) {
  'use strict';

  // ─── Global config ────────────────────────────────────────────────────────
  global.HEARST_CATALOG_BASE = global.HEARST_CATALOG_BASE || './catalog/';

  // ─── Template engine v2 ───────────────────────────────────────────────────
  // {{x}} escapes HTML; {{{x}}} raw (SVG). Supports:
  //   {{var}}, {{obj.prop}}, {{math expr}}, {{helperName args}}
  //   {{#each arr as |item|}}...{{/each}}  (array, integer range, or helper result)
  //   {{#if expr}}...{{else}}...{{/if}}    (expression truthy check)

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  var HELPERS = {
    polygonFromValues: function(values) {
      if (!Array.isArray(values)) return '';
      var n = values.length;
      return values.map(function(v, i) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / n;
        return (v * Math.cos(a)).toFixed(2) + ',' + (v * Math.sin(a)).toFixed(2);
      }).join(' ');
    },
    pointsFromValues: function(values) {
      if (!Array.isArray(values)) return [];
      var n = values.length;
      return values.map(function(v, i) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / n;
        return { x: v * Math.cos(a), y: v * Math.sin(a) };
      });
    },
    areaPath: function(points) {
      if (!Array.isArray(points) || !points.length) return '';
      var xs = points.map(function(p) { return p.x; });
      var minX = Math.min.apply(null, xs);
      var maxX = Math.max.apply(null, xs);
      var d = 'M ' + points[0].x + ',' + points[0].y;
      for (var i = 1; i < points.length; i++) d += ' L ' + points[i].x + ',' + points[i].y;
      d += ' L ' + maxX + ',100 L ' + minX + ',100 Z';
      return d;
    },
    linePath: function(points) {
      if (!Array.isArray(points) || !points.length) return '';
      var d = 'M ' + points[0].x + ',' + points[0].y;
      for (var i = 1; i < points.length; i++) d += ' L ' + points[i].x + ',' + points[i].y;
      return d;
    }
  };

  // ─── getPath: resolve "obj.prop.sub" ──────────────────────────────────────
  function getPath(obj, path) {
    return path.split('.').reduce(function(o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }

  // ─── evalExpr: safe expression evaluator ─────────────────────────────────
  function evalExpr(expr, ctx) {
    var e = expr.trim();

    // 1. Direct key lookup (handles keys with hyphens like "agent-id")
    if (Object.prototype.hasOwnProperty.call(ctx, e)) return ctx[e];

    // 2. Pure identifier path (must start with letter/underscore, not a bare number/operator)
    if (/^[a-zA-Z_$][\w$.]*$/.test(e)) return getPath(ctx, e);

    // 3. Helper call: "helperName arg" — single space-separated token pair
    var helperMatch = e.match(/^(\w+)\s+(.+)$/);
    if (helperMatch && HELPERS[helperMatch[1]]) {
      var helperArg = evalExpr(helperMatch[2], ctx);
      return HELPERS[helperMatch[1]](helperArg);
    }

    // 4. Math / comparison expression — sandboxed new Function
    // Filter out JS reserved words (e.g. 'this', 'arguments') which are invalid in var declarations
    var JS_RESERVED = { 'this':1,'arguments':1,'eval':1,'let':1,'const':1,'var':1,'function':1,
      'return':1,'if':1,'else':1,'for':1,'while':1,'do':1,'break':1,'continue':1,'switch':1,
      'case':1,'default':1,'try':1,'catch':1,'finally':1,'throw':1,'new':1,'delete':1,
      'typeof':1,'instanceof':1,'void':1,'in':1,'of':1,'import':1,'export':1,'class':1,
      'extends':1,'super':1,'static':1,'yield':1,'async':1,'await':1,'debugger':1,'with':1,
      'null':1,'true':1,'false':1,'undefined':1 };
    var keys = Object.keys(ctx).filter(function(k) {
      return /^[a-zA-Z_$][\w$]*$/.test(k) && !JS_RESERVED[k];
    });
    var vals = keys.map(function(k) { return ctx[k]; });
    try {
      var varDecl = keys.length
        ? 'var ' + keys.map(function(k, i) { return k + '=arguments[' + (14 + i) + ']'; }).join(',') + ';'
        : '';
      var fn = new Function(
        'PI', 'E', 'sin', 'cos', 'abs', 'min', 'max', 'sqrt', 'pow', 'floor', 'ceil', 'round',
        'getPath', 'ctx',
        varDecl + 'return (' + e + ');'
      );
      // Build argument list
      var fnArgs = [
        Math.PI, Math.E, Math.sin, Math.cos, Math.abs, Math.min, Math.max,
        Math.sqrt, Math.pow, Math.floor, Math.ceil, Math.round,
        getPath, ctx
      ].concat(vals);
      return fn.apply(null, fnArgs);
    } catch (err) {
      return '';
    }
  }

  // ─── Block parser helpers ──────────────────────────────────────────────────
  // Find the closing {{/tagName}} that matches the {{#tagName}} opener at position
  // openBodyStart (= index right after the opening tag). Returns the index of
  // the start of `{{/tagName}}` and its end index.
  function findMatchingClose(tpl, openBodyStart, tagName) {
    var openRe = new RegExp('\\{\\{#' + tagName + '[\\s}]', 'g');
    var closeRe = new RegExp('\\{\\{/' + tagName + '\\}\\}', 'g');
    openRe.lastIndex = openBodyStart;
    closeRe.lastIndex = openBodyStart;
    var depth = 1;
    while (depth > 0) {
      var nextOpen = openRe.exec(tpl);
      var nextClose = closeRe.exec(tpl);
      if (!nextClose) return null; // malformed
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
  // Outermost-first: body is rendered recursively via renderTemplate(body, sub),
  // so nested blocks get the correct context automatically.
  function findFirstBlock(tpl, tagName) {
    var openRe = new RegExp('\\{\\{#' + tagName + '\\s+([\\s\\S]+?)\\s*\\}\\}', 'g');
    var m;
    while ((m = openRe.exec(tpl)) !== null) {
      var bodyStart = m.index + m[0].length;
      var closeInfo = findMatchingClose(tpl, bodyStart, tagName);
      if (!closeInfo) continue;
      return {
        blockStart: m.index,
        expr: m[1].trim(),
        body: tpl.slice(bodyStart, closeInfo.start),
        closeEnd: closeInfo.end
      };
    }
    return null;
  }

  // ─── resolveOutermostBlock ────────────────────────────────────────────────
  // Resolves the first (outermost) {{#each}} or {{#if}} block encountered.
  // Nested blocks are handled recursively inside renderTemplate(body, sub).
  function resolveOutermostBlock(tpl, ctx) {
    var eachLeaf = findFirstBlock(tpl, 'each');
    var ifLeaf = findFirstBlock(tpl, 'if');

    // Prefer #each at or before #if (each establishes context for nested ifs)
    var useEach = eachLeaf && (!ifLeaf || eachLeaf.blockStart <= ifLeaf.blockStart);

    if (useEach && eachLeaf) {
      var token = eachLeaf.expr;
      var body = eachLeaf.body;

      // Parse "... as |alias|"
      var alias = null;
      var arrToken = token;
      var asMatch = token.match(/^([\s\S]+?)\s+as\s+\|(\w+)\|$/);
      if (asMatch) {
        arrToken = asMatch[1].trim();
        alias = asMatch[2];
      }

      // Resolve the array source (maybe a helper call)
      var arr;
      var helperCallMatch = arrToken.match(/^(\w+)\s+(.+)$/);
      if (helperCallMatch && HELPERS[helperCallMatch[1]]) {
        arr = HELPERS[helperCallMatch[1]](evalExpr(helperCallMatch[2], ctx));
      } else {
        arr = evalExpr(arrToken, ctx);
      }

      // Integer range: {{#each 10 as |i|}} → [0..9]
      if (typeof arr === 'number') {
        arr = Array.from({ length: arr }, function(_, k) { return k; });
      }

      var replacement = '';
      if (Array.isArray(arr)) {
        replacement = arr.map(function(item, idx) {
          var sub = Object.assign({}, ctx);
          sub['this'] = item;
          sub['@index'] = idx;
          if (alias) sub[alias] = item;
          if (item && typeof item === 'object') {
            Object.keys(item).forEach(function(k) { sub[k] = item[k]; });
          }
          return renderTemplate(body, sub);
        }).join('');
      }

      return tpl.slice(0, eachLeaf.blockStart) + replacement + tpl.slice(eachLeaf.closeEnd);
    }

    if (ifLeaf) {
      var condExpr = ifLeaf.expr;
      var fullBody = ifLeaf.body;
      // Split on {{else}} (only at depth 0 — but since it's a leaf, no nested #if)
      var elseIdx = fullBody.indexOf('{{else}}');
      var thenBody, elseBody;
      if (elseIdx !== -1) {
        thenBody = fullBody.slice(0, elseIdx);
        elseBody = fullBody.slice(elseIdx + '{{else}}'.length);
      } else {
        thenBody = fullBody;
        elseBody = '';
      }

      var condVal = evalExpr(condExpr, ctx);
      var chosen = condVal ? thenBody : elseBody;
      return tpl.slice(0, ifLeaf.blockStart) + chosen + tpl.slice(ifLeaf.closeEnd);
    }

    return tpl;
  }

  // ─── substituteExpressions ────────────────────────────────────────────────
  function substituteExpressions(tpl, ctx) {
    // {{{raw}}} first (triple braces, no escape)
    tpl = tpl.replace(/\{\{\{([\s\S]+?)\}\}\}/g, function(match, rawExpr) {
      var val = evalExpr(rawExpr.trim(), ctx);
      return val == null ? '' : String(val);
    });
    // {{expr}} escaped
    tpl = tpl.replace(/\{\{([\s\S]+?)\}\}/g, function(match, expr) {
      var e = expr.trim();
      // Skip block openers/closers that weren't resolved (shouldn't happen but be safe)
      if (/^[#\/]/.test(e)) return match;
      var val = evalExpr(e, ctx);
      var str = val == null ? '' : String(val);
      return escapeHtml(str);
    });
    return tpl;
  }

  // ─── renderTemplate (v2) ──────────────────────────────────────────────────
  function renderTemplate(tpl, params) {
    if (!tpl) return '';

    // Phase 1: resolve all block constructs outermost-first (iterative until stable)
    var MAX_TEMPLATE_ITER = 200;
    var prev;
    var curr = tpl;
    var iter = 0;
    while (curr !== prev && iter++ < MAX_TEMPLATE_ITER) {
      // Only iterate while there are unresolved block openers
      if (curr.indexOf('{{#') === -1) break;
      prev = curr;
      curr = resolveOutermostBlock(curr, params);
    }

    // Phase 2: substitute remaining {{expr}} and {{{expr}}}
    return substituteExpressions(curr, params);
  }

  // ─── ID → file path ───────────────────────────────────────────────────────
  function idToPath(id) {
    // "chart:progress-circle" → "charts/progress-circle.asset.json"
    // "kpi:value-trend"       → "kpis/value-trend.asset.json"
    // "viz:particle-swarm"    → "viz/particle-swarm.asset.json"
    const colonIdx = id.indexOf(':');
    if (colonIdx === -1) return `${id}.asset.json`;
    const category = id.slice(0, colonIdx);
    const name = id.slice(colonIdx + 1);
    // Pluralise common categories
    const folderMap = { chart: 'charts', kpi: 'kpis', viz: 'viz' };
    const folder = folderMap[category] || category + 's';
    return `${folder}/${name}.asset.json`;
  }

  // ─── CSS injection ────────────────────────────────────────────────
  function _injectAssetCss(shadowRoot, css) {
    var STYLE_ID = 'ha-asset-css';
    if (!shadowRoot) return;
    var el = shadowRoot.querySelector('#' + STYLE_ID);
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

  // ─── Renderers ────────────────────────────────────────────────────────────
  const Renderers = {
    svg(container, asset, params) {
      const tpl = (asset.template && (asset.template.inline || asset.template.svg))
               || asset.svg
               || (asset.render && asset.render.svg)
               || '';
      if (!tpl) {
        container.innerHTML = '<div class="asset-empty">Pas de template SVG</div>';
        return;
      }
      _injectAssetCss(container.getRootNode(), (asset.render && asset.render.css) || '');
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
      _injectAssetCss(container.getRootNode(), (asset.render && asset.render.css) || '');
      container.innerHTML = renderTemplate(tpl, params);
      const initSrc = asset.render && asset.render.canvas && asset.render.canvas.init;
      if (initSrc && typeof initSrc === 'string') {
        try {
          // eslint-disable-next-line no-new-func
          var fn = new Function('container', 'params', initSrc + ';\ninit(container, params);');
          fn(container, params);
        } catch (e) {
          console.warn('[hearst-asset] html init error:', e);
        }
      }
    },

    canvas(container, asset, params) {
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      // Sizing : remplit le container avec DPR pour rendu net. Si l'asset force
      // une taille via params/defaults, on l'utilise sinon on suit le container.
      const fixedW = params.width || asset.defaults?.width;
      const fixedH = params.height || asset.defaults?.height;
      const resizeCanvas = () => {
        const rect = container.getBoundingClientRect();
        const dpr = global.devicePixelRatio || 1;
        const cssW = fixedW || Math.max(1, rect.width || 300);
        const cssH = fixedH || Math.max(1, rect.height || 200);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        if (!fixedW) canvas.style.width = '100%'; else canvas.style.width = cssW + 'px';
        if (!fixedH) canvas.style.height = '100%'; else canvas.style.height = cssH + 'px';
        const ctx = canvas.getContext('2d');
        if (ctx && dpr !== 1) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resizeCanvas();
      // ResizeObserver : re-size quand le host change. Les boucles rAF du init
      // continuent à dessiner à chaque frame, donc voient automatiquement les
      // nouvelles dimensions. Pas besoin de re-init.
      if (typeof global.ResizeObserver !== 'undefined') {
        if (canvas.__ro) canvas.__ro.disconnect();
        canvas.__ro = new global.ResizeObserver(() => { if (canvas.__alive !== false) resizeCanvas(); });
        canvas.__ro.observe(container);
      }

      // initSrc declares `function init(canvas, params){...}`.
      // wrappedRAF is passed as parameter so all recursive rAF calls inside initSrc
      // use the wrapper — updates canvas.__rafHandle and no-ops once canvas.__alive === false.
      const initSrc = asset.render?.canvas?.init;
      if (initSrc && typeof initSrc === 'string') {
        try {
          canvas.__alive = true;
          const wrappedRAF = (cb) => {
            if (!canvas.__alive) return 0;
            const h = global.requestAnimationFrame(cb);
            canvas.__rafHandle = h;
            return h;
          };
          const wrappedCAF = (h) => global.cancelAnimationFrame(h);
          // eslint-disable-next-line no-new-func
          const fn = new Function('canvas', 'params', 'requestAnimationFrame', 'cancelAnimationFrame',
            initSrc + ';\ninit(canvas, params);');
          fn(canvas, params, wrappedRAF, wrappedCAF);
        } catch (e) {
          console.warn('[hearst-asset] canvas init error:', e);
          container.innerHTML = '<div class="asset-empty">Erreur rendu canvas</div>';
        }
      } else if (typeof initSrc === 'function') {
        try {
          initSrc(canvas, params);
        } catch (e) {
          container.innerHTML = '<div class="asset-empty">Erreur rendu canvas</div>';
        }
      } else {
        // Default: draw placeholder bar chart from data.segments
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
      // Delegate to <hearst-stream> sub-component
      container.innerHTML = '';
      const el = document.createElement('hearst-stream');
      el.setAttribute('asset-id', asset.id || '');
      if (params) el.data = params;
      container.appendChild(el);
    }
  };

  function _defaultCanvasRender(ctx, canvas, segments) {
    // Tokens Cockpit résolus à la volée sur :root (fallback safe hors DS).
    const cs = getComputedStyle(document.documentElement);
    const tok = (name, fb) => (cs.getPropertyValue(name).trim() || fb);
    const W = canvas.width, H = canvas.height;
    const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;
    const accent = tok('--ct-accent', '#BE123C');
    const accentStrong = tok('--ct-accent-strong', accent);
    const textStrong = tok('--ct-text-strong', '#ffffff');
    const bg = tok('--ct-bg-deep', '#1A050B');
    const colors = [accent, accentStrong, textStrong];
    const barW = Math.floor(W / segments.length) - 6;
    const maxH = H - 40;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    segments.forEach((seg, i) => {
      const barH = Math.round((seg.value / total) * maxH);
      const x = i * (barW + 6) + 3;
      const y = H - barH - 20;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = textStrong;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(seg.label || '', x + barW / 2, H - 4);
    });
  }

  // ─── Web Component ────────────────────────────────────────────────────────
  class HearstAsset extends HTMLElement {
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
          :host { display: block; width: 100%; height: 100%; font-family: inherit; }
          /* Container : remplit l'hôte. Les enfants HTML prennent 100% largeur
             (correctif pour les blocs flex sans width:100% qui collapsaient avec
             align-items:center, ex .dashed-list, .kpi-segmented). La hauteur
             reste naturelle — les assets compacts ne sont pas étirés. */
          .asset-root { width: 100%; height: 100%; display: block; overflow: hidden; }
          /* Enfants HTML : 100% largeur, hauteur libre (sauf si l'asset a déclaré
             height:100% lui-même via son CSS injecté, ex .chart-wrapper). */
          .asset-root > *:not(svg):not(canvas) { width: 100%; min-width: 0; }
          /* SVG : remplit largeur ET hauteur, preserveAspectRatio="xMidYMid meet"
             (défaut) garde le ratio intrinsèque du viewBox et centre dans la cellule. */
          .asset-root > svg { width: 100%; height: 100%; display: block; }
          /* Canvas : remplit l'hôte (sizing DPR géré dans le renderer canvas). */
          .asset-root > canvas { width: 100%; height: 100%; display: block; }
          /* États utilitaires : tokens Cockpit avec fallbacks safe pour usage hors design system. */
          .asset-error { color: var(--ct-danger, #ef4444); padding: 8px; font-size: 13px; border: 1px solid var(--ct-danger, #ef4444); border-radius: 4px; }
          .asset-empty { color: var(--ct-text-muted, rgba(245,245,245,0.48)); padding: 8px; font-size: 13px; font-style: italic; }
          .asset-placeholder { color: var(--ct-text-muted, rgba(245,245,245,0.48)); padding: 8px; font-size: 13px; border: 1px dashed var(--ct-border, rgba(255,255,255,0.10)); border-radius: 4px; }
          .asset-loading { color: var(--ct-text-muted, rgba(245,245,245,0.48)); padding: 8px; font-size: 12px; }
        </style>
        <div class="asset-root"></div>
      `;
    }

    get container() {
      return this.shadowRoot.querySelector('.asset-root');
    }

    // data property (JS-settable)
    get data() { return this._data; }
    set data(val) {
      this._data = val;
      this._render();
    }

    connectedCallback() {
      this._load();
    }

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
        // Skip si pas encore attaché — connectedCallback s'en charge.
        // Sinon on fetch deux fois (une via attributeChangedCallback à l'upgrade,
        // une via connectedCallback à l'insertion).
        if (this.isConnected) this._load();
      } else if (name === 'width' || name === 'height') {
        if (this._asset) this._render();
      }
    }

    _catalogBase() {
      return this.getAttribute('catalog-base') ||
             (typeof global.HEARST_CATALOG_BASE !== 'undefined' ? global.HEARST_CATALOG_BASE : './catalog/');
    }

    async _load() {
      const assetId = this.getAttribute('id');
      if (!assetId) return;

      // Parse data attribute if present
      const dataAttr = this.getAttribute('data');
      if (dataAttr && !this._data) {
        try { this._data = JSON.parse(dataAttr); } catch { /* ignore */ }
      }

      this._cleanupCanvasAnimations();
      this.container.innerHTML = '<div class="asset-loading">Chargement…</div>';

      // Sequence token — invalidates concurrent fetches.
      const seq = ++this._loadSeq;

      const base = this._catalogBase().replace(/\/?$/, '/');
      const path = idToPath(assetId);
      const url = base + path;

      try {
        // 'no-cache' = conditional fetch (If-Modified-Since). Évite que les
        // modifs de catalog/*.asset.json en dev soient masquées par le HTTP cache
        // sans pour autant refetch systématiquement quand le fichier n'a pas changé.
        const resp = await fetch(url, { cache: 'no-cache' });
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
        console.warn(`[hearst-asset] fetch failed for "${assetId}" (${url}):`, err.message);
        this.container.innerHTML = `<div class="asset-error">Asset introuvable: ${assetId}</div>`;
        this._emit('asset-error', { id: assetId, error: err.message });
      }
    }

    _render() {
      if (!this._asset) return;
      this._cleanupCanvasAnimations();
      const asset = this._asset;
      const params = this._buildParams(asset);

      // Only show "Pas de données" when the asset declares params but none are provided.
      // Assets without a params schema are self-sufficient and render with an empty merged object.
      const declaredParams = asset.params && Object.keys(asset.params).length > 0;
      const noProvidedData = !params || Object.keys(params).length === 0;
      if (declaredParams && noProvidedData) {
        this.container.innerHTML = '<div class="asset-empty">Pas de données</div>';
        return;
      }

      const kind = asset.kind || 'html';
      const renderer = Renderers[kind] || Renderers.html;

      try {
        if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
        renderer(this.container, asset, params);
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
      // Merge asset defaults with user-provided data.
      // Support both asset.defaults (flat map) and asset.params (JSON-schema with .default per key).
      // Shallow-clone to avoid mutating asset.defaults in-memory.
      const defaults = Object.assign({}, asset.defaults || {});
      if (asset.params && typeof asset.params === 'object') {
        for (const [k, schema] of Object.entries(asset.params)) {
          if (!(k in defaults) && 'default' in schema) defaults[k] = schema.default;
        }
      }
      const userdata = this._data || {};
      const w = this.getAttribute('width');
      const h = this.getAttribute('height');
      const merged = Object.assign({}, defaults, userdata);
      if (w) merged.width = Number(w);
      if (h) merged.height = Number(h);
      return merged;
    }

    _emit(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
    }
  }

  // ─── Register ─────────────────────────────────────────────────────────────
  if (!customElements.get('hearst-asset')) {
    customElements.define('hearst-asset', HearstAsset);
  }

  global.HearstAsset = HearstAsset;

})(typeof window !== 'undefined' ? window : globalThis);

/*
 * ─── Usage examples (inline comment) ────────────────────────────────────────
 *
 * <!-- SVG asset -->
 * <hearst-asset id="chart:progress-circle"
 *   data='{"title":"Portfolio","percent":68,"label":"Allocation"}'
 * ></hearst-asset>
 *
 * <!-- HTML asset -->
 * <hearst-asset id="kpi:value-trend" data='{"title":"MRR","value":"$42K","delta":"+18%","direction":"up","context":"vs. mois dernier"}'></hearst-asset>
 *
 * <!-- Canvas asset -->
 * <hearst-asset id="viz:particle-swarm"
 *   data='{"title":"Quantum Swarm","particles":60,"linkDistance":50,"speed":1.0}'
 * ></hearst-asset>
 *
 * <!-- JS property -->
 * document.querySelector('hearst-asset').data = { value: 99 };
 *
 * <!-- Events -->
 * el.addEventListener('asset-ready', e => console.log('ready', e.detail));
 * el.addEventListener('asset-error', e => console.error('error', e.detail));
 */
