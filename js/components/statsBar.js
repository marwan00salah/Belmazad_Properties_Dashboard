import { formatNumber, timeUntil, isTrue } from "../format.js";
import { patchFilters } from "../state.js";

function computeStats(listings) {
  let live = 0, endingSoon = 0, bids = 0;
  const now = Date.now();
  for (const l of listings) {
    const t = timeUntil(l.endBidding, now);
    const sold = isTrue(l.propertySold);
    const inProgress = !sold && t.bucket !== "ended" && t.bucket !== "unknown";
    if (inProgress && l.auctionType === "Online Auction") live++;
    if (inProgress && t.bucket === "soon") endingSoon++;
    if (inProgress && t.bucket === "urgent") endingSoon++;
    const n = Number(l.no_of_bids || 0);
    if (Number.isFinite(n)) bids += n;
  }
  return {
    total: listings.length,
    live,
    endingSoon,
    bids,
  };
}

function tile({ label, value, accent, onClick }) {
  const el = document.createElement(onClick ? "button" : "div");
  el.className = "text-left rounded-xl bg-white shadow-sm p-4 ring-1 ring-ink-100" +
    (onClick ? " hover:ring-accent-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 transition cursor-pointer" : "");
  el.innerHTML = `
    <div class="text-xs uppercase tracking-wider text-ink-500 font-medium">${label}</div>
    <div class="mt-1 text-2xl md:text-3xl font-semibold ${accent || "text-ink-900"} tabular-nums count-up" data-target="${value}">0</div>
  `;
  if (onClick) {
    el.type = "button";
    el.addEventListener("click", onClick);
  }
  return el;
}

export function renderStatsBar(listings) {
  const stats = computeStats(listings);
  const wrap = document.createElement("div");
  wrap.className = "grid grid-cols-2 md:grid-cols-4 gap-3";
  wrap.append(
    tile({ label: "Listings", value: stats.total }),
    tile({
      label: "Live bidding auctions",
      value: stats.live,
      accent: "text-emerald-700",
      onClick: () => patchFilters({ auctionType: "Online Auction" }),
    }),
    tile({ label: "Ending in 24h", value: stats.endingSoon, accent: "text-amber-700" }),
    tile({ label: "Total bids", value: stats.bids }),
  );
  queueMicrotask(() => animateCounts(wrap));
  return wrap;
}

function animateCounts(root) {
  const els = root.querySelectorAll(".count-up");
  const duration = 600;
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - p, 3);
    for (const el of els) {
      const target = Number(el.dataset.target) || 0;
      const v = Math.round(target * ease);
      el.textContent = formatNumber(v);
    }
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
