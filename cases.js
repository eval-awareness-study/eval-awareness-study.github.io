'use strict';
const DATA = JSON.parse(document.getElementById('study-data').textContent);
const BENCHES = ['xstest', 'gsm8k', 'agentic_misalignment', 'agentharm'];
const BENCH_LABELS = ['XSTest', 'GSM8K', 'Agentic Misalignment', 'AgentHarm benign'];
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const num = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'unknown';
const shortName = belief => belief.name.replaceAll('_', ' ');
// Case files stay separate from the aggregate payload and are fetched on demand.
function initCaseBrowser() {
  const filters = {model:'case-model', benchmark:'case-benchmark', belief_id:'case-belief', method:'case-method', phrasing:'case-phrasing', reference:'case-reference', outcome:'case-outcome'};
  let manifest = null;
  let manifestURL = null;
  let matches = [];
  let position = 0;
  let loading = false;
  let request = 0;
  let activeFetch = null;
  const text = value => typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  const pre = value => `<pre class="case-text">${escapeHTML(text(value))}</pre>`;
  const structured = value => {
    if (typeof value !== 'string') return pre(value);
    try { return pre(JSON.parse(value)); } catch { return pre(value); }
  };
  const native = value => Number.isFinite(value) ? String(Number(value.toFixed(6))) : 'Unknown';
  const signed = value => `${value > 0 ? '+' : ''}${native(value)}`;
  const benchName = key => BENCH_LABELS[BENCHES.indexOf(key)] || key;
  const modelName = key => DATA.models[key]?.label || key;
  const caseLabel = item => `${modelName(item.model)} · ${benchName(item.benchmark)} · ${item.belief_id} ${item.method} ${item.phrasing}/${item.variant} · item ${item.item_id}, sample ${item.sample_idx} · ${item.reference_label} · ${item.outcome} (${signed(item.delta)})`;
  function localURL(path, base) {
    const url = new URL(path, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin || url.username || url.password) {
      throw new Error('Case files require a same-origin HTTP(S) server.');
    }
    return url;
  }
  async function fetchJSON(url, signal) {
    const response = await fetch(url, {signal, credentials:'omit', redirect:'error'});
    if (!response.ok) throw new Error(`Case file returned HTTP ${response.status}.`);
    return response.json();
  }
  function addOptions(id, values, label) {
    for (const value of values) $(id).add(new Option(label(value), value));
  }
  function messageHTML(message, index) {
    const role = String(message.role || 'unknown');
    const turn = Number.isInteger(message.index) ? message.index + 1 : index + 1;
    if (role === 'assistant') {
      const calls = message.tool_calls || [];
      const tools = calls.length ? `<details class="case-context"><summary>Tool calls · ${calls.length}</summary>${calls.map(call => `<h5>${escapeHTML(call.function.name)}</h5>${structured(call.function.arguments)}`).join('')}</details>` : '';
      return `<div class="case-turn case-assistant"><h5>Assistant · turn ${turn}</h5><div class="case-prose">${escapeHTML(text(message.content))}</div>${tools}</div>`;
    }
    if (role === 'tool') {
      return `<details class="case-turn case-tool"><summary>Tool result${message.name ? ` · ${escapeHTML(message.name)}` : ''} · turn ${turn}</summary>${structured(message.content)}</details>`;
    }
    const heading = `${role} · turn ${turn}${message.origin ? ` · ${String(message.origin).replaceAll('_', ' ')}` : ''}`;
    return `<details class="case-context"><summary>${escapeHTML(heading)}</summary>${pre(message.content)}</details>`;
  }
  function rolloutHTML(rollout, title) {
    const messages = Array.isArray(rollout.messages) ? rollout.messages : [];
    const cue = rollout.planting;
    return `<article class="case-rollout"><h4>${escapeHTML(title)}</h4><p>Native score: <strong>${escapeHTML(native(rollout.score))}</strong></p>${cue?.text ? `<div class="case-cue"><h4>Planted input</h4>${pre(cue.text)}</div>` : ''}<details><summary>Scoring and identifiers</summary><p class="case-identity">Setting ${escapeHTML(rollout.setting_id)} · rollout ${escapeHTML(rollout.rid)}</p>${pre(rollout.score_evidence)}</details><div class="case-messages">${messages.length ? messages.map(messageHTML).join('') : '<p>No visible messages available in this export.</p>'}</div></article>`;
  }
  function detailHTML(detail, item) {
    return `<h3 id="case-title">${escapeHTML(modelName(item.model))} · ${escapeHTML(benchName(item.benchmark))}</h3>
      <p class="case-identity">${escapeHTML(item.belief_id)} · ${escapeHTML(item.method)} · ${escapeHTML(item.phrasing)} wording, variant ${escapeHTML(item.variant)} · item ${escapeHTML(item.item_id)} · sample ${escapeHTML(item.sample_idx)}</p>
      <p class="case-score"><strong>${escapeHTML(item.metric)}</strong> · native preferred direction: ${escapeHTML(item.better_direction)}<br>Reference: ${escapeHTML(native(item.reference_score))} · Treatment: ${escapeHTML(native(item.treatment_score))} · Treatment − reference: <strong>${escapeHTML(signed(item.delta))} (${escapeHTML(item.outcome)})</strong></p>
      <p class="fine">Scores and Δ use the native metric scale, not aggregate percentage points. Both trajectories match the same model, benchmark, item and sample. B0 additionally matches placement, wording and variant.</p>
      <p class="fine">Recorded turns in order; input context and tool details expand on click. Hidden reasoning unavailable.</p>
      <div class="case-pair">${rolloutHTML(detail.reference, `Reference · ${item.reference_label}`)}${rolloutHTML(detail.treatment, 'Treatment · planted cue')}</div>
      <details><summary>Pair provenance and limitations</summary>${pre(detail.provenance)}<ul>${(detail.limitations || []).map(value => `<li>${escapeHTML(value)}</li>`).join('')}</ul></details>`;
  }
  async function showCase() {
    const ticket = ++request;
    if (activeFetch) activeFetch.abort();
    $('case-prev').disabled = position <= 0 || !matches.length;
    $('case-next').disabled = position >= matches.length - 1;
    $('case-select').disabled = !matches.length;
    $('case-detail').replaceChildren();
    $('case-detail').setAttribute('aria-busy', 'false');
    if (!matches.length) {
      $('cases-status').textContent = 'No eligible examples for these filters.';
      return;
    }
    const item = matches[position];
    $('case-select').value = item.id;
    $('cases-status').textContent = `Example ${position + 1} of ${matches.length} selected examples · loading paired transcript…`;
    $('case-detail').setAttribute('aria-busy', 'true');
    activeFetch = new AbortController();
    try {
      const detail = await fetchJSON(localURL(item.detail_url, manifestURL), activeFetch.signal);
      if (ticket !== request) return;
      if (detail.metadata?.id !== item.id || !detail.reference || !detail.treatment) throw new Error('Case detail does not match the selected pair.');
      $('case-detail').innerHTML = detailHTML(detail, item);
      $('cases-status').textContent = `Example ${position + 1} of ${matches.length} selected examples · ${caseLabel(item)}`;
    } catch (error) {
      if (ticket !== request || error.name === 'AbortError') return;
      $('cases-status').textContent = `Could not load this paired transcript. ${error.message}`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.id = 'case-retry';
      retry.textContent = 'Retry this transcript';
      retry.addEventListener('click', showCase);
      $('case-detail').append(retry);
    } finally {
      if (ticket === request) $('case-detail').setAttribute('aria-busy', 'false');
    }
  }
  function filterCases() {
    matches = manifest.cases.filter(item => Object.entries(filters).every(([key, id]) => !$(id).value || String(item[key]) === $(id).value));
    position = 0;
    $('case-select').replaceChildren();
    for (const item of matches) $('case-select').add(new Option(caseLabel(item), item.id));
    showCase();
  }
  async function loadCases() {
    if (manifest || loading) return;
    if (!DATA.cases?.manifest_url) {
      $('cases-status').textContent = 'Trace export is not included in this snapshot.';
      $('cases-load').hidden = true;
      return;
    }
    loading = true;
    $('cases-load').disabled = true;
    $('cases-status').textContent = 'Loading case metadata…';
    try {
      manifestURL = localURL(DATA.cases.manifest_url, document.baseURI);
      const result = await fetchJSON(manifestURL);
      if (result.schema !== 1 || !Array.isArray(result.cases)) throw new Error('Unsupported case manifest.');
      manifest = result;
      addOptions('case-model', result.models, modelName);
      addOptions('case-benchmark', result.benchmarks, benchName);
      addOptions('case-belief', [...new Set(result.cases.map(item => item.belief_id))].sort(), value => {
        const belief = DATA.beliefs.find(item => item.id === value);
        return belief ? `${value} · ${shortName(belief)}` : value;
      });
      const counts = result.counts;
      $('case-count-summary').textContent = `${num(counts.candidate_pairs)} candidate pairs · ${num(counts.eligible_pairs)} eligible · ${num(counts.unknown_pairs)} unknown · ${num(counts.excluded_pairs)} excluded · ${num(counts.selected_cases)} selected illustrations. Counts describe candidate comparisons, not independent draws. ${result.note || ''}`;
      $('case-count-data').textContent = JSON.stringify(counts, null, 2);
      $('cases-controls').hidden = false;
      $('cases-load').hidden = true;
      filterCases();
    } catch (error) {
      manifest = null;
      $('cases-status').textContent = `Could not load case metadata. ${error.message}`;
      $('cases-load').textContent = 'Retry loading case studies';
    } finally {
      loading = false;
      $('cases-load').disabled = false;
    }
  }
  for (const id of Object.values(filters)) $(id).addEventListener('change', filterCases);
  $('case-select').addEventListener('change', () => { position = matches.findIndex(item => item.id === $('case-select').value); showCase(); });
  $('case-prev').addEventListener('click', () => { if (position > 0) { position--; showCase(); } });
  $('case-next').addEventListener('click', () => { if (position < matches.length - 1) { position++; showCase(); } });
  $('cases-load').addEventListener('click', loadCases);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); loadCases(); }
    }, {rootMargin:'250px'});
    observer.observe($('case-studies'));
  }
}
initCaseBrowser();
