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
