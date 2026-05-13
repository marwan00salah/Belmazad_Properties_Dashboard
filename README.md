# Belmazad Properties Dashboard

Internal operations dashboard for Belmazad personnel to monitor live property listings on [belmazad.com](https://belmazad.com).

**Live:** [https://marwan00salah.github.io/belmazad-dashboard/](https://marwan00salah.github.io/belmazad-dashboard/) — access restricted to authorized team members via Cloudflare Access.

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
