"use strict";
// Scaling page: chart-point tooltips, the task-set tabs of the figures, and every <details> and tab opened for
// printing.
(() => {
  const tip = document.createElement("div");
  tip.className = "sc-tip";
  tip.hidden = true;
  tip.setAttribute("role", "status");
  document.body.append(tip);
  let active = null;

  function show(pt, x, y) {
    if (active && active !== pt) active.classList.remove("active");
    active = pt;
    pt.classList.add("active");
    tip.textContent = pt.dataset.tip;
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 12), window.innerWidth - box.width - 8);
    const top = y + 14 + box.height > window.innerHeight ? y - box.height - 10 : y + 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function hide() {
    if (active) active.classList.remove("active");
    active = null;
    tip.hidden = true;
  }

  for (const pt of document.querySelectorAll("[data-tip]")) {
    pt.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(pt, e.clientX, e.clientY); });
    pt.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    pt.addEventListener("click", (e) => (active === pt && e.pointerType !== "mouse" ? hide() : show(pt, e.clientX, e.clientY)));
    pt.addEventListener("focus", () => { const r = pt.getBoundingClientRect(); show(pt, r.right, r.bottom); });
    pt.addEventListener("blur", hide);
  }
  document.addEventListener("click", (e) => { if (!e.target.closest("[data-tip]")) hide(); });
  window.addEventListener("scroll", () => { if (active && document.activeElement !== active) hide(); }, { passive: true });

  // Figures: task-set tabs (without JS every task set shows under its own heading).
  for (const list of document.querySelectorAll(".sc-tabs")) {
    const buttons = [...list.querySelectorAll("[role=tab]")];
    const panels = buttons.map((b) => document.getElementById(b.getAttribute("aria-controls")));
    const select = (i, focus) => {
      buttons.forEach((b, j) => { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; });
      panels.forEach((p, j) => { p.hidden = i !== j; });
      if (focus) buttons[i].focus();
      hide();
    };
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => select(i, false));
      b.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (step) { e.preventDefault(); select((i + step + buttons.length) % buttons.length, true); }
      });
    });
    list.hidden = false;
    select(0, false);
  }

  // Print everything: open collapsed tables and every task-set tab while printing, then restore them.
  let closed = [];
  let hiddenTabs = [];
  window.addEventListener("beforeprint", () => {
    closed = [...document.querySelectorAll("details:not([open])")];
    for (const d of closed) d.open = true;
    hiddenTabs = [...document.querySelectorAll(".sc-tabpanel[hidden]")];
    for (const p of hiddenTabs) p.hidden = false;
  });
  window.addEventListener("afterprint", () => {
    for (const d of closed) d.open = false;
    for (const p of hiddenTabs) p.hidden = true;
    closed = [];
    hiddenTabs = [];
  });
})();
