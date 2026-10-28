/* Standalone public-safe intervention explorer; never reads native task records. */
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
    #belief-explorer .ix-target { grid-column:1/-1; }
    #belief-explorer .ix-pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin:1rem 0; }
    #belief-explorer .ix-side { min-width:0; padding:.9rem; border:1px solid #aab2bd; border-radius:6px; }
    #belief-explorer h4, #belief-explorer h5 { margin:.25rem 0 .6rem; }
    #belief-explorer pre { white-space:pre-wrap; overflow-wrap:anywhere; word-break:normal; font: .85rem/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; background:rgba(128,128,128,.08); padding:.7rem; max-height:27rem; overflow:auto; }
    #belief-explorer .ix-muted { color:inherit; opacity:.8; font-size:.88rem; }
    #belief-explorer .ix-notice { border-left:3px solid #9b7131; padding:.6rem .8rem; background:rgba(155,113,49,.08); }
    #belief-explorer .ix-status { font-size:.87rem; font-weight:600; }
    #belief-explorer .ix-hash { overflow-wrap:anywhere; word-break:break-all; }
    #belief-explorer details { margin:.7rem 0; }
    #belief-explorer summary { cursor:pointer; }
    #belief-explorer dl { display:grid; grid-template-columns:minmax(6rem,1fr) minmax(0,3fr); gap:.4rem .6rem; font-size:.85rem; }
    #belief-explorer dt { font-weight:600; }
    #belief-explorer dd { margin:0; overflow-wrap:anywhere; }
    #belief-explorer .ix-error { border:1px solid #b74435; padding:1rem; }
    @media(max-width:640px) { #belief-explorer .ix-controls,#belief-explorer .ix-pair { grid-template-columns:minmax(0,1fr); } }
  `;
  document.head.append(style);
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
  const statuses = {
    frozen_assignment: "Frozen assignment exists; this explorer does not attest delivery",
    available_not_delivery: "Eligible in frozen P3 assignments; not an execution or delivery claim",
    source_execution_hold: "Held: source task was excluded from execution",
    cue_unavailable: "Held: no independently accepted matched cue",
    anchor_unavailable: "Held: the original model-specific reasoning anchor was unavailable",
  };
  let index;
  let loaded;
  let epoch = 0;
  const cache = new Map();
  const state = { benchmark: "", method: "P1", belief: "", model: "", task: "" };
  const selects = {};
  const status = append(mount, "p", "Loading the frozen intervention index…", "ix-muted");
  const controls = append(mount, "div", undefined, "ix-controls");
  const content = append(mount, "div");
  content.setAttribute("aria-live", "polite");
  const evidence = append(mount, "details");

  function field(key, label, options, extraClass) {
    const wrapper = append(controls, "label", label, extraClass);
    const select = append(wrapper, "select");
    select.id = `ix-${key}`;
    select.setAttribute("aria-label", label);
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

  function details(parent, summary) {
    const box = append(parent, "details");
    append(box, "summary", summary);
    return box;
  }

  function pairs(parent, rows) {
    const dl = append(parent, "dl");
    rows.forEach(([label, value]) => {
      append(dl, "dt", label);
      append(dl, "dd", String(value ?? "Not applicable"));
    });
  }

  async function fetchJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Intervention artifact unavailable (HTTP ${response.status})`);
    return response.json();
  }

  function failure(error) {
    content.replaceChildren(node("p", `${error.message}. No representative or substitute intervention is shown.`, "ix-error"));
  }

  async function loadBenchmark() {
    const request = ++epoch;
    loaded = null;
    content.replaceChildren(node("p", "Loading every frozen task in the selected benchmark…", "ix-muted"));
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
        throw new Error("Intervention artifact population does not match its index");
      }
      loaded = data;
      fill(selects.task, data.tasks.map((task, i) => ({ id: task.id, label: `${i + 1} of ${data.tasks.length} · ${task.id}${task.source_hold ? " · source execution hold" : ""}` })));
      state.task = data.tasks.some(task => task.id === state.task) ? state.task : data.tasks[0]?.id;
      selects.task.value = state.task;
      selects.task.disabled = !state.task;
      render();
    } catch (error) {
      if (request === epoch) failure(error);
    }
  }

  function renderSide(parent, title, bundleId, availability) {
    const side = append(parent, "section", undefined, "ix-side");
    append(side, "h4", title);
    append(side, "p", statuses[availability] || "Availability not recorded", "ix-status");
    const bundle = loaded.bundles[bundleId];
    if (!bundle) throw new Error("Exact intervention mapping is missing");
    if (bundle.status === "cue_unavailable") {
      append(side, "p", "No accepted authored cue is available for this frozen task and target. No text from another task or a template is substituted.", "ix-notice");
    } else if (bundle.status === "text_withheld") {
      append(side, "p", bundle.reason, "ix-notice");
      append(side, "p", `Private exact cue SHA-256: ${bundle.cue_sha256}`, "ix-muted ix-hash");
    }
    for (const span of bundle.spans) {
      const text = loaded.texts[span.text_sha256];
      if (typeof text !== "string") throw new Error("Exact intervention text is missing");
      const part = span.document ? `${span.document[0].toUpperCase()}${span.document.slice(1)} — ${span.part}` : span.part;
      append(side, "h5", part);
      append(side, "p", index.surfaces[span.surface] || "Recorded intervention surface", "ix-muted");
      if (span.wrapper_withheld) append(side, "p", span.wrapper_withheld, "ix-notice");
      append(side, "pre", text);
      const receipt = details(side, "Exact-span fingerprint and placement");
      const rows = [["SHA-256 (UTF-8)", span.text_sha256], ["UTF-8 bytes", span.utf8_bytes]];
      if (span.surface === "reasoning_cue") {
        rows.push(["Whitespace words", span.whitespace_words], ["Private prefix", "Original first sentence + newline + exact cue; original sentence is not published"]);
      } else {
        rows.push(["Message index (zero-based)", span.message_index], ["Character offset (zero-based)", span.offset],
          ["Native character offset", span.native_offset], ["Initially rendered", span.initially_rendered ? "Yes; delivery not attested" : "No; awaits first genuine function return"]);
      }
      if (span.wrapper_sha256) rows.push(["Private full wrapper SHA-256", span.wrapper_sha256]);
      pairs(receipt, rows);
    }
    if (bundle.setting_sha256) {
      const receipt = details(side, "Frozen condition fingerprint");
      append(receipt, "p", bundle.setting_sha256, "ix-hash ix-muted");
    }
  }

  function render() {
    if (!loaded) return;
    try {
      const task = loaded.tasks.find(value => value.id === state.task);
      const target = index.targets.find(value => value.id === state.belief);
      const method = index.methods.find(value => value.id === state.method);
      const benchmark = index.benchmarks.find(value => value.id === state.benchmark);
      const model = index.models.find(value => value.id === state.model);
      const mapping = task?.mappings.find(value => value.method === state.method && value.belief === state.belief);
      if (!mapping) throw new Error("Frozen task/method/target mapping is missing");
      content.replaceChildren();
      append(content, "h4", `${benchmark.label} · ${method.label}`);
      append(content, "p", `${target.label} — ${target.definition}`);
      append(content, "p", `${task.id} · ${model.label} availability · ${benchmark.tasks} frozen tasks in this benchmark, all selectable.`, "ix-muted");
      append(content, "p", method.caveat, "ix-notice");
      if (task.source_hold) append(content, "p", "This task is explicitly held from execution. Authored P1/P2 wording can still be inspected; this does not imply it was delivered.", "ix-notice");
      const pair = append(content, "div", undefined, "ix-pair");
      renderSide(pair, "Treatment — " + target.label, mapping.treatment, mapping.models[state.model]?.treatment);
      renderSide(pair, "Matched neutral wording", mapping.neutral, mapping.models[state.model]?.neutral);
      append(content, "p", "These are the original frozen spans, including original punctuation and whitespace. Authored or rendered ≠ delivered ≠ adopted belief. Effects compare supplied message conditions on the same tasks; they do not identify effects of latent beliefs.", "ix-muted");
    } catch (error) { failure(error); }
  }

  async function start() {
    try {
      index = await fetchJSON("study-data/interventions/index.json");
      if (index.schema !== "belief-interventions-index-v1" || index.targets.length !== 11 || index.benchmarks.length !== 7) {
        throw new Error("Intervention index does not cover the complete frozen study");
      }
      status.textContent = `${index.evidence.tasks.toLocaleString()} frozen tasks · all 11 targets · all 3 methods · ${index.evidence.task_method_target_mappings.toLocaleString()} task × method × target mappings. ${index.caveat}`;
      state.benchmark = index.benchmarks[0].id;
      state.belief = index.targets[0].id;
      state.model = index.models[0].id;
      field("benchmark", "Benchmark (this explorer's scope)", index.benchmarks);
      field("method", "Delivery method", index.methods);
      field("belief", "Message target — all eleven available", index.targets, "ix-target");
      field("task", "Frozen task (opaque identifier; original task remains private)", []);
      field("model", "Model-specific availability", index.models);
      append(evidence, "summary", "Source fidelity, full-population coverage and publication boundary");
      append(evidence, "p", index.evidence.fidelity);
      append(evidence, "p", index.evidence.safety_boundary);
      pairs(evidence, [
        ["Complete frozen tasks", index.evidence.tasks],
        ["Task × method × target mappings", index.evidence.task_method_target_mappings],
        ["Source-held tasks (still listed)", index.evidence.source_held_tasks],
        ["Byte-compared exact span occurrences", index.evidence.byte_compared_spans],
        ["Source frozen-file SHA-256", index.evidence.source_frozen_sha256],
        ["Source assignment fingerprint", index.evidence.source_assignments_sha256],
        ["P3 bank fingerprint", index.evidence.p3_bank_sha256],
        ["P3 assignment fingerprint", index.evidence.p3_assignments_sha256],
      ]);
      for (const benchmark of index.benchmarks) {
        const box = details(evidence, `${benchmark.label}: ${benchmark.tasks} tasks, ${benchmark.mappings} mappings`);
        append(box, "p", `Artifact SHA-256: ${benchmark.file_sha256}`, "ix-hash ix-muted");
        const link = append(box, "a", "Download all safe intervention mappings for this benchmark");
        link.href = `study-data/interventions/${benchmark.file}`;
        link.download = benchmark.file;
      }
      await loadBenchmark();
    } catch (error) { status.textContent = "The exact frozen intervention explorer is unavailable."; failure(error); }
  }
  start();
})();
