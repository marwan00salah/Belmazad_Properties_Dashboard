import { IMAGE_BASE_URL, PLACEHOLDER_IMAGE, WORKER_URL } from "../config.js";
import { money, formatNumber, formatDate, formatDateTime, timeUntil, daysSince, isTrue } from "../format.js";
import { decode, HS_LEAD_STATUS_BUCKET_LABELS } from "../lookups.js";
import { statusBadge, listingStatusKinds } from "../components/statusBadge.js";
import { subscribeCountdown } from "../countdown.js";
import { getState, setPropertyReport } from "../state.js";
import { initiateAuction, fetchPropertyReport, triggerPropertyReportRefresh } from "../api.js";

function section(title, rows) {
  const wrap = document.createElement("section");
  wrap.className = "rounded-xl bg-white shadow-sm ring-1 ring-ink-100 p-5 md:p-6";
  const h = document.createElement("h2");
  h.className = "text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4";
  h.textContent = title;
  const dl = document.createElement("dl");
  dl.className = "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3";
  for (const [label, value] of rows) {
    if (value == null || value === "") continue;
    const row = document.createElement("div");
    row.className = "flex flex-col gap-0.5";
    const dt = document.createElement("dt");
    dt.className = "text-xs text-ink-500 font-medium uppercase tracking-wider";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "text-sm text-ink-900";
    if (value instanceof HTMLElement) dd.appendChild(value);
    else dd.textContent = value;
    row.append(dt, dd);
    dl.appendChild(row);
  }
  wrap.append(h, dl);
  return wrap;
}

function renderNotFound(propertyId) {
  const wrap = document.createElement("div");
  wrap.className = "flex-1 mx-auto w-full max-w-3xl px-4 py-16 text-center";
  wrap.innerHTML = `
    <div class="text-ink-900 text-lg font-semibold mb-1">Listing not found</div>
    <p class="text-ink-500 text-sm mb-4">No listing with ID <code class="px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">${propertyId}</code> in the current dataset.</p>
    <a href="#/" class="inline-flex items-center gap-2 rounded-lg bg-accent-700 hover:bg-accent-800 text-white px-4 py-2 text-sm font-medium transition shadow-sm">Back to listings</a>`;
  return wrap;
}

export function renderDetail(propertyId) {
  const { listings, loading } = getState();
  const listing = listings.find(l => String(l.propertyId) === String(propertyId));

  if (!listing) {
    if (loading) {
      const wrap = document.createElement("div");
      wrap.className = "flex-1 mx-auto w-full max-w-3xl px-4 py-16 text-center text-ink-500 text-sm";
      wrap.textContent = "Loading…";
      return wrap;
    }
    return renderNotFound(propertyId);
  }

  const root = document.createElement("div");
  // Outer is fluid; the inner flex centers the three children with the
  // center main capped at max-w-5xl. Side rails sit in their own
  // containers alongside the center.
  root.className = "flex-1 w-full px-4 md:px-6 py-4 md:py-6 fade-in";

  // ── Build the outer flex layout first (three independent containers)
  const layout = document.createElement("div");
  layout.className = "mx-auto flex flex-wrap items-start justify-center gap-4";

  const leftRail = document.createElement("aside");
  // Below xl: full-width, stacks above the center (mobile order 2 — after Offers/Timing).
  // xl+: 288 px fixed, sticky on the left of the center.
  leftRail.className = "w-full xl:w-72 xl:flex-shrink-0 order-2 xl:order-1 xl:sticky xl:top-20 xl:self-start space-y-4";

  const center = document.createElement("main");
  // The "main container" — stays at max-w-5xl as originally designed.
  center.className = "w-full max-w-5xl min-w-0 order-3 xl:order-2 space-y-4";

  const rightRail = document.createElement("aside");
  // Below xl: full-width, stacks first (mobile order 1 — Offers/Timing at top).
  // xl+: 288 px fixed, sticky on the right of the center.
  rightRail.className = "w-full xl:w-72 xl:flex-shrink-0 order-1 xl:order-3 xl:sticky xl:top-20 xl:self-start space-y-4";

  layout.append(leftRail, center, rightRail);

  // ── Back nav + external links (DETAIL-03, DETAIL-04)
  // Sits ABOVE the 3-column layout so the side rails align with the hero
  // image top, not the nav row.
  const navWrap = document.createElement("div");
  navWrap.className = "mx-auto w-full max-w-5xl mb-4";
  const nav = document.createElement("nav");
  nav.className = "flex items-center justify-between gap-2 text-sm";

  // DETAIL-20: pill-styled back link so it reads as a primary nav button,
  // not a muted inline link.
  const back = document.createElement("a");
  back.href = "#/";
  back.className = "inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 hover:text-ink-900 transition px-3 py-1.5 text-ink-700 font-medium shadow-sm";
  back.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.78 5.22a.75.75 0 010 1.06L9.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clip-rule="evenodd"/></svg> Back to listings`;

  const externals = document.createElement("div");
  externals.className = "flex items-center gap-2";

  const adminLink = document.createElement("a");
  adminLink.href = `https://belmazad.com/admin/property/add/${encodeURIComponent(listing.propertyId)}`;
  adminLink.target = "_blank";
  adminLink.rel = "noopener noreferrer";
  adminLink.className = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-accent-700 hover:bg-accent-50 hover:text-accent-800 transition font-medium";
  adminLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 1l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V4l7-3zm0 5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3 6.5a3 3 0 016 0V13H7v-.5z" clip-rule="evenodd"/></svg> View on admin <span aria-hidden="true">↗</span>`;

  const publicLink = document.createElement("a");
  publicLink.href = `https://belmazad.com/auction/property/${encodeURIComponent(listing.propertyId)}`;
  publicLink.target = "_blank";
  publicLink.rel = "noopener noreferrer";
  publicLink.className = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-accent-700 hover:bg-accent-50 hover:text-accent-800 transition font-medium";
  publicLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg> View on belmazad.com <span aria-hidden="true">↗</span>`;

  externals.append(adminLink, publicLink);
  nav.append(back, externals);
  navWrap.appendChild(nav);
  root.appendChild(navWrap);
  root.appendChild(layout);

  // ── Hero
  const hero = document.createElement("section");
  hero.className = "rounded-xl bg-white shadow-sm ring-1 ring-ink-100 overflow-hidden";
  const heroImg = document.createElement("div");
  heroImg.className = "relative aspect-[21/9] bg-ink-100";
  const img = document.createElement("img");
  const filename = (listing.propertyImages || "").trim();
  img.src = filename ? IMAGE_BASE_URL + filename : PLACEHOLDER_IMAGE;
  img.alt = listing.propertyName || "";
  img.className = `absolute inset-0 h-full w-full object-cover ${isTrue(listing.propertySold) ? "grayscale opacity-90" : ""}`;
  img.addEventListener("error", () => { img.src = PLACEHOLDER_IMAGE; }, { once: true });
  heroImg.appendChild(img);

  const badges = document.createElement("div");
  badges.className = "absolute top-3 right-3 flex flex-wrap gap-1 justify-end";
  heroImg.appendChild(badges);

  hero.appendChild(heroImg);

  const heroBody = document.createElement("div");
  heroBody.className = "p-5 md:p-6 space-y-2";
  const title = document.createElement("h1");
  title.className = "text-2xl md:text-3xl font-semibold text-ink-900 leading-tight";
  title.textContent = listing.propertyName || `Listing ${listing.propertyId}`;
  const addr = document.createElement("p");
  addr.className = "text-sm text-ink-500";
  addr.textContent = [listing.propertyAddress].filter(Boolean).join(", ") || "—";

  // DETAIL-13: 3 brand-colored quick-action buttons (Maps / VR tour / YouTube).
  // Supersedes the old standalone "View on Google Maps" row (DETAIL-02) and
  // the inline media strip (DETAIL-12).
  const actionsRow = buildActionsRow(listing);

  heroBody.append(title, addr, actionsRow);
  // DETAIL-18: collapsible description (with optional EN/AR toggle) lives
  // inside the hero card, directly below the actions row. Starts collapsed.
  const descDisclosure = buildDescriptionDisclosure(listing);
  if (descDisclosure) heroBody.appendChild(descDisclosure);
  hero.appendChild(heroBody);
  center.appendChild(hero);

  // Countdown ticker drives only the floating status badges on the hero image
  // now that the "Ends in" tile has been replaced by the actions row.
  const unsubscribe = subscribeCountdown(() => {
    const t = timeUntil(listing.endBidding);
    badges.innerHTML = "";
    for (const k of listingStatusKinds(listing, t.bucket)) {
      const b = statusBadge(k);
      if (b) badges.appendChild(b);
    }
  });

  // ── Build content sections ──────────────────────────────────────────────
  const isOffer = listing.auctionType === "Make An Offer";
  const sectionTitle = isOffer ? "Offers" : "Bidding";

  // DETAIL-17: Payment terms + Price modifier moved here from the
  // (now-removed) Commercial terms section.
  const priceMod = decode("priceModifier", listing.priceModifier);

  const offersSection = section(sectionTitle, [
    [isOffer ? "Starting offer"      : "Start bid",         money(listing.start_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE)],
    [isOffer ? "Highest offer"       : "Current bid",       money(listing.current_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE)],
    ["Buy it now",                                          isTrue(listing.show_buy_it_now) ? money(listing.buy_it_now, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    [isOffer ? "Offer increments"    : "Bid increments",    listing.bidIncrements ? money(listing.bidIncrements, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    ["Market value",                                        listing.current_market_value ? money(listing.current_market_value, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    ["Guide price",                                         listing.auction_guide_price ? money(listing.auction_guide_price, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    [isOffer ? "Total offers"        : "Total bids",        formatNumber(listing.no_of_bids)],
    [isOffer ? "Highest offerer ID"  : "Highest bidder ID", listing.highestBidder ? `#${listing.highestBidder}` : null],
    ["Sold amount",                                         isTrue(listing.propertySold) ? money(listing.soldAmount, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    ["Payment terms",                                       decode("purchaseStatus", listing.purchaseStatus)],
    ["Price modifier",                                      priceMod && priceMod !== "None" ? priceMod : null],
  ]);
  // Side rails use a single-column dl layout (narrower than the center)
  offersSection.querySelector("dl")?.classList.remove("sm:grid-cols-2");
  // DETAIL-15: Offers/Bidding flips to the negative (inverted) palette.
  applyNegativePalette(offersSection);

  const timingSection = section("Timing", [
    ["Bidding starts",    formatDateTime(listing.startBidding)],
    ["Bidding ends",      formatDateTime(listing.endBidding)],
    ["Expiry days",       listing.expiryDay],
    ["Listed on",         formatDate(listing.insertDate)],
    ["Days listed",       (() => { const d = daysSince(listing.insertDate); return d == null ? null : `${d} day${d === 1 ? "" : "s"}`; })()],
  ]);
  timingSection.querySelector("dl")?.classList.remove("sm:grid-cols-2");

  const specsSection = section("Specifications", [
    ["Property ID",       listing.propertyId],
    ["Property category", decode("propertyType", listing.propertyType)],
    ["Property type",     listing.SUB_PROPERTY_TYPE],
    ["Auction type",      listing.auctionType],
    ["Area (m²)",         listing.homeSquareFootage ? `${formatNumber(listing.homeSquareFootage)} m²` : null],
    ["Bedrooms",          listing.bedrooms],
    ["Bathrooms",         listing.baths],
    ["Lot size",          listing.lotSize],
    ["Year built",        listing.yearBuilt],
    ["Occupancy",         decode("propertyOccupancyStatus", listing.propertyOccupancyStatus)],
    ["Tenure",            decode("tenure", listing.tenure)],
    ["Land use",          decode("land_use", listing.land_use)],
    ["Property label",    decode("propertyLabel", listing.propertyLabel)],
    ["Utilities",         decode("utilities_connected", listing.utilities_connected)],
    ["Featured",          decode("featured", listing.featured)],
    ["Option",            listing.optionName],
  ]);
  specsSection.querySelector("dl")?.classList.remove("sm:grid-cols-2");

  // DETAIL-18: description moved out of the center column into a
  // collapsible disclosure inside the hero card (see buildDescriptionDisclosure
  // below). The old standalone section block has been removed.

  const sellerName = [listing.firstName, listing.middleName, listing.lastName].filter(Boolean).join(" ").trim();
  const sellerSection = section("Seller / Agent", [
    ["Name",          sellerName],
    ["Seller type",   decode("sellerType", listing.sellerType)],
    ["Email",         listing.email && listing.email !== "super admin" ? listing.email : null],
    ["Office phone",  listing.officeNumber],
  ]);
  // Left rail width → stack vertically (DETAIL-10).
  sellerSection.querySelector("dl")?.classList.remove("sm:grid-cols-2");

  let lawyersSection = null;
  if (listing.lawyersCompanyName || listing.lawyersName || listing.lawyersEmail) {
    lawyersSection = section("Lawyers", [
      ["Company",        listing.lawyersCompanyName],
      ["Name",           listing.lawyersName],
      ["Email",          listing.lawyersEmail],
      ["Office phone",   listing.lawyersOfficeNumber],
      ["Direct phone",   listing.lawyersDirectNumber],
      ["Address",        listing.lawyersOfficeAddress],
    ]);
  }

  let bankSection = null;
  if (listing.bank_name || listing.egp_account || listing.usd_account) {
    bankSection = section("Bank / Escrow", [
      ["Account holder", listing.company_name],
      ["Bank",           listing.bank_name],
      ["Branch",         listing.branch_address],
      ["EGP account",    listing.egp_account],
      ["EGP IBAN",       listing.egp_iban],
      ["USD account",    listing.usd_account],
      ["USD IBAN",       listing.usd_iban],
      ["SWIFT",          listing.swift_code],
    ]);
  }

  // ── Populate the three independent containers (DETAIL-06) ──────────────
  // Right rail: Timing → Offers (DETAIL-08). Commercial terms section
  // removed in DETAIL-17; Payment terms + Price modifier now live inside
  // the Offers/Bidding dl.
  rightRail.append(timingSection, offersSection);

  // Left rail: Seller/Agent → Specifications (DETAIL-10).
  leftRail.append(sellerSection, specsSection);

  // Center: nav + hero already appended above. Now everything else.
  // (DETAIL-11 removed Status & flags; Property ID + Featured moved to Specs.)
  // (DETAIL-12 inlined Media into the hero card.)
  // (DETAIL-18 moved Description into the hero card as a disclosure.)
  if (lawyersSection)     center.appendChild(lawyersSection);
  if (bankSection)        center.appendChild(bankSection);

  // DETAIL-22: per-property HubSpot reports card (n8n-backed; see WORKER-06).
  center.appendChild(buildHubSpotReportSection(listing));

  // DETAIL-09: live "Starts in / Ends in" tile at the top of the Timing
  // section, styled with a negative (inverted) palette — dark background,
  // light foreground — to stand out from the rest of the timing rows.
  // DETAIL-14: starts hidden — the synchronous first tick from
  // subscribeCountdown will reveal it only when there's a real value to show.
  const timingCountdown = document.createElement("div");
  timingCountdown.className = "mb-4 rounded-lg bg-ink-900 ring-1 ring-ink-800 p-3 hidden";
  timingCountdown.innerHTML = `
    <div class="text-[10px] uppercase tracking-wider text-ink-300 font-semibold timing-cd-label">—</div>
    <div class="mt-0.5 text-lg font-semibold text-white tabular-nums timing-cd-value">—</div>`;
  const timingDl = timingSection.querySelector("dl");
  if (timingDl) timingSection.insertBefore(timingCountdown, timingDl);
  else          timingSection.appendChild(timingCountdown);

  const tcLabel = timingCountdown.querySelector(".timing-cd-label");
  const tcValue = timingCountdown.querySelector(".timing-cd-value");

  const startMs = (() => {
    const raw = listing.startBidding;
    if (!raw) return null;
    const d = new Date(String(raw).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  })();

  const unsubscribeTiming = subscribeCountdown((now) => {
    if (startMs != null && startMs > now) {
      const t = timeUntil(listing.startBidding, now);
      if (t.bucket === "unknown") {
        timingCountdown.classList.add("hidden");
      } else {
        tcLabel.textContent = "Starts in";
        tcValue.textContent = t.text;
        timingCountdown.classList.remove("hidden");
      }
    } else {
      const t = timeUntil(listing.endBidding, now);
      if (t.bucket === "ended" || t.bucket === "unknown") {
        timingCountdown.classList.add("hidden");
      } else {
        tcLabel.textContent = "Ends in";
        tcValue.textContent = t.text;
        timingCountdown.classList.remove("hidden");
      }
    }
  });

  // WORKER-05: operator-only "Initiate auction" control at the bottom of
  // the Timing section. State.isOperator is set by fetchWhoAmI() after the
  // first listings fetch; render() re-runs on state change so the control
  // appears the moment we learn the user is an operator.
  // DETAIL-21: the control internally checks localStorage to render either
  // the active button or a disabled "already initiated" tile.
  if (getState().isOperator) {
    const initiateControl = buildInitiateAuctionControl(listing, startMs);
    if (initiateControl) timingSection.appendChild(initiateControl);
  }

  root.__cleanup = () => { unsubscribe(); unsubscribeTiming(); };
  return root;
}

// DETAIL-16: allow-list HTML sanitizer for `propertyDescription` rich text.
// Keeps semantic markup; strips all attributes except safe links.
const DESC_ALLOWED_TAGS = new Set([
  "H1","H2","H3","H4","H5","H6","P","UL","OL","LI",
  "STRONG","B","EM","I","U","BR","HR","A","BLOCKQUOTE","CODE",
]);
function sanitizeDescriptionHtml(input) {
  if (!input) return "";
  const doc = new DOMParser().parseFromString(`<div>${input}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  (function walk(node) {
    for (const child of Array.from(node.children)) walk(child);
    if (node === root) return;
    if (!DESC_ALLOWED_TAGS.has(node.tagName)) {
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      return;
    }
    // Capture href before nuking all attributes so we can re-apply it if it's a safe URL.
    const originalHref = node.tagName === "A" ? (node.getAttribute("href") || "") : "";
    for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
    if (node.tagName === "A" && /^(https?:|mailto:)/i.test(originalHref)) {
      node.setAttribute("href", originalHref);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  })(root);
  return root.innerHTML;
}

// DETAIL-18: collapsible Description disclosure that sits inside the hero
// card, directly under the actions row. Starts collapsed.
// - Header is a single full-width button with centered "Description ▾" text;
//   the whole row is pressable and darkens on hover to signal that.
// - When expanded, an EN | AR segmented toggle fades in on the right
//   (absolute-positioned sibling of the trigger so its clicks don't toggle
//   the disclosure). Only present when both EN and AR descriptions exist.
// - Body uses the existing sanitizeDescriptionHtml + prose styling.
//   Smooth height animation via the grid-template-rows 0fr→1fr trick.
function buildDescriptionDisclosure(listing) {
  const richEn     = sanitizeDescriptionHtml(listing.propertyDescription || "");
  const fallbackEn = (listing.cleanPropertyDescription || "").trim();
  const richAr     = sanitizeDescriptionHtml(listing.arabicpropertyDescription || "");
  const hasEn      = !!(richEn || fallbackEn);
  const hasAr      = !!richAr;
  if (!hasEn && !hasAr) return null;

  const wrap = document.createElement("div");
  wrap.className = "mt-4 border-t border-ink-100 pt-2";

  // Header row: full-width press target with the segmented toggle floated
  // absolutely on the right so it doesn't intercept the disclosure click.
  const headerWrap = document.createElement("div");
  headerWrap.className = "relative";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");
  trigger.className = "w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition";
  trigger.innerHTML = `<span>Description</span><svg class="chevron transition-transform duration-200" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>`;
  headerWrap.appendChild(trigger);

  // Default language: EN if available, otherwise AR (the only case where
  // we'd skip the toggle entirely and just show AR).
  let lang = hasEn ? "en" : "ar";

  const segBase     = "px-2 py-0.5 rounded transition text-xs font-semibold";
  const segActive   = "bg-white text-ink-900 shadow-sm";
  const segInactive = "text-ink-500 hover:text-ink-800";
  let seg = null, enBtn = null, arBtn = null;
  if (hasEn && hasAr) {
    seg = document.createElement("div");
    seg.className = "absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center rounded-md bg-ink-100 p-0.5 opacity-0 pointer-events-none transition-opacity duration-200";
    seg.setAttribute("aria-hidden", "true");
    enBtn = document.createElement("button");
    arBtn = document.createElement("button");
    enBtn.type = "button"; arBtn.type = "button";
    enBtn.textContent = "EN"; arBtn.textContent = "AR";
    enBtn.className = `${segBase} ${segActive}`;
    arBtn.className = `${segBase} ${segInactive}`;
    seg.append(enBtn, arBtn);
    headerWrap.appendChild(seg);
  }

  const collapse = document.createElement("div");
  collapse.className = "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out";
  const collapseInner = document.createElement("div");
  collapseInner.className = "overflow-hidden min-h-0";

  const body = document.createElement("div");
  body.className = "prose prose-sm max-w-none text-ink-800 leading-relaxed pt-3";

  function renderBody() {
    body.classList.remove("whitespace-pre-wrap");
    body.innerHTML = "";
    if (lang === "ar" && hasAr) {
      body.setAttribute("dir", "rtl");
      body.setAttribute("lang", "ar");
      body.innerHTML = richAr;
    } else {
      body.setAttribute("dir", "ltr");
      body.setAttribute("lang", "en");
      if (richEn) {
        body.innerHTML = richEn;
      } else {
        body.classList.add("whitespace-pre-wrap");
        body.textContent = fallbackEn;
      }
    }
  }
  renderBody();

  function setLang(next) {
    if (next === lang) return;
    lang = next;
    if (enBtn && arBtn) {
      enBtn.className = `${segBase} ${lang === "en" ? segActive : segInactive}`;
      arBtn.className = `${segBase} ${lang === "ar" ? segActive : segInactive}`;
    }
    renderBody();
  }
  if (enBtn) enBtn.addEventListener("click", (e) => { e.stopPropagation(); setLang("en"); });
  if (arBtn) arBtn.addEventListener("click", (e) => { e.stopPropagation(); setLang("ar"); });

  collapseInner.appendChild(body);
  collapse.appendChild(collapseInner);
  wrap.append(headerWrap, collapse);

  let open = false;
  trigger.addEventListener("click", () => {
    open = !open;
    trigger.setAttribute("aria-expanded", String(open));
    collapse.classList.toggle("grid-rows-[0fr]", !open);
    collapse.classList.toggle("grid-rows-[1fr]", open);
    const chev = trigger.querySelector(".chevron");
    if (chev) chev.style.transform = open ? "rotate(180deg)" : "";
    if (seg) {
      seg.classList.toggle("opacity-0", !open);
      seg.classList.toggle("pointer-events-none", !open);
      seg.classList.toggle("opacity-100", open);
      seg.classList.toggle("pointer-events-auto", open);
      seg.setAttribute("aria-hidden", String(!open));
    }
  });

  return wrap;
}

// DETAIL-21: localStorage helpers for tracking which properties this browser
// has already initiated. Per-browser, per-device — sufficient at ~14
// initiations/month from a single operator on a single laptop.
const INITIATED_KEY_PREFIX = "belmazad:initiated:";
function readInitiated(propertyId) {
  try {
    const raw = localStorage.getItem(INITIATED_KEY_PREFIX + propertyId);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch { return null; }
}
function writeInitiated(propertyId, masterTaskId) {
  try {
    localStorage.setItem(
      INITIATED_KEY_PREFIX + propertyId,
      JSON.stringify({ master_task_id: masterTaskId || "", at: Date.now() }),
    );
  } catch { /* private mode / quota — silent */ }
}

// WORKER-05 + DETAIL-21: Initiate-auction control rendered at the bottom of
// the Timing section for operators. Inverted palette so it visually matches
// the live countdown tile above. Renders one of three states:
//   • already initiated (localStorage) → "✓ Auction initiated" tile + reset link
//   • disabled (no future startBidding) → grayed button with tooltip
//   • active → "Initiate auction" button that opens the confirm modal
function buildInitiateAuctionControl(listing, startMs) {
  const wrap = document.createElement("div");
  wrap.className = "mt-4 rounded-lg bg-ink-900 ring-1 ring-ink-800 p-3";
  paintInitiateControl(wrap, listing, startMs);
  return wrap;
}

function paintInitiateControl(wrap, listing, startMs) {
  wrap.innerHTML = "";
  const propertyId = String(listing.propertyId || "");

  const heading = document.createElement("div");
  heading.className = "text-[10px] uppercase tracking-wider text-ink-300 font-semibold mb-2";
  heading.textContent = "Operator actions";
  wrap.appendChild(heading);

  const prior = readInitiated(propertyId);
  if (prior) {
    const done = document.createElement("div");
    done.className = "rounded-md bg-emerald-950 ring-1 ring-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-300 inline-flex items-center gap-1.5 w-full justify-center";
    done.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.7 5.7a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 12l6.3-6.3a1 1 0 011.4 0z" clip-rule="evenodd"/></svg> <span>Auction initiated</span>`;
    wrap.appendChild(done);

    if (prior.master_task_id) {
      const meta = document.createElement("div");
      meta.className = "mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-400";
      const taskLabel = document.createElement("span");
      taskLabel.textContent = "task:";
      const taskValue = document.createElement("span");
      taskValue.className = "font-mono text-ink-300 truncate flex-1";
      taskValue.title = prior.master_task_id;
      taskValue.textContent = prior.master_task_id;
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.title = "Copy task ID";
      copyBtn.className = "text-ink-300 hover:text-white transition shrink-0";
      copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 3a2 2 0 00-2 2v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V5a2 2 0 00-2-2H7zm0 2h8v8h-1V8a2 2 0 00-2-2H7V5zM4 8h8v8H4V8z"/></svg>`;
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(prior.master_task_id);
          const originalHtml = copyBtn.innerHTML;
          copyBtn.textContent = "✓";
          setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1200);
        } catch { /* silent */ }
      });
      meta.append(taskLabel, taskValue, copyBtn);
      wrap.appendChild(meta);
    }
    return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11 1.5l-7.5 9h5l-1 8 8-10h-5l.5-7z"/></svg> <span>Initiate auction</span>`;

  const disabledReason =
    startMs == null            ? "Start time not set on this listing." :
    startMs <= Date.now()      ? "Start time has already passed."      :
    null;

  if (disabledReason) {
    btn.disabled = true;
    btn.className = "w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-800 text-ink-500 px-3 py-2 text-sm font-semibold ring-1 ring-ink-700 cursor-not-allowed";
    btn.title = disabledReason;
  } else {
    btn.className = "w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-800 hover:bg-ink-700 text-white px-3 py-2 text-sm font-semibold ring-1 ring-ink-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
    btn.addEventListener("click", () => openInitiateAuctionModal(listing, () => paintInitiateControl(wrap, listing, startMs)));
  }

  wrap.appendChild(btn);
}

function openInitiateAuctionModal(listing, onSuccess) {
  const propertyId = String(listing.propertyId || "");
  const rawStart   = listing.startBidding;
  const startDate  = rawStart ? new Date(String(rawStart).replace(" ", "T")) : null;
  const validStart = startDate && !Number.isNaN(startDate.getTime());
  const startIso   = validStart ? startDate.toISOString() : null;
  const startLocal = validStart ? startDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 fade-in";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "initiate-auction-title");

  const modal = document.createElement("div");
  modal.className = "w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-ink-200 p-5 md:p-6 space-y-4";

  const title = document.createElement("h2");
  title.id = "initiate-auction-title";
  title.className = "text-base font-semibold text-ink-900";
  title.textContent = "Initiate auction";

  const meta = document.createElement("dl");
  meta.className = "rounded-lg bg-ink-50 ring-1 ring-ink-100 p-3 text-sm space-y-1.5";
  meta.innerHTML = `
    <div class="flex justify-between gap-3"><dt class="text-ink-500">Property</dt><dd class="text-ink-900 font-medium text-right">${escapeHtml(listing.propertyName || "—")}</dd></div>
    <div class="flex justify-between gap-3"><dt class="text-ink-500">Property ID</dt><dd class="text-ink-900 font-mono text-right">${escapeHtml(propertyId)}</dd></div>
    <div class="flex justify-between gap-3"><dt class="text-ink-500">Start time</dt><dd class="text-ink-900 text-right">${escapeHtml(startLocal)}</dd></div>`;

  const warning = document.createElement("p");
  warning.className = "text-xs text-urgent bg-red-50 ring-1 ring-red-100 rounded-md p-2.5";
  warning.textContent = "This sends real countdown emails to all qualified contacts. There is no undo.";

  const labelWrap = document.createElement("div");
  const label = document.createElement("label");
  label.className = "block text-xs text-ink-700 font-medium";
  label.innerHTML = `Type the property ID <span class="font-mono text-ink-900">${escapeHtml(propertyId)}</span> to confirm:`;
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.className = "mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-sm font-mono focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-100 transition";
  label.htmlFor = "initiate-auction-input";
  input.id = "initiate-auction-input";
  labelWrap.append(label, input);

  const errorMsg = document.createElement("p");
  errorMsg.className = "hidden text-xs text-urgent";

  const actions = document.createElement("div");
  actions.className = "flex items-center justify-end gap-2 pt-1";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 transition";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.disabled = true;
  confirmBtn.className = "rounded-lg bg-urgent text-white px-3 py-1.5 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-red-600";
  confirmBtn.textContent = "Initiate";

  actions.append(cancelBtn, confirmBtn);
  modal.append(title, meta, warning, labelWrap, errorMsg, actions);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  cancelBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);
  let sending = false;
  // Gate so a retype while in-flight doesn't accidentally re-enable the button.
  input.addEventListener("input", () => {
    if (sending) return;
    confirmBtn.disabled = input.value.trim() !== propertyId;
    errorMsg.classList.add("hidden");
  });

  confirmBtn.addEventListener("click", async () => {
    if (sending) return;
    if (!startIso) {
      errorMsg.textContent = "Start time is missing — cannot initiate.";
      errorMsg.classList.remove("hidden");
      return;
    }
    sending = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Sending…";
    input.disabled = true;
    cancelBtn.disabled = true;
    errorMsg.classList.add("hidden");

    const result = await initiateAuction({ property_id: propertyId, auction_start_date: startIso });

    if (result.ok) {
      const taskId = result.data?.master_task_id || result.data?.task_id || "";
      // DETAIL-21: persist the initiated state so the button switches to the
      // "already initiated" tile next time this property is opened.
      writeInitiated(propertyId, taskId);
      if (typeof onSuccess === "function") {
        try { onSuccess(); } catch {}
      }

      const success = document.createElement("div");
      success.className = "rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-800";
      const headline = document.createElement("div");
      headline.className = "font-semibold";
      headline.textContent = "Auction initiation queued.";
      success.appendChild(headline);
      if (taskId) {
        const row = document.createElement("div");
        row.className = "mt-1 flex items-center gap-1.5 text-xs";
        const lbl = document.createElement("span");
        lbl.textContent = "master_task_id:";
        const val = document.createElement("span");
        val.className = "font-mono truncate flex-1";
        val.title = taskId;
        val.textContent = taskId;
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.title = "Copy task ID";
        copyBtn.className = "shrink-0 text-emerald-700 hover:text-emerald-900 transition";
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 3a2 2 0 00-2 2v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V5a2 2 0 00-2-2H7zm0 2h8v8h-1V8a2 2 0 00-2-2H7V5zM4 8h8v8H4V8z"/></svg>`;
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(taskId);
            const originalHtml = copyBtn.innerHTML;
            copyBtn.textContent = "✓";
            setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1200);
          } catch { /* silent */ }
        });
        row.append(lbl, val, copyBtn);
        success.appendChild(row);
      }

      modal.innerHTML = "";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "rounded-lg bg-accent-700 hover:bg-accent-800 text-white px-3 py-1.5 text-sm font-semibold shadow-sm transition";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", close);
      const successActions = document.createElement("div");
      successActions.className = "flex justify-end pt-2";
      successActions.appendChild(closeBtn);
      modal.append(title, success, successActions);
      return;
    }

    // Failure (or network rejection) — surface the error and let the operator retry.
    const msg = result.data?.error || result.data?.detail || `Request failed (${result.status})`;
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hidden");
    sending = false;
    input.disabled = false;
    cancelBtn.disabled = false;
    confirmBtn.disabled = input.value.trim() !== propertyId;
    confirmBtn.textContent = "Initiate";
  });

  input.focus();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// DETAIL-15: flip a section() node to the negative (inverted) palette in-place.
function applyNegativePalette(node) {
  node.className = "rounded-xl bg-ink-900 shadow-sm ring-1 ring-ink-800 p-5 md:p-6";
  const h = node.querySelector("h2");
  if (h) h.className = "text-sm font-semibold text-ink-300 uppercase tracking-wider mb-4";
  for (const dt of node.querySelectorAll("dt")) {
    dt.className = "text-xs text-ink-400 font-medium uppercase tracking-wider";
  }
  for (const dd of node.querySelectorAll("dd")) {
    dd.className = "text-sm text-white";
  }
}

// ── DETAIL-22: HubSpot reports card ──────────────────────────────────────
// Async model (WORKER-06): the card hydrates from the Worker's shared KV
// cache; Refresh asks the Worker to (maybe) trigger an n8n recompute, then
// the card polls KV until the result lands. State lives in
// state.propertyReports[id]; the poll timer lives module-scoped (outside the
// DOM) because main.js render() tears down + rebuilds the whole tree on
// every setState — a node-attached timer would be orphaned each re-render.

const reportPollers = new Map();   // propertyId → setTimeout handle
const reportHydrating = new Set(); // propertyId → lazy KV read in flight
const REPORT_POLL_FIRST_MS = 1500; // snappy first check (n8n often ~6 s)
const REPORT_POLL_MS = 3000;
const REPORT_POLL_MAX = 60;        // ~3 min ceiling

function relativeFromNow(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// "marwan.salah@x.com" → "Marwan Salah"; falls back to local part, then raw.
function titleCaseFromEmail(email) {
  if (!email) return "—";
  const raw = String(email);
  const local = raw.split("@")[0] || raw;
  const tokens = local.split(/[._+\-]+/).filter(Boolean);
  if (!tokens.length) return local || raw;
  return tokens.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function reportProvenance(slice) {
  if (!slice) return null;
  const who = slice.triggeredBy ? titleCaseFromEmail(slice.triggeredBy) : null;
  const when = Number.isFinite(slice.computedAt) ? relativeFromNow(slice.computedAt) : null;
  if (when && who) return `Refreshed ${when}, by ${who}`;
  if (when) return `Refreshed ${when}`;
  if (who) return `Refreshed by ${who}`;
  return null;
}

function fmtDuration(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

// Live cooldown label: m:ss so it visibly ticks (e.g. "1:59", "0:07").
function fmtCooldown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtCount(n) {
  return Number.isFinite(n) ? formatNumber(n) : "—";
}

const REPORT_SPINNER_SVG = `<svg class="icon-spin" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312zM3.96 13.5a6.5 6.5 0 0011.66-4.27.75.75 0 111.484.236A8 8 0 013.18 14.93v.82a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5H3.96z" clip-rule="evenodd"/></svg>`;

function reportSpinnerNote(text) {
  const d = document.createElement("div");
  d.className = "flex items-center gap-2 text-sm text-ink-500 py-1";
  d.innerHTML = `${REPORT_SPINNER_SVG}<span></span>`;
  d.querySelector("span").textContent = text;
  return d;
}

function reportTextNote(text, danger) {
  const d = document.createElement("div");
  d.className = `text-sm py-1 ${danger ? "text-urgent" : "text-ink-500"}`;
  d.textContent = text;
  return d;
}

function stopReportPolling(id) {
  const h = reportPollers.get(id);
  if (h) clearTimeout(h);
  reportPollers.delete(id);
}

function startReportPolling(id) {
  stopReportPolling(id);
  let attempts = 0;
  const tick = () => {
    attempts++;
    fetchPropertyReport(id).then((rec) => {
      // Self-cancel if the user navigated away from this property (render()
      // tears the card down on every setState, so we can't rely on cleanup
      // to stop us — but the route is authoritative).
      const st = getState();
      if (st.route.name !== "detail" ||
          String(st.route.params.propertyId) !== id) {
        stopReportPolling(id);
        return;
      }
      if (!reportPollers.has(id)) return; // cancelled meanwhile

      const status = rec && rec.status;
      if (status === "ready" || status === "error" || status === "auth_error") {
        stopReportPolling(id);
        setPropertyReport(id, { ...rec, polling: false });
        return;
      }
      if (attempts >= REPORT_POLL_MAX) {
        stopReportPolling(id);
        setPropertyReport(id, { ...(rec || {}), polling: false, timedOut: true });
        return;
      }
      // Still running — keep polling SILENTLY. Calling setPropertyReport here
      // would setState → main.js render() rebuilds the whole tree → the page
      // visibly flashes (fade-in replays) every poll. The card already shows
      // the "Computing…" state from the click; the spinner animates via CSS
      // (no re-render needed). We only setState on a terminal transition.
      reportPollers.set(id, setTimeout(tick, REPORT_POLL_MS));
    });
  };
  reportPollers.set(id, setTimeout(tick, REPORT_POLL_FIRST_MS));
}

// Lazy one-shot KV read on first open. Async-only (never setState during
// render): the .then() fires after render() completes.
function hydrateReport(id) {
  if (reportHydrating.has(id)) return;
  reportHydrating.add(id);
  fetchPropertyReport(id).then((rec) => {
    reportHydrating.delete(id);
    setPropertyReport(id, rec || { status: "empty" });
  });
}

async function onReportRefresh(id) {
  setPropertyReport(id, { status: "running", polling: true, startedAt: Date.now() });
  const rec = await triggerPropertyReportRefresh(id);
  if (rec && rec.status === "running") {
    setPropertyReport(id, { ...rec, polling: true });
    startReportPolling(id);
  } else {
    // ready (cooldown'd shared data), error, or auth_error — terminal.
    setPropertyReport(id, { ...(rec || { status: "error", error: "Refresh failed" }), polling: false });
  }
}

function buildHubSpotReportSection(listing) {
  const id = String(listing.propertyId || "");
  const slice = getState().propertyReports[id];

  if (!slice) hydrateReport(id);
  // Another user's refresh may be in flight when we open the page — pick it
  // up and poll to completion (guard against double-starting a poller).
  if (slice && slice.status === "running" && !reportPollers.has(id)) {
    startReportPolling(id);
  }

  const status = slice && slice.status;
  const data = slice && slice.data;
  const rows = [];
  let note = null;
  let footer = reportProvenance(slice);
  let refreshDisabled = false;
  let refreshLabel = "Refresh reports";
  let refreshBusy = false;
  let cooldownEndsAt = null;

  if (!slice || status === "loading") {
    note = reportSpinnerNote("Loading report…");
    refreshDisabled = true;
  } else if (status === "empty") {
    note = reportTextNote("No report yet — generate the first report.");
    refreshLabel = "Generate reports";
  } else if (status === "running" || (slice && slice.polling)) {
    refreshDisabled = true;
    refreshBusy = true;
    refreshLabel = "Refreshing…";
    if (slice && slice.timedOut) {
      note = reportTextNote("Still computing — check back shortly.");
    } else {
      const by = slice && slice.triggeredBy
        ? ` by ${titleCaseFromEmail(slice.triggeredBy)}` : "";
      const when = slice && Number.isFinite(slice.startedAt)
        ? ` (started ${relativeFromNow(slice.startedAt)}${by})` : "";
      note = reportSpinnerNote(`Computing…${when}`);
    }
  } else if (status === "ready" && data) {
    const t = data.totals || {};
    rows.push(["Contacts", fmtCount(t.contacts)]);
    rows.push(["Deals", fmtCount(t.deals)]);
    rows.push(["Open tasks", fmtCount(t.openTasks)]);

    const byBucket = (data.leadStatus && data.leadStatus.byBucket) || {};
    for (const [key, label] of Object.entries(HS_LEAD_STATUS_BUCKET_LABELS)) {
      const n = byBucket[key];
      // Surface unmapped only when non-zero; skip other empty buckets.
      if (!Number.isFinite(n) || n === 0) continue;
      rows.push([label, fmtCount(n)]);
    }

    for (const s of (data.dealsByStage || [])) {
      rows.push([`Deal · ${s.label || s.stageId || "Stage"}`, fmtCount(s.count)]);
    }

    if (Number.isFinite(slice.cooldownRemainingMs) && slice.cooldownRemainingMs > 0) {
      refreshDisabled = true;
      cooldownEndsAt = Date.now() + slice.cooldownRemainingMs;
      refreshLabel = `Refresh (in ${fmtCooldown(slice.cooldownRemainingMs)})`;
    }
  } else if (status === "error") {
    note = reportTextNote(slice.error || "Couldn't load the report.", true);
  } else if (status === "auth_error") {
    note = reportTextNote("Sign in to view HubSpot reports.", true);
  } else {
    note = reportTextNote("No report yet — generate the first report.");
    refreshLabel = "Generate reports";
  }

  const wrap = section("HubSpot reports", rows);

  if (note) wrap.appendChild(note);

  const foot = document.createElement("div");
  foot.className = "mt-4 flex items-center justify-between gap-3 flex-wrap";

  const stamp = document.createElement("span");
  stamp.className = "text-xs text-ink-400";
  stamp.textContent = footer || "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.disabled = refreshDisabled;
  btn.className = "inline-flex items-center gap-2 rounded-lg bg-white hover:bg-ink-50 text-ink-800 ring-1 ring-ink-200 px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
  btn.innerHTML = `<svg class="${refreshBusy ? "icon-spin" : ""}" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M15.312 4.688A6.5 6.5 0 003.79 9.124a.75.75 0 11-1.488-.198 8 8 0 0114.18-5.45V2.75a.75.75 0 011.5 0v3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h.892a6.5 6.5 0 00-.812-.312zM3.96 13.5a6.5 6.5 0 0011.66-4.27.75.75 0 111.484.236A8 8 0 013.18 14.93v.82a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5H3.96z" clip-rule="evenodd"/></svg><span></span>`;
  btn.querySelector("span").textContent = refreshLabel;
  btn.addEventListener("click", () => { if (!btn.disabled) onReportRefresh(id); });

  // Live cooldown: drive the label off the shared 1 s ticker so it counts
  // down (m:ss) and re-enables itself at zero — no reload needed. The ticker
  // fires a synchronous first tick, so the initial label is exact too.
  if (cooldownEndsAt) {
    const lbl = btn.querySelector("span");
    let unsub = subscribeCountdown((now) => {
      const remaining = cooldownEndsAt - now;
      if (remaining > 0) {
        btn.disabled = true;
        lbl.textContent = `Refresh (in ${fmtCooldown(remaining)})`;
      } else {
        btn.disabled = false;
        lbl.textContent = "Refresh reports";
        if (unsub) { unsub(); unsub = null; }
      }
    });
    // teardown() walks descendants and calls each node's __cleanup; this
    // section is a descendant of the detail root, so this runs on unmount
    // (and on every re-render, matching the hero/timing countdown pattern).
    wrap.__cleanup = () => { if (unsub) { unsub(); unsub = null; } };
  }

  foot.append(stamp, btn);
  wrap.appendChild(foot);
  return wrap;
}

function buildMapsUrl(listing) {
  const lat = (listing.lat ?? "").toString().trim();
  const lng = (listing.lang ?? "").toString().trim();
  const addr = (listing.propertyAddress ?? "").toString().trim();
  let query = null;
  if (lat && lng) query = `${lat},${lng}`;
  else if (addr)  query = addr;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// DETAIL-13: brand-colored quick-action buttons row for the hero.
const ACTION_ICONS = {
  maps:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clip-rule="evenodd"/></svg>`,
  vr:       `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 6a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2h-2.3l-1.3 1.7a1.5 1.5 0 01-2.4 0L8.3 14H5a2 2 0 01-2-2V6zm3.5 2.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>`,
  yt:       `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M19.6 6.2a2.5 2.5 0 00-1.7-1.8C16.3 4 10 4 10 4s-6.3 0-7.9.4A2.5 2.5 0 00.4 6.2C0 7.8 0 10 0 10s0 2.2.4 3.8a2.5 2.5 0 001.7 1.8c1.6.4 7.9.4 7.9.4s6.3 0 7.9-.4a2.5 2.5 0 001.7-1.8c.4-1.6.4-3.8.4-3.8s0-2.2-.4-3.8zM8 13V7l5 3-5 3z"/></svg>`,
  // WORKER-01: gallery zip download.
  download: `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1zm-6 13a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z"/></svg>`,
  copy:     `<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 3a2 2 0 00-2 2v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V5a2 2 0 00-2-2H7zm0 2h8v8h-1V8a2 2 0 00-2-2H7V5zM4 8h8v8H4V8z"/></svg>`,
};

function actionButton({ label, url, palette, icon }) {
  const wrap = document.createElement("div");
  wrap.className = "group relative";

  if (!url) {
    const dis = document.createElement("div");
    dis.className = "flex items-center justify-center gap-2 rounded-lg bg-ink-100 ring-1 ring-ink-200 text-ink-400 px-3 py-3 text-sm font-medium cursor-not-allowed select-none";
    dis.innerHTML = `${icon}<span>${label}</span><span class="ml-1 text-[10px] uppercase tracking-wider">N/A</span>`;
    wrap.appendChild(dis);
    return wrap;
  }

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = `flex items-center justify-center gap-2 rounded-lg ${palette} text-white px-3 py-3 text-sm font-semibold shadow-sm transition`;
  a.innerHTML = `${icon}<span>${label}</span><span aria-hidden="true" class="opacity-80">↗</span>`;
  wrap.appendChild(a);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.setAttribute("aria-label", `Copy ${label} link`);
  copyBtn.className = "absolute top-1 right-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-white/85 hover:text-white hover:bg-white/15 transition opacity-0 group-hover:opacity-100 focus:opacity-100";
  copyBtn.innerHTML = `${ACTION_ICONS.copy}<span class="copy-label">Copy</span>`;
  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      const lbl = copyBtn.querySelector(".copy-label");
      if (lbl) {
        const orig = lbl.textContent;
        lbl.textContent = "Copied";
        setTimeout(() => { lbl.textContent = orig; }, 1500);
      }
    } catch { /* permission denied / not supported — silently no-op */ }
  });
  wrap.appendChild(copyBtn);

  return wrap;
}

function buildActionsRow(listing) {
  const row = document.createElement("div");
  row.className = "mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3";
  const galleryZipUrl = listing.propertyId
    ? `${WORKER_URL}gallery.zip?id=${encodeURIComponent(listing.propertyId)}`
    : null;
  row.append(
    actionButton({
      label:   "Google Maps",
      url:     buildMapsUrl(listing),
      palette: "bg-emerald-600 hover:bg-emerald-700",
      icon:    ACTION_ICONS.maps,
    }),
    actionButton({
      label:   "VR tour",
      url:     listing.virtual_tour_url || null,
      palette: "bg-violet-600 hover:bg-violet-700",
      icon:    ACTION_ICONS.vr,
    }),
    actionButton({
      label:   "YouTube",
      url:     listing.video_url || null,
      palette: "bg-red-600 hover:bg-red-700",
      icon:    ACTION_ICONS.yt,
    }),
    // WORKER-01: gallery zip download. Label says "Photos" (DETAIL-19);
    // the download arrow icon already conveys the action.
    actionButton({
      label:   "Photos",
      url:     galleryZipUrl,
      palette: "bg-ink-700 hover:bg-ink-800",
      icon:    ACTION_ICONS.download,
    }),
  );
  return row;
}
