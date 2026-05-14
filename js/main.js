import { fetchListings, AuthRequiredError, fetchWhoAmI } from "./api.js";
import { getState, setState, subscribe } from "./state.js";
import { initRouter, navigate } from "./router.js";
import { renderListings } from "./views/listings.js";
import { renderDetail } from "./views/detail.js";

const app = document.getElementById("app");

function renderHeader() {
  const { loading, lastUpdated, error } = getState();
  const header = document.createElement("header");
  header.className = "sticky top-0 z-30 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-ink-200/80";
  const inner = document.createElement("div");
  inner.className = "mx-auto w-full max-w-7xl px-4 md:px-6 py-3 flex items-center justify-between gap-3";

  const brand = document.createElement("a");
  brand.href = "#/";
  brand.className = "flex items-center gap-2 font-semibold text-ink-900 hover:text-ink-700 transition";
  brand.innerHTML = `
    <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-700 text-white text-sm font-bold">B</span>
    <span>Belmazad <span class="text-ink-400 font-normal">— Properties</span></span>`;

  const right = document.createElement("div");
  right.className = "flex items-center gap-3";

  const stamp = document.createElement("span");
  stamp.className = "hidden md:inline text-xs text-ink-500 tabular-nums";
  stamp.textContent = lastUpdated
    ? `Updated ${relativeFromNow(lastUpdated)}`
    : (error ? "Update failed" : (loading ? "Loading…" : "Not loaded"));

  const btn = document.createElement("button");
  btn.className = "inline-flex items-center gap-2 rounded-lg bg-white hover:bg-ink-50 text-ink-800 ring-1 ring-ink-200 px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
  btn.innerHTML = `
    <svg class="${loading ? "icon-spin" : ""}" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312zM3.96 13.5a6.5 6.5 0 0011.66-4.27.75.75 0 111.484.236A8 8 0 013.18 14.93v.82a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5H3.96z" clip-rule="evenodd"/>
    </svg>
    <span>${loading ? "Refreshing" : "Refresh"}</span>`;
  btn.disabled = !!loading;
  btn.addEventListener("click", () => refresh());

  right.append(stamp, btn);
  inner.append(brand, right);
  header.appendChild(inner);
  return header;
}

function relativeFromNow(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleString();
}

// Tear down old card subscriptions before removing the tree
function teardown(node) {
  if (!node) return;
  if (node.__cleanup) try { node.__cleanup(); } catch {}
  for (const child of node.children) teardown(child);
}

function render() {
  const { route } = getState();

  // Preserve focus for the search input across re-renders
  const focused = document.activeElement;
  const restoreSearchFocus = focused && focused.id === "filter-search";
  const cursorAt = restoreSearchFocus ? focused.selectionStart : null;

  // Tear down previous tree
  while (app.firstChild) {
    teardown(app.firstChild);
    app.removeChild(app.firstChild);
  }

  app.appendChild(renderHeader());

  if (route.name === "detail") {
    app.appendChild(renderDetail(route.params.propertyId));
  } else {
    app.appendChild(renderListings());
  }

  if (restoreSearchFocus) {
    const next = document.getElementById("filter-search");
    if (next) {
      next.focus();
      if (cursorAt != null) {
        try { next.setSelectionRange(cursorAt, cursorAt); } catch {}
      }
    }
  }
}

async function refresh() {
  setState({ loading: true, error: null, errorKind: null });
  try {
    const { listings } = await fetchListings();
    setState({ listings, loading: false, lastUpdated: Date.now() });
    // WORKER-05: identity probe — runs after a successful listings fetch so
    // we know the CF Access session is alive. Result decides whether the
    // Initiate-auction button renders in the detail view.
    if (getState().userEmail == null) {
      fetchWhoAmI().then(({ email, operator }) => {
        setState({ userEmail: email, isOperator: operator });
      });
    }
  } catch (err) {
    setState({
      loading: false,
      error: err?.message || "Network error",
      errorKind: err instanceof AuthRequiredError ? "auth" : null,
    });
  }
}

// Re-render whenever state changes
subscribe(render);

// Bootstrap
initRouter();
window.addEventListener("app:refresh", refresh);
window.scrollTo({ top: 0 });
refresh();
