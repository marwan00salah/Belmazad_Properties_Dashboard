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
