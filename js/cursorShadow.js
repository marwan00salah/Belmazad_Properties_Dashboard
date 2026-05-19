// Drop-shadow that follows the pointer: the shadow shifts opposite the cursor
// (as if the element is lit from the cursor), reverting to the Tailwind shadow
// on leave. rAF-throttled; mouse/pen only (skips touch); element-level
// listeners only, so they die with the node (no cleanup needed).
// Shared by the stat tiles and the property cards (same shadow-box size).
export function attachCursorShadow(el, opts = {}) {
  // "strong" preset is for cards that already carry Tailwind shadow-lg
  // (dark cards) — the default tracked shadow is too subtle to overcome it.
  const M = opts.intensity === "strong"
    ? { dx: 9, dy: 9, dyOff: 4.5, blur: 22, alpha: 0.35 }
    : { dx: 5, dy: 5, dyOff: 2.5, blur: 11, alpha: 0.16 };
  let raf = 0, last = null;
  const apply = () => {
    raf = 0;
    if (!last) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = ((last.clientX - r.left) / r.width - 0.5) * 2;   // -1 (left) … 1 (right)
    const ny = ((last.clientY - r.top) / r.height - 0.5) * 2;   // -1 (top)  … 1 (bottom)
    el.style.boxShadow =
      `${(-nx * M.dx).toFixed(1)}px ${(-ny * M.dy + M.dyOff).toFixed(1)}px ${M.blur}px rgba(2,6,23,${M.alpha})`;
  };
  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    // box-shadow instant (kills the ~150ms Tailwind transition lag) while
    // keeping the lift/border eased; restored on leave for a smooth reset.
    if (!last) el.style.transition = "transform .15s ease, border-color .15s ease, box-shadow 0s";
    last = e;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  el.addEventListener("pointerleave", () => {
    last = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    el.style.transition = "";  // resume Tailwind `transition` → shadow eases back
    el.style.boxShadow = "";   // hand back to the Tailwind shadow classes
  });
}
