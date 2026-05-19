import { IMAGE_BASE_URL, IMAGE_THUMB_BASE_URL, PLACEHOLDER_IMAGE } from "../config.js";
import { money, formatNumber, timeUntil, isTrue, bidValueLabel, offerNoun } from "../format.js";
import { listingStatusKinds } from "./statusBadge.js";
import { subscribeCountdown } from "../countdown.js";
import { attachCursorShadow } from "../cursorShadow.js";

const PIN = `<svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;

// status kind → overlay pill (mockup style). "sold" → centre stamp instead.
const KIND_PILL = {
  live:   { t: "Live",        c: "bg-insight-500" },
  soon:   { t: "Ending Soon", c: "bg-urgent-500 animate-pulse" },
  urgent: { t: "Ending Soon", c: "bg-urgent-500 animate-pulse" },
  coming: { t: "Coming Soon", c: "bg-brand-500" },
  ended:  { t: "Ended",       c: "bg-ink-500" },
};

// countdown bucket → timing-footer chip (wrapper bg / accent text colour)
// Coming-soon → purple (brand). Active: <1h → red, <1d → amber, else green.
// Sold/ended → ink; unknown → neutral.
const HOUR_MS = 3600000, DAY_MS = 86400000;
function footerStyle(t, sold, coming) {
  if (sold || t.bucket === "ended") return { wrap: "bg-ink-100",   txt: "text-ink-500" };
  if (!Number.isFinite(t.ms))       return { wrap: "bg-ink-50",    txt: "text-ink-500" };
  if (coming)                       return { wrap: "bg-brand-50",  txt: "text-brand-700" };
  if (t.ms < HOUR_MS)               return { wrap: "bg-urgent-50", txt: "text-urgent-600" };
  if (t.ms < DAY_MS)                return { wrap: "bg-amber-50",  txt: "text-amber-600" };
  return { wrap: "bg-insight-50", txt: "text-insight-600" };
}

const pad = (n) => String(n).padStart(2, "0");

// Big centred countdown: caption + d h m s (units in smaller, dimmer type).
// Falls back to a short status word when there's no live countdown.
function footerInner(t, sold, txtCls) {
  if (sold)                return `<span class="text-sm font-bold uppercase tracking-widest ${txtCls}">Auction Closed</span>`;
  if (t.bucket === "ended")  return `<span class="text-sm font-bold uppercase tracking-widest ${txtCls}">Auction Ended</span>`;
  if (t.bucket === "unknown" || t.days == null)
    return `<span class="text-sm font-bold uppercase tracking-widest ${txtCls}">${t.text}</span>`;
  const u = `text-xs font-bold ${txtCls} opacity-60`;
  return `
    <div class="text-[9px] font-bold uppercase tracking-widest ${txtCls} opacity-70 mb-1">Ends in</div>
    <div class="text-2xl font-extrabold tabular-nums leading-none ${txtCls} flex items-baseline justify-center gap-1">
      <span>${t.days}</span><span class="${u} mr-1">d</span>
      <span>${pad(t.hours)}</span><span class="${u} mr-1">h</span>
      <span>${pad(t.minutes)}</span><span class="${u} mr-1">m</span>
      <span>${pad(t.seconds)}</span><span class="${u}">s</span>
    </div>`;
}

export function renderCard(listing) {
  const sold = isTrue(listing.propertySold);

  const card = document.createElement("a");
  card.href = `#/property/${encodeURIComponent(listing.propertyId)}`;
  card.className = "group flex flex-col bg-white rounded-2xl shadow-sm border border-ink-100 overflow-hidden hover:shadow-md hover:-translate-y-1 hover:border-brand-200 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" +
    (sold ? " opacity-80" : "");
  card.setAttribute("aria-label", listing.propertyName || `Listing ${listing.propertyId}`);

  // ── Image ──────────────────────────────────────────────────────────────
  const imgWrap = document.createElement("div");
  imgWrap.className = `aspect-[4/3] ${sold ? "bg-ink-200" : "bg-ink-100"} relative overflow-hidden`;
  const img = document.createElement("img");
  const filename = (listing.propertyImages || "").trim();
  img.src = filename ? IMAGE_THUMB_BASE_URL + filename : PLACEHOLDER_IMAGE;
  img.loading = "lazy";
  img.alt = listing.propertyName || "";
  img.className = "w-full h-full object-cover transition-transform duration-500 " +
    (sold ? "grayscale opacity-60" : "group-hover:scale-105");
  let imgErrored = false;
  img.addEventListener("error", () => {
    if (imgErrored) return;
    imgErrored = true;
    if (filename && img.src.includes("/Thumb/")) img.src = IMAGE_BASE_URL + filename;
    else img.src = PLACEHOLDER_IMAGE;
  });
  imgWrap.appendChild(img);

  const idBadge = document.createElement("span");
  idBadge.className = "absolute top-3 left-3 z-10 bg-ink-900/80 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm uppercase tracking-wider backdrop-blur-sm";
  idBadge.textContent = `#${listing.propertyId}`;
  imgWrap.appendChild(idBadge);

  const badges = document.createElement("div");
  badges.className = "absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5";
  imgWrap.appendChild(badges);

  if (sold) {
    const stamp = document.createElement("div");
    stamp.className = "absolute inset-0 flex items-center justify-center z-10";
    stamp.innerHTML = `<span class="bg-ink-900/80 text-white text-lg font-extrabold px-6 py-2 rounded-lg shadow-sm uppercase tracking-widest backdrop-blur-sm -rotate-12 border-2 border-white/20">Sold</span>`;
    imgWrap.appendChild(stamp);
  }

  // ── Content ────────────────────────────────────────────────────────────
  const body = document.createElement("div");
  body.className = "p-4 flex flex-col flex-1";

  const titleBlock = document.createElement("div");
  titleBlock.className = "mb-3";
  const h3 = document.createElement("h3");
  h3.className = "text-sm font-bold line-clamp-2 leading-tight transition-colors " +
    (sold ? "text-ink-500" : "text-ink-900 group-hover:text-brand-600");
  h3.textContent = listing.propertyName || "Untitled listing";
  const loc = document.createElement("p");
  loc.className = "text-[11px] mt-1 flex items-center gap-1 " + (sold ? "text-ink-400" : "text-ink-500");
  loc.innerHTML = PIN;
  const locText = document.createElement("span");
  locText.className = "truncate";
  locText.textContent = [listing.cityName, listing.countryName].filter(Boolean).join(", ");
  loc.appendChild(locText);
  titleBlock.append(h3, loc);

  const row = document.createElement("div");
  row.className = "flex justify-between items-end mt-auto pt-3 border-t border-ink-100";
  const priceCol = document.createElement("div");
  const priceLabel = document.createElement("div");
  priceLabel.className = "text-[9px] font-bold text-ink-400 uppercase tracking-widest mb-0.5";
  priceLabel.textContent = bidValueLabel(listing.auctionType);
  const priceVal = document.createElement("div");
  priceVal.className = "text-lg font-extrabold leading-none " + (sold ? "text-ink-700" : "text-ink-900");
  priceVal.textContent = money(listing.current_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE);
  priceCol.append(priceLabel, priceVal);

  const nBids = Number(listing.no_of_bids || 0);
  const noun = offerNoun(listing.auctionType);
  const bidsCol = document.createElement("div");
  bidsCol.className = "text-right";
  const bidsLabel = document.createElement("div");
  bidsLabel.className = "text-[9px] font-bold text-ink-400 uppercase tracking-widest mb-0.5";
  bidsLabel.textContent = `${noun}${nBids === 1 ? "" : "s"}`;
  const bidsVal = document.createElement("div");
  bidsVal.className = "text-lg font-extrabold leading-none " + (sold ? "text-ink-700" : "text-ink-900");
  bidsVal.textContent = formatNumber(nBids);
  bidsCol.append(bidsLabel, bidsVal);
  row.append(priceCol, bidsCol);

  const footer = document.createElement("div");
  footer.className = "mt-3 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center text-center";

  body.append(titleBlock, row, footer);
  card.append(imgWrap, body);

  // ── Live countdown + status pills ─────────────────────────────────────
  const unsubscribe = subscribeCountdown(() => {
    const t = timeUntil(listing.endBidding);
    const kinds = listingStatusKinds(listing, t.bucket);
    const coming = kinds.includes("coming");

    badges.innerHTML = "";
    for (const k of kinds) {
      const p = KIND_PILL[k];
      if (!p) continue; // "sold" → handled by the centre stamp
      const s = document.createElement("span");
      s.className = `${p.c} bg-opacity-90 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm uppercase tracking-wider backdrop-blur-sm`;
      s.textContent = p.t;
      badges.appendChild(s);
    }

    const fs = footerStyle(t, sold, coming);
    footer.className = `mt-3 rounded-xl px-3 py-2.5 flex flex-col items-center justify-center text-center ${fs.wrap}`;
    footer.innerHTML = footerInner(t, sold, fs.txt);
  });

  card.__cleanup = unsubscribe;
  attachCursorShadow(card);
  return card;
}
