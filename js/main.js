import { fetchListings, AuthRequiredError, fetchWhoAmI } from "./api.js";
import { getState, setState, subscribe } from "./state.js";
import { initRouter, navigate } from "./router.js";
import { renderListings } from "./views/listings.js";
import { renderDetail } from "./views/detail.js";
import { renderAdmin } from "./views/admin.js";
import { renderAiAgents } from "./views/ai-agents.js";
import { renderSignInPanel } from "./components/signInPanel.js";
import { PARTICLES_CONFIG, destroyParticles } from "./utils/particles.js";
import { WORKER_URL } from "./config.js";

const app = document.getElementById("app");

function renderHeader() {
  const { loading, lastUpdated, error, userEmail, route } = getState();
  // Route classification for header active states. With the 2026-05-20 URL
  // restructure, "/" is the landing (home), "/properties" is listings.
  // AGENT-07: the AI Agents area gets its own tab; both index and per-agent
  // routes activate it.
  const onListings = route?.name === "listings";
  const onAiAgents = route?.name === "ai-agents-index" || route?.name === "ai-agent";
  const header = document.createElement("header");
  header.className = "sticky top-0 z-30 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-ink-200/80 shadow-sm";
  const inner = document.createElement("div");
  inner.className = "w-full px-4 md:px-6 py-3 flex items-center justify-between gap-3";

  const left = document.createElement("div");
  left.className = "flex items-center gap-7";

  const brand = document.createElement("a");
  brand.href = "#/";
  brand.className = "text-3xl font-extrabold tracking-tight text-ink-900 hover:text-ink-700 transition";
  brand.textContent = "Belmazad";

  const nav = document.createElement("nav");
  nav.className = "hidden sm:flex items-center gap-6";
  // Properties + AI Agents tabs. The brand link is the home/landing
  // anchor; explicit "Admin"/"Home" tabs are redundant with it.
  nav.append(
    makeHeaderTab("Properties", "#/properties", onListings),
    makeHeaderTab("AI Agents", "#/ai-agents", onAiAgents),
  );

  left.append(brand, nav);

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

  if (userEmail) {
    const userBox = document.createElement("div");
    userBox.className = "hidden sm:flex items-center gap-2";
    const chip = document.createElement("span");
    chip.className = "text-xs font-semibold text-ink-500 bg-ink-100 px-2.5 py-1 rounded-lg max-w-[16rem] truncate";
    chip.textContent = userEmail;
    chip.title = userEmail;
    const avatar = document.createElement("span");
    avatar.className = "inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold shrink-0";
    avatar.textContent = initialsFromEmail(userEmail);
    avatar.setAttribute("aria-hidden", "true");
    const signOut = document.createElement("a");
    signOut.href = `${WORKER_URL}cdn-cgi/access/logout`;
    signOut.title = "Sign out";
    signOut.setAttribute("aria-label", "Sign out");
    signOut.className = "inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-400 hover:text-urgent-600 hover:bg-ink-100 transition";
    signOut.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h6a1 1 0 110 2H5v10h5a1 1 0 110 2H4a1 1 0 01-1-1V4zm10.293 2.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H9a1 1 0 110-2h5.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
    userBox.append(chip, avatar, signOut);
    right.append(stamp, btn, userBox);
  } else {
    right.append(stamp, btn);
  }

  inner.append(left, right);
  header.appendChild(inner);
  return header;
}

// ADMIN-02: header tab factory — active gets the brand-600 underline (matches
// the pre-ADMIN Properties styling); inactive gets a muted ink-500 hover.
function makeHeaderTab(label, href, active) {
  const a = document.createElement("a");
  a.href = href;
  a.className = active
    ? "relative text-sm font-semibold text-brand-600 hover:text-brand-700 transition"
    : "relative text-sm font-semibold text-ink-500 hover:text-ink-800 transition";
  a.innerHTML = active
    ? `${label}<span class="absolute left-0 right-0 -bottom-3 h-0.5 bg-brand-600"></span>`
    : label;
  return a;
}

function initialsFromEmail(email) {
  const local = String(email || "").split("@")[0] || "";
  const parts = local.split(/[.\-_+]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2));
  return letters.toUpperCase() || "?";
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

// AGENT-07 polish (2026-05-22): the indigo-dotted particles background
// belongs to specific routes (admin landing + AI Agents area), but the
// particles CANVAS must persist across the full-tree teardown + re-mount
// that fires on every setState — otherwise sending a chat message destroys
// + re-inits the canvas, producing visible thrash ("background goes
// crazy"). Solution: mount the canvas at the body level, outside the
// render tree, and sync it only when the route NAME actually changes.
const PARTICLES_ROUTES = new Set(["landing", "ai-agents-index", "ai-agent"]);
let _particlesNode = null;
let _particlesRouteName = null;  // route name at mount time

function syncBackground(routeName) {
  if (_particlesRouteName === routeName) return;  // no-op
  const wants = PARTICLES_ROUTES.has(routeName);
  if (wants && !_particlesNode) {
    const div = document.createElement("div");
    div.id = "particles-bg";
    // z-index:-1 keeps particles BEHIND #app's normal-flow content
    // (which is `position:static`, painted in stacking pass 3) — putting
    // it in pass 2 (negative-z-index positioned descendants). Body's
    // bg-ink-50 still paints first (pass 1) so the dots show against the
    // dashboard's regular page colour.
    div.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;";
    document.body.insertBefore(div, document.body.firstChild);
    _particlesNode = div;
    // rAF so the div is in the DOM tree before particlesJS reads it.
    requestAnimationFrame(() => {
      if (typeof window.particlesJS === "function") {
        try { window.particlesJS("particles-bg", PARTICLES_CONFIG); }
        catch (_) { /* particles.js init can throw on edge cases — ignore */ }
      }
    });
  } else if (!wants && _particlesNode) {
    destroyParticles();
    _particlesNode.remove();
    _particlesNode = null;
  }
  _particlesRouteName = routeName;
}

function render() {
  const { route } = getState();
  // Sync the persistent body-level particles BEFORE the per-render tear-
  // down. This is the only state-derived side effect that has to escape
  // the render tree's lifecycle.
  syncBackground(route?.name);

  // Preserve focus across re-renders for any focused form field with an id —
  // covers the listings `#filter-search` debounced search box AND every
  // admin form input (ADMIN-02). The cursor position is preserved when the
  // element supports `selectionStart` (input[type=text|email|tel|search],
  // textarea); select-one inputs don't, so we just refocus.
  const focused = document.activeElement;
  const focusedIsFormField = focused && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName || "");
  const focusedId = focusedIsFormField && focused.id ? focused.id : null;
  const cursorAt = focusedId && typeof focused.selectionStart === "number" ? focused.selectionStart : null;

  // Tear down previous tree
  while (app.firstChild) {
    teardown(app.firstChild);
    app.removeChild(app.firstChild);
  }

  app.appendChild(renderHeader());

  // GEN-03: universal auth gate — when refresh() flagged
  // `errorKind:"auth"` (CF Access cookie missing / expired), render the
  // shared sign-in panel and short-circuit the route dispatch. Was
  // previously gated inside listings.js only, so non-listings routes
  // (landing, admin, ai-agents) rendered their normal shell with no
  // hint to the user that they needed to sign in.
  const { errorKind } = getState();
  if (errorKind === "auth") {
    app.appendChild(renderSignInPanel());
  } else if (route.name === "detail") {
    app.appendChild(renderDetail(route.params.propertyId));
  } else if (route.name === "landing" || route.name === "admin-create-user") {
    app.appendChild(renderAdmin());
  } else if (route.name === "ai-agents-index" || route.name === "ai-agent") {
    // AGENT-07: AI Agents area — index grid or per-agent chat surface.
    app.appendChild(renderAiAgents());
  } else {
    // listings (or any other unrecognised route fallback)
    app.appendChild(renderListings());
  }

  if (focusedId) {
    const next = document.getElementById(focusedId);
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
