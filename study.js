'use strict';
const DATA = JSON.parse(document.getElementById('study-data').textContent);
const BENCHES = ['xstest', 'gsm8k', 'agentic_misalignment', 'agentharm'];
const BENCH_LABELS = ['XSTest', 'GSM8K', 'Agentic Misalignment', 'AgentHarm benign'];
const COMPARISONS = {no_edit: 'No edit', neutral: 'Matched neutral', recommendation: 'Recommendation'};
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const num = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'unknown';
const pct = (value, signed = false) => Number.isFinite(value) ? `${signed && value > 0 ? '+' : ''}${(value * 100).toFixed(2)}${signed ? ' pp' : '%'}` : 'Unknown';
const interval = (values, signed = false) => Array.isArray(values) && values.every(Number.isFinite) ? `[${pct(values[0], signed)}, ${pct(values[1], signed)}]` : 'CI unavailable';
const usd = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? '$' + Number(value).toFixed(2) : 'unknown';
const shortName = belief => belief.name.replaceAll('_', ' ');

function renderOverview() {
  $('snapshot').textContent = `Updated ${new Date(DATA.built_at).toLocaleString('en-GB', {timeZone:'UTC'})} UTC · registry 2026-10-22.1`;
  const completed = Object.values(DATA.models).filter(model => model.status !== 'Running');
  $('run-summary').innerHTML = `<div class="table-scroll"><table class="run-table"><thead><tr><th>Model</th><th>Original-budget known</th><th>Recovered known</th><th>Native cost + unresolved reserve</th></tr></thead><tbody>${completed.map(model => `<tr><th>${escapeHTML(model.label)}</th><td>${num(model.views.protocol?.integrity.n_known)} / ${num(model.views.recovered.integrity.n_assigned)}</td><td>${num(model.views.recovered.integrity.n_known)} / ${num(model.views.recovered.integrity.n_assigned)}</td><td>${model.cost.available ? `${usd(model.cost.observed_usd)} + ${usd(model.cost.unresolved_reserved_usd)}` : 'Unknown'}</td></tr>`).join('')}<tr><th>Qwen3-32B</th><td colspan="3">Running · partial numerical performance withheld</td></tr></tbody></table></div>`;
}


function cellHTML(cell, comparison, display) {
  if (!cell) return '<td><span class="unknown">No aggregate available</span></td>';
  const delta = cell.contrasts?.[comparison];
  const estimate = display === 'delta' ? delta : cell.task_cluster_mean;
  const signed = display === 'delta';
  const point = estimate?.estimate;
  const pairCounts = signed ? `<span class="count">Paired n=${num(delta?.n_observed_pairs)}/${num(delta?.n_assigned_pairs)} · <span class="${delta?.n_unknown_pairs ? 'unknown' : ''}">${num(delta?.n_unknown_pairs)} unknown pairs</span></span>` : '';
  const bounds = delta?.n_unknown_pairs > 0 ? `<span class="bound">All-assigned Δ bounds ${interval(delta.all_assigned_delta_bounds, true)}</span>` : '';
  return `<td data-benchmark="${escapeHTML(cell.benchmark)}"><div class="metric-value">${pct(point, signed)}</div><div class="interval">95% CI ${interval(estimate?.ci95, signed)}</div><details class="cell-details"><summary>n=${num(cell.n_observed)}/${num(cell.n_assigned)}${cell.n_unknown ? ` · ${num(cell.n_unknown)} unknown` : ''}</summary>${pairCounts}<span class="count">${num(estimate?.n_task_clusters)} original-task clusters</span>${bounds}</details></td>`;
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
  for (const id of ['protocol-filter', 'lexical-filter', 'comparison-filter', 'display-filter']) {
    $(id).disabled = model.status === 'Running';
    $(id).closest('label').hidden = model.status === 'Running';
  }
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
  $('matrix-body').innerHTML = DATA.beliefs.map(belief => ['P1', 'P2'].map((method, index) => `<tr class="${index === 0 ? 'belief-start' : ''}" data-belief="${escapeHTML(belief.id)}" data-method="${method}"><th scope="row">${escapeHTML(belief.id)}<span class="belief-name">${escapeHTML(shortName(belief))}</span><span class="method">${method} · ${method === 'P1' ? 'metadata' : 'system'}</span></th>${BENCHES.map(benchmark => cellHTML(summary.cells.find(cell => cell.control === 'belief' && cell.belief_id === belief.id && cell.method === method && cell.benchmark === benchmark && cell.phrasing === lexical), comparison, display)).join('')}</tr>`).join('')).join('');
  renderReferences(summary, comparison);
}

renderOverview();
for (const id of ['model-filter', 'protocol-filter', 'lexical-filter', 'comparison-filter', 'display-filter']) $(id).addEventListener('change', renderMatrix);
renderMatrix();

