'use strict';
const DATA = JSON.parse(document.getElementById('study-data').textContent);
const BENCHES = ['xstest', 'gsm8k', 'agentic_misalignment', 'agentharm'];
const BENCH_LABELS = ['XSTest', 'GSM8K', 'Agentic Misalignment', 'AgentHarm benign'];
const COMPARISONS = {no_edit: 'No edit', neutral: 'Matched neutral', recommendation: 'Recommendation'};
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const num = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'unknown';
const pct = (value, signed = false) => {
  if (!Number.isFinite(value)) return 'Unknown';
  const shown = Math.abs(value) <= 1e-12 ? 0 : value;
  return `${signed && shown > 0 ? '+' : ''}${(shown * 100).toFixed(2)}${signed ? ' pp' : '%'}`;
};
const interval = (values, signed = false) => Array.isArray(values) && values.every(Number.isFinite) ? `[${pct(values[0], signed)}, ${pct(values[1], signed)}]` : 'CI unavailable';
const usd = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? '$' + Number(value).toFixed(2) : 'unknown';
const shortName = belief => belief.name.replaceAll('_', ' ');
const validInterval = values => Array.isArray(values) && values.length === 2 && values.every(Number.isFinite);
const pValue = value => Number.isFinite(value) ? (value === 0 ? '0' : value < .0001 ? value.toExponential(2) : value.toFixed(4)) : 'not estimable';
const statisticsKey = cell => [cell.model, cell.benchmark, cell.belief_id, cell.method].join('|');
const statisticsIndexes = new WeakMap();

function selectedStatistics() {
  return DATA.statistics?.views?.[[$('protocol-filter').value, $('lexical-filter').value, $('comparison-filter').value].join('|')];
}

function statisticsCell(view, model, benchmark, belief, method) {
  if (!view) return undefined;
  if (!statisticsIndexes.has(view)) statisticsIndexes.set(view, new Map(view.cells.map(cell => [statisticsKey(cell), cell])));
  return statisticsIndexes.get(view).get([model, benchmark, belief, method].join('|'));
}

function signedColor(value, scale, background = false) {
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-12 || !(scale > 0)) return background ? '#fffefa' : '#66706f';
  const strength = Math.min(1, Math.abs(value) / scale);
  const base = value < 0 ? [39, 103, 155] : [179, 91, 24];
  const white = [255, 254, 250];
  const weight = background ? .08 + .3 * strength : .7 + .3 * strength;
  return `rgb(${base.map((channel, index) => Math.round(white[index] * (1 - weight) + channel * weight)).join(',')})`;
}

function testStatus(cell) {
  if (!cell) return 'Statistics unavailable';
  if (cell.status === 'no_task_variation') return 'No task variation; empirical interval is not proof of zero population uncertainty';
  if (cell.status === 'insufficient_clusters') return 'Insufficient task clusters';
  if (cell.status === 'incomplete_pairs') return 'Incomplete paired outcomes; observed-pair estimate / CI only, permutation p not estimable';
  if (cell.status === 'unknown') return 'Unknown / not estimable';
  if (validInterval(cell.ci95) && cell.ci95[0] === cell.ci95[1]) return 'Zero-width empirical interval; not proof of zero population uncertainty';
  return 'Estimable';
}

function significanceMark(cell) {
  return cell?.significant ? '<span class="significance" title="Holm-adjusted p ≤ .05 across 112 planned effects" aria-label="Holm-adjusted p at most .05">★</span>' : '';
}

function testDetails(cell) {
  return `<span class="count">Paired condition-label permutation p ${pValue(cell?.p_value)} · Holm p ${pValue(cell?.p_adjusted)} · family 112</span><span class="count">${escapeHTML(testStatus(cell))}</span>`;
}

function renderHeatmapKey(view, enabled, id = 'heatmap-key') {
  $(id).hidden = !enabled;
  if (!enabled) return;
  if (!view) {
    $(id).textContent = 'Cross-model signed scale unavailable; heatmap shading withheld.';
    return;
  }
  const scale = view.scale_max_abs;
  $(id).innerHTML = scale > 0
    ? `<span>Signed Δ · shared Luna / Terra scale · all 112 planned cells</span><span>Blue ${pct(-scale, true)}</span><span class="signed-ramp" aria-hidden="true"></span><span>Orange ${pct(scale, true)}</span><span>Zero = white cells / gray markers · unknowns labeled · ★ Holm p ≤ .05</span>`
    : '<span>Signed Δ · shared Luna / Terra scale: all estimable effects are zero, or no effects are available. No signed shading.</span>';
}

function renderOverview() {
  $('snapshot').textContent = `Updated ${new Date(DATA.built_at).toLocaleString('en-GB', {timeZone:'UTC'})} UTC · registry 2026-10-22.1`;
  const completed = Object.values(DATA.models).filter(model => model.status !== 'Running');
  $('run-summary').innerHTML = `<div class="table-scroll"><table class="run-table"><thead><tr><th>Model</th><th>Original-budget known</th><th>Recovered known</th><th>Native cost + unresolved reserve</th></tr></thead><tbody>${completed.map(model => `<tr><th>${escapeHTML(model.label)}</th><td>${num(model.views.protocol?.integrity.n_known)} / ${num(model.views.recovered.integrity.n_assigned)}</td><td>${num(model.views.recovered.integrity.n_known)} / ${num(model.views.recovered.integrity.n_assigned)}</td><td>${model.cost.available ? `${usd(model.cost.observed_usd)} + ${usd(model.cost.unresolved_reserved_usd)}` : 'Unknown'}</td></tr>`).join('')}<tr><th>Qwen3-32B</th><td colspan="3">Running · partial numerical performance withheld</td></tr></tbody></table></div>`;
}

function renderMetricGuide() {
  $('metric-guide').innerHTML = `<table><thead><tr><th>Benchmark / score</th><th>Per-trajectory scale (0–1)</th><th>Positive Δ</th><th>Negative Δ</th></tr></thead><tbody>${BENCHES.map((key, index) => {
    const metric = DATA.metrics[key];
    return `<tr><th>${escapeHTML(BENCH_LABELS[index])}<span class="belief-name">${escapeHTML(metric.label)}</span></th><td>${escapeHTML(metric.scale)}<br><span class="fine">${escapeHTML(metric.scope)}</span></td><td>${escapeHTML(metric.positive)}</td><td>${escapeHTML(metric.negative)}</td></tr>`;
  }).join('')}</tbody></table><p class="fine">Dashboard levels are task-weighted means × 100. Δ = 0 means unchanged on that recorded metric, not identical behavior.</p>`;
}


function cellHTML(cell, comparison, display, statistics, scale) {
  if (!cell) return '<td><span class="unknown">No aggregate available</span></td>';
  const delta = cell.contrasts?.[comparison];
  const signed = display === 'delta';
  const estimate = signed ? statistics : cell.task_cluster_mean;
  const point = signed ? (statistics ? statistics.estimate : delta?.estimate) : estimate?.estimate;
  const pairCounts = signed ? `<span class="count">Paired n=${num(delta?.n_observed_pairs)}/${num(delta?.n_assigned_pairs)} · <span class="${delta?.n_unknown_pairs ? 'unknown' : ''}">${num(delta?.n_unknown_pairs)} unknown pairs</span></span>` : '';
  const bounds = delta?.n_unknown_pairs > 0 ? `<span class="bound">All-assigned Δ bounds ${interval(delta.all_assigned_delta_bounds, true)}</span>` : '';
  const style = signed && statistics ? ` style="background:${signedColor(point, scale, true)}"` : '';
  return `<td data-benchmark="${escapeHTML(cell.benchmark)}"${style}><div class="metric-value">${pct(point, signed)} ${signed ? significanceMark(statistics) : ''}</div><div class="interval">${signed ? 'Bootstrap' : 'Normal'} 95% CI ${interval(estimate?.ci95, signed)}</div>${signed && statistics?.status === 'no_task_variation' ? '<span class="count">No task variation</span>' : ''}<details class="cell-details"><summary>n=${num(cell.n_observed)}/${num(cell.n_assigned)}${cell.n_unknown ? ` · ${num(cell.n_unknown)} unknown` : ''} · details</summary>${pairCounts}<span class="count">${num(estimate?.n_task_clusters ?? (signed ? delta?.n_task_clusters : undefined))} original-task clusters</span>${signed ? testDetails(statistics) : ''}${bounds}</details></td>`;
}

function recoveryNote(model, view) {
  if (model.status === 'Running') return 'Qwen P1/P2 and P3 are running. P1/P2: 35,600 assignments. P3: 18,000 additional assignments, using recorded baseline reasoning prefixes. Partial performance is withheld.';
  if (model.label === 'Luna') return 'Luna: both views are identical; connection repairs retained the original 4,096-token allowance.';
  const counts = model.recovery?.counts;
  if (!counts) return 'Recovery metadata unavailable. Unknown scores remain unknown; recovered data are never silently substituted for the original-budget view.';
  const policy = view === 'protocol' ? 'Original-budget default: ten output-censored trajectories remain unknown; same-budget connection repairs are included.' : 'Completion-recovered sensitivity view: includes adaptive 8,192-token repairs only for originally output-censored trajectories, not a uniform-budget experiment.';
  return `${policy} Original failures: one APIConnectionError, one APITimeoutError, ten output limits (all AgentHarm). ${num(counts.known_after_retry)}/${num(counts.eligible)} retries recovered: ${num(counts.n_connection_retries)} at 4,096 tokens and ${num(counts.n_output_limit_retries)} at 8,192. Incremental cost: ${usd(model.recovery.cost?.incremental_observed_usd)}.`;
}

function renderReferences(summary, comparison) {
  const controls = comparison === 'no_edit' ? [null] : ['P1', 'P2'];
  $('reference-table').innerHTML = `<table class="reference-grid"><caption>${escapeHTML(COMPARISONS[comparison])} · equal-original-task native levels</caption><thead><tr><th scope="col">Reference</th>${BENCH_LABELS.map(name => `<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${controls.map(method => `<tr><th scope="row">${escapeHTML(COMPARISONS[comparison])}${method ? ` · ${method}` : ' · shared P1/P2'}</th>${BENCHES.map(benchmark => {
    if (!summary) return '<td class="running">Running</td>';
    const cell = summary.cells.find(candidate => candidate.benchmark === benchmark && candidate.control === comparison && (method === null || candidate.method === method));
    return cell ? `<td><strong>${pct(cell.task_cluster_mean?.estimate)}</strong><div class="interval">95% CI ${interval(cell.task_cluster_mean?.ci95)}</div><span class="count">n=${num(cell.n_observed)}/${num(cell.n_assigned)} · ${num(cell.n_unknown)} unknown</span></td>` : '<td>Unknown / unavailable</td>';
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderMatrix() {
  const model = DATA.models[$('model-filter').value];
  const view = $('protocol-filter').value;
  const lexical = $('lexical-filter').value;
  const comparison = $('comparison-filter').value;
  const display = $('display-filter').value;
  const summary = model.views[view];
  const statistics = selectedStatistics();
  // Global analysis controls also govern the completed-model charts when Qwen is selected.
  $('display-filter').disabled = model.status === 'Running';
  renderHeatmapKey(statistics, display === 'delta' && model.status !== 'Running');
  $('recovery-note').textContent = recoveryNote(model, view);
  $('recovery-note').classList.toggle('warning', model.label === 'Terra');
  if (model.status === 'Running') {
    $('matrix-context').textContent = 'Qwen3-32B · full P1/P2 grid · Running';
    $('matrix-caption').textContent = 'Qwen3-32B P1/P2 · full grid · Running; partial numerical performance withheld';
    $('matrix-body').innerHTML = DATA.beliefs.map(belief => ['P1', 'P2'].map((method, index) => `<tr class="${index === 0 ? 'belief-start' : ''}" data-belief="${escapeHTML(belief.id)}" data-method="${method}"><th scope="row">${escapeHTML(belief.id)}<span class="belief-name">${escapeHTML(shortName(belief))}</span><span class="method">${method}</span></th>${BENCHES.map(benchmark => `<td class="running" data-benchmark="${benchmark}">Running</td>`).join('')}</tr>`).join('')).join('');
    renderReferences(null, comparison);
    return;
  }
  if (!summary) {
    $('matrix-context').textContent = `${model.label}: original-budget aggregate unavailable. Select completion-recovered to inspect that separate view.`;
    $('matrix-body').innerHTML = '<tr><td colspan="5">Original-budget data unavailable—no recovered data are substituted.</td></tr>';
    $('reference-table').textContent = 'Reference data unavailable for this view.';
    return;
  }
  const viewLabel = view === 'protocol' ? 'original 4,096-token budget' : 'completion-recovered';
  $('matrix-context').textContent = `${model.label} · ${viewLabel} · ${lexical} · ${COMPARISONS[comparison]} · ${num(summary.integrity.n_known)}/${num(summary.integrity.n_assigned)} known native scores`;
  $('matrix-caption').textContent = `${model.label}: ${display === 'delta' ? 'paired treatment − reference differences (pp)' : 'equal-original-task native score levels (%)'} · ${lexical} · ${viewLabel}`;
  $('matrix-body').innerHTML = DATA.beliefs.map(belief => ['P1', 'P2'].map((method, index) => `<tr class="${index === 0 ? 'belief-start' : ''}" data-belief="${escapeHTML(belief.id)}" data-method="${method}"><th scope="row">${escapeHTML(belief.id)}<span class="belief-name">${escapeHTML(shortName(belief))}</span><span class="method">${method} · ${method === 'P1' ? 'metadata' : 'system'}</span></th>${BENCHES.map(benchmark => cellHTML(summary.cells.find(cell => cell.control === 'belief' && cell.belief_id === belief.id && cell.method === method && cell.benchmark === benchmark && cell.phrasing === lexical), comparison, display, statisticsCell(statistics, $('model-filter').value, benchmark, belief.id, method), statistics?.scale_max_abs)).join('')}</tr>`).join('')).join('');
  renderReferences(summary, comparison);
}


const SVG_NS = 'http://www.w3.org/2000/svg';
const MODEL_LABELS = {luna: 'Luna', terra: 'Terra'};
const CHART_PROMPT = 'Select a plotted point (Tab then Enter, pointer or touch) to inspect estimates, paired counts and tests.';

function svgText(x, y, text, attributes = '') {
  return `<text x="${x}" y="${y}" ${attributes}>${escapeHTML(text)}</text>`;
}

function svgLine(x1, y1, x2, y2, className = 'grid-line') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
}

function svgSymbol(x, y, square, color, size = 4) {
  return square
    ? `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" fill="${color}" class="point-symbol"/>`
    : `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" class="point-symbol"/>`;
}

function svgFrame(id, title, description, width, height, content) {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" role="group" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${escapeHTML(title)}</title><desc id="${id}-description">${escapeHTML(description)}</desc>${content}</svg>`;
}

function beliefLabel(id) {
  const belief = DATA.beliefs.find(item => item.id === id);
  return belief ? `${id} · ${shortName(belief)}` : id;
}

function effectDescription(cell) {
  return `${MODEL_LABELS[cell.model]} · ${beliefLabel(cell.belief_id)} · ${BENCH_LABELS[BENCHES.indexOf(cell.benchmark)]} · ${cell.method}: ${pct(cell.estimate, true)}; pointwise bootstrap 95% CI ${interval(cell.ci95, true)}; Holm p ${pValue(cell.p_adjusted)}; ${testStatus(cell)}`;
}

function effectDetailsHTML(cell) {
  const metric = DATA.metrics[cell.benchmark];
  const meaning = !Number.isFinite(cell.estimate) ? 'Unknown effect' : Math.abs(cell.estimate) <= 1e-12 ? 'No measured score change' : cell.estimate > 0 ? metric.positive : metric.negative;
  return `<p><strong>${escapeHTML(MODEL_LABELS[cell.model])} · ${escapeHTML(beliefLabel(cell.belief_id))} · ${escapeHTML(cell.method)}</strong><br>${escapeHTML(BENCH_LABELS[BENCHES.indexOf(cell.benchmark)])} · ${escapeHTML(metric.label)}<br>Δ ${pct(cell.estimate, true)} ${significanceMark(cell)} · pointwise bootstrap 95% CI ${interval(cell.ci95, true)}<br>${escapeHTML(meaning)}. ${escapeHTML(metric.scope)}<br>Paired n=${num(cell.n_observed_pairs)}/${num(cell.n_assigned_pairs)} · ${num(cell.n_task_clusters)} original-task clusters${testDetails(cell)}</p>`;
}

function effectsTable(cells, caption) {
  if (!cells.length) return '<p class="fine">No effect statistics available for this selection.</p>';
  return `<table class="effect-data"><caption>${escapeHTML(caption)}</caption><thead><tr><th scope="col">Belief / benchmark / method / model</th><th scope="col">Δ · pp</th><th scope="col">Pointwise bootstrap 95% CI · pp</th><th scope="col">Paired n / assigned; clusters</th><th scope="col">Condition-label permutation p</th><th scope="col">Holm p · family 112</th><th scope="col">Status</th></tr></thead><tbody>${cells.map(cell => `<tr><th scope="row">${escapeHTML(beliefLabel(cell.belief_id))}<span class="belief-name">${escapeHTML(BENCH_LABELS[BENCHES.indexOf(cell.benchmark)])}<br>${escapeHTML(cell.method)} · ${escapeHTML(MODEL_LABELS[cell.model])}</span></th><td>${pct(cell.estimate, true)} ${significanceMark(cell)}</td><td>${interval(cell.ci95, true)}</td><td>${num(cell.n_observed_pairs)}/${num(cell.n_assigned_pairs)}; ${num(cell.n_task_clusters)} clusters</td><td>${pValue(cell.p_value)}</td><td>${pValue(cell.p_adjusted)}</td><td>${escapeHTML(testStatus(cell))}</td></tr>`).join('')}</tbody></table>`;
}

function bindPointDetails(container, detail, records) {
  detail.textContent = CHART_PROMPT;
  const reveal = target => {
    const point = target.closest?.('[data-detail]');
    if (!point || !container.contains(point)) return;
    const record = records[Number(point.dataset.detail)];
    if (!record) return;
    container.querySelector('.selected-point')?.classList.remove('selected-point');
    point.classList.add('selected-point');
    detail.innerHTML = record.html;
  };
  container.onpointerover = event => reveal(event.target);
  container.onfocusin = event => reveal(event.target);
  container.onclick = event => reveal(event.target);
  container.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target.closest?.('[data-detail]')) {
        event.preventDefault();
        reveal(event.target);
      }
    } else if (event.key === 'Escape') {
      container.querySelector('.selected-point')?.classList.remove('selected-point');
      detail.textContent = CHART_PROMPT;
    }
  };
}

function interactivePoint(index, description, detailId, content) {
  return `<g class="chart-point" data-detail="${index}" tabindex="0" role="button" aria-controls="${detailId}" aria-label="${escapeHTML(description)}"><title>${escapeHTML(description)}</title>${content}</g>`;
}

const DIRECTION_LABELS = {
  positive: 'Both ↑', negative: 'Both ↓', opposite: 'Opposite directions',
  one_zero: 'One zero', both_zero: 'Both zero · no directional evidence', unknown: 'Unknown'
};

function directionAgreement(point) {
  if (!point || !Number.isFinite(point.luna) || !Number.isFinite(point.terra)) return 'unknown';
  const a = Math.abs(point.luna) <= 1e-12 ? 0 : Math.sign(point.luna);
  const b = Math.abs(point.terra) <= 1e-12 ? 0 : Math.sign(point.terra);
  if (a === 0 && b === 0) return 'both_zero';
  if (a === 0 || b === 0) return 'one_zero';
  return a === b ? (a > 0 ? 'positive' : 'negative') : 'opposite';
}

function modelDifferenceHTML(point) {
  const gap = point?.model_difference;
  return `<p><strong>Between-model effect difference: Terra Δ − Luna Δ</strong><br>${pct(gap?.estimate, true)} · pointwise joint-bootstrap 95% CI ${interval(gap?.ci95, true)}<br>${num(gap?.n_bootstrap_valid)} valid joint draws · ${escapeHTML(gap?.status?.replaceAll('_', ' ') || 'unknown')}<br>Not a difference in raw scores. This interval is not multiplicity-adjusted; containing zero does not establish equal effects.</p>`;
}

function profileCellHTML(view, benchmark, belief, method) {
  const point = view.points.find(item => item.benchmark === benchmark && item.belief_id === belief.id && item.method === method);
  const cells = ['luna', 'terra'].map(model => statisticsCell(view, model, benchmark, belief.id, method)).filter(Boolean);
  return `<td data-benchmark="${benchmark}">${['luna', 'terra'].map(model => {
    const cell = cells.find(item => item.model === model);
    return `<div class="belief-estimate" style="background:${signedColor(cell?.estimate, view.scale_max_abs, true)}"><span>${MODEL_LABELS[model]}</span><strong>${pct(cell?.estimate, true)} ${significanceMark(cell)}</strong></div>`;
  }).join('')}<span class="profile-direction">${DIRECTION_LABELS[directionAgreement(point)]}</span><details class="cell-details"><summary>Intervals &amp; model difference</summary>${cells.map(effectDetailsHTML).join('')}${modelDifferenceHTML(point)}</details></td>`;
}

function renderBeliefProfiles(view, method) {
  const beliefId = $('profile-belief').value;
  const methods = method === 'all' ? ['P1', 'P2'] : [method];
  $('profile-context').textContent = `${$('protocol-filter').selectedOptions[0].textContent} · ${$('lexical-filter').selectedOptions[0].textContent} · reference: ${COMPARISONS[$('comparison-filter').value]}. Both models are shown; no benchmark averaging.`;
  renderHeatmapKey(view, true, 'profile-heatmap-key');
  if (!view) {
    for (const id of ['belief-matrix', 'profile-chart', 'profile-detail', 'profile-table', 'profile-agreement']) $(id).textContent = 'Statistics unavailable for this view.';
    return;
  }
  $('belief-matrix').innerHTML = `<table class="belief-grid"><caption>Every belief across four benchmarks · Luna and Terra Δ in percentage points</caption><thead><tr><th scope="col">Belief / planting</th>${BENCHES.map((benchmark, index) => `<th scope="col">${escapeHTML(BENCH_LABELS[index])}<span class="belief-name">${escapeHTML(DATA.metrics[benchmark].label)}${benchmark === 'agentharm' ? ' · NOT safety' : ''}</span></th>`).join('')}</tr></thead><tbody>${DATA.beliefs.map(belief => methods.map(placement => `<tr data-belief="${escapeHTML(belief.id)}" data-method="${placement}"${belief.id === beliefId ? ' class="selected-belief"' : ''}><th scope="row"><button type="button" class="belief-select" data-belief="${escapeHTML(belief.id)}" aria-pressed="${belief.id === beliefId}" aria-label="View ${escapeHTML(beliefLabel(belief.id))} across benchmarks">${escapeHTML(belief.id)}</button><span class="belief-name">${escapeHTML(shortName(belief))}</span><span class="method">${placement}</span></th>${BENCHES.map(benchmark => profileCellHTML(view, benchmark, belief, placement)).join('')}</tr>`).join('')).join('')}</tbody></table>`;
  $('belief-matrix').onclick = event => {
    const button = event.target.closest('button[data-belief]');
    if (!button) return;
    $('profile-belief').value = button.dataset.belief;
    renderBeliefProfiles(view, method);
    $('profile-heading').tabIndex = -1;
    $('profile-heading').focus();
    $('profile-heading').scrollIntoView({block: 'start'});
  };
  $('profile-agreement').innerHTML = methods.map(placement => {
    const points = view.points.filter(point => point.belief_id === beliefId && point.method === placement);
    const counts = Object.fromEntries(Object.keys(DIRECTION_LABELS).map(key => [key, 0]));
    for (const point of points) counts[directionAgreement(point)]++;
    return `<p><strong>${escapeHTML(beliefId)} · ${placement}</strong> · ${points.length} benchmarks: ${counts.positive + counts.negative} same nonzero direction / ${counts.opposite} opposite / ${counts.one_zero} one zero / ${counts.both_zero} both zero / ${counts.unknown} unknown.</p>`;
  }).join('') + '<p class="fine">These counts describe point estimates, not significance, equivalent magnitudes, or independent replications.</p>';
  const rows = BENCHES.flatMap((benchmark, index) => methods.map(placement => ({
    benchmark, belief_id: beliefId, method: placement,
    label: `${BENCH_LABELS[index]} · ${placement}`, sublabel: DATA.metrics[benchmark].label
  })));
  renderPairedPlot(view, rows, `${beliefLabel(beliefId)} · across benchmarks`, 'profile');
}

function renderPairedPlot(view, rows, title, id) {
  const cells = rows.flatMap(row => ['luna', 'terra'].map(model => statisticsCell(view, model, row.benchmark, row.belief_id, row.method)).filter(Boolean));
  const profile = id === 'profile';
  // A fixed range across beliefs makes switching profile selections comparable.
  const rangeCells = profile ? view.cells.filter(cell => rows.some(row => row.method === cell.method)) : cells;
  const values = rangeCells.flatMap(cell => [cell.estimate, ...(validInterval(cell.ci95) ? cell.ci95 : [])]).filter(Number.isFinite);
  const limit = Math.max(.01, ...values.map(Math.abs)) * 1.12;
  const width = 1000, left = profile ? 310 : 185, right = 90, top = 48, rowHeight = profile ? 60 : 46;
  const bottom = top + rows.length * rowHeight;
  const height = bottom + 65;
  const x = value => left + (value + limit) / (2 * limit) * (width - left - right);
  const records = [];
  let content = '';
  for (const fraction of [-1, -.5, 0, .5, 1]) {
    const value = fraction * limit;
    content += svgLine(x(value), top - 15, x(value), bottom, fraction === 0 ? 'zero-line' : 'grid-line');
    content += svgText(x(value), bottom + 24, (value * 100).toFixed(1), 'text-anchor="middle"');
  }
  content += svgText((left + width - right) / 2, height - 10, 'Paired Δ (percentage points)', 'text-anchor="middle"');
  content += svgText(left, 20, '● Luna     ■ Terra     whiskers: pointwise bootstrap 95% CI');
  rows.forEach((row, rowIndex) => {
    const center = top + rowIndex * rowHeight + rowHeight / 2;
    content += svgLine(left, center + rowHeight / 2, width - right, center + rowHeight / 2, 'row-line');
    content += svgText(left - 15, center + (row.sublabel ? -4 : 4), row.label, 'text-anchor="end" class="belief-axis-label"');
    if (row.sublabel) content += svgText(left - 15, center + 12, row.sublabel, 'text-anchor="end" class="metric-axis-label"');
    ['luna', 'terra'].forEach((model, modelIndex) => {
      const cell = statisticsCell(view, model, row.benchmark, row.belief_id, row.method);
      const y = center + (modelIndex === 0 ? -8 : 8);
      if (!cell || !Number.isFinite(cell.estimate)) {
        content += svgText(left + 8, y + 4, `${MODEL_LABELS[model]}: unknown`, 'class="missing-label"');
        return;
      }
      const color = signedColor(cell.estimate, view.scale_max_abs);
      let mark = '';
      if (validInterval(cell.ci95)) {
        const lo = x(cell.ci95[0]), hi = x(cell.ci95[1]);
        mark += `<path d="M${lo},${y}H${hi}M${lo},${y - 4}V${y + 4}M${hi},${y - 4}V${y + 4}" stroke="${color}" class="ci-whisker"/>`;
      }
      const cx = x(cell.estimate);
      mark += `<rect x="${cx - 11}" y="${y - 8}" width="22" height="16" class="point-hit"/>`;
      mark += svgSymbol(cx, y, model === 'terra', color);
      if (cell.significant) mark += svgText(cx + 9, y + 4, '★', 'class="significance-symbol"');
      const point = profile ? view.points.find(item => item.benchmark === row.benchmark && item.belief_id === row.belief_id && item.method === row.method) : null;
      records.push({html: effectDetailsHTML(cell) + (profile ? modelDifferenceHTML(point) : '')});
      content += interactivePoint(records.length - 1, effectDescription(cell), `${id}-detail`, mark);
    });
  });
  $(`${id}-heading`).textContent = title;
  $(`${id}-chart`).innerHTML = svgFrame(id, `${title}: Luna and Terra paired effects`, 'Categorical rows; no line joins different benchmarks or beliefs. Circle: Luna; square: Terra. Horizontal intervals are pointwise 95% task-bootstrap CIs. Signed native effects are not safety-normalized. Select points for benchmark meanings, estimates, counts and tests.', width, height, content);
  bindPointDetails($(`${id}-chart`), $(`${id}-detail`), records);
  if (!records.length) $(`${id}-detail`).textContent = 'No estimable paired effects for this selection; unknown scores have not been plotted as zero.';
  $(`${id}-table`).innerHTML = effectsTable(cells, `${title} · Luna and Terra`);
}

function renderEffectPlot(view, method) {
  const benchmark = $('chart-benchmark').value;
  const methods = method === 'all' ? ['P1', 'P2'] : [method];
  const rows = DATA.beliefs.flatMap(belief => methods.map(placement => ({
    benchmark, belief_id: belief.id, method: placement, label: `${belief.id} · ${placement}`
  })));
  renderPairedPlot(view, rows, `${BENCH_LABELS[BENCHES.indexOf(benchmark)]} · ${DATA.metrics[benchmark].label} · across beliefs`, 'effect');
}

function correlationHTML(correlation, label) {
  if (!correlation) return `<p><strong>${escapeHTML(label)}</strong><br>Correlation statistics unavailable.</p>`;
  const reasons = {
    constant_profile: 'Undefined / not estimable: at least one model profile is constant (including all-zero profiles).',
    insufficient_cells: 'Not estimable: insufficient matched cells.',
    insufficient_bootstrap: 'Interval unavailable: insufficient valid joint-bootstrap draws.'
  };
  const r = Number.isFinite(correlation.pearson_r) ? correlation.pearson_r.toFixed(3) : 'undefined';
  const ci = validInterval(correlation.ci95) ? `[${correlation.ci95.map(value => value.toFixed(3)).join(', ')}]` : 'unavailable';
  return `<p><strong>${escapeHTML(label)}</strong><br>Pearson r = ${r} · pointwise 95% task-bootstrap CI ${ci}<br>${num(correlation.n_cells)} matched cells · ${num(correlation.n_bootstrap_valid)}/${num(DATA.statistics?.method?.bootstrap_draws)} valid bootstrap draws${reasons[correlation.status] ? `<br><span class="degeneracy">${reasons[correlation.status]}</span>` : ''}<br>Both nonzero: ${num(correlation.same_sign)} same sign / ${num(correlation.opposite_sign)} opposite sign.<br>Zero-effect pairs (excluded above): ${num(correlation.one_zero)} one zero / ${num(correlation.both_zero)} both zero.</p>`;
}

function renderScatter(view, benchmark, method) {
  const benchmarkIndex = BENCHES.indexOf(benchmark);
  const points = view.points.filter(point => point.benchmark === benchmark && (method === 'all' || point.method === method));
  const finite = points.filter(point => Number.isFinite(point.luna) && Number.isFinite(point.terra));
  const limit = Math.max(.01, ...finite.flatMap(point => [Math.abs(point.luna), Math.abs(point.terra)])) * 1.15;
  const width = 440, height = 390, left = 66, top = 24, side = 292;
  const x = value => left + (value + limit) / (2 * limit) * side;
  const y = value => top + (limit - value) / (2 * limit) * side;
  const groups = new Map();
  for (const point of finite) {
    // Group exact numerical coincidences without jitter; the full table also exposes near overlaps.
    const key = `${point.luna.toFixed(12)}|${point.terra.toFixed(12)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  let content = '';
  for (const fraction of [-1, -.5, 0, .5, 1]) {
    const value = fraction * limit;
    content += svgLine(x(value), top, x(value), top + side, fraction === 0 ? 'zero-line' : 'grid-line');
    content += svgLine(left, y(value), left + side, y(value), fraction === 0 ? 'zero-line' : 'grid-line');
    content += svgText(x(value), top + side + 23, (value * 100).toFixed(1), 'text-anchor="middle"');
    content += svgText(left - 9, y(value) + 4, (value * 100).toFixed(1), 'text-anchor="end"');
  }
  content += svgLine(x(-limit), y(-limit), x(limit), y(limit), 'identity-line');
  content += svgText(left + side / 2, height - 20, 'Luna Δ (pp)', 'text-anchor="middle"');
  content += svgText(17, top + side / 2, 'Terra Δ (pp)', `text-anchor="middle" transform="rotate(-90 17 ${top + side / 2})"`);
  const records = [];
  for (const group of groups.values()) {
    const point = group[0], cx = x(point.luna), cy = y(point.terra);
    const cells = group.flatMap(item => ['luna', 'terra'].map(model => statisticsCell(view, model, benchmark, item.belief_id, item.method)).filter(Boolean));
    const names = group.map(item => `${beliefLabel(item.belief_id)} · ${item.method}`).join('; ');
    const description = `${names}. Luna ${pct(point.luna, true)}, Terra ${pct(point.terra, true)}. ${group.length > 1 ? `${group.length} coincident points; select to inspect all.` : 'Select for intervals, counts and tests.'}`;
    let mark = `<circle cx="${cx}" cy="${cy}" r="12" class="point-hit"/>`;
    if (group.length > 1) {
      mark += `<circle cx="${cx}" cy="${cy}" r="10" class="grouped-point"/>`;
      mark += svgText(cx, cy + 4, group.length, 'text-anchor="middle" class="group-count"');
    } else {
      mark += svgSymbol(cx, cy, point.method === 'P2', '#45555d', 5);
    }
    records.push({html: `<p><strong>${group.length} matched ${group.length === 1 ? 'point' : 'points'} at Luna ${pct(point.luna, true)} / Terra ${pct(point.terra, true)}</strong></p>${cells.map(effectDetailsHTML).join('')}`});
    content += interactivePoint(records.length - 1, description, `scatter-detail-${benchmark}`, mark);
  }
  if (!finite.length) content += svgText(left + side / 2, top + side / 2 - 18, 'No matched estimable points', 'text-anchor="middle"');
  const title = `${BENCH_LABELS[benchmarkIndex]} · ${DATA.metrics[benchmark].label}`;
  const chart = $(`scatter-chart-${benchmark}`);
  chart.innerHTML = svgFrame(`scatter-${benchmark}`, `${title}: cross-model paired effects`, 'Each marker is a matched belief and method. Both axes use identical limits in percentage points. Dashed line is y equals x; solid central lines are zero. Circles mark P1, squares mark P2, numbered rings group coincident points. All points can be inspected in the data table.', width, height, content);
  bindPointDetails(chart, $(`scatter-detail-${benchmark}`), records);
  if (!records.length) $(`scatter-detail-${benchmark}`).textContent = 'No matched finite Luna / Terra effects; unknown scores have not been plotted as zero.';
  $(`scatter-correlation-${benchmark}`).innerHTML = correlationHTML(view.correlations?.[method]?.[benchmark], `Within-benchmark · ${method === 'all' ? 'P1 + P2' : method}`) + `<p class="fine">${num(points.length - finite.length)} matched cells omitted for missing model estimates.</p>`;
  const allCells = points.flatMap(point => ['luna', 'terra'].map(model => statisticsCell(view, model, benchmark, point.belief_id, point.method)).filter(Boolean));
  $(`scatter-table-${benchmark}`).innerHTML = effectsTable(allCells, `${title} · all displayed matched effects, including unknowns`);
}

function renderCharts() {
  const view = selectedStatistics();
  const method = $('chart-method').value;
  renderBeliefProfiles(view, method);
  renderHeatmapKey(view, true, 'chart-heatmap-key');
  const protocol = $('protocol-filter').selectedOptions[0].textContent;
  const lexical = $('lexical-filter').selectedOptions[0].textContent;
  const comparison = COMPARISONS[$('comparison-filter').value];
  $('chart-context').textContent = `Luna + Terra · ${protocol} · ${lexical} · reference: ${comparison}. Matrix model and score/delta mode do not change these paired-effect charts.`;
  const metadata = DATA.statistics?.method;
  $('statistics-sampling').textContent = metadata
    ? `Pointwise 95% percentile task-cluster bootstrap intervals use ${num(metadata.bootstrap_draws)} deterministic draws (seed ${num(metadata.seed)}). Original-task clusters are jointly resampled across both models and all belief / method / control conditions; benchmark families are resampled independently. Paired condition-label permutation tests enumerate reference-label allocations when at most 65,536 combinations are possible; otherwise they use ${num(metadata.permutation_draws)} deterministic random allocations with a +1 Monte Carlo correction.`
    : 'Statistical metadata unavailable.';
  if (!view) {
    $('effect-chart').textContent = 'Cross-model statistics unavailable for this protocol / wording / reference view. No alternative view is substituted.';
    $('effect-detail').textContent = '';
    $('effect-table').textContent = 'Statistics unavailable.';
    $('pooled-correlation').textContent = 'Pooled correlation unavailable.';
    $('scatter-panels').textContent = 'Per-benchmark correlations unavailable.';
    return;
  }
  renderEffectPlot(view, method);
  $('pooled-correlation').innerHTML = correlationHTML(view.correlations?.[method]?.all, `Pooled across four mixed native metrics · descriptive only · ${method === 'all' ? 'P1 + P2' : method}`);
  $('scatter-panels').innerHTML = BENCHES.map((benchmark, index) => `
    <article class="scatter-panel" aria-labelledby="scatter-heading-${benchmark}">
      <h4 id="scatter-heading-${benchmark}">${escapeHTML(BENCH_LABELS[index])}</h4>
      <p class="scatter-metric">${escapeHTML(DATA.metrics[benchmark].label)}${benchmark === 'agentharm' ? ' · NOT safety' : ''}</p>
      <div id="scatter-chart-${benchmark}" class="scatter-chart"></div>
      <div id="scatter-correlation-${benchmark}" class="correlation-summary"></div>
      <div id="scatter-detail-${benchmark}" class="chart-detail" tabindex="0" role="region" aria-label="${escapeHTML(BENCH_LABELS[index])} selected point details" aria-live="polite"></div>
      <details><summary>All matched point details</summary><div id="scatter-table-${benchmark}" class="table-scroll" tabindex="0" role="region" aria-label="${escapeHTML(BENCH_LABELS[index])} matched effect estimates and tests"></div></details>
    </article>`).join('');
  for (const benchmark of BENCHES) renderScatter(view, benchmark, method);
}

renderOverview();
renderMetricGuide();
$('profile-belief').innerHTML = DATA.beliefs.map(belief => `<option value="${escapeHTML(belief.id)}">${escapeHTML(beliefLabel(belief.id))}</option>`).join('');
$('profile-belief').addEventListener('change', () => renderBeliefProfiles(selectedStatistics(), $('chart-method').value));
for (const id of ['model-filter', 'display-filter']) $(id).addEventListener('change', renderMatrix);
for (const id of ['protocol-filter', 'lexical-filter', 'comparison-filter']) $(id).addEventListener('change', () => {
  renderMatrix();
  renderCharts();
});
for (const id of ['chart-benchmark', 'chart-method']) $(id).addEventListener('change', renderCharts);
renderMatrix();
renderCharts();
