# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary user: the owner (a single self-hosting individual), on a phone, mid-day, mid-life.**
The app is installed to the home screen and opened in short bursts around eating —
standing in a kitchen, sitting at a table, one hand occupied. Sessions are seconds
long for capture and a minute or two for review. The desktop browser is a secondary,
occasional context (settings, API key, longer corrections).

**Second first-class user: an assistant acting on the owner's behalf.** Any AI assistant
(Claude, Cursor, Windsurf, ChatGPT, etc.) reaches the same data through the MCP tool
surface and the REST API — including reading a photographed nutrition label, scanning
barcodes, and logging from them. Anything the UI can do to a day's log, the assistant
can do too, and both paths write to the same records.

**Confirmed direction: personal now, a handful of invited people later.** Accounts,
per-user isolation, and registration are already real; the product is built so a small
circle could be given access without re-architecting. It is not aimed at a public
consumer market.

## Product Purpose

Track daily food intake — calories and six nutrients (protein, carbs, fat, fiber,
sugar, sodium) — against personal daily goals, plus body weight over time, on
infrastructure the owner controls.

Success is **sustained, low-friction logging**: a day that gets fully logged without
the logging becoming a chore. A day with a complete, trustworthy record is a win; an
abandoned half-day is the failure mode the product exists to prevent.

## Positioning

**Two equally-supported ways to log the same day, over data the owner owns.**

Logging genuinely happens through both paths on a normal day: the assistant handles
awkward items and label photos ("log 200g of this"), while the web UI handles repeats,
corrections, and review. Neither is a demo of the other. This is the durable difference
from mainstream trackers, which own your data and offer exactly one entry surface.

Design consequence: the two paths must stay equally fast, and must stay consistent —
an entry created by the assistant and an entry typed into the UI must be
indistinguishable in the day's record, and each path must make the other's work
easy to see, verify, and correct.

## Operating Context

- **Deployment:** one Docker container behind Coolify, SQLite on a persistent volume
  (`/app/data/diet.db`). No managed database, no external app services.
- **Install:** PWA, `display: standalone`, portrait, `viewportFit: cover`, home-screen
  icon (`/icon.svg`, maskable variant). Safe-area insets and a bottom nav are load-bearing.
- **Sessions:** JWT in an httpOnly cookie, 30-day expiry — the owner effectively stays
  logged in on their phone indefinitely.
- **Assistant access:** a per-user API key surfaced in Settings; MCP endpoint at
  `/api/mcp`; OpenAPI 3.1 document at `/api/openapi.json`; Scalar reference at `/api-docs`.
- **One external dependency:** `/api/foods/search` proxies Open Food Facts server-side
  (6s timeout, degrades to empty results). It is the only outbound call and it is optional
  to the core loop.
- **Timezone:** stored per user and auto-synced from the browser; day boundaries are
  computed in the user's zone, not UTC.

## Capabilities and Constraints

**Confirmed capabilities**

- Food entries: name, calories, six nutrients, meal type (breakfast/lunch/dinner/snack),
  `consumedAt`, provenance (`productId` + a `quantity` with its own `quantityUnit`) when logged
  from a saved product, and a `source` recording which front door wrote the row (`ui` / `mcp`).
- Daily dashboard grouped by meal, with running totals against goals, and day-to-day navigation.
- Saved products (per 100 g / 100 ml, optional brand, barcode, serving size) and favorites.
  Products are a reference catalog rather than a way to eat: they are searched, scaled and
  logged from Add food alongside every other source, and read back or corrected in Settings.
  Multi-item meal templates remain on the API for the assistant; the screen no longer surfaces
  them, because per-entry copy covers the same ground in fewer taps.
- Weight logs stored canonically in kilograms with the entered unit recorded per reading, so the
  kg/lb preference re-renders history rather than reinterpreting it; trends over 7, 30 or 90 days,
  or the whole record from the first entry ever logged.
- Quantities carry a unit: g/oz against a per-100g product, ml/fl oz against a per-100ml one, or
  `serving` when the label declares one. Incompatible pairings are refused, never guessed at.
- Barcode capture in the browser via native `BarcodeDetector` (Chrome/Android) with WASM ZXing polyfill for Safari/iOS, photo upload fallback, and manual digit entry, looking up first in the user's catalog and falling back to Open Food Facts.
- TDEE inputs (sex, birth year, height) and per-nutrient daily goals.
- Copy any entry, or a whole meal, onto a device-local tray, then re-log it from Add food at a
  different amount and in a different unit. The tray is a clipboard, not a record: it lives in
  the browser, is scoped to the account, and the assistant cannot see it.
- One composer for every entry. Add food searches the tray, the saved catalog, what has been
  eaten before and Open Food Facts at once; whatever is picked arrives quoted against a known
  amount, which the amount field then rescales. Hand-typed values declare whether they are as
  eaten or per 100 g/ml.
- Copy a previous day's entries and apply a template (API only); CSV/data export.
- Light and dark themes, with the choice persisted and applied before first paint.

**Fixed constraints — future design work must not break these**

1. **The API and MCP contract is the backbone.** The OpenAPI document, per-user API key,
   and MCP tool surface are product, not plumbing. No UI change may bypass them, break
   them, or introduce behavior only reachable through the browser.
2. **Self-hosted, single container, SQLite.** No managed services, no CDN-loaded fonts,
   scripts, or analytics; assets ship with the app. Anything added must survive on one
   small box with a file-backed database.
3. **Phone-first PWA, usable one-handed.** Standalone display, portrait, safe-area
   insets respected, primary navigation within thumb reach. Desktop is secondary and
   must not drive layout decisions.

**Open / undecided**

- **Registration is currently open** — anyone who reaches the URL can create an account.
  The "friends later" goal implies some gating (invite codes, an allowlist, or disabled
  self-signup), but no mechanism has been chosen or built.
- Whether logging friction is currently acceptable on either path is untested; no measurement exists.
- No multi-user, sharing, or social features exist or are planned.

## Brand Commitments

Name: **Diet Tracker** (`short_name` "Diet"). Existing self-description:
"Track calories and macros. API-first, MCP & AI-ready."

**No binding visual commitment was made.** The current near-monochrome
"instrument panel" language in `app/globals.css` — hairline borders, square panels,
tabular monospace numerals, a single amber accent, dark-first — is the incumbent
implementation and should be treated as design evidence, not as a pinned brand
constraint. It may be preserved, extended, or replaced by a later design decision.

## Evidence on Hand

- Working, deployed application with real usage; the owner's own logged data is the only content.
- Live MCP connector against this instance, exercised in practice.
- Seed data exists for local development only (`demo@example.com`), and is not real usage.
- **No** users beyond the owner, testimonials, reviews, benchmarks, adoption numbers,
  pricing, press, or third-party validation exist. Future work must not invent any.
- No nutrition-science claims are made or substantiated; the app records numbers the
  user or a label supplies. It gives no medical or dietary advice.

## Product Principles

1. **The log must never be the hard part.** Any change that adds steps, taps, or thinking
   to capturing a meal is a regression, regardless of how much it improves the display.
2. **Two front doors, one truth.** The UI and the assistant are peer interfaces over the
   same records. Neither may hide state from the other, and each must make the other's
   entries easy to review and correct.
3. **Numbers are the content.** The product's value is a trustworthy set of figures against
   goals; anything on screen either helps read those figures or earns its space some other way.
4. **A day is the unit.** Goals, totals, meals, and navigation are organized around a single
   local day, in the user's timezone — not around weeks, streaks, or sessions.
5. **It runs on one box, forever.** Self-hosted longevity outranks any feature that requires
   an outside service to keep working.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond the general
floor. Two contextual needs are confirmed by the operating scene: the app is used
one-handed on a phone in bright and dark environments, so touch targets and
light/dark legibility are functional requirements, not preferences.
