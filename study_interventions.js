/* Intervention explorer: exact treatment and neutral texts per task; never reads native task records. */
(() => {
  "use strict";
  const mount = document.getElementById("belief-explorer");
  if (!mount) return;
  const style = document.createElement("style");
  style.textContent = `
    #belief-explorer { min-width:0; margin:1rem 0; }
    #belief-explorer .ix-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; margin:1rem 0; }
    #belief-explorer label { display:flex; flex-direction:column; gap:.3rem; font-weight:600; }
    #belief-explorer select { width:100%; min-width:0; max-width:100%; padding:.5rem; background:var(--paper,#fff); color:inherit; border:1px solid #aaa; border-radius:4px; }
    #belief-explorer .ix-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin:1rem 0; }
    #belief-explorer .ix-side { min-width:0; padding:.9rem; border:1px solid #aab2bd; border-radius:6px; }
    #belief-explorer h4, #belief-explorer h5 { margin:.25rem 0 .6rem; }
    #belief-explorer pre { white-space:pre-wrap; overflow-wrap:anywhere; word-break:normal; font: .85rem/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; background:rgba(128,128,128,.08); padding:.7rem; max-height:27rem; overflow:auto; }
    #belief-explorer .ix-muted { color:inherit; opacity:.8; font-size:.88rem; }
    #belief-explorer .ix-error { border:1px solid #b74435; padding:1rem; }
    @media(max-width:640px) { #belief-explorer .ix-controls,#belief-explorer .ix-pair { grid-template-columns:minmax(0,1fr); } }
  `;
  document.head.append(style);
  const METHOD_LINES = {
    P1: "Three short documents (policy, record, handoff) added to the context.",
    P2: "A notice added to the system message.",
    P3: "A short first-person cue inserted into the model's reasoning.",
  };
  const SURFACES = {
    system_suffix: "system message",
    initial_session_context: "start of user context",
    local_tool_result_context: "first tool result",
    initial_hosted_search_context: "start of user context",
    native_inbox_email: "inbox",
    reasoning_cue: "inserted into reasoning",
  };
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const append = (parent, tag, text, className) => {
    const result = node(tag, text, className);
    parent.append(result);
    return result;
  };
  const capitalize = text => text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
  let index;
  let loaded;
  let epoch = 0;
  const cache = new Map();
  const state = { benchmark: "", method: "P1", belief: "", task: "" };
  const selects = {};
  const status = append(mount, "p", "Loading…", "ix-muted");
  const controls = append(mount, "div", undefined, "ix-controls");
  const methodLine = append(mount, "p", undefined, "ix-muted");
  const content = append(mount, "div");
  content.setAttribute("aria-live", "polite");

  function field(key, label, options) {
    const wrapper = append(controls, "label", label);
    const select = append(wrapper, "select");
    select.id = `ix-${key}`;
    selects[key] = select;
    fill(select, options);
    select.addEventListener("change", () => {
      state[key] = select.value;
      if (key === "benchmark") loadBenchmark();
      else render();
    });
    return select;
  }

  function fill(select, options) {
    select.replaceChildren(...options.map(({ id, label }) => {
      const option = node("option", label);
      option.value = id;
      return option;
    }));
  }

  async function fetchJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Interventions unavailable (HTTP ${response.status})`);
    return response.json();
  }

  function failure(error) {
    content.replaceChildren(node("p", error.message, "ix-error"));
  }

  async function loadBenchmark() {
    const request = ++epoch;
    loaded = null;
    content.replaceChildren(node("p", "Loading…", "ix-muted"));
    selects.task.disabled = true;
    try {
      const entry = index.benchmarks.find(value => value.id === state.benchmark);
      if (!cache.has(entry.id)) cache.set(entry.id, fetchJSON(`study-data/interventions/${entry.file}`).catch(error => {
        cache.delete(entry.id);
        throw error;
      }));
      const data = await cache.get(entry.id);
      if (request !== epoch) return;
      if (data.schema !== "belief-interventions-benchmark-v1" || data.benchmark !== entry.id || data.tasks.length !== entry.tasks) {
        throw new Error("Intervention file does not match its index");
      }
      loaded = data;
      fill(selects.task, data.tasks.map((task, i) => ({ id: task.id, label: `Task ${i + 1} of ${data.tasks.length}` })));
      state.task = data.tasks.some(task => task.id === state.task) ? state.task : data.tasks[0]?.id;
      selects.task.value = state.task;
      selects.task.disabled = !state.task;
      render();
    } catch (error) {
      if (request === epoch) failure(error);
    }
  }

  function placement(span) {
    const where = SURFACES[span.surface] || index.surfaces[span.surface] || span.surface;
    if (!span.document) return capitalize(where);
    const noun = span.surface === "native_inbox_email" ? "email" : "document";
    const part = /title/i.test(span.part) ? " (title)" : /body/i.test(span.part) ? " (body)" : "";
    return `${capitalize(span.document)} ${noun}${part} · ${where}`;
  }

  function renderSide(parent, title, bundleId) {
    const side = append(parent, "section", undefined, "ix-side");
    append(side, "h4", title);
    const bundle = loaded.bundles[bundleId];
    if (!bundle) throw new Error("Intervention mapping is missing");
    if (bundle.status === "cue_unavailable") append(side, "p", "No text for this task.", "ix-muted");
    else if (bundle.status === "text_withheld") append(side, "p", "Text withheld.", "ix-muted");
    for (const span of bundle.spans) {
      const text = loaded.texts[span.text_sha256];
      if (typeof text !== "string") throw new Error("Intervention text is missing");
      append(side, "h5", placement(span));
      append(side, "pre", text);
    }
  }

  function render() {
    if (!loaded) return;
    methodLine.textContent = METHOD_LINES[state.method] || "";
    try {
      const task = loaded.tasks.find(value => value.id === state.task);
      const mapping = task?.mappings.find(value => value.method === state.method && value.belief === state.belief);
      if (!mapping) throw new Error("Task/method/belief mapping is missing");
      content.replaceChildren();
      const pair = append(content, "div", undefined, "ix-pair");
      renderSide(pair, "Treatment", mapping.treatment);
      renderSide(pair, "Neutral", mapping.neutral);
    } catch (error) { failure(error); }
  }

  async function start() {
    try {
      index = await fetchJSON("study-data/interventions/index.json");
      if (index.schema !== "belief-interventions-index-v1" || index.targets.length !== 11 || index.benchmarks.length !== 7) {
        throw new Error("Intervention index is incomplete");
      }
      status.hidden = true;
      state.benchmark = index.benchmarks[0].id;
      state.belief = index.targets[0].id;
      field("benchmark", "Benchmark", index.benchmarks);
      field("method", "Delivery method", index.methods);
      const names = window.STUDY_TARGET_NAMES || {};
      field("belief", "Belief", index.targets.map(row => ({ ...row, label: names[row.id] || row.label })));
      field("task", "Task", []);
      await loadBenchmark();
    } catch (error) { status.textContent = "Interventions unavailable."; failure(error); }
  }
  start();
})();
