import { DEFAULT_SORT } from "./config.js";

const initial = {
  listings: [],
  loading: true,
  error: null,
  errorKind: null,    // "auth" → render sign-in panel; null → generic network error
  lastUpdated: null,
  filters: {
    search: "",
    sellerType: "all",
    auctionType: "all",
    propertyType: "all",
  },
  sort: DEFAULT_SORT,
  route: { name: "listings", params: {} },
  // WORKER-05: populated by fetchWhoAmI() after first listings load.
  userEmail: null,
  isOperator: false,
  // WORKER-06/DETAIL-22: per-property HubSpot report cache, keyed by
  // propertyId → { status, data?, computedAt?, startedAt?, triggeredBy?,
  // cooldownRemainingMs?, polling? }. Hydrated lazily from KV on detail open.
  propertyReports: {},
  // WORKER-08: per-property offers cache, keyed by propertyId →
  // { status, offers?, count?, error? }. Hydrated lazily (one-shot, no
  // polling) from the Worker's READ-ONLY admin scrape on detail open.
  propertyOffers: {},
  // WORKER-10/DETAIL-23: per-property listing entities (real Seller=Checker
  // / Broker=Maker + contact, live Active/InActive, approvals), keyed by
  // propertyId → { status, maker?, checker?, liveStatus?, approvals?, error? }.
  // Lazily hydrated (one-shot) from the Worker's READ-ONLY admin scrape.
  propertyEntities: {},
  // WORKER-11/DETAIL-24: per-property auction registrations ("Bidders List"),
  // keyed by propertyId → { status, bidders?, count?, error? }. Lazily
  // hydrated (one-shot) for Online-Auction properties only.
  propertyBidders: {},
  // DATA-04: buyer/fuser id → { status, name?, email?, phone?, city?, error? }
  // resolve cache (keyed by BUYER id, not propertyId — a buyer recurs across
  // properties). Lazily hydrated to name the highest bidder/offerer.
  buyers: {},
  // ADMIN-02: admin "Create user" page state — current tab + last submit
  // outcome. Form field values live in a module cache in views/admin.js so
  // per-keystroke setState isn't needed (avoids whole-tree re-renders).
  admin: {
    type: "buyer",       // "buyer" | "broker" | "seller" — selected tab
    submitting: false,   // toggled while the POST /admin/user is in-flight
    result: null,        // last successful Worker response (status:"ok" | "partial")
    error: null,         // last error (validation/network) for inline banner
  },
};

let state = initial;
const subscribers = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of subscribers) fn(state);
}

export function patchFilters(patch) {
  setState({ filters: { ...state.filters, ...patch } });
}

// DETAIL-22: shallow-merge a patch into one property's report slice and
// notify subscribers (drives the report-card re-render via subscribe(render)).
export function setPropertyReport(propertyId, patch) {
  const id = String(propertyId);
  const prev = state.propertyReports[id] || {};
  setState({
    propertyReports: { ...state.propertyReports, [id]: { ...prev, ...patch } },
  });
}

// WORKER-08: replace one property's offers slice and notify subscribers
// (drives the offers-card re-render via subscribe(render)).
export function setPropertyOffers(propertyId, slice) {
  const id = String(propertyId);
  setState({
    propertyOffers: { ...state.propertyOffers, [id]: slice },
  });
}

// WORKER-10/DETAIL-23: replace one property's entities slice and notify.
export function setPropertyEntities(propertyId, slice) {
  const id = String(propertyId);
  setState({
    propertyEntities: { ...state.propertyEntities, [id]: slice },
  });
}

// WORKER-11/DETAIL-24: replace one property's bidders slice and notify.
export function setPropertyBidders(propertyId, slice) {
  const id = String(propertyId);
  setState({
    propertyBidders: { ...state.propertyBidders, [id]: slice },
  });
}

// DATA-04: cache one buyer/fuser resolve (keyed by buyer id) and notify.
export function setBuyer(buyerId, slice) {
  const id = String(buyerId);
  setState({
    buyers: { ...state.buyers, [id]: slice },
  });
}

// ADMIN-02: shallow-merge a patch into the admin slice and notify.
export function setAdmin(patch) {
  setState({ admin: { ...state.admin, ...patch } });
}

export function resetFilters() {
  setState({
    filters: { ...initial.filters },
    sort: DEFAULT_SORT,
  });
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
