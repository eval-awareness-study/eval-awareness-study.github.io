// Grid sweep, stage 1: the summary page (takeaways are in the HTML; this draws the overview heat map, the per-model
// views and the cross-model plots). Data: the JSON block #gs-main, written by scripts/dashboard/build_grid_stage1.py.
// Charts: window.GSCharts (grid-stage1-charts.js); a plain-table heat map stands in if it is missing.
// Labels follow the dashboard's rule: two-sided p < .05 with more than two tasks, no multiple-testing correction.
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('gs-main').textContent);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const label = r => !finite(r.p) ? 'Unavailable' : r.tasks <= 2 ? 'Inconclusive' : r.p < .05 ? 'Significant' : 'Not significant';
  const isSig = r => label(r) === 'Significant';
  const pts = (v, nd = 0) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(nd) : '–';
  const pct = v => finite(v) ? Math.round(v) + '%' : '–';
  const pfmt = p => !finite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3);

  const ROWS = D.rows.map(r => Object.fromEntries(D.fields.map((f, i) => [f, r[i]])));
  const AT = new Map(ROWS.map(r => [`${r.model}|${r.bench}|${r.method}|${r.belief}`, r]));
  const MODELS = Object.keys(D.models);
  const OUT = Object.fromEntries(D.outcomes.map(([k, long, short]) => [k, {long, short}]));
  const PLANT = Object.fromEntries(D.plantings.map(([k, name, what]) => [k, {name, what}]));
  const BELIEFS = D.groups.flatMap(g => g[1]);
  const NOUN = {
    agentharm_harmless: 'refusals of harmless agent tasks', orbench: 'refusals of borderline harmless chat requests',
    harmful_requests: 'compliance with harmful requests', blackmail: 'blackmail', mmlu_pro: 'MMLU-Pro accuracy',
    gpqa_diamond: 'GPQA accuracy', math500: 'MATH-500 accuracy', tau_bench: 'τ-bench tasks solved',
    xstest_safe: 'refusals of harmless chat requests (XSTest)', xstest_unsafe: 'compliance with harmful chat requests (XSTest)',
    agentharm_harmful: 'completion of harmful agent tasks'};
  const ENDS = {
    agentharm_harmless: ['fewer refusals', 'more refusals'], orbench: ['fewer refusals', 'more refusals'],
    xstest_safe: ['fewer refusals', 'more refusals'], harmful_requests: ['less compliance', 'more compliance'],
    xstest_unsafe: ['less compliance', 'more compliance'], agentharm_harmful: ['fewer completed', 'more completed'],
    blackmail: ['less blackmail', 'more blackmail'], mmlu_pro: ['less accurate', 'more accurate'],
    gpqa_diamond: ['less accurate', 'more accurate'], math500: ['less accurate', 'more accurate'],
    tau_bench: ['fewer solved', 'more solved']};
  const modelName = m => D.models[m].name;

  // A cell for (model, bench, method, belief). 'longR' falls back to the first reading (longRa) for the five beliefs
  // whose 'belief and reason' text has two readings.
  function cell(m, b, method, belief) {
    const r = AT.get(`${m}|${b}|${method}|${belief}`);
    if (r || method !== 'longR') return r ? {r, reading: ''} : null;
    const a = AT.get(`${m}|${b}|longRa|${belief}`);
    return a ? {r: a, reading: 'first of two readings'} : null;
  }
  const tip = (c, extra) => [
    `${pct(c.r.rate)} with the belief, ${pct(c.r.ref)} with the neutral control`,
    `difference ${pts(c.r.d, 1)} points [${pts(c.r.lo, 1)}, ${pts(c.r.hi, 1)}]`,
    `${label(c.r)} (nominal p ${pfmt(c.r.p)})`,
    `${c.r.tasks} tasks, ${c.r.runs} runs`,
    ...(c.reading ? [c.reading] : []), ...(c.r.poor_fit ? ['text flagged as a poor fit for this benchmark'] : []),
    ...(extra ? [extra] : [])].join('\n');
  const heatCell = (row, col, c, naText) => c
    ? {row, col, value: c.r.d, sig: isSig(c.r), na: false, tip: tip(c)}
    : {row, col, value: null, sig: false, na: true, tip: naText};

  // ---- fallback drawing (used only if grid-stage1-charts.js failed to load) ----
  function colour(v, max) {
    if (!finite(v)) return '#e6e6e3';
    const t = Math.min(1, Math.abs(v) / max);
    const [r, g, b] = v >= 0 ? [179, 88, 6] : [84, 39, 136];
    const mix = (c, w) => Math.round(247 + (c - 247) * w);
    return `rgb(${mix(r, t)},${mix(g, t)},${mix(b, t)})`;
  }
  function tableHeat(el, s) {
    const at = new Map(s.cells.map(c => [`${c.row}|${c.col}`, c]));
    const max = Math.max(Math.abs(s.scale.min), Math.abs(s.scale.max));
    const head = s.cols.map(c => `<th scope="col" data-col="${esc(c.key)}">${esc(c.label)}</th>`).join('');
    const body = s.rowGroups.map(g => `<tr class="grp"><th colspan="${s.cols.length + 1}">${esc(g.label)}</th></tr>` +
      g.rows.map(rk => {
        const row = s.rows.find(r => r.key === rk);
        return `<tr><th scope="row">${esc(row.label)}</th>` + s.cols.map(c => {
          const x = at.get(`${rk}|${c.key}`);
          if (!x || x.na) return `<td class="na" title="${esc(x ? x.tip : '')}"></td>`;
          return `<td class="${x.sig ? 'sig' : ''}" style="background:${colour(x.value, max)};color:${Math.abs(x.value) > max * .6 ? '#fff' : '#222'}" ` +
            `title="${esc(row.label + ' · ' + c.label + '\n' + x.tip)}">${pts(x.value)}${x.sig ? '●' : ''}</td>`;
        }).join('') + '</tr>';
      }).join('')).join('');
    el.innerHTML = `<div class="table-scroll"><table class="gsm-ftable"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    if (s.onCol) el.querySelectorAll('th[data-col]').forEach(th => th.addEventListener('click', () => s.onCol(th.dataset.col)));
  }
  function tableBars(el, s) {
    el.innerHTML = '<div class="gsm-fbars">' + s.items.map(i => `<div><span>${esc(i.label)}</span>` +
      `<span class="bar" style="width:${Math.max(0, i.value) / (s.max || 100) * 60}%"></span><b>${Math.round(i.value)}${esc(s.unit)}</b></div>`).join('') + '</div>';
  }
  const charts = () => window.GSCharts || {heatmap: tableHeat, bars: tableBars};

  // Beliefs with at least one cell among the given cells, kept in group order.
  function rowSpec(present) {
    const rows = BELIEFS.filter(b => present.has(b)).map(b => ({key: b, label: D.belief[b]}));
    const rowGroups = D.groups.map(([name, bs]) => ({label: name, rows: bs.filter(b => present.has(b))}))
      .filter(g => g.rows.length);
    return {rows, rowGroups};
  }
  function fill(sel, options, value) {
    sel.innerHTML = options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    sel.value = value;
  }
  const legend = b => ({title: 'Difference from the matched neutral control (points)', low: ENDS[b] ? ENDS[b][0] : 'lower',
    high: ENDS[b] ? ENDS[b][1] : 'higher', sig: 'Significant = nominal p < 0.05, uncorrected, up to 50 tasks × 2 samples',
    na: 'Not run'});

  // ---- overview: beliefs x models ----
  fill($('o-bench'), D.outcomes.map(o => [o[0], o[1]]), 'agentharm_harmless');
  fill($('o-method'), D.plantings.map(p => [p[0], p[1]]), 'longD');
  function drawOverview() {
    const b = $('o-bench').value, method = $('o-method').value;
    const cells = [], present = new Set();
    for (const m of MODELS) for (const bel of BELIEFS) {
      const c = cell(m, b, method, bel);
      if (c) present.add(bel);
    }
    for (const m of MODELS) for (const bel of present) {
      const running = (D.models[m].partial || []).includes(b);
      cells.push(heatCell(bel, m, cell(m, b, method, bel),
        running ? 'still running' : `not run: ${PLANT[method].name.toLowerCase()} on this benchmark`));
    }
    const host = $('o-heat');
    if (!present.size) {
      host.innerHTML = `<p class="gsm-empty">${esc(PLANT[method].name)} was not run on ${esc(NOUN[b])} in any model.</p>`;
    } else {
      charts().heatmap(host, {...rowSpec(present), cols: MODELS.map(m => ({key: m, label: modelName(m)})), cells,
        scale: {min: -40, max: 40, unit: 'points'}, legend: legend(b), onCol: m => { selectModel(m); $('models').scrollIntoView({behavior: 'smooth'}); }});
    }
    $('o-legend').innerHTML = `<b>${esc(PLANT[method].name)}</b>: ${esc(PLANT[method].what)}. Colour: rate with the belief ` +
      `minus rate with the same method's neutral text. Outlined: Significant. Grey: not run. Hover or tap a cell for ` +
      `rates, interval, tasks and runs; click a model name for its own view below.`;
  }
  $('o-bench').addEventListener('change', drawOverview);
  $('o-method').addEventListener('change', drawOverview);

  // ---- per model ----
  let current = MODELS[0];
  $('m-tabs').innerHTML = MODELS.map(m => `<button type="button" role="tab" data-m="${esc(m)}">${esc(modelName(m))}</button>`).join('');
  $('m-tabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => selectModel(btn.dataset.m)));
  $('m-method').addEventListener('change', drawModelHeat);

  const effect = (r, reading) => `${PLANT[r.method] ? PLANT[r.method].name : 'Long planted thought (belief and reason' + (reading ? ', first reading' : '') + ')'} ` +
    `'${D.belief[r.belief]}' ${r.d > 0 ? 'raises' : 'lowers'} ${NOUN[r.bench]} by <b>${Math.abs(Math.round(r.d))} points</b> ` +
    `(${pct(r.ref)} → ${pct(r.rate)})`;

  function selectModel(m) {
    current = m;
    $('m-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === m)));
    const info = D.models[m];
    const mine = ROWS.filter(r => r.model === m);
    $('m-name').textContent = modelName(m);
    $('m-note').textContent = info.note ? (info.interim ? 'Interim: ' : '') + info.note : '';
    $('m-note').hidden = !info.note;
    // takeaways
    const sig = mine.filter(isSig).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const clean = sig.filter(r => !r.poor_fit);
    const lines = [`<b>${sig.length} of ${mine.length.toLocaleString('en')}</b> cells Significant (about ` +
      `${Math.round(mine.length / 20)} expected by chance alone).`];
    const seen = new Set();
    for (const r of clean) {   // the two largest effects on different outcomes
      if (seen.has(r.bench)) continue;
      seen.add(r.bench);
      lines.push(effect(r, r.method === 'longRa') + '.');
      if (lines.length === 3) break;
    }
    $('m-take').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
    $('m-sig').innerHTML = sig.slice(0, 8).map(r => `<li><span class="gs-label sig">Significant</span> ` +
      `${effect(r, r.method === 'longRa')} <span class="sub">[${pts(r.lo)}, ${pts(r.hi)}], p ${pfmt(r.p)}, ` +
      `${r.tasks} tasks${r.poor_fit ? '; text a poor fit' : ''}</span></li>`).join('')
      || '<li class="sub">none</li>';
    // base rates
    const base = D.outcomes.map(o => D.base.find(x => x.model === m && x.bench === o[0])).filter(Boolean);
    charts().bars($('m-base'), {items: base.map(x => {
      const n = x.runs, k = Math.round(x.rate * n / 100), [lo, hi] = wilson(k, n);
      return {label: OUT[x.bench].short, value: x.rate, lo, hi, kind: 'base'};
    }), unit: '%', max: 100, legend: {interval: 'Line: 95% interval (runs)', kinds: {base: 'Nothing planted'}}});
    // method choices that exist for this model
    const has = D.plantings.filter(p => mine.some(r => r.method === p[0] || (p[0] === 'longR' && r.method === 'longRa')));
    const keep = $('m-method').value;
    fill($('m-method'), has.map(p => [p[0], p[1]]), has.some(p => p[0] === keep) ? keep
      : has.some(p => p[0] === 'longD') ? 'longD' : has[0][0]);
    drawModelHeat();
  }

  function drawModelHeat() {
    const m = current, method = $('m-method').value;
    const benches = D.outcomes.map(o => o[0]).filter(b => BELIEFS.some(bel => cell(m, b, method, bel)));
    const present = new Set(BELIEFS.filter(bel => benches.some(b => cell(m, b, method, bel))));
    const cells = [];
    for (const b of benches) for (const bel of present) cells.push(heatCell(bel, b, cell(m, b, method, bel), 'not run'));
    if (!benches.length) { $('m-heat').innerHTML = '<p class="gsm-empty">No cells.</p>'; return; }
    charts().heatmap($('m-heat'), {...rowSpec(present), cols: benches.map(b => ({key: b, label: OUT[b].short})), cells,
      scale: {min: -40, max: 40, unit: 'points'}, legend: {...legend(null), low: 'lower rate', high: 'higher rate'}});
  }

  function wilson(k, n, z = 1.96) {
    if (!n) return [null, null];
    const p = k / n, den = 1 + z * z / n, mid = (p + z * z / (2 * n)) / den;
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [100 * Math.max(0, mid - half), 100 * Math.min(1, mid + half)];
  }

  drawOverview();
  selectModel(current);
})();
