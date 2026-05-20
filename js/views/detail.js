import { IMAGE_BASE_URL, PLACEHOLDER_IMAGE, WORKER_URL } from "../config.js";
import { money, formatNumber, formatDate, formatDateTime, timeUntil, daysSince, isTrue } from "../format.js";
import { decode, HS_LEAD_STATUS_BUCKET_LABELS } from "../lookups.js";
import { statusBadge, listingStatusKinds } from "../components/statusBadge.js";
import { subscribeCountdown } from "../countdown.js";
import { attachCursorShadow } from "../cursorShadow.js";
import { getState, setPropertyReport, setPropertyOffers, setPropertyEntities, setPropertyBidders, setBuyer } from "../state.js";
import { initiateAuction, fetchPropertyReport, triggerPropertyReportRefresh, probeBooklet, fetchPropertyOffers, fetchPropertyEntities, fetchPropertyBidders, fetchBuyer } from "../api.js";

// One label/value row: <div><dt/><dd/></div>. dd takes an HTMLElement
// (appended) or text (textContent).
function kvRow(label, value) {
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
  return row;
}

// <dl> of kvRows, skipping null/"" values. `columns:2` → responsive 1→2 col
// (center cards); `columns:1` → single column (narrow side rails). `gapY`
// kept as whole literal tokens so the Tailwind CDN JIT picks them up.
function kvList(rows, { columns = 2, gapY = 3 } = {}) {
  const dl = document.createElement("dl");
  const colCls = columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
  const gapCls = gapY === 2 ? "gap-y-2" : "gap-y-3";
  dl.className = `grid ${colCls} gap-x-6 ${gapCls}`;
  for (const [label, value] of rows) {
    if (value == null || value === "") continue;
    dl.appendChild(kvRow(label, value));
  }
  return dl;
}

// White card shell: <section> + <h2> title (no body). Shared by section()
// and the lazily-hydrated cards (Offers / Bidders / Seller).
// Unified card chrome (matches the HubSpot Performance card): a header strip
// (bold ink-900 title, light divider) over a padded body. Content goes into
// `cardBody(wrap)`; the header's right side is `wrap._header` (for pills etc).
function cardShell(title) {
  const wrap = document.createElement("section");
  wrap.className = "rounded-2xl bg-white shadow-sm border border-ink-100 overflow-hidden";
  const header = document.createElement("div");
  header.className = "px-5 py-4 border-b border-ink-50 bg-ink-50/50 flex items-center justify-between gap-3 flex-wrap";
  const h = document.createElement("h2");
  h.className = "text-base font-bold text-ink-900";
  h.textContent = title;
  header.appendChild(h);
  const body = document.createElement("div");
  body.className = "p-5 md:p-6";
  wrap.append(header, body);
  wrap._header = header;
  wrap._body = body;
  return wrap;
}
const cardBody = (s) => s._body || s;

// Full "Xd Yh Zm Ws" countdown string (detail Timing); falls back to the
// short timeUntil text when there's no day/h/m/s breakdown.
function dhms(t) {
  if (!t || t.days == null) return (t && t.text) || "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${t.days}d ${p(t.hours)}h ${p(t.minutes)}m ${p(t.seconds)}s`;
}

// Dark "Hybrid" card (mockup Auction Timing): inverted palette + a soft
// decorative blur blob. Content should be appended into the returned node.
function darkCardShell(title) {
  const wrap = document.createElement("section");
  wrap.className = "rounded-2xl bg-ink-900 shadow-lg text-white relative overflow-hidden p-5";
  const blob = document.createElement("div");
  blob.className = "absolute -right-8 -top-8 w-24 h-24 bg-brand-500/20 rounded-full blur-2xl pointer-events-none";
  const h = document.createElement("h2");
  h.className = "relative z-10 text-base font-bold text-white mb-4";
  h.textContent = title;
  wrap.append(blob, h);
  return wrap;
}

// Shared status classifier — single source of truth for STYLE-05's
// negative-first logic. Used by offerStatusPill() AND the left-border accent
// on Offers/Registrations rows so the pill and the bar can never disagree.
function statusKind(text) {
  const t = String(text || "").trim();
  if (/un-?approv|not\s*approv|unpaid|not\s*paid|reject|declin|cancel|fail|inactive|void|^no$/i.test(t)) return "negative";
  if (/pending|await|in\s*review|processing|on\s*hold/i.test(t)) return "pending";
  if (/approv|accept|confirm|complete|success|paid|active|verified|done|^yes$/i.test(t)) return "positive";
  return "neutral";
}
const STATUS_PILL_CLS = {
  negative: "bg-urgent/10 text-urgent",
  pending:  "bg-amber-100 text-amber-700",
  positive: "bg-emerald-100 text-emerald-700",
  neutral:  "bg-ink-100 text-ink-600",
};
const STATUS_BORDER_CLS = {
  negative: "bg-urgent-500",
  pending:  "bg-amber-400",
  positive: "bg-insight-500",
  neutral:  "bg-ink-300",
};

function section(title, rows) {
  const wrap = cardShell(title);
  cardBody(wrap).appendChild(kvList(rows));
  return wrap;
}

// Mockup "Property Specs": label/value rows with hairline separators; the
// Category + Featured values render as small tags. Null/"" rows are skipped.
function buildSpecsCard(listing) {
  const rows = [
    ["Property category", decode("propertyType", listing.propertyType)],
    ["Property type",     listing.SUB_PROPERTY_TYPE],
    ["Auction type",      listing.auctionType],
    ["Payment terms",     decode("purchaseStatus", listing.purchaseStatus)],
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
  ].filter(([, v]) => v != null && v !== "");

  const wrap = cardShell("Specifications");

  // Live listing status pill, right-aligned in the unified header strip
  // (status from the lazy /entities scrape; appears once it resolves).
  const eslice = getState().propertyEntities[String(listing.propertyId || "")];
  const liveStatus = eslice && eslice.status === "ok" ? eslice.liveStatus : null;
  if (liveStatus) {
    const live = /^active$/i.test(liveStatus);
    const pill = document.createElement("span");
    pill.className = `inline-flex items-center gap-1.5 shrink-0 ${live ? "bg-insight-50 text-insight-700" : "bg-ink-100 text-ink-600"} text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider`;
    pill.innerHTML = `<span class="h-1.5 w-1.5 rounded-full ${live ? "bg-insight-500" : "bg-ink-400"}"></span> ${live ? "Active Listing" : escapeHtml(liveStatus)}`;
    wrap._header.appendChild(pill);
  }

  const list = document.createElement("div");
  list.className = "space-y-3";
  rows.forEach(([label, value], i) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center gap-3" +
      (i < rows.length - 1 ? " pb-2 border-b border-ink-50" : "");
    const k = document.createElement("span");
    k.className = "text-sm text-ink-500 shrink-0";
    k.textContent = label;
    const v = document.createElement("span");
    if (label === "Property category")
      v.className = "text-sm font-semibold text-ink-700 bg-ink-50 px-2 py-0.5 rounded text-right";
    else if (label === "Featured")
      v.className = "text-sm font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-right";
    else if (label === "Payment terms")
      v.className = /finance/i.test(String(value))
        ? "text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-ink-900 px-2.5 py-0.5 rounded-full text-right shadow-sm"
        : "text-sm font-semibold text-ink-600 bg-ink-100 px-2 py-0.5 rounded text-right";
    else
      v.className = "text-sm font-bold text-ink-900 text-right break-words";
    v.textContent = String(value);
    row.append(k, v);
    list.appendChild(row);
  });
  cardBody(wrap).appendChild(list);
  return wrap;
}

// Lazy one-shot KV/scrape hydrator factory. Every per-property card
// (report/offers/entities/buyer/bidders) hydrates the same way: dedupe by id
// while a fetch is in flight, then setState with the record (or {empty}). The
// .then() always fires after render() completes, so this never setStates
// during render.
function makeHydrator(fetchFn, setFn) {
  const inFlight = new Set();
  return (id) => {
    if (inFlight.has(id)) return;
    inFlight.add(id);
    fetchFn(id).then((rec) => {
      inFlight.delete(id);
      setFn(id, rec || { status: "empty" });
    });
  };
}

// `startBidding`/`endBidding` arrive as "YYYY-MM-DD HH:MM:SS"; normalise the
// space to "T" so it parses cross-browser. Returns a valid Date or null.
function parseListingDate(raw) {
  if (!raw) return null;
  const d = new Date(String(raw).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function renderNotFound(propertyId) {
  const wrap = document.createElement("div");
  wrap.className = "flex-1 mx-auto w-full max-w-3xl px-4 py-16 text-center";
  wrap.innerHTML = `
    <div class="text-ink-900 text-lg font-semibold mb-1">Listing not found</div>
    <p class="text-ink-500 text-sm mb-4">No listing with ID <code class="px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">${propertyId}</code> in the current dataset.</p>
    <a href="#/properties" class="inline-flex items-center gap-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 text-sm font-medium transition shadow-sm">Back to listings</a>`;
  return wrap;
}

// Hero overlay pill (mockup): solid, bold, uppercase, backdrop-blurred.
const HERO_PILL = {
  live:   { t: "Live",        c: "bg-insight-500" },
  soon:   { t: "Ending Soon", c: "bg-urgent-500" },
  urgent: { t: "Ending Soon", c: "bg-urgent-500" },
  coming: { t: "Coming Soon", c: "bg-brand-500" },
  ended:  { t: "Ended",       c: "bg-ink-700" },
  sold:   { t: "Sold",        c: "bg-ink-900" },
};
function heroPill(text, colorCls) {
  const s = document.createElement("span");
  s.className = `${colorCls} bg-opacity-90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm uppercase tracking-wider backdrop-blur-sm`;
  s.textContent = text;
  return s;
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
  root.className = "flex-1 w-full fade-in";

  // Inner wrapper: mockup's max-w-[1400px] page column.
  const inner = document.createElement("div");
  inner.className = "mx-auto max-w-[1400px] w-full px-4 sm:px-6 lg:px-8 py-6";

  // ── 12-col grid (mockup): 3 / 6 / 3. Mobile order keeps the original
  // intent — right rail (Timing/Offers) first, then center, then left rail.
  const layout = document.createElement("div");
  layout.className = "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start";

  const leftRail = document.createElement("aside");
  leftRail.className = "lg:col-span-3 order-3 lg:order-1 lg:sticky lg:top-24 lg:self-start space-y-6";

  const center = document.createElement("main");
  center.className = "lg:col-span-6 order-2 lg:order-2 min-w-0 space-y-6";

  const rightRail = document.createElement("aside");
  rightRail.className = "lg:col-span-3 order-1 lg:order-3 lg:sticky lg:top-24 lg:self-start space-y-6";

  layout.append(leftRail, center, rightRail);

  // ── Breadcrumb header (mockup): "← Back to Listings | Property #id"
  // on the left; "View Public Page" + "Edit in Admin" on the right.
  const crumb = document.createElement("div");
  crumb.className = "flex flex-wrap items-center justify-between gap-3";

  const crumbLeft = document.createElement("div");
  crumbLeft.className = "flex items-center gap-3 text-sm";
  const back = document.createElement("a");
  back.href = "#/properties";
  back.className = "inline-flex items-center gap-1.5 text-brand-600 font-semibold hover:underline transition";
  back.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.78 5.22a.75.75 0 010 1.06L9.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clip-rule="evenodd"/></svg> Back to Listings`;
  const sep = document.createElement("span");
  sep.className = "text-ink-300";
  sep.textContent = "|";
  const crumbId = document.createElement("span");
  crumbId.className = "font-bold text-ink-900";
  crumbId.textContent = `Property #${listing.propertyId}`;
  crumbLeft.append(back, sep, crumbId);

  const crumbRight = document.createElement("div");
  crumbRight.className = "flex items-center gap-3";
  const publicLink = document.createElement("a");
  publicLink.href = `https://belmazad.com/auction/property/${encodeURIComponent(listing.propertyId)}`;
  publicLink.target = "_blank";
  publicLink.rel = "noopener noreferrer";
  publicLink.className = "inline-flex items-center gap-1.5 rounded-xl bg-white border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 shadow-sm transition";
  publicLink.innerHTML = `View Public Page <span aria-hidden="true">↗</span>`;
  const adminLink = document.createElement("a");
  adminLink.href = `https://belmazad.com/admin/property/add/${encodeURIComponent(listing.propertyId)}`;
  adminLink.target = "_blank";
  adminLink.rel = "noopener noreferrer";
  adminLink.className = "inline-flex items-center gap-1.5 rounded-xl bg-brand-600 border border-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm transition";
  adminLink.innerHTML = `Edit in Admin <span aria-hidden="true">↗</span>`;
  crumbRight.append(publicLink, adminLink);

  crumb.append(crumbLeft, crumbRight);

  const crumbRule = document.createElement("hr");
  crumbRule.className = "border-0 border-t border-ink-200 my-3";

  inner.append(crumb, crumbRule, layout);
  root.appendChild(inner);

  // ── Hero (mockup): image w/ gradient overlay + title/address on it,
  // flush divided action grid, then the description disclosure block.
  const hero = document.createElement("section");
  hero.className = "rounded-2xl bg-white shadow-sm border border-ink-100 overflow-hidden";

  const sold = isTrue(listing.propertySold);
  const heroImg = document.createElement("div");
  heroImg.className = "relative aspect-[16/9] bg-ink-200 group overflow-hidden";
  const img = document.createElement("img");
  const filename = (listing.propertyImages || "").trim();
  img.src = filename ? IMAGE_BASE_URL + filename : PLACEHOLDER_IMAGE;
  img.alt = listing.propertyName || "";
  img.className = "absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" + (sold ? " grayscale opacity-90" : "");
  img.addEventListener("error", () => { img.src = PLACEHOLDER_IMAGE; }, { once: true });
  const overlay = document.createElement("div");
  overlay.className = "absolute inset-0 z-0 bg-gradient-to-br from-brand-600/10 to-ink-900/60";
  heroImg.append(img, overlay);

  const badges = document.createElement("div");
  badges.className = "absolute top-4 right-4 z-10 flex flex-wrap justify-end gap-2";
  heroImg.appendChild(badges);

  const heroCaption = document.createElement("div");
  heroCaption.className = "absolute bottom-5 left-5 right-5 z-10 text-white";
  const title = document.createElement("h1");
  title.className = "text-2xl md:text-3xl font-bold leading-tight drop-shadow";
  title.textContent = listing.propertyName || `Listing ${listing.propertyId}`;
  const addr = document.createElement("p");
  addr.className = "text-sm font-medium text-white/90 mt-1";
  addr.textContent = [listing.propertyAddress].filter(Boolean).join(", ") || "—";
  heroCaption.append(title, addr);
  heroImg.appendChild(heroCaption);

  hero.appendChild(heroImg);

  // Flush action grid, attached directly under the image (no gap).
  hero.appendChild(buildActionsRow(listing));

  // DETAIL-18: collapsible description disclosure — its own bordered block.
  const descDisclosure = buildDescriptionDisclosure(listing);
  if (descDisclosure) hero.appendChild(descDisclosure);
  center.appendChild(hero);

  // Countdown ticker → floating status pills on the hero image (mockup style).
  const unsubscribe = subscribeCountdown(() => {
    const t = timeUntil(listing.endBidding);
    badges.innerHTML = "";
    if (listing.auctionType) badges.appendChild(heroPill(listing.auctionType, "bg-ink-900/80"));
    for (const k of listingStatusKinds(listing, t.bucket)) {
      const p = HERO_PILL[k];
      if (p) badges.appendChild(heroPill(p.t, p.c));
    }
  });

  // ── Build content sections ──────────────────────────────────────────────
  const isOffer = listing.auctionType === "Make An Offer";
  const sectionTitle = isOffer ? "Offers" : "Bidding";

  // DETAIL-30: Commercial Terms card removed at user request — Payment terms /
  // Price modifier / increments are no longer surfaced on the detail page.

  // DATA-04: searchProperty.highestBidder is a buyer/fuser id (highest
  // bidder for Online-Auction, highest offerer for Make-An-Offer). Resolve
  // it to a name via /buyer (lazy; render() re-runs on the setBuyer hydrate).
  // Until resolved (or on failure) show the bare #id so the row never blanks.
  const hbId = listing.highestBidder != null ? String(listing.highestBidder).trim() : "";
  let highestPersonLabel = null;
  if (hbId && hbId !== "0") {
    const bslice = getState().buyers[hbId];
    if (!bslice) hydrateBuyer(hbId);
    highestPersonLabel = (bslice && bslice.status === "ok")
      ? (personDisplayName(bslice) || `#${hbId}`)
      : `#${hbId}`;
  }

  const offersSection = section(sectionTitle, [
    [isOffer ? "Starting offer"      : "Start bid",         money(listing.start_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE)],
    [isOffer ? "Highest offer"       : "Current bid",       money(listing.current_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE)],
    ["Buy it now",                                          isTrue(listing.show_buy_it_now) ? money(listing.buy_it_now, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    [isOffer ? "Offer increments"    : "Bid increments",    listing.bidIncrements ? money(listing.bidIncrements, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    ["Market value",                                        listing.current_market_value ? money(listing.current_market_value, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    ["Guide price",                                         listing.auction_guide_price ? money(listing.auction_guide_price, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
    [isOffer ? "Total offers"        : "Total bids",        formatNumber(listing.no_of_bids)],
    [isOffer ? "Highest offerer"     : "Highest bidder",    highestPersonLabel],
    ["Sold amount",                                         isTrue(listing.propertySold) ? money(listing.soldAmount, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE) : null],
  ]);
  // Side rails use a single-column dl layout (narrower than the center)
  offersSection.querySelector("dl")?.classList.remove("sm:grid-cols-2");
  // DETAIL-15: Offers/Bidding flips to the negative (inverted) palette.
  applyNegativePalette(offersSection);

  const timingSection = darkCardShell("Auction Timing");
  const timingBody = document.createElement("div");
  timingBody.className = "relative z-10 space-y-5";
  timingSection.appendChild(timingBody);

  const timingRows = [
    ["Bidding starts", formatDateTime(listing.startBidding)],
    ["Bidding ends",   formatDateTime(listing.endBidding)],
    ["Expiry days",    listing.expiryDay],
    ["Listed on",      formatDate(listing.insertDate)],
    ["Days listed",    (() => { const d = daysSince(listing.insertDate); return d == null ? null : `${d} day${d === 1 ? "" : "s"}`; })()],
  ].filter(([, v]) => v != null && v !== "");
  const timingDlEl = document.createElement("dl");
  timingDlEl.className = "grid grid-cols-1 gap-y-2.5";
  for (const [k, v] of timingRows) {
    const r = document.createElement("div");
    r.className = "flex justify-between gap-3";
    const dt = document.createElement("dt");
    dt.className = "text-xs text-ink-400 font-medium";
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.className = "text-sm font-semibold text-white text-right";
    dd.textContent = v;
    r.append(dt, dd);
    timingDlEl.appendChild(r);
  }
  timingBody.appendChild(timingDlEl);

  const specsSection = buildSpecsCard(listing);

  // DETAIL-18: description moved out of the center column into a
  // collapsible disclosure inside the hero card (see buildDescriptionDisclosure
  // below). The old standalone section block has been removed.

  // DETAIL-23: searchProperty only ever returns the *Maker* (Broker) identity
  // in firstName/lastName/officeNumber — never the real seller. buildSellerSection
  // lazy-resolves the real Seller (Checker) + Broker (Maker) via WORKER-10 and
  // fails soft to today's single block (no regression) until it arrives.
  const sellerSection = buildSellerSection(listing);

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

  // Center order (DETAIL-30, user-set): hero → HubSpot → Offers/Registrations
  // → then everything else (Lawyers, Bank) shifted below.
  const hubspotCard = buildHubSpotReportSection(listing);
  center.appendChild(hubspotCard);

  // WORKER-08 / DETAIL-24: per-property demand card (READ-ONLY admin scrape).
  const isMakeOffer = listing.auctionType === "Make An Offer";
  const demandCard = isMakeOffer ? buildOffersSection(listing) : buildBiddersSection(listing);
  center.appendChild(demandCard);

  if (lawyersSection)     center.appendChild(lawyersSection);
  if (bankSection)        center.appendChild(bankSection);

  // Cursor-tracked shadow on every detail-page card except the hero
  // (photo + actions + description) — user request. Dark cards use the
  // "strong" preset to overcome their built-in Tailwind shadow-lg.
  attachCursorShadow(timingSection, { intensity: "strong" });
  attachCursorShadow(offersSection, { intensity: "strong" });
  for (const c of [specsSection, sellerSection, hubspotCard, demandCard,
                   lawyersSection, bankSection]) {
    if (c) attachCursorShadow(c);
  }

  // DETAIL-09: live "Starts in / Ends in" tile at the top of the Timing
  // section, styled with a negative (inverted) palette — dark background,
  // light foreground — to stand out from the rest of the timing rows.
  // DETAIL-14: starts hidden — the synchronous first tick from
  // subscribeCountdown will reveal it only when there's a real value to show.
  const timingCountdown = document.createElement("div");
  timingCountdown.className = "hidden";
  timingCountdown.innerHTML = `
    <div class="text-[10px] uppercase tracking-widest text-ink-300 font-bold timing-cd-label">—</div>
    <div class="mt-1 text-3xl font-extrabold text-insight-400 tabular-nums tracking-tight timing-cd-value">—</div>`;
  timingBody.insertBefore(timingCountdown, timingBody.firstChild);

  const tcLabel = timingCountdown.querySelector(".timing-cd-label");
  const tcValue = timingCountdown.querySelector(".timing-cd-value");

  // Coming-soon → purple. Active: <1h red, <1d amber, else green. Dark card,
  // so we use the lighter tone (-300/-400) for legibility on ink-900.
  const VALUE_BASE = "mt-1 text-3xl font-extrabold tabular-nums tracking-tight timing-cd-value";
  const timingTone = (t, coming) => {
    if (coming) return "text-brand-300";
    if (!Number.isFinite(t.ms)) return "text-ink-300";
    if (t.ms < 3600000) return "text-urgent-500";
    if (t.ms < 86400000) return "text-amber-400";
    return "text-insight-400";
  };

  const startMs = parseListingDate(listing.startBidding)?.getTime() ?? null;

  const unsubscribeTiming = subscribeCountdown((now) => {
    if (startMs != null && startMs > now) {
      const t = timeUntil(listing.startBidding, now);
      if (t.bucket === "unknown") {
        timingCountdown.classList.add("hidden");
      } else {
        tcLabel.textContent = "Starts in";
        tcValue.textContent = dhms(t);
        tcValue.className = `${VALUE_BASE} ${timingTone(t, true)}`;
        timingCountdown.classList.remove("hidden");
      }
    } else {
      const t = timeUntil(listing.endBidding, now);
      if (t.bucket === "ended" || t.bucket === "unknown") {
        timingCountdown.classList.add("hidden");
      } else {
        tcLabel.textContent = "Ends in";
        tcValue.textContent = dhms(t);
        tcValue.className = `${VALUE_BASE} ${timingTone(t, false)}`;
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
    if (initiateControl) timingBody.appendChild(initiateControl);
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
  wrap.className = "border-t border-ink-50";

  // Whole header row is the press target (no surrounding padding → compact
  // when collapsed); the segmented toggle floats absolutely on the right.
  const headerWrap = document.createElement("div");
  headerWrap.className = "relative";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");
  trigger.className = "w-full inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition";
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
  body.className = "prose prose-sm max-w-none text-ink-800 leading-relaxed px-6 pt-1 pb-6";

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
      const copyBtn = copyIconButton(() => prior.master_task_id, {
        size: 11,
        className: "text-ink-300 hover:text-white transition shrink-0",
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
    btn.className = "w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-800 hover:bg-ink-700 text-white px-3 py-2 text-sm font-semibold ring-1 ring-ink-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";
    btn.addEventListener("click", () => openInitiateAuctionModal(listing, () => paintInitiateControl(wrap, listing, startMs)));
  }

  wrap.appendChild(btn);
}

function openInitiateAuctionModal(listing, onSuccess) {
  const propertyId = String(listing.propertyId || "");
  const startDate  = parseListingDate(listing.startBidding);
  const startIso   = startDate ? startDate.toISOString() : null;
  const startLocal = startDate ? startDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

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
  input.className = "mt-1 w-full rounded-md border border-ink-200 px-3 py-2 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";
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
        const copyBtn = copyIconButton(() => taskId, {
          size: 12,
          className: "shrink-0 text-emerald-700 hover:text-emerald-900 transition",
        });
        row.append(lbl, val, copyBtn);
        success.appendChild(row);
      }

      modal.innerHTML = "";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "rounded-lg bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 text-sm font-semibold shadow-sm transition";
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

// Icon-only "copy to clipboard" button. On click: writes getText() to the
// clipboard and flips the glyph to ✓ for 1.2 s. Used by the operator
// "Auction initiated" tile and the modal success row. (The hero action tiles
// use their own label-swap variant in actionButton — intentionally separate.)
const COPY_ICON_PATH = `<path d="M7 3a2 2 0 00-2 2v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V5a2 2 0 00-2-2H7zm0 2h8v8h-1V8a2 2 0 00-2-2H7V5zM4 8h8v8H4V8z"/>`;
function copyIconButton(getText, { size = 12, className = "" } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Copy task ID";
  btn.className = className;
  btn.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${COPY_ICON_PATH}</svg>`;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      const originalHtml = btn.innerHTML;
      btn.textContent = "✓";
      setTimeout(() => { btn.innerHTML = originalHtml; }, 1200);
    } catch { /* silent */ }
  });
  return btn;
}

// DETAIL-15 / DETAIL-31: flip a cardShell() node to the negative (inverted)
// palette in-place — works WITH the unified header+body chrome (no longer
// clobbers the outer section, which would drop overflow/rounded and leave a
// light header strip on a dark body).
function applyNegativePalette(node) {
  node.className = "rounded-2xl bg-ink-900 shadow-lg border border-ink-800 overflow-hidden";
  const header = node._header;
  if (header) header.className = "px-5 py-4 border-b border-ink-800 bg-ink-900 flex items-center justify-between gap-3 flex-wrap";
  const h = node.querySelector("h2");
  if (h) h.className = "text-base font-bold text-white";
  for (const dt of node.querySelectorAll("dt")) {
    dt.className = "text-xs text-ink-400 font-medium uppercase tracking-wider";
  }
  for (const dd of node.querySelectorAll("dd")) {
    dd.className = "text-sm font-semibold text-white";
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

// Loading/auth/error note for a lazily-hydrated slice, or null when the slice
// is ready and the caller should render its data. `noun` fills the three
// shared copy strings (e.g. "offers", "registrations").
function sliceLoadNote(slice, noun) {
  const status = slice && slice.status;
  if (!slice || status === "loading") return reportSpinnerNote(`Loading ${noun}…`);
  if (status === "auth_error") return reportTextNote(`Sign in to view ${noun}.`, true);
  if (status === "error") return reportTextNote(slice.error || `Couldn't load ${noun}.`, true);
  return null;
}

// "NOT_STARTED" / "in-progress" → "Not Started" / "In Progress".
function humanizeKey(k) {
  return String(k).toLowerCase().replace(/[_\-]+/g, " ").trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// % of max, clamped to [min,100]; min keeps tiny non-zero values visible.
const clampPct = (n, max, min) =>
  (!Number.isFinite(n) || !Number.isFinite(max) || max <= 0)
    ? min : Math.max(min, Math.min(100, Math.round((n / max) * 100)));

function reportSubHead(title) {
  const h = document.createElement("h3");
  h.className = "text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-3";
  h.textContent = title;
  return h;
}

// One of the 3 roll-up tiles (Contacts / Deals / Tasks), colour-toned.
function metricTile(label, n, tone) {
  const T = {
    insight: ["bg-insight-50/60 border-insight-100", "text-insight-600", "text-insight-800"],
    brand:   ["bg-brand-50 border-brand-100",        "text-brand-600",   "text-brand-700"],
    amber:   ["bg-amber-50 border-amber-100",        "text-amber-600",   "text-amber-800"],
  }[tone];
  const d = document.createElement("div");
  d.className = `p-4 rounded-xl border ${T[0]}`;
  const k = document.createElement("div");
  k.className = `text-[10px] font-bold uppercase tracking-widest ${T[1]}`;
  k.textContent = label;
  const v = document.createElement("div");
  v.className = `text-3xl font-extrabold mt-1 tabular-nums ${T[2]}`;
  v.textContent = fmtCount(n);
  d.append(k, v);
  return d;
}

// Lead-bucket → colour tone + display order (user-specified).
const LEAD_TONE = {
  "Qualified": "green",
  "Not Contacted Yet": "amber", "In Trials": "amber", "In Progress": "amber", "Connected": "amber",
  "Unreachable": "red", "Not Qualified": "red",
  "Qualified CRM": "black", "Seller": "black", "Broker": "black",
};
const LEAD_TONE_CLS = {
  green: { track: "bg-insight-50", fill: "bg-insight-500", count: "text-insight-600" },
  amber: { track: "bg-amber-50",   fill: "bg-amber-500",   count: "text-amber-600" },
  red:   { track: "bg-urgent-50",  fill: "bg-urgent-500",  count: "text-urgent-600" },
  black: { track: "bg-ink-100",    fill: "bg-ink-700",     count: "text-ink-700" },
};
// Fixed display order (user-specified) — not by count.
const LEAD_ORDER = [
  "Qualified",
  "Not Contacted Yet", "In Trials", "In Progress", "Connected",
  "Unreachable", "Not Qualified",
  "Qualified CRM", "Seller", "Broker",
];
const leadOrder = (label) => {
  const i = LEAD_ORDER.indexOf(label);
  return i === -1 ? LEAD_ORDER.length : i;
};
const leadTone = (label) => LEAD_TONE[label] || "black";

// One leads-by-status row: label + count + proportional CSS bar (tone-coloured).
function leadBar(label, n, max) {
  const c = LEAD_TONE_CLS[leadTone(label)];
  const row = document.createElement("div");
  row.className = "space-y-1";
  const head = document.createElement("div");
  head.className = "flex justify-between text-[11px] font-semibold";
  const a = document.createElement("span");
  a.className = "text-ink-700";
  a.textContent = label;
  const b = document.createElement("span");
  b.className = `${c.count} tabular-nums`;
  b.textContent = fmtCount(n);
  head.append(a, b);
  const track = document.createElement("div");
  track.className = `h-2 w-full ${c.track} rounded-full overflow-hidden shadow-inner`;
  const fill = document.createElement("div");
  fill.className = `h-full ${c.fill} rounded-full`;
  fill.style.width = clampPct(n, max, 2) + "%";
  track.appendChild(fill);
  row.append(head, track);
  return row;
}

// Redesigned ready+data body: metric tiles + leads bars + deals funnel +
// task badges. Pure presentation off `data` — NO hooks/state here.
function buildReportBody(data) {
  const t = data.totals || {};
  const byBucket = (data.leadStatus && data.leadStatus.byBucket) || {};
  const leads = [];
  for (const [key, label] of Object.entries(HS_LEAD_STATUS_BUCKET_LABELS)) {
    const n = byBucket[key];
    if (!Number.isFinite(n) || n === 0) continue;
    leads.push([label, n]);
  }
  leads.sort((x, y) => leadOrder(x[0]) - leadOrder(y[0]));   // fixed order, not by count
  const isIncompleteStage = (label) => /incomplete|lost|cancel|abandon|stalled/i.test(label);
  const dealsRaw = (data.dealsByStage || [])
    .map(s => [s.label || s.stageId || "Stage", Number(s.count) || 0]);
  // Pipeline order preserved, except incomplete stage(s) are forced last.
  const deals = [
    ...dealsRaw.filter(([l]) => !isIncompleteStage(l)),
    ...dealsRaw.filter(([l]) =>  isIncompleteStage(l)),
  ];
  const tasks = Object.entries((data.tasks && data.tasks.byStatus) || {})
    .filter(([, v]) => Number.isFinite(v) && v > 0);

  const body = document.createElement("div");
  body.className = "p-6 space-y-8";

  const tiles = document.createElement("div");
  tiles.className = "grid grid-cols-3 gap-4";
  tiles.append(
    metricTile("Total Contacts", t.contacts, "insight"),
    metricTile("Open Deals", t.deals, "brand"),
    metricTile("Open Tasks", t.openTasks, "amber"),
  );
  body.appendChild(tiles);

  if (leads.length) {
    const sec = document.createElement("div");
    sec.appendChild(reportSubHead("Leads by status"));
    const list = document.createElement("div");
    list.className = "space-y-4";
    const max = Math.max(...leads.map(([, n]) => n));
    for (const [label, n] of leads) list.appendChild(leadBar(label, n, max));
    sec.appendChild(list);
    body.appendChild(sec);
  }

  if (deals.length) {
    const sec = document.createElement("div");
    sec.appendChild(reportSubHead("Deals by stage"));
    // Vertical bar chart; stage order preserved as the pipeline returns it
    // (no sorting). Bar height ∝ count. "Incomplete" stages render red.
    const chart = document.createElement("div");
    chart.className = "flex items-end gap-2 overflow-x-auto pb-1";
    const max = Math.max(...deals.map(([, n]) => n), 1);
    deals.forEach(([label, n]) => {
      const incomplete = isIncompleteStage(label);
      const col = document.createElement("div");
      col.className = "flex flex-col items-center gap-1.5 flex-1 min-w-[3rem]";
      const cnt = document.createElement("div");
      cnt.className = `text-[11px] font-extrabold tabular-nums ${incomplete ? "text-urgent-600" : "text-insight-700"}`;
      cnt.textContent = fmtCount(n);
      const plot = document.createElement("div");
      plot.className = "w-full h-36 flex items-end justify-center";
      const bar = document.createElement("div");
      bar.className = `w-[1.875rem] rounded-t-md shadow-sm ${incomplete
        ? "bg-gradient-to-t from-urgent-600 to-urgent-500 ring-1 ring-urgent-600"
        : "bg-gradient-to-t from-insight-600 to-insight-500 ring-1 ring-insight-600"}`;
      bar.style.height = clampPct(n, max, 2) + "%";
      plot.appendChild(bar);
      const lab = document.createElement("div");
      lab.className = "text-[10px] font-semibold text-ink-500 text-center leading-tight w-full truncate";
      lab.textContent = label;
      lab.title = label;
      col.append(cnt, plot, lab);
      chart.appendChild(col);
    });
    sec.appendChild(chart);
    body.appendChild(sec);
  }

  if (tasks.length) {
    const sec = document.createElement("div");
    sec.appendChild(reportSubHead("Tasks"));
    const badges = document.createElement("div");
    badges.className = "flex flex-wrap gap-2";
    for (const [k, v] of tasks) {
      const key = String(k).toLowerCase();
      const tone = /high|urgent|overdue/.test(key)
        ? "bg-urgent-50 text-urgent-600 border-urgent-100"
        : /medium|progress|await|pending/.test(key)
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-ink-100 text-ink-600 border-ink-200";
      const b = document.createElement("span");
      b.className = `px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${tone}`;
      b.textContent = `${fmtCount(v)} ${humanizeKey(k)}`;
      badges.appendChild(b);
    }
    sec.appendChild(badges);
    body.appendChild(sec);
  }
  return body;
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

// Lazy one-shot KV read on first open (see makeHydrator).
const hydrateReport = makeHydrator(fetchPropertyReport, setPropertyReport);

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
  let groups = null;
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
    groups = buildReportBody(data);   // metric tiles + bars + funnel + tasks
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

  const wrap = document.createElement("section");
  wrap.className = "rounded-2xl bg-white shadow-sm border border-ink-100 overflow-hidden";

  const header = document.createElement("div");
  header.className = "p-5 border-b border-ink-50 bg-ink-50/50 flex items-center justify-between gap-3 flex-wrap";
  const h2 = document.createElement("h2");
  h2.className = "text-base font-bold text-ink-900";
  h2.textContent = "HubSpot Performance";
  const headRight = document.createElement("div");
  headRight.className = "flex items-center gap-3 flex-wrap";

  const stamp = document.createElement("span");
  stamp.className = "text-[10px] font-bold uppercase tracking-widest text-ink-400";
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

  headRight.append(stamp, btn);
  header.append(h2, headRight);
  wrap.appendChild(header);
  if (groups) {
    wrap.appendChild(groups);                 // buildReportBody already padded
  } else if (note) {
    const nb = document.createElement("div");
    nb.className = "p-6";
    nb.appendChild(note);
    wrap.appendChild(nb);
  }
  return wrap;
}

// ── WORKER-08: per-property offers card ──────────────────────────────────
// Read-only. The Worker scrapes the admin offers list with a cached admin
// session and returns parsed JSON; this card just renders it. One-shot lazy
// hydrate on open (no polling, no refresh — offers change slowly and a page
// reload re-fetches). State lives in state.propertyOffers[id].

const hydrateOffers = makeHydrator(fetchPropertyOffers, setPropertyOffers);

// STYLE-05: status pill colouring. Shared by the Offers History card
// (Maker/Checker/Belmazad) and the Auction Registrations card
// (Payment/Status). NEGATIVE is tested FIRST so "Unapproved" / "Unpaid"
// don't fall into the positive "approv"/"paid" match (the original bug:
// "Unapproved" contains "approv" → wrongly green). Pending → amber.
function offerStatusPill(text) {
  const t = String(text || "").trim();
  const s = document.createElement("span");
  s.className = `inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL_CLS[statusKind(t)]}`;
  s.textContent = t || "—";
  return s;
}

// "Label:" caption + a coloured status pill, used in the Offers History and
// Auction Registrations cards.
function statusChip(label, value) {
  const g = document.createElement("span");
  g.className = "inline-flex items-center gap-1 text-[10px] text-ink-400";
  const l = document.createElement("span");
  l.textContent = `${label}:`;
  g.append(l, offerStatusPill(value));
  return g;
}

function offerNumericValue(o) {
  if (Number.isFinite(o.priceValue)) return o.priceValue;
  const n = Number(String(o.price || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : -Infinity;
}

// Price label with the offer's own currency ($, £, …) — never assume EGP;
// Make-An-Offer listings are frequently USD. Falls back to the bare amount
// if no symbol was parsed, and to "—" when there's no price at all.
function offerPriceLabel(o) {
  if (!o.price) return "—";
  return o.currency ? `${o.currency} ${o.price}` : o.price;
}

function buildOffersSection(listing) {
  const id = String(listing.propertyId || "");
  const slice = getState().propertyOffers[id];
  if (!slice) hydrateOffers(id);

  const wrap = cardShell("Offers History");

  const loadNote = sliceLoadNote(slice, "offers");
  if (loadNote) { cardBody(wrap).appendChild(loadNote); return wrap; }

  const offers = Array.isArray(slice.offers) ? slice.offers : [];
  if (!offers.length) {
    cardBody(wrap).appendChild(reportTextNote("No offers on this property yet."));
    return wrap;
  }

  // Highest by numeric value (ties → first seen wins).
  let highestId = null;
  let highestVal = -Infinity;
  for (const o of offers) {
    const v = offerNumericValue(o);
    if (v > highestVal) { highestVal = v; highestId = o.offerId; }
  }

  const list = document.createElement("div");
  list.className = "space-y-3 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar";
  for (const o of offers) {
    const isTop = o.offerId === highestId;
    const kind = statusKind(o.checkerStatus || o.makerStatus || o.belmazadStatus);
    const card = document.createElement("div");
    card.className = "relative overflow-hidden p-3 pl-4 rounded-xl border shadow-sm "
      + (isTop ? "border-insight-300 bg-insight-50/50" : "border-ink-100 bg-white");
    const accent = document.createElement("span");
    accent.className = `absolute left-0 top-0 bottom-0 w-1 ${STATUS_BORDER_CLS[kind]}`;
    card.appendChild(accent);

    const top = document.createElement("div");
    top.className = "flex items-start justify-between gap-3 flex-wrap";

    const who = document.createElement("div");
    who.className = "min-w-0";
    const name = document.createElement("div");
    name.className = "text-sm font-semibold text-ink-900 truncate";
    name.textContent = o.userName || "—";
    const when = document.createElement("div");
    when.className = "text-xs text-ink-400 mt-0.5";
    when.textContent = o.date || "";
    who.append(name, when);

    const priceWrap = document.createElement("div");
    priceWrap.className = "text-right shrink-0";
    const price = document.createElement("div");
    price.className = "text-sm font-semibold tabular-nums " + (isTop ? "text-emerald-700" : "text-ink-900");
    price.textContent = offerPriceLabel(o);
    priceWrap.appendChild(price);
    if (isTop) {
      const tag = document.createElement("span");
      tag.className = "inline-block mt-0.5 rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
      tag.textContent = "Highest";
      priceWrap.appendChild(tag);
    }
    top.append(who, priceWrap);
    card.appendChild(top);

    const statuses = document.createElement("div");
    statuses.className = "mt-2 flex items-center gap-2 flex-wrap";
    statuses.append(
      statusChip("Maker", o.makerStatus),
      statusChip("Checker", o.checkerStatus),
      statusChip("Belmazad", o.belmazadStatus),
    );
    card.appendChild(statuses);

    if (o.notes) {
      const n = document.createElement("p");
      n.className = "mt-2 text-xs text-ink-600 whitespace-pre-line break-words";
      n.textContent = o.notes;
      card.appendChild(n);
    }
    list.appendChild(card);
  }
  cardBody(wrap).appendChild(list);

  const foot = document.createElement("div");
  foot.className = "mt-4 text-xs text-ink-400";
  const topOffer = offers.find(o => o.offerId === highestId);
  foot.textContent = `${offers.length} offer${offers.length === 1 ? "" : "s"}`
    + (topOffer && topOffer.price ? ` · highest ${offerPriceLabel(topOffer)} by ${topOffer.userName || "—"}` : "");
  cardBody(wrap).appendChild(foot);

  return wrap;
}

// ── DETAIL-23: real Seller (Checker) + Broker (Maker) ────────────────────
// searchProperty bakes in only the Maker identity. WORKER-10 resolves both
// from the admin index + per-id agent edit pages. One-shot lazy hydrate;
// fail-soft to today's single block (no regression) on loading/error.

const hydrateEntities = makeHydrator(fetchPropertyEntities, setPropertyEntities);

// DATA-04: one-shot lazy resolve of a buyer/fuser id → name (+ contact).
const hydrateBuyer = makeHydrator(fetchBuyer, setBuyer);

function personDisplayName(p, fallbackName) {
  if (!p) return fallbackName || "";
  const composed = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return (p.businessName && p.businessName.trim())
    || composed
    || (p.name && p.name.trim())
    || fallbackName || "";
}

// Single-column label/value list (left-rail width); mirrors section()'s <dl>.
// Used by the fail-soft fallback only.
function sellerDl(rows) {
  return kvList(rows, { columns: 1 });
}

function initials2(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

// Role-coloured initials avatar (mockup): Seller=insight, Broker=brand.
function avatarFor(name, role) {
  const c = role === "broker"
    ? "bg-brand-50 text-brand-600 ring-brand-100"
    : "bg-insight-50 text-insight-600 ring-insight-100";
  const s = document.createElement("span");
  s.className = `h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ring-1 ${c}`;
  s.textContent = initials2(name);
  s.setAttribute("aria-hidden", "true");
  return s;
}

// Mockup person row: avatar + role label + bold name + contact lines.
function personBlock(roleLabel, role, person, fallbackName, extraRows) {
  const name = personDisplayName(person, fallbackName);
  const row = document.createElement("div");
  row.className = "flex items-start gap-3";
  row.appendChild(avatarFor(name, role));
  const col = document.createElement("div");
  col.className = "min-w-0";
  const rl = document.createElement("div");
  rl.className = "text-[9px] uppercase font-bold tracking-wider mb-0.5 "
    + (role === "broker" ? "text-brand-600" : "text-insight-600");
  rl.textContent = roleLabel;
  const nm = document.createElement("div");
  nm.className = "font-bold text-ink-900 text-sm break-words";
  nm.textContent = name || "Not assigned";
  col.append(rl, nm);
  const lines = [];
  const email = person && person.email && person.email !== "super admin" ? person.email : null;
  if (email) lines.push(email);
  if (person && person.phone) lines.push(person.phone);
  if (person && person.city) lines.push(person.city);
  for (const ln of lines) {
    const p = document.createElement("div");
    p.className = "text-[11px] text-ink-500 mt-0.5 break-words";
    p.textContent = ln;
    col.appendChild(p);
  }
  if (extraRows) for (const [k, v] of extraRows) {
    if (v == null || v === "") continue;
    const p = document.createElement("div");
    p.className = "text-[11px] text-ink-500 mt-0.5";
    p.textContent = `${k}: ${v}`;
    col.appendChild(p);
  }
  row.appendChild(col);
  return row;
}

function buildSellerSection(listing) {
  const id = String(listing.propertyId || "");
  const slice = getState().propertyEntities[id];
  if (!slice) hydrateEntities(id);

  const wrap = cardShell("Seller & Broker");

  // searchProperty exposes only the Maker identity — the fail-soft fallback.
  const legacyName = [listing.firstName, listing.middleName, listing.lastName].filter(Boolean).join(" ").trim();
  const legacyRows = [
    ["Name",         legacyName],
    ["Seller type",  decode("sellerType", listing.sellerType)],
    ["Email",        listing.email && listing.email !== "super admin" ? listing.email : null],
    ["Office phone", listing.officeNumber],
  ];

  const status = slice && slice.status;

  if (status === "ok") {
    const stack = document.createElement("div");
    stack.className = "space-y-4";

    // Seller = the real seller (Checker) — on top.
    stack.appendChild(personBlock(
      "Assigned Seller (Checker)", "seller", slice.checker, null,
      [["Seller type", decode("sellerType", listing.sellerType)]],
    ));

    const hr = document.createElement("hr");
    hr.className = "border-ink-100";
    stack.appendChild(hr);

    // Broker = the listing entity (Maker). Falls back to searchProperty maker.
    const makerFallback = slice.maker ? null : {
      firstName: listing.firstName, lastName: listing.lastName,
      email: listing.email && listing.email !== "super admin" ? listing.email : null,
      phone: listing.officeNumber,
    };
    stack.appendChild(personBlock(
      "Listing Broker (Maker)", "broker", slice.maker || makerFallback, legacyName,
    ));

    cardBody(wrap).appendChild(stack);
    return wrap;
  }

  // Still resolving /entities → quiet skeleton, NOT the legacy searchProperty
  // block (avoids the load-then-override flash the user flagged).
  if (!slice || status === "loading") {
    const ph = document.createElement("div");
    ph.className = "flex items-start gap-3";
    ph.innerHTML = `<div class="h-10 w-10 rounded-full bg-ink-100 shimmer shrink-0"></div><div class="flex-1 space-y-2 pt-1"><div class="h-2.5 w-20 bg-ink-100 rounded shimmer"></div><div class="h-3 w-32 bg-ink-100 rounded shimmer"></div><div class="h-2.5 w-40 bg-ink-100 rounded shimmer"></div></div>`;
    cardBody(wrap).appendChild(ph);
    return wrap;
  }

  // /entities failed (error / auth / empty / not_found) → true fail-soft to
  // the legacy searchProperty block so the card never goes blank.
  cardBody(wrap).appendChild(sellerDl(legacyRows));
  return wrap;
}

// ── DETAIL-24: auction registrations card (Online-Auction only) ──────────
// The auction-side mirror of the Offers History card. READ-ONLY admin scrape
// of the "Bidders List" via WORKER-11; one-shot lazy hydrate.

const hydrateBidders = makeHydrator(fetchPropertyBidders, setPropertyBidders);

function buildBiddersSection(listing) {
  const id = String(listing.propertyId || "");
  const slice = getState().propertyBidders[id];
  if (!slice) hydrateBidders(id);

  const wrap = cardShell("Auction Registrations");

  const loadNote = sliceLoadNote(slice, "registrations");
  if (loadNote) { cardBody(wrap).appendChild(loadNote); return wrap; }

  const bidders = Array.isArray(slice.bidders) ? slice.bidders : [];
  if (!bidders.length) {
    cardBody(wrap).appendChild(reportTextNote("No registrations on this auction yet."));
    return wrap;
  }

  const list = document.createElement("div");
  list.className = "space-y-3 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar";
  for (const b of bidders) {
    const kind = statusKind(b.status || b.paymentStatus);
    const card = document.createElement("div");
    card.className = "relative overflow-hidden p-3 pl-4 bg-white rounded-xl border border-ink-100 shadow-sm"
      + (kind === "negative" ? " opacity-70" : "");
    const accent = document.createElement("span");
    accent.className = `absolute left-0 top-0 bottom-0 w-1 ${STATUS_BORDER_CLS[kind]}`;
    card.appendChild(accent);

    const top = document.createElement("div");
    top.className = "flex items-start justify-between gap-3 flex-wrap";
    const who = document.createElement("div");
    who.className = "min-w-0";
    const name = document.createElement("div");
    name.className = "text-sm font-semibold text-ink-900 truncate";
    name.textContent = b.name || "—";
    const contact = document.createElement("div");
    contact.className = "text-xs text-ink-400 mt-0.5 truncate";
    contact.textContent = [b.email, b.phone].filter(Boolean).join(" · ");
    who.append(name, contact);

    const when = document.createElement("div");
    when.className = "text-right shrink-0";
    const reg = document.createElement("div");
    reg.className = "text-xs text-ink-500";
    reg.textContent = b.registeredOn || "";
    when.appendChild(reg);
    top.append(who, when);
    card.appendChild(top);

    const statuses = document.createElement("div");
    statuses.className = "mt-2 flex items-center gap-2 flex-wrap";
    if (b.paymentStatus) statuses.appendChild(statusChip("Payment", b.paymentStatus));
    if (b.status) statuses.appendChild(statusChip("Status", b.status));
    if (statuses.childNodes.length) card.appendChild(statuses);

    const meta = [];
    if (b.state) meta.push(b.state);
    if (b.address) meta.push(b.address);
    if (meta.length) {
      const m = document.createElement("p");
      m.className = "mt-2 text-xs text-ink-600 break-words";
      m.textContent = meta.join(" — ");
      card.appendChild(m);
    }

    const docs = document.createElement("div");
    docs.className = "mt-2 flex items-center gap-3 flex-wrap";
    const docLink = (label, href) => {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "text-[11px] font-medium text-sky-700 hover:underline";
      a.textContent = label;
      return a;
    };
    if (b.pofDocUrl) docs.appendChild(docLink("Proof of funds", b.pofDocUrl));
    if (b.bookletDocUrl) docs.appendChild(docLink("Terms booklet", b.bookletDocUrl));
    if (docs.childNodes.length) card.appendChild(docs);

    list.appendChild(card);
  }
  cardBody(wrap).appendChild(list);

  const foot = document.createElement("div");
  foot.className = "mt-4 text-xs text-ink-400";
  foot.textContent = `${bidders.length} registration${bidders.length === 1 ? "" : "s"}`;
  cardBody(wrap).appendChild(foot);
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
  // WORKER-07: terms-booklet PDF download.
  pdf:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm8 1.5V6a1 1 0 001 1h2.5L12 3.5zM6 11a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>`,
  copy:     `<svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 3a2 2 0 00-2 2v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1h1a2 2 0 002-2V5a2 2 0 00-2-2H7zm0 2h8v8h-1V8a2 2 0 00-2-2H7V5zM4 8h8v8H4V8z"/></svg>`,
};

function actionButton({ label, url, palette, icon, noCopy }) {
  const wrap = document.createElement("div");
  wrap.className = "group relative";

  // Icons sit in a centred 24px box but draw at 20px, so edge-bleeding
  // glyphs (e.g. the YouTube logo) keep margin and never look clipped.
  const iconBox = "mb-1.5 inline-flex h-6 w-6 items-center justify-center shrink-0 [&_svg]:w-5 [&_svg]:h-5";
  const labelCls = "w-full text-center leading-tight text-[9px] font-bold uppercase tracking-widest";

  if (!url) {
    const dis = document.createElement("div");
    dis.className = "flex flex-col items-center justify-center p-4 min-w-0 bg-ink-200 text-ink-400 cursor-not-allowed select-none";
    dis.innerHTML = `<span class="${iconBox}">${icon}</span><span class="${labelCls}">N/A</span>`;
    wrap.appendChild(dis);
    return wrap;
  }

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = `flex flex-col items-center justify-center p-4 min-w-0 ${palette} text-white transition`;
  a.innerHTML = `<span class="${iconBox} group-hover:scale-110 transition-transform">${icon}</span><span class="${labelCls}">${label}</span>`;
  wrap.appendChild(a);

  if (noCopy) return wrap;

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

// WORKER-07: probe results cached per propertyId for the module's lifetime.
// `render()` rebuilds the whole tree on every setState, so without this we'd
// re-probe the Worker on each rebuild. Value is `boolean` once resolved, or
// the in-flight `Promise<boolean>` while the first probe is pending.
const bookletProbeCache = new Map();

// WORKER-07: always 5 tiles (Maps/VR/YouTube/Photos/Booklet). Booklet behaves
// exactly like VR tour / YouTube — present but greyed "N/A" when unavailable.
// 3-up at sm / 5-up at lg so the longest label never cramps at mid widths.
const ACTIONS_GRID = "grid grid-cols-5 divide-x divide-white/10 shadow-inner";

const bookletTile = (url) => actionButton({
  label:   "Booklet",
  url,                       // null ⇒ disabled "N/A" tile, same as VR/YouTube
  palette: "bg-sky-700 hover:bg-sky-800",
  icon:    ACTION_ICONS.pdf,
  noCopy:  true,             // download endpoint — no shareable link to copy
});

// The Booklet tile is always rendered. Whether the property actually has a
// booklet isn't in the listing data, so a scrape-only probe decides enabled
// vs. the disabled N/A state. We render N/A first and upgrade to the live
// link when the probe confirms — never the reverse, so a click during the
// probe window can't hit a property that turns out to have no booklet.
function buildBookletTile(listing, bookletUrl) {
  const id = listing.propertyId;
  if (!id || !bookletUrl) return bookletTile(null);

  const cached = bookletProbeCache.get(id);
  if (cached === true) return bookletTile(bookletUrl);
  if (cached === false) return bookletTile(null);

  const holder = bookletTile(null);
  let p = cached instanceof Promise ? cached : null;
  if (!p) {
    p = probeBooklet(id).then((ok) => { bookletProbeCache.set(id, ok); return ok; });
    bookletProbeCache.set(id, p);
  }
  p.then((ok) => {
    if (!ok || !holder.isConnected) return;     // absent, or row replaced
    holder.replaceWith(bookletTile(bookletUrl)); // swap N/A → live link
  });
  return holder;
}

function buildActionsRow(listing) {
  const row = document.createElement("div");
  row.className = ACTIONS_GRID;
  const galleryZipUrl = listing.propertyId
    ? `${WORKER_URL}gallery.zip?id=${encodeURIComponent(listing.propertyId)}`
    : null;
  const bookletUrl = listing.propertyId
    ? `${WORKER_URL}booklet?id=${encodeURIComponent(listing.propertyId)}`
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
      noCopy:  true,           // zip download endpoint — no shareable link
    }),
    // WORKER-07: always present; N/A until the probe confirms a booklet.
    buildBookletTile(listing, bookletUrl),
  );
  return row;
}
