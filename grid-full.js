// Grid sweep: full results (grid-full.html). Tabs (#results, #analysis), matrix filters, the cell popover and the two
// phone layouts (one model at a time; one benchmark family at a time). Without JavaScript the page shows both tabs
// stacked and the server-rendered matrix.
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('gf-data').textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  document.documentElement.classList.add('gf-js');
  document.body.classList.add('gf-js');
  $('main').classList.add('gf-js');

  // ---- tabs --------------------------------------------------------------------------------------------------------
  const panels = { results: $('#results'), analysis: $('#analysis') };
  const tabs = { results: $('#t-results'), analysis: $('#t-analysis') };
  $('.gf-tabs').hidden = false;
  function show(name, scrollTo) {
    for (const [k, p] of Object.entries(panels)) {
      p.hidden = k !== name;
      tabs[k].setAttribute('aria-selected', String(k === name));
      tabs[k].tabIndex = k === name ? 0 : -1;
    }
    if (scrollTo) scrollTo.scrollIntoView();
  }
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || panels[id]) { show(id || 'results'); if (id) window.scrollTo(0, 0); return; }
    const el = document.getElementById(id);
    const owner = el && Object.keys(panels).find((k) => panels[k].contains(el));
    show(owner || 'results', el);
  }
  for (const [k, t] of Object.entries(tabs)) {
    t.addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', '#' + k); show(k); window.scrollTo(0, 0); });
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const other = k === 'results' ? 'analysis' : 'results';
      tabs[other].focus(); tabs[other].click();
    });
  }
  window.addEventListener('hashchange', route);
  route();

  // ---- data --------------------------------------------------------------------------------------------------------
  const byId = new Map(D.cells.map((c) => [c.cell_id, c]));
  const head = D.cells.filter((c) => c.headline);
  const cellKey = (c) => [c.model, c.bench, c.method, c.length || ''].join('|');
  const headBy = new Map(head.map((c) => [cellKey(c), c]));
  const detail = new Map();
  for (const c of D.cells) {
    if (c.headline) continue;
    const k = cellKey(c);
    if (!detail.has(k)) detail.set(k, []);
    detail.get(k).push(c);
  }
  const ST = D.states;
  const sgn = (v) => { const n = Number(v); const s = (n >= 0 ? '+' : '') + n.toFixed(1); return Number(s) === 0 ? '0.0' : s.replace('-', '\u2212'); };
  function cellHtml(c) {
    const cls = ST[c.state][2] + (c.cnt ? ' counts' : '') + (c.flag ? ' flagged' : '');
    let style = '';
    if (c.state === 'result') {
      const e = Math.max(-1, Math.min(1, Number(c.effect_pts ?? c.largest_move_pts) / 15));
      style = ` style="background:rgba(${e > 0 ? '174,90,34' : '39,103,155'},${(0.12 + 0.55 * Math.abs(e)).toFixed(2)})"`;
    }
    const [main, sub] = c.short;
    return `<span class="gf-cell ${cls}"${style}><button type="button" class="gf-c" data-id="${esc(c.cell_id)}" title="${esc(c.why)}"><span class="v">${esc(main)}</span>${sub ? `<span class="i">${esc(sub)}</span>` : ''}</button></span>`;
  }

  // ---- popover -----------------------------------------------------------------------------------------------------
  const pop = $('#gf-pop');
  function openPop(btn) {
    const c = byId.get(btn.dataset.id);
    if (!c) return;
    const more = (detail.get(cellKey(c)) || []).slice().sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    const line = (d) => {
      const what = [d.text && d.text !== 'pooled' ? `‘${d.text}’` : 'pooled', d.against ? `against ${d.against}` : '', d.reading && d.reading !== 'all runs' ? d.reading : ''].filter(Boolean).join(', ');
      const iv = d.ci_low !== undefined ? ` [${sgn(d.ci_low)}, ${sgn(d.ci_high)}]` : '';
      const mde = Number(d.mde_pts) > 0 ? `could detect ${Number(d.mde_pts).toFixed(0)}+` : 'could not move';
      const est = d.effect_pts !== undefined ? sgn(d.effect_pts) + iv + '; ' : '';
      const val = d.state === 'result' ? `${sgn(d.effect_pts ?? d.largest_move_pts)}${iv}${d.cnt ? ', counts' : ''}` : d.state === 'no_change' ? `${est}no detectable change (${mde})` : d.state === 'floor_ceiling' ? `${est}${ST[d.state][0]}` : ST[d.state][0];
      return `<li>${esc(what)}: ${esc(val)}</li>`;
    };
    const base = c.base_rate ? `<p>Rate with the comparison texts ${Number(c.base_rate).toFixed(1)}%${c.rate_pct ? `, with the belief texts ${Number(c.rate_pct).toFixed(1)}%` : ''}${c.runs ? `; ${Number(c.runs).toLocaleString('en-US')} runs` : ''}.</p>` : '';
    const n = (v) => Math.round(Number(v || 0));
    const textsWord = (k) => `${k} text${k === 1 ? '' : 's'}`;
    const texts = c.texts ? `<p>Of its ${textsWord(n(c.texts))}, ${n(c.texts_up)} raised the rate and ${n(c.texts_down)} lowered it, each with its own 95% interval clear of zero${c.texts_counting !== undefined ? `; ${n(c.texts_counting)} count${n(c.texts_counting) === 1 ? 's' : ''} as an effect after correction for the number of comparisons` : ''}.${c.largest_move_pts ? ` The largest single-text move is ${esc(sgn(c.largest_move_pts))} points.` : ''}</p>` : '';
    pop.innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h5>${esc(ST[c.state][0][0].toUpperCase() + ST[c.state][0].slice(1))}</h5><p>${esc(c.why)}</p>${base}${texts}${c.source_table ? `<p class="fine">Table: ${esc(c.source_table)}</p>` : ''}${more.length ? `<p><b>Per text and other readings</b></p><ul>${more.map(line).join('')}</ul>` : ''}`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 12) y = Math.max(12, r.top - h - 8);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    $('.x', pop).addEventListener('click', closePop);
    $('.x', pop).focus({ preventScroll: true });
    pop._from = btn;
  }
  function closePop() { if (pop.hidden) return; pop.hidden = true; if (pop._from) pop._from.focus({ preventScroll: true }); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.gf-c');
    if (b) { e.preventDefault(); openPop(b); return; }
    if (!pop.hidden && !pop.contains(e.target)) closePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('scroll', () => { if (!pop.hidden) pop.hidden = true; }, { passive: true });

  // ---- filters (desktop matrix) -----------------------------------------------------------------------------------
  const fModel = $('#f-model'), fFamily = $('#f-family'), fMethod = $('#f-method'), fView = $('#f-view');
  $('#gf-filters').hidden = false;
  function filterMatrix() {
    const m = fModel.value, f = fFamily.value, me = fMethod.value;
    for (const s of $$('.gf-family')) s.classList.toggle('gf-hide', !!f && s.dataset.family !== f);
    for (const tr of $$('.gf-grid tbody tr')) tr.classList.toggle('gf-hide', !!m && tr.dataset.model !== m);
    for (const el of $$('.gf-grid [data-method]')) el.classList.toggle('gf-hide', !!me && el.dataset.method !== me);
    for (const s of $$('.gf-family')) {
      const any = $$('.gf-grid thead th[data-method]', s).some((th) => !th.classList.contains('gf-hide'));
      if (!any) s.classList.add('gf-hide');
    }
  }

  // ---- phone layouts ----------------------------------------------------------------------------------------------
  const phone = $('#gf-phone');
  const mq = window.matchMedia('(max-width: 640px)');
  const colName = (c) => c[0][0].toUpperCase() + c[0].slice(1) + (c[1] ? `, ${c[1]}` : '');
  // Phone views keep their own pickers (the desktop filters are hidden on a phone).
  let pModel = D.models[0], pFamilyM = '', pFamily = D.families[0].family, phoneCol = null;
  const pick = (id, label, opts, cur) => `<label>${esc(label)} <select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  function renderByModel() {
    const m = pModel;
    let h = `<div class="gf-filters">${pick('p-model', 'Model', D.models.map((x) => [x, x]), m)}${pick('p-family', 'Benchmarks', [['', 'All benchmark families'], ...D.families.map((f) => [f.family, f.family])], pFamilyM)}</div>`;
    const note = (D.model_notes || {})[m];
    if (note) h += `<p class="gf-note"><i>${esc(note)}</i></p>`;
    for (const fam of D.families) {
      if (pFamilyM && fam.family !== pFamilyM) continue;
      h += `<h4>${esc(fam.family)}</h4>`;
      for (const b of fam.benches) {
        h += `<div class="gf-card"><h4>${esc(D.bench_names[b] || b)}${D.directions[b] ? ` <span class="sub">${esc(D.directions[b])}</span>` : ''}</h4><dl>`;
        for (const c of fam.bench_cols[b]) {
          const cell = headBy.get([m, b, c[0], c[1]].join('|'));
          h += `<dt>${esc(colName(c))}</dt><dd>${cell ? cellHtml(cell) : ''}</dd>`;
        }
        h += '</dl></div>';
      }
    }
    phone.innerHTML = h;
    $('#p-model', phone).addEventListener('change', (e) => { pModel = e.target.value; renderByModel(); });
    $('#p-family', phone).addEventListener('change', (e) => { pFamilyM = e.target.value; renderByModel(); });
  }
  function renderByFamily() {
    const fam = D.families.find((f) => f.family === pFamily) || D.families[0];
    const key = (c) => c.join('|');
    if (!phoneCol || !fam.cols.some((c) => key(c) === phoneCol)) phoneCol = key(fam.cols[0]);
    const col = fam.cols.find((c) => key(c) === phoneCol);
    let h = `<div class="gf-filters">${pick('p-fam', 'Benchmark family', D.families.map((f) => [f.family, f.family]), fam.family)}${pick('p-col', 'Method and length', fam.cols.map((c) => [key(c), colName(c)]), phoneCol)}</div>`;
    h += `<table class="gf-ptable"><thead><tr><th scope="col">Model</th>${fam.benches.map((b) => `<th scope="col">${esc(D.bench_names[b] || b)}${D.directions[b] ? `<span class="sub">${esc(D.directions[b])}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
    for (const m of D.models) {
      const note = (D.model_notes || {})[m];
      h += `<tr><th scope="row">${esc(m)}${note ? `<span class="sub">${esc(note)}</span>` : ''}</th>${fam.benches.map((b) => { const c = headBy.get([m, b, col[0], col[1]].join('|')); return `<td>${c ? cellHtml(c) : '<span class="gf-na" title="not part of the design for this benchmark">–</span>'}</td>`; }).join('')}</tr>`;
    }
    phone.innerHTML = h + '</tbody></table>';
    $('#p-fam', phone).addEventListener('change', (e) => { pFamily = e.target.value; renderByFamily(); });
    $('#p-col', phone).addEventListener('change', (e) => { phoneCol = e.target.value; renderByFamily(); });
  }
  function renderPhone() {
    if (!mq.matches) { phone.hidden = true; return; }
    phone.hidden = false;
    if (fView.value === 'family') renderByFamily(); else renderByModel();
  }
  function update() { filterMatrix(); renderPhone(); }
  for (const s of [fModel, fFamily, fMethod, fView]) s.addEventListener('change', update);
  mq.addEventListener('change', renderPhone);
  update();
})();
