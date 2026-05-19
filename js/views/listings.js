import { renderStatsBar } from "../components/statsBar.js";
import { renderFilters, sortDropdown } from "../components/filters.js";
import { renderCard } from "../components/card.js";
import { skeletonGrid, skeletonStats } from "../components/skeleton.js";
import { getState, resetFilters } from "../state.js";
import { isTrue } from "../format.js";
import { WORKER_URL } from "../config.js";

function filterAndSort(listings, filters, sort) {
  const q = filters.search.trim().toLowerCase();
  let out = listings.filter(l => {
    if (filters.auctionType !== "all" && l.auctionType !== filters.auctionType) return false;
    if (filters.propertyType !== "all" && String(l.propertyType) !== filters.propertyType) return false;
    if (filters.sellerType !== "all" && String(l.sellerType) !== filters.sellerType) return false;
    if (q) {
      const hay = [
        l.propertyName, l.propertyAddress, l.cityName,
        l.stateName, l.countryName, l.SUB_PROPERTY_TYPE,
        l.propertyId,                               // FILT-04: match exact / partial ID
      ].filter(v => v != null && v !== "").join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const toEnd = l => {
    const d = new Date(String(l.endBidding || "").replace(" ", "T")).getTime();
    return Number.isFinite(d) ? d : Infinity;
  };
  const toInsert = l => {
    const d = new Date(String(l.insertDate || "").replace(" ", "T")).getTime();
    return Number.isFinite(d) ? d : 0;
  };
  const toBids = l => Number(l.no_of_bids || 0);
  const toBid  = l => Number(l.current_bid || 0);

  switch (sort) {
    case "ending":     out.sort((a, b) => toEnd(a) - toEnd(b)); break;
    case "mostBids":   out.sort((a, b) => toBids(b) - toBids(a)); break;
    case "highestBid": out.sort((a, b) => toBid(b) - toBid(a)); break;
    case "newest":
    default:           out.sort((a, b) => toInsert(b) - toInsert(a)); break;
  }
  return out;
}

export function renderListings() {
  const root = document.createElement("div");
  root.className = "flex-1 mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8 space-y-6";

  const { listings, loading, error, errorKind, filters, sort } = getState();

  if (loading && listings.length === 0) {
    root.append(skeletonStats(), skeletonGrid());
    return root;
  }

  if (errorKind === "auth" && listings.length === 0) {
    root.appendChild(renderSignInPanel());
    return root;
  }

  if (error && listings.length === 0) {
    const err = document.createElement("div");
    err.className = "mx-auto max-w-md text-center bg-white rounded-2xl border border-ink-100 shadow-sm p-8 mt-8";
    err.innerHTML = `
      <div class="text-ink-900 text-lg font-bold mb-1">Couldn't reach the server</div>
      <p class="text-ink-500 text-sm mb-4">${error}</p>
      <button id="retry-btn" class="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition shadow-sm">Retry</button>`;
    err.querySelector("#retry-btn").addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("app:refresh"));
    });
    root.appendChild(err);
    return root;
  }

  root.appendChild(renderStatsBar(listings));
  root.appendChild(renderFilters(listings));

  const filtered = filterAndSort(listings, filters, sort);
  const metaRow = document.createElement("div");
  metaRow.className = "flex items-center justify-between gap-3 flex-wrap";
  const count = document.createElement("div");
  count.className = "text-sm font-medium text-ink-500";
  count.innerHTML = filtered.length === listings.length
    ? `Showing <strong class="font-bold text-ink-900">${listings.length}</strong> propert${listings.length === 1 ? "y" : "ies"}`
    : `Showing <strong class="font-bold text-ink-900">${filtered.length}</strong> of ${listings.length} properties`;
  metaRow.append(count, sortDropdown(sort));
  root.appendChild(metaRow);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mx-auto max-w-md text-center bg-white rounded-2xl border border-ink-100 shadow-sm p-8";
    empty.innerHTML = `
      <div class="text-ink-900 text-lg font-bold mb-1">No listings match these filters</div>
      <p class="text-ink-500 text-sm mb-4">Try widening your search or clearing the filters.</p>
      <button id="clear-btn" class="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-ink-50 text-ink-800 border border-ink-200 px-4 py-2 text-sm font-semibold transition shadow-sm">Clear filters</button>`;
    empty.querySelector("#clear-btn").addEventListener("click", resetFilters);
    root.appendChild(empty);
    return root;
  }

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 fade-in";
  for (const l of filtered) grid.appendChild(renderCard(l));
  root.appendChild(grid);

  return root;
}

// GEN-01: panel shown when the dashboard's fetch is blocked by Cloudflare
// Access because the user has no session. The Sign-in button does a
// top-level same-tab navigation to the Worker's /auth-return endpoint
// with the current dashboard URL as the `dest` parameter. CF Access
// intercepts, authenticates, then passes the request through to the
// Worker, which 302s back to `dest`. The dashboard reloads with the
// Access cookie now in the jar and fetches data automatically — no
// new tab, no manual Retry.
function renderSignInPanel() {
  const wrap = document.createElement("div");
  wrap.className = "mx-auto max-w-md text-center bg-white rounded-2xl border border-ink-100 shadow-sm p-8 mt-8";

  const signInUrl = `${WORKER_URL}auth-return?dest=${encodeURIComponent(window.location.href)}`;

  wrap.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="mx-auto mb-3 text-brand-700">
      <path fill-rule="evenodd" d="M10 1l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V4l7-3zm0 5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3 6.5a3 3 0 016 0V13H7v-.5z" clip-rule="evenodd"/>
    </svg>
    <div class="text-ink-900 text-lg font-semibold mb-1">Sign in to view listings</div>
    <p class="text-ink-500 text-sm mb-5">This dashboard is restricted to authorized Belmazad team members. Sign in with a permitted email address to continue.</p>
    <a id="signin-btn" href="${signInUrl}"
       class="inline-flex items-center gap-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white px-5 py-2 text-sm font-semibold shadow-sm transition">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 11-2 0H5v12h4v-1a1 1 0 112 0v1a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm10.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 12H9a1 1 0 110-2h5.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      Sign in
    </a>
    <p class="text-ink-400 text-xs mt-3">You'll be redirected back here automatically after signing in.</p>`;

  return wrap;
}
