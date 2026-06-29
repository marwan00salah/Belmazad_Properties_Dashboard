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

const DROPDOWN_BTN_CLS = "inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 shadow-sm hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition";
const CHEVRON = `<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="text-ink-400 shrink-0"><path d="M5 7l5 6 5-6z"/></svg>`;

// Shared button-with-popup-menu. Same open/close (pick / outside-click /
// Escape) + __cleanup that drops the global listeners if torn down while open.
// `buttonInner(active)` returns the trigger's innerHTML for the active option.
// Exported so other surfaces (e.g. the create-property wizard) can render the
// same dropdown. `buttonClass` overrides the trigger style; `fullWidth` makes
// the trigger + menu span their container (form fields) instead of hugging
// content (filter bar).
// `loadOptions` (async () => [{value,label}]) defers the option list until the
// menu is first opened (lazy fetch — e.g. listing entities scraped by the
// Worker). When given, `options` is just the initial/placeholder list shown on
// the trigger; the real rows load on first open and are cached thereafter.
export function buildDropdown({ value, options, onPick, buttonInner, menuAlign = "right", buttonClass, fullWidth = false, searchable = false, loadOptions = null }) {
  const active = options.find(o => o.value === value) || options[0] || { value: "", label: "" };

  const wrap = document.createElement("div");
  wrap.className = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.className = buttonClass || DROPDOWN_BTN_CLS;
  btn.innerHTML = buttonInner(active);

  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.className = `absolute ${fullWidth ? "left-0 right-0" : (menuAlign === "left" ? "left-0" : "right-0")} mt-1 z-30 ${fullWidth ? "" : "min-w-[12rem]"} max-h-72 overflow-auto rounded-lg border border-ink-200 bg-white shadow-lg py-1 hidden`;

  // Optional type-to-filter box (long lists, e.g. listing entities). Filters
  // option rows live by substring; stays pinned at the top of the scroll area.
  let searchBox = null;
  if (searchable) {
    searchBox = document.createElement("input");
    searchBox.type = "text";
    searchBox.placeholder = "Search…";
    searchBox.className = "sticky top-0 z-10 w-full bg-white px-3 py-1.5 text-sm border-b border-ink-100 outline-none";
    searchBox.addEventListener("click", (e) => e.stopPropagation());
    searchBox.addEventListener("input", () => {
      const q = searchBox.value.trim().toLowerCase();
      menu.querySelectorAll('[role="menuitem"]').forEach((o) => {
        o.classList.toggle("hidden", !!q && !o.textContent.toLowerCase().includes(q));
      });
    });
    menu.appendChild(searchBox);
  }

  // Option rows live in their own host so a lazy load can replace them without
  // disturbing the (sticky) search box above.
  const optionsHost = document.createElement("div");
  menu.appendChild(optionsHost);

  function buildRows(opts) {
    optionsHost.innerHTML = "";
    const act = opts.find(o => o.value === value) || opts[0];
    for (const o of opts) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.setAttribute("role", "menuitem");
      opt.className = "block w-full text-left px-3 py-1.5 text-sm transition " +
        (act && o.value === act.value ? "text-brand-700 font-semibold bg-brand-50" : "text-ink-700 hover:bg-ink-50");
      opt.textContent = o.label;
      opt.addEventListener("click", () => { setOpen(false); onPick(o.value); });
      optionsHost.appendChild(opt);
    }
  }

  let loaded = !loadOptions;
  if (loaded) buildRows(options);
  else optionsHost.innerHTML = `<div class="px-3 py-2 text-sm text-ink-400">Loading…</div>`;

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    optionsHost.innerHTML = `<div class="px-3 py-2 text-sm text-ink-400">Loading…</div>`;
    try {
      const opts = await loadOptions();
      if (!opts || !opts.length) { optionsHost.innerHTML = `<div class="px-3 py-2 text-sm text-ink-400">None found</div>`; return; }
      buildRows(opts);
    } catch {
      loaded = false;  // allow a retry on next open
      optionsHost.innerHTML = `<div class="px-3 py-2 text-sm text-urgent-600">Couldn't load — try again</div>`;
    }
  }

  let open = false;
  const onDoc = (e) => { if (!wrap.contains(e.target)) setOpen(false); };
  const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
  function setOpen(v) {
    if (open === v) return;
    open = v;
    menu.classList.toggle("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      ensureLoaded();   // lazy fetch on first open (no-op when not using loadOptions)
      document.addEventListener("click", onDoc, true);
      document.addEventListener("keydown", onKey);
      if (searchBox) requestAnimationFrame(() => searchBox.focus());
    } else {
      document.removeEventListener("click", onDoc, true);
      document.removeEventListener("keydown", onKey);
    }
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });

  wrap.append(btn, menu);
  wrap.__cleanup = () => setOpen(false);
  return wrap;
}

// Stacked field-label + dropdown button — drop-in replacement for the old
// native <select> filter (same `value`, same option list, same onPick).
function filterDropdown({ label, value, options, onPick }) {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-1 text-xs text-ink-500";
  wrap.innerHTML = `<span class="font-medium">${label}</span>`;
  wrap.appendChild(buildDropdown({
    value, options, onPick,
    menuAlign: "left",
    buttonInner: (a) => `<span class="truncate max-w-[12rem]">${a.label}</span>${CHEVRON}`,
  }));
  return wrap;
}

export function renderFilters(listings) {
  const { filters } = getState();
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
  search.placeholder = "Name, city, address, or ID…";
  search.value = filters.search;
  search.className = "rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";
  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => patchFilters({ search: search.value }), 200);
  });
  searchWrap.appendChild(search);
  row.appendChild(searchWrap);

  row.appendChild(filterDropdown({
    label: "Seller type",
    value: filters.sellerType,
    options: [{ value: "all", label: "All seller types" }, ...uniqueDecoded(listings, "sellerType", "sellerType")],
    onPick: (v) => patchFilters({ sellerType: v }),
  }));

  row.appendChild(filterDropdown({
    label: "Auction type",
    value: filters.auctionType,
    options: [{ value: "all", label: "All types" }, ...unique(listings, "auctionType").map(c => ({ value: c, label: c }))],
    onPick: (v) => patchFilters({ auctionType: v }),
  }));

  row.appendChild(filterDropdown({
    label: "Property type",
    value: filters.propertyType,
    options: [{ value: "all", label: "All property types" }, ...uniqueDecoded(listings, "propertyType", "propertyType")],
    onPick: (v) => patchFilters({ propertyType: v }),
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
  el.className = "inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 px-2.5 py-1 text-xs font-medium hover:bg-brand-100 transition";
  el.innerHTML = `${label}<span aria-hidden="true" class="text-brand-700/70">×</span>`;
  el.addEventListener("click", onRemove);
  return el;
}

// Sort control — same SORTS + setState({ sort }), now a thin wrapper over the
// shared buildDropdown (was a ~55-line duplicate of the same state machine).
const SORT_ICON = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5 7l5-5 5 5H5zM5 13l5 5 5-5H5z"/></svg>`;
export function sortDropdown(currentSort) {
  return buildDropdown({
    value: currentSort,
    options: SORTS.map(s => ({ value: s.id, label: s.label })),
    onPick: (v) => setState({ sort: v }),
    buttonInner: (a) => `${SORT_ICON}<span>Sort: ${a.label}</span>${CHEVRON}`,
  });
}

function activeChips(filters) {
  const out = [];
  if (filters.search) out.push(chip(`Search: ${filters.search}`, () => patchFilters({ search: "" })));
  if (filters.sellerType !== "all") out.push(chip(decode("sellerType", filters.sellerType), () => patchFilters({ sellerType: "all" })));
  if (filters.auctionType !== "all") out.push(chip(filters.auctionType, () => patchFilters({ auctionType: "all" })));
  if (filters.propertyType !== "all") out.push(chip(decode("propertyType", filters.propertyType), () => patchFilters({ propertyType: "all" })));
  return out;
}
