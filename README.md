# Belmazad Properties Dashboard

Internal operations dashboard for Belmazad personnel to monitor live property listings on [belmazad.com](https://belmazad.com).

**Live:** [https://marwan00salah.github.io/Belmazad_Properties_Dashboard/](https://marwan00salah.github.io/Belmazad_Properties_Dashboard/) — access restricted to authorized team members via Cloudflare Access.

## Stack

- Vanilla JS (ES modules) — no build step
- Tailwind CDN (+ typography plugin)
- Cloudflare Worker proxy for CORS handling
- Cloudflare Access for auth (email allow-list)

## Architecture

- **Static frontend** (this repo) — Vanilla JS + Tailwind, hosted on GitHub Pages. Loads in any modern browser.
- **Cloudflare Worker proxy** — adds CORS headers to the upstream API, scrapes gallery image lists from public property pages, and builds on-demand zip archives.
- **Cloudflare Access** — gates the Worker with an explicit email allow-list. The static site is harmless without API data, so it can live on a public Pages URL.

## Updates

### v1.1 — Detail polish + EN/AR groundwork (2026-05-14)

**Listings page**
- **Live bidding auctions** stat tile now counts only in-progress *Online Auction* listings (renamed from "Live auctions") and is clickable to filter the grid

**Detail view**
- **Description** moved into a collapsible disclosure inside the hero card — starts collapsed, click to expand. Listings with Arabic content show an `EN | AR` toggle that fades in on expand and flips the body to RTL Arabic without a page navigation
- **Commercial terms** section folded into Offers / Bidding — Payment terms and Price modifier now sit alongside the bid/offer rows
- **Back to listings** promoted to a visible pill button
- 4th hero action button relabeled from "Download" to **Photos** (icon unchanged)

**Layout & density**
- Desktop now auto-scales density to viewport width so the 3-column detail layout fits comfortably on narrower laptops without manual zoom

### v1.0 — Initial public release (2026-05-13)

**Listings page**
- Search + filter dropdowns (Seller type, Auction type, Property type, Sort)
- Stats bar with count-up animations
- Property card grid with live countdown, status badges (Live / Ending soon / Urgent / Sold / Coming / Ended), and thumbnail images
- "Showing N of M" meta, dismissible filter chips, "Clear all" reset

**Detail view**
- Three-column responsive layout (Specs / Seller left, hero + content center, Timing + Offers + Commercial right; collapses to a single column on narrow screens)
- Hero with image, live countdown, and four brand-colored action buttons: Google Maps, VR tour, YouTube, Download all images (.zip)
- Live "Starts in / Ends in" countdown tile in the Timing rail (inverted dark palette, hides when no value)
- Offers / Bidding card with inverted palette for visual emphasis
- Rich-text property description (Tailwind typography plugin + allow-list HTML sanitizer)
- Top nav with admin and public-site quick links

**Worker (Cloudflare)**
- Listings proxy with CORS for the allow-listed origins
- `/gallery?id={id}` — scrapes the public property page and returns the list of image filenames
- `/gallery.zip?id={id}` — fetches all gallery images and streams a zip back (zero-dependency inline ZIP builder)
- `/auth-return?dest=…` — post-login landing for the same-tab sign-in flow

**Auth**
- Cloudflare Access in front of the Worker — One-time PIN identity provider, 24h sessions, explicit email allow-list
- Friendly same-tab sign-in flow on the dashboard with automatic redirect back after login

## Roadmap

- Arabic language toggle (data already includes `arabic*` fields)
- Optional custom domain
