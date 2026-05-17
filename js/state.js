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
