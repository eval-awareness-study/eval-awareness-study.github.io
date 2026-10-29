'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const DATA = JSON.parse($('study-data').textContent);
  const MODELS = ['qwen', 'gemma'].filter(id => DATA.models?.[id]);
  // Both models always appear together in one hue: the first solid, the second faded.
  const MODEL_STYLE = Object.fromEntries(MODELS.map((id, index) => [id, index === 0
    ? {fill: '#176a60', text: '#176a60', tint: 1, name: 'solid'}
    : {fill: '#9cc2bb', text: '#3f7d74', tint: .5, name: 'faded'}]));
  const modelLabel = id => DATA.models?.[id]?.label || id;
  const modelShort = id => modelLabel(id).match(/^[A-Za-z]+/)?.[0] || modelLabel(id);
  const modelOrder = (a, b) => MODELS.indexOf(a.model) - MODELS.indexOf(b.model);
  const modelLegendText = () => MODELS.map(id => `${modelLabel(id)} ${MODEL_STYLE[id].name}`).join(' · ');
  const BENCHMARK_GROUPS = ['Chat capability', 'Chat safety', 'Agentic capability', 'Agentic safety']
    .map(category => ({
      label: category === 'Agentic capability' ? 'Agentic · benign-task control' : category.replace(' ', ' · '),
      kind: category.endsWith('capability') ? 'capability' : 'safety',
      benchmarks: (DATA.benchmarks || []).filter(bench => bench.category === category),
    })).filter(group => group.benchmarks.length);
  const BENCHMARKS = BENCHMARK_GROUPS.flatMap(group => group.benchmarks);
  const TARGET_NAMES = {
    E0: 'Evaluation exists',
    E1: 'Harm prevention is assessed',
    E2: 'Appropriate assistance is assessed',
    E3: 'Capability is assessed',
    E4: 'Honesty and permitted behavior are assessed',
    G1: 'A concrete criterion determines the score',
    O1: 'An observer can access visible outputs',
    W1: 'Scenario consequences are contained',
    T1: 'The interaction is eligible for future training',
    T2: 'Behavior can influence future learning',
    D1: 'Greater demonstrated capability can restrict deployment'
  };
  window.STUDY_TARGET_NAMES = TARGET_NAMES;
  const BELIEFS = (DATA.beliefs || []).map(row => ({...row, label: TARGET_NAMES[row.id] || row.label}));
  const descriptiveText = value => String(value ?? '').replace(/(^|[^A-Za-z0-9])(E[0-4]|G1|O1|W1|T[12]|D1)(?![A-Za-z0-9])/g, (_, prefix, id) => `${prefix}${TARGET_NAMES[id]}`);
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
  const belief = id => BELIEFS.find(row => row.id === id);
  const beliefLabel = id => belief(id)?.label || 'Label unavailable';
  const current = () => ({benchmark: $('benchmark-filter').value, method: $('method-filter').value, view: $('view-filter').value, monitor: $('monitor-filter').value});
  const methods = () => current().method === 'all' ? METHODS : [current().method];
  const view = () => DATA.statistics?.views?.[current().view];
  const selected = (rows, allBenchmarks = false) => (rows || []).filter(row => MODELS.includes(row.model) && (allBenchmarks || row.benchmark === current().benchmark) && methods().includes(row.method));
  const effects = (reference = 'neutral', allBenchmarks = false) => selected(view()?.effects, allBenchmarks).filter(row => row.reference === reference);
  // Two-sided p < .05 with more than two independent clusters; no multiple-testing correction.
  const isSignificant = row => finite(row?.estimate) && finite(row?.p_value) && row.p_value < .05 && row.n_clusters > 2;
  const significance = row => !finite(row?.estimate) ? 'Unavailable' : row.n_clusters <= 2 ? 'Inconclusive' : !finite(row.p_value) ? 'Unavailable' : isSignificant(row) ? 'Significant' : 'Not significant';
  const neutralEffect = (row, id) => (view()?.effects || []).find(item => item.reference === 'neutral' && item.model === row.model && item.benchmark === row.benchmark && item.method === row.method && item.belief === id);
  // Reversal: both beliefs' effects are significant with opposite signs, and their direct difference is significant.
  const reversal = row => {
    if (!isSignificant(row) || row.opposite_signs !== true) return false;
    const a = neutralEffect(row, row.belief_a), b = neutralEffect(row, row.belief_b);
    return isSignificant(a) && isSignificant(b) && a.estimate * b.estimate < 0;
  };
  const star = row => isSignificant(row) ? ' ★' : '';
  const benchmark = () => BENCHMARKS.find(row => row.id === current().benchmark);
  const direction = row => row?.direction === 'higher' ? 'higher is better' : row?.direction === 'lower' ? 'lower is better' : (row?.direction || '');
  const methodLabel = id => ({P1: 'P1 · context documents', P2: 'P2 · system notice'}[id] || id);
  const selectionLabel = () => `${benchmark()?.label || 'Selected benchmark'} · ${methods().map(methodLabel).join(' / ')} · ${current().view} scoring`;
  const nativeContext = row => `${row?.metric || 'Metric unavailable'}${direction(row) ? ` · ${direction(row)}` : ''}.${row?.id === 'fortress' ? ' Risk points on a 0–100 scale; higher = more risk.' : ''}`;

  function table(headers, rows, className = '', caption = '') {
    return `<table class="${className}">${caption ? `<caption>${html(caption)}</caption>` : ''}<thead><tr>${headers.map(label => `<th scope="col">${html(label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map((cell, index) => `<${index ? 'td' : 'th scope="row"'}>${cell}</${index ? 'td' : 'th'}>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="unknown">No data available for this selection.</td></tr>`}</tbody></table>`;
  }


  function signedColor(value, scale = 1, background = false, fade = 1) {
    if (!finite(value)) return background ? '#e6e9e7' : '#64716e';
    if (Math.abs(value) < 1e-12) return background ? '#fffefa' : '#64716e';
    const base = value < 0 ? [39, 103, 155] : [174, 90, 34];
    const weight = background ? (.06 + .28 * Math.min(1, Math.abs(value) / scale)) * fade : 1;
    return `rgb(${base.map((channel, index) => Math.round([255, 254, 250][index] * (1 - weight) + channel * weight)).join(',')})`;
  }
  // Table cells stack one block per model; the faded model's tint is halved, so magnitude is read from the number.
  const modelCell = (model, estimate, scale, body, title = '') => `<span class="model-cell model-${MODEL_STYLE[model].name}" style="background:${signedColor(estimate, scale, true, MODEL_STYLE[model].tint)}"${title ? ` title="${html(title)}"` : ''}>${body}</span>`;

  const text = (x, y, value, attributes = '') => `<text x="${x}" y="${y}" ${attributes}>${html(value)}</text>`;
  const line = (x1, y1, x2, y2, className = 'grid-line') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
  const extent = (rows, fields = ['estimate']) => Math.max(.02, ...rows.flatMap(row => [...fields.map(field => row[field]), ...(validCI(row.ci95) ? row.ci95 : [])]).filter(finite).map(Math.abs)) * 1.12;

  function forest(id, rows, label, title, difference = false, sharedLimit = null, compact = false, options = {}) {
    const pooled = options.pooled === true;
    const benchmarkId = options.benchmark ?? current().benchmark;
    if (!rows.length) {
      $(id).innerHTML = '<p class="empty">No contrast data available for this selection.</p>';
      return;
    }
    // One row per condition; every model's estimate sits in that row, offset vertically.
    const groups = [], byKey = new Map();
    rows.forEach(row => {
      const key = difference ? `${row.belief_a}|${row.belief_b}|${row.method}` : `${row.belief}|${row.method}|${row.reference}`;
      if (!byKey.has(key)) {
        byKey.set(key, []);
        groups.push(byKey.get(key));
      }
      byKey.get(key).push(row);
    });
    groups.forEach(group => group.sort(modelOrder));
    const width = compact ? 720 : difference ? 1300 : 1100;
    const left = compact ? 210 : difference ? 530 : 335, right = compact ? 370 : difference ? 950 : 750, top = 45;
    const pX = compact ? 490 : right + 150, resultX = compact ? 575 : right + 230;
    const labels = groups.map(group => label(group[0]).split('\n').flatMap(part => {
      const lines = [''];
      part.split(' ').forEach(word => {
        const last = lines.length - 1;
        if (lines[last] && lines[last].length + word.length + 1 > Math.floor((left - 30) / 7)) lines.push(word);
        else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
      });
      return lines;
    }));
    const step = Math.max(difference ? 58 : 44, ...labels.map(parts => parts.length * 17 + 14));
    const estimateX = right + 30, gap = 13;
    const bottom = top + groups.length * step, height = bottom + 86;
    const limit = sharedLimit ?? extent(rows), x = value => left + (value + limit) / (2 * limit) * (right - left);
    const titleId = `${id}-title`, descId = `${id}-desc`;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${html(title)}</title><desc id="${descId}">Δ in ${html(scoreUnit(benchmarkId))}; ${html(modelLegendText())}. ${pooled ? 'Circles are pooled estimates.' : 'Circles are P1, squares P2.'} Bars are 95% CIs. Values are in the table below.</desc>`;
    for (let tick = -2; tick <= 2; tick++) {
      const value = tick * limit / 2;
      svg += line(x(value), top - 15, x(value), bottom, tick === 0 ? 'zero-line' : 'grid-line');
      svg += text(x(value), bottom + 22, (value * 100).toFixed(1), 'text-anchor="middle" class="axis-label"');
    }
    svg += text(left, 18, compact ? (difference ? 'A−B < 0' : 'Lower') : difference ? 'More negative A−B difference' : 'Lower native score', 'class="axis-label"');
    svg += text(right, 18, compact ? (difference ? 'A−B > 0' : 'Higher') : difference ? 'More positive A−B difference' : 'Higher native score', 'text-anchor="end" class="axis-label"');
    svg += text(estimateX, 18, `Estimate · ${scoreUnit(benchmarkId)}`, 'class="axis-label"');
    svg += text(pX, 18, 'p', 'class="axis-label"');
    svg += text(resultX, 18, 'Result', 'class="axis-label"');
    groups.forEach((group, index) => {
      const center = top + index * step + step / 2;
      svg += line(0, center + step / 2, width, center + step / 2, 'row-line');
      labels[index].forEach((part, partIndex, parts) => {
        svg += text(8, center + 4 + (partIndex - (parts.length - 1) / 2) * 17, part, 'class="row-label"');
      });
      group.forEach((row, slot) => {
        const y = center + (slot - (group.length - 1) / 2) * gap;
        const style = MODEL_STYLE[row.model];
        const name = `${modelLabel(row.model)} · ${label(row).replace(/\n/g, ' · ')}`;
        if (!finite(row.estimate)) {
          svg += text(x(0) + 10, y + 4, `${modelLabel(row.model)}: estimate unavailable`, 'class="missing-label"');
          svg += text(estimateX, y + 4, `${modelShort(row.model)} unavailable`, `class="axis-label" style="fill:${style.text}"`);
          svg += text(pX, y + 4, '—', 'class="axis-label"');
          svg += text(resultX, y + 4, significance(row), 'class="axis-label"');
          return;
        }
        const description = `${name}: ${pp(row.estimate, benchmarkId)}; CI ${ci(row.ci95, benchmarkId)}; p ${pvalue(row.p_value)}; ${significance(row)}; ${count(row.n_pairs)} tasks, ${count(row.n_clusters)} clusters${difference && reversal(row) ? '; reversal' : ''}`;
        svg += `<g class="point-focus" tabindex="0" role="img" aria-label="${html(description)}"><title>${html(description)}</title>`;
        if (validCI(row.ci95)) {
          svg += `<path d="M${x(row.ci95[0])},${y - 4}v8 M${x(row.ci95[0])},${y}H${x(row.ci95[1])} M${x(row.ci95[1])},${y - 4}v8" style="stroke:${style.fill}" fill="none" class="ci-whisker"/>`;
        }
        svg += `<circle cx="${x(row.estimate)}" cy="${y}" r="9" class="focus-ring"/>`;
        svg += row.method === 'P2' ? `<rect x="${x(row.estimate) - 4.5}" y="${y - 4.5}" width="9" height="9" style="fill:${style.fill}" class="data-point"/>` : `<circle cx="${x(row.estimate)}" cy="${y}" r="5" style="fill:${style.fill}" class="data-point"/>`;
        svg += '</g>';
        svg += text(estimateX, y + 4, `${modelShort(row.model)} ${signed(row.estimate)}`, `class="axis-label" style="fill:${style.text}"`);
        svg += text(pX, y + 4, pvalue(row.p_value), `class="axis-label" style="fill:${style.text}"`);
        svg += text(resultX, y + 4, significance(row), `class="axis-label" style="fill:${style.text}"`);
      });
    });
    svg += text((left + right) / 2, bottom + 49, `Dot = estimate, ${pooled ? '½(P1 − neutral P1) + ½(P2 − neutral P2)' : difference ? '(A − neutral A) − (B − neutral B)' : 'treatment − reference'} · ${scoreUnit(benchmarkId)}`, 'text-anchor="middle" class="axis-label"');
    // Key: the two models, the interval bar and the method shapes.
    let kx = compact ? 8 : left;
    const ky = bottom + 74, advance = caption => caption.length * 6.4 + 30;
    MODELS.forEach(model => {
      const caption = `${modelLabel(model)} (${MODEL_STYLE[model].name})`;
      svg += `<circle cx="${kx + 5}" cy="${ky - 4}" r="5" style="fill:${MODEL_STYLE[model].fill}" class="data-point"/>`;
      svg += text(kx + 15, ky, caption, 'class="axis-label"');
      kx += 15 + advance(caption);
    });
    svg += `<path d="M${kx},${ky - 8}v8 M${kx},${ky - 4}H${kx + 26} M${kx + 26},${ky - 8}v8" style="stroke:var(--muted)" fill="none" class="ci-whisker"/>`;
    svg += text(kx + 33, ky, 'bar = 95% CI', 'class="axis-label"');
    kx += 33 + advance('bar = 95% CI');
    if (!pooled) {
      svg += `<circle cx="${kx + 5}" cy="${ky - 4}" r="4.5" style="fill:var(--muted)"/>${text(kx + 14, ky, 'P1', 'class="axis-label"')}`;
      svg += `<rect x="${kx + 38}" y="${ky - 8.5}" width="9" height="9" style="fill:var(--muted)"/>${text(kx + 52, ky, 'P2', 'class="axis-label"')}`;
    }
    $(id).innerHTML = `${svg}</svg>`;
  }

  const takeawayBox = paragraphs => `<aside class="plot-takeaway"><strong>Takeaway</strong>${paragraphs.map(value => `<p>${html(value)}</p>`).join('')}</aside>`;

  function pooledTable(rows, allBenchmarks = false) {
    return table(['Belief', 'Model', 'Δ', '95% CI', 'p', 'Result', 'Tasks / assigned', 'Clusters', 'Bounds with missing tasks'], rows.map(row => [
      `${html(beliefLabel(row.belief))}${allBenchmarks ? `<span class="subtext">${html(BENCHMARKS.find(bench => bench.id === row.benchmark)?.label || row.benchmark)}</span>` : ''}`,
      html(modelLabel(row.model)), pp(row.estimate, row.benchmark), ci(row.ci95, row.benchmark),
      pvalue(row.p_value), html(significance(row)),
      `${count(row.n_pairs)} / ${count(row.n_assigned)}`, count(row.n_clusters),
      ci(row.missing_bounds, row.benchmark)
    ]), 'effect-table pooled-table');
  }

  function renderPooled() {
    const benchmarkId = $('pooled-benchmark-filter').value, scoring = $('pooled-view-filter').value;
    const bench = BENCHMARKS.find(row => row.id === benchmarkId);
    const source = DATA.pooled?.views?.[scoring]?.effects || [];
    const all = source.filter(row => MODELS.includes(row.model));
    const rows = all.filter(row => row.benchmark === benchmarkId).sort((a, b) => BELIEFS.findIndex(target => target.id === a.belief) - BELIEFS.findIndex(target => target.id === b.belief) || modelOrder(a, b));
    const significant = all.filter(isSignificant);
    const safety = significant.filter(row => BENCHMARKS.find(item => item.id === row.benchmark)?.category?.endsWith('safety'));
    const capability = significant.filter(row => BENCHMARKS.find(item => item.id === row.benchmark)?.category?.endsWith('capability'));
    const targetCount = new Set(significant.map(row => row.belief)).size;
    $('pooled-summary').innerHTML = [
      [all.length ? significant.length : null, 'Significant · all benchmarks', `of ${all.length} contrasts`],
      [all.length ? safety.length : null, 'On safety benchmarks', 'Chat and agentic safety'],
      [all.length ? capability.length : null, 'On capability benchmarks', 'Chat capability and AgentHarm benign']
    ].map(([value, label, detail]) => `<div class="summary-card"><strong>${count(value)}</strong><span>${html(label)}</span><p>${html(detail)}</p></div>`).join('');
    const noTargets = BELIEFS.filter(target => !significant.some(row => row.belief === target.id)).map(target => target.label);
    const noBenchmarks = BENCHMARKS.filter(item => !significant.some(row => row.benchmark === item.id)).map(item => item.label);
    $('pooled-study-takeaway').innerHTML = takeawayBox(all.length ? [
      `${significant.length} of ${all.length} contrasts are significant, covering ${targetCount} of ${BELIEFS.length} beliefs; ${significant.filter(row => row.belief !== 'G1').length} do not involve the concrete criterion.`,
      MODELS.map(model => `${modelLabel(model)}: ${significant.filter(row => row.model === model).length}`).join('; ') + '.',
      ...(noTargets.length ? [`No significant result for: ${noTargets.join(', ')}.`] : []),
      ...(noBenchmarks.length ? [`No significant result on: ${noBenchmarks.join(', ')}.`] : [])
    ] : ['No pooled data for this scoring view.']);
    $('pooled-effect-heading').textContent = bench?.label || benchmarkId;
    $('pooled-metric-context').textContent = nativeContext(bench);
    const fewClusters = rows.some(row => finite(row.estimate) && row.n_clusters <= 2);
    $('pooled-cluster-warning').hidden = !fewClusters;
    $('pooled-cluster-warning').textContent = 'Some estimates have two or fewer independent clusters and are inconclusive.';
    $('pooled-takeaway').innerHTML = takeawayBox(MODELS.map(model => {
      const own = rows.filter(row => row.model === model), found = own.filter(isSignificant);
      const prefix = `${modelLabel(model)}: `;
      if (!own.some(row => finite(row.estimate))) return `${prefix}no estimates.`;
      if (own.every(row => !finite(row.estimate) || row.n_clusters <= 2)) return `${prefix}all estimates inconclusive (too few clusters).`;
      if (!found.length) return `${prefix}none of ${own.length} beliefs significant.`;
      const extremes = [
        found.filter(row => row.estimate < 0).sort((a, b) => a.estimate - b.estimate)[0],
        found.filter(row => row.estimate >= 0).sort((a, b) => b.estimate - a.estimate)[0]
      ].filter(Boolean);
      return `${prefix}${found.length} of ${own.length} significant. Largest: ${extremes.map(row => `“${beliefLabel(row.belief)}” ${pp(row.estimate, benchmarkId)} (p ${pvalue(row.p_value)})`).join('; ')}.`;
    }));
    forest('pooled-chart', rows, row => beliefLabel(row.belief), 'Pooled P1/P2 effects', false, null, false, {pooled: true, benchmark: benchmarkId});
    $('pooled-table').innerHTML = pooledTable(rows);
    $('pooled-all-table').innerHTML = pooledTable(all, true);
    $('pooled-benchmark-tabs').querySelectorAll('[role="tab"]').forEach(tab => {
      const active = tab.dataset.benchmark === benchmarkId;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) $('pooled-chart').setAttribute('aria-labelledby', tab.id);
    });
  }

  function effectTakeaway(rows, difference = false) {
    const control = !difference && rows.some(row => row.reference === 'information');
    return takeawayBox(MODELS.map(model => {
      const own = rows.filter(row => row.model === model), known = own.filter(row => finite(row.estimate));
      const found = own.filter(isSignificant), prefix = `${modelLabel(model)}: `;
      if (!known.length) return `${prefix}no estimates.`;
      if (known.every(row => row.n_clusters <= 2)) return `${prefix}all estimates inconclusive (too few clusters).`;
      if (control) {
        const neutral = own.find(row => row.reference === 'neutral'), information = own.find(row => row.reference === 'information');
        const result = row => !row || !finite(row.estimate) ? 'unavailable' : `${pp(row.estimate)} (${significance(row).toLowerCase()})`;
        return `${prefix}vs neutral ${result(neutral)}; vs information control ${result(information)}.`;
      }
      if (!found.length) return `${prefix}none of ${own.length} ${difference ? 'differences' : 'effects'} significant.`;
      if (difference) {
        const criterion = found.filter(row => row.belief_a === 'G1' || row.belief_b === 'G1').length;
        const reversals = own.filter(reversal).length;
        return `${prefix}${found.length} of ${own.length} differences significant${criterion ? ` (${criterion} involve the concrete criterion)` : ''}; ${reversals} reversals.`;
      }
      const strongest = found.reduce((a, b) => Math.abs(a.estimate) >= Math.abs(b.estimate) ? a : b);
      return `${prefix}${found.length} of ${own.length} effects significant. Largest: “${beliefLabel(strongest.belief)}” ${pp(strongest.estimate)} (p ${pvalue(strongest.p_value)}).`;
    }));
  }

  function overviewTakeaway(rows, difference = false) {
    const found = rows.filter(isSignificant);
    const names = BENCHMARKS.filter(bench => found.some(row => row.benchmark === bench.id)).map(bench => bench.label);
    return takeawayBox([`Significant ${difference ? 'differences' : 'effects'} on: ${names.length ? names.join(', ') : 'none'}.`]);
  }

  function methodForests(id, rows, label, title, difference = false) {
    const selectedMethods = methods(), together = selectedMethods.length > 1;
    const container = $(id);
    container.classList.toggle('method-panels', together);
    container.innerHTML = selectedMethods.map(method => `<article class="method-panel"><h4>${html(methodLabel(method))}</h4>${effectTakeaway(rows.filter(row => row.method === method), difference)}<div id="${id}-${method}" class="chart-scroll" tabindex="0" role="region" aria-label="${html(methodLabel(method))} · ${html(title)}"></div></article>`).join('');
    const limit = extent(rows);
    selectedMethods.forEach(method => forest(`${id}-${method}`, rows.filter(row => row.method === method), label, `${methodLabel(method)}: ${title}`, difference, limit, together));
  }

  function effectTable(rows) {
    return table(['Belief / method / reference', 'Model', 'Δ', '95% CI', 'Tasks / assigned', 'Clusters', 'p', 'Bounds with missing tasks', 'Result'], rows.map(row => [
      `${html(beliefLabel(row.belief))}<span class="subtext">${html(row.method)} · ${html(row.reference)}</span>`, html(modelLabel(row.model)),
      `<span class="number">${pp(row.estimate)}</span>`, ci(row.ci95), `${count(row.n_pairs)} / ${count(row.n_assigned)}`, count(row.n_clusters), pvalue(row.p_value), ci(row.missing_bounds), significance(row)
    ]), 'effect-table');
  }

  function renderHeatmap() {
    const rows = effects('neutral', true);
    const scale = Math.max(.01, ...rows.map(row => Math.abs(row.estimate)).filter(finite));
    $('heatmap-key').innerHTML = `<span>Blue ${signed(-scale)}</span><span class="signed-ramp" aria-hidden="true"></span><span>Orange ${signed(scale)}</span><span>★ significant · each cell: ${html(MODELS.map(modelLabel).join(' above '))}</span>`;
    const index = new Map(rows.map(row => [`${row.model}|${row.belief}|${row.method}|${row.benchmark}`, row]));
    const groupHeaders = BENCHMARK_GROUPS.map(group => `<th scope="colgroup" colspan="${group.benchmarks.length}" class="benchmark-group-heading benchmark-${group.kind}">${html(group.label)}</th>`).join('');
    const benchmarkHeaders = BENCHMARK_GROUPS.map(group => group.benchmarks.map(bench => `<th scope="col"><button class="benchmark-button benchmark-${group.kind}" type="button" data-benchmark="${html(bench.id)}" aria-label="${html(bench.label)} — ${html(group.label)}" aria-pressed="${bench.id === current().benchmark}">${html(bench.label)}<span class="subtext">${html(bench.metric)}</span></button></th>`).join('')).join('');
    $('effect-heatmap').innerHTML = `<table class="heatmap"><thead><tr><th scope="col" rowspan="2">Belief / method</th>${groupHeaders}</tr><tr>${benchmarkHeaders}</tr></thead><tbody>${BELIEFS.map(target => methods().map(method => `<tr><th scope="row">${html(target.label)}<span class="subtext">${html(method)}</span></th>${BENCHMARKS.map(bench => `<td>${MODELS.map(model => {
      const row = index.get(`${model}|${target.id}|${method}|${bench.id}`);
      const detail = `${modelLabel(model)}, ${target.label}, ${method}, ${bench.label}: ${pp(row?.estimate, bench.id)}; CI ${ci(row?.ci95, bench.id)}; p ${pvalue(row?.p_value)}; ${count(row?.n_pairs)} of ${count(row?.n_assigned)} tasks; ${count(row?.n_clusters)} clusters`;
      return modelCell(model, row?.estimate, scale, `${html(modelShort(model))} ${finite(row?.estimate) ? `${signed(row.estimate)}${star(row)}` : 'unavailable'}<span class="subtext">n=${count(row?.n_pairs)}/${count(row?.n_assigned)}${row?.n_clusters <= 2 ? ' · ≤2 clusters' : ''}</span>`, detail);
    }).join('')}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table>`;
  }

  function renderEffects() {
    const rows = effects();
    const order = new Map(BELIEFS.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (order.get(a.belief) ?? 100) - (order.get(b.belief) ?? 100) || a.method.localeCompare(b.method) || modelOrder(a, b));
    $('effect-heading').textContent = benchmark()?.label || 'Selected benchmark';
    $('metric-context').textContent = nativeContext(benchmark());
    $('cluster-warning').hidden = !rows.some(row => row.n_clusters <= 2);
    $('cluster-warning').textContent = 'Some estimates have two or fewer independent clusters and are inconclusive.';
    methodForests('effect-chart', rows, row => beliefLabel(row.belief), `${selectionLabel()}: effects vs neutral`);
    $('effect-table').innerHTML = effectTable(rows);
  }

  const matrixSelections = new Map();
  let matrixRows = new Map();

  function pairDescription(row) {
    return `${modelLabel(row.model)}. A: ${beliefLabel(row.belief_a)}. B: ${beliefLabel(row.belief_b)}. ${methodLabel(row.method)}. A−B: ${pp(row.estimate)}; 95% CI ${ci(row.ci95)}; p ${pvalue(row.p_value)}; ${count(row.n_pairs)} tasks; ${count(row.n_clusters)} clusters; ${significance(row)}.`;
  }

  function selectMatrixCell(button) {
    const method = button.dataset.method, key = button.dataset.pair;
    const pair = matrixRows.get(`${method}|${key}`);
    if (!pair) return;
    matrixSelections.set(method, key);
    button.closest('.pair-matrix').querySelectorAll('button[data-pair]').forEach(cell => {
      cell.setAttribute('aria-pressed', String(cell === button));
    });
    $(`pair-detail-${method}`).innerHTML = `<h4>A: ${html(beliefLabel(pair[0].belief_a))}<br>B: ${html(beliefLabel(pair[0].belief_b))}</h4>${pair.map(row => `
      <p><strong style="color:${MODEL_STYLE[row.model].text}">${html(modelLabel(row.model))} · A−B: ${pp(row.estimate)}${star(row)}</strong> · 95% CI ${ci(row.ci95)}<br>
      p ${pvalue(row.p_value)} · ${count(row.n_pairs)} tasks · ${count(row.n_clusters)} clusters · ${significance(row)}<br>
      A − neutral A = ${pp(row.effect_a)}; B − neutral B = ${pp(row.effect_b)} · Reversal: ${reversal(row) ? 'yes' : 'no'}</p>`).join('')}`;
  }

  function renderMatrices(rows) {
    const scale = Math.max(.01, ...rows.map(row => Math.abs(row.estimate)).filter(finite));
    matrixRows = new Map();
    const index = new Map(rows.map(row => [`${row.model}|${row.method}|${row.belief_a}|${row.belief_b}`, row]));
    const oriented = (model, method, a, b) => {
      const forward = index.get(`${model}|${method}|${a.id}|${b.id}`);
      const reverse = index.get(`${model}|${method}|${b.id}|${a.id}`);
      return forward || (reverse ? {...reverse, belief_a: a.id, belief_b: b.id, estimate: finite(reverse.estimate) ? -reverse.estimate : null, ci95: validCI(reverse.ci95) ? [-reverse.ci95[1], -reverse.ci95[0]] : null, effect_a: reverse.effect_b, effect_b: reverse.effect_a} : {model, belief_a: a.id, belief_b: b.id, method});
    };
    $('difference-matrices').innerHTML = methods().map(method => {
      const body = BELIEFS.map((a, ai) => `<tr><th scope="row"><span class="pair-index">${ai + 1}.</span> ${html(a.label)}</th>${BELIEFS.map((b, bi) => {
        if (bi <= ai) return `<td class="pair-omitted"><span class="visually-hidden">${bi === ai ? 'Same message; not a comparison' : 'Duplicate comparison omitted; use the upper triangle'}</span></td>`;
        const pair = MODELS.map(model => oriented(model, method, a, b));
        const key = `${ai}-${bi}`;
        matrixRows.set(`${method}|${key}`, pair);
        const detail = pair.map(pairDescription).join(' ');
        return `<td><button type="button" data-method="${method}" data-pair="${key}" aria-pressed="false" aria-controls="pair-detail-${method}" aria-label="${html(detail)}" title="${html(detail)}">${pair.map(row => modelCell(row.model, row.estimate, scale, `${finite(row.estimate) ? `${signed(row.estimate)}${star(row)}` : '—'}${row.n_clusters <= 2 ? '<span class="pair-caution" aria-hidden="true">≤2</span>' : ''}`)).join('')}</button></td>`;
      }).join('')}</tr>`).join('');
      return `<article class="matrix-panel"><h4>${html(methodLabel(method))}</h4><div class="table-scroll" tabindex="0" role="region" aria-label="${html(methodLabel(method))}: all 55 pairs"><table class="pair-matrix"><caption>Row A − column B · ${html(scoreUnit())} · each cell: ${html(MODELS.map(modelLabel).join(' above '))}</caption><thead><tr><th scope="col">A ↓ / B →</th>${BELIEFS.map((target, i) => `<th scope="col" title="${html(target.label)}"><span aria-hidden="true">${i + 1}</span><span class="visually-hidden">${i + 1}. ${html(target.label)}</span></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div id="pair-detail-${method}" class="pair-detail" aria-live="polite" aria-atomic="true"></div></article>`;
    }).join('');
    methods().forEach(method => {
      const key = matrixSelections.get(method) || '0-1';
      const button = $('difference-matrices').querySelector(`button[data-method="${method}"][data-pair="${key}"]`);
      if (button) selectMatrixCell(button);
    });
  }

  function renderDifferences() {
    $('difference-detail-heading').textContent = benchmark()?.label || 'Selected benchmark';
    $('difference-metric-context').textContent = nativeContext(benchmark());
    $('difference-overview-note').textContent = `Significant differences / comparisons with an estimate (55 pairs) · ${current().view} scoring.`;
    const overview = view()?.differences || [];
    $('difference-overview-takeaway').innerHTML = overviewTakeaway(overview, true);
    $('difference-overview').innerHTML = table(['Benchmark', ...MODELS.flatMap(model => METHODS.map(method => `${DATA.models[model]?.label || model} · ${method}`))], BENCHMARKS.map(bench => [
      html(bench.label),
      ...MODELS.flatMap(model => METHODS.map(method => {
        const cells = overview.filter(row => row.model === model && row.benchmark === bench.id && row.method === method);
        const available = cells.filter(row => finite(row.estimate));
        if (!available.length) return '<span class="unknown">unavailable</span>';
        if (available.every(row => row.n_clusters <= 2)) return '<span class="unknown">Inconclusive · ≤2 clusters</span>';
        return `${count(cells.filter(isSignificant).length)} / ${count(available.length)}`;
      }))
    ]));
    const rows = selected(view()?.differences);
    $('difference-takeaway').innerHTML = methods().map(method => `<article><h4>${html(methodLabel(method))}</h4>${effectTakeaway(rows.filter(row => row.method === method), true)}</article>`).join('');
    const significant = rows.filter(isSignificant);
    const supported = rows.filter(reversal);
    const matrix = $('difference-view').value === 'matrix';
    $('difference-takeaway').hidden = !matrix;
    $('difference-matrices').hidden = !matrix;
    $('difference-chart').hidden = matrix;
    $('difference-selection-note').textContent = matrix ? 'Row A − column B. Blue = negative, orange = positive, grey = unavailable; ★ significant; ≤2 = inconclusive. Select a cell for details.' : '';
    if (matrix) {
      $('difference-chart').innerHTML = '';
      renderMatrices(rows);
    } else {
      $('difference-matrices').innerHTML = '';
      const plotted = [...rows].sort((a, b) => a.method.localeCompare(b.method) || beliefLabel(a.belief_a).localeCompare(beliefLabel(b.belief_a)) || beliefLabel(a.belief_b).localeCompare(beliefLabel(b.belief_b)));
      methodForests('difference-chart', plotted, row => `A: ${beliefLabel(row.belief_a)}\nB: ${beliefLabel(row.belief_b)}`, `${selectionLabel()}: differences`, true);
    }
    $('difference-table-heading').textContent = `Table of differences (${count(rows.length)})`;
    $('difference-table').innerHTML = table(['A − B / method', 'Model', 'A − B', '95% CI', 'Effect A', 'Effect B', 'Tasks', 'Clusters', 'p', 'Result', 'Reversal'], [...rows].sort((a, b) => a.method.localeCompare(b.method) || a.belief_a.localeCompare(b.belief_a) || a.belief_b.localeCompare(b.belief_b) || modelOrder(a, b)).map(row => [
      `A: ${html(beliefLabel(row.belief_a))}<br>B: ${html(beliefLabel(row.belief_b))}<span class="subtext">${html(row.method)}</span>`, html(modelLabel(row.model)), `<span class="number">${pp(row.estimate)}</span>`, ci(row.ci95), pp(row.effect_a), pp(row.effect_b), count(row.n_pairs), count(row.n_clusters), pvalue(row.p_value), significance(row), reversal(row) ? 'Yes' : 'No'
    ]), 'difference-table');
    return {rows, significant, supported};
  }

  const correlation = value => finite(value) ? value.toFixed(3) : 'unavailable';
  function associationInference(row) {
    const matches = (DATA.association_inference?.associations || []).filter(item =>
      item.model === row.model && item.benchmark === row.benchmark && item.method === row.method &&
      item.monitor === row.monitor && item.view === current().view);
    return ['full', 'without_G1'].map(sensitivity => {
      const item = matches.find(candidate => candidate.sensitivity === sensitivity);
      const label = `${modelLabel(row.model)} · ${sensitivity === 'full' ? 'all beliefs' : 'without concrete criterion'}`;
      if (!item) return `<div class="association-inference"><strong>${label}</strong><p class="unknown">Unavailable.</p></div>`;
      const interval = validCI(item.ci95) ? `[${item.ci95.map(correlation).join(', ')}]` : 'unavailable';
      return `<div class="association-inference"><strong>${label}: r = ${correlation(item.r)}</strong><p>95% CI ${interval} · p ${pvalue(item.p_raw)} · ${count(item.n_clusters)} clusters${item.unavailable_reason ? ' · <span class="unknown">test unavailable</span>' : ''}</p></div>`;
    }).join('');
  }

  function scatter(method, rows, index) {
    const monitor = current().monitor;
    const sets = rows.map(row => ({row, points: (row.points || []).filter(point => finite(point.x) && finite(point.y))}));
    const all = sets.flatMap(set => set.points);
    // Point numbers follow one condition order shared by both models.
    const order = [...new Set([...BELIEFS.map(target => target.id), ...all.map(point => point.belief)])].filter(id => all.some(point => point.belief === id));
    const number = id => order.indexOf(id) + 1;
    const width = 620, height = 432, left = 76, right = 570, top = 28, bottom = 330;
    const maxX = Math.max(.02, ...all.map(point => Math.abs(point.x))) * 1.18;
    const maxY = Math.max(.02, ...all.map(point => Math.abs(point.y))) * 1.18;
    const x = value => left + (value + maxX) / (2 * maxX) * (right - left);
    const y = value => bottom - (value + maxY) / (2 * maxY) * (bottom - top);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="association-title-${index} association-desc-${index}"><title id="association-title-${index}">${html(method)}: ${html(monitor)} shift versus behavior shift</title><desc id="association-desc-${index}">Each point is one belief condition for one model: ${html(modelLegendText())}. Horizontal axis: paired monitor shift. Vertical axis: paired behavioral shift, on identical available pairs. Points are keyboard focusable; all coordinates appear in the table below.</desc>`;
    for (let tick = -2; tick <= 2; tick++) {
      const xv = tick * maxX / 2, yv = tick * maxY / 2;
      svg += line(x(xv), top, x(xv), bottom, tick === 0 ? 'zero-line' : 'grid-line');
      svg += line(left, y(yv), right, y(yv), tick === 0 ? 'zero-line' : 'grid-line');
      svg += text(x(xv), bottom + 22, (xv * 100).toFixed(1), 'text-anchor="middle" class="axis-label"');
      svg += text(left - 10, y(yv) + 4, (yv * 100).toFixed(1), 'text-anchor="end" class="axis-label"');
    }
    // Coincident coordinates are grouped within a model, never jittered into invented measurements.
    // A larger faded outline keeps both models visible when their coordinates coincide.
    [...sets].reverse().forEach(({row, points}) => {
      const style = MODEL_STYLE[row.model];
      const groups = new Map();
      points.forEach(point => {
        const key = `${point.x}|${point.y}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(point);
      });
      for (const group of groups.values()) {
        const point = group[0], px = x(point.x), py = y(point.y), flip = px > right - 85;
        const detail = `${modelLabel(row.model)} · ${group.map(item => `${beliefLabel(item.belief)}: awareness ${pp(item.x, 'monitor')}, behavior ${pp(item.y)}, n=${count(item.n_pairs)}`).join(' · ')}`;
        const label = group.length > 2 ? `${group.length} conditions` : group.map(item => number(item.belief)).join(', ');
        svg += `<g tabindex="0" role="img" class="point-focus association-point" data-detail="${html(detail)}" data-panel="${index}" aria-label="${html(detail)}"><title>${html(detail)}</title><circle cx="${px}" cy="${py}" r="13" class="focus-ring"/><circle cx="${px}" cy="${py}" r="${(group.length > 1 ? 8 : 6) + (row.model === MODELS[0] ? 0 : 3)}" style="fill:${row.model === MODELS[0] ? style.fill : 'none'};stroke:${style.fill};stroke-width:2" class="data-point"/>${text(px + (flip ? -14 : 14), py + (row.model === MODELS[0] ? -12 : 19), label, `text-anchor="${flip ? 'end' : 'start'}" class="axis-label" style="fill:${style.text}"`)}</g>`;
      }
    });
    svg += text((left + right) / 2, bottom + 58, `${monitor} paired shift · pp`, 'text-anchor="middle" class="axis-label"');
    svg += text(19, (top + bottom) / 2, `Behavioral paired shift · ${scoreUnit()}`, `text-anchor="middle" class="axis-label" transform="rotate(-90 19 ${(top + bottom) / 2})"`);
    let kx = left;
    sets.forEach(({row}) => {
      const caption = `${modelLabel(row.model)} (${MODEL_STYLE[row.model].name})`;
      svg += `<circle cx="${kx + 6}" cy="${height - 12}" r="${row.model === MODELS[0] ? 6 : 9}" style="fill:${row.model === MODELS[0] ? MODEL_STYLE[row.model].fill : 'none'};stroke:${MODEL_STYLE[row.model].fill};stroke-width:2" class="data-point"/>${text(kx + 19, height - 8, caption, 'class="axis-label"')}`;
      kx += 45 + caption.length * 6.4;
    });
    svg += '</svg>';
    const associationSignificant = item => finite(item?.r) && finite(item?.p_raw) && item.p_raw < .05 && item.n_clusters > 2;
    const takeaway = takeawayBox(sets.map(({row}) => {
      const candidates = (DATA.association_inference?.associations || []).filter(item => item.model === row.model && item.benchmark === row.benchmark && item.method === row.method && item.monitor === row.monitor && item.view === current().view);
      const full = candidates.find(item => item.sensitivity === 'full'), without = candidates.find(item => item.sensitivity === 'without_G1');
      const prefix = `${modelLabel(row.model)}: `;
      if (!full || !finite(full.r) || !finite(full.p_raw) || full.n_clusters <= 2) return `${prefix}unavailable or inconclusive.`;
      if (!associationSignificant(full)) return `${prefix}not significant (r ${correlation(full.r)}, p ${pvalue(full.p_raw)}).`;
      const robust = !without || !finite(without.p_raw) || without.n_clusters <= 2 ? 'unavailable' : associationSignificant(without) ? 'still significant' : 'not significant';
      return `${prefix}significant ${full.r < 0 ? 'negative' : 'positive'} association (r ${correlation(full.r)}, p ${pvalue(full.p_raw)}); without the concrete criterion: ${robust}.`;
    }));
    const summary = sets.map(({row}) => `${html(modelShort(row.model))} r = ${correlation(row.r)} · ${count(row.n_conditions)} beliefs`).join('<br>');
    return `<article class="scatter-panel"><h4>${html(method)} · ${html(monitor)}</h4>${takeaway}<p class="association-summary">${summary}</p>${sets.map(({row}) => associationInference(row)).join('')}${all.length ? `${svg}<ol class="scatter-key">${order.map(id => `<li>${html(beliefLabel(id))}</li>`).join('')}</ol>` : '<p class="empty">No points available.</p>'}<p id="scatter-detail-${index}" class="scatter-detail" aria-live="polite">Select a point for its values.</p></article>`;
  }

  function renderAssociations() {
    const rows = selected(view()?.associations).filter(row => row.monitor === current().monitor).sort(modelOrder);
    const constructs = {M1: 'reasoning mentions being evaluated', M2: 'reasoning mentions how it is graded', M3: 'a judge rates the transcript as evaluation-like'};
    $('monitor-context').textContent = `${current().monitor}: ${constructs[current().monitor]}. x = change in monitor rate (pp); y = change in ${benchmark()?.metric || 'score'}.`;
    const panels = methods().map(method => [method, rows.filter(row => row.method === method)]).filter(([, group]) => group.length);
    $('association-panels').innerHTML = panels.length ? panels.map(([method, group], index) => scatter(method, group, index)).join('') : '<p class="empty">Association data unavailable for this selection.</p>';
    $('association-table').innerHTML = table(['Belief / method', 'Model', 'Monitor', 'Paired monitor shift', 'Paired behavior shift', 'Identical available pairs'], rows.flatMap(row => (row.points || []).map(point => [
      `${html(beliefLabel(point.belief))}<span class="subtext">${html(row.method)}</span>`, html(modelLabel(row.model)), html(row.monitor), pp(point.x, 'monitor'), pp(point.y), count(point.n_pairs)
    ])));
  }

  function renderG1() {
    const rows = selected(view()?.effects).filter(row => String(row.belief).toUpperCase() === 'G1' && ['neutral', 'information'].includes(row.reference)).sort((a, b) => a.method.localeCompare(b.method) || (a.reference === b.reference ? 0 : a.reference === 'neutral' ? -1 : 1));
    methodForests('g1-chart', rows, row => `Concrete criterion\nvs ${row.reference} control`, 'Concrete criterion vs neutral and information controls');
    $('g1-table').innerHTML = effectTable(rows);
  }

  function renderLevels() {
    const rows = (view()?.levels || []).filter(row => MODELS.includes(row.model) && row.benchmark === current().benchmark);
    const firstSeen = new Map();
    rows.forEach((row, position) => { if (!firstSeen.has(row.setting)) firstSeen.set(row.setting, position); });
    rows.sort((a, b) => firstSeen.get(a.setting) - firstSeen.get(b.setting) || modelOrder(a, b));
    const settings = new Map((DATA.settings || []).map(row => [row.id, row]));
    $('level-table').innerHTML = table(['Condition', 'Model', 'Mean score', 'Scored / planned', 'M1 rate · n', 'M2 rate · n', 'M3 rate · n'], rows.map(row => {
      const setting = settings.get(row.setting);
      const target = belief(setting?.belief)?.label;
      const references = [...new Set((setting?.reference_ids || []).map(id => belief(settings.get(id)?.belief)?.label).filter(Boolean))];
      const label = setting ? [target || (references.length ? `Reference for ${references.join('; ')}` : ''), setting.method, setting.control].filter(Boolean).join(' · ') : '';
      return [`${html(descriptiveText(label || 'Setting label unavailable'))}`, html(modelLabel(row.model)), current().benchmark === 'fortress' ? pp(row.mean) : percent(row.mean), `${count(row.n)} / ${count(row.planned)}`, ...['M1', 'M2', 'M3'].map(monitor => `${percent(row.monitors?.[monitor]?.rate)} · n=${count(row.monitors?.[monitor]?.n)}`)];
    }), 'level-table', `${benchmark()?.label} · ${current().view} scoring`);
  }

  function renderSummary(differences) {
    const rows = effects();
    const split = (items, test) => MODELS.map(model => `${modelShort(model)} ${count(items.filter(row => row.model === model && test(row)).length)}`).join(' · ');
    $('answer-summary').innerHTML = [
      [rows.filter(isSignificant).length, 'Significant effects', split(rows, isSignificant)],
      [differences.significant.length, 'Significant differences', split(differences.rows, isSignificant)],
      [differences.supported.length, 'Reversals', split(differences.rows, reversal)]
    ].map(([value, label, detail]) => `<div class="summary-card"><strong>${count(value)}</strong><span>${html(label)}</span><p>${html(detail)}</p></div>`).join('');
  }

  function renderStatic() {
    const date = new Date(DATA.built_at);
    $('snapshot').textContent = `Data snapshot: ${Number.isNaN(date.getTime()) ? (DATA.built_at || 'unknown') : date.toISOString().slice(0, 10)}`;
    $('coverage-table').innerHTML = table(['Model', 'Planned', 'Generated', 'Held', 'Actor-valid', 'Truncated', 'Original scored', 'Recovered scored', 'Original complete', 'Recovered complete', 'M1 known · original / recovered', 'M2 known · original / recovered', 'M3 known · original / recovered'], MODELS.map(id => {
      const row = DATA.coverage?.[id] || {};
      const completion = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : count(value);
      return [html(DATA.models[id].label), ...['planned', 'generated', 'held', 'actor_valid', 'truncated', 'original_scored', 'scored'].map(key => count(row[key])), completion(row.original_complete), completion(row.complete), ...['M1_known', 'M2_known', 'M3_known'].map(key => `${count(row[`original_${key}`])} / ${count(row[key])}`)];
    }), 'coverage-table', 'Complete = score and all three monitor flags known.');
    const exports = [['pooled', 'Pooled effects · CSV'], ['pooled_json', 'Pooled effects · JSON'], ['json', 'All data · JSON'], ['effects', 'Per-method effects · CSV'], ['differences', 'Differences · CSV'], ['associations', 'Associations · CSV'], ['association_inference', 'Association tests · JSON'], ['p3', 'P3 snapshot · JSON']];
    $('export-links').innerHTML = exports.map(([key, label]) => {
      const path = DATA.exports?.[key];
      // Download links must remain local aggregate artifacts, never script URLs.
      return typeof path === 'string' && /^study-data\/[a-zA-Z0-9._/-]+$/.test(path) && !path.split('/').includes('..') ? `<a href="${html(path)}" download>${html(label)}</a>` : `<span class="unknown">${html(label)} unavailable</span>`;
    }).join('');
    $('metric-guide').innerHTML = table(['Benchmark', 'Type', 'Metric', 'Better'], BENCHMARKS.map(row => [html(row.label), html(row.category === 'Agentic capability' ? 'Agentic benign-task control' : row.category || ''), html(row.metric), html(row.direction === 'higher' ? 'Higher' : row.direction === 'lower' ? 'Lower' : direction(row))]), 'guide-table');
  }

  function renderP3() {
    const snapshot = DATA.p3;
    const state = {benchmark: $('p3-benchmark-filter').value};
    const bench = BENCHMARKS.find(row => row.id === state.benchmark);
    $('p3-takeaway').innerHTML = takeawayBox([snapshot ? `${count(snapshot.counts?.complete)} of ${count(snapshot.counts?.eligible)} eligible assignments complete.` : 'No P3 snapshot available.']);
    $('p3-selection').textContent = nativeContext(bench);
    const metrics = [['planned', 'Planned'], ['eligible', 'Eligible'], ['generated', 'Generated'], ['scored', 'Scored'], ['complete', 'Complete'], ['withheld', 'Held / withheld']];
    $('p3-counts').innerHTML = metrics.map(([key, label]) => `<div class="summary-card"><strong>${count(snapshot?.counts?.[key])}</strong><span>${label}</span></div>`).join('');
    $('p3-coverage').innerHTML = table(['Model', ...metrics.map(([, label]) => label), 'Awaiting generation', 'Awaiting measurement', 'Grading budget held'], Object.entries(snapshot?.coverage || {}).map(([model, row]) => [
      html(DATA.models[model]?.label || model), ...metrics.map(([key]) => count(row[key])), count(row.awaiting_generation), count(row.awaiting_measurement), count(row.grading_budget_held)
    ]), 'coverage-table');
    const beliefRank = id => { const rank = BELIEFS.findIndex(target => target.id === id); return rank < 0 ? BELIEFS.length : rank; };
    const rows = (snapshot?.contrasts || []).filter(row => MODELS.includes(row.model) && row.benchmark === state.benchmark).sort((a, b) => beliefRank(a.belief) - beliefRank(b.belief) || modelOrder(a, b));
    $('p3-contrasts').innerHTML = table(['Belief', 'Model', 'Δ', 'Scored / eligible / planned pairs', 'Clusters', ...['M1', 'M2', 'M3'].map(monitor => `${monitor}: monitor Δ / behavior Δ / pairs`)], rows.map(row => [
      html(beliefLabel(row.belief)), html(modelLabel(row.model)), pp(row.estimate, state.benchmark), `${count(row.n_pairs)} / ${count(row.n_eligible_pairs)} / ${count(row.n_planned_pairs)}`, count(row.n_clusters),
      ...['M1', 'M2', 'M3'].map(monitor => {
        const observation = row.monitors?.[monitor];
        return `${pp(observation?.estimate, 'monitor')} / ${pp(observation?.behavior_estimate, state.benchmark)} / ${count(observation?.n_pairs)}`;
      })
    ]), 'p3-contrast-table');
  }

  function render() {
    const state = current();
    document.querySelectorAll('[data-sync-filter]').forEach(select => { select.value = $(select.dataset.syncFilter).value; });
    document.querySelectorAll('#effect-benchmark-tabs [role="tab"], #difference-benchmark-tabs [role="tab"]').forEach(tab => {
      const active = tab.dataset.benchmark === state.benchmark;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) $(tab.getAttribute('aria-controls')).setAttribute('aria-labelledby', tab.id);
    });
    $('study-takeaway').innerHTML = overviewTakeaway((view()?.effects || []).filter(row => row.reference === 'neutral'));
    renderHeatmap();
    renderEffects();
    const differences = renderDifferences();
    renderSummary(differences);
    renderAssociations();
    renderG1();
    renderLevels();
  }

  $('benchmark-filter').innerHTML = BENCHMARK_GROUPS.map(group => `<optgroup label="${html(group.label)}">${group.benchmarks.map(bench => `<option value="${html(bench.id)}">${html(bench.label)}</option>`).join('')}</optgroup>`).join('');
  $('benchmark-filter').value = BENCHMARKS[0]?.id || '';
  ['pooled-benchmark-filter', 'p3-benchmark-filter'].forEach(id => {
    $(id).innerHTML = $('benchmark-filter').innerHTML;
    $(id).value = BENCHMARKS[0]?.id || '';
  });
  ['pooled-benchmark-filter', 'pooled-view-filter'].forEach(id => $(id).addEventListener('change', renderPooled));
  $('p3-benchmark-filter').addEventListener('change', renderP3);
  document.querySelectorAll('[data-sync-filter]').forEach(select => {
    select.innerHTML = $(select.dataset.syncFilter).innerHTML;
    select.addEventListener('change', () => {
      $(select.dataset.syncFilter).value = select.value;
      render();
    });
  });
  ['benchmark-filter', 'method-filter', 'view-filter'].forEach(id => $(id).addEventListener('change', render));
  $('monitor-filter').addEventListener('change', renderAssociations);
  $('difference-view').addEventListener('change', renderDifferences);
  const chooseBenchmark = id => {
    $('benchmark-filter').value = id;
    render();
  };
  ['effect-benchmark-tabs', 'difference-benchmark-tabs', 'pooled-benchmark-tabs'].forEach(id => {
    const pooled = id === 'pooled-benchmark-tabs';
    const panel = pooled ? 'pooled-chart' : id === 'effect-benchmark-tabs' ? 'effect-chart' : 'difference-panel';
    const selectBenchmark = pooled ? benchmarkId => { $('pooled-benchmark-filter').value = benchmarkId; renderPooled(); } : chooseBenchmark;
    $(panel).setAttribute('role', 'tabpanel');
    $(id).innerHTML = BENCHMARK_GROUPS.map(group => `<div class="benchmark-tab-group benchmark-${group.kind}" role="presentation"><span class="benchmark-group-label" aria-hidden="true">${html(group.label)}</span><div class="benchmark-group-tabs" role="presentation">${group.benchmarks.map(bench => `<button type="button" role="tab" id="${id}-${html(bench.id)}" data-benchmark="${html(bench.id)}" aria-label="${html(bench.label)} — ${html(group.label)}" aria-controls="${panel}" aria-selected="false" tabindex="-1">${html(bench.label)}</button>`).join('')}</div></div>`).join('');
    $(id).addEventListener('click', event => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) selectBenchmark(tab.dataset.benchmark);
    });
    $(id).addEventListener('keydown', event => {
      const tabs = [...$(id).querySelectorAll('[role="tab"]')], position = tabs.indexOf(event.target);
      if (position < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (position + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectBenchmark(tabs[next].dataset.benchmark);
      tabs[next].focus({preventScroll: true});
    });
  });
  $('effect-heatmap').addEventListener('click', event => {
    const button = event.target.closest('button[data-benchmark]');
    if (button) chooseBenchmark(button.dataset.benchmark);
  });
  const showPair = event => {
    const button = event.target.closest('button[data-pair]');
    if (button) selectMatrixCell(button);
  };
  $('difference-matrices').addEventListener('click', showPair);
  $('difference-matrices').addEventListener('focusin', showPair);
  const showPoint = event => {
    const point = event.target.closest('.association-point');
    if (point) $(`scatter-detail-${point.dataset.panel}`).textContent = point.dataset.detail;
  };
  $('association-panels').addEventListener('focusin', showPoint);
  $('association-panels').addEventListener('click', showPoint);
  renderStatic();
  render();
  renderPooled();
  renderP3();
  const revealSection = () => {
    const id = location.hash.slice(1);
    const target = $(id);
    if (!target) return;
    let ancestor = target;
    let opened = false;
    while (ancestor) {
      if (ancestor.tagName === 'DETAILS' && !ancestor.open) {
        ancestor.open = true;
        opened = true;
      }
      ancestor = ancestor.parentElement;
    }
    if (opened) target.scrollIntoView();
  };
  window.addEventListener('hashchange', revealSection);
  revealSection();
})();
