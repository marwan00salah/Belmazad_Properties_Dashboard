import { setState } from "./state.js";

function parse(hash) {
  const h = (hash || "").replace(/^#\/?/, "");
  if (!h) return { name: "listings", params: {} };
  const [first, second] = h.split("/");
  if (first === "property" && second) return { name: "detail", params: { propertyId: second } };
  return { name: "listings", params: {} };
}

function syncFromHash() {
  setState({ route: parse(location.hash) });
}

export function navigate(path) {
  if (location.hash === path) syncFromHash();
  else location.hash = path;
}

export function initRouter() {
  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
}
