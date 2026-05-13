import { COUNTDOWN_THRESHOLDS } from "./config.js";

const HTML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function decodeHtmlEntity(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, (m) => HTML_ENTITIES[m] ?? m);
}

export function stripHtml(s) {
  if (s == null) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = String(s);
  return (tmp.textContent || tmp.innerText || "").trim();
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function money(amount, symbolOrCode = "") {
  const n = num(amount);
  if (n == null) return "—";
  const sym = decodeHtmlEntity(symbolOrCode) || "";
  const fmt = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return sym ? `${sym}${fmt}` : fmt;
}

export function compactMoney(amount, symbolOrCode = "") {
  const n = num(amount);
  if (n == null) return "—";
  const sym = decodeHtmlEntity(symbolOrCode) || "";
  const fmt = n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  return sym ? `${sym}${fmt}` : fmt;
}

export function formatNumber(v) {
  const n = num(v);
  return n == null ? "—" : n.toLocaleString("en-US");
}

function parseApiDate(s) {
  if (!s) return null;
  const iso = String(s).replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(s) {
  const d = parseApiDate(s);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(s) {
  const d = parseApiDate(s);
  if (!d) return "—";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeUntil(endIso, now = Date.now()) {
  const d = parseApiDate(endIso);
  if (!d) return { bucket: "unknown", text: "—", ms: null };
  const ms = d.getTime() - now;
  if (ms <= 0) return { bucket: "ended", text: "Ended", ms };

  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  let text;
  if (days >= 1) text = `${days}d ${hours}h`;
  else if (hours >= 1) text = `${hours}h ${minutes}m`;
  else text = `${minutes}m ${seconds.toString().padStart(2, "0")}s`;

  let bucket = "normal";
  if (ms < COUNTDOWN_THRESHOLDS.urgentMs) bucket = "urgent";
  else if (ms < COUNTDOWN_THRESHOLDS.soonMs) bucket = "soon";

  return { bucket, text, ms, days, hours, minutes, seconds };
}

export function daysSince(s, now = Date.now()) {
  const d = parseApiDate(s);
  if (!d) return null;
  const ms = now - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export const isTrue = (v) => v === "1" || v === 1 || v === true;

// Returns the noun used for this listing's auction model.
export const offerNoun = (auctionType) =>
  auctionType === "Make An Offer" ? "offer" : "bid";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Highest offer" / "Current bid"
export const bidValueLabel = (auctionType) =>
  auctionType === "Make An Offer" ? "Highest offer" : "Current bid";

// "Offers" / "Bids"
export const bidCountLabel = (auctionType) =>
  cap(offerNoun(auctionType)) + "s";

// "1 offer" / "12 bids"
export const bidsPlural = (auctionType, n) => {
  const noun = offerNoun(auctionType);
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
};
