// ADMIN-02: dashboard "Admin" page — create buyer/broker/seller accounts
// directly on belmazad.com via the Worker (ADMIN-01) with parallel HubSpot
// upsert (ADMIN-04). v1 is Individual-only; Company/Institution accounts
// stay editable in the admin site itself.
//
// Architecture:
//   - Module-scoped `formCache` holds per-tab field values across re-renders
//     without per-keystroke setState (which would re-render the whole tree).
//     setState fires only on tab switch and submit; main.js's generalized
//     focus-restore keeps the cursor anchored if anything else re-renders.
//   - Each input has a stable id (`admin-{type}-{field}`) for the restore.
//   - On submit, we call createAdminUser(); the response goes into
//     state.admin.result (full success or partial), or state.admin.error
//     (validation / network / ambiguous). Banners read from there.
//   - belmazad.com auto-emails the new user with their generated password;
//     we never see/handle credentials.

import { getState, setAdmin } from "../state.js";
import { createAdminUser, AuthRequiredError } from "../api.js";
import { AGENTS } from "../agents.js";

// ── Form-value cache (survives re-renders, separate from state slice) ─────

const formCache = {
  buyer: defaultBuyer(),
  broker: defaultAgent(),
  seller: defaultAgent(),
};

function defaultBuyer() {
  return {
    firstName: "", lastName: "", email: "",
    country_id: "20",                // Egypt — overridable in the dropdown
    cellNumber: "",
    userAddress: "", city: "",
    nationalIdNumber: "",
    looking_property: "0",           // Residential — server-required, sane default
  };
}
function defaultAgent() {
  return {
    firstName: "", lastName: "", email: "",
    country_id: "20",
    officeNumber: "",
    userAddress: "", city: "",
    nationalIdNumber: "",
    // Server-side required for broker/seller (discovered 2026-05-20 — the
    // agent endpoint silently rejects with {error: null, errorMsg: null}
    // when these are absent / empty, even though JS .validate() doesn't
    // list them). Defaults match the browser form's pre-filled values when
    // an operator submits without touching the dropdowns. ADMIN-02 follow-up
    // can surface these in the form for operator override.
    gender: "1",            // Male — matches the form's default-checked radio
    countryCode: "EGY",     // Country of residence — Egypt
    stateCode: "3",         // Governorate — Cairo
    selling_property: "5",  // Property type — All Types (most permissive)
  };
}

// Common phone-country dialing codes. The full belmazad form has ~166 options;
// for v1 we expose a curated MENA-first subset (covers the realistic majority
// of admin-created accounts). Add more here later if needed.
const COUNTRY_CODES = [
  ["20",  "Egypt (+20)"],
  ["971", "UAE (+971)"],
  ["966", "Saudi Arabia (+966)"],
  ["965", "Kuwait (+965)"],
  ["974", "Qatar (+974)"],
  ["973", "Bahrain (+973)"],
  ["968", "Oman (+968)"],
  ["962", "Jordan (+962)"],
  ["961", "Lebanon (+961)"],
  ["212", "Morocco (+212)"],
  ["1",   "USA / Canada (+1)"],
  ["44",  "UK (+44)"],
  ["33",  "France (+33)"],
  ["49",  "Germany (+49)"],
];

const LOOKING_PROPERTY = [
  ["0", "Residential"],
  ["1", "Commercial"],
  ["2", "Land"],
  ["3", "Industrial"],
  ["4", "Bulk Sale"],
];

// particles.js config for the #/ landing background. Tuned to the project
// brand palette: indigo dots (#4f46e5 = brand-600) on softer indigo linked
// lines (#a5b4fc = brand-300). Hover-repulse + click-bubble interactivity.
// The library is loaded from CDN in index.html. Editing this config will
// update the live background on the next route-render.
// PARTICLES_CONFIG moved to `js/utils/particles.js` (AGENT-07) so the
// AI Agents view can reuse the same indigo-dotted background as this
// admin landing — keeps the two surfaces visually consistent.

// ── Renderers ─────────────────────────────────────────────────────────────

export function renderAdmin() {
  const { route } = getState();
  if (route?.name === "admin-create-user") return renderCreateUser();
  return renderAdminLanding();
}

// Landing page for #/admin — index of available admin actions. v1 has one
// action ("Create user"), preceded by a "Welcome, {Name}" greeting in the
// same column. Layout is deliberately spare in the German-design idiom:
// heaps of whitespace, a 6-column grid, content parked in cols 2–4 (~16–66%
// from the left) vertically centred, ultra-thin large type for the greeting
// "Welcome,"" / heavy weight for the name. Adding more actions later =
// more <a> entries stacked under the existing nav.
function renderAdminLanding() {
  const { userEmail } = getState();
  const name = nameFromEmail(userEmail);
  const nameReady = !!name;

  // The whole landing waits for the name to resolve, then fades in over
  // 900 ms (welcome + name + every action link together — not staggered).
  // Initial render mounts with opacity-0; once /whoami populates userEmail
  // and we re-render with nameReady=true, a double-rAF flip to opacity-100
  // plays the transition cleanly.
  const root = document.createElement("div");
  // h-[calc(100vh-68px)] hard-locks the landing to exactly the viewport
  // minus the header (~68px per FILT-05's `top-[68px]` sticky-offset
  // contract). With `min-h-` + `flex-1` we were getting 1–2 px of overflow
  // depending on the exact header content height, which made the page
  // technically scrollable. `overflow-hidden` belt-and-braces any future
  // overshoot (e.g. a 72 px line that exceeds its 1/6 row).
  // `relative` so the absolute particles canvas anchors to this container,
  // not to the viewport (or whatever ancestor happens to be positioned).
  root.className = "relative h-[calc(100vh-68px)] grid grid-cols-6 grid-rows-6 transition-opacity duration-[900ms] opacity-0 overflow-hidden";
  // 72px ≈ header height; centres the content below the sticky header.

  // Particles background is now mounted at the body level by main.js's
  // syncBackground() — persists across the full-tree re-mount that fires
  // on every setState. The view used to mount its own canvas here; that
  // was destroying + re-initing on every state change, producing visible
  // thrash. See main.js for the current lifecycle.

  // ── Actions cell (middle row, cols 2–4) ───────────────────────────────
  // `relative z-10` promotes this above the absolute particles canvas —
  // without it, positioned descendants (the particles bg) paint AFTER
  // in-flow grid children per CSS stacking-order spec, which would hide
  // the text behind the animation.
  const actionsCell = document.createElement("div");
  actionsCell.className = "col-start-2 col-span-3 row-start-3 self-center px-4 relative z-10";

  // ── Greeting cell (bottom row, col 1) ─────────────────────────────────
  // "First 1/6 column" = col-start-1 col-span-1. "Bottom 1/3 row" = row-start-3
  // of the 3-row grid. `self-center` centres vertically within the bottom
  // third. 72px text is wider than 1/6 of the viewport — `whitespace-nowrap`
  // + grid's default non-clipping let the lines spill rightward, giving the
  // greeting a "weighted in the corner" feel typical of German modernist
  // layouts. The Name line is indented `ml-16` (4rem ≈ 64px ≈ "2 indents")
  // to the right of "Welcome," for a stepped-paragraph cadence.
  const greetingCell = document.createElement("div");
  greetingCell.className = "col-start-1 col-span-1 row-start-1 self-center px-4 space-y-1 relative z-10";

  const welcome = document.createElement("div");
  welcome.className = "text-7xl font-thin tracking-tight text-ink-900 leading-none whitespace-nowrap";
  welcome.textContent = "Welcome,";
  greetingCell.appendChild(welcome);

  const nameLine = document.createElement("div");
  nameLine.className = "text-7xl font-bold tracking-tight text-ink-900 leading-none whitespace-nowrap ml-16";
  // Non-breaking space when name not yet loaded — reserves the line height
  // so the layout doesn't jump when /whoami populates userEmail.
  nameLine.textContent = name || " ";
  greetingCell.appendChild(nameLine);

  // Action list. 36px is `text-4xl` (2.25rem ≈ 36px). `font-thin` (weight 100)
  // → system fonts will render at their lightest available weight (~200/300).
  // Negative letter-spacing + lowercase nudges the Braun/Vitra/Lufthansa
  // minimalist feel further. Each action shares the same `actionLink()`
  // factory so future actions stay stylistically consistent.
  //
  // Hierarchy (2026-05-21, AGENT-01): three siblings — `ai agents` (NEW
  // expandable parent, AGENT-03/AGENT-07; children sourced from AGENTS
  // registry so adding agent #2 propagates here automatically), `cms`
  // (unchanged expandable parent for `create user`), `live properties`
  // (leaf link to the listings view). Live properties gets pushed down
  // by either expanding group via natural document flow — no overlap.
  // The expand/collapse uses the grid-template-rows 0fr↔1fr trick so the
  // slide animates smoothly even with auto-sized content.
  const nav = document.createElement("nav");
  nav.className = "space-y-4";
  nav.appendChild(buildAiAgentsGroup());
  nav.appendChild(buildCmsGroup());
  nav.appendChild(actionLink("Live properties", "#/properties"));
  actionsCell.appendChild(nav);

  root.appendChild(actionsCell);
  root.appendChild(greetingCell);

  // Fade-in when the name is ready (particles init runs inside
  // mountParticles via its own rAF). Double-rAF for the fade so the
  // browser has applied opacity-0 + computed styles before we swap
  // to opacity-100 (otherwise no transition plays).
  if (nameReady) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("opacity-0");
        root.classList.add("opacity-100");
      });
    });
  }

  // No view-level cleanup needed: particles are managed at the body
  // level by main.js's syncBackground() on route changes.

  return root;
}

// Shared landing-page action factory — keeps every entry visually identical
// (thin 36px lowercase, hover into brand indigo). Add more by calling this
// from renderAdminLanding's nav block.
function actionLink(label, href) {
  const a = document.createElement("a");
  a.href = href;
  a.className = "block text-4xl font-thin tracking-tight text-ink-900 hover:text-brand-600 transition-colors duration-200 lowercase";
  a.textContent = label;
  return a;
}

// ADMIN-07: accordion behavior for the landing nav's click-to-expand groups.
// When one group opens we collapse every other expandable wrap inside the
// same <nav>, so only one submenu is visible at a time — keeps the page
// tidy and avoids `live properties` getting pushed down by two stacks at
// once. Each expandable wrap is marked with the `landing-expand-wrap` class
// so a single DOM query finds all siblings. DOM-scoped (not module-scoped)
// so it stays safe across renderAdminLanding rebuilds — main.js teardown
// drops the old tree and the new wraps register fresh on the next mount.
function collapseSiblingWraps(keepOpen) {
  const nav = keepOpen.closest("nav");
  if (!nav) return;
  nav.querySelectorAll(".landing-expand-wrap").forEach((w) => {
    if (w !== keepOpen) {
      w.classList.remove("grid-rows-[1fr]");
      w.classList.add("grid-rows-[0fr]");
    }
  });
}

// Click-to-expand "cms" group: visually identical to a top-level actionLink
// for the parent, plus a collapsible child container that slides open to
// reveal indented sub-options ("create user" is the only child for v1).
// Expansion uses the CSS grid-template-rows 0fr ↔ 1fr trick so the slide
// transitions cleanly without hard-coding a max-height. Wrapping the
// parent + children in a single div means the outer nav's `space-y-4`
// only applies between the group and `live properties` — so live
// properties gets pushed down by the expanding content with no overlap,
// and no double-gap when collapsed.
function buildCmsGroup() {
  const group = document.createElement("div");

  const parent = document.createElement("button");
  parent.type = "button";
  // Match actionLink() styling exactly (same hover/colour/weight) so the
  // parent reads as a sibling of the other actions — just one that opens
  // a submenu instead of navigating. The `pb-1` (STYLE-08) is preventative:
  // "cms" itself has no descenders, but future parent labels might.
  parent.className = "block text-4xl font-thin tracking-tight text-ink-900 hover:text-brand-600 transition-colors duration-200 lowercase text-left w-full pb-1";
  parent.textContent = "cms";

  // Collapsible row. `grid-rows-[0fr]` collapses the child grid track to
  // zero height; `grid-rows-[1fr]` lets it grow to natural content height.
  // Tailwind arbitrary values handle the literal `0fr`/`1fr` tracks. The
  // `landing-expand-wrap` marker (ADMIN-07) lets collapseSiblingWraps()
  // find every expandable group in the nav so opening one closes the rest.
  const wrap = document.createElement("div");
  wrap.className = "landing-expand-wrap grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-in-out";

  const children = document.createElement("div");
  // overflow-hidden clips the inner content during the 0fr → 1fr transition
  // (otherwise the inner block would render at its full height before the
  // grid track expanded). pt-4 matches the outer space-y-4 cadence so the
  // child appears one full step below the parent when expanded.
  children.className = "overflow-hidden";

  const createUser = actionLink("create user", "#/cms/create-user");
  // ml-16 = two indents (4rem ≈ 64px) — same value as the Welcome → Name
  // indent — visually links the child to its parent. `pb-1` (STYLE-08)
  // gives descenders room inside the `overflow-hidden` wrap below; "create
  // user" has none today but a future child might.
  createUser.classList.add("ml-16", "pt-4", "pb-1");

  children.appendChild(createUser);
  wrap.appendChild(children);

  parent.addEventListener("click", () => {
    const isOpen = wrap.classList.contains("grid-rows-[1fr]");
    // ADMIN-07: only collapse siblings when transitioning closed→open; on
    // a self-toggle to closed there's nothing else to coordinate.
    if (!isOpen) collapseSiblingWraps(wrap);
    wrap.classList.toggle("grid-rows-[0fr]", isOpen);
    wrap.classList.toggle("grid-rows-[1fr]", !isOpen);
  });

  group.appendChild(parent);
  group.appendChild(wrap);
  return group;
}

// AGENT-01: "ai agents" expandable group — structural twin of buildCmsGroup
// above (same 0fr↔1fr grid-template-rows slide, same actionLink styling,
// same ml-16+pt-4 indent). Children are NOT hard-coded — they iterate the
// AGENTS registry (js/agents.js), so adding an agent there propagates here
// automatically without any landing-page edit. Each child links to
// #/ai-agents/<agentId>, which the chat surface (AGENT-07) renders.
function buildAiAgentsGroup() {
  const group = document.createElement("div");

  const parent = document.createElement("button");
  parent.type = "button";
  // `pb-1` (STYLE-08) makes room for the `g` descender in "ai agents" —
  // Tailwind's text-4xl line-height (2.5rem over 2.25rem font-size) is
  // too tight to fit descenders cleanly in font-thin system-ui.
  parent.className = "block text-4xl font-thin tracking-tight text-ink-900 hover:text-brand-600 transition-colors duration-200 lowercase text-left w-full pb-1";
  parent.textContent = "ai agents";

  // `landing-expand-wrap` (ADMIN-07): marker that collapseSiblingWraps()
  // queries to find every expandable group in the nav, so opening this one
  // closes any other open group.
  const wrap = document.createElement("div");
  wrap.className = "landing-expand-wrap grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-in-out";

  const children = document.createElement("div");
  children.className = "overflow-hidden";

  // Iterate the registry. Order follows Object.entries() insertion order,
  // which matches the order agents are declared in js/agents.js — so the
  // canonical agent listing lives there, not here.
  for (const [id, def] of Object.entries(AGENTS)) {
    const link = actionLink(`${def.label.toLowerCase()} agent`, `#/ai-agents/${id}`);
    // `pb-1` (STYLE-08): the trailing "agent" has a `g` descender that the
    // wrap's `overflow-hidden` would otherwise clip; 4 px of padding-bottom
    // keeps the line-height intact while giving the descender room.
    link.classList.add("ml-16", "pt-4", "pb-1");
    children.appendChild(link);
  }

  wrap.appendChild(children);

  parent.addEventListener("click", () => {
    const isOpen = wrap.classList.contains("grid-rows-[1fr]");
    // ADMIN-07: only collapse siblings when transitioning closed→open; on
    // a self-toggle to closed there's nothing else to coordinate.
    if (!isOpen) collapseSiblingWraps(wrap);
    wrap.classList.toggle("grid-rows-[0fr]", isOpen);
    wrap.classList.toggle("grid-rows-[1fr]", !isOpen);
  });

  group.appendChild(parent);
  group.appendChild(wrap);
  return group;
}

// Derive a readable display name from the signed-in user's email. Strips
// digits + special-char-separated tails so "marwan00salah@belmazad.com"
// → "Marwan", "test.user@..." → "Test". Returns "" when no email is
// available (typically during the brief window before /whoami populates).
function nameFromEmail(email) {
  if (!email) return "";
  const local = String(email).split("@")[0] || "";
  const parts = local.split(/[.\-_+]+/).filter(Boolean);
  const raw = (parts[0] || local).split(/[0-9]/)[0];
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// The Create-user form lives at #/cms/create-user — pulled out of the
// landing so the landing stays a clean index.
function renderCreateUser() {
  const { admin } = getState();
  const root = document.createElement("div");
  root.className = "mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8 space-y-6";

  const title = document.createElement("div");
  title.innerHTML = `
    <h1 class="text-3xl font-extrabold tracking-tight text-ink-900">Create user</h1>
    <p class="mt-2 text-sm text-ink-600">Create a buyer, broker, or seller account directly on belmazad.com. The new user receives sign-in details by email from <code class="rounded bg-ink-100 px-1.5 py-0.5 text-xs">noreply@belmazad.com</code>. v1 supports Individual accounts only — Company / Institution accounts stay in the admin site.</p>
  `;
  root.appendChild(title);

  // Tabs
  root.appendChild(renderTabs(admin.type));

  // Banners (above form)
  if (admin.result) root.appendChild(renderResultBanner(admin.result));
  if (admin.error) root.appendChild(renderErrorBanner(admin.error));

  // Form
  root.appendChild(renderForm(admin.type, admin.submitting));

  return root;
}

function renderTabs(currentType) {
  const wrap = document.createElement("div");
  wrap.className = "inline-flex rounded-2xl border border-ink-100 bg-white p-1 shadow-sm";
  for (const [type, label] of [["buyer", "Buyer"], ["broker", "Broker"], ["seller", "Seller"]]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    const active = (currentType === type);
    btn.className = active
      ? "rounded-xl bg-brand-600 text-white px-5 py-2 text-sm font-semibold shadow-sm"
      : "rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-50 px-5 py-2 text-sm font-medium transition";
    btn.addEventListener("click", () => {
      // Switching tabs clears the previous result/error banners — fresh slate
      // per type. Form values per type live in formCache and survive.
      setAdmin({ type, result: null, error: null });
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function renderForm(type, submitting) {
  const card = document.createElement("form");
  card.className = "bg-white rounded-2xl border border-ink-100 shadow-sm p-6 space-y-5";
  card.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!submitting) handleSubmit(type);
  });

  const phoneField = (type === "buyer") ? "cellNumber" : "officeNumber";
  const phoneLabel = (type === "buyer") ? "Mobile number" : "Office phone";

  // Grid: 2-col on sm+ for compact density.
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-4";

  grid.appendChild(textField(type, "firstName", "First name", { required: true }));
  grid.appendChild(textField(type, "lastName",  "Last name",  { required: true }));
  grid.appendChild(textField(type, "email",     "Email",       { required: true, type: "email", placeholder: "name@example.com", colspan: 2 }));

  // Phone row: country_id dropdown + local number text input
  grid.appendChild(selectField(type, "country_id", "Phone country", COUNTRY_CODES, { required: true }));
  grid.appendChild(textField(type, phoneField, phoneLabel, { required: true, inputMode: "numeric", placeholder: "1064398997", help: "Digits only — no + and no leading 0" }));

  grid.appendChild(textField(type, "userAddress", "Address",  { required: true, colspan: 2 }));
  grid.appendChild(textField(type, "city",        "City",     { required: true }));
  grid.appendChild(textField(type, "nationalIdNumber", "National ID", { required: true, inputMode: "numeric", maxlength: 14, help: "14 digits (Egyptian National ID)" }));

  // Buyer-only: what type of property are they looking for (server-required)
  if (type === "buyer") {
    grid.appendChild(selectField(type, "looking_property", "Property interest", LOOKING_PROPERTY, { required: true, colspan: 2 }));
  }

  card.appendChild(grid);

  // Submit row
  const actions = document.createElement("div");
  actions.className = "flex items-center justify-between pt-2 border-t border-ink-100";
  const hint = document.createElement("span");
  hint.className = "text-xs text-ink-500";
  hint.textContent = "Belmazad will email the new user with sign-in details.";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.disabled = !!submitting;
  submit.className = "inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
  submit.innerHTML = submitting
    ? `<svg class="icon-spin" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312z" clip-rule="evenodd"/></svg><span>Creating…</span>`
    : `<span>Create ${labelFor(type)}</span>`;
  actions.append(hint, submit);
  card.appendChild(actions);

  return card;
}

// ── Field factories ───────────────────────────────────────────────────────

function textField(type, name, label, opts = {}) {
  const { required, placeholder, type: inputType, inputMode, maxlength, help, colspan } = opts;
  const cell = document.createElement("div");
  cell.className = `space-y-1.5 ${colspan === 2 ? "sm:col-span-2" : ""}`;
  const lab = document.createElement("label");
  lab.className = "block text-sm font-semibold text-ink-700";
  lab.htmlFor = `admin-${type}-${name}`;
  lab.innerHTML = `${label}${required ? ' <span class="text-urgent-600">*</span>' : ""}`;
  const input = document.createElement("input");
  input.id = `admin-${type}-${name}`;
  input.name = name;
  input.type = inputType || "text";
  if (inputMode) input.inputMode = inputMode;
  if (placeholder) input.placeholder = placeholder;
  if (maxlength) input.maxLength = maxlength;
  if (required) input.required = true;
  input.value = formCache[type][name] || "";
  input.className = "block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition";
  // Update module cache on each keystroke; no setState → no re-render.
  input.addEventListener("input", (e) => {
    formCache[type][name] = e.target.value;
  });
  cell.appendChild(lab);
  cell.appendChild(input);
  if (help) {
    const h = document.createElement("p");
    h.className = "text-xs text-ink-500";
    h.textContent = help;
    cell.appendChild(h);
  }
  return cell;
}

function selectField(type, name, label, options, opts = {}) {
  const { required, colspan } = opts;
  const cell = document.createElement("div");
  cell.className = `space-y-1.5 ${colspan === 2 ? "sm:col-span-2" : ""}`;
  const lab = document.createElement("label");
  lab.className = "block text-sm font-semibold text-ink-700";
  lab.htmlFor = `admin-${type}-${name}`;
  lab.innerHTML = `${label}${required ? ' <span class="text-urgent-600">*</span>' : ""}`;
  const sel = document.createElement("select");
  sel.id = `admin-${type}-${name}`;
  sel.name = name;
  if (required) sel.required = true;
  sel.className = "block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition bg-white";
  const current = formCache[type][name];
  for (const [val, optLabel] of options) {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = optLabel;
    if (String(current) === String(val)) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", (e) => {
    formCache[type][name] = e.target.value;
  });
  cell.appendChild(lab);
  cell.appendChild(sel);
  return cell;
}

// ── Banners ───────────────────────────────────────────────────────────────

function renderResultBanner(result) {
  // result is the Worker response: { status, type, newUserId, createdBy,
  // successMsg, hubspot: { status, contactId, mode, error } }
  const isPartial = result.status === "partial";
  // Custom palette: insight has {50,100,400,500,600,700,900} (no 200); urgent
  // has {50,100,500,600}. Amber is Tailwind default (all shades). Use only
  // defined shades — undefined ones silently produce no rule.
  const bg = isPartial
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-insight-50 border-insight-100 text-insight-700";

  const wrap = document.createElement("div");
  wrap.className = `rounded-2xl border ${bg} p-4 space-y-1`;
  const headLine = document.createElement("div");
  headLine.className = "text-sm font-semibold";
  headLine.textContent = isPartial
    ? "Account created — partial sync"
    : "Account created";
  wrap.appendChild(headLine);

  const detail = document.createElement("div");
  detail.className = "text-sm";
  const newId = result.newUserId ? ` (id ${result.newUserId})` : "";
  detail.innerHTML = `${escapeHtml(result.successMsg || "Customer information successfully saved")}${newId}. The new user has been emailed sign-in details by <code class="rounded bg-white/40 px-1.5 py-0.5 text-xs">noreply@belmazad.com</code>.`;
  wrap.appendChild(detail);

  // HubSpot row (always rendered when we have a hubspot block)
  if (result.hubspot) {
    const hs = document.createElement("div");
    hs.className = "text-xs mt-1";
    if (result.hubspot.status === "ok") {
      hs.innerHTML = `HubSpot contact ${result.hubspot.mode || "synced"}${result.hubspot.contactId ? ` (id ${result.hubspot.contactId})` : ""}${result.hubspot.lifecycleStageSet ? " · lifecycle → MQL" : ""}.`;
    } else if (result.hubspot.status === "skipped") {
      hs.textContent = `HubSpot: not synced (${result.hubspot.error || "n8n not configured"}).`;
    } else {
      hs.innerHTML = `<strong>HubSpot sync failed:</strong> ${escapeHtml(result.hubspot.error || "unknown error")}. Create the contact manually in HubSpot.`;
    }
    wrap.appendChild(hs);
  }

  // Dismiss button
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => setAdmin({ result: null }));
  wrap.appendChild(dismiss);

  return wrap;
}

function renderErrorBanner(error) {
  // error shape: { kind, message, detail? }
  const wrap = document.createElement("div");
  wrap.className = "rounded-2xl border border-urgent-100 bg-urgent-50 text-urgent-600 p-4 space-y-1";
  const headLine = document.createElement("div");
  headLine.className = "text-sm font-semibold";
  headLine.textContent = error.kind === "validation"
    ? "Couldn't create the account"
    : (error.kind === "auth" ? "Sign in required" : "Something went wrong");
  wrap.appendChild(headLine);
  const detail = document.createElement("div");
  detail.className = "text-sm";
  detail.textContent = error.message || "Please try again.";
  wrap.appendChild(detail);
  if (Array.isArray(error.missing) && error.missing.length) {
    const list = document.createElement("div");
    list.className = "text-xs mt-1";
    list.textContent = `Missing fields: ${error.missing.join(", ")}`;
    wrap.appendChild(list);
  }
  // Diagnostic dump from the Worker — shown for ambiguous / validation /
  // error responses so we can pin the upstream behaviour without DevTools.
  if (error.diagnostics) {
    const diag = document.createElement("pre");
    diag.className = "text-xs mt-2 p-2 bg-white/60 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-64 ring-1 ring-urgent-100";
    diag.textContent = JSON.stringify(error.diagnostics, null, 2);
    wrap.appendChild(diag);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => setAdmin({ error: null }));
  wrap.appendChild(dismiss);
  return wrap;
}

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit(type) {
  // Trim whitespace before send. We don't touch formCache itself so the
  // values stay editable if the submit fails (operator can fix and resubmit).
  const fields = {};
  for (const [k, v] of Object.entries(formCache[type])) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") fields[k] = s;
  }

  setAdmin({ submitting: true, result: null, error: null });
  let resp;
  try {
    resp = await createAdminUser({ type, fields });
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      setAdmin({
        submitting: false,
        error: { kind: "auth", message: "Your session expired. Reload the page and sign in again." },
      });
      return;
    }
    setAdmin({
      submitting: false,
      error: { kind: "network", message: String((e && e.message) || e) },
    });
    return;
  }

  const data = resp.data || {};

  // Worker returns:
  //   200 + { status: "ok" | "partial", ...full response } on belmazad success
  //   400 + { status: "validation", error, missing? }      on bad input
  //   429 + { status: "error", error, limit }              on rate limit
  //   502 + { status: "ambiguous"|"error", error, ... }    on worker/upstream failure
  if (resp.ok && (data.status === "ok" || data.status === "partial")) {
    setAdmin({ submitting: false, result: data, error: null });
    // On a clean full success, reset the form so operators can create back-to-back.
    if (data.status === "ok") {
      formCache[type] = (type === "buyer") ? defaultBuyer() : defaultAgent();
    }
    return;
  }
  // Otherwise it's an error of some kind — surface the message AND the
  // Worker's diagnostic envelope (upstreamStatus / upstreamPreview / etc.)
  // so the banner can show the actual upstream body without forcing the
  // user to dig through DevTools.
  const hasDiagnostics = data.upstreamStatus != null || data.upstreamPreview != null ||
                         data.upstreamLocation != null || data.parsedShape != null;
  setAdmin({
    submitting: false,
    result: null,
    error: {
      kind: data.status || "error",
      message: data.error || `Request failed (HTTP ${resp.status})`,
      missing: data.missing,
      diagnostics: hasDiagnostics ? {
        upstreamStatus: data.upstreamStatus,
        upstreamLocation: data.upstreamLocation,
        upstreamPreview: data.upstreamPreview,
        parsedShape: data.parsedShape,
      } : null,
    },
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────

function labelFor(type) {
  return type === "buyer" ? "buyer" : (type === "broker" ? "broker" : "seller");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
