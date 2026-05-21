import { renderStatsBar } from "../components/statsBar.js";
import { renderFilters, sortDropdown } from "../components/filters.js";
import { renderCard } from "../components/card.js";
import { skeletonGrid, skeletonStats } from "../components/skeleton.js";
import { renderSignInPanel } from "../components/signInPanel.js";
import { getState, resetFilters } from "../state.js";
import { isTrue } from "../format.js";

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
// Access because the user has no session. As of GEN-03, the implementation
// lives in js/components/signInPanel.js so every route can use it; this
// view imports it at the top alongside other shared components.
