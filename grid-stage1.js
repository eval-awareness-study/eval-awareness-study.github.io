// Grid sweep, stage 1: the belief x method map (filters, grid, list). Data: the JSON block #gs-data, written by
// scripts/dashboard/build_grid_stage1.py. Labels follow the dashboard's rule: two-sided p < .05 with more than two
// tasks, no multiple-testing correction.
(() => {
  'use strict';
  const DATA = JSON.parse(document.getElementById('gs-data').textContent);
  const META = DATA.meta;
  const ROWS = DATA.rows.map(r => Object.fromEntries(DATA.fields.map((f, i) => [f, r[i]])));
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const label = r => !finite(r.p) ? 'Unavailable' : r.tasks <= 2 ? 'Inconclusive' : r.p < .05 ? 'Significant' : 'Not significant';
  const pts = (v, nd = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(nd) : '–';
  const ci = r => finite(r.lo) ? `[${pts(r.lo)}, ${pts(r.hi)}]` : '–';
  const pct = v => finite(v) ? v.toFixed(1) + '%' : '–';
  const pfmt = p => !finite(p) ? '–' : p < 0.001 ? '<0.001' : p.toFixed(3);
  const fact = (v, y, n) => v === null || v === undefined ? '–' : v ? y : n;
  const LABEL_CLASS = {'Significant': 'sig', 'Not significant': 'ns', 'Inconclusive': 'inc', 'Unavailable': 'na'};
  const badge = l => `<span class="gs-label ${LABEL_CLASS[l]}">${esc(l)}</span>`;
  const METHOD_ORDER = Object.keys(META.methods);
  const BENCH_ORDER = Object.keys(META.bench);
  const MODEL_ORDER = Object.keys(META.models);
  const BELIEF_ORDER = META.groups.flatMap(g => g[2]);
  const groupOf = b => (META.groups.find(g => g[2].includes(b)) || ['other', 'Other'])[1];
  const benchLabel = b => `${META.bench[b][0]} (${META.bench[b][1]})`;

  function fill(sel, options, value) {
    sel.innerHTML = options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    sel.value = value;
  }
  fill($('f-model'), [['all', 'all models'], ...MODEL_ORDER.map(m => [m, META.models[m]])], 'gptoss-120b');
  fill($('f-bench'), [['all', 'all benchmarks'], ...BENCH_ORDER.map(b => [b, benchLabel(b)])], 'agentharm_harmless');
  fill($('f-method'), [['all', 'all methods'], ...METHOD_ORDER.map(m => [m, META.methods[m]])], 'all');

  // Signed colour: orange above the control, blue below; saturates at 40 points.
  function colour(d) {
    if (!finite(d)) return '#f1f2ee';
    const t = Math.min(1, Math.abs(d) / 40);
    const [r, g, b] = d >= 0 ? [231, 177, 140] : [159, 191, 219];
    const mix = (c, w) => Math.round(255 + (c - 255) * w);
    return `rgb(${mix(r, t)},${mix(g, t)},${mix(b, t)})`;
  }

  function selected() {
    const f = {model: $('f-model').value, bench: $('f-bench').value, method: $('f-method').value, label: $('f-label').value};
    const rows = ROWS.filter(r => (f.model === 'all' || r.model === f.model) && (f.bench === 'all' || r.bench === f.bench)
      && (f.method === 'all' || r.method === f.method) && (f.label === 'all' || label(r) === f.label));
    return [f, rows];
  }

  function cellHtml(r) {
    if (!r) return '<td class="gs-empty" aria-label="not planted">·</td>';
    const l = label(r);
    const tip = `${META.belief[r.belief]} · ${META.methods[r.method]}\nbelief ${pct(r.rate)} vs control ${pct(r.ref)}\n` +
      `difference ${pts(r.d)} ${ci(r)} points, p ${pfmt(r.p)} (${l})\n${r.tasks} tasks, ${r.runs} runs\n` +
      (r.taken_sampled !== null && r.taken_sampled !== undefined
        ? `sampled readout (API, not comparable with 'taken on'): ${fact(r.taken_sampled, 'rose', 'did not rise')}`
        : `taken on: ${fact(r.taken, 'yes', 'no')}`) +
      ` · halves: ${pts(r.h1)} / ${pts(r.h2)} (${fact(r.halves, 'agree', 'differ')})` +
      (r.poor_fit ? '\ntext flagged as a poor fit for this benchmark' : '');
    return `<td class="gs-cell${r.poor_fit ? ' poor' : ''}" style="background:${colour(r.d)}" title="${esc(tip)}">` +
      `<span class="v">${pts(r.d)}${l === 'Significant' ? ' ★' : ''}</span><span class="i">${ci(r)}</span>` +
      `<span class="f">${r.taken_sampled !== null && r.taken_sampled !== undefined ? 'sampled ' + fact(r.taken_sampled, '✓', '✗')
        : 'on ' + fact(r.taken, '✓', '✗')} · halves ${fact(r.halves, '✓', '✗')}</span></td>`;
  }

  function renderGrid(f, rows) {
    const grid = $('map-grid');
    if (f.model === 'all' || f.bench === 'all') {
      grid.innerHTML = '<p class="fine">Choose one model and one benchmark to see the belief × method grid.</p>';
      return;
    }
    if ((META.partial[f.model] || []).includes(f.bench)) {
      grid.innerHTML = `<p class="gs-running">${esc(META.models[f.model])}: ${esc(META.bench[f.bench][0])} is still running; no numbers yet.</p>`;
      return;
    }
    const methods = METHOD_ORDER.filter(m => rows.some(r => r.method === m));
    const beliefs = BELIEF_ORDER.filter(b => rows.some(r => r.belief === b));
    if (!rows.length) { grid.innerHTML = '<p class="fine">No cells match these filters.</p>'; return; }
    const at = new Map(rows.map(r => [`${r.belief}|${r.method}`, r]));
    let body = '', group = null;
    for (const b of beliefs) {
      const g = groupOf(b);
      if (g !== group) { group = g; body += `<tr class="group"><th colspan="${methods.length + 1}">${esc(g)}</th></tr>`; }
      body += `<tr><th scope="row">${esc(META.belief[b])}</th>${methods.map(m => cellHtml(at.get(`${b}|${m}`))).join('')}</tr>`;
    }
    const ctrl = m => {
      const rs = rows.filter(r => r.method === m && finite(r.ref));
      const refs = [...new Set(rs.map(r => r.ref.toFixed(0)))];
      return refs.length === 1 ? `control ${refs[0]}%` : `control ${Math.min(...rs.map(r => r.ref)).toFixed(0)}–${Math.max(...rs.map(r => r.ref)).toFixed(0)}%`;
    };
    grid.innerHTML = `<div class="table-scroll"><table class="bp-table gs-grid"><caption>${esc(META.models[f.model])} · ` +
      `${esc(benchLabel(f.bench))}: belief minus matched control, points</caption><thead><tr><th>Belief</th>` +
      methods.map(m => `<th>${esc(META.methods[m])}<span class="sub">${esc(ctrl(m))}</span></th>`).join('') +
      `</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderList(rows) {
    const sorted = rows.slice().sort((a, b) => MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model)
      || BENCH_ORDER.indexOf(a.bench) - BENCH_ORDER.indexOf(b.bench) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
      || BELIEF_ORDER.indexOf(a.belief) - BELIEF_ORDER.indexOf(b.belief));
    $('list-count').textContent = `${sorted.length} cells`;
    const head = ['Model', 'Benchmark', 'Method', 'Belief', 'Group', 'Belief rate', 'Control', 'Difference', 'p', 'Label <span class="sub">nominal, uncorrected p</span>',
      'Taken on', 'Sampled readout rose <span class="sub">API models; not pooled</span>', 'Halves', 'Tasks', 'Runs', 'Detectable'];
    const num = new Set([5, 6, 7, 8, 12, 13, 14, 15]);
    const body = sorted.map(r => '<tr>' + [esc(META.models[r.model]), esc(META.bench[r.bench][0]), esc(META.methods[r.method]),
      esc(META.belief[r.belief]) + (r.poor_fit ? ' <span class="sub">poor fit</span>' : ''), esc(groupOf(r.belief)),
      pct(r.rate), pct(r.ref), `${pts(r.d)} <span class="sub">${ci(r)}</span>`, pfmt(r.p), badge(label(r)),
      fact(r.taken, 'yes', 'no'), fact(r.taken_sampled, 'yes', 'no'),
      `${pts(r.h1)} / ${pts(r.h2)} <span class="sub">${fact(r.halves, 'agree', 'differ')}</span>`,
      r.tasks, r.runs, finite(r.mde) ? r.mde.toFixed(0) : '–'].map((c, i) => `<td${num.has(i) ? ' class="number"' : ''}>${c}</td>`).join('') + '</tr>');
    $('map-list').innerHTML = `<table class="bp-table gs-wide"><thead><tr>${head.map((h, i) => `<th${num.has(i) ? ' class="number"' : ''}>${h}</th>`).join('')}` +
      `</tr></thead><tbody>${body.join('')}</tbody></table>`;
  }

  function render() {
    const [f, rows] = selected();
    const n = {Significant: 0, 'Not significant': 0, Inconclusive: 0, Unavailable: 0};
    rows.forEach(r => { n[label(r)] += 1; });
    const running = f.model !== 'all' && f.bench !== 'all' && (META.partial[f.model] || []).includes(f.bench);
    $('map-note').textContent = running ? '' : `${rows.length} cells: ${n.Significant} nominally Significant, ${n['Not significant']} not significant` +
      (n.Inconclusive ? `, ${n.Inconclusive} inconclusive` : '') + (n.Unavailable ? `, ${n.Unavailable} unavailable` : '') +
      ' (uncorrected p; about 1 in 20 cells is Significant by chance alone).' + MODEL_ORDER
        .filter(m => (f.model === 'all' || f.model === m) && (META.partial[m] || []).some(b => f.bench === 'all' || f.bench === b))
        .map(m => ` ${META.models[m]}: ${META.partial[m].map(b => META.bench[b][0]).join(', ')} still running, not listed.`).join('') +
      (f.model !== 'all' && META.notes[f.model] ? ` ${META.models[f.model]}: ${META.notes[f.model]}` : '');
    renderGrid(f, rows);
    renderList(rows);
  }
  ['f-model', 'f-bench', 'f-method', 'f-label'].forEach(id => $(id).addEventListener('change', render));
  render();
})();
