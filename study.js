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
  const BENCHMARKS = DATA.benchmarks || [];
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
  const money = value => finite(value) ? `$${value.toFixed(2)}` : 'unknown';
  const belief = id => BELIEFS.find(row => row.id === id);
  const beliefLabel = id => belief(id)?.label || 'Label unavailable';
  const current = () => ({benchmark: $('benchmark-filter').value, method: $('method-filter').value, view: $('view-filter').value, monitor: $('monitor-filter').value});
  const methods = () => current().method === 'all' ? METHODS : [current().method];
  const view = () => DATA.statistics?.views?.[current().view];
  const selected = (rows, allBenchmarks = false) => (rows || []).filter(row => MODELS.includes(row.model) && (allBenchmarks || row.benchmark === current().benchmark) && methods().includes(row.method));
  const effects = (reference = 'neutral', allBenchmarks = false) => selected(view()?.effects, allBenchmarks).filter(row => row.reference === reference);
  const corrected = row => finite(row?.estimate) && finite(row?.p_adjusted) && row.p_adjusted <= .05 && row.n_clusters > 2;
  const reversal = row => row?.robust_reversal === true && row.n_clusters > 2;
  const star = row => corrected(row) ? ' ★' : '';
  const significance = row => !finite(row?.estimate) ? 'Unavailable' : row.n_clusters <= 2 ? 'Inconclusive' : !finite(row.p_adjusted) ? 'Unavailable' : corrected(row) ? 'Significant' : 'Not significant';
  const benchmark = () => BENCHMARKS.find(row => row.id === current().benchmark);
  const direction = row => row?.direction === 'higher' ? 'Higher is better on this metric' : row?.direction === 'lower' ? 'Lower is better on this metric' : (row?.direction || 'Preferred direction unspecified');
  const methodLabel = id => ({P1: 'P1 · contextual documents', P2: 'P2 · explicit system notice'}[id] || id);
  const selectionLabel = () => `${MODELS.map(modelLabel).join(' and ')} · ${benchmark()?.label || 'Selected benchmark'} · ${methods().map(methodLabel).join(' / ')} · ${current().view} scoring`;
  const nativeContext = row => `${row?.metric || 'Metric unavailable'} · ${direction(row)}. Positive Δ means more of the measured outcome; this is not a universal safety scale.${row?.id === 'fortress' ? ' Units are risk points on the rescaled 0–100 FORTRESS score, not harmful-response percentages. Higher means more risk; lower means less risk.' : ''}`;

  function table(headers, rows, className = '', caption = '') {
    return `<table class="${className}">${caption ? `<caption>${html(caption)}</caption>` : ''}<thead><tr>${headers.map(label => `<th scope="col">${html(label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map((cell, index) => `<${index ? 'td' : 'th scope="row"'}>${cell}</${index ? 'td' : 'th'}>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="unknown">No data available for this selection.</td></tr>`}</tbody></table>`;
  }

  function metadata(value) {
    if (value === null || value === undefined) return '<span class="unknown">unavailable</span>';
    if (Array.isArray(value)) return value.length ? `<ul>${value.map(item => `<li>${metadata(item)}</li>`).join('')}</ul>` : 'None recorded';
    if (typeof value === 'object') return `<dl class="metadata">${Object.entries(value).map(([key, item]) => `<dt>${html(descriptiveText(key).replaceAll('_', ' '))}</dt><dd>${metadata(item)}</dd>`).join('')}</dl>`;
    return html(descriptiveText(value));
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
  const uncertainty = row => row.n_clusters <= 2 ? 'inconclusive: at most two clusters' : validCI(row.ci95) ? 'pointwise 95% interval' : 'CI unavailable';

  function forest(id, rows, label, title, difference = false, sharedLimit = null, compact = false) {
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
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${html(title)}</title><desc id="${descId}">Signed native-score differences in ${html(scoreUnit())}. Each row holds every model: ${html(modelLegendText())}. Each dot is a point estimate; circles are P1 and squares P2. Each bar is a pointwise 95 percent cluster-bootstrap confidence interval when available. A star denotes Holm-adjusted p at most .05. Full statistics are provided in the accompanying table.</desc>`;
    for (let tick = -2; tick <= 2; tick++) {
      const value = tick * limit / 2;
      svg += line(x(value), top - 15, x(value), bottom, tick === 0 ? 'zero-line' : 'grid-line');
      svg += text(x(value), bottom + 22, (value * 100).toFixed(1), 'text-anchor="middle" class="axis-label"');
    }
    svg += text(left, 18, compact ? (difference ? 'A−B < 0' : 'Lower') : difference ? 'More negative A−B difference' : 'Lower native score', 'class="axis-label"');
    svg += text(right, 18, compact ? (difference ? 'A−B > 0' : 'Higher') : difference ? 'More positive A−B difference' : 'Higher native score', 'text-anchor="end" class="axis-label"');
    svg += text(estimateX, 18, `Estimate · ${scoreUnit()}`, 'class="axis-label"');
    svg += text(pX, 18, 'Holm p', 'class="axis-label"');
    svg += text(resultX, 18, 'Result · α = .05', 'class="axis-label"');
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
        const description = `${name}: ${pp(row.estimate)}; CI ${ci(row.ci95)}; raw p ${pvalue(row.p_value)}; Holm p ${pvalue(row.p_adjusted)}; ${significance(row)}; ${count(row.n_pairs)} paired items, ${count(row.n_clusters)} clusters; ${uncertainty(row)}${difference ? `; ${row.opposite_signs ? 'opposite point signs' : 'no opposite point signs'}; ${reversal(row) ? 'supported reversal' : 'no supported reversal'}` : ''}`;
        svg += `<g class="point-focus" tabindex="0" role="img" aria-label="${html(description)}"><title>${html(description)}</title>`;
        if (validCI(row.ci95)) {
          svg += `<path d="M${x(row.ci95[0])},${y - 4}v8 M${x(row.ci95[0])},${y}H${x(row.ci95[1])} M${x(row.ci95[1])},${y - 4}v8" style="stroke:${style.fill}" fill="none" class="ci-whisker"/>`;
        }
        svg += `<circle cx="${x(row.estimate)}" cy="${y}" r="9" class="focus-ring"/>`;
        svg += row.method === 'P2' ? `<rect x="${x(row.estimate) - 4.5}" y="${y - 4.5}" width="9" height="9" style="fill:${style.fill}" class="data-point"/>` : `<circle cx="${x(row.estimate)}" cy="${y}" r="5" style="fill:${style.fill}" class="data-point"/>`;
        svg += '</g>';
        svg += text(estimateX, y + 4, `${modelShort(row.model)} ${signed(row.estimate)}${star(row)}`, `class="axis-label" style="fill:${style.text}"`);
        svg += text(pX, y + 4, pvalue(row.p_adjusted), `class="axis-label" style="fill:${style.text}"`);
        svg += text(resultX, y + 4, significance(row), `class="axis-label" style="fill:${style.text}"`);
      });
    });
    svg += text((left + right) / 2, bottom + 49, `Dot = estimate, ${difference ? '(A − neutral A) − (B − neutral B)' : 'treatment − reference'} · ${scoreUnit()}`, 'text-anchor="middle" class="axis-label"');
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
    svg += text(kx + 33, ky, 'bar = 95% interval', 'class="axis-label"');
    kx += 33 + advance('bar = 95% interval');
    svg += `<circle cx="${kx + 5}" cy="${ky - 4}" r="4.5" style="fill:var(--muted)"/>${text(kx + 14, ky, 'P1', 'class="axis-label"')}`;
    svg += `<rect x="${kx + 38}" y="${ky - 8.5}" width="9" height="9" style="fill:var(--muted)"/>${text(kx + 52, ky, 'P2', 'class="axis-label"')}`;
    $(id).innerHTML = `${svg}</svg>`;
  }

  function methodForests(id, rows, label, title, difference = false) {
    const selectedMethods = methods(), together = selectedMethods.length > 1;
    const container = $(id);
    container.classList.toggle('method-panels', together);
    container.innerHTML = selectedMethods.map(method => `<article class="method-panel"><h4>${html(methodLabel(method))}</h4><div id="${id}-${method}" class="chart-scroll" tabindex="0" role="region" aria-label="${html(methodLabel(method))} · ${html(title)}"></div></article>`).join('');
    const limit = extent(rows);
    selectedMethods.forEach(method => forest(`${id}-${method}`, rows.filter(row => row.method === method), label, `${methodLabel(method)}: ${title}`, difference, limit, together));
  }

  function effectTable(rows) {
    return table(['Belief / method / reference', 'Model', 'Δ', 'Pointwise 95% CI', 'Pairs / assigned', 'Clusters', 'Raw p', 'Holm p · 336', 'All-assigned Δ bounds', 'Inference'], rows.map(row => [
      `${html(beliefLabel(row.belief))}<span class="subtext">${html(row.method)} · ${html(row.reference)}</span>`, html(modelLabel(row.model)),
      `<span class="number">${pp(row.estimate)}${star(row)}</span>`, ci(row.ci95), `${count(row.n_pairs)} / ${count(row.n_assigned)}`, count(row.n_clusters), pvalue(row.p_value), pvalue(row.p_adjusted), ci(row.missing_bounds), `${significance(row)} · ${uncertainty(row)}`
    ]), 'effect-table');
  }

  function renderHeatmap() {
    const rows = effects('neutral', true);
    const scale = Math.max(.01, ...rows.map(row => Math.abs(row.estimate)).filter(finite));
    $('heatmap-key').innerHTML = `<span>Blue ${signed(-scale)}</span><span class="signed-ramp" aria-hidden="true"></span><span>Orange ${signed(scale)}</span><span>Native 0–100 score points (FORTRESS: risk points; rates: pp). Scale shared by both models within this method / scoring view · white = zero · ★ corrected evidence · each cell stacks ${html(MODELS.map(model => `${modelLabel(model)} (${MODEL_STYLE[model].name} tint)`).join(' above '))}; read magnitude from the number</span>`;
    const index = new Map(rows.map(row => [`${row.model}|${row.belief}|${row.method}|${row.benchmark}`, row]));
    $('effect-heatmap').innerHTML = `<table class="heatmap"><caption>${html(MODELS.map(modelLabel).join(' and '))} · matched neutral · ${html(current().view)} scoring</caption><thead><tr><th scope="col">Belief target / method</th>${BENCHMARKS.map(bench => `<th scope="col"><button class="benchmark-button" type="button" data-benchmark="${html(bench.id)}" aria-pressed="${bench.id === current().benchmark}">${html(bench.label)}<span class="subtext">${html(bench.metric)}</span></button></th>`).join('')}</tr></thead><tbody>${BELIEFS.map(target => methods().map(method => `<tr><th scope="row">${html(target.label)}<span class="subtext">${html(method)}</span></th>${BENCHMARKS.map(bench => `<td>${MODELS.map(model => {
      const row = index.get(`${model}|${target.id}|${method}|${bench.id}`);
      const detail = `${modelLabel(model)}, ${target.label}, ${method}, ${bench.label}: ${pp(row?.estimate, bench.id)}; CI ${ci(row?.ci95, bench.id)}; Holm p ${pvalue(row?.p_adjusted)}; ${count(row?.n_pairs)} of ${count(row?.n_assigned)} paired items; ${count(row?.n_clusters)} clusters`;
      return modelCell(model, row?.estimate, scale, `${html(modelShort(model))} ${finite(row?.estimate) ? `${signed(row.estimate)}${star(row)}` : 'unavailable'}<span class="subtext">n=${count(row?.n_pairs)}/${count(row?.n_assigned)}${row?.n_clusters <= 2 ? ' · 2-cluster caution' : ''}</span>`, detail);
    }).join('')}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table>`;
  }

  function renderEffects() {
    const rows = effects();
    const order = new Map(BELIEFS.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (order.get(a.belief) ?? 100) - (order.get(b.belief) ?? 100) || a.method.localeCompare(b.method) || modelOrder(a, b));
    $('effect-heading').textContent = `${benchmark()?.label || 'Selected benchmark'} · all ${BELIEFS.length} supplied messages`;
    $('effect-scope').textContent = `${selectionLabel()} · treatment − matched neutral on the same benchmark’s tasks.`;
    $('metric-context').textContent = nativeContext(benchmark());
    $('cluster-warning').hidden = !rows.some(row => row.n_clusters <= 2);
    $('cluster-warning').textContent = 'Cluster-inference warning: this selection includes contrasts with at most two clusters. In particular, the misalignment benchmark has only two scenario families. Point estimates are descriptive; reliable differences or reversals cannot be inferred from them.';
    $('effect-significance-summary').textContent = MODELS.map(model => {
      const own = rows.filter(row => row.model === model);
      const inconclusive = own.filter(row => significance(row) === 'Inconclusive').length;
      const unavailable = own.filter(row => significance(row) === 'Unavailable').length;
      return `${modelLabel(model)}: ${own.filter(corrected).length} of ${own.length} selected effects significant after Holm correction${inconclusive ? `; ${inconclusive} inconclusive (too few clusters)` : ''}${unavailable ? `; ${unavailable} unavailable` : ''}.`;
    }).join(' ');
    methodForests('effect-chart', rows, row => beliefLabel(row.belief), `${selectionLabel()}: all supplied-message effects relative to matched neutral`);
    $('effect-table').innerHTML = effectTable(rows);
  }

  const matrixSelections = new Map();
  let matrixRows = new Map();

  function pairDescription(row) {
    return `${modelLabel(row.model)}. A: ${beliefLabel(row.belief_a)}. B: ${beliefLabel(row.belief_b)}. ${methodLabel(row.method)}. A−B: ${pp(row.estimate)}; pointwise 95% CI ${ci(row.ci95)}; Holm p ${pvalue(row.p_adjusted)}; ${count(row.n_pairs)} common-task pairs; ${count(row.n_clusters)} clusters; ${uncertainty(row)}${corrected(row) ? '; corrected evidence of a difference' : '; no corrected evidence of a difference'}.`;
  }

  function selectMatrixCell(button) {
    const method = button.dataset.method, key = button.dataset.pair;
    const pair = matrixRows.get(`${method}|${key}`);
    if (!pair) return;
    matrixSelections.set(method, key);
    button.closest('.pair-matrix').querySelectorAll('button[data-pair]').forEach(cell => {
      cell.setAttribute('aria-pressed', String(cell === button));
    });
    const exact = value => finite(value) ? String(value) : 'unavailable';
    $(`pair-detail-${method}`).innerHTML = `<h4>A: ${html(beliefLabel(pair[0].belief_a))}<br>B: ${html(beliefLabel(pair[0].belief_b))}</h4>${pair.map(row => `
      <p><strong style="color:${MODEL_STYLE[row.model].text}">${html(modelLabel(row.model))} · A−B: ${pp(row.estimate)}${star(row)}</strong> · pointwise 95% CI ${ci(row.ci95)}<br>
      Holm-adjusted p (1,540 planned): ${exact(row.p_adjusted)} · raw p: ${exact(row.p_value)}<br>
      ${count(row.n_pairs)} common-task pairs · ${count(row.n_clusters)} clusters · ${uncertainty(row)}<br>
      Effects on these same common tasks: A − neutral A = ${pp(row.effect_a)}; B − neutral B = ${pp(row.effect_b)}.<br>
      Opposite point signs: ${finite(row.effect_a) && finite(row.effect_b) ? (row.opposite_signs ? 'yes, descriptive only' : 'no') : 'unavailable'} · Supported reversal: ${reversal(row) ? 'yes' : 'no'}.<br>
      <span class="fine">Unrounded native 0–1 units: difference ${exact(row.estimate)}; CI ${validCI(row.ci95) ? `[${row.ci95.map(exact).join(', ')}]` : 'unavailable'}.</span></p>`).join('')}
      <p class="fine">${html(methodLabel(method))} · ${html(benchmark()?.label)}. A missing interval is not zero uncertainty; a missing estimate is not zero effect.</p>`;
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
      return `<article class="matrix-panel"><h4>${html(methodLabel(method))}</h4><div class="table-scroll" tabindex="0" role="region" aria-label="${html(methodLabel(method))}: all 55 unique same-benchmark comparisons"><table class="pair-matrix"><caption>Row A − column B · ${html(benchmark()?.label)} · ${html(scoreUnit())}. Each cell stacks ${html(MODELS.map(model => `${modelLabel(model)} (${MODEL_STYLE[model].name} tint)`).join(' above '))}. Column numbers are navigation positions matched to the numbered full message names on the rows, not target identifiers.</caption><thead><tr><th scope="col">Message A ↓ / message B →</th>${BELIEFS.map((target, i) => `<th scope="col" title="${html(target.label)}"><span aria-hidden="true">${i + 1}</span><span class="visually-hidden">${i + 1}. ${html(target.label)}</span></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div id="pair-detail-${method}" class="pair-detail" aria-live="polite" aria-atomic="true"></div></article>`;
    }).join('');
    methods().forEach(method => {
      const key = matrixSelections.get(method) || '0-1';
      const button = $('difference-matrices').querySelector(`button[data-method="${method}"][data-pair="${key}"]`);
      if (button) selectMatrixCell(button);
    });
  }

  function renderDifferences() {
    const state = current();
    $('difference-scope').textContent = `${selectionLabel()} · same-benchmark comparisons, not a cross-benchmark total.`;
    $('difference-detail-heading').textContent = `${benchmark()?.label || 'Selected benchmark'} · paired message-effect differences`;
    $('difference-metric-context').textContent = nativeContext(benchmark());
    $('difference-overview-note').textContent = `${state.view === 'recovered' ? 'Recovered' : 'Original'} scoring. Each cell shows corrected direct differences / estimable comparisons (55 planned). This overview ignores the benchmark and method filters. Holm correction still covers all 1,540 planned comparisons in this scoring view. Zero means no corrected evidence, not proof of equal effects.`;
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
    const significant = rows.filter(corrected);
    const opposite = rows.filter(row => row.opposite_signs === true);
    const supported = rows.filter(reversal);
    $('difference-summary').textContent = `${MODELS.map(model => {
      const own = rows.filter(row => row.model === model);
      const estimable = own.filter(row => finite(row.estimate)).length;
      const ownSignificant = own.filter(corrected);
      const ownOpposite = own.filter(row => row.opposite_signs === true).length;
      const ownSupported = own.filter(reversal).length;
      const g1Count = ownSignificant.filter(row => row.belief_a === 'G1' || row.belief_b === 'G1').length;
      return `${modelLabel(model)}: ${count(own.length)} selected comparisons, ${count(estimable)} with an estimate; ${count(ownSignificant.length)} with Holm-adjusted evidence of a direct difference (${count(g1Count)} involve the concrete-scoring-criterion condition); ${count(ownOpposite)} with opposite point-estimate signs; ${count(ownSupported)} supported reversals (${count(ownOpposite - ownSupported)} opposite-sign comparisons do not meet the criterion); ${count(own.length - estimable)} estimates unavailable.`;
    }).join(' ')} Counts apply only to the detailed selection above.`;
    const matrix = $('difference-view').value === 'matrix';
    $('difference-matrices').hidden = !matrix;
    $('difference-chart').hidden = matrix;
    $('difference-selection-note').textContent = `Showing all ${BELIEFS.length * (BELIEFS.length - 1) / 2} unique pairs per method (${methods().length} ${methods().length === 1 ? 'method' : 'separate methods'}), without significance filtering. ${matrix ? 'Select or keyboard-focus a cell for its full message names, effect, interval, adjusted p-value and task counts. Row A minus column B; ≤2 marks inconclusive cluster inference. Blank lower-triangle cells omit duplicates, not results.' : 'All intervals appear in message-name order, separated by method; unavailable estimates remain explicit.'}`;
    if (matrix) {
      $('difference-chart').innerHTML = '';
      renderMatrices(rows);
    } else {
      $('difference-matrices').innerHTML = '';
      const plotted = [...rows].sort((a, b) => a.method.localeCompare(b.method) || beliefLabel(a.belief_a).localeCompare(beliefLabel(b.belief_a)) || beliefLabel(a.belief_b).localeCompare(beliefLabel(b.belief_b)));
      methodForests('difference-chart', plotted, row => `A: ${beliefLabel(row.belief_a)}\nB: ${beliefLabel(row.belief_b)}`, `${selectionLabel()}: paired message-effect differences`, true);
    }
    $('difference-table-heading').textContent = `All ${count(rows.length)} selected direct differences · including unsupported and unavailable results`;
    $('difference-table').innerHTML = table(['A − B / method', 'Model', 'Direct difference', 'Pointwise 95% CI', 'Effect A · common items', 'Effect B · common items', 'Pairs', 'Clusters', 'Raw p', 'Holm p · 1,540', 'Opposite point signs?', 'Supported reversal?', 'Inference'], [...rows].sort((a, b) => a.method.localeCompare(b.method) || a.belief_a.localeCompare(b.belief_a) || a.belief_b.localeCompare(b.belief_b) || modelOrder(a, b)).map(row => [
      `A: ${html(beliefLabel(row.belief_a))}<br>B: ${html(beliefLabel(row.belief_b))}<span class="subtext">${html(row.method)}</span>`, html(modelLabel(row.model)), `<span class="number">${pp(row.estimate)}${star(row)}</span>`, ci(row.ci95), pp(row.effect_a), pp(row.effect_b), count(row.n_pairs), count(row.n_clusters), pvalue(row.p_value), pvalue(row.p_adjusted), finite(row.effect_a) && finite(row.effect_b) ? (row.opposite_signs ? 'Yes · descriptive only' : 'No') : 'unavailable', reversal(row) ? 'Yes · corrected criterion met' : 'No', uncertainty(row)
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
      const label = `${modelLabel(row.model)} · ${sensitivity === 'full' ? 'All available conditions' : 'Without concrete scoring criterion · sensitivity'}`;
      if (!item) return `<div class="association-inference"><strong>${label}</strong><p class="unknown">Inference unavailable for this exact selection.</p></div>`;
      const interval = validCI(item.ci95) ? `[${item.ci95.map(correlation).join(', ')}]` : 'unavailable';
      const noise = item.shared_task_noise;
      return `<div class="association-inference"><strong>${label}: r = ${correlation(item.r)}</strong><p>Pointwise 95% cluster-bootstrap CI: ${interval}<br>Approximate raw p: ${pvalue(item.p_raw)} · Holm p (336 planned): ${pvalue(item.p_adjusted)}<br>${count(item.n_clusters)} source-task clusters · ${count(item.min_pairs)}–${count(item.max_pairs)} pairs per condition${item.unavailable_reason ? `<br><span class="unknown">Inference unavailable: ${html(item.unavailable_reason)}</span>` : ''}</p><p class="fine">Descriptive disjoint-half diagnostic: median r = ${correlation(noise?.median)}; sign stability = ${percent(noise?.sign_stability)}; valid directional correlations ${count(noise?.valid_directional_correlations)} / ${count(noise?.attempted_directional_correlations)}. These repeated splits are dependent; this is not a CI or significance test.</p></div>`;
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
    const summary = sets.map(({row}) => `${html(modelShort(row.model))} r = ${correlation(row.r)} · ${count(row.n_conditions)} conditions`).join('<br>');
    return `<article class="scatter-panel"><h4>${html(method)} · ${html(monitor)}</h4><p class="association-summary">Observed profile<br>${summary}</p>${sets.map(({row}) => associationInference(row)).join('')}${all.length ? `${svg}<ol class="scatter-key">${order.map(id => `<li>${html(beliefLabel(id))}</li>`).join('')}</ol>` : '<p class="empty">No paired monitor-and-score points available.</p>'}<p id="scatter-detail-${index}" class="scatter-detail" aria-live="polite">Point numbers map to the condition names above and are shared by both models. Focus or select a point for exact paired values. Coincident points are grouped within a model; no jitter is added. Axes scale independently per panel.</p></article>`;
  }

  function renderAssociations() {
    const rows = selected(view()?.associations).filter(row => row.monitor === current().monitor).sort(modelOrder);
    const constructs = {M1: 'verbalized evaluation awareness in recorded reasoning', M2: 'verbalized grader awareness in recorded reasoning (our reconstruction, not an official Anthropic detector)', M3: 'external transcript evaluation-likeness at an uncalibrated 0.85 threshold; this monitor can see the intervention itself and does not measure actor belief adoption'};
    $('monitor-context').textContent = `${current().monitor}: ${constructs[current().monitor]}. Positive x means more monitor-positive results; positive y means a higher ${benchmark()?.metric || 'native score'}.`;
    const panels = methods().map(method => [method, rows.filter(row => row.method === method)]).filter(([, group]) => group.length);
    $('association-panels').innerHTML = panels.length ? panels.map(([method, group], index) => scatter(method, group, index)).join('') : '<p class="empty">Association data unavailable for this selection.</p>';
    $('association-table').innerHTML = table(['Belief / method', 'Model', 'Monitor', 'Paired monitor shift', 'Paired behavior shift', 'Identical available pairs'], rows.flatMap(row => (row.points || []).map(point => [
      `${html(beliefLabel(point.belief))}<span class="subtext">${html(row.method)}</span>`, html(modelLabel(row.model)), html(row.monitor), pp(point.x, 'monitor'), pp(point.y), count(point.n_pairs)
    ])));
  }

  function renderG1() {
    const rows = selected(view()?.effects).filter(row => String(row.belief).toUpperCase() === 'G1' && ['neutral', 'information'].includes(row.reference)).sort((a, b) => a.method.localeCompare(b.method) || (a.reference === b.reference ? 0 : a.reference === 'neutral' ? -1 : 1));
    methodForests('g1-chart', rows, row => `Concrete criterion determines score\n${row.reference} control`, 'Concrete-scoring-criterion effects relative to neutral and information controls');
    $('g1-table').innerHTML = effectTable(rows);
  }

  function renderLevels() {
    const rows = (view()?.levels || []).filter(row => MODELS.includes(row.model) && row.benchmark === current().benchmark);
    const firstSeen = new Map();
    rows.forEach((row, position) => { if (!firstSeen.has(row.setting)) firstSeen.set(row.setting, position); });
    rows.sort((a, b) => firstSeen.get(a.setting) - firstSeen.get(b.setting) || modelOrder(a, b));
    const settings = new Map((DATA.settings || []).map(row => [row.id, row]));
    $('level-table').innerHTML = table(['Setting', 'Model', 'Native mean', 'Scored / planned', 'M1 positive · known n', 'M2 positive · known n', 'M3 positive · known n'], rows.map(row => {
      const setting = settings.get(row.setting);
      const target = belief(setting?.belief)?.label;
      const references = [...new Set((setting?.reference_ids || []).map(id => belief(settings.get(id)?.belief)?.label).filter(Boolean))];
      const label = setting ? [target || (references.length ? `Reference for ${references.join('; ')}` : ''), setting.method, setting.control].filter(Boolean).join(' · ') : '';
      return [`${html(descriptiveText(label || 'Setting label unavailable'))}`, html(modelLabel(row.model)), current().benchmark === 'fortress' ? pp(row.mean) : percent(row.mean), `${count(row.n)} / ${count(row.planned)}`, ...['M1', 'M2', 'M3'].map(monitor => `${percent(row.monitors?.[monitor]?.rate)} · n=${count(row.monitors?.[monitor]?.n)}`)];
    }), 'level-table', `${MODELS.map(modelLabel).join(' and ')} · ${benchmark()?.label} · all methods and controls · ${current().view} scoring`);
  }

  function renderSummary(differences) {
    const rows = effects();
    const available = rows.filter(row => finite(row.estimate)).length;
    const split = (items, test) => MODELS.map(model => `${modelShort(model)} ${count(items.filter(row => row.model === model && test(row)).length)}`).join(' · ');
    $('answer-summary').innerHTML = [
      [rows.filter(corrected).length, 'Corrected message effects', `${split(rows, corrected)}. ${available}/${rows.length} selected estimates available across both models; full 336-effect family.`],
      [differences.significant.length, 'Direct message differences', `${split(differences.rows, corrected)}. Of ${differences.rows.length} selected comparisons; full 1,540-difference family.`],
      [differences.supported.length, 'Supported reversals', `${split(differences.rows, reversal)}. ${differences.opposite.length} raw opposite-sign comparisons. Signs alone are not enough.`]
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
    $('p3-selection').textContent = `${MODELS.map(modelLabel).join(' and ')} · ${benchmark()?.label || state.benchmark} · P3 recorded-only outcomes. P1/P2 delivery-method, scoring-view and monitor filters do not apply. ${nativeContext(benchmark())}`;
    const metrics = [['planned', 'Planned'], ['eligible', 'Eligible'], ['generated', 'Generated'], ['scored', 'Scored'], ['complete', 'Complete'], ['withheld', 'Held / withheld']];
    $('p3-counts').innerHTML = metrics.map(([key, label]) => `<div class="summary-card"><strong>${count(snapshot?.counts?.[key])}</strong><span>${label}</span></div>`).join('');
    $('p3-coverage').innerHTML = table(['Model', ...metrics.map(([, label]) => label), 'Awaiting generation', 'Awaiting measurement', 'Grading budget held'], Object.entries(snapshot?.coverage || {}).map(([model, row]) => [
      html(DATA.models[model]?.label || model), ...metrics.map(([key]) => count(row[key])), count(row.awaiting_generation), count(row.awaiting_measurement), count(row.grading_budget_held)
    ]), 'coverage-table', 'P3 assignment-level coverage across all benchmarks; counts are not mutually exclusive stages.');
    const beliefRank = id => { const rank = BELIEFS.findIndex(target => target.id === id); return rank < 0 ? BELIEFS.length : rank; };
    const rows = (snapshot?.contrasts || []).filter(row => MODELS.includes(row.model) && row.benchmark === state.benchmark).sort((a, b) => beliefRank(a.belief) - beliefRank(b.belief) || modelOrder(a, b));
    $('p3-contrasts').innerHTML = table(['Supplied condition · P3 vs matched neutral', 'Model', 'Descriptive native-score Δ', 'Scored pairs / eligible / planned', 'Observed clusters', ...['M1', 'M2', 'M3'].map(monitor => `${monitor}: monitor Δ / behavior Δ / identical pairs`)], rows.map(row => [
      html(beliefLabel(row.belief)), html(modelLabel(row.model)), pp(row.estimate), `${count(row.n_pairs)} / ${count(row.n_eligible_pairs)} / ${count(row.n_planned_pairs)}`, count(row.n_clusters),
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
    $('selection-context').textContent = `${selectionLabel()} · matched neutral`;
    document.querySelectorAll('[data-sync-filter]').forEach(select => { select.value = $(select.dataset.syncFilter).value; });
    document.querySelectorAll('.benchmark-tabs [role="tab"]').forEach(tab => {
      const active = tab.dataset.benchmark === state.benchmark;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) $(tab.getAttribute('aria-controls')).setAttribute('aria-labelledby', tab.id);
    });
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

  $('benchmark-filter').innerHTML = BENCHMARKS.map(row => `<option value="${html(row.id)}">${html(row.label)}</option>`).join('');
  $('benchmark-filter').value = BENCHMARKS[0]?.id || '';
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
  ['effect-benchmark-tabs', 'difference-benchmark-tabs'].forEach(id => {
    const panel = id === 'effect-benchmark-tabs' ? 'effect-chart' : 'difference-panel';
    $(panel).setAttribute('role', 'tabpanel');
    $(id).innerHTML = BENCHMARKS.map(bench => `<button type="button" role="tab" id="${id}-${html(bench.id)}" data-benchmark="${html(bench.id)}" aria-controls="${panel}" aria-selected="false" tabindex="-1">${html(bench.label)}</button>`).join('');
    $(id).addEventListener('click', event => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) chooseBenchmark(tab.dataset.benchmark);
    });
    $(id).addEventListener('keydown', event => {
      const tabs = [...$(id).querySelectorAll('[role="tab"]')], position = tabs.indexOf(event.target);
      if (position < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (position + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      chooseBenchmark(tabs[next].dataset.benchmark);
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
})();
