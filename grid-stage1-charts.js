// Grid sweep, stage 1 (grid-stage1.html): chart primitives. Pure drawing, no data loading.
// window.GSCharts = {heatmap, bars, forest, scatter, color, fmt}. Each chart function takes a container element and a
// plain spec, owns the container's contents, redraws itself when the container's width changes (it waits for a
// nonzero width, so charts inside hidden tabs draw when shown) and returns {update(spec), destroy()}. Calling it again
// on the same element replaces the previous chart. Output is inline SVG sized in CSS pixels (text stays readable at
// any width), with one shared tooltip shown on hover, tap and keyboard focus. Colours use study.css variables.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const MINUS = '\u2212';
  const C = {
    ink: 'var(--ink, #242f32)', muted: 'var(--muted, #596969)', line: 'var(--line, #dce1da)',
    teal: 'var(--teal, #176a60)', blue: 'var(--blue, #27679b)', orange: 'var(--orange, #ae5a22)',
    wash: 'var(--wash, #f3f5ef)', paper: 'var(--paper, #fffefa)', grid: '#e9ece6', zero: '#8d9a98',
  };
  // Colour-blind-safe diverging ramp (blue = below the control, orange = above), after ColorBrewer PuOr/RdBu.
  const RAMP = [[-1, [24, 84, 145]], [-0.5, [125, 172, 214]], [0, [246, 245, 240]], [0.5, [239, 161, 96]], [1, [158, 69, 10]]];
  // Bar fills by kind; 'control' and 'random' are neutral greys.
  const KIND = {
    base: '#5f7e95', control: '#9aa5a1', random: '#c3cac6', steered: '#176a60', belief: '#27679b', harm: '#ae5a22',
  };
  const CYCLE = ['#176a60', '#27679b', '#ae5a22', '#7a5c99', '#5d7d2e', '#6b7a7a'];

  // ---------- styles (injected once; study.css tokens with fallbacks) ----------
  const CSS = `
.gs1c { position: relative; font-family: ${FONT}; color: ${C.ink}; line-height: 1.4; }
.gs1c svg { display: block; overflow: visible; font-family: ${FONT}; -webkit-tap-highlight-color: transparent; }
.gs1c svg text { font-family: ${FONT}; }
.gs1c [data-gs1c-tip] { cursor: pointer; outline: none; }
.gs1c .gs1c-ring { fill: none; stroke: none; pointer-events: none; }
.gs1c [data-gs1c-tip]:hover .gs1c-ring { stroke: ${C.ink}; stroke-width: 1.5; }
.gs1c [data-gs1c-tip]:focus-visible .gs1c-ring { stroke: ${C.ink}; stroke-width: 2.5; stroke-dasharray: 3 2; }
.gs1c .gs1c-rowlab.hl, .gs1c .gs1c-collab.hl { font-weight: 700; fill: ${C.ink}; }
.gs1c .gs1c-collab.link { cursor: pointer; text-decoration: underline; text-decoration-color: #b9c3bf; }
.gs1c .gs1c-collab.link:hover, .gs1c .gs1c-collab.link:focus-visible { fill: ${C.teal}; outline: none; }
.gs1c-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin: 8px 0 0; font: 12px/1.4 ${FONT}; color: ${C.muted}; }
.gs1c-legend .gs1c-it { display: inline-flex; align-items: center; gap: 6px; }
.gs1c-legend .gs1c-note { flex: 1 1 100%; }
.gs1c-legend .gs1c-sw { display: inline-block; width: 16px; height: 12px; border-radius: 2px; flex: none; }
.gs1c-legend .gs1c-sw.gs1c-sig { width: 16px; height: 14px; background: #f6f5f0; box-shadow: inset 0 0 0 2px ${C.ink}, inset 0 0 0 3px #fff; }
.gs1c-legend .gs1c-sw.gs1c-na { background: repeating-linear-gradient(135deg, #e3e6e0 0 3px, #cdd2cb 3px 4.5px); }
.gs1c-legend .gs1c-sw.gs1c-ci { width: 18px; height: 2px; background: ${C.ink}; border-radius: 0; }
.gs1c-legend .gs1c-sw.gs1c-ref { width: 18px; height: 0; border-top: 2px dashed ${C.ink}; border-radius: 0; }
.gs1c-legend .gs1c-ramp { display: inline-grid; grid-template-columns: auto auto auto; align-items: center; column-gap: 6px; }
.gs1c-legend .gs1c-ramp-title { grid-column: 1 / -1; color: ${C.ink}; font-weight: 600; }
.gs1c-legend .gs1c-ramp-bar { position: relative; width: 150px; height: 10px; border-radius: 2px; margin-bottom: 14px; }
.gs1c-legend .gs1c-ramp-tk { position: absolute; top: 11px; transform: translateX(-50%); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gs1c-legend .gs1c-ramp-end { font-size: 11px; margin-bottom: 14px; white-space: nowrap; }
.gs1c-legend .gs1c-mk { font-size: 14px; line-height: 1; }
.gs1c-error { padding: 10px; background: #fbf3e8; color: #8a4a17; font: 13px ${FONT}; }
.gs1c-tip { position: fixed; z-index: 1000; left: 0; top: 0; max-width: min(320px, calc(100vw - 16px)); padding: 8px 10px; background: #242f32; color: #fff; border-radius: 4px; font: 12px/1.5 ${FONT}; pointer-events: none; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
.gs1c-tip[hidden] { display: none; }
.gs1c-tip .gs1c-tip-h { font-weight: 700; margin-bottom: 2px; }
.gs1c-tip .gs1c-tip-l { white-space: pre-wrap; font-variant-numeric: tabular-nums; }
`;
  function injectStyle() {
    if (document.getElementById('gs1c-style')) return;
    const st = document.createElement('style');
    st.id = 'gs1c-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- small helpers ----------
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let uid = 0;
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, parent, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  let ctx = null;
  function textW(s, size, weight) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${weight || 400} ${size}px ${FONT}`;
    return ctx.measureText(String(s)).width;
  }
  function ellipsize(s, maxW, size, weight) {
    s = String(s);
    if (textW(s, size, weight) <= maxW) return s;
    while (s.length > 1 && textW(s + '…', size, weight) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  // Word-wrap to at most maxLines lines of width maxW; returns {lines, cut}.
  function wrap(s, maxW, size, weight, maxLines) {
    const words = String(s).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (!line || textW(t, size, weight) <= maxW) line = t;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    let cut = false;
    if (lines.length > maxLines) {
      cut = true;
      lines.length = maxLines;
      lines[maxLines - 1] = ellipsize(lines[maxLines - 1] + '…', maxW, size, weight);
    }
    for (let i = 0; i < lines.length; i++) {
      const e = ellipsize(lines[i], maxW, size, weight);
      if (e !== lines[i]) { cut = true; lines[i] = e; }
    }
    return {lines: lines.length ? lines : [''], cut};
  }
  function unitSuffix(unit) {
    if (!unit) return '';
    if (unit === '%') return '%';
    if (unit === 'points' || unit === 'pts' || unit === 'pt') return ' pts';
    return ' ' + unit;
  }
  // Number formatting: fmt(v, {unit, signed, digits}). Uses a true minus sign.
  function fmt(v, o) {
    o = o || {};
    if (!finite(v)) return '–';
    const d = o.digits !== undefined ? o.digits : (Math.abs(v) < 10 && Math.round(v) !== v ? 1 : 0);
    let s = Math.abs(v).toFixed(d);
    if (Number(s) === 0) s = (0).toFixed(d);
    const sign = Number(s) === 0 ? '' : v < 0 ? MINUS : o.signed ? '+' : '';
    return sign + s + (o.unit ? unitSuffix(o.unit) : '');
  }
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) hi = lo + 1;
    const step0 = (hi - lo) / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const e = step0 / mag;
    const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
    const out = [];
    for (let v = a; v <= b + step * 1e-6; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }
  // Diverging colour for a value given the symmetric limit L.
  function color(value, L) {
    if (!finite(value)) return '#e3e6e0';
    let t = clamp(value / (L || 1), -1, 1);
    t = Math.sign(t) * Math.pow(Math.abs(t), 0.85);
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
        const f = (t - t0) / (t1 - t0);
        return 'rgb(' + c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',') + ')';
      }
    }
    return 'rgb(' + RAMP[RAMP.length - 1][1].join(',') + ')';
  }
  const darkFill = (value, L) => finite(value) && Math.abs(value / (L || 1)) > 0.55;
  const keyOf = x => (x && typeof x === 'object') ? String(x.key !== undefined ? x.key : x.label) : String(x);
  const norm = list => (list || []).map(x => (x && typeof x === 'object')
    ? {key: keyOf(x), label: String(x.label !== undefined ? x.label : x.key)} : {key: String(x), label: String(x)});
  const tipLines = t => t === undefined || t === null || t === '' ? [] : Array.isArray(t) ? t.map(String) : String(t).split('\n');

  // ---------- shared tooltip ----------
  const Tip = {
    box: null, node: null, pinned: false,
    ensure() {
      if (this.box) return this.box;
      const b = html('div', 'gs1c-tip', document.body);
      b.setAttribute('role', 'tooltip');
      b.id = 'gs1c-tip';
      b.hidden = true;
      this.box = b;
      document.addEventListener('pointerdown', e => {
        if (this.node && !this.node.contains(e.target)) this.hide(true);
      }, true);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(true); });
      window.addEventListener('scroll', () => { if (this.pinned) this.place(); else this.hide(true); }, {passive: true, capture: true});
      window.addEventListener('resize', () => this.hide(true));
      return b;
    },
    show(node, header, lines, at, pin) {
      const b = this.ensure();
      b.textContent = '';
      if (header) html('div', 'gs1c-tip-h', b, header);
      for (const l of lines) html('div', 'gs1c-tip-l', b, l);
      b.hidden = false;
      this.node = node;
      this.pinned = !!pin;
      this.at = at || null;
      this.place();
    },
    place() {
      const b = this.box;
      if (!b || b.hidden || !this.node) return;
      let x, yTop, yBot;
      if (this.at) { x = this.at.x; yTop = this.at.y - 14; yBot = this.at.y + 18; }
      else {
        const r = this.node.getBoundingClientRect();
        x = r.left + r.width / 2; yTop = r.top - 6; yBot = r.bottom + 6;
      }
      const w = b.offsetWidth, h = b.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const left = clamp(x - w / 2, 8, Math.max(8, vw - w - 8));
      const top = yTop - h >= 4 ? yTop - h : Math.min(yBot, Math.max(4, vh - h - 4));
      b.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hide(force) {
      if (!this.box || (this.pinned && !force)) return;
      this.box.hidden = true;
      if (this.node && this.node.__gs1cLeave) this.node.__gs1cLeave();
      this.node = null;
      this.pinned = false;
    },
  };
  // Attach hover/tap/focus tooltip behaviour. get() -> {header, lines}; opts.activate (click/Enter) and
  // opts.enter/leave (highlight hooks) are optional. Touch: first tap shows the tip, a second tap activates.
  function bindTip(node, get, opts) {
    opts = opts || {};
    node.setAttribute('data-gs1c-tip', '');
    let ptype = 'mouse';
    const showAt = (at, pin) => {
      const {header, lines} = get();
      Tip.show(node, header, lines, at, pin);
      if (opts.enter) opts.enter();
      node.__gs1cLeave = opts.leave || null;
    };
    node.addEventListener('pointerdown', e => { ptype = e.pointerType || 'mouse'; });
    node.addEventListener('pointerenter', e => {
      if (e.pointerType === 'touch' || Tip.pinned) return;
      showAt({x: e.clientX, y: e.clientY}, false);
    });
    node.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || Tip.pinned) return;
      if (Tip.node !== node) { showAt({x: e.clientX, y: e.clientY}, false); return; }
      Tip.at = {x: e.clientX, y: e.clientY};
      Tip.place();
    });
    node.addEventListener('pointerleave', e => {
      if (e.pointerType === 'touch' || Tip.node !== node) return;
      Tip.hide(false);
    });
    node.addEventListener('click', () => {
      const shownHere = Tip.node === node && !Tip.box.hidden;
      if (opts.activate && (ptype !== 'touch' || (shownHere && Tip.pinned))) { Tip.hide(true); opts.activate(); return; }
      if (shownHere && Tip.pinned) { Tip.hide(true); return; }
      showAt(null, true);
    });
    node.addEventListener('focus', () => { if (Tip.node !== node) showAt(null, false); });
    node.addEventListener('blur', () => { if (Tip.node === node) Tip.hide(true); });
    node.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && opts.activate) { e.preventDefault(); Tip.hide(true); opts.activate(); }
    });
  }

  // ---------- mounting / responsive redraw ----------
  function mount(container, spec, draw) {
    if (!container || !container.appendChild) throw new Error('GSCharts: container element required');
    injectStyle();
    if (container.__gs1c) container.__gs1c.destroy();
    let cur = spec || {}, lastW = -1, raf = 0;
    const render = () => {
      raf = 0;
      const w = Math.floor(container.clientWidth);
      if (w <= 0 || w === lastW) return;
      lastW = w;
      if (Tip.node && container.contains(Tip.node)) Tip.hide(true);
      container.textContent = '';
      const root = html('div', 'gs1c', container);
      try { draw(root, cur, w); } catch (err) {
        root.textContent = '';
        html('div', 'gs1c-error', root, 'Chart could not be drawn: ' + err.message);
        console.error(err);
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(schedule); ro.observe(container); }
    else window.addEventListener('resize', schedule);
    render();
    const handle = {
      update(s) { cur = s || {}; lastW = -1; render(); },
      destroy() {
        if (ro) ro.disconnect(); else window.removeEventListener('resize', schedule);
        if (raf) cancelAnimationFrame(raf);
        if (Tip.node && container.contains(Tip.node)) Tip.hide(true);
        if (container.__gs1c === handle) container.__gs1c = null;
      },
    };
    container.__gs1c = handle;
    return handle;
  }
  function svgRoot(root, W, H, label) {
    const svg = el('svg', {width: W, height: Math.ceil(H), viewBox: `0 0 ${W} ${Math.ceil(H)}`, role: 'group'}, root);
    if (label) svg.setAttribute('aria-label', label);
    return svg;
  }
  function legendItem(box, swCls, text, swStyle) {
    const it = html('span', 'gs1c-it', box);
    const sw = html('span', 'gs1c-sw' + (swCls ? ' gs1c-' + swCls : ''), it);
    if (swStyle) sw.style.cssText = swStyle;
    html('span', '', it, text);
    return it;
  }
  function addNote(box, note) { if (note) html('span', 'gs1c-note', box, note); }
  function axisX(svg, ticks, X, y, y0, unit, fs, title, xMid) {
    for (const t of ticks) {
      el('line', {x1: X(t), x2: X(t), y1: y0, y2: y, stroke: t === 0 ? C.zero : C.grid, 'stroke-width': t === 0 ? 1.2 : 1}, svg);
      el('text', {x: X(t), y: y + fs + 3, 'text-anchor': 'middle', 'font-size': fs - 1, fill: C.muted}, svg, fmt(t, {}) + (unit === '%' ? '%' : ''));
    }
    if (title) el('text', {x: xMid, y: y + 2 * fs + 10, 'text-anchor': 'middle', 'font-size': fs - 1, fill: C.muted}, svg, title);
  }

  // ---------- heatmap ----------
  // spec: {rows:[{key,label}], cols:[{key,label}], cells:[{row, col, value, sig, na, tip}], rowGroups:[{label, rows:[keys]}],
  //        scale:{min, max, unit}, legend: string | {title, low, high, sig, na, note} | false,
  //        onCol(colKey), onCell(cell), showValues (default: when cells are at least 34 px wide), maxCellWidth (120), title}
  function drawHeatmap(root, s, W) {
    const narrow = W < 560, fs = narrow ? 11 : 12;
    const rows = norm(s.rows), cols = norm(s.cols);
    const unit = (s.scale && s.scale.unit) || 'points';
    const cellMap = new Map();
    for (const c of s.cells || []) cellMap.set(keyOf(c.row) + '\u0001' + keyOf(c.col), c);
    let L = s.scale ? Math.max(Math.abs(s.scale.min || 0), Math.abs(s.scale.max || 0)) : 0;
    if (!(L > 0)) {
      L = 0;
      for (const c of cellMap.values()) if (finite(c.value) && !c.na) L = Math.max(L, Math.abs(c.value));
      L = L > 0 ? niceTicks(0, L, 4).slice(-1)[0] : 10;
    }
    // Row order: groups first (in their order), then any rows not in a group.
    const rowBy = new Map(rows.map(r => [r.key, r]));
    const layout = [];
    const used = new Set();
    for (const g of s.rowGroups || []) {
      const members = (g.rows || []).map(keyOf).filter(k => rowBy.has(k) && !used.has(k));
      if (!members.length) continue;
      layout.push({group: g.label});
      for (const k of members) { used.add(k); layout.push({row: rowBy.get(k)}); }
    }
    const rest = rows.filter(r => !used.has(r.key));
    if (rest.length && layout.length) layout.push({group: 'Other'});
    for (const r of rest) layout.push({row: r});

    // Widths.
    const maxLab = Math.max(40, ...rows.map(r => textW(r.label, fs, 500)));
    const labelW = Math.round(Math.min(maxLab + 14, narrow ? Math.max(104, W * 0.36) : Math.min(270, W * 0.3)));
    const maxCell = s.maxCellWidth || 120;
    let cellW = clamp((W - labelW - 2) / Math.max(1, cols.length), 12, maxCell);
    // Column header: horizontal (wrapped, 2 lines) if it fits, else rotated (-45 on wide, -90 on narrow).
    const lh = fs + 3;
    let headMode = 'h', colWraps = cols.map(c => wrap(c.label, cellW - 6, fs, 600, 2));
    if (colWraps.some(w => w.cut)) headMode = narrow ? 'v' : 'd';
    let headH, rightPad = 0;
    const maxColTxt = narrow ? 150 : 170;
    const colTxt = cols.map(c => ellipsize(c.label, maxColTxt, fs, 600));
    if (headMode === 'h') headH = Math.max(...colWraps.map(w => w.lines.length)) * lh + 8;
    else {
      const ws = colTxt.map(t => textW(t, fs, 600));
      if (headMode === 'd') {
        const k = Math.SQRT1_2;
        // Rotated labels lean right; shrink cells so the last ones stay inside the width.
        for (let pass = 0; pass < 2; pass++) {
          rightPad = Math.max(0, ...ws.map((w, i) => w * k - (cols.length - 1 - i) * cellW - cellW / 2 + 4));
          cellW = clamp((W - labelW - 2 - rightPad) / Math.max(1, cols.length), 12, maxCell);
        }
        headH = Math.max(...ws) * k + fs + 8;
      } else headH = Math.max(...ws) + 10;
    }
    const gridX = labelW;
    const showVals = s.showValues === undefined ? cellW >= 34 : !!s.showValues && cellW >= 22;
    const baseH = narrow ? 24 : 28, groupH = narrow ? 22 : 26;
    const rowWraps = new Map(rows.map(r => [r.key, wrap(r.label, labelW - 12, fs, 500, 2)]));
    let H = headH + 4;
    for (const it of layout) H += it.group ? groupH : Math.max(baseH, rowWraps.get(it.row.key).lines.length * lh + 7);

    const svg = svgRoot(root, W, H + 2, s.title || 'Heat map');
    const hatchId = 'gs1c-hatch-' + (++uid);
    const defs = el('defs', null, svg);
    const pat = el('pattern', {id: hatchId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'}, defs);
    el('rect', {width: 6, height: 6, fill: '#e3e6e0'}, pat);
    el('line', {x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#c9cec7', 'stroke-width': 2.5}, pat);

    // Column labels.
    const colEls = [];
    cols.forEach((c, ci) => {
      const cx = gridX + ci * cellW + cellW / 2;
      let t;
      if (headMode === 'h') {
        const lines = colWraps[ci].lines;
        t = el('text', {x: cx, y: headH - 6 - (lines.length - 1) * lh, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 600, fill: C.ink, class: 'gs1c-collab'}, svg);
        lines.forEach((ln, i) => el('tspan', {x: cx, dy: i ? lh : 0}, t, ln));
      } else {
        const rot = headMode === 'd' ? -45 : -90;
        t = el('text', {x: cx + (headMode === 'v' ? fs / 3 : 0), y: headH - 6, transform: `rotate(${rot} ${cx + (headMode === 'v' ? fs / 3 : 0)} ${headH - 6})`, 'font-size': fs, 'font-weight': 600, fill: C.ink, class: 'gs1c-collab'}, svg, colTxt[ci]);
      }
      if (colTxt[ci] !== c.label || colWraps[ci].cut && headMode === 'h') el('title', null, t, c.label);
      if (s.onCol) {
        t.classList.add('link');
        t.setAttribute('tabindex', '0');
        t.setAttribute('role', 'link');
        t.setAttribute('aria-label', c.label);
        const go = () => s.onCol(c.key);
        t.addEventListener('click', go);
        t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      }
      colEls.push(t);
    });

    // Rows and cells.
    const legendCfg = typeof s.legend === 'string' ? {title: s.legend} : (s.legend || {});
    const sigText = legendCfg.sig || 'Significant';
    let y = headH + 4;
    const grid = []; // grid[ri][ci] = cell group, for arrow-key navigation
    let first = true;
    for (const it of layout) {
      if (it.group) {
        if (!first) el('line', {x1: 0, x2: gridX + cols.length * cellW, y1: y + 3, y2: y + 3, stroke: C.line}, svg);
        el('text', {x: 0, y: y + groupH - 8, 'font-size': fs - 1, 'font-weight': 700, fill: C.teal, 'letter-spacing': '.06em'}, svg, String(it.group).toUpperCase());
        y += groupH;
        first = false;
        continue;
      }
      first = false;
      const r = it.row, wr = rowWraps.get(r.key);
      const h = Math.max(baseH, wr.lines.length * lh + 7);
      const lab = el('text', {x: labelW - 8, y: y + h / 2 - (wr.lines.length - 1) * lh / 2 + fs * 0.36, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 500, fill: C.ink, class: 'gs1c-rowlab'}, svg);
      wr.lines.forEach((ln, i) => el('tspan', {x: labelW - 8, dy: i ? lh : 0}, lab, ln));
      if (wr.cut) el('title', null, lab, r.label);
      const rowCells = [];
      cols.forEach((c, ci) => {
        const cell = cellMap.get(r.key + '\u0001' + c.key) || {row: r.key, col: c.key, na: true};
        const na = !!cell.na || !finite(cell.value);
        const x = gridX + ci * cellW;
        const g = el('g', {tabindex: grid.length === 0 && ci === 0 ? 0 : -1, role: s.onCell ? 'button' : 'img'}, svg);
        el('rect', {x: x + 1, y: y + 1, width: cellW - 2, height: h - 2, rx: 2, fill: na ? `url(#${hatchId})` : color(cell.value, L)}, g);
        if (!na && cell.sig) {
          el('rect', {x: x + 2, y: y + 2, width: cellW - 4, height: h - 4, rx: 1.5, fill: 'none', stroke: C.ink, 'stroke-width': 2}, g);
          el('rect', {x: x + 3.5, y: y + 3.5, width: cellW - 7, height: h - 7, rx: 1, fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.9}, g);
        }
        if (!na && showVals) {
          el('text', {x: x + cellW / 2, y: y + h / 2 + fs * 0.36, 'text-anchor': 'middle', 'font-size': fs - 0.5, 'font-weight': cell.sig ? 700 : 500,
            fill: darkFill(cell.value, L) ? '#fff' : C.ink, 'font-variant-numeric': 'tabular-nums', 'pointer-events': 'none'}, g, fmt(cell.value, {signed: true, digits: 0}));
        }
        el('rect', {x: x + 0.5, y: y + 0.5, width: cellW - 1, height: h - 1, rx: 2, class: 'gs1c-ring'}, g);
        const header = `${r.label} · ${c.label}`;
        const lines = () => {
          const t = tipLines(cell.tip);
          if (t.length) return t;
          if (na) return ['Not run'];
          return [`Difference: ${fmt(cell.value, {signed: true, unit, digits: 1})}`].concat(cell.sig ? [sigText] : []);
        };
        g.setAttribute('aria-label', header + '. ' + (na && !tipLines(cell.tip).length ? 'Not run' : lines().join('. ')));
        bindTip(g, () => ({header, lines: lines()}), {
          activate: s.onCell ? () => s.onCell(cell) : null,
          enter: () => { lab.classList.add('hl'); colEls[ci].classList.add('hl'); },
          leave: () => { lab.classList.remove('hl'); colEls[ci].classList.remove('hl'); },
        });
        rowCells.push(g);
      });
      grid.push(rowCells);
      y += h;
    }
    // Roving focus: one tab stop, arrow keys move between cells.
    grid.forEach((rc, ri) => rc.forEach((g, ci) => g.addEventListener('keydown', e => {
      const mv = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -ci], End: [0, rc.length - 1 - ci]}[e.key];
      if (!mv) return;
      e.preventDefault();
      const nr = clamp(ri + mv[0], 0, grid.length - 1), nc = clamp(ci + mv[1], 0, grid[nr].length - 1);
      const n = grid[nr][nc];
      g.setAttribute('tabindex', -1);
      n.setAttribute('tabindex', 0);
      n.focus();
    })));

    if (s.legend !== false) {
      const box = html('div', 'gs1c-legend', root);
      const ramp = html('span', 'gs1c-ramp', box);
      html('span', 'gs1c-ramp-title', ramp, legendCfg.title || `Difference from control (${unit})`);
      html('span', 'gs1c-ramp-end', ramp, legendCfg.low ? '← ' + legendCfg.low : '');
      const bar = html('span', 'gs1c-ramp-bar', ramp);
      const stops = [];
      for (let i = 0; i <= 10; i++) { const v = -L + (2 * L * i) / 10; stops.push(`${color(v, L)} ${i * 10}%`); }
      bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
      for (const [v, p] of [[-L, 0], [0, 50], [L, 100]]) {
        const tk = html('span', 'gs1c-ramp-tk', bar, fmt(v, {signed: true, digits: 0}));
        tk.style.left = p + '%';
      }
      html('span', 'gs1c-ramp-end', ramp, legendCfg.high ? legendCfg.high + ' →' : '');
      legendItem(box, 'sig', sigText);
      legendItem(box, 'na', legendCfg.na || 'Not run');
      addNote(box, legendCfg.note);
    }
  }

  // ---------- horizontal bars ----------
  // spec: {items:[{label, value, lo, hi, kind, color, sig, tip}], unit, refLine: number | {value, label},
  //        min, max, legend: {interval, ref, kinds:{kind: label}, note} | false, title}
  function drawBars(root, s, W) {
    const narrow = W < 560, fs = narrow ? 11 : 12;
    const items = s.items || [];
    const unit = s.unit || '';
    const ref = finite(s.refLine) ? {value: s.refLine} : (s.refLine && finite(s.refLine.value) ? s.refLine : null);
    const vals = [0];
    for (const it of items) for (const v of [it.value, it.lo, it.hi]) if (finite(v)) vals.push(v);
    if (ref) vals.push(ref.value);
    const lo0 = finite(s.min) ? s.min : Math.min(...vals), hi0 = finite(s.max) ? s.max : Math.max(...vals);
    const ticks = niceTicks(lo0, hi0, narrow ? 4 : 6).filter(t => (!finite(s.min) || t >= s.min - 1e-9) && (!finite(s.max) || t <= s.max + 1e-9));
    const dmin = finite(s.min) ? s.min : ticks[0], dmax = finite(s.max) ? s.max : ticks[ticks.length - 1];
    const vfmt = v => fmt(v, {unit: unit === '%' ? '%' : '', digits: unit === '%' ? 0 : 1, signed: unit !== '%' && dmin < 0});
    const valW = Math.max(30, ...items.map(it => textW(vfmt(it.value), fs, 600))) + 10;
    const maxLab = Math.max(30, ...items.map(it => textW(it.label, fs, 500)));
    const labelW = Math.round(Math.min(maxLab + 12, narrow ? W * 0.44 : Math.min(300, W * 0.38)));
    const x0 = labelW, x1 = W - valW;
    const X = v => x0 + (clamp(v, dmin, dmax) - dmin) / (dmax - dmin || 1) * (x1 - x0);
    const lh = fs + 3, barH = narrow ? 14 : 16;
    const wraps = items.map(it => wrap(it.label, labelW - 10, fs, 500, 2));
    const top = ref && ref.label ? fs + 8 : 4;
    let H = top;
    const hs = wraps.map(w => Math.max(narrow ? 26 : 30, w.lines.length * lh + 8));
    H += hs.reduce((a, b) => a + b, 0);
    const plotBottom = H;
    const svg = svgRoot(root, W, H + fs + 8, s.title || 'Bar chart');
    const kindIdx = new Map();
    const fillOf = it => it.color || KIND[it.kind] || (it.kind ? (kindIdx.has(it.kind) || kindIdx.set(it.kind, CYCLE[kindIdx.size % CYCLE.length]), kindIdx.get(it.kind)) : C.teal);
    axisX(svg, ticks.filter(t => t >= dmin - 1e-9 && t <= dmax + 1e-9), X, plotBottom, top, unit, fs);
    let y = top;
    items.forEach((it, i) => {
      const h = hs[i], cy = y + h / 2, w = wraps[i];
      const lab = el('text', {x: labelW - 8, y: cy - (w.lines.length - 1) * lh / 2 + fs * 0.36, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 500, fill: C.ink}, svg);
      w.lines.forEach((ln, k) => el('tspan', {x: labelW - 8, dy: k ? lh : 0}, lab, ln));
      if (w.cut) el('title', null, lab, it.label);
      const g = el('g', {tabindex: 0, role: 'img'}, svg);
      const base = X(clamp(0, dmin, dmax));
      if (finite(it.value)) {
        const xv = X(it.value);
        el('rect', {x: Math.min(base, xv), y: cy - barH / 2, width: Math.max(1, Math.abs(xv - base)), height: barH, rx: 1.5, fill: fillOf(it)}, g);
        if (it.sig) el('rect', {x: Math.min(base, xv) + 1, y: cy - barH / 2 + 1, width: Math.max(1, Math.abs(xv - base) - 2), height: barH - 2, fill: 'none', stroke: C.ink, 'stroke-width': 2}, g);
      }
      if (finite(it.lo) && finite(it.hi)) {
        const a = X(it.lo), b = X(it.hi);
        el('line', {x1: a, x2: b, y1: cy, y2: cy, stroke: '#fff', 'stroke-width': 4, 'stroke-opacity': 0.7}, g);
        el('line', {x1: a, x2: b, y1: cy, y2: cy, stroke: C.ink, 'stroke-width': 1.5}, g);
        for (const xx of [a, b]) el('line', {x1: xx, x2: xx, y1: cy - 5, y2: cy + 5, stroke: C.ink, 'stroke-width': 1.5}, g);
      }
      const end = Math.max(base, finite(it.value) ? X(it.value) : base, finite(it.hi) ? X(it.hi) : base);
      el('text', {x: end + 5, y: cy + fs * 0.36, 'font-size': fs, 'font-weight': 600, fill: C.ink, 'font-variant-numeric': 'tabular-nums'}, g, finite(it.value) ? vfmt(it.value) : 'not run');
      el('rect', {x: x0 - 4, y: y + 1, width: W - x0 + 4, height: h - 2, fill: 'transparent', class: 'gs1c-ring'}, g);
      const lines = () => {
        const t = tipLines(it.tip);
        if (t.length) return t;
        const out = [finite(it.value) ? vfmt(it.value) : 'Not run'];
        if (finite(it.lo) && finite(it.hi)) out.push(`95% interval ${vfmt(it.lo)} to ${vfmt(it.hi)}`);
        return out;
      };
      g.setAttribute('aria-label', it.label + '. ' + lines().join('. '));
      bindTip(g, () => ({header: it.label, lines: lines()}));
      y += h;
    });
    if (ref) {
      const xr = X(ref.value);
      el('line', {x1: xr, x2: xr, y1: top - 2, y2: plotBottom, stroke: C.ink, 'stroke-width': 1.3, 'stroke-dasharray': '4 3', 'pointer-events': 'none'}, svg);
      if (ref.label) el('text', {x: clamp(xr, x0 + 20, x1 - 20), y: top - 5, 'text-anchor': 'middle', 'font-size': fs - 1, fill: C.ink}, svg, ref.label);
    }
    if (s.legend !== false) {
      const lg = s.legend || {};
      const box = html('div', 'gs1c-legend', root);
      const kinds = lg.kinds || {};
      for (const k of Object.keys(kinds)) legendItem(box, '', kinds[k], `background:${KIND[k] || kindIdx.get(k) || C.teal}`);
      if (items.some(it => finite(it.lo) && finite(it.hi))) legendItem(box, 'ci', lg.interval || 'Line: 95% interval');
      if (ref && lg.ref) legendItem(box, 'ref', lg.ref);
      if (items.some(it => it.sig)) legendItem(box, 'sig', lg.sig || 'Significant');
      addNote(box, lg.note);
      if (!box.childNodes.length) box.remove();
    }
  }

  // ---------- forest plot ----------
  // spec: {rows:[{label, published, ours, lo, hi, note, publishedLo, publishedHi, tip}], unit, xLabel,
  //        legend: {published, ours, note} | false, title}
  function drawForest(root, s, W) {
    const narrow = W < 520, fs = narrow ? 11 : 12;
    const rows = s.rows || [];
    const unit = s.unit || 'points';
    const vals = [0];
    for (const r of rows) for (const v of [r.published, r.ours, r.lo, r.hi, r.publishedLo, r.publishedHi]) if (finite(v)) vals.push(v);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals), narrow ? 4 : 6);
    const dmin = ticks[0], dmax = ticks[ticks.length - 1];
    const lh = fs + 3;
    const labelW = narrow ? 0 : Math.round(Math.min(340, W * 0.38));
    const x0 = narrow ? 10 : labelW + 10, x1 = W - 14;
    const X = v => x0 + (clamp(v, dmin, dmax) - dmin) / (dmax - dmin || 1) * (x1 - x0);
    const textMax = narrow ? W - 4 : labelW - 12;
    const strip = 26;
    // Label (bold) and note (muted; italic and up to 3 lines when we have no result of our own) sit in the
    // label column on wide screens and above the markers on narrow ones.
    const L = rows.map(r => {
      const missing = !finite(r.ours);
      const note = r.note || (missing ? 'Not reproduced' : '');
      const lab = wrap(r.label, textMax, fs, 600, 2);
      const noteLines = note ? wrap(note, textMax, fs - 1, 400, missing ? 3 : 2) : {lines: [], cut: false};
      const textH = lab.lines.length * lh + noteLines.lines.length * (lh - 1);
      const h = narrow ? textH + strip + 10 : Math.max(textH, strip) + 16;
      return {lab, note, missing, noteLines, h, textH};
    });
    const top = 6;
    const H = top + L.reduce((a, b) => a + b.h, 0);
    const svg = svgRoot(root, W, H + 2 * fs + 16, s.title || 'Forest plot');
    axisX(svg, ticks, X, H, top, unit, fs, s.xLabel || `Effect (${unit === '%' ? '%' : unit})`, (x0 + x1) / 2);
    let y = top;
    rows.forEach((r, i) => {
      const {lab, note, missing, noteLines, h, textH} = L[i];
      if (i) el('line', {x1: 0, x2: W, y1: y, y2: y, stroke: C.line, 'stroke-width': 0.7}, svg);
      const ty = narrow ? y + 6 + fs * 0.9 : y + h / 2 - textH / 2 + fs * 0.9;
      const t = el('text', {x: 0, y: ty, 'font-size': fs, 'font-weight': 600, fill: C.ink}, svg);
      lab.lines.forEach((ln, k) => el('tspan', {x: 0, dy: k ? lh : 0}, t, ln));
      if (lab.cut) el('title', null, t, r.label);
      if (noteLines.lines.length) {
        const nt = el('text', {x: 0, y: ty + lab.lines.length * lh - 1, 'font-size': fs - 1, fill: C.muted, 'font-style': missing ? 'italic' : 'normal'}, svg);
        noteLines.lines.forEach((ln, k) => el('tspan', {x: 0, dy: k ? lh - 1 : 0}, nt, ln));
        if (noteLines.cut) el('title', null, nt, note);
      }
      const cy = narrow ? y + textH + 6 + strip / 2 : y + h / 2;
      const g = el('g', {tabindex: 0, role: 'img'}, svg);
      el('rect', {x: narrow ? 0 : x0 - 6, y: y + 1, width: narrow ? W : x1 - x0 + 12, height: h - 2, fill: 'transparent', class: 'gs1c-ring'}, g);
      const py = finite(r.ours) ? cy - 5 : cy;
      if (finite(r.publishedLo) && finite(r.publishedHi)) el('line', {x1: X(r.publishedLo), x2: X(r.publishedHi), y1: py, y2: py, stroke: C.orange, 'stroke-width': 1.3, 'stroke-dasharray': '3 2'}, g);
      if (finite(r.published)) {
        const px = X(r.published), d = 5.5;
        el('path', {d: `M${px} ${py - d}L${px + d} ${py}L${px} ${py + d}L${px - d} ${py}Z`, fill: C.paper, stroke: C.orange, 'stroke-width': 2}, g);
      }
      if (finite(r.ours)) {
        const oy = finite(r.published) ? cy + 5 : cy;
        if (finite(r.lo) && finite(r.hi)) {
          el('line', {x1: X(r.lo), x2: X(r.hi), y1: oy, y2: oy, stroke: C.teal, 'stroke-width': 2}, g);
          for (const xx of [X(r.lo), X(r.hi)]) el('line', {x1: xx, x2: xx, y1: oy - 4, y2: oy + 4, stroke: C.teal, 'stroke-width': 2}, g);
        }
        el('circle', {cx: X(r.ours), cy: oy, r: 5, fill: C.teal, stroke: '#fff', 'stroke-width': 1}, g);
      }
      const lines = () => {
        const tl = tipLines(r.tip);
        if (tl.length) return tl;
        const out = [];
        out.push('Published: ' + (finite(r.published) ? fmt(r.published, {signed: true, unit, digits: 1}) : 'not reported'));
        out.push('Ours: ' + (finite(r.ours) ? fmt(r.ours, {signed: true, unit, digits: 1}) + (finite(r.lo) ? ` (95% interval ${fmt(r.lo, {signed: true, digits: 1})} to ${fmt(r.hi, {signed: true, digits: 1})})` : '') : 'not run'));
        if (r.note) out.push(r.note);
        return out;
      };
      g.setAttribute('aria-label', r.label + '. ' + lines().join('. '));
      bindTip(g, () => ({header: r.label, lines: lines()}));
      y += h;
    });
    if (s.legend !== false) {
      const lg = s.legend || {};
      const box = html('div', 'gs1c-legend', root);
      const a = html('span', 'gs1c-it', box);
      const d1 = html('span', 'gs1c-mk', a, '◇');
      d1.style.color = 'var(--orange, #ae5a22)';
      d1.style.fontWeight = '700';
      html('span', '', a, lg.published || 'Published effect');
      const b = html('span', 'gs1c-it', box);
      const d2 = html('span', 'gs1c-mk', b, '●—');
      d2.style.color = 'var(--teal, #176a60)';
      html('span', '', b, lg.ours || 'Ours, with 95% interval');
      addNote(box, lg.note);
    }
  }

  // ---------- scatter ----------
  // spec: {points:[{label, x, y, color, tip}], xLabel, yLabel, unit ('%' default), xMin, xMax, yMin, yMax,
  //        diagonal (draw y = x), legend: {note} | false, title}
  function drawScatter(root, s, W) {
    const narrow = W < 560, fs = narrow ? 11 : 12;
    const pts = (s.points || []).filter(p => finite(p.x) && finite(p.y));
    const unit = s.unit === undefined ? '%' : s.unit;
    const nice = (vals, lo, hi) => {
      const mx = Math.max(...vals, 0);
      return niceTicks(finite(lo) ? lo : 0, finite(hi) ? hi : (mx > 0 ? mx * 1.08 : 1), narrow ? 4 : 5);
    };
    const xt = nice(pts.map(p => p.x), s.xMin, s.xMax), yt = nice(pts.map(p => p.y), s.yMin, s.yMax);
    const xmin = xt[0], xmax = xt[xt.length - 1], ymin = yt[0], ymax = yt[yt.length - 1];
    const ml = fs * 2 + 26, mr = 12, mt = 10, mb = fs * 2 + 22;
    const plotW = Math.min(W - ml - mr, 760);
    const plotH = clamp(plotW * 0.62, 220, 420);
    const H = mt + plotH + mb;
    const X = v => ml + (v - xmin) / (xmax - xmin || 1) * plotW, Y = v => mt + plotH - (v - ymin) / (ymax - ymin || 1) * plotH;
    const svg = svgRoot(root, W, H, s.title || 'Scatter plot');
    const tl = v => fmt(v, {}) + (unit === '%' ? '%' : '');
    for (const t of xt) {
      el('line', {x1: X(t), x2: X(t), y1: mt, y2: mt + plotH, stroke: C.grid}, svg);
      el('text', {x: X(t), y: mt + plotH + fs + 4, 'text-anchor': 'middle', 'font-size': fs - 1, fill: C.muted}, svg, tl(t));
    }
    for (const t of yt) {
      el('line', {x1: ml, x2: ml + plotW, y1: Y(t), y2: Y(t), stroke: C.grid}, svg);
      el('text', {x: ml - 5, y: Y(t) + fs * 0.33, 'text-anchor': 'end', 'font-size': fs - 1, fill: C.muted}, svg, tl(t));
    }
    el('rect', {x: ml, y: mt, width: plotW, height: plotH, fill: 'none', stroke: C.line}, svg);
    if (s.xLabel) el('text', {x: ml + plotW / 2, y: mt + plotH + 2 * fs + 12, 'text-anchor': 'middle', 'font-size': fs, fill: C.ink, 'font-weight': 600}, svg, ellipsize(s.xLabel, plotW, fs, 600));
    if (s.yLabel) {
      const yx = fs + 2, yy = mt + plotH / 2;
      el('text', {x: yx, y: yy, transform: `rotate(-90 ${yx} ${yy})`, 'text-anchor': 'middle', 'font-size': fs, fill: C.ink, 'font-weight': 600}, svg, ellipsize(s.yLabel, plotH, fs, 600));
    }
    if (s.diagonal) {
      const a = Math.max(xmin, ymin), b = Math.min(xmax, ymax);
      if (b > a) el('line', {x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), stroke: C.zero, 'stroke-dasharray': '4 3'}, svg);
    }
    // Greedy label placement: try 8 spots around each point, avoid placed labels, points and the plot edge.
    const R = 6, placed = [];
    const circles = pts.map(p => ({x: X(p.x), y: Y(p.y)}));
    const overlaps = (b, c) => !(b.x2 < c.x1 || b.x1 > c.x2 || b.y2 < c.y1 || b.y1 > c.y2);
    const order = pts.map((p, i) => i).sort((a, b) => circles[a].x - circles[b].x);
    const labPos = [];
    for (const i of order) {
      const p = pts[i], c = circles[i];
      const text = ellipsize(p.label, narrow ? 180 : 220, fs, 500), w = textW(text, fs, 500), h = fs + 2;
      const cands = [[R + 4, 0, 'start'], [-R - 4, 0, 'end'], [0, -R - 6, 'middle'], [0, R + 6 + fs * 0.7, 'middle'],
        [R + 3, -R - 3, 'start'], [-R - 3, -R - 3, 'end'], [R + 3, R + 3 + fs * 0.6, 'start'], [-R - 3, R + 3 + fs * 0.6, 'end']];
      let best = null, bestScore = Infinity;
      for (const [dx, dy, anchor] of cands) {
        const tx = c.x + dx, ty = c.y + dy + (dy === 0 ? fs * 0.35 : 0);
        const x1 = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
        const box = {x1, x2: x1 + w, y1: ty - fs * 0.85, y2: ty - fs * 0.85 + h};
        let score = 0;
        if (box.x1 < ml - 2 || box.x2 > W - 2 || box.y1 < 0 || box.y2 > mt + plotH + 2) score += 100;
        for (const b of placed) if (overlaps(box, b)) score += 10;
        circles.forEach((cc, j) => { if (j !== i && overlaps(box, {x1: cc.x - R, x2: cc.x + R, y1: cc.y - R, y2: cc.y + R})) score += 5; });
        if (score < bestScore) { bestScore = score; best = {tx, ty, anchor, box, text}; }
        if (score === 0) break;
      }
      placed.push(best.box);
      labPos[i] = best;
    }
    pts.forEach((p, i) => {
      const c = circles[i], lp = labPos[i];
      const g = el('g', {tabindex: 0, role: 'img'}, svg);
      el('circle', {cx: c.x, cy: c.y, r: R, fill: p.color || C.teal, stroke: '#fff', 'stroke-width': 1.5}, g);
      el('circle', {cx: c.x, cy: c.y, r: R + 3, class: 'gs1c-ring'}, g);
      el('text', {x: lp.tx, y: lp.ty, 'text-anchor': lp.anchor, 'font-size': fs, 'font-weight': 500, fill: C.ink}, g, lp.text);
      const lines = () => {
        const t = tipLines(p.tip);
        if (t.length) return t;
        return [`${s.xLabel || 'x'}: ${fmt(p.x, {unit, digits: 0})}`, `${s.yLabel || 'y'}: ${fmt(p.y, {unit, digits: 0})}`];
      };
      g.setAttribute('aria-label', p.label + '. ' + lines().join('. '));
      bindTip(g, () => ({header: p.label, lines: lines()}));
    });
    if (s.legend && (s.legend.note || (s.diagonal && s.legend.diagonal))) {
      const box = html('div', 'gs1c-legend', root);
      if (s.diagonal && s.legend.diagonal) legendItem(box, 'ref', s.legend.diagonal);
      addNote(box, s.legend.note);
    }
  }

  window.GSCharts = {
    heatmap: (container, spec) => mount(container, spec, drawHeatmap),
    bars: (container, spec) => mount(container, spec, drawBars),
    forest: (container, spec) => mount(container, spec, drawForest),
    scatter: (container, spec) => mount(container, spec, drawScatter),
    color,
    fmt,
  };
})();
