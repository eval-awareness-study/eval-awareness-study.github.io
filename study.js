'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const DATA = JSON.parse($('study-data').textContent);
  const MODELS = ['qwen', 'gemma'].filter(id => DATA.models?.[id]);
  const BENCHMARKS = DATA.benchmarks || [];
  const BELIEFS = DATA.beliefs || [];
  const METHODS = ['P1', 'P2'];
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const finite = Number.isFinite;
  const count = value => finite(value) ? value.toLocaleString('en-US') : 'unknown';
  const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${(Math.abs(value) < 1e-12 ? 0 : value * 100).toFixed(2)}` : 'unavailable';
  const scoreUnit = (id = current().benchmark) => id === 'fortress' ? 'risk points' : 'pp';
  const pp = (value, id = current().benchmark) => finite(value) ? `${signed(value)} ${scoreUnit(id)}` : 'unavailable';
  const percent = value => finite(value) ? `${(value * 100).toFixed(2)}%` : 'unavailable';
  const validCI = value => Array.isArray(value) && value.length === 2 && value.every(finite);
  const ci = (value, id = current().benchmark) => validCI(value) ? `[${signed(value[0])}, ${signed(value[1])}] ${scoreUnit(id)}` : 'unavailable';
  const pvalue = value => finite(value) ? (value === 0 ? '0' : value < .0001 ? value.toExponential(2) : value.toFixed(4)) : 'unavailable';
  const money = value => finite(value) ? `$${value.toFixed(2)}` : 'unknown';
  const belief = id => BELIEFS.find(row => row.id === id);
  const beliefLabel = id => belief(id)?.label || 'Label unavailable';
  const current = () => ({model: $('model-filter').value, benchmark: $('benchmark-filter').value, method: $('method-filter').value, view: $('view-filter').value, monitor: $('monitor-filter').value});
  const methods = () => current().method === 'all' ? METHODS : [current().method];
  const view = () => DATA.statistics?.views?.[current().view];
  const selected = (rows, allBenchmarks = false) => (rows || []).filter(row => row.model === current().model && (allBenchmarks || row.benchmark === current().benchmark) && methods().includes(row.method));
  const effects = (reference = 'neutral', allBenchmarks = false) => selected(view()?.effects, allBenchmarks).filter(row => row.reference === reference);
  const corrected = row => finite(row?.estimate) && finite(row?.p_adjusted) && row.p_adjusted <= .05 && row.n_clusters > 2;
  const reversal = row => row?.robust_reversal === true && row.n_clusters > 2;
  const star = row => corrected(row) ? ' ★' : '';
  const benchmark = () => BENCHMARKS.find(row => row.id === current().benchmark);
  const direction = row => row?.direction === 'higher' ? 'Higher is better on this metric' : row?.direction === 'lower' ? 'Lower is better on this metric' : (row?.direction || 'Preferred direction unspecified');
  const nativeContext = row => `${row?.metric || 'Metric unavailable'} · ${direction(row)}. Positive Δ means more of the measured outcome; this is not a universal safety scale.${row?.id === 'fortress' ? ' Units are risk points on the rescaled 0–100 FORTRESS score, not harmful-response percentages. Higher means more risk; lower means less risk.' : ''}`;

  function table(headers, rows, className = '', caption = '') {
    return `<table class="${className}">${caption ? `<caption>${html(caption)}</caption>` : ''}<thead><tr>${headers.map(label => `<th scope="col">${html(label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map((cell, index) => `<${index ? 'td' : 'th scope="row"'}>${cell}</${index ? 'td' : 'th'}>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="unknown">No data available for this selection.</td></tr>`}</tbody></table>`;
  }

  function metadata(value) {
    if (value === null || value === undefined) return '<span class="unknown">unavailable</span>';
    if (Array.isArray(value)) return value.length ? `<ul>${value.map(item => `<li>${metadata(item)}</li>`).join('')}</ul>` : 'None recorded';
    if (typeof value === 'object') return `<dl class="metadata">${Object.entries(value).map(([key, item]) => `<dt>${html(key.replaceAll('_', ' '))}</dt><dd>${metadata(item)}</dd>`).join('')}</dl>`;
    return html(value);
  }

  function signedColor(value, scale = 1, background = false) {
    if (!finite(value) || Math.abs(value) < 1e-12) return background ? '#fffefa' : '#64716e';
    const base = value < 0 ? [39, 103, 155] : [174, 90, 34];
    const weight = background ? .06 + .28 * Math.min(1, Math.abs(value) / scale) : 1;
    return `rgb(${base.map((channel, index) => Math.round([255, 254, 250][index] * (1 - weight) + channel * weight)).join(',')})`;
  }

  const text = (x, y, value, attributes = '') => `<text x="${x}" y="${y}" ${attributes}>${html(value)}</text>`;
  const line = (x1, y1, x2, y2, className = 'grid-line') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
  const extent = (rows, fields = ['estimate']) => Math.max(.02, ...rows.flatMap(row => [...fields.map(field => row[field]), ...(validCI(row.ci95) ? row.ci95 : [])]).filter(finite).map(Math.abs)) * 1.12;
  const uncertainty = row => row.n_clusters <= 2 ? 'inconclusive: at most two clusters' : validCI(row.ci95) ? 'pointwise 95% interval' : 'CI unavailable';

  function forest(id, rows, label, title, difference = false) {
    if (!rows.length) {
      $(id).innerHTML = '<p class="empty">No contrast data available for this selection.</p>';
      return;
    }
    const width = difference ? 1300 : 1100, left = difference ? 530 : 335, right = difference ? 1100 : 900, top = 45, step = difference ? 58 : 36;
    const estimateX = right + 30;
    const bottom = top + rows.length * step, height = bottom + 62;
    const limit = extent(rows), x = value => left + (value + limit) / (2 * limit) * (right - left);
    const titleId = `${id}-title`, descId = `${id}-desc`;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${html(title)}</title><desc id="${descId}">Signed native-score differences in ${html(scoreUnit())}, with pointwise 95 percent confidence intervals when available. A star denotes Holm-adjusted p at most .05. Full statistics are provided in the accompanying table.</desc>`;
    for (let tick = -2; tick <= 2; tick++) {
      const value = tick * limit / 2;
      svg += line(x(value), top - 15, x(value), bottom, tick === 0 ? 'zero-line' : 'grid-line');
      svg += text(x(value), bottom + 22, (value * 100).toFixed(1), 'text-anchor="middle" class="axis-label"');
    }
    svg += text(left, 18, difference ? 'More negative A−B difference' : 'Lower native score', 'class="axis-label"');
    svg += text(right, 18, difference ? 'More positive A−B difference' : 'Higher native score', 'text-anchor="end" class="axis-label"');
    svg += text(estimateX, 18, `Estimate · ${scoreUnit()}`, 'class="axis-label"');
    rows.forEach((row, index) => {
      const y = top + index * step + step / 2;
      const name = label(row);
      const description = `${name}: ${pp(row.estimate)}; CI ${ci(row.ci95)}; Holm p ${pvalue(row.p_adjusted)}; ${count(row.n_pairs)} paired items, ${count(row.n_clusters)} clusters; ${uncertainty(row)}${difference ? `; ${row.opposite_signs ? 'opposite point signs' : 'no opposite point signs'}; ${reversal(row) ? 'supported reversal' : 'no supported reversal'}` : ''}`;
      svg += line(0, y + step / 2, width, y + step / 2, 'row-line');
      name.split('\n').forEach((part, partIndex, parts) => {
        svg += text(8, y + 4 + (partIndex - (parts.length - 1) / 2) * 17, part, 'class="row-label"');
      });
      if (!finite(row.estimate)) {
        svg += text(x(0) + 10, y + 4, 'Estimate unavailable', 'class="missing-label"');
        return;
      }
      const color = signedColor(row.estimate);
      svg += `<g class="point-focus" tabindex="0" role="img" aria-label="${html(description)}"><title>${html(description)}</title>`;
      if (validCI(row.ci95)) {
        svg += `<path d="M${x(row.ci95[0])},${y - 5}v10 M${x(row.ci95[0])},${y}H${x(row.ci95[1])} M${x(row.ci95[1])},${y - 5}v10" stroke="${color}" fill="none" class="ci-whisker"/>`;
      }
      svg += `<circle cx="${x(row.estimate)}" cy="${y}" r="10" class="focus-ring"/>`;
      svg += row.method === 'P2' ? `<rect x="${x(row.estimate) - 4.5}" y="${y - 4.5}" width="9" height="9" fill="${color}" class="data-point"/>` : `<circle cx="${x(row.estimate)}" cy="${y}" r="5" fill="${color}" class="data-point"/>`;
      svg += '</g>';
      svg += text(estimateX, y + 4, `${signed(row.estimate)}${star(row)}${!validCI(row.ci95) ? ' · no CI' : ''}`, 'class="axis-label"');
    });
    svg += text((left + right) / 2, bottom + 49, `${difference ? '(A − neutral A) − (B − neutral B)' : 'Treatment − reference'} · ${scoreUnit()} · ● P1 / ■ P2`, 'text-anchor="middle" class="axis-label"');
    $(id).innerHTML = `${svg}</svg>`;
  }

  function effectTable(rows) {
    return table(['Belief / method / reference', 'Δ', 'Pointwise 95% CI', 'Pairs / assigned', 'Clusters', 'Raw p', 'Holm p · 336', 'All-assigned Δ bounds', 'Inference'], rows.map(row => [
      `${html(beliefLabel(row.belief))}<span class="subtext">${html(row.method)} · ${html(row.reference)}</span>`,
      `<span class="number">${pp(row.estimate)}${star(row)}</span>`, ci(row.ci95), `${count(row.n_pairs)} / ${count(row.n_assigned)}`, count(row.n_clusters), pvalue(row.p_value), pvalue(row.p_adjusted), ci(row.missing_bounds), uncertainty(row)
    ]), 'effect-table');
  }

  function renderHeatmap() {
    const rows = effects('neutral', true);
    const scale = Math.max(.01, ...rows.map(row => Math.abs(row.estimate)).filter(finite));
    $('heatmap-key').innerHTML = `<span>Blue ${signed(-scale)}</span><span class="signed-ramp" aria-hidden="true"></span><span>Orange ${signed(scale)}</span><span>Native 0–100 score points (FORTRESS: risk points; rates: pp). Shared within this model / method / scoring view · white = zero · ★ corrected evidence</span>`;
    const index = new Map(rows.map(row => [`${row.belief}|${row.method}|${row.benchmark}`, row]));
    $('effect-heatmap').innerHTML = `<table class="heatmap"><caption>${html(DATA.models[current().model]?.label)} · matched neutral · ${html(current().view)} scoring</caption><thead><tr><th scope="col">Belief target / method</th>${BENCHMARKS.map(bench => `<th scope="col"><button class="benchmark-button" type="button" data-benchmark="${html(bench.id)}" aria-pressed="${bench.id === current().benchmark}">${html(bench.label)}<span class="subtext">${html(bench.metric)}</span></button></th>`).join('')}</tr></thead><tbody>${BELIEFS.map(target => methods().map(method => `<tr><th scope="row">${html(target.label)}<span class="subtext">${html(method)}</span></th>${BENCHMARKS.map(bench => {
      const row = index.get(`${target.id}|${method}|${bench.id}`);
      const detail = `${target.label}, ${method}, ${bench.label}: ${pp(row?.estimate, bench.id)}; CI ${ci(row?.ci95, bench.id)}; Holm p ${pvalue(row?.p_adjusted)}; ${count(row?.n_pairs)} of ${count(row?.n_assigned)} paired items; ${count(row?.n_clusters)} clusters`;
      return `<td style="background:${signedColor(row?.estimate, scale, true)}" title="${html(detail)}"><span>${finite(row?.estimate) ? `${signed(row.estimate)}${star(row)}` : 'unavailable'}</span><span class="subtext">n=${count(row?.n_pairs)}/${count(row?.n_assigned)}${row?.n_clusters <= 2 ? ' · 2-cluster caution' : ''}</span></td>`;
    }).join('')}</tr>`).join('')).join('')}</tbody></table>`;
  }

  function renderEffects() {
    const rows = effects();
    const order = new Map(BELIEFS.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (order.get(a.belief) ?? 100) - (order.get(b.belief) ?? 100) || a.method.localeCompare(b.method));
    $('effect-heading').textContent = `${benchmark()?.label || 'Selected benchmark'} · all ${BELIEFS.length} belief targets`;
    $('metric-context').textContent = nativeContext(benchmark());
    $('cluster-warning').hidden = !rows.some(row => row.n_clusters <= 2);
    $('cluster-warning').textContent = 'Cluster-inference warning: this selection includes contrasts with at most two clusters. In particular, the misalignment benchmark has only two scenario families. Point estimates are descriptive; reliable differences or reversals cannot be inferred from them.';
    forest('effect-chart', rows, row => `${beliefLabel(row.belief)}\n${row.method}`, 'All selected belief-targeting effects relative to matched neutral');
    $('effect-table').innerHTML = effectTable(rows);
  }

  function renderDifferences() {
    const state = current();
    $('difference-scope').textContent = `Detailed selection: ${DATA.models[state.model]?.label || state.model} · ${benchmark()?.label || state.benchmark} · ${methods().join(' + ')} · ${state.view} scoring. Not a cross-benchmark total.`;
    $('difference-detail-heading').textContent = `${DATA.models[state.model]?.label || state.model} · ${benchmark()?.label || state.benchmark} · ${methods().join(' + ')} · ${state.view}: paired condition-effect differences`;
    $('difference-metric-context').textContent = nativeContext(benchmark());
    $('difference-overview-note').textContent = `${state.view === 'recovered' ? 'Recovered' : 'Original'} scoring. Each cell shows corrected direct differences / estimable comparisons (55 planned). This overview ignores the model, benchmark and method filters. Holm correction still covers all 1,540 planned comparisons in this scoring view. Zero means no corrected evidence, not proof of equal effects.`;
    const overview = view()?.differences || [];
    $('difference-overview').innerHTML = table(['Benchmark', ...MODELS.flatMap(model => METHODS.map(method => `${DATA.models[model]?.label || model} · ${method}`))], BENCHMARKS.map(bench => [
      html(bench.label),
      ...MODELS.flatMap(model => METHODS.map(method => {
        const cells = overview.filter(row => row.model === model && row.benchmark === bench.id && row.method === method);
        const available = cells.filter(row => finite(row.estimate));
        if (!available.length) return '<span class="unknown">unavailable</span>';
        if (available.every(row => row.n_clusters <= 2)) return '<span class="unknown">Inconclusive · ≤2 clusters</span>';
        return `${count(cells.filter(corrected).length)} / ${count(available.length)}`;
      }))
    ]), '', 'Counts of corrected differences between supplied conditions—not correlations or proof of adopted beliefs.');
    const rows = selected(view()?.differences);
    const estimable = rows.filter(row => finite(row.estimate));
    const significant = rows.filter(corrected);
    const opposite = rows.filter(row => row.opposite_signs === true);
    const supported = rows.filter(reversal);
    const unsupported = opposite.length - supported.length;
    const g1Count = significant.filter(row => row.belief_a === 'G1' || row.belief_b === 'G1').length;
    $('difference-summary').textContent = `${count(rows.length)} selected comparisons: ${count(estimable.length)} with an estimate; ${count(significant.length)} with Holm-adjusted evidence of a direct difference (${count(g1Count)} involve the concrete-scoring-criterion condition); ${count(opposite.length)} with opposite point-estimate signs; ${count(supported.length)} supported reversals. ${count(unsupported)} opposite-sign comparisons do not meet the supported-reversal criterion. ${count(rows.length - estimable.length)} estimates unavailable. Counts apply only to the detailed selection above.`;
    const plotted = [...rows].sort((a, b) => {
      const aMagnitude = finite(a.estimate) ? Math.abs(a.estimate) : -1;
      const bMagnitude = finite(b.estimate) ? Math.abs(b.estimate) : -1;
      return bMagnitude - aMagnitude || a.method.localeCompare(b.method) || a.belief_a.localeCompare(b.belief_a) || a.belief_b.localeCompare(b.belief_b);
    });
    const limit = $('difference-limit').value;
    const shown = limit === 'all' ? plotted : plotted.slice(0, Number(limit));
    $('difference-selection-note').textContent = `Showing ${count(shown.length)} of ${count(rows.length)} selected comparisons, ranked by absolute estimated difference, regardless of sign or significance. ${count(significant.length)} corrected direct differences and ${count(supported.length)} supported reversals occur in the full selected set.`;
    forest('difference-chart', shown, row => `A: ${beliefLabel(row.belief_a)}\nB: ${beliefLabel(row.belief_b)} · ${row.method}${reversal(row) ? ' · reversal' : ''}`, $('difference-detail-heading').textContent, true);
    $('difference-table-heading').textContent = `All ${count(rows.length)} selected direct differences · including unsupported and unavailable results`;
    $('difference-table').innerHTML = table(['A − B / method', 'Direct difference', 'Pointwise 95% CI', 'Effect A · common items', 'Effect B · common items', 'Pairs', 'Clusters', 'Raw p', 'Holm p · 1,540', 'Opposite point signs?', 'Supported reversal?', 'Inference'], [...rows].sort((a, b) => a.method.localeCompare(b.method) || a.belief_a.localeCompare(b.belief_a) || a.belief_b.localeCompare(b.belief_b)).map(row => [
      `A: ${html(beliefLabel(row.belief_a))}<br>B: ${html(beliefLabel(row.belief_b))}<span class="subtext">${html(row.method)}</span>`, `<span class="number">${pp(row.estimate)}${star(row)}</span>`, ci(row.ci95), pp(row.effect_a), pp(row.effect_b), count(row.n_pairs), count(row.n_clusters), pvalue(row.p_value), pvalue(row.p_adjusted), finite(row.effect_a) && finite(row.effect_b) ? (row.opposite_signs ? 'Yes · descriptive only' : 'No') : 'unavailable', reversal(row) ? 'Yes · corrected criterion met' : 'No', uncertainty(row)
    ]), 'difference-table');
    return {rows, significant, opposite, supported};
  }

  const correlation = value => finite(value) ? value.toFixed(3) : 'unavailable';
  function associationInference(row) {
    const matches = (DATA.association_inference?.associations || []).filter(item =>
      item.model === row.model && item.benchmark === row.benchmark && item.method === row.method &&
      item.monitor === row.monitor && item.view === current().view);
    return ['full', 'without_G1'].map(sensitivity => {
      const item = matches.find(candidate => candidate.sensitivity === sensitivity);
      const label = sensitivity === 'full' ? 'All available conditions' : 'Without concrete scoring criterion · sensitivity';
      if (!item) return `<div class="association-inference"><strong>${label}</strong><p class="unknown">Inference unavailable for this exact selection.</p></div>`;
      const interval = validCI(item.ci95) ? `[${item.ci95.map(correlation).join(', ')}]` : 'unavailable';
      const noise = item.shared_task_noise;
      return `<div class="association-inference"><strong>${label}: r = ${correlation(item.r)}</strong><p>Pointwise 95% cluster-bootstrap CI: ${interval}<br>Approximate raw p: ${pvalue(item.p_raw)} · Holm p (336 planned): ${pvalue(item.p_adjusted)}<br>${count(item.n_clusters)} source-task clusters · ${count(item.min_pairs)}–${count(item.max_pairs)} pairs per condition${item.unavailable_reason ? `<br><span class="unknown">Inference unavailable: ${html(item.unavailable_reason)}</span>` : ''}</p><p class="fine">Descriptive disjoint-half diagnostic: median r = ${correlation(noise?.median)}; sign stability = ${percent(noise?.sign_stability)}; valid directional correlations ${count(noise?.valid_directional_correlations)} / ${count(noise?.attempted_directional_correlations)}. These repeated splits are dependent; this is not a CI or significance test.</p></div>`;
    }).join('');
  }

  function scatter(row, index) {
    const points = (row.points || []).filter(point => finite(point.x) && finite(point.y));
    const width = 620, height = 410, left = 76, right = 570, top = 28, bottom = 330;
    const maxX = Math.max(.02, ...points.map(point => Math.abs(point.x))) * 1.18;
    const maxY = Math.max(.02, ...points.map(point => Math.abs(point.y))) * 1.18;
    const x = value => left + (value + maxX) / (2 * maxX) * (right - left);
    const y = value => bottom - (value + maxY) / (2 * maxY) * (bottom - top);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="association-title-${index} association-desc-${index}"><title id="association-title-${index}">${html(row.method)}: ${html(row.monitor)} shift versus behavior shift</title><desc id="association-desc-${index}">Each point is one belief condition. Horizontal axis: paired monitor shift. Vertical axis: paired behavioral shift, on identical available pairs. Points are keyboard focusable; all coordinates appear in the table below.</desc>`;
    for (let tick = -2; tick <= 2; tick++) {
      const xv = tick * maxX / 2, yv = tick * maxY / 2;
      svg += line(x(xv), top, x(xv), bottom, tick === 0 ? 'zero-line' : 'grid-line');
      svg += line(left, y(yv), right, y(yv), tick === 0 ? 'zero-line' : 'grid-line');
      svg += text(x(xv), bottom + 22, (xv * 100).toFixed(1), 'text-anchor="middle" class="axis-label"');
      svg += text(left - 10, y(yv) + 4, (yv * 100).toFixed(1), 'text-anchor="end" class="axis-label"');
    }
    // Coincident coordinates are grouped, never jittered into invented measurements.
    const groups = new Map();
    points.forEach(point => {
      const key = `${point.x}|${point.y}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    });
    for (const group of groups.values()) {
      const point = group[0], px = x(point.x), py = y(point.y);
      const detail = group.map(item => `${beliefLabel(item.belief)}: awareness ${pp(item.x, 'monitor')}, behavior ${pp(item.y)}, n=${count(item.n_pairs)}`).join(' · ');
      const label = group.length > 2 ? `${group.length} conditions` : group.map(item => points.indexOf(item) + 1).join(', ');
      svg += `<g tabindex="0" role="img" class="point-focus association-point" data-detail="${html(detail)}" data-panel="${index}" aria-label="${html(detail)}"><title>${html(detail)}</title><circle cx="${px}" cy="${py}" r="12" class="focus-ring"/><circle cx="${px}" cy="${py}" r="${group.length > 1 ? 8 : 6}" fill="${signedColor(point.y)}" class="data-point"/>${text(px + (px > right - 85 ? -12 : 12), py - 9, label, `text-anchor="${px > right - 85 ? 'end' : 'start'}" class="axis-label"`)}</g>`;
    }
    svg += text((left + right) / 2, bottom + 58, `${row.monitor} paired shift · pp`, 'text-anchor="middle" class="axis-label"');
    svg += text(19, (top + bottom) / 2, `Behavioral paired shift · ${scoreUnit()}`, `text-anchor="middle" class="axis-label" transform="rotate(-90 19 ${(top + bottom) / 2})"`);
    svg += '</svg>';
    return `<article class="scatter-panel"><h4>${html(row.method)} · ${html(row.monitor)}</h4><p class="association-summary">Observed profile r = ${correlation(row.r)} · ${count(row.n_conditions)} conditions</p>${associationInference(row)}${points.length ? `${svg}<ol class="scatter-key">${points.map(point => `<li>${html(beliefLabel(point.belief))}</li>`).join('')}</ol>` : '<p class="empty">No paired monitor-and-score points available.</p>'}<p id="scatter-detail-${index}" class="scatter-detail" aria-live="polite">Point numbers map to the condition names above. Focus or select a point for exact paired values. Coincident points are grouped; no jitter is added. Axes scale independently per panel.</p></article>`;
  }

  function renderAssociations() {
    const rows = selected(view()?.associations).filter(row => row.monitor === current().monitor);
    const constructs = {M1: 'verbalized evaluation awareness in recorded reasoning', M2: 'verbalized grader awareness in recorded reasoning (our reconstruction, not an official Anthropic detector)', M3: 'external transcript evaluation-likeness at an uncalibrated 0.85 threshold; this monitor can see the intervention itself and does not measure actor belief adoption'};
    $('monitor-context').textContent = `${current().monitor}: ${constructs[current().monitor]}. Positive x means more monitor-positive results; positive y means a higher ${benchmark()?.metric || 'native score'}.`;
    $('association-panels').innerHTML = rows.length ? rows.map(scatter).join('') : '<p class="empty">Association data unavailable for this selection.</p>';
    $('association-table').innerHTML = table(['Belief / method', 'Monitor', 'Paired monitor shift', 'Paired behavior shift', 'Identical available pairs'], rows.flatMap(row => (row.points || []).map(point => [
      `${html(beliefLabel(point.belief))}<span class="subtext">${html(row.method)}</span>`, html(row.monitor), pp(point.x, 'monitor'), pp(point.y), count(point.n_pairs)
    ])));
  }

  function renderG1() {
    const rows = selected(view()?.effects).filter(row => String(row.belief).toUpperCase() === 'G1' && ['neutral', 'information'].includes(row.reference)).sort((a, b) => a.method.localeCompare(b.method) || (a.reference === b.reference ? 0 : a.reference === 'neutral' ? -1 : 1));
    forest('g1-chart', rows, row => `Concrete criterion determines score\n${row.method} − ${row.reference} control`, 'Concrete-scoring-criterion effects relative to neutral and information controls');
    $('g1-table').innerHTML = effectTable(rows);
  }

  function renderLevels() {
    const rows = (view()?.levels || []).filter(row => row.model === current().model && row.benchmark === current().benchmark);
    const settings = new Map((DATA.settings || []).map(row => [row.id, row]));
    $('level-table').innerHTML = table(['Setting', 'Native mean', 'Scored / planned', 'M1 positive · known n', 'M2 positive · known n', 'M3 positive · known n'], rows.map(row => {
      const setting = settings.get(row.setting);
      const target = belief(setting?.belief)?.label;
      const references = [...new Set((setting?.reference_ids || []).map(id => belief(settings.get(id)?.belief)?.label).filter(Boolean))];
      const label = setting ? [target || (references.length ? `Reference for ${references.join('; ')}` : ''), setting.method, setting.control].filter(Boolean).join(' · ') : '';
      return [`${html(label || 'Setting label unavailable')}`, current().benchmark === 'fortress' ? pp(row.mean) : percent(row.mean), `${count(row.n)} / ${count(row.planned)}`, ...['M1', 'M2', 'M3'].map(monitor => `${percent(row.monitors?.[monitor]?.rate)} · n=${count(row.monitors?.[monitor]?.n)}`)];
    }), 'level-table', `${DATA.models[current().model]?.label} · ${benchmark()?.label} · all methods and controls · ${current().view} scoring`);
  }

  function renderSummary(differences) {
    const rows = effects();
    const available = rows.filter(row => finite(row.estimate)).length;
    const significant = rows.filter(corrected).length;
    $('answer-summary').innerHTML = [
      [significant, 'Corrected belief effects', `${available}/${rows.length} selected estimates available; full 336-effect family.`],
      [differences.significant.length, 'Direct belief differences', `Of ${differences.rows.length} selected comparisons; full 1,540-difference family.`],
      [differences.supported.length, 'Supported reversals', `${differences.opposite.length} raw opposite-sign comparisons. Signs alone are not enough.`]
    ].map(([value, label, detail]) => `<div class="summary-card"><strong>${count(value)}</strong><span>${html(label)}</span><p>${html(detail)}</p></div>`).join('');
  }

  function renderStatic() {
    const date = new Date(DATA.built_at);
    $('snapshot').textContent = `Snapshot ${Number.isNaN(date.getTime()) ? (DATA.built_at || 'unknown') : `${date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}`} · sanitized aggregate results`;
    $('coverage-table').innerHTML = table(['Model', 'Planned', 'Generated', 'Held', 'Actor-valid', 'Truncated', 'Original scored', 'Recovered scored', 'Original complete', 'Recovered complete', 'M1 known · original / recovered', 'M2 known · original / recovered', 'M3 known · original / recovered'], MODELS.map(id => {
      const row = DATA.coverage?.[id] || {};
      const completion = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : count(value);
      return [html(DATA.models[id].label), ...['planned', 'generated', 'held', 'actor_valid', 'truncated', 'original_scored', 'scored'].map(key => count(row[key])), completion(row.original_complete), completion(row.complete), ...['M1_known', 'M2_known', 'M3_known'].map(key => `${count(row[`original_${key}`])} / ${count(row[key])}`)];
    }), 'coverage-table', 'Complete = native score and all three monitor flags known. Truncated actor outputs are excluded, not repaired by scoring recovery.');
    const recoveredCounts = Object.entries(DATA.recovery?.counts || {});
    const totalRecovered = suffix => {
      const values = recoveredCounts.filter(([key]) => suffix.test(key)).map(([, value]) => value).filter(finite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    $('recovery-note').textContent = `Recovery status: ${DATA.recovery?.status ?? 'unknown'} · version ${DATA.recovery?.version ?? 'unknown'} · ${count(totalRecovered(/:native_recovered$/))} native scores and ${count(totalRecovered(/:M[123]_recovered$/))} monitor measurements recovered · recorded recovery cost ${money(DATA.recovery?.cost_usd)}. Only valid original actor outputs are eligible; actor responses are not regenerated. Residual missingness remains explicit. Recovery metadata and source details are available below.`;
    $('spending-note').textContent = `Recorded spend ${money(DATA.spending?.observed_cost_usd)} + unresolved reserve ${money(DATA.spending?.unresolved_reserved_usd)}; total cap ${money(DATA.spending?.total_cap_usd)}. Recorded cost and reserve are not invoice totals.`;
    const exports = [['json', 'All aggregate data · JSON'], ['effects', 'All effects · CSV'], ['differences', 'All belief differences · CSV'], ['associations', 'All associations · CSV'], ['association_inference', 'P1/P2 association inference · JSON'], ['p3', 'P3 interim snapshot · JSON']];
    $('export-links').innerHTML = exports.map(([key, label]) => {
      const path = DATA.exports?.[key];
      // Download links must remain local aggregate artifacts, never script URLs.
      return typeof path === 'string' && /^study-data\/[a-zA-Z0-9._/-]+$/.test(path) && !path.split('/').includes('..') ? `<a href="${html(path)}" download>${html(label)}</a>` : `<span class="unknown">${html(label)} unavailable</span>`;
    }).join('');
    $('methods-detail').innerHTML = metadata(DATA.statistics?.methods);
    $('provenance-detail').innerHTML = `<h4>Source provenance</h4>${metadata(DATA.provenance)}<h4>Recovery metadata</h4>${metadata(DATA.recovery)}`;
    $('metric-guide').innerHTML = table(['Benchmark', 'Native metric', 'Preferred direction', 'Positive Δ', 'Negative Δ', 'Scope'], BENCHMARKS.map(row => [html(row.label), html(row.metric), html(direction(row)), 'More of this metric', 'Less of this metric', html(row.category || 'Scope unspecified')]), '', 'Native metrics are not pooled or safety-normalized. Benign task performance is not a safety measure.');
  }

  function renderP3() {
    const snapshot = DATA.p3;
    const state = current();
    $('p3-snapshot').textContent = snapshot
      ? `Saved P3 snapshot: ${snapshot.built_at || 'timestamp unavailable'}. Not live; no automatic refresh.`
      : 'P3 aggregate snapshot unavailable. Missing progress and contrasts are not zero.';
    $('p3-selection').textContent = `${DATA.models[state.model]?.label || state.model} · ${benchmark()?.label || state.benchmark} · P3 recorded-only outcomes. P1/P2 delivery-method, scoring-view and monitor filters do not apply. ${nativeContext(benchmark())}`;
    const metrics = [['planned', 'Planned'], ['eligible', 'Eligible'], ['generated', 'Generated'], ['scored', 'Scored'], ['complete', 'Complete'], ['withheld', 'Held / withheld']];
    $('p3-counts').innerHTML = metrics.map(([key, label]) => `<div class="summary-card"><strong>${count(snapshot?.counts?.[key])}</strong><span>${label}</span></div>`).join('');
    $('p3-coverage').innerHTML = table(['Model', ...metrics.map(([, label]) => label), 'Awaiting generation', 'Awaiting measurement', 'Grading budget held'], Object.entries(snapshot?.coverage || {}).map(([model, row]) => [
      html(DATA.models[model]?.label || model), ...metrics.map(([key]) => count(row[key])), count(row.awaiting_generation), count(row.awaiting_measurement), count(row.grading_budget_held)
    ]), 'coverage-table', 'P3 assignment-level coverage across all benchmarks; counts are not mutually exclusive stages.');
    const rows = (snapshot?.contrasts || []).filter(row => row.model === state.model && row.benchmark === state.benchmark);
    $('p3-contrasts').innerHTML = table(['Supplied condition · P3 vs matched neutral', 'Descriptive native-score Δ', 'Scored pairs / eligible / planned', 'Observed clusters', ...['M1', 'M2', 'M3'].map(monitor => `${monitor}: monitor Δ / behavior Δ / identical pairs`)], rows.map(row => [
      html(beliefLabel(row.belief)), pp(row.estimate), `${count(row.n_pairs)} / ${count(row.n_eligible_pairs)} / ${count(row.n_planned_pairs)}`, count(row.n_clusters),
      ...['M1', 'M2', 'M3'].map(monitor => {
        const observation = row.monitors?.[monitor];
        return `${pp(observation?.estimate, 'monitor')} / ${pp(observation?.behavior_estimate)} / ${count(observation?.n_pairs)}`;
      })
    ]), 'p3-contrast-table', 'Interim complete-pair descriptions only: no confidence intervals, p-values, significance stars or correlation tests.');
    $('p3-metadata').innerHTML = snapshot
      ? `<h4>Saved output timestamps</h4>${metadata(snapshot.output_timestamps)}<h4>Exclusions and missing measurements</h4>${metadata(snapshot.exclusions)}<h4>Sanitized runtime snapshot</h4>${metadata(snapshot.runtime)}<h4>Recorded spending snapshot</h4>${metadata(snapshot.spending)}`
      : '<p class="unknown">Snapshot metadata unavailable.</p>';
  }

  function render() {
    const state = current();
    $('selection-context').textContent = `${DATA.models[state.model]?.label || state.model} · ${benchmark()?.label || state.benchmark} · ${methods().join(' + ')} · ${state.view} scoring · matched neutral`;
    $('view-note').textContent = state.view === 'recovered'
      ? 'Recovered scoring view. This includes available recovered scores and monitor flags for eligible original actor outputs. It is not a new uniform-budget actor experiment. Compare original scoring to inspect sensitivity to scoring recovery; missing outcomes remain missing.'
      : 'Original scoring view. Recovered values are not substituted. Original-budget truncation and missing scores can change which task pairs enter each estimate; these results condition on the observed complete pairs.';
    if (!view()) $('view-note').textContent += ' No statistics are available for this view.';
    renderHeatmap();
    renderEffects();
    const differences = renderDifferences();
    renderSummary(differences);
    renderAssociations();
    renderG1();
    renderLevels();
    renderP3();
  }

  $('model-filter').innerHTML = MODELS.map(id => `<option value="${html(id)}">${html(DATA.models[id].label)}</option>`).join('');
  $('benchmark-filter').innerHTML = BENCHMARKS.map(row => `<option value="${html(row.id)}">${html(row.label)}</option>`).join('');
  $('benchmark-filter').value = BENCHMARKS.some(row => row.id === 'fortress') ? 'fortress' : BENCHMARKS[0]?.id;
  ['model-filter', 'benchmark-filter', 'method-filter', 'view-filter'].forEach(id => $(id).addEventListener('change', render));
  $('monitor-filter').addEventListener('change', renderAssociations);
  $('difference-limit').addEventListener('change', renderDifferences);
  $('effect-heatmap').addEventListener('click', event => {
    const button = event.target.closest('button[data-benchmark]');
    if (!button) return;
    $('benchmark-filter').value = button.dataset.benchmark;
    render();
    $('benchmark-filter').focus({preventScroll: true});
  });
  const showPoint = event => {
    const point = event.target.closest('.association-point');
    if (point) $(`scatter-detail-${point.dataset.panel}`).textContent = point.dataset.detail;
  };
  $('association-panels').addEventListener('focusin', showPoint);
  $('association-panels').addEventListener('click', showPoint);
  renderStatic();
  render();
})();
