/* Grid sweep, stage 1: real example runs, one per planting method.
   renderTraces(el, data) draws a method selector and the selected run in full, with the planted text highlighted.
   Data: study-data/grid-stage1-traces.json (scripts/dashboard/build_grid_traces.py). Self-contained: injects its
   own CSS once; calling it again on the same element redraws it. */
(function () {
  'use strict';

  const CSS = `
.gt { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.5; color: var(--ink, #242f32); max-width: 100%; min-width: 0; }
.gt * { box-sizing: border-box; }
.gt-intro { margin: 6px 0 10px; color: var(--muted, #596969); }
.gt-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
.gt-tab { font: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--line, #dce1da); border-radius: 999px; background: #fff; color: inherit; cursor: pointer; text-align: left; }
.gt-tab:hover { border-color: var(--teal, #176a60); }
.gt-tab[aria-selected="true"] { background: var(--teal, #176a60); border-color: var(--teal, #176a60); color: #fff; }
.gt-tab .gt-res { font-size: 11px; opacity: .8; margin-left: 4px; }
.gt-sub { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
.gt-subbtn { font: inherit; font-size: 12px; padding: 3px 9px; border: 1px solid var(--line, #dce1da); border-radius: 6px; background: var(--wash, #f3f5ef); color: inherit; cursor: pointer; }
.gt-subbtn[aria-pressed="true"] { border-color: var(--teal, #176a60); background: #e2efec; font-weight: 600; }
.gt-what { margin: 2px 0 6px; color: var(--muted, #596969); }
.gt-caption { margin: 6px 0 8px; padding: 8px 10px; border-left: 4px solid #d99a00; background: #fff8e1; }
.gt-meta { font-size: 12px; color: var(--muted, #596969); margin: 0 0 8px; overflow-wrap: anywhere; }
.gt-meta code, .gt code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.gt-legend { font-size: 12px; color: var(--muted, #596969); margin: 0 0 10px; }
.gt-legend span { display: inline-block; margin-right: 12px; }
.gt-swatch { display: inline-block; width: 12px; height: 12px; vertical-align: -2px; margin-right: 4px; border-radius: 2px; }
.gt-msgs { display: flex; flex-direction: column; gap: 8px; min-width: 0; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain; padding: 6px; border: 1px solid var(--line, #dce1da); border-radius: 6px; background: var(--wash, #f3f5ef); }
.gt-msg { border: 1px solid var(--line, #dce1da); border-radius: 6px; background: #fff; padding: 8px 10px; min-width: 0; }
.gt-msg.gt-system { background: #f7f7f4; }
.gt-msg.gt-user { background: #f2f6fb; border-color: #cfdcea; }
.gt-msg.gt-tool { background: #fbfbf8; }
.gt-msg.gt-planted-msg { border-color: #d99a00; box-shadow: 0 0 0 1px #d99a00 inset; }
.gt-role { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted, #596969); margin-bottom: 4px; }
.gt-chip { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 3px; background: #ffe08a; color: #5a4100; font-size: 10px; letter-spacing: .03em; }
.gt-text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0; font: inherit; }
.gt-reason { margin: 2px 0 6px; padding: 6px 9px; border-left: 3px dashed #8a9a98; background: #f1f3f1; color: #3c4a4c; font-size: 13px; }
.gt-reason .gt-sublabel, .gt-answer .gt-sublabel, .gt-call .gt-sublabel { font-size: 11px; font-weight: 600; color: var(--muted, #596969); margin-bottom: 2px; }
.gt-answer { padding: 6px 9px; border-left: 3px solid var(--teal, #176a60); background: #fff; }
.gt-call { margin: 4px 0; padding: 5px 9px; border-left: 3px solid var(--blue, #27679b); background: #f3f7fb; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.gt-call .gt-text { font-family: inherit; }
.gt-tool .gt-text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.gt details > summary { cursor: pointer; color: var(--blue, #27679b); font-size: 12px; }
.gt mark.gt-plant { background: #ffe08a; color: inherit; padding: 1px 0; border-bottom: 2px solid #d99a00; }
.gt-tools pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; margin: 4px 0 8px; }
.gt-foot { margin-top: 10px; font-size: 11px; color: var(--muted, #596969); overflow-wrap: anywhere; }
@media (max-width: 760px) { .gt { font-size: 13px; } .gt-tab { font-size: 12px; padding: 4px 8px; } .gt-msg { padding: 7px 8px; } }
`;

  const LONG_TOOL = 600;

  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  }

  function injectCss() {
    if (document.getElementById('grid-traces-css')) return;
    const s = document.createElement('style');
    s.id = 'grid-traces-css';
    s.textContent = CSS;
    document.head.append(s);
  }

  // Text with planted [start, end) spans wrapped in <mark>.
  function marked(text, spans, title) {
    const pre = h('div', { class: 'gt-text' });
    let at = 0;
    for (const [s, e] of spans.slice().sort((a, b) => a[0] - b[0])) {
      if (s > at) pre.append(text.slice(at, s));
      pre.append(h('mark', { class: 'gt-plant', title }, text.slice(s, e)));
      at = e;
    }
    if (at < text.length) pre.append(text.slice(at));
    return pre;
  }

  function prettyArgs(a) {
    if (typeof a !== 'string') return JSON.stringify(a, null, 2);
    try { return JSON.stringify(JSON.parse(a), null, 2); } catch (e) { return a; }
  }

  function outcomeShort(ex) {
    const o = ex.outcome || {};
    if (o.refused === 1) return 'refused';
    if (o.refused === 0) return ex.task === 'agentharm' ? 'did task' : 'answered';
    return 'no verdict';
  }

  function renderRun(ex, data) {
    const task = data.tasks[ex.task] || {};
    const plantTitle = 'Planted: ' + ex.planted_what;
    const spansFor = (i, field) => ex.planted.filter(p => p.message === i && p.field === field).map(p => [p.start, p.end]);
    const wrap = h('div');
    wrap.append(h('p', { class: 'gt-caption', text: ex.caption }));
    const meta = h('p', { class: 'gt-meta' });
    meta.append(`Task: ${task.name || ex.task} (${task.kind || ''}). Run `, h('code', { text: ex.condition }),
      ` · sample s${ex.run.draw} · run id `, h('code', { text: ex.run.rid }), ` · measure: ${task.measure || ''}.`);
    wrap.append(meta);
    const legend = h('p', { class: 'gt-legend' });
    legend.append(h('span', null, h('i', { class: 'gt-swatch', style: 'background:#ffe08a;border-bottom:2px solid #d99a00' }), 'planted text'),
      h('span', null, h('i', { class: 'gt-swatch', style: 'background:#f1f3f1;border-left:3px dashed #8a9a98' }), "model's reasoning"),
      h('span', null, h('i', { class: 'gt-swatch', style: 'background:#f3f7fb;border-left:3px solid #27679b' }), 'tool call'),
      h('span', null, h('i', { class: 'gt-swatch', style: 'background:#fff;border-left:3px solid #176a60' }), 'answer'));
    wrap.append(legend);
    const tools = ex.tools && data.tools[ex.tools];
    if (tools && tools.length) {
      const d = h('details', { class: 'gt-tools' }, h('summary', { text: `Tools given to the model (${tools.length}): ${tools.map(t => t.name).join(', ')}` }));
      for (const t of tools) d.append(h('div', null, h('code', { text: t.name }), ' ' + (t.description || '')),
        h('pre', { text: JSON.stringify(t.parameters, null, 2) }));
      wrap.append(d);
    }
    const msgs = h('div', { class: 'gt-msgs' });
    const lastAssistant = ex.messages.map(m => m.role).lastIndexOf('assistant');
    ex.messages.forEach((m, i) => {
      const planted = ex.planted.some(p => p.message === i);
      const box = h('div', { class: `gt-msg gt-${m.role}` + (planted && ex.planted_kind === 'history' ? ' gt-planted-msg' : '') });
      const roleName = { system: 'System message', user: 'User', assistant: 'Model', tool: 'Tool result' + (m.tool ? ': ' + m.tool : '') }[m.role] || m.role;
      const role = h('div', { class: 'gt-role', text: roleName });
      if (planted) role.append(h('span', { class: 'gt-chip', text: 'planted' }));
      box.append(role);
      if (m.role === 'assistant') {
        if (m.reasoning) {
          box.append(h('div', { class: 'gt-reason' }, h('div', { class: 'gt-sublabel', text: 'Reasoning' }),
            marked(m.reasoning, spansFor(i, 'reasoning'), plantTitle)));
        }
        for (const c of m.tool_calls || []) {
          box.append(h('div', { class: 'gt-call' }, h('div', { class: 'gt-sublabel', text: 'Tool call: ' + c.name }),
            h('div', { class: 'gt-text', text: prettyArgs(c.arguments) })));
        }
        if (m.content) {
          box.append(h('div', { class: 'gt-answer' }, h('div', { class: 'gt-sublabel', text: i === lastAssistant ? 'Final answer' : 'Message' }),
            marked(m.content, spansFor(i, 'content'), plantTitle)));
        }
      } else if (m.role === 'tool' && m.content.length > LONG_TOOL) {
        box.append(h('details', null, h('summary', { text: `Long tool output (${m.content.length.toLocaleString()} characters): show` }),
          h('div', { class: 'gt-text', text: m.content })));
      } else {
        box.append(marked(m.content, spansFor(i, 'content'), plantTitle));
      }
      msgs.append(box);
    });
    wrap.append(msgs);
    if (task.canary) wrap.append(h('p', { class: 'gt-foot', text: task.canary }));
    return wrap;
  }

  function renderTraces(el, data) {
    if (!el || !data || !Array.isArray(data.methods)) return;
    injectCss();
    el.replaceChildren();
    el.classList.add('gt');
    const methods = data.methods.filter(m => m.examples && m.examples.length);
    const state = { m: 0, e: 0 };
    el.append(h('p', { class: 'gt-intro', text: data.selection }));
    const tabs = h('div', { class: 'gt-tabs', role: 'tablist', 'aria-label': 'Planting method' });
    const what = h('p', { class: 'gt-what' });
    const sub = h('div', { class: 'gt-sub' });
    const body = h('div', { role: 'tabpanel' });
    const buttons = methods.map((m, k) => {
      const b = h('button', { type: 'button', class: 'gt-tab', role: 'tab', 'aria-selected': 'false', tabindex: '-1' }, m.tab);
      if (m.examples.length === 1) b.append(h('span', { class: 'gt-res', text: '· ' + outcomeShort(m.examples[0]) }));
      b.addEventListener('click', () => { state.m = k; state.e = 0; draw(); });
      b.addEventListener('keydown', ev => {
        const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        state.m = (state.m + d + methods.length) % methods.length; state.e = 0; draw(); buttons[state.m].focus();
      });
      tabs.append(b);
      return b;
    });
    el.append(tabs, what, sub, body);
    if (data.model) el.append(h('p', { class: 'gt-foot', text: `Model ${data.model}; built ${data.built} by ${data.builder}.` }));

    function draw() {
      const m = methods[state.m];
      buttons.forEach((b, k) => { b.setAttribute('aria-selected', String(k === state.m)); b.tabIndex = k === state.m ? 0 : -1; });
      what.textContent = m.tab + ': ' + m.what + '.';
      sub.replaceChildren();
      if (m.examples.length > 1) {
        m.examples.forEach((ex, k) => {
          const b = h('button', { type: 'button', class: 'gt-subbtn', 'aria-pressed': String(k === state.e) },
            ex.label, h('span', { class: 'gt-res', text: ' · ' + outcomeShort(ex) }));
          b.addEventListener('click', () => { state.e = k; draw(); });
          sub.append(b);
        });
      }
      body.replaceChildren(renderRun(m.examples[state.e], data));
    }
    draw();
  }

  window.renderTraces = renderTraces;
})();
