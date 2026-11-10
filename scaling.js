"use strict";
// Scaling page: chart-point tooltips, the current section highlighted in the table of contents, and every
// <details> opened for printing.
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

  for (const pt of document.querySelectorAll(".sc-svg .pt")) {
    pt.querySelector("title")?.remove(); // the custom tooltip replaces the native one
    pt.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(pt, e.clientX, e.clientY); });
    pt.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    pt.addEventListener("click", (e) => (active === pt && e.pointerType !== "mouse" ? hide() : show(pt, e.clientX, e.clientY)));
    pt.addEventListener("focus", () => { const r = pt.getBoundingClientRect(); show(pt, r.right, r.bottom); });
    pt.addEventListener("blur", hide);
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".sc-svg .pt")) hide(); });
  window.addEventListener("scroll", () => { if (active && document.activeElement !== active) hide(); }, { passive: true });

  // Table of contents: mark the link of the last heading scrolled past.
  const links = new Map([...document.querySelectorAll(".sc-toc a[href^='#']")].map((a) => [a.hash.slice(1), a]));
  const targets = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let current = null;
  function spy() {
    let found = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top < 120) found = t;
    const link = found && links.get(found.id);
    if (link === current) return;
    current?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "true");
    current = link;
  }
  if (targets.length) {
    spy();
    window.addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });
  }

  // Print everything: open collapsed fit tables while printing, then restore them.
  let closed = [];
  window.addEventListener("beforeprint", () => {
    closed = [...document.querySelectorAll("details:not([open])")];
    for (const d of closed) d.open = true;
  });
  window.addEventListener("afterprint", () => { for (const d of closed) d.open = false; closed = []; });
})();
