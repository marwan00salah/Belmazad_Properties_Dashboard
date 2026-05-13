import { getState, patchFilters, resetFilters, setState } from "../state.js";
import { decode } from "../lookups.js";

const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "ending", label: "Ending soonest" },
  { id: "mostBids", label: "Most bids" },
  { id: "highestBid", label: "Highest bid" },
];

function unique(list, key) {
  const set = new Set();
  for (const l of list) {
    const v = l[key];
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// For coded fields like `propertyType` ("2") and `sellerType` ("3"), return
// unique present values with their decoded labels — sorted by label.
function uniqueDecoded(list, key, lookupKey) {
  const map = new Map(); // rawValue -> label
  for (const l of list) {
    const raw = l[key];
    if (raw == null || raw === "") continue;
    const label = decode(lookupKey, raw);
    if (!label) continue;
    map.set(String(raw), label);
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function selectField({ label, value, options, onChange }) {
  const wrap = document.createElement("label");
  wrap.className = "flex flex-col gap-1 text-xs text-ink-500";
  wrap.innerHTML = `<span class="font-medium">${label}</span>`;
  const sel = document.createElement("select");
  sel.className = "rounded-lg border border-ink-200 bg-white pl-3 pr-8 py-2 text-sm text-ink-800 shadow-sm focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-100 transition";
  sel.innerHTML = options.map(o =>
    `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`
  ).join("");
  sel.addEventListener("change", () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

export function renderFilters(listings) {
  const { filters, sort } = getState();
  const wrap = document.createElement("section");
  wrap.className = "sticky top-[68px] z-20 -mx-4 px-4 md:mx-0 md:px-0 bg-ink-50/90 backdrop-blur supports-[backdrop-filter]:bg-ink-50/70 pb-3 pt-3 ring-1 ring-transparent";

  const row = document.createElement("div");
  row.className = "flex flex-wrap items-end gap-3";

  // Search
  const searchWrap = document.createElement("label");
  searchWrap.className = "flex-1 min-w-[200px] flex flex-col gap-1 text-xs text-ink-500";
  searchWrap.innerHTML = `<span class="font-medium">Search</span>`;
  const search = document.createElement("input");
  search.type = "search";
  search.id = "filter-search";
  search.placeholder = "Name, city, or address…";
  search.value = filters.search;
  search.className = "rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 shadow-sm focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-100 transition";
  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => patchFilters({ search: search.value }), 200);
  });
  searchWrap.appendChild(search);
  row.appendChild(searchWrap);

  const sellerTypes = uniqueDecoded(listings, "sellerType", "sellerType");
  row.appendChild(selectField({
    label: "Seller type",
    value: filters.sellerType,
    options: [{ value: "all", label: "All seller types" }, ...sellerTypes],
    onChange: (v) => patchFilters({ sellerType: v }),
  }));

  const auctionTypes = unique(listings, "auctionType");
  row.appendChild(selectField({
    label: "Auction type",
    value: filters.auctionType,
    options: [{ value: "all", label: "All types" }, ...auctionTypes.map(c => ({ value: c, label: c }))],
    onChange: (v) => patchFilters({ auctionType: v }),
  }));

  const propertyTypes = uniqueDecoded(listings, "propertyType", "propertyType");
  row.appendChild(selectField({
    label: "Property type",
    value: filters.propertyType,
    options: [{ value: "all", label: "All property types" }, ...propertyTypes],
    onChange: (v) => patchFilters({ propertyType: v }),
  }));

  row.appendChild(selectField({
    label: "Sort by",
    value: sort,
    options: SORTS.map(s => ({ value: s.id, label: s.label })),
    onChange: (v) => setState({ sort: v }),
  }));

  wrap.appendChild(row);

  // Active filter chips + clear
  const chips = activeChips(filters);
  if (chips.length) {
    const chipRow = document.createElement("div");
    chipRow.className = "mt-2 flex flex-wrap items-center gap-2";
    for (const c of chips) chipRow.appendChild(c);
    const clear = document.createElement("button");
    clear.className = "text-xs text-ink-500 underline-offset-2 hover:underline hover:text-ink-700 transition ml-1";
    clear.textContent = "Clear all";
    clear.addEventListener("click", resetFilters);
    chipRow.appendChild(clear);
    wrap.appendChild(chipRow);
  }

  return wrap;
}

function chip(label, onRemove) {
  const el = document.createElement("button");
  el.className = "inline-flex items-center gap-1.5 rounded-full bg-accent-50 text-accent-700 ring-1 ring-accent-100 px-2.5 py-1 text-xs font-medium hover:bg-accent-100 transition";
  el.innerHTML = `${label}<span aria-hidden="true" class="text-accent-700/70">×</span>`;
  el.addEventListener("click", onRemove);
  return el;
}

function activeChips(filters) {
  const out = [];
  if (filters.search) out.push(chip(`Search: ${filters.search}`, () => patchFilters({ search: "" })));
  if (filters.sellerType !== "all") out.push(chip(decode("sellerType", filters.sellerType), () => patchFilters({ sellerType: "all" })));
  if (filters.auctionType !== "all") out.push(chip(filters.auctionType, () => patchFilters({ auctionType: "all" })));
  if (filters.propertyType !== "all") out.push(chip(decode("propertyType", filters.propertyType), () => patchFilters({ propertyType: "all" })));
  return out;
}
