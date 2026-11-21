// Grid sweep, stage 1: the summary page (takeaways and the sweep-status matrix are in the HTML; this adds the status
// hover text and draws the four group cards, the per-model views and the cross-model plots). Data: the JSON block
// #gs-main, written by scripts/dashboard/build_grid_stage1.py. Charts: window.GSCharts (grid-stage1-charts.js); a
// plain-table heat map stands in if it is missing.
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
            `title="${esc(row.label + ' · ' + c.label + '\n' + x.tip)}">${x.text !== undefined ? esc(x.text) : pts(x.value)}${x.sig ? '●' : ''}</td>`;
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
  // Replace a chart with a message (stops its redraw-on-resize first).
  function clear(el, msg) {
    if (el.__gs1c) el.__gs1c.destroy();
    el.innerHTML = msg ? `<p class="gsm-empty">${msg}</p>` : '';
  }

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

  // ---- sweep status (the matrix is in the HTML): hover/tap text; a group header opens that group's card ----
  const SW = D.sweep, GRP = Object.fromEntries(SW.groups.map(g => [g.key, g])), BN = SW.names, TOWARD = SW.toward;
  function bindStatus() {
    document.querySelectorAll('#status .gss-c, #fullscale .gss-c').forEach(btn => {
      if (!window.GSCharts || !window.GSCharts.tip) return;   // the title attribute stays as the fallback
      const t = JSON.parse(btn.dataset.tip);
      btn.removeAttribute('title');
      window.GSCharts.tip(btn, () => t);
    });
    document.querySelectorAll('#status .gss-g').forEach(btn => btn.addEventListener('click', () => {
      selectGroup(btn.dataset.g, true);
      $('groups').scrollIntoView({behavior: 'smooth'});
    }));
  }
  // Why a (model, benchmark, method) has no cell, from the sweep status.
  function whyNot(m, b, method) {
    const c = (SW.cells[m] || {})[b];
    if (!c) return 'not run';
    if (c.state !== 'complete') return `${c.state}: ${c.reason}`;
    const e = (c.methods || []).find(x => x[0] === method);
    if (!e) return `${PLANT[method].name.toLowerCase()}: not part of the design for this benchmark`;
    return e[1] === 'run' ? 'not run for this belief' : `${e[1]}: ${e[2]}`;
  }
  const hasCell = (b, method) => MODELS.some(m => BELIEFS.some(bel => cell(m, b, method, bel)));

  // ---- the four group cards: summary (belief x model over the group's benchmarks), then one benchmark ----
  let gCur = SW.groups[0].key;
  const gState = {};   // per group: chosen planting method and benchmark
  const groupMethods = g => D.plantings.map(p => p[0]).filter(k => g.benches.some(b => hasCell(b, k)));
  function defaultMethod(g, ms) {   // long thought (belief) where most models have it, else the one-sentence thought
    const cover = k => MODELS.filter(m => g.benches.some(b => BELIEFS.some(bel => cell(m, b, k, bel)))).length;
    return ['longD', 'thought', 'statement'].find(k => ms.includes(k) && cover(k) >= MODELS.length / 2) || ms[0];
  }
  const direction = g => g.ends[1] === 'more cautious' ? 'refusals up, harmful compliance or actions down'
    : 'accuracy or tasks solved up';
  $('g-tabs').innerHTML = SW.groups.map(g => {
    const run = g.benches.filter(b => D.plantings.some(p => hasCell(b, p[0]))).length;
    return `<button type="button" role="tab" aria-controls="g-view" data-g="${esc(g.key)}"><span>${esc(g.name)}</span>` +
      `<span class="gt-sub">${run} of ${g.benches.length + g.unrun.length} benchmarks run</span></button>`;
  }).join('');
  $('g-tabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => selectGroup(btn.dataset.g, true)));
  $('g-method').addEventListener('change', () => { gState[gCur].method = $('g-method').value; drawGroup(); });

  // follow: a reader's choice also filters the per-model view below to the group's benchmarks.
  function selectGroup(k, follow) {
    gCur = k;
    const g = GRP[k], ms = groupMethods(g);
    $('g-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.g === k)));
    if (!gState[k]) gState[k] = {method: defaultMethod(g, ms), bench: null};
    fill($('g-method'), ms.map(m => [m, PLANT[m].name]), gState[k].method);
    $('g-what').innerHTML = `<b>${esc(g.name)}</b>: ${esc(g.what)}` + (g.unrun.length
      ? ` <span class="sub">In no model's stage 1: ${esc(g.unrun.map(b => BN[b]).join(', '))}.</span>` : '');
    drawGroup();
    if (follow) { $('m-group').value = k; selectModel(current); }
  }
  function drawGroup() { drawGroupSummary(); drawBenchTabs(); drawGroupBench(); }
  const toModel = m => { selectModel(m); $('models').scrollIntoView({behavior: 'smooth'}); };

  function drawGroupSummary() {
    const g = GRP[gCur], method = $('g-method').value, [lowW, highW] = g.ends;
    const cells = [], present = new Set();
    for (const m of MODELS) for (const bel of BELIEFS) if (g.benches.some(b => cell(m, b, method, bel))) present.add(bel);
    for (const m of MODELS) for (const bel of present) {
      const per = g.benches.map(b => [b, cell(m, b, method, bel)]);
      const got = per.filter(x => x[1]);
      if (!got.length) {
        cells.push({row: bel, col: m, value: null, sig: false, na: true,
          tip: g.benches.map(b => `${BN[b]}: ${whyNot(m, b, method)}`).join('\n')});
        continue;
      }
      const k = got.filter(([, c]) => isSig(c.r)).length;
      const mean = got.reduce((s, [b, c]) => s + TOWARD[b] * c.r.d, 0) / got.length;
      const lines = [`${k} of ${got.length} benchmarks Significant`,
        `mean signed difference ${pts(mean, 1)} points (${mean >= 0 ? highW : lowW})`,
        ...per.map(([b, c]) => !c ? `${BN[b]}: ${whyNot(m, b, method)}`
          : `${BN[b]}: ${pts(c.r.d, 1)} points (${ENDS[b][c.r.d >= 0 ? 1 : 0]}), ${label(c.r)}, p ${pfmt(c.r.p)}` +
            (c.reading ? `, ${c.reading}` : ''))];
      // the benchmark a click opens below: the largest Significant difference, else the largest difference
      const best = got.slice().sort(([, a], [, c]) => (isSig(c.r) - isSig(a.r)) || Math.abs(c.r.d) - Math.abs(a.r.d))[0][0];
      cells.push({row: bel, col: m, value: mean, text: `${k}/${got.length}`, sig: k > 0, na: false, bench: best,
        tip: lines.join('\n')});
    }
    const host = $('g-heat');
    if (!present.size) {
      clear(host, `${esc(PLANT[method].name)} was not run on this group in any model.`);
    } else {
      charts().heatmap(host, {...rowSpec(present), cols: MODELS.map(m => ({key: m, label: modelName(m)})), cells,
        scale: {min: -30, max: 30, unit: 'points'}, showValues: true, onCol: toModel, onCell: c => {
          if (c.na || !c.bench) return;
          gState[gCur].bench = c.bench;
          drawBenchTabs();
          drawGroupBench();
          $('h-gbench').scrollIntoView({behavior: 'smooth'});
        },
        legend: {title: `Mean difference over the group's benchmarks (points; + = ${highW})`, low: lowW, high: highW,
          sig: 'At least one benchmark Significant', na: 'Not run'}});
    }
    $('g-legend').innerHTML = `<b>${esc(PLANT[method].name)}</b>, ${esc(PLANT[method].what)}. Number: the group's ` +
      `benchmarks with a Significant difference / benchmarks run; colour: mean difference, + = ${esc(highW)} ` +
      `(${esc(direction(g))}). Hover or tap a cell for each benchmark; click it (tap twice) to open its strongest benchmark below.`;
  }

  function drawBenchTabs() {
    const g = GRP[gCur], st = gState[gCur], method = $('g-method').value;
    if (!st.bench || !hasCell(st.bench, method)) st.bench = g.benches.find(b => hasCell(b, method)) || st.bench || g.benches[0];
    $('g-bench').innerHTML = g.benches.map(b => `<button type="button" role="tab" data-b="${esc(b)}" ` +
      `aria-selected="${b === st.bench}">${esc(BN[b])}</button>`).join('') +
      g.unrun.map(b => `<button type="button" role="tab" disabled aria-disabled="true">${esc(BN[b])}: not run yet</button>`).join('');
    $('g-bench').querySelectorAll('button[data-b]').forEach(btn => btn.addEventListener('click', () => {
      st.bench = btn.dataset.b;
      $('g-bench').querySelectorAll('button[data-b]').forEach(x => x.setAttribute('aria-selected', String(x === btn)));
      drawGroupBench();
    }));
  }

  function drawGroupBench() {
    const b = gState[gCur].bench, method = $('g-method').value;
    const cells = [], present = new Set();
    for (const m of MODELS) for (const bel of BELIEFS) if (cell(m, b, method, bel)) present.add(bel);
    for (const m of MODELS) for (const bel of present) cells.push(heatCell(bel, m, cell(m, b, method, bel), whyNot(m, b, method)));
    const host = $('g-bheat');
    if (!present.size) {
      clear(host, `${esc(PLANT[method].name)} was not run on ${esc(NOUN[b])} in any model.`);
    } else {
      charts().heatmap(host, {...rowSpec(present), cols: MODELS.map(m => ({key: m, label: modelName(m)})), cells,
        scale: {min: -40, max: 40, unit: 'points'}, legend: legend(b), onCol: toModel});
    }
    $('g-blegend').innerHTML = `<b>${esc(BN[b])}</b>, ${esc(NOUN[b])}. Colour: rate with the belief minus rate with ` +
      `the same method's neutral text. Outlined: Significant. Grey: not run. Hover or tap a cell for rates, interval, ` +
      `tasks and runs; click a model name for its own view below.`;
  }

  // ---- per model ----
  let current = MODELS[0];
  $('m-tabs').innerHTML = MODELS.map(m => `<button type="button" role="tab" data-m="${esc(m)}">${esc(modelName(m))}</button>`).join('');
  $('m-tabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => selectModel(btn.dataset.m)));
  $('m-method').addEventListener('change', drawModelHeat);
  fill($('m-group'), [['all', 'All benchmarks'], ...SW.groups.map(g => [g.key, g.name])], 'all');
  $('m-group').addEventListener('change', () => selectModel(current));
  // Benchmarks of the per-model view: all of them, or one group's (following the group cards).
  const modelBenches = () => $('m-group').value === 'all' ? D.outcomes.map(o => o[0]) : GRP[$('m-group').value].benches;

  const effect = (r, reading) => `${PLANT[r.method] ? PLANT[r.method].name : 'Long planted thought (belief and reason' + (reading ? ', first reading' : '') + ')'} ` +
    `'${D.belief[r.belief]}' ${r.d > 0 ? 'raises' : 'lowers'} ${NOUN[r.bench]} by <b>${Math.abs(Math.round(r.d))} points</b> ` +
    `(${pct(r.ref)} → ${pct(r.rate)})`;

  function selectModel(m) {
    current = m;
    $('m-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === m)));
    const info = D.models[m];
    const benches = modelBenches(), gk = $('m-group').value;
    const mine = ROWS.filter(r => r.model === m && benches.includes(r.bench));
    $('m-name').textContent = modelName(m);
    $('m-note').textContent = info.note ? (info.interim ? 'Interim: ' : '') + info.note : '';
    $('m-note').hidden = !info.note;
    if (!mine.length) {   // e.g. a model without τ-bench, viewed on agentic capability
      $('m-take').innerHTML = `<li>No ${esc(GRP[gk].name.toLowerCase())} results: ` +
        `${esc(benches.map(b => `${BN[b]} ${whyNot(m, b, '')}`).join('; '))}.</li>`;
      $('m-sig').innerHTML = '<li class="sub">none</li>';
      clear($('m-base'));
      fill($('m-method'), [], '');
      clear($('m-heat'));
      steerFollow(m);
      return;
    }
    // takeaways
    const sig = mine.filter(isSig).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const clean = sig.filter(r => !r.poor_fit);
    const where = gk === 'all' ? '' : ` on ${esc(GRP[gk].name.toLowerCase())}`;
    const lines = [`<b>${sig.length} of ${mine.length.toLocaleString('en')}</b> cells Significant${where} (about ` +
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
    const base = benches.map(b => D.base.find(x => x.model === m && x.bench === b)).filter(Boolean);
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
    steerFollow(m);
  }

  function drawModelHeat() {
    const m = current, method = $('m-method').value;
    const benches = modelBenches().filter(b => BELIEFS.some(bel => cell(m, b, method, bel)));
    const present = new Set(BELIEFS.filter(bel => benches.some(b => cell(m, b, method, bel))));
    const cells = [];
    for (const b of benches) for (const bel of present) cells.push(heatCell(bel, b, cell(m, b, method, bel), whyNot(m, b, method)));
    if (!benches.length) { clear($('m-heat'), 'No cells.'); return; }
    charts().heatmap($('m-heat'), {...rowSpec(present), cols: benches.map(b => ({key: b, label: OUT[b].short})), cells,
      scale: {min: -40, max: 40, unit: 'points'}, legend: {...legend(null), low: 'lower rate', high: 'higher rate'}});
  }

  function wilson(k, n, z = 1.96) {
    if (!n) return [null, null];
    const p = k / n, den = 1 + z * z / n, mid = (p + z * z / (2 * n)) / den;
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [100 * Math.max(0, mid - half), 100 * Math.min(1, mid + half)];
  }

  // ---- plots below the per-model view ----
  function drawPlots() {
    const G = window.GSCharts;
    if (!G) { ['p-methods-sec', 'p-steer-sec', 'p-repro-sec'].forEach(id => { $(id).hidden = true; }); return; }
    G.scatter($('p-methods'), {points: D.methods.map(p => ({label: p.label, x: p.x, y: p.y})),
      xLabel: 'Belief taken on (% of cells)', yLabel: 'Significant (% of cells)', unit: '%', xMax: 100});
    fill($('p-steer-sel'), D.steer.map((s, i) => [String(i), `${modelName(s.model)} · ${s.title}`]), '0');
    $('p-steer-sel').addEventListener('change', drawSteer);
    drawSteer();
    G.forest($('p-repro'), {rows: D.forest.map(r => ({label: r.label, published: r.published, ours: r.ours,
      lo: r.lo, hi: r.hi, note: r.note})), unit: 'points', xLabel: 'Effect (points)'});
  }
  function drawSteer() {
    const s = D.steer[+$('p-steer-sel').value];
    window.GSCharts.bars($('p-steer'), {items: s.items.map(i => ({label: i.label, value: i.value, lo: i.lo, hi: i.hi,
      kind: i.kind})), unit: '%', max: 100, legend: {interval: 'Line: 95% interval (runs)',
      kinds: {control: 'Unsteered', steered: 'Steered', random: 'Random directions', harm: 'Harm direction'}}});
  }
  // Follow the model tab: show that model's first steering panel, if it has one.
  function steerFollow(m) {
    const i = D.steer.findIndex(s => s.model === m);
    if (i >= 0 && window.GSCharts && $('p-steer-sel').options.length) { $('p-steer-sel').value = String(i); drawSteer(); }
  }

  // Example traces (DashTraces' component): mounted by the builder only when its files exist.
  function mountTraces() {
    const sec = $('traces-section'), el = $('grid-traces');
    if (!sec || !el || typeof window.renderTraces !== 'function') return;
    if (window.matchMedia('(max-width: 760px)').matches) sec.removeAttribute('open');
    fetch('study-data/grid-stage1-traces.json').then(r => r.json()).then(d => window.renderTraces(el, d))
      .catch(() => { sec.hidden = true; });
  }

  bindStatus();
  selectGroup(gCur, false);
  drawPlots();
  selectModel(current);
  mountTraces();
})();
