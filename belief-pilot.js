// Hover, tap and keyboard details for chart marks carrying data-tip; view switches for multi-view figures.
(() => {
  const tip = document.createElement("div");
  tip.className = "bp-tip";
  tip.hidden = true;
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);
  let pinned = null;

  const place = (x, y) => {
    const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(pad, x + pad), window.innerWidth - w - pad);
    const top = y + pad + h > window.innerHeight ? y - h - pad : y + pad;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
  };
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    if (x === undefined) {
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.bottom;
    }
    place(x, y);
  };
  const hide = () => { tip.hidden = true; pinned = null; };

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && !pinned) show(el, e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", (e) => {
    if (!pinned && !tip.hidden && e.target.closest("[data-tip]")) place(e.clientX, e.clientY);
  });
  document.addEventListener("mouseout", (e) => {
    if (!pinned && e.target.closest("[data-tip]")) tip.hidden = true;
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return hide();
    pinned = el;
    show(el, e.clientX, e.clientY);
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) { pinned = el; show(el); }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.closest && e.target.closest("[data-tip]")) hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (!tip.hidden) hide(); }, { passive: true });
})();

document.querySelectorAll(".bp-switch").forEach((group) => {
  const figure = group.closest("figure");
  group.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-view]");
    if (!button) return;
    group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    figure.querySelectorAll(".bp-view").forEach((v) => { v.hidden = v.dataset.view !== button.dataset.view; });
  });
});
