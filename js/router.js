import { setState } from "./state.js";

function parse(hash) {
  const h = (hash || "").replace(/^#\/?/, "");
  // New URL plan (2026-05-20):
  //   #/                      → landing (welcome + actions; was #/admin)
  //   #/properties            → listings (was #/)
  //   #/property/:id          → detail (unchanged)
  //   #/cms/create-user       → create-user form (was #/admin/create-user)
  // The old #/admin / #/admin/create-user aliases stay for backward-compat
  // so old bookmarks don't 404 — they just resolve to the same routes.
  if (!h) return { name: "landing", params: {} };
  const [first, second] = h.split("/");
  if (first === "property" && second) return { name: "detail", params: { propertyId: second } };
  if (first === "properties") return { name: "listings", params: {} };
  if (first === "cms" && second === "create-user") return { name: "admin-create-user", params: {} };
  if (first === "admin") {
    if (second === "create-user") return { name: "admin-create-user", params: {} };  // alias
    return { name: "landing", params: {} };                                            // alias
  }
  // Fallback: anything we don't recognise lands on the landing page.
  return { name: "landing", params: {} };
}

function syncFromHash() {
  setState({ route: parse(location.hash) });
  // Reset scroll on every navigation so a previously-scrolled view (e.g. a
  // long detail page) doesn't leak its scroll position into a short one
  // (e.g. the admin landing, which is exactly viewport-height).
  window.scrollTo({ top: 0 });
}

export function navigate(path) {
  if (location.hash === path) syncFromHash();
  else location.hash = path;
}

export function initRouter() {
  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
}
