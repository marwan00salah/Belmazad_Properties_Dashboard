import { IMAGE_BASE_URL, IMAGE_THUMB_BASE_URL, PLACEHOLDER_IMAGE } from "../config.js";
import { money, formatNumber, timeUntil, isTrue, bidValueLabel, offerNoun } from "../format.js";
import { statusBadge, listingStatusKinds } from "./statusBadge.js";
import { subscribeCountdown } from "../countdown.js";

const COUNTDOWN_CLASS = {
  normal: "text-ink-700",
  soon:   "text-amber-700",
  urgent: "text-red-700",
  ended:  "text-ink-400",
  unknown:"text-ink-400",
};

export function renderCard(listing) {
  const card = document.createElement("a");
  card.href = `#/property/${encodeURIComponent(listing.propertyId)}`;
  card.className = "group relative block rounded-xl bg-white shadow-sm ring-1 ring-ink-100 overflow-hidden transition will-change-transform hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600";
  card.setAttribute("aria-label", listing.propertyName || `Listing ${listing.propertyId}`);

  const sold = isTrue(listing.propertySold);

  // Image
  const imgWrap = document.createElement("div");
  imgWrap.className = "relative aspect-[16/10] bg-ink-100 overflow-hidden";
  const img = document.createElement("img");
  const filename = (listing.propertyImages || "").trim();
  img.src = filename ? IMAGE_THUMB_BASE_URL + filename : PLACEHOLDER_IMAGE;
  img.loading = "lazy";
  img.alt = listing.propertyName || "";
  img.className = `h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${sold ? "grayscale opacity-80" : ""}`;
  // Thumb → full-size fallback → placeholder
  let imgErrored = false;
  img.addEventListener("error", () => {
    if (imgErrored) return;
    imgErrored = true;
    if (filename && img.src.includes("/Thumb/")) img.src = IMAGE_BASE_URL + filename;
    else img.src = PLACEHOLDER_IMAGE;
  });
  imgWrap.appendChild(img);

  // Badges (top-right)
  const badges = document.createElement("div");
  badges.className = "absolute top-2 right-2 flex flex-wrap gap-1 justify-end";
  imgWrap.appendChild(badges);

  // Body
  const body = document.createElement("div");
  body.className = "p-4 flex flex-col gap-2";

  const name = document.createElement("h3");
  name.className = "text-sm font-semibold text-ink-900 leading-snug line-clamp-2 min-h-[2.5rem]";
  name.textContent = listing.propertyName || "Untitled listing";

  const where = document.createElement("p");
  where.className = "text-xs text-ink-500 truncate";
  where.textContent = [listing.cityName, listing.countryName].filter(Boolean).join(", ");

  const bidRow = document.createElement("div");
  bidRow.className = "flex items-end justify-between pt-1";
  const bid = document.createElement("div");
  bid.className = "flex flex-col";
  bid.innerHTML = `
    <span class="text-[10px] uppercase tracking-wider text-ink-500 font-medium">${bidValueLabel(listing.auctionType)}</span>
    <span class="text-lg font-semibold text-ink-900 tabular-nums">${money(listing.current_bid, listing.CURRENCY_SYMBOL || listing.CURRENCY_CODE)}</span>
  `;
  const bids = document.createElement("div");
  bids.className = "text-xs text-ink-500 tabular-nums text-right";
  const nBids = Number(listing.no_of_bids || 0);
  const noun = offerNoun(listing.auctionType);
  bids.innerHTML = `<div class="font-medium text-ink-700">${formatNumber(nBids)}</div><div>${noun}${nBids === 1 ? "" : "s"}</div>`;
  bidRow.append(bid, bids);

  const countdown = document.createElement("div");
  countdown.className = "mt-1 inline-flex items-center gap-1.5 text-xs font-medium";

  // Auction type label (subtle)
  if (listing.auctionType) {
    const at = document.createElement("div");
    at.className = "mt-1 text-[11px] text-ink-500";
    at.textContent = listing.auctionType;
    body.append(name, where, bidRow, countdown, at);
  } else {
    body.append(name, where, bidRow, countdown);
  }

  card.append(imgWrap, body);

  // Live countdown + badges
  const unsubscribe = subscribeCountdown(() => {
    const t = timeUntil(listing.endBidding);
    countdown.innerHTML = "";
    const ico = document.createElement("span");
    ico.className = `inline-block h-1.5 w-1.5 rounded-full ${ t.bucket === "urgent" ? "bg-urgent animate-pulse" : t.bucket === "soon" ? "bg-warn" : t.bucket === "ended" ? "bg-ink-300" : "bg-emerald-500" }`;
    countdown.appendChild(ico);
    const label = document.createElement("span");
    label.className = COUNTDOWN_CLASS[t.bucket] || "text-ink-700";
    label.textContent = t.text;
    countdown.appendChild(label);

    // refresh badges
    badges.innerHTML = "";
    for (const k of listingStatusKinds(listing, t.bucket)) {
      const b = statusBadge(k);
      if (b) badges.appendChild(b);
    }
  });

  // Clean up subscription if card is removed from DOM
  card.__cleanup = unsubscribe;
  return card;
}
