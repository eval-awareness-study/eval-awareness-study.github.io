"use strict";
// Results charts: show a row's values (data-tip) on hover, tap or keyboard focus.
(() => {
  const tip = document.createElement("div");
  tip.className = "res-tip";
  tip.hidden = true;
  tip.setAttribute("role", "status");
  document.body.append(tip);
  let active = null;

  function show(row, x, y) {
    if (active && active !== row) active.classList.remove("active");
    active = row;
    row.classList.add("active");
    tip.textContent = row.dataset.tip;
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

  for (const row of document.querySelectorAll(".res-row")) {
    row.querySelector("title")?.remove(); // the custom tooltip replaces the native one
    row.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(row, e.clientX, e.clientY); });
    row.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    row.addEventListener("click", (e) => (active === row && e.pointerType !== "mouse" ? hide() : show(row, e.clientX, e.clientY)));
    row.addEventListener("focus", () => { const r = row.getBoundingClientRect(); show(row, r.left + 20, r.bottom - 10); });
    row.addEventListener("blur", hide);
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".res-row")) hide(); });
  window.addEventListener("scroll", () => { if (active && document.activeElement !== active) hide(); }, { passive: true });
})();
