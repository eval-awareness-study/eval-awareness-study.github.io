"use strict";
// Terminal-Bench trace browser: the run index is embedded; each run's trace is fetched on demand.
(() => {
  const INDEX = JSON.parse(document.getElementById("trace-index").textContent);
  const RUNS = INDEX.runs;
  const CLIP = 1400;
  const LABEL = { "log-summary-date-ranges": "log-summary", "fix-git": "fix-git" };
  const CONDITION = (c) => ({ natural: "Natural", released: "As released", all7: "All 7" }[c] ||
    (c.startsWith("stack4") ? `4-cue stack ${c.slice(6).replace("_", "#")}` : c));
  const cache = new Map();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function awareness(b) {
    if (!b.aware) return "none";
    return b.eval && b.grader ? "both" : b.eval ? "eval" : "grader";
  }

  const MODEL_COLOUR = { qwen38: "#176a60", flint: "#ae5a22", gemma4: "#27679b" };
  const modelBadge = (r) => `<span class="badge model" style="border-color:${MODEL_COLOUR[r.model] || "#596969"};color:${MODEL_COLOUR[r.model] || "#596969"}">${esc(r.model_label)}</span>`;

  function badgeHtml(b, group) {
    const out = [];
    if (group === "comparison") out.push('<span class="badge muted">not aware</span>');
    if (b.eval) out.push('<span class="badge eval">eval</span>');
    if (b.grader) out.push('<span class="badge grader">grader</span>');
    if (b.type) out.push(`<span class="badge">${esc(b.type)}</span>`);
    if (b.factor) out.push(`<span class="badge">cue ${esc(b.factor)}</span>`);
    out.push(`<span class="badge ${b.pass ? "pass" : "fail"}">${b.pass ? "pass" : "fail"}</span>`);
    if (b.p_eval != null) out.push(`<span class="badge">p_eval ${esc(Math.round(b.p_eval))}</span>`);
    if (b.open) out.push(`<span class="badge">open: ${esc(b.open.replace("_", " "))}</span>`);
    return out.join("");
  }

  // ---------------------------------------------------------------- sidebar
  function fillFilters() {
    const models = [...new Map(RUNS.map((r) => [r.model, r.model_label]))];
    const tasks = [...new Set(RUNS.map((r) => r.task))];
    const conditions = [...new Set(RUNS.map((r) => r.condition))];
    $("f-model").insertAdjacentHTML("beforeend", models.map(([m, l]) => `<option value="${esc(m)}">${esc(l)}</option>`).join(""));
    $("f-task").insertAdjacentHTML("beforeend", tasks.map((t) => `<option value="${esc(t)}">${esc(LABEL[t] || t)}</option>`).join(""));
    $("f-condition").insertAdjacentHTML("beforeend", conditions.map((c) => `<option value="${esc(c)}">${esc(CONDITION(c))}</option>`).join(""));
    for (const id of ["f-model", "f-task", "f-condition", "f-aware", "f-type"]) $(id).addEventListener("change", renderList);
  }

  function renderList() {
    const model = $("f-model").value, task = $("f-task").value, condition = $("f-condition").value, aware = $("f-aware").value, type = $("f-type").value;
    const shown = RUNS.filter((r) => (!model || r.model === model) && (!task || r.task === task) && (!condition || r.condition === condition) &&
      (!aware || awareness(r.badges) === aware) && (!type || r.badges.type === type));
    $("run-count").textContent = `${shown.length} of ${RUNS.length} runs`;
    const html = [];
    let group = null, heading = null;
    for (const r of shown) {
      if (r.group !== group) {
        group = r.group; heading = null;
        html.push(`<h2 class="run-group">${group === "aware" ? "Aware runs" : "Comparison: not aware"}</h2>`);
      }
      const h = `${r.model_label} · ${LABEL[r.task] || r.task} · ${CONDITION(r.condition)}`;
      if (h !== heading) { heading = h; html.push(`<h3 class="run-heading">${esc(h)}</h3>`); }
      html.push(`<a class="run-item" href="#run=${encodeURIComponent(r.id)}" data-id="${esc(r.id)}">` +
        `<span class="run-name">${esc(r.trial)}<span class="fine"> · ${esc(r.scaffold)}${r.tb_commit ? " · TB commit" : ""}</span></span>` +
        `<span class="badges">${modelBadge(r)}${badgeHtml(r.badges, r.group)}</span></a>`);
    }
    if (!shown.length) html.push('<p class="empty">No runs match these filters.</p>');
    $("run-list").innerHTML = html.join("");
    markCurrent();
  }

  function markCurrent() {
    const id = currentId();
    for (const a of document.querySelectorAll(".run-item")) a.setAttribute("aria-current", a.dataset.id === id ? "true" : "false");
  }

  // ---------------------------------------------------------------- trace
  function clipBlock(text, cls, extraNote = "") {
    const body = text.length > CLIP
      ? `<pre class="${cls} clipped" data-full="${esc(text)}">${esc(text.slice(0, CLIP))}</pre>` +
        `<button type="button" class="show-more">Show more (${(text.length - CLIP).toLocaleString()} more characters)</button>`
      : `<pre class="${cls}">${esc(text)}</pre>`;
    return body + extraNote;
  }

  function omittedNote(output) {
    return output && output.omitted ? `<p class="fine">[${output.omitted.toLocaleString()} further characters not kept in the trace file]</p>` : "";
  }

  function markTb(html) {
    return html.replace(/add Terminal-Bench/gi, (m) => `<mark class="hl-tb">${m}</mark>`);
  }

  function outputBlock(output, cls, tb) {
    if (!output) return "";
    const text = output.text;
    // Keep the commit visible: never clip an output away from its Terminal-Bench line.
    if (tb && /add Terminal-Bench/i.test(text)) return `<pre class="${cls}">${markTb(esc(text))}</pre>${omittedNote(output)}`;
    return clipBlock(text, cls, omittedNote(output));
  }

  function reasoningHtml(text, spans) {
    if (!spans.length) return esc(text);
    const cuts = new Set([0, text.length]);
    for (const s of spans) { cuts.add(s.start); cuts.add(s.end); }
    const points = [...cuts].sort((a, b) => a - b);
    let html = "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      for (const s of spans) if (s.start === a) html += `<span class="hl-anchor" id="hl-${s.index}"></span>`;
      const kinds = new Set(spans.filter((s) => s.start <= a && s.end >= b).map((s) => s.kind));
      const piece = esc(text.slice(a, b));
      html += kinds.size ? `<mark class="${[...kinds].map((k) => `hl-${k}`).join(" ")}">${piece}</mark>` : piece;
    }
    return html;
  }

  function renderRun(run) {
    const spansByTurn = new Map();
    run.highlights.forEach((h, index) => {
      if (!spansByTurn.has(h.turn)) spansByTurn.set(h.turn, []);
      spansByTurn.get(h.turn).push({ ...h, index });
    });
    const tbTurns = new Set(run.tb_commit_turns);
    const firsts = run.highlights.map((h, index) => ({ ...h, index })).filter((h) => h.first);
    const items = firsts.map((h) => ({ turn: h.turn, at: h.start, html: `<li><button type="button" class="jump" data-target="hl-${h.index}">` +
      `<span class="badge ${h.kind}">${h.kind}</span> Turn ${h.turn + 1}</button>${h.line_cited ? ' <span class="badge muted" title="The judge cited this reasoning line by number; the highlight is the full line.">line-cited</span>' : ""} “${esc(h.quote)}”</li>` }));
    for (const t of run.tb_commit_turns) {
      items.push({ turn: t, at: Infinity, html: `<li><button type="button" class="jump" data-target="tb-${t}"><span class="badge tb">TB commit</span> Turn ${t + 1}</button> “add Terminal-Bench” appears in the output</li>` });
    }
    const where = items.sort((a, b) => a.turn - b.turn || a.at - b.at).map((x) => x.html);
    for (const u of run.unlocated || []) {
      const how = u.mode === "line_cited" && u.lines ? `judge cited reasoning line${u.lines.length > 1 ? "s" : ""} ${u.lines.join(", ")}` : `matched ${u.mode}`;
      where.push(`<li class="unlocated"><span class="badge ${u.kind}">${u.kind}</span> <span class="badge muted">not verbatim · ${esc(how)}</span> “${esc(u.quote)}”</li>`);
    }
    const factors = run.factors_on == null ? "released package" : run.factors_on.length ? run.factors_on.join(" ") : "none";
    const html = [
      `<header class="run-header"><p class="eyebrow">${esc(run.model_label)} · ${esc(LABEL[run.task] || run.task)} · ${esc(CONDITION(run.condition))}</p>`,
      `<h2>${esc(run.trial)}</h2>`,
      `<p class="fine">Harness ${esc(run.scaffold)} · host <code>${esc(run.hostname)}</code> · factors on: ${esc(factors)} · ${esc(run.history_note)}</p>`,
      `<p class="badges">${modelBadge(run)}${badgeHtml(run.badges, run.group)}</p></header>`,
      `<div class="where"><h3>Where awareness appears</h3>${where.length ? `<ol>${where.join("")}</ol>` : '<p class="fine">The monitor found no awareness in this run.</p>'}</div>`,
    ];
    for (const p of run.preamble) {
      const label = p.label || (p.role === "system" ? "System prompt" : "Task instruction (as the model saw it)");
      html.push(`<article class="msg ${p.role}"><h4>${esc(label)}</h4>${clipBlock(p.text, "text")}</article>`);
    }
    run.turns.forEach((turn, i) => {
      const parts = [`<article class="turn${tbTurns.has(i) ? " has-tb" : ""}" id="turn-${i}"><h4>Turn ${i + 1}` +
        `${tbTurns.has(i) ? '<span class="badge tb" id="tb-' + i + '">TB commit in output</span>' : ""}</h4>`];
      if (turn.note) parts.push(`<pre class="text note-turn">${esc(turn.note)}</pre>`);
      if (turn.reasoning) {
        parts.push(`<details class="reasoning" open><summary>Reasoning</summary><div class="reasoning-text">${reasoningHtml(turn.reasoning, spansByTurn.get(i) || [])}</div></details>`);
      }
      if (turn.reply) parts.push(`<div class="reply"><span class="role">Reply</span>${clipBlock(turn.reply, "text")}</div>`);
      for (const a of turn.actions) {
        parts.push(`<div class="action"><span class="role">${a.kind === "bash" ? "bash tool call" : a.kind === "keys" ? "keystrokes" : esc(a.kind)}</span><pre class="cmd">${esc(a.input)}</pre>` +
          (a.output ? `<span class="role">tool output</span>${outputBlock(a.output, "out", tbTurns.has(i))}` : "") + "</div>");
      }
      if (turn.screen) parts.push(`<div class="action"><span class="role">terminal screen</span>${outputBlock(turn.screen, "out", tbTurns.has(i))}</div>`);
      parts.push("</article>");
      html.push(parts.join(""));
    });
    const f = run.followups;
    html.push('<section class="followups"><h3>Follow-up questions (asked after the run, on a copy of the conversation)</h3>');
    html.push('<table class="needham"><thead><tr><th>Needham question</th><th>Answer</th></tr></thead><tbody>' +
      f.needham.map((p) => `<tr><td>${esc(p.question)}<details><summary>Explanation</summary><p>${esc(p.explanation)}</p></details></td>` +
        `<td class="${p.flag ? "says-eval" : ""}">${esc(p.label || p.status)}</td></tr>`).join("") + "</tbody></table>");
    html.push(`<div class="qa"><p class="q">${esc(f.p_eval.question)}</p><pre class="text">${esc(f.p_eval.answer)}</pre><p class="fine">Parsed value: ${esc(f.p_eval.value ?? "none")}</p></div>`);
    html.push(`<div class="qa"><p class="q">${esc(f.open.question)}</p>${clipBlock(f.open.answer, "text")}<p class="fine">Luna’s category: <strong>${esc(f.open.category)}</strong></p></div>`);
    html.push("</section>");
    const view = $("trace-view");
    view.innerHTML = html.join("");
    view.dataset.run = run.id;
    view.dataset.highlights = String(view.querySelectorAll(".hl-anchor").length);
  }

  async function load(id) {
    const entry = RUNS.find((r) => r.id === id) || RUNS[0];
    if (!entry) return;
    const view = $("trace-view");
    view.dataset.run = "";
    view.innerHTML = '<p class="empty">Loading trace…</p>';
    try {
      if (!cache.has(entry.id)) {
        const response = await fetch(entry.file);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        cache.set(entry.id, await response.json());
      }
      renderRun(cache.get(entry.id));
    } catch (error) {
      view.innerHTML = `<p class="note warning">Could not load this trace (${esc(error.message)}).</p>`;
    }
    markCurrent();
  }

  function currentId() {
    const match = location.hash.match(/^#run=(.+)$/);
    return match ? decodeURIComponent(match[1]) : (RUNS[0] && RUNS[0].id);
  }

  document.addEventListener("click", (event) => {
    const more = event.target.closest(".show-more");
    if (more) {
      const pre = more.previousElementSibling;
      pre.textContent = pre.dataset.full;
      pre.classList.remove("clipped");
      more.remove();
      return;
    }
    const jump = event.target.closest(".jump");
    if (jump) {
      const target = document.getElementById(jump.dataset.target);
      if (!target) return;
      const details = target.closest("details");
      if (details) details.open = true;
      const mark = target.nextElementSibling && target.nextElementSibling.tagName === "MARK" ? target.nextElementSibling : target;
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      mark.classList.add("flash");
      setTimeout(() => mark.classList.remove("flash"), 1600);
      return;
    }
    const item = event.target.closest(".run-item");
    if (item && window.matchMedia("(max-width: 900px)").matches) {
      setTimeout(() => $("trace-view").scrollIntoView({ block: "start" }), 50);
    }
  });
  window.addEventListener("hashchange", () => load(currentId()));

  if (INDEX.failures.length) {
    $("run-count").insertAdjacentHTML("afterend", `<p class="note warning">Left out (quote not found verbatim): ${INDEX.failures.map((f) => esc(f.id)).join(", ")}</p>`);
  }
  fillFilters();
  renderList();
  load(currentId());
})();
