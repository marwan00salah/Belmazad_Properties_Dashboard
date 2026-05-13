import { isTrue } from "../format.js";

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

export function statusBadge(kind) {
  const map = {
    live:       { label: "Live",        cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-ok animate-pulse" },
    soon:       { label: "Ending soon", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",       dot: "bg-warn" },
    urgent:     { label: "Urgent",      cls: "bg-red-50 text-red-700 ring-1 ring-red-200",             dot: "bg-urgent animate-pulse" },
    sold:       { label: "Sold",        cls: "bg-ink-100 text-ink-600 ring-1 ring-ink-200",            dot: "bg-ink-400" },
    coming:     { label: "Coming soon", cls: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",    dot: "bg-accent-600" },
    ended:      { label: "Ended",       cls: "bg-red-50 text-red-700 ring-1 ring-red-200",             dot: "bg-urgent" },
  };
  const v = map[kind];
  if (!v) return null;
  const el = document.createElement("span");
  el.className = `${BASE} ${v.cls}`;
  el.innerHTML = `<span class="h-1.5 w-1.5 rounded-full ${v.dot}"></span>${v.label}`;
  return el;
}

export function listingStatusKinds(listing, countdownBucket) {
  const kinds = [];
  if (isTrue(listing.propertySold)) kinds.push("sold");
  if (isTrue(listing.coming_soon))  kinds.push("coming");
  if (countdownBucket === "ended" && !isTrue(listing.propertySold)) kinds.push("ended");
  if (countdownBucket === "urgent") kinds.push("urgent");
  else if (countdownBucket === "soon") kinds.push("soon");
  else if (countdownBucket === "normal" && !isTrue(listing.propertySold)) kinds.push("live");
  return kinds;
}
