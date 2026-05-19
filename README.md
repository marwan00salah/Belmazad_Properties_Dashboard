<!-- docs-sync
purpose:     Public-facing readme + Updates/changelog for the GitHub Pages dashboard
audience:    public
sync-policy: structured
owned-by:    -
invariants:
  - renders cleanly on GitHub; this spec block never visible
  - references ONLY public artifacts (index.html, css/, js/, README.md, .gitignore)
  - Updates section's top entry == latest shipped (committed) version
sources:
  - git:latest-version
  - gitignore:README.md=no
-->
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

### v1.3.0 — Whole-dashboard visual redesign (2026-05-20)

A full visual overhaul. Same data, same flows, **all-new look** — modernised SaaS aesthetic with indigo as the primary, emerald for success, soft slate neutrals, and rounded cards throughout.

**Header**
- Full-width top bar with a single active **Properties** tab. New **user identity block** on the right (email chip + initials avatar + one-click sign-out).

**Listings**
- Re-skinned **stat tiles** with hover lift + a subtle **shadow that follows the cursor**.
- Filters consolidated into a single, consistent dropdown-button design (Sort + Seller / Auction / Property type).
- New **"Showing N properties"** line next to the Sort control.
- **Search now also matches property ID** (substring) — type `483` to jump to listing #483.
- **Property cards** redesigned: 4:3 image, status pill overlay, `#ID` tag, **bold typography**, and a centered **`Dd Hh Mm Ss` countdown** colour-coded by urgency (purple = Coming Soon, amber < 24h, red < 1h, green otherwise; grey on sold/ended).

**Property detail page**
- Rebuilt as a 12-column layout: **Specifications + Seller & Broker** on the left, **Hero → HubSpot Performance → Offers/Registrations** in the middle, **Auction Timing + bidding details** on the right.
- New breadcrumb header with **View Public Page** and **Edit in Admin** actions.
- **Hero**: full-bleed image with a gradient overlay, title/address overlaid in white, and a flush 5-button action row (Google Maps · VR tour · YouTube · Photos · Booklet) in their distinctive colours. Description collapsed into a compact, clickable strip.
- **Specifications** card with tag-style values, an inline **Active Listing** pill, and a distinctive **Payment terms** pill (finance vs cash).
- **Seller & Broker** with role-coloured initials avatars and a quiet shimmer-skeleton while contacts resolve (no more legacy block flash).
- **HubSpot Performance** is now a small dashboard inside the card: three roll-up tiles (Contacts / Open Deals / Open Tasks), **colour-coded leads bars in a fixed order**, a **vertical deals bar chart** in pipeline order with any "Incomplete" stage forced to the end (red), and task badges.
- **Auction Timing** is now a dark card with a big `Dd Hh Mm Ss` countdown that re-tones as the deadline gets closer.
- **Offers History** and **Auction Registrations** rows get a coloured left-border indicating their status; the list scrolls inside the card.

**Under the hood**
- No API, Worker, or data changes — presentation-only. All countdowns, lazy-loaded reports, refresh cooldowns, and operator flows behave exactly as before.

### v1.2.2.2 — Real seller/broker, auction registrations & named bidders (2026-05-18)

**Detail view**
- The **Seller / Agent** panel now shows the *real* seller (the assigned Checker) and the listing **Broker** (Maker) as two clearly labelled groups with full contact details — previously every property showed the same generic listing account. A live **Active / Inactive** badge indicates whether the property is currently published.
- New **Auction Registrations** card on bidding-auction properties — everyone registered to bid, with contact, registration date, payment/approval status, and proof-of-funds / terms-booklet links. It's the auction-side counterpart to the Offers History card (which continues to show on make-an-offer properties).
- The **highest bidder / offerer** now displays the person's **name** instead of a bare numeric ID.
- Status pills now colour correctly across the Offers and Registrations cards: approved → green, unapproved/unpaid/rejected → red, pending → amber.

**Backend (Cloudflare Worker)**
- New read-only, briefly-cached Worker lookups resolve the seller/broker, auction registrations, and bidder/offerer names, so repeat opens stay fast.

### v1.2.2 — Offers history (2026-05-17)

**Detail view**
- New **Offers History** card on each property page — every offer made on the property, with the offerer's name, amount, date, and review status. The highest offer is highlighted, and amounts display in their original currency (e.g. USD or EGP).

**Backend (Cloudflare Worker)**
- Offers are retrieved through the Cloudflare Worker and briefly cached, so repeat opens of the same property load instantly.

### v1.2.1 — Terms booklet download (2026-05-17)

**Detail view**
- New **Booklet** action in the hero buttons row — downloads the property's official auction terms booklet (PDF) in one click, with the original filename preserved. Shows as a disabled **N/A** tile (like VR tour / YouTube) for properties that don't have a booklet.

**Backend (Cloudflare Worker)**
- The booklet is retrieved and streamed through the Cloudflare Worker so it downloads directly from the dashboard.

### v1.2 — Per-property HubSpot reports (2026-05-16)

**Detail view**
- New **HubSpot reports** card on each property page: total contacts, deals, and open tasks; leads broken down into 10 status buckets; deals broken down by pipeline stage.
- Page load shows the last computed snapshot instantly. A **Generate / Refresh reports** button recomputes on demand — shared for everyone, with a short global per-property cooldown (live `m:ss` countdown) and de-duplication so concurrent clicks don't double-run.
- Footer shows when the report was last refreshed and by whom.

**Backend**
- Heavy HubSpot aggregation is offloaded to an external automation workflow and cached per property; the dashboard and proxy stay lightweight. Reports are scoped to each property precisely (by deal name and the lead-status segmentation), matching how the team scopes them in HubSpot.

### v1.1.1 — Operator-only Initiate auction (2026-05-14)

**Detail view**
- New **Initiate auction** action in the Timing rail, visible only to allow-listed operators. Proxied through the Cloudflare Worker so the upstream operator API key never reaches the browser.
- Confirm modal requires the operator to type the property ID before the request can fire — guard against accidental clicks (the upstream action is one-way and sends real countdown emails).
- After a successful initiate, the tile flips to a sticky **"✓ Auction initiated"** state with the `master_task_id` and a one-click copy button. The state persists per-browser via `localStorage`.

**Backend (Cloudflare Worker)**
- `GET /whoami` — lightweight identity probe (returns the CF Access email + operator flag). Lets the dashboard conditionally render operator-only UI without exposing any allow-list to the public.
- `POST /auction/initiate` — operator-gated proxy to the upstream buyer-pipeline API. Validates origin + email + payload (`property_id` format, `auction_start_date` parseability and future-ness) before forwarding with the encrypted operator key from Worker env.

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
