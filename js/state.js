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
  // ADD-PROPERTY: staged "Create property" wizard state. `step` is the
  // 0-based wizard step index; field VALUES live in a module cache inside
  // views/create-property.js (same pattern as admin.js — avoids per-keystroke
  // setState). Only step/submitting/result/error drive re-renders.
  property: {
    step: 0,             // current wizard step (0-based)
    submitting: false,   // toggled while POST /admin/property is in-flight
    result: null,        // last successful Worker response (newPropertyId, images…)
    error: null,         // last error (validation/network) for inline banner
  },
  // AGENT-04: per-agent chat sessions, keyed by agentId →
  //   { sessionId, mode, messages:[{role,text,ts}], sending, error }
  // UNLIKE every other slice in this file, this one is **persisted to
  // localStorage** under key `belmazad:agent:<id>` (sessionId/mode/messages
  // only — sending/error stay volatile). First deliberate break of the
  // in-memory-only pattern, justified by the v1.5 spec: refresh must keep
  // the conversation. Hydrated lazily on first ensureAgent() call so
  // agents never opened in this session never touch storage.
  agents: {},
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

// ADD-PROPERTY: shallow-merge a patch into the property-wizard slice and notify.
export function setProperty(patch) {
  setState({ property: { ...state.property, ...patch } });
}

// ── AGENT-04: per-agent chat session helpers ──────────────────────────────
//
// Each agentId owns its own localStorage key (`belmazad:agent:<id>`) so
// wiping one chat doesn't affect another. The persisted shape is a strict
// subset of the in-memory slice — only sessionId / mode / messages survive
// across reloads; `sending` and `error` are volatile (a tab close mid-
// request would otherwise leave `sending:true` stuck forever).
//
// Read-modify-write pattern (single setState per setter):
//   1. `_hydrateAgent(id)` returns the live slice or the persisted one or
//      a fresh-minted one — without mutating state.
//   2. Each setter computes the next slice, commits via setState, and
//      writes through to localStorage.
//
// Quota / private-mode storage failures are silently swallowed — a chat
// must never break because the user is in incognito.

const AGENT_STORAGE_PREFIX = "belmazad:agent:";

// Opaque sessionId — n8n's WindowBufferMemory just uses it as a memory
// key. crypto.randomUUID() everywhere we'll deploy; the fallback covers
// the long-tail of older browsers that lack it.
function _mintAgentSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function _loadAgent(agentId) {
  try {
    const raw = localStorage.getItem(AGENT_STORAGE_PREFIX + agentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      sessionId: parsed.sessionId || _mintAgentSessionId(),
      mode: parsed.mode || null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      sending: false,
      error: null,
    };
  } catch { return null; }
}

function _persistAgent(agentId, slice) {
  try {
    localStorage.setItem(AGENT_STORAGE_PREFIX + agentId, JSON.stringify({
      sessionId: slice.sessionId,
      mode: slice.mode,
      messages: slice.messages,
    }));
  } catch { /* best-effort: quota / private-mode / disabled storage */ }
}

// Read-only hydrate: live → persisted → freshly minted. Used by every
// setter so they never need to handle a missing slice.
function _hydrateAgent(agentId) {
  if (state.agents[agentId]) return state.agents[agentId];
  return _loadAgent(agentId) || {
    sessionId: _mintAgentSessionId(),
    mode: null,
    messages: [],
    sending: false,
    error: null,
  };
}

// Called by the chat view DURING render (not before — the route mount
// happens inside main.js's render loop). Returns the hydrated slice
// synchronously so the in-progress render can paint with it, but the
// state commit is deferred to a microtask: a synchronous setState here
// would fire subscribe(render) recursively while the outer render is
// still mid-paint, producing duplicate tree mounts (AGENT-07 polish).
// localStorage persist stays synchronous so any mid-render reads of
// _hydrateAgent (e.g. from a setter that fires before the microtask) see
// the same sessionId — without this, two callers in the same render tick
// could mint different sessionIds.
export function ensureAgent(agentId) {
  const live = state.agents[agentId];
  if (live) return live;
  const slice = _hydrateAgent(agentId);
  _persistAgent(agentId, slice);
  queueMicrotask(() => {
    // Guard against a concurrent setter (setAgentMode etc.) having
    // already committed the slice during this tick — don't overwrite it.
    if (!state.agents[agentId]) {
      setState({ agents: { ...state.agents, [agentId]: slice } });
    }
  });
  return slice;
}

export function setAgentMode(agentId, mode) {
  const prev = _hydrateAgent(agentId);
  const next = { ...prev, mode };
  setState({ agents: { ...state.agents, [agentId]: next } });
  _persistAgent(agentId, next);
}

// msg shape: { role: "user"|"agent", text: string, ts: number }
export function appendAgentMessage(agentId, msg) {
  const prev = _hydrateAgent(agentId);
  const next = { ...prev, messages: [...prev.messages, msg] };
  setState({ agents: { ...state.agents, [agentId]: next } });
  _persistAgent(agentId, next);
}

// Mutate the last message in place — the typing-indicator → reply swap
// hangs off this so the bubble doesn't double-render. No-op if there
// are no messages yet.
export function updateAgentLastMessage(agentId, patch) {
  const prev = state.agents[agentId];
  if (!prev || !prev.messages.length) return;
  const lastIdx = prev.messages.length - 1;
  const newLast = { ...prev.messages[lastIdx], ...patch };
  const next = { ...prev, messages: [...prev.messages.slice(0, lastIdx), newLast] };
  setState({ agents: { ...state.agents, [agentId]: next } });
  _persistAgent(agentId, next);
}

// Volatile — NOT persisted. `sending:true` surviving a tab close would
// pin the UI in a stuck-loading state forever.
export function setAgentSending(agentId, sending, error = null) {
  const prev = _hydrateAgent(agentId);
  const next = { ...prev, sending, error };
  setState({ agents: { ...state.agents, [agentId]: next } });
}

// Wipe the slice and mint a fresh sessionId. Triggered by the "New
// conversation" button in the chat header (AGENT-07) after a confirm().
export function clearAgent(agentId) {
  const fresh = {
    sessionId: _mintAgentSessionId(),
    mode: null,
    messages: [],
    sending: false,
    error: null,
  };
  setState({ agents: { ...state.agents, [agentId]: fresh } });
  _persistAgent(agentId, fresh);
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
