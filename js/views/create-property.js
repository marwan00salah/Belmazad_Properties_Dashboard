// ADD-PROPERTY: staged "Create property" wizard (#/cms/create-property).
//
// Mirrors the add-user arc (views/admin.js) but as a multi-step wizard:
//   - Field VALUES live in a module-scoped `formCache` (survives re-renders,
//     no per-keystroke setState). Only the step index + submit outcome live
//     in state.property (drives re-render via setProperty).
//   - Each input has a stable id (`cp-<field>`) so main.js's focus-restore
//     keeps the cursor anchored across any incidental re-render.
//   - Per step, REQUIRED fields render on top, then a thin <hr>, then OPTIONAL
//     fields below (each group labelled).
//   - NAVIGATION IS FREE / OUT-OF-ORDER: any step is reachable at any time
//     (jump to Media before finishing Basics, etc.). Required fields are
//     enforced at SUBMIT (the Review step blocks Create and lists what's
//     missing), not for navigation. The stepper colours each pill by state:
//     active = brand · visited+complete = green · visited+incomplete = faint
//     red · unvisited = grey. A step only goes red once you've VISITED and
//     left it incomplete — never pre-emptively.
//   - Dropdowns reuse the /properties filter component (buildDropdown).
//
// Submit contract (extracted from api-spec/snapshots/add-property-page-form
// .html — NOT a guess): belmazad's own form posts multipart FormData to
// /admin/property/addForm/ → {ERROR,propertyId}, THEN uploads each image to
// /admin/property/addimage/{propertyId}. We send every scalar + the repeated
// `images`/`docs` File parts to the Worker in ONE multipart; the Worker does
// the two-phase relay. See api.js createAdminProperty + the Worker route.

import { getState, setProperty } from "../state.js";
import { createAdminProperty, fetchPropertyCities, fetchListingEntities, fetchCoords, loadProperty, AuthRequiredError } from "../api.js";
import { LOOKUPS } from "../lookups.js";
import { IMAGE_THUMB_BASE_URL } from "../config.js";
import { buildDropdown } from "../components/filters.js";

// ── Option lists ────────────────────────────────────────────────────────────
// Reuse the authoritative LOOKUPS maps where they exist; inline the few the
// decoder doesn't carry. Values verified against the add-property snapshot
// (2026-06-25). Object insertion order = display order.

const ent = (map) => Object.entries(map); // {v:l} → [[v,l],…] for options

const AUCTION_TYPE = [["1", "Bidding Auction"], ["3", "Make An Offer"]];
const ASSET_TYPE = [["24", "Primary Sale"], ["26", "Resale"], ["25", "For Rent"]];
const SALE_STATUS = [
  ["33", "Relisted"], ["34", "Reduced Reserve"], ["35", "No Reserve"],
  ["36", "Private Auction"], ["37", "Entry Fee Auction"],
];
const BIDDING_UNITS = [
  ["1", "Sqm rate"], ["2", "Total Price"], ["3", "Down Payment"],
  ["4", "Cash (excl. installments)"], ["5", "Full price (incl. installments)"],
  ["6", "Financed Price"],
];
const EXPIRY_DAYS = ["5", "10", "15", "20", "30", "40", "50", "60", "70", "80", "90", "100", "110", "120"]
  .map((d) => [d, `${d} days`]);

// Currency: curated MENA-first subset of belmazad's ~110-entry list (same
// precedent as admin.js's COUNTRY_CODES). EGP is belmazad's default (id 31).
const CURRENCIES = [
  ["31", "Egyptian Pound (EGP £)"],
  ["105", "US Dollar (USD $)"],
  ["34", "Euro (EUR €)"],
  ["104", "British Pound (GBP £)"],
  ["86", "Saudi Riyal (SAR ﷼)"],
  ["82", "Qatari Riyal (QAR ﷼)"],
];

// Egypt governorates — verified from the live /user/getStates capture
// (2026-06-25). Country is locked to Egypt for v1, so these are used directly
// (no Worker round-trip). Cities stay Worker-only (thousands of rows).
const EGY_STATES = [
  { code: "3", name: "Alexandria" }, { code: "16", name: "Assiut" }, { code: "15", name: "Aswan" },
  { code: "6", name: "Beheira" }, { code: "17", name: "Beni Suef" }, { code: "1", name: "Cairo" },
  { code: "4", name: "Dakahlia" }, { code: "19", name: "Damietta" }, { code: "7", name: "Fayoum" },
  { code: "8", name: "Gharbiya" }, { code: "2", name: "Giza" }, { code: "9", name: "Ismailia" },
  { code: "22", name: "Kafr Al sheikh" }, { code: "24", name: "Luxor" }, { code: "23", name: "Matrouh" },
  { code: "10", name: "Menofia" }, { code: "11", name: "Minya" }, { code: "13", name: "New Valley" },
  { code: "26", name: "North Sinai" }, { code: "18", name: "Port Said" }, { code: "12", name: "Qaliubiya" },
  { code: "25", name: "Qena" }, { code: "5", name: "Red Sea" }, { code: "20", name: "Sharkia" },
  { code: "27", name: "Sohag" }, { code: "21", name: "South Sinai" }, { code: "14", name: "Suez" },
];

// propertySubType options per propertyType (snapshot show/hides one of six
// selects by propertyType). Foreclosed (5) has no subtype select upstream.
const SUBTYPES = {
  "0": [ // Residential
    ["1", "Studio"], ["2", "Apartment"], ["3", "Penthouse"], ["4", "Villa"],
    ["5", "Townhouse"], ["6", "Twin house"], ["7", "Duplex"], ["12", "Full Floor"],
    ["44", "Half Floor"], ["49", "Whole Building"], ["52", "Compound"], ["53", "Chalet"],
    ["54", "Cabana"], ["55", "Serviced Apartment"], ["56", "Staff Accommodation"],
    ["57", "Farm House"], ["58", "Bulk"],
  ],
  "1": [ // Commercial
    ["20", "Office Space"], ["27", "Retail"], ["28", "Warehouse"], ["29", "Cold Storage"],
    ["30", "Villa"], ["31", "Banquet Hall"], ["32", "Building"], ["33", "Hotel"],
    ["34", "Bulk"], ["36", "Clinic"], ["39", "Medical Facility"], ["40", "Mall"],
    ["41", "Shopping Center"], ["42", "Co-working Space"], ["43", "Full Floor"],
    ["50", "Half Floor"], ["51", "Other"],
  ],
  "2": [ // Land
    ["59", "Residential"], ["60", "Commercial"], ["61", "Mixed Use"], ["62", "Horse farm"],
    ["63", "Farm"], ["64", "Farm house"], ["65", "Agricultural"], ["66", "Factory"],
    ["67", "Storage"], ["68", "Touristic"], ["75", "Land Use"],
  ],
  "3": [["69", "Factory"], ["70", "Special purpose"]], // Bank Owned
  "4": [["71", "Residential"], ["72", "Commercial"], ["73", "Land"], ["74", "Industrial"]], // Luxurious
  "6": [ // Moveable Asset
    ["76", "Mixed & Composite Lots"], ["77", "Vehicles & Transport"],
    ["78", "Industrial Machinery & Equipment"], ["79", "Telecom, IT & Electronics"],
    ["80", "Furniture & Fixtures"], ["81", "Scrap & Recyclables"],
    ["82", "Inventory, Goods & Stock"], ["83", "Specialized & High-Value Assets"],
  ],
};

const DEFAULT_DISCLAIMER =
  "Disclaimer: The information provided herein is for informational purposes only. " +
  "No representation or warranty is made as to the accuracy or completeness of any " +
  "information contained herein, including the condition of the Property, the condition " +
  "of title, or Property descriptions. You are encouraged to conduct your own due " +
  "diligence and seek independent legal advice before bidding.";

// ── Form-value cache + visited-step tracking (module-scoped) ─────────────────

let formCache = defaultProperty();
let visited = new Set([0]);           // step indices the user has opened
let _citiesCache = {};                // stateCode → [{code,name}]
let _citiesLoading = {};
let _entityCache = {};                // entityType → [{id,name}] (lazy, on dropdown open)

// Edit mode: editId = the property being edited (null = create). The unified
// `gallery` holds existing + new photos in display order; `originalImages` is
// the loaded filenames (the Worker needs both to reconcile on update).
let editId = null;
let editStatus = "idle";              // idle | loading | loaded | error
let gallery = [];                     // [{ key, kind:"existing"|"new", filename?, file? }]
let originalImages = [];              // existing filenames as loaded
let _entityLabels = {};               // field → name of the loaded entity (so its name shows pre-lazy-load)
let _galleryKey = 0;
const mintGalleryKey = () => "g" + (++_galleryKey);

function defaultProperty() {
  return {
    // Basics
    sellerType: "", propertyType: "", propertySubType: "", auction_type: "",
    status: "1", propertyOccupancyStatus: "", featured: "0", assetType: "",
    purchaseStatus: "", propertyLabel: "", tenure: "", saleStatus: "",
    verifyStatus: "1", land_use: "", coming_soon: "0",
    coming_soon_link: "", arabic_coming_soon_link: "",
    // Pricing
    currencyId: "31", start_bid: "", bidIncrements: "", endBidding: "",
    startBidding: "", expiry: "", bidding_units: "", current_market_value: "",
    reserveAmount: "", buy_it_now: "", show_buy_it_now: "0", priceModifier: "0",
    guidePrice: "", rental_estimate_per_month: "",
    // Location
    country: "EGY", state: "", propertyCity: "", propertyAddress: "",
    arabicpropertyAddress: "", zip: "", lat: "", lang: "",
    // Details
    propertyName: "", propertyDescription: "", auctionDisclaimers: DEFAULT_DISCLAIMER,
    arabicpropertyName: "", arabicpropertyDescription: "", summary: "",
    bedrooms: "", baths: "", homeSquareFootage: "", yearBuilt: "", amenities: "",
    legalPack: "", arabiclegalPack: "", video_url: "", virtual_tour_url: "",
    additionalCharges: "",
    // Entities (numeric ids for v1 — dropdowns are a follow-up)
    sellerId: "", agentId: "", auctioneerId: "", sub_adminId: "",
    lawyersName: "", lawyersEmail: "", lawyersOfficeNumber: "",
    bank_name: "", egp_account: "", egp_iban: "", swift_code: "",
    // Docs — File[]. Images live in the module-scoped `gallery` (see above).
    docs: [],
  };
}

function resetWizard() {
  formCache = defaultProperty();
  visited = new Set([0]);
  _citiesCache = {};
  _citiesLoading = {};
  _entityCache = {};
  _entityLabels = {};
  gallery = [];
  originalImages = [];
  editId = null;
  editStatus = "idle";
}

// ── Step schema ──────────────────────────────────────────────────────────────
// kind: text | num | datetime | select | textarea | subtype | country | state |
//       city | files. cond(cache) → only show (and only require) when true.

const STEPS = [
  {
    title: "Basics",
    required: [
      { name: "sellerType", label: "Seller type", kind: "select", options: ent(LOOKUPS.sellerType) },
      { name: "propertyType", label: "Property type", kind: "select", options: ent(LOOKUPS.propertyType) },
      { name: "propertySubType", label: "Sub-type", kind: "subtype" },
      { name: "auction_type", label: "Auction type", kind: "select", options: AUCTION_TYPE },
      { name: "assetType", label: "Transaction type", kind: "select", options: ASSET_TYPE },
      { name: "purchaseStatus", label: "Payment terms", kind: "select", options: ent(LOOKUPS.purchaseStatus) },
      { name: "propertyOccupancyStatus", label: "Occupancy", kind: "select", options: ent(LOOKUPS.propertyOccupancyStatus) },
      { name: "status", label: "Status", kind: "select", options: ent(LOOKUPS.status) },
      { name: "featured", label: "Featured", kind: "select", options: ent(LOOKUPS.featured) },
    ],
    optional: [
      { name: "propertyLabel", label: "Label", kind: "select", options: ent(LOOKUPS.propertyLabel) },
      { name: "tenure", label: "Tenure", kind: "select", options: ent(LOOKUPS.tenure) },
      { name: "saleStatus", label: "Sale status", kind: "select", options: SALE_STATUS },
      { name: "verifyStatus", label: "Verified", kind: "select", options: ent(LOOKUPS.verifyStatus) },
      { name: "land_use", label: "Land use", kind: "select", options: ent(LOOKUPS.land_use), cond: (c) => c.propertyType === "2" },
      { name: "coming_soon", label: "Coming soon", kind: "select", options: ent(LOOKUPS.coming_soon) },
      { name: "coming_soon_link", label: "Coming-soon link (EN)", kind: "text", cond: (c) => c.coming_soon === "1" },
      { name: "arabic_coming_soon_link", label: "Coming-soon link (AR)", kind: "text", cond: (c) => c.coming_soon === "1" },
    ],
  },
  {
    title: "Pricing",
    required: [
      { name: "currencyId", label: "Currency", kind: "select", options: CURRENCIES },
      { name: "start_bid", label: "Starting bid", kind: "num", cond: (c) => c.auction_type === "1" },
      { name: "bidIncrements", label: "Bid increment", kind: "num", cond: (c) => c.auction_type === "1" },
      { name: "endBidding", label: "Bidding ends", kind: "datetime", cond: (c) => c.auction_type === "1" },
    ],
    optional: [
      { name: "startBidding", label: "Bidding starts", kind: "datetime", cond: (c) => c.auction_type === "1" },
      { name: "expiry", label: "Duration", kind: "select", options: EXPIRY_DAYS, cond: (c) => c.auction_type === "1" },
      { name: "bidding_units", label: "Bidding unit", kind: "select", options: BIDDING_UNITS },
      { name: "current_market_value", label: "Market value", kind: "num" },
      { name: "reserveAmount", label: "Reserve amount", kind: "num" },
      { name: "show_buy_it_now", label: "Show Buy-It-Now", kind: "select", options: ent(LOOKUPS.show_buy_it_now) },
      { name: "buy_it_now", label: "Buy-It-Now price", kind: "num", cond: (c) => c.show_buy_it_now === "1" },
      { name: "priceModifier", label: "Price modifier", kind: "select", options: ent(LOOKUPS.priceModifier) },
      { name: "guidePrice", label: "Guide price", kind: "num", cond: (c) => c.priceModifier === "3" },
      { name: "rental_estimate_per_month", label: "Rent estimate / month", kind: "num" },
    ],
  },
  {
    title: "Location",
    required: [
      { name: "country", label: "Country", kind: "country" },
      { name: "state", label: "Governorate", kind: "state" },
      { name: "propertyCity", label: "City", kind: "city" },
      { name: "propertyAddress", label: "Address (EN)", kind: "text" },
    ],
    optional: [
      { name: "arabicpropertyAddress", label: "Address (AR)", kind: "text" },
      { name: "zip", label: "Postal code", kind: "text" },
      // Map pin picker — owns both formCache.lat and formCache.lang.
      { name: "geo", label: "Map location", kind: "geo" },
    ],
  },
  {
    title: "Details",
    required: [
      { name: "propertyName", label: "Property name (EN)", kind: "text" },
      { name: "propertyDescription", label: "Description (EN)", kind: "rich" },
      { name: "auctionDisclaimers", label: "Auction disclaimers", kind: "rich" },
    ],
    optional: [
      { name: "arabicpropertyName", label: "Property name (AR)", kind: "text" },
      { name: "arabicpropertyDescription", label: "Description (AR)", kind: "rich" },
      { name: "summary", label: "Summary", kind: "textarea" },
      { name: "bedrooms", label: "Bedrooms", kind: "num" },
      { name: "baths", label: "Bathrooms", kind: "num" },
      { name: "homeSquareFootage", label: "Area (m²)", kind: "num" },
      { name: "yearBuilt", label: "Year built", kind: "num" },
      { name: "amenities", label: "Amenities", kind: "text" },
      { name: "legalPack", label: "Legal pack (EN)", kind: "rich" },
      { name: "arabiclegalPack", label: "Legal pack (AR)", kind: "rich" },
      { name: "additionalCharges", label: "Additional charges", kind: "text" },
      { name: "video_url", label: "Video URL", kind: "text" },
      { name: "virtual_tour_url", label: "Virtual tour URL", kind: "text" },
    ],
  },
  {
    title: "Entities",
    required: [],
    optional: [
      { name: "sellerId", label: "Seller (Checker)", kind: "entity", entityType: "seller" },
      { name: "agentId", label: "Broker (Maker)", kind: "entity", entityType: "agent" },
      { name: "auctioneerId", label: "Auctioneer", kind: "entity", entityType: "auctioneer" },
      { name: "sub_adminId", label: "Sub-admin", kind: "entity", entityType: "subadmin" },
      { name: "lawyersName", label: "Lawyer name", kind: "text" },
      { name: "lawyersEmail", label: "Lawyer email", kind: "text" },
      { name: "lawyersOfficeNumber", label: "Lawyer phone", kind: "text" },
      { name: "bank_name", label: "Bank name", kind: "text" },
      { name: "egp_account", label: "EGP account", kind: "text" },
      { name: "egp_iban", label: "EGP IBAN", kind: "text" },
      { name: "swift_code", label: "SWIFT code", kind: "text" },
    ],
  },
  {
    title: "Media",
    required: [],
    optional: [
      { name: "images", label: "Images", kind: "gallery", accept: "image/*" },
      { name: "docs", label: "Documents", kind: "files", accept: ".pdf,application/pdf", help: "Terms booklet / supporting PDFs." },
    ],
  },
  { title: "Review", required: [], optional: [], review: true },
];

// ── Public entry ─────────────────────────────────────────────────────────────

export function renderCreateProperty() {
  const { property, route } = getState();

  // ── Sync edit context with the route ──────────────────────────────────────
  const isEdit = route?.name === "admin-edit-property";
  const targetId = isEdit ? String(route.params.propertyId) : null;
  if (isEdit) {
    if (editId !== targetId) {          // new edit target → reset + hydrate
      resetWizard();
      editId = targetId;
      editStatus = "loading";
      hydrateEdit(targetId);
    }
  } else if (editId !== null) {         // returning to create mode after an edit
    resetWizard();
  }
  if (isEdit && editStatus === "loading") return editStateView(targetId, "loading");
  if (isEdit && editStatus === "error") return editStateView(targetId, "error");

  const step = clampStep(property.step);
  visited.add(step);
  const def = STEPS[step];

  const root = document.createElement("div");
  root.className = "mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8 space-y-6";

  const title = document.createElement("div");
  title.innerHTML = isEdit
    ? `<h1 class="text-3xl font-extrabold tracking-tight text-ink-900">Edit property <span class="text-ink-400 font-mono text-2xl">#${escapeHtml(editId)}</span></h1>
       <p class="mt-2 text-sm text-ink-600">Update this listing on belmazad.com. Changes save when you press <span class="font-semibold">Update</span>.</p>`
    : `<h1 class="text-3xl font-extrabold tracking-tight text-ink-900">Create property</h1>
       <p class="mt-2 text-sm text-ink-600">List a new property on belmazad.com. Fill the steps in any order — required fields are checked when you create the listing.</p>`;
  root.appendChild(title);

  root.appendChild(renderStepper(step));

  if (property.result) root.appendChild(renderResultBanner(property.result));
  if (property.error) root.appendChild(renderErrorBanner(property.error));

  const card = document.createElement("form");
  card.className = "bg-white rounded-2xl border border-ink-100 shadow-sm p-6 space-y-5";
  card.addEventListener("submit", (e) => e.preventDefault());
  card.appendChild(def.review ? renderReview() : renderStepBody(def));
  card.appendChild(renderNav(step, def, property.submitting));
  root.appendChild(card);

  return root;
}

// Fetch the listing's current values + images and hydrate the wizard.
// keepResult preserves a success banner across the post-update refresh.
async function hydrateEdit(id, { keepResult = false } = {}) {
  const data = await loadProperty(id);
  if (editId !== id) return;            // navigated away mid-fetch
  if (!data) { editStatus = "error"; setProperty({}); return; }
  // Overlay loaded non-empty values onto the defaults (keeps sane defaults for
  // anything the listing leaves blank).
  for (const [k, v] of Object.entries(data.fields || {})) {
    if (v != null && String(v) !== "" && k in formCache) formCache[k] = String(v);
  }
  _entityLabels = data.entityLabels || {};
  originalImages = Array.isArray(data.images) ? data.images : [];
  gallery = originalImages.map((fn) => ({ key: mintGalleryKey(), kind: "existing", filename: fn }));
  visited = new Set(STEPS.map((_, i) => i));   // pre-filled → mark all visited
  editStatus = "loaded";
  setProperty(keepResult ? { step: 0, error: null } : { step: 0, result: null, error: null });
}

function editStateView(id, kind) {
  const root = document.createElement("div");
  root.className = "mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8";
  const box = document.createElement("div");
  box.className = "rounded-2xl border border-ink-100 bg-white shadow-sm p-10 text-center";
  if (kind === "loading") {
    box.innerHTML = `<svg class="icon-spin mx-auto mb-3 text-brand-600" width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312z" clip-rule="evenodd"/></svg>
      <div class="text-sm font-semibold text-ink-700">Loading property #${escapeHtml(id)}…</div>`;
  } else {
    box.innerHTML = `<div class="text-sm font-semibold text-urgent-600">Couldn't load property #${escapeHtml(id)}.</div>
      <p class="mt-1 text-xs text-ink-500">It may not exist, or the server is unreachable.</p>`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "mt-4 rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-4 py-2 text-sm font-semibold transition";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => { editStatus = "loading"; setProperty({}); hydrateEdit(id); });
    box.appendChild(retry);
    const back = document.createElement("a");
    back.href = "#/cms/properties";
    back.className = "mt-3 block text-xs text-ink-500 underline underline-offset-2";
    back.textContent = "Back to properties";
    box.appendChild(back);
  }
  root.appendChild(box);
  return root;
}

// ── Stepper (free navigation + completeness colours) ─────────────────────────

function renderStepper(current) {
  const wrap = document.createElement("div");
  // justify-center → bar is centred above the form (utility already used by
  // detail.js's 3-column layout, so the rule exists at first paint).
  wrap.className = "flex flex-wrap items-center justify-center gap-2";
  STEPS.forEach((s, i) => {
    const isActive = i === current;
    const isVisited = visited.has(i);
    const complete = s.review ? true : stepValid(s);
    let tone;
    if (isActive) tone = "bg-brand-600 text-white shadow-sm";
    else if (!isVisited) tone = "bg-ink-50 text-ink-500 hover:bg-ink-100";
    else tone = complete
      ? "bg-insight-50 text-insight-700 hover:bg-insight-100"   // green = done
      : "bg-urgent-50 text-urgent-600 hover:bg-urgent-100";    // faint red = left incomplete
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition " + tone;
    pill.innerHTML = `<span class="opacity-70">${i + 1}</span><span>${s.title}</span>`;
    pill.addEventListener("click", () => setProperty({ step: i, error: null }));  // free / out-of-order
    wrap.appendChild(pill);
  });
  return wrap;
}

// ── Step body (required group → hr → optional group) ─────────────────────────

function renderStepBody(def) {
  const frag = document.createDocumentFragment();
  const activeReq = def.required.filter((f) => !f.cond || f.cond(formCache));
  const activeOpt = def.optional.filter((f) => !f.cond || f.cond(formCache));

  if (activeReq.length) {
    frag.appendChild(groupLabel("Required"));
    frag.appendChild(fieldGrid(activeReq, true));
  }
  if (activeReq.length && activeOpt.length) {
    const hr = document.createElement("hr");
    hr.className = "border-t border-ink-100";
    frag.appendChild(hr);
  }
  if (activeOpt.length) {
    frag.appendChild(groupLabel("Optional"));
    frag.appendChild(fieldGrid(activeOpt, false));
  }
  if (!activeReq.length && !activeOpt.length) {
    const none = document.createElement("p");
    none.className = "text-sm text-ink-500";
    none.textContent = "Nothing to fill here — continue.";
    frag.appendChild(none);
  }
  return frag;
}

function groupLabel(text) {
  const el = document.createElement("div");
  el.className = "text-xs font-bold uppercase tracking-wide " + (text === "Required" ? "text-ink-700" : "text-ink-400");
  el.textContent = text;
  return el;
}

function fieldGrid(fields, required) {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-4";
  for (const f of fields) grid.appendChild(buildField(f, required));
  return grid;
}

// ── Field factories ──────────────────────────────────────────────────────────

function buildField(f, required) {
  switch (f.kind) {
    case "select": return ddCell(f, required, f.options);
    case "subtype": return subtypeCell(f, required);
    case "textarea": return textareaCell(f, required);
    case "rich": return richCell(f, required);
    case "files": return filesCell(f);
    case "country": return countryCell(f, required);
    case "state": return stateCell(f, required);
    case "city": return cityCell(f, required);
    case "entity": return entityCell(f, required);
    case "geo": return geoCell(f);
    case "gallery": return galleryCell(f);
    default: return textCell(f, required); // text | num | datetime
  }
}

function cellWrap(f, wide) {
  const cell = document.createElement("div");
  cell.className = "space-y-1.5" + (wide ? " sm:col-span-2" : "");
  return cell;
}

function labelEl(f, required) {
  const lab = document.createElement("label");
  lab.className = "block text-sm font-semibold text-ink-700";
  lab.htmlFor = `cp-${f.name}`;
  lab.innerHTML = `${f.label}${required ? ' <span class="text-urgent-600">*</span>' : ""}`;
  return lab;
}

function helpEl(f) {
  if (!f.help) return null;
  const h = document.createElement("p");
  h.className = "text-xs text-ink-500";
  h.textContent = f.help;
  return h;
}

const INPUT_CLS = "block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition";

// Full-width variant of the /properties dropdown trigger (DROPDOWN_BTN_CLS in
// filters.js) so it fills a form cell like the text inputs.
const FORM_DD_BTN = "flex w-full items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 shadow-sm hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition";
const FORM_DD_MUTED = "flex w-full items-center justify-between gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-400 cursor-default";
const CHEVRON = `<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="text-ink-400 shrink-0"><path d="M5 7l5 6 5-6z"/></svg>`;

function ddOptions(pairs, placeholder) {
  return [{ value: "", label: placeholder }, ...pairs.map(([value, label]) => ({ value: String(value), label }))];
}

function ddButtonInner(a) {
  const muted = (a.value === "" || a.value == null) ? " text-ink-400" : "";
  return `<span class="truncate${muted}">${escapeHtml(a.label)}</span>${CHEVRON}`;
}

function mutedBox(text) {
  const d = document.createElement("div");
  d.className = FORM_DD_MUTED;
  d.innerHTML = `<span class="truncate">${escapeHtml(text)}</span>${CHEVRON}`;
  return d;
}

// Generic dropdown cell using the /properties filter component.
function ddCell(f, required, pairs, { placeholder = "— Select —", onPickExtra } = {}) {
  const cell = cellWrap(f, false);
  cell.appendChild(labelEl(f, required));
  cell.appendChild(buildDropdown({
    value: String(formCache[f.name] ?? ""),
    options: ddOptions(pairs, placeholder),
    onPick: (v) => { formCache[f.name] = v; if (onPickExtra) onPickExtra(v); setProperty({}); },
    buttonInner: ddButtonInner,
    buttonClass: FORM_DD_BTN,
    fullWidth: true,
  }));
  const h = helpEl(f); if (h) cell.appendChild(h);
  return cell;
}

function textCell(f, required) {
  const wide = f.kind === "text" && (f.name === "propertyAddress" || f.name === "amenities");
  const cell = cellWrap(f, wide);
  const input = document.createElement("input");
  input.id = `cp-${f.name}`;
  input.name = f.name;
  input.type = f.kind === "datetime" ? "datetime-local" : "text";
  if (f.kind === "num") input.inputMode = "numeric";
  if (required) input.required = true;
  input.value = formCache[f.name] || "";
  input.className = INPUT_CLS;
  // Text inputs don't drive any cond and navigation is free, so no re-render
  // is needed on keystroke — just store the value (keeps the cursor put).
  input.addEventListener("input", (e) => { formCache[f.name] = e.target.value; });
  cell.appendChild(labelEl(f, required));
  cell.appendChild(input);
  const h = helpEl(f); if (h) cell.appendChild(h);
  return cell;
}

function textareaCell(f, required) {
  const cell = cellWrap(f, true);
  const ta = document.createElement("textarea");
  ta.id = `cp-${f.name}`;
  ta.name = f.name;
  ta.rows = 4;
  if (required) ta.required = true;
  ta.value = formCache[f.name] || "";
  ta.className = INPUT_CLS + " resize-y";
  ta.setAttribute("dir", "auto");
  ta.addEventListener("input", (e) => { formCache[f.name] = e.target.value; });
  cell.appendChild(labelEl(f, required));
  cell.appendChild(ta);
  const h = helpEl(f); if (h) cell.appendChild(h);
  return cell;
}

// Lightweight rich-text editor (no deps) for description / legal / disclaimer
// fields — a formatting toolbar + a source-HTML toggle. Stores HTML in
// formCache[f.name] (belmazad stores these fields as HTML — see
// sample-listing.json); handleSubmit sends a stripped plain-text mirror as
// cleanPropertyDescription. Uses document.execCommand: deprecated but
// universally supported and dependency-free, in keeping with the no-build
// dashboard. No setState on edit, so the caret is never disturbed mid-typing.
function richCell(f, required) {
  const cell = cellWrap(f, true);
  cell.appendChild(labelEl(f, required));

  const box = document.createElement("div");
  box.className = "rounded-lg border border-ink-200 shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition overflow-hidden bg-white";

  const tb = document.createElement("div");
  tb.className = "flex flex-wrap items-center gap-0.5 border-b border-ink-100 bg-ink-50 px-2 py-1";

  const editor = document.createElement("div");
  editor.id = `cp-${f.name}`;
  editor.contentEditable = "true";
  editor.setAttribute("dir", "auto");
  editor.className = "prose prose-sm max-w-none min-h-[9rem] px-3 py-2 text-sm outline-none overflow-auto";
  editor.innerHTML = formCache[f.name] || "";

  const source = document.createElement("textarea");
  source.className = "block w-full min-h-[9rem] px-3 py-2 text-xs font-mono outline-none resize-y hidden";
  source.setAttribute("dir", "ltr");
  source.spellcheck = false;

  let sourceMode = false;
  editor.addEventListener("input", () => { if (!sourceMode) formCache[f.name] = editor.innerHTML; });
  source.addEventListener("input", () => { if (sourceMode) formCache[f.name] = source.value; });

  const exec = (cmd, val = null) => { editor.focus(); document.execCommand(cmd, false, val); formCache[f.name] = editor.innerHTML; };
  const tbBtn = (label, title, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = title;
    b.innerHTML = label;
    b.className = "rounded px-1.5 py-0.5 text-xs font-semibold text-ink-600 hover:bg-ink-200 transition";
    b.addEventListener("mousedown", (e) => e.preventDefault());  // keep editor selection
    b.addEventListener("click", onClick);
    return b;
  };

  tb.append(
    tbBtn("<b>B</b>", "Bold", () => exec("bold")),
    tbBtn("<i>I</i>", "Italic", () => exec("italic")),
    tbBtn("<u>U</u>", "Underline", () => exec("underline")),
    tbBtn("H2", "Heading", () => exec("formatBlock", "<h2>")),
    tbBtn("H3", "Subheading", () => exec("formatBlock", "<h3>")),
    tbBtn("&para;", "Paragraph", () => exec("formatBlock", "<p>")),
    tbBtn("&bull;&nbsp;List", "Bulleted list", () => exec("insertUnorderedList")),
    tbBtn("1.&nbsp;List", "Numbered list", () => exec("insertOrderedList")),
    tbBtn("Link", "Insert link", () => { const url = prompt("Link URL:"); if (url) exec("createLink", url); }),
    tbBtn("Clear", "Clear formatting", () => exec("removeFormat")),
  );
  const spacer = document.createElement("div");
  spacer.className = "flex-1";
  tb.appendChild(spacer);
  const srcBtn = tbBtn("&lt;/&gt;", "Edit source HTML", () => {
    sourceMode = !sourceMode;
    if (sourceMode) source.value = editor.innerHTML;
    else { editor.innerHTML = source.value; formCache[f.name] = editor.innerHTML; }
    editor.classList.toggle("hidden", sourceMode);
    source.classList.toggle("hidden", !sourceMode);
    srcBtn.classList.toggle("bg-ink-200", sourceMode);
  });
  tb.appendChild(srcBtn);

  box.append(tb, editor, source);
  cell.appendChild(box);
  const h = helpEl(f); if (h) cell.appendChild(h);
  return cell;
}

// propertySubType: options depend on the chosen propertyType.
function subtypeCell(f, required) {
  const opts = SUBTYPES[formCache.propertyType];
  if (!opts) {
    const cell = cellWrap(f, false);
    cell.appendChild(labelEl(f, required));
    cell.appendChild(mutedBox("Choose a property type first"));
    return cell;
  }
  return ddCell(f, required, opts, { placeholder: "— Select sub-type —" });
}

// ── Location cascade ─────────────────────────────────────────────────────────
// country (Egypt-only for v1) → state (EGY_STATES, local) → city (async
// /user/getCity via Worker; falls back to a manual id input if unavailable).

function countryCell(f, required) {
  formCache.country = formCache.country || "EGY";
  const cell = cellWrap(f, false);
  cell.appendChild(labelEl(f, required));
  cell.appendChild(buildDropdown({
    value: "EGY",
    options: [{ value: "EGY", label: "Egypt" }],
    onPick: (v) => { formCache.country = v; setProperty({}); },
    buttonInner: ddButtonInner,
    buttonClass: FORM_DD_BTN,
    fullWidth: true,
  }));
  return cell;
}

function stateCell(f, required) {
  return ddCell(f, required, EGY_STATES.map((s) => [s.code, s.name]), {
    placeholder: "— Select governorate —",
    onPickExtra: () => { formCache.propertyCity = ""; },   // dependent value resets
  });
}

function cityCell(f, required) {
  const cell = cellWrap(f, false);
  cell.appendChild(labelEl(f, required));
  const key = formCache.state;

  if (!key) { cell.appendChild(mutedBox("Select a governorate first")); return cell; }

  const cached = _citiesCache[key];
  if (cached === undefined) {
    if (!_citiesLoading[key]) {
      _citiesLoading[key] = true;
      fetchPropertyCities(formCache.country || "EGY", key).then((list) => {
        _citiesCache[key] = list || [];
        _citiesLoading[key] = false;
        if (formCache.state === key) setProperty({});   // re-render with the loaded list / fallback
      });
    }
    cell.appendChild(mutedBox("Loading cities…"));
    return cell;
  }

  if (Array.isArray(cached) && cached.length === 0) {
    // Proxy unavailable (e.g. Worker route not deployed) — manual id fallback.
    const input = document.createElement("input");
    input.id = "cp-propertyCity";
    input.name = "propertyCity";
    input.type = "text";
    input.placeholder = "City id";
    if (required) input.required = true;
    input.value = formCache.propertyCity || "";
    input.className = INPUT_CLS;
    input.addEventListener("input", (e) => { formCache.propertyCity = e.target.value; });
    cell.appendChild(input);
    const note = document.createElement("p");
    note.className = "text-xs text-ink-500";
    note.textContent = "City list unavailable — deploy the Worker /property/cities route to pick from a dropdown.";
    cell.appendChild(note);
    return cell;
  }

  cell.appendChild(buildDropdown({
    value: String(formCache.propertyCity ?? ""),
    options: ddOptions(cached.map((c) => [c.code, c.name]), "— Select city —"),
    onPick: (v) => { formCache.propertyCity = v; setProperty({}); },
    buttonInner: ddButtonInner,
    buttonClass: FORM_DD_BTN,
    fullWidth: true,
  }));
  return cell;
}

// ── Map pin picker (Google Maps) ─────────────────────────────────────────────
// Mirrors belmazad's own add-property map (api-spec snapshot): a draggable
// marker writes lat/lng on dragend, a map click moves the pin, and typing into
// the lat/lng inputs moves the pin. Two-way bound to formCache.lat /
// formCache.lang (belmazad names longitude `lang`). The Maps API is loaded in
// index.html; we wait for the `gmaps:ready` event the loader fires. No setState
// on any of these interactions, so the map is never torn down mid-edit.
function geoCell(f) {
  const cell = cellWrap(f, true);
  cell.appendChild(labelEl({ name: f.name, label: "Map location" }, false));

  // "Locate from address" bar (belmazad's findCords) — geocodes the Address
  // field via the Worker and drops the pin there.
  const bar = document.createElement("div");
  bar.className = "flex items-center gap-2 mb-2";
  const findBtn = document.createElement("button");
  findBtn.type = "button";
  findBtn.className = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition disabled:opacity-50";
  findBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" class="text-brand-600"><path fill-rule="evenodd" d="M9.69 18.933A1 1 0 0010 19a1 1 0 00.31-.067C12.43 18.2 16 14.91 16 8a6 6 0 10-12 0c0 6.91 3.57 10.2 5.69 10.933zM10 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clip-rule="evenodd"/></svg><span>Locate from address</span>`;
  const findMsg = document.createElement("span");
  findMsg.className = "text-xs text-ink-500";
  bar.append(findBtn, findMsg);
  cell.appendChild(bar);

  const mapDiv = document.createElement("div");
  mapDiv.className = "h-72 w-full rounded-lg border border-ink-200 overflow-hidden bg-ink-50";
  cell.appendChild(mapDiv);

  const row = document.createElement("div");
  row.className = "grid grid-cols-2 gap-3 mt-2";
  const lat = geoInput("cp-lat", "lat", "Latitude", formCache.lat);
  const lng = geoInput("cp-lang", "lang", "Longitude", formCache.lang);
  row.append(lat.wrap, lng.wrap);
  cell.appendChild(row);

  const note = document.createElement("p");
  note.className = "text-xs text-ink-500 mt-1";
  note.textContent = "Drag the pin or click the map to set the location; or type the coordinates (belmazad names longitude `lang`).";
  cell.appendChild(note);

  // Defer until (a) the Maps API is ready AND (b) the next frame, so the div is
  // attached + sized before google.maps.Map renders into it.
  whenGoogleMaps(() => requestAnimationFrame(() => initGoogleMap(mapDiv, lat.input, lng.input, findBtn, findMsg)));
  return cell;
}

function geoInput(id, name, label, value) {
  const wrap = document.createElement("div");
  wrap.className = "space-y-1.5";
  const lab = document.createElement("label");
  lab.className = "block text-sm font-semibold text-ink-700";
  lab.htmlFor = id;
  lab.textContent = label;
  const input = document.createElement("input");
  input.id = id;
  input.name = name;
  input.type = "text";
  input.inputMode = "decimal";
  input.value = value || "";
  input.className = INPUT_CLS;
  wrap.append(lab, input);
  return { wrap, input };
}

function whenGoogleMaps(cb) {
  if (window.google && window.google.maps) { cb(); return; }
  // The loader (index.html) dispatches `gmaps:ready` exactly once when the API
  // finishes. Checking presence first covers the already-loaded case.
  document.addEventListener("gmaps:ready", () => {
    if (window.google && window.google.maps) cb();
  }, { once: true });
}

function initGoogleMap(mapDiv, latInput, lngInput, findBtn, findMsg) {
  if (!(window.google && window.google.maps)) {
    mapDiv.innerHTML = '<div class="flex h-full items-center justify-center text-xs text-ink-400">Map unavailable — check the Google Maps key referrer settings.</div>';
    return;
  }
  const hasPin =
    formCache.lat && formCache.lang &&
    Number.isFinite(parseFloat(formCache.lat)) && Number.isFinite(parseFloat(formCache.lang));
  const lat0 = hasPin ? parseFloat(formCache.lat) : 30.0444;   // Cairo default
  const lng0 = hasPin ? parseFloat(formCache.lang) : 31.2357;
  const center = new google.maps.LatLng(lat0, lng0);
  const map = new google.maps.Map(mapDiv, {
    zoom: hasPin ? 14 : 6,
    center,
    streetViewControl: false,
    mapTypeControl: true,
    fullscreenControl: false,
  });
  const marker = new google.maps.Marker({ position: center, map, draggable: true });

  const writeBack = (ll) => {
    formCache.lat = ll.lat().toFixed(6);
    formCache.lang = ll.lng().toFixed(6);
    latInput.value = formCache.lat;
    lngInput.value = formCache.lang;
  };
  google.maps.event.addListener(marker, "dragend", () => writeBack(marker.getPosition()));
  google.maps.event.addListener(map, "click", (e) => { marker.setPosition(e.latLng); writeBack(e.latLng); });

  // Typing coordinates moves the pin (on change/blur, so partial input doesn't
  // jump the map mid-keystroke). `input` keeps formCache live regardless.
  const fromInputs = () => {
    const la = parseFloat(latInput.value);
    const ln = parseFloat(lngInput.value);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const ll = new google.maps.LatLng(la, ln);
    marker.setPosition(ll);
    map.setCenter(ll);
    if (map.getZoom() < 14) map.setZoom(14);
    formCache.lat = latInput.value;
    formCache.lang = lngInput.value;
  };
  latInput.addEventListener("input", () => { formCache.lat = latInput.value; });
  lngInput.addEventListener("input", () => { formCache.lang = lngInput.value; });
  latInput.addEventListener("change", fromInputs);
  lngInput.addEventListener("change", fromInputs);

  // findCords: geocode the Address field (Worker → belmazad) and drop the pin.
  if (findBtn) {
    findBtn.addEventListener("click", async () => {
      const address = (document.getElementById("cp-propertyAddress")?.value || formCache.propertyAddress || "").trim();
      if (!address) { findMsg.textContent = "Enter the address first."; return; }
      const orig = findBtn.innerHTML;
      findBtn.disabled = true;
      findBtn.innerHTML = "<span>Locating…</span>";
      findMsg.textContent = "";
      const coords = await fetchCoords(address);
      findBtn.disabled = false;
      findBtn.innerHTML = orig;
      if (!coords) { findMsg.textContent = "Couldn't locate that address."; return; }
      const ll = new google.maps.LatLng(parseFloat(coords.lat), parseFloat(coords.lang));
      marker.setPosition(ll);
      map.setCenter(ll);
      if (map.getZoom() < 14) map.setZoom(14);
      formCache.lat = String(coords.lat);
      formCache.lang = String(coords.lang);
      latInput.value = formCache.lat;
      lngInput.value = formCache.lang;
      findMsg.textContent = "Pin placed.";
    });
  }
}

// ── Listing-entity pickers (lazy, name-searchable) ──────────────────────────
// seller / broker / auctioneer / sub-admin. The id→name lists live behind
// belmazad auth, so the Worker scrapes them; we fetch LAZILY on first dropdown
// open (not on form load, not on step entry). Once the Worker proxy returns an
// empty list (e.g. route not deployed) we drop to a manual-id input so the
// field is never a dead end.
function entityCell(f, required) {
  const cell = cellWrap(f, false);
  cell.appendChild(labelEl(f, required));
  const type = f.entityType;
  const cached = _entityCache[type];

  if (Array.isArray(cached) && cached.length === 0) {
    const input = document.createElement("input");
    input.id = `cp-${f.name}`;
    input.name = f.name;
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = `${f.label} id`;
    if (required) input.required = true;
    input.value = formCache[f.name] || "";
    input.className = INPUT_CLS;
    input.addEventListener("input", (e) => { formCache[f.name] = e.target.value; });
    cell.appendChild(input);
    const note = document.createElement("p");
    note.className = "text-xs text-ink-500";
    note.textContent = "Name list unavailable — deploy the Worker /property/entities route to pick by name; enter the id for now.";
    cell.appendChild(note);
    return cell;
  }

  const toPairs = (list) => ddOptions(list.map((e) => [e.id, e.name]), "— Select —");
  // Initial trigger options: the full cached list if loaded; else (edit mode)
  // the single loaded {id,name} so the assigned entity's NAME shows before the
  // lazy list loads; else just the placeholder. loadOptions fills the full
  // list on first open regardless.
  const seeded = (!cached && formCache[f.name] && _entityLabels[f.name])
    ? ddOptions([[formCache[f.name], _entityLabels[f.name]]], "— Select —")
    : ddOptions([], "— Select —");
  cell.appendChild(buildDropdown({
    value: String(formCache[f.name] ?? ""),
    options: cached ? toPairs(cached) : seeded,
    loadOptions: cached ? null : async () => {
      const list = await fetchListingEntities(type);
      _entityCache[type] = list || [];
      if (!_entityCache[type].length) { setProperty({}); return []; }  // re-render → manual fallback
      return toPairs(_entityCache[type]);
    },
    onPick: (v) => { formCache[f.name] = v; setProperty({}); },
    buttonInner: ddButtonInner,
    buttonClass: FORM_DD_BTN,
    fullWidth: true,
    searchable: true,
  }));
  const h = helpEl(f); if (h) cell.appendChild(h);
  return cell;
}

// ── Image gallery (existing + new, drag-to-order via SortableJS) ─────────────
// One ordered list of all photos — existing (edit) and newly-added are mixed;
// drag reorders, × deletes. On submit the order becomes the stored order (the
// first image is the cover). See handleSubmit for the imageOrder tokens.
function galleryCell(f) {
  const cell = cellWrap(f, true);
  cell.appendChild(labelEl({ name: "images", label: "Images" }, false));
  const note = document.createElement("p");
  note.className = "text-xs text-ink-500";
  note.textContent = "Drag to reorder — the first image is the cover. JPG / PNG, ≤ 5 MB each.";
  cell.appendChild(note);

  const listEl = document.createElement("div");
  listEl.id = "cp-gallery";
  listEl.className = "flex flex-wrap gap-2 mt-2";
  for (const item of gallery) listEl.appendChild(galleryThumb(item));
  cell.appendChild(listEl);

  if (!gallery.length) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-ink-400 mt-1";
    empty.textContent = "No images yet.";
    cell.appendChild(empty);
  }

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = f.accept || "image/*";
  input.className = "mt-2 block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100";
  input.addEventListener("change", (e) => {
    for (const file of Array.from(e.target.files || [])) gallery.push({ key: mintGalleryKey(), kind: "new", file });
    e.target.value = "";
    setProperty({});   // re-render → re-inits Sortable on the new list
  });
  cell.appendChild(input);

  // Init SortableJS once the list is attached.
  if (window.Sortable) {
    requestAnimationFrame(() => {
      const el = document.getElementById("cp-gallery");
      if (el && !el._cpSortable) {
        el._cpSortable = window.Sortable.create(el, { animation: 150, onEnd: () => reorderGalleryFromDom(el) });
      }
    });
  }
  return cell;
}

function galleryThumb(item) {
  const card = document.createElement("div");
  card.className = "relative w-24 h-24 rounded-lg overflow-hidden border border-ink-200 bg-ink-50 cursor-move";
  card.setAttribute("data-key", item.key);
  const img = document.createElement("img");
  img.className = "w-full h-full object-cover pointer-events-none";
  img.src = item.kind === "existing" ? (IMAGE_THUMB_BASE_URL + item.filename) : URL.createObjectURL(item.file);
  img.addEventListener("error", () => { img.style.opacity = "0.2"; });
  card.appendChild(img);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "absolute top-0.5 right-0.5 rounded-full bg-black/60 text-white w-5 h-5 text-xs leading-none flex items-center justify-center hover:bg-urgent-600";
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    gallery = gallery.filter((g) => g.key !== item.key);
    setProperty({});
  });
  card.appendChild(del);
  return card;
}

function reorderGalleryFromDom(el) {
  const order = Array.from(el.querySelectorAll("[data-key]")).map((n) => n.getAttribute("data-key"));
  gallery.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  // No re-render: the DOM already reflects the new order; the array now matches.
}

// ── File inputs ──────────────────────────────────────────────────────────────

function filesCell(f) {
  const cell = cellWrap(f, true);
  cell.appendChild(labelEl(f, false));
  const input = document.createElement("input");
  input.id = `cp-${f.name}`;
  input.type = "file";
  input.multiple = true;
  if (f.accept) input.accept = f.accept;
  input.className = "block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100";
  const list = document.createElement("div");
  list.className = "flex flex-wrap gap-1.5";
  const renderChips = () => {
    list.innerHTML = "";
    (formCache[f.name] || []).forEach((file, idx) => {
      const chip = document.createElement("span");
      chip.className = "inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-700";
      chip.innerHTML = `<span class="max-w-[14rem] truncate">${escapeHtml(file.name)}</span>`;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "text-ink-400 hover:text-urgent-600 font-bold";
      x.textContent = "×";
      x.addEventListener("click", () => {
        formCache[f.name] = formCache[f.name].filter((_, i) => i !== idx);
        renderChips();
      });
      chip.appendChild(x);
      list.appendChild(chip);
    });
  };
  input.addEventListener("change", (e) => {
    const picked = Array.from(e.target.files || []);
    formCache[f.name] = [...(formCache[f.name] || []), ...picked];
    e.target.value = "";       // allow re-picking the same file
    renderChips();
  });
  cell.appendChild(input);
  const h = helpEl(f); if (h) cell.appendChild(h);
  cell.appendChild(list);
  renderChips();
  return cell;
}

// ── Review ───────────────────────────────────────────────────────────────────

function renderReview() {
  const frag = document.createDocumentFragment();
  const intro = document.createElement("p");
  intro.className = "text-sm text-ink-600";
  intro.textContent = "Review the listing, then create it. You can jump back to any step to edit.";
  frag.appendChild(intro);

  // Re-validate every step; required gaps block submit and link back.
  const missing = [];
  STEPS.forEach((s, i) => {
    if (s.review) return;
    const req = s.required.filter((f) => !f.cond || f.cond(formCache));
    for (const f of req) {
      const v = formCache[f.name];
      if (v == null || String(v).trim() === "") missing.push({ step: i, label: `${s.title}: ${f.label}` });
    }
  });

  const summary = document.createElement("dl");
  summary.className = "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm";
  for (const [label, value] of reviewRows()) {
    const row = document.createElement("div");
    row.innerHTML = `<dt class="text-ink-500">${escapeHtml(label)}</dt><dd class="font-medium text-ink-900 break-words">${escapeHtml(value)}</dd>`;
    summary.appendChild(row);
  }
  frag.appendChild(summary);

  if (missing.length) {
    const warn = document.createElement("div");
    warn.className = "rounded-xl border border-urgent-100 bg-urgent-50 text-urgent-600 p-3 text-sm space-y-1";
    warn.innerHTML = `<div class="font-semibold">Finish these required fields first:</div>`;
    missing.forEach((m) => {
      const a = document.createElement("button");
      a.type = "button";
      a.className = "block text-left underline underline-offset-2 hover:opacity-80";
      a.textContent = m.label;
      a.addEventListener("click", () => setProperty({ step: m.step }));
      warn.appendChild(a);
    });
    frag.appendChild(warn);
  }
  return frag;
}

function reviewRows() {
  const c = formCache;
  const lbl = (map, v) => (map[v] || v || "—");
  const subtypeLabel = () => {
    const o = (SUBTYPES[c.propertyType] || []).find(([v]) => v === c.propertySubType);
    return o ? o[1] : (c.propertySubType || "—");
  };
  const curLabel = () => { const o = CURRENCIES.find(([v]) => v === c.currencyId); return o ? o[1] : c.currencyId; };
  return [
    ["Name", c.propertyName],
    ["Seller type", lbl(LOOKUPS.sellerType, c.sellerType)],
    ["Type", `${lbl(LOOKUPS.propertyType, c.propertyType)} / ${subtypeLabel()}`],
    ["Auction", lbl({ "1": "Bidding Auction", "3": "Make An Offer" }, c.auction_type)],
    ["Currency", curLabel()],
    ["Starting bid", c.auction_type === "1" ? c.start_bid : "—"],
    ["Address", c.propertyAddress],
    ["City id", c.propertyCity],
    ["Images", String((c.images || []).length)],
    ["Documents", String((c.docs || []).length)],
  ];
}

// ── Nav (Back / Next / Create) — Next is soft (always advances) ──────────────

function renderNav(step, def, submitting) {
  const bar = document.createElement("div");
  bar.className = "flex items-center justify-between pt-3 border-t border-ink-100";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "rounded-lg px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50 transition disabled:opacity-40 disabled:cursor-not-allowed";
  back.textContent = "Back";
  back.disabled = step === 0 || submitting;
  back.addEventListener("click", () => setProperty({ step: step - 1, error: null }));
  bar.appendChild(back);

  if (def.review) {
    const create = document.createElement("button");
    create.type = "button";
    create.disabled = !!submitting;
    create.className = "inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
    create.innerHTML = submitting
      ? `<svg class="icon-spin" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312z" clip-rule="evenodd"/></svg><span>${editId ? "Updating…" : "Creating…"}</span>`
      : `<span>${editId ? "Update listing" : "Create property"}</span>`;
    create.addEventListener("click", () => { if (!submitting) handleSubmit(); });
    bar.appendChild(create);
  } else {
    const next = document.createElement("button");
    next.type = "button";
    next.disabled = !!submitting;
    next.className = "rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-5 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
    next.textContent = "Next";
    next.addEventListener("click", () => setProperty({ step: step + 1, error: null }));  // soft
    bar.appendChild(next);
  }
  return bar;
}

// ── Validation (used for stepper colours + the submit gate) ──────────────────

function stepValid(def) {
  const req = def.required.filter((f) => !f.cond || f.cond(formCache));
  return req.every((f) => {
    const v = formCache[f.name];
    return v != null && String(v).trim() !== "";
  });
}

function clampStep(s) {
  const n = Number.isInteger(s) ? s : 0;
  return Math.max(0, Math.min(STEPS.length - 1, n));
}

// ── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit() {
  const fd = new FormData();
  for (const [k, v] of Object.entries(formCache)) {
    if (k === "docs") continue;          // files appended below
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") fd.append(k, s);
  }
  // belmazad expects a plain-text mirror of the (now rich-HTML) description.
  if (formCache.propertyDescription) fd.append("cleanPropertyDescription", stripHtml(formCache.propertyDescription));
  for (const file of formCache.docs || []) fd.append("docs", file, file.name);

  // Gallery → new-image parts (in display order) + edit reconciliation tokens.
  const newItems = gallery.filter((g) => g.kind === "new");
  newItems.forEach((g) => fd.append("images", g.file, g.file.name));
  if (editId) {
    fd.set("propertyId", editId);                            // → Worker UPDATE path
    fd.append("originalImages", JSON.stringify(originalImages));
    let ni = 0;
    const order = gallery.map((g) => (g.kind === "existing" ? g.filename : `__new__${ni++}`));
    fd.append("imageOrder", JSON.stringify(order));
  }

  setProperty({ submitting: true, result: null, error: null });
  let resp;
  try {
    resp = await createAdminProperty(fd);
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      setProperty({ submitting: false, error: { kind: "auth", message: "Your session expired. Reload the page and sign in again." } });
      return;
    }
    setProperty({ submitting: false, error: { kind: "network", message: String((e && e.message) || e) } });
    return;
  }

  const data = resp.data || {};
  if (resp.ok && (data.status === "ok" || data.status === "partial")) {
    setProperty({ submitting: false, result: data, error: null });
    if (data.status === "ok") {
      if (editId) hydrateEdit(editId, { keepResult: true });   // refresh from saved state
      else resetWizard();
    }
    return;
  }
  const hasDiagnostics = data.upstreamStatus != null || data.upstreamPreview != null ||
                         data.upstreamLocation != null || data.parsedShape != null;
  setProperty({
    submitting: false,
    result: null,
    error: {
      kind: data.status || "error",
      message: data.error || `Request failed (HTTP ${resp.status})`,
      missing: data.missing,
      diagnostics: hasDiagnostics ? {
        upstreamStatus: data.upstreamStatus,
        upstreamLocation: data.upstreamLocation,
        upstreamPreview: data.upstreamPreview,
        parsedShape: data.parsedShape,
      } : null,
    },
  });
}

// ── Banners (mirror admin.js shapes) ─────────────────────────────────────────

function renderResultBanner(result) {
  const isPartial = result.status === "partial";
  const bg = isPartial
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-insight-50 border-insight-100 text-insight-700";
  const wrap = document.createElement("div");
  wrap.className = `rounded-2xl border ${bg} p-4 space-y-1`;
  const isUpdate = result.mode === "update";
  const verb = isUpdate ? "updated" : "created";
  const head = document.createElement("div");
  head.className = "text-sm font-semibold";
  head.textContent = `Property ${verb}${isPartial ? " — partial" : ""}`;
  wrap.appendChild(head);
  const detail = document.createElement("div");
  detail.className = "text-sm";
  const id = result.newPropertyId || result.propertyId;
  const im = result.images || {};
  const bits = [];
  if (im.uploaded) bits.push(`${im.uploaded} image${im.uploaded === 1 ? "" : "s"} uploaded`);
  if (im.deleted) bits.push(`${im.deleted} removed`);
  if (im.reordered) bits.push("reordered");
  if (im.failed) bits.push(`${im.failed} failed`);
  if (im.capped) bits.push("reorder skipped (too many images)");
  const imgNote = bits.length ? ` ${bits.join(", ")}.` : "";
  detail.textContent = `Listing ${verb}${id ? ` (id ${id})` : ""}.${imgNote}`;
  wrap.appendChild(detail);
  const actions = document.createElement("div");
  actions.className = "flex items-center gap-3 pt-1";
  if (id) {
    const view = document.createElement("a");
    view.href = `#/property/${id}`;
    view.className = "text-xs font-semibold underline underline-offset-2 hover:opacity-80";
    view.textContent = "View listing";
    actions.appendChild(view);
  }
  if (!isUpdate) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "text-xs font-semibold underline underline-offset-2 hover:opacity-80";
    again.textContent = "Create another";
    again.addEventListener("click", () => { resetWizard(); setProperty({ step: 0, result: null, error: null }); });
    actions.appendChild(again);
  } else {
    const list = document.createElement("a");
    list.href = "#/cms/properties";
    list.className = "text-xs font-semibold underline underline-offset-2 hover:opacity-80";
    list.textContent = "Back to properties";
    actions.appendChild(list);
  }
  wrap.appendChild(actions);
  return wrap;
}

function renderErrorBanner(error) {
  const wrap = document.createElement("div");
  wrap.className = "rounded-2xl border border-urgent-100 bg-urgent-50 text-urgent-600 p-4 space-y-1";
  const head = document.createElement("div");
  head.className = "text-sm font-semibold";
  head.textContent = error.kind === "validation" ? "Couldn't create the listing"
    : (error.kind === "auth" ? "Sign in required" : "Something went wrong");
  wrap.appendChild(head);
  const detail = document.createElement("div");
  detail.className = "text-sm";
  detail.textContent = error.message || "Please try again.";
  wrap.appendChild(detail);
  if (Array.isArray(error.missing) && error.missing.length) {
    const list = document.createElement("div");
    list.className = "text-xs mt-1";
    list.textContent = `Missing: ${error.missing.join(", ")}`;
    wrap.appendChild(list);
  }
  if (error.diagnostics) {
    const diag = document.createElement("pre");
    diag.className = "text-xs mt-2 p-2 bg-white/60 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-64 ring-1 ring-urgent-100";
    diag.textContent = JSON.stringify(error.diagnostics, null, 2);
    wrap.appendChild(diag);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => setProperty({ error: null }));
  wrap.appendChild(dismiss);
  return wrap;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plain-text mirror of rich-HTML content (for cleanPropertyDescription).
function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}
