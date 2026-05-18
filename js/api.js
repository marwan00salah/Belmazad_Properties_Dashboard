import { WORKER_URL } from "./config.js";

// GEN-01: tagged error thrown when fetch is blocked because the user has no
// Cloudflare Access session (browser CORS-blocks the 302 to the login page,
// surfacing as a TypeError from fetch). The listings view renders a friendly
// sign-in panel for this kind, not the generic "Couldn't reach the server".
export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthRequiredError";
  }
}

export async function fetchListings({ page } = {}) {
  const url = new URL(WORKER_URL);
  if (page != null) url.searchParams.set("page", String(page));

  let res;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      // Cloudflare Access (see WORKER-02) sits in front of the Worker. The
      // browser must send the CF Access session cookie or the request 302s
      // to the login page. Pair with credentialed CORS on the Worker.
      credentials: "include",
    });
  } catch {
    // fetch() rejected — almost always because CF Access blocked the
    // cross-origin redirect to cloudflareaccess.com. Worst case (genuinely
    // offline) the user sees the sign-in panel; the Retry button still
    // gives them the same outcome.
    throw new AuthRequiredError();
  }
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const json = await res.json();

  const list = Array.isArray(json.propertyList) ? json.propertyList : [];
  return { listings: list, pagnation: json.pagnation ?? null };
}

// WORKER-05: identity probe — tells the dashboard whether the current CF Access
// user is on the operator allow-list. Used to conditionally render the
// Initiate-auction button. Server-side checks on /auction/initiate are the
// real gate; this is cosmetic.
export async function fetchWhoAmI() {
  try {
    const res = await fetch(new URL("whoami", WORKER_URL).toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "include",
    });
    if (!res.ok) return { email: null, operator: false };
    const json = await res.json();
    return { email: json.email || null, operator: !!json.operator };
  } catch {
    return { email: null, operator: false };
  }
}

// WORKER-05: operator-only proxy to the buyer-pipeline auction initiate
// endpoint. Always returns { ok, status, data } — never throws — so the
// modal's click handler can always render either the success payload or
// an inline error without dealing with promise rejection.
export async function initiateAuction({ property_id, auction_start_date }) {
  let res;
  try {
    res = await fetch(new URL("auction/initiate", WORKER_URL).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "include",
      body: JSON.stringify({ property_id, auction_start_date }),
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: "Network error — couldn't reach the worker. Check CORS / CF Access." } };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

// WORKER-07: existence probe for the terms-booklet PDF. The Worker side is
// scrape-only (no belmazad.com login). Fail-soft + fail-closed: any error →
// not available, so the Booklet tile is simply not rendered (matches the
// "hide when absent" UX). Never throws.
export async function probeBooklet(propertyId) {
  try {
    const res = await fetch(
      new URL(`booklet?id=${encodeURIComponent(propertyId)}&probe=1`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.available;
  } catch {
    return false;
  }
}

// WORKER-06: read the cached per-property HubSpot report from the Worker
// (pure KV read — never triggers n8n). Fail-soft like fetchWhoAmI: returns
// a status envelope, never throws, never hijacks the listings sign-in panel
// (the report card renders its own inline auth message).
export async function fetchPropertyReport(propertyId) {
  let res;
  try {
    res = await fetch(
      new URL(`hubspot/report?id=${encodeURIComponent(propertyId)}`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { status: "error", error: data?.error || `Request failed (${res.status})` };
  }
  return data || { status: "empty" };
}

// WORKER-06: ask the Worker to (maybe) trigger an n8n recompute. The Worker
// enforces the global per-property cooldown + in-progress de-dupe, so the
// response may be "running", a cooldown'd "ready", or "error". Never throws.
export async function triggerPropertyReportRefresh(propertyId) {
  let res;
  try {
    res = await fetch(new URL("hubspot/refresh", WORKER_URL).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "include",
      body: JSON.stringify({ property_id: String(propertyId) }),
    });
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (data && typeof data === "object") return data;
  return { status: "error", error: `Request failed (${res?.status ?? 0})` };
}

// WORKER-08: read the per-property offers list from the Worker. The Worker
// side is a READ-ONLY admin scrape — it never mutates anything upstream.
// Fail-soft like fetchPropertyReport: returns a status envelope, never throws,
// and renders its own inline auth/error message instead of hijacking the
// listings sign-in panel.
export async function fetchPropertyOffers(propertyId) {
  let res;
  try {
    res = await fetch(
      new URL(`offers?id=${encodeURIComponent(propertyId)}`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { status: "error", error: data?.error || `Request failed (${res.status})` };
  }
  return data || { status: "empty" };
}

// WORKER-10: read the per-property listing entities (real Seller=Checker /
// Broker=Maker + contact, live Active/InActive, approvals) from the Worker's
// READ-ONLY admin scrape. Fail-soft like fetchPropertyOffers — never throws,
// renders its own inline state instead of hijacking the sign-in panel.
export async function fetchPropertyEntities(propertyId) {
  let res;
  try {
    res = await fetch(
      new URL(`entities?id=${encodeURIComponent(propertyId)}`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { status: "error", error: data?.error || `Request failed (${res.status})` };
  }
  return data || { status: "empty" };
}

// WORKER-11: read the per-property auction registrations ("Bidders List")
// from the Worker's READ-ONLY admin scrape. Online-Auction properties only;
// fail-soft like fetchPropertyOffers.
export async function fetchPropertyBidders(propertyId) {
  let res;
  try {
    res = await fetch(
      new URL(`bidders?id=${encodeURIComponent(propertyId)}`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { status: "error", error: data?.error || `Request failed (${res.status})` };
  }
  return data || { status: "empty" };
}

// DATA-04: resolve a buyer/fuser id → name (+ contact) via the Worker's
// READ-ONLY /admin/fuser/edit scrape. Used to name the highest bidder
// (Online-Auction) / highest offerer (Make-An-Offer). Fail-soft.
export async function fetchBuyer(buyerId) {
  let res;
  try {
    res = await fetch(
      new URL(`buyer?id=${encodeURIComponent(buyerId)}`, WORKER_URL).toString(),
      { method: "GET", headers: { "Accept": "application/json" }, credentials: "include" },
    );
  } catch {
    return { status: "auth_error" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { status: "error", error: data?.error || `Request failed (${res.status})` };
  }
  return data || { status: "empty" };
}

// Probe to see whether the API actually paginates. Called once at startup.
// Returns true if page 2 returns a different first listing than page 1.
export async function probePagination(firstListings) {
  try {
    const page2 = await fetchListings({ page: 2 });
    if (!page2.listings.length) return false;
    const id1 = firstListings[0]?.propertyId;
    const id2 = page2.listings[0]?.propertyId;
    return id1 && id2 && id1 !== id2;
  } catch {
    return false;
  }
}
