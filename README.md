# rationd

A simple, API-first calorie & macro tracker built with **Next.js 16**, **Prisma**,
and **SQLite**. It has a sleek web UI for logging meals and a fully documented
**OpenAPI** REST API + **Model Context Protocol (MCP)** server so AI assistants
(Claude, Cursor, Windsurf, ChatGPT, etc.) can log entries and manage products for you.

## Features

- Email/password auth with JWT (30-day tokens)
- Log food entries: name, calories, protein/carbs/fat, meal type, timestamp
- Daily dashboard with per-meal grouping and running totals
- REST API documented with OpenAPI 3.1, browsable at `/api-docs`
- Each user only sees their own entries
- Installable PWA that opens and reads offline (see below)

## Tech stack

| Layer    | Choice                                  |
| -------- | --------------------------------------- |
| Framework| Next.js (App Router) + TypeScript       |
| Database | SQLite via Prisma ORM                   |
| Auth     | bcrypt password hashing + JWT (`jsonwebtoken`) |
| Validation | zod                                   |
| API docs | Scalar (`@scalar/nextjs-api-reference`) |
| Styling  | Tailwind CSS                            |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env and set a strong JWT_SECRET

# 3. Create the database
npx prisma migrate dev

# 4. (optional) Seed a demo user + sample entries
#    demo@example.com / password123
npm run db:seed

# 5. Run it
npm run dev
```

Open <http://localhost:3000>. Register an account, or log in with the seeded
demo user.

## iOS PWA notes

Two things the installed app depends on, both easy to break:

- **Safe areas.** `viewport-fit: cover` puts the web view into every inset, so `body` pads all
  four with `env(safe-area-inset-*)`. Padding only the bottom — as it did originally — runs the
  top of the page under the notch and the Dynamic Island. Full-height screens use `.min-h-safe`,
  since `100vh` inside a padded body overflows by the inset.
- **The app icon must include PNGs.** iOS ignores an SVG `apple-touch-icon` and falls back to a
  screenshot of the page. `npm run icons` regenerates every size from one definition; bump
  `VERSION` in `public/sw.js` afterwards, since icons are cached first and are not hashed.
- **The 16px floor.** iOS Safari zooms the viewport whenever a focused input's text is under
  16px, and does not zoom back. Every form control is therefore 16px under
  `@media (pointer: coarse)`. Do not "fix" a cramped mobile form by dropping a field to 14px.

The status bar style is `default` rather than `black-translucent`: translucent forces white
glyphs, unreadable on the light theme. The strip behind it is painted from a single
`theme-color` meta that the theme script and `ThemeToggle` both keep in step with the `.dark`
class — a `prefers-color-scheme` media query would be wrong, because the class can contradict it.

## Units

Every stored number is canonical, with the unit it was entered in recorded beside it.

| Thing | Stored as | Entered / displayed as |
| --- | --- | --- |
| Body weight | kilograms (`WeightLog.weight`) | kg or lb (`WeightLog.unit`, account preference) |
| Food quantity | the amount plus `quantityUnit` | g, oz, ml, fl oz, or `serving` |
| Product nutrition | per 100 g or 100 ml (`basis`) | same |
| Nutrients | grams, except sodium in mg | same |
| Energy | kcal | same |

`weightUnit` used to be a display label with no conversion behind it: `WeightLog.weight` was a
bare number, so switching kg to lb relabelled every historical reading as pounds instead of
converting it — and `TdeeCard` then computed a BMR from the wrong figure. Weight is kilograms
now. The migration converted existing rows by reading them as the account's unit *at that time*,
which is correct for any account that never switched; an account that did switch had readings
that were already ambiguous, and no migration can recover which was which.

`lib/units.ts` owns every conversion. `toBase()` resolves a quantity into a product's own basis
and returns `null` when the pairing is impossible — 200 ml of a per-100g product has no answer
without a density, and inventing one would be inventing data. Callers surface the refusal.

The older `quantityGrams` and `servingGrams` fields are still accepted by the REST API and the
MCP tools, normalised through `normaliseQuantity()` / `normaliseServing()`, so anything written
against the previous shape keeps working.

## Offline behaviour

The app installs as a PWA and opens without a network.

`public/sw.js` caches the application shell — the HTML for `/`, `/login` and
`/register`, plus the hashed `/_next/static/` bundles, which are immutable and so
safe to serve cache-first. Navigations are network-first and fall back to the
cached shell.

**The worker never caches `/api/`.** Two writers reach this data — the screen and
the assistant — so a cached day served through the same code path as a live one
would be a lie the user cannot detect, and a URL-keyed Cache Storage entry would
outlive a logout and hand one account's food log to the next person holding the
phone.

Offline reads are the app's job instead. After every successful load of *today*,
the dashboard writes a snapshot to `localStorage` (`lib/offline-cache.ts`) scoped
to a user id and stamped with the moment the reading was taken. Launched without
a network, the app renders that snapshot behind a banner naming its time, and the
calorie readout's clock shows that time rather than now. The snapshot is dropped
on logout and whenever a different account signs in on the device.

Writes are never queued. Offline, a save fails immediately with "You are offline
— nothing was saved", because a silent replay would collide with whatever the
assistant did to the same day in the meantime.

## AI Integration & The API (how assistants log entries)

You can connect any AI assistant (Claude, Cursor, Windsurf, ChatGPT, etc.) using:
1. **Model Context Protocol (MCP)**: Copy your connector URL from Settings (`/api/mcp?key=<your-key>`). The server supports automatic barcode lookup with auto-saving (`lookup_barcode`), nutrition label OCR saving (`save_product`), single meal logging (`log_meal`), and batch multi-item meal logging (`log_meal_items`).
2. **REST API**: Auth is JWT-based. Interactive Scalar docs live at <http://localhost:3000/api-docs>; the raw spec is at `/api/openapi.json`.
3. **Cross-Browser Barcode & Photo Scanning**: Native `BarcodeDetector` on Chrome/Android with pure WASM ZXing polyfill for Safari and iOS, photo capture fallback, and direct catalog + Open Food Facts resolution.

### Endpoints

| Method | Path                  | Description                          |
| ------ | --------------------- | ------------------------------------ |
| POST   | `/api/auth/register`  | Create an account → `{ token, user }`|
| POST   | `/api/auth/login`     | Log in → `{ token, user }`           |
| POST   | `/api/auth/logout`    | Clear the auth cookie                |
| GET    | `/api/auth/me`        | Current user                         |
| GET    | `/api/entries?date=YYYY-MM-DD` | List entries (optional day filter) |
| POST   | `/api/entries`        | Create an entry                      |
| GET    | `/api/entries/{id}`   | Get one entry                        |
| PATCH  | `/api/entries/{id}`   | Update an entry                      |
| DELETE | `/api/entries/{id}`   | Delete an entry                      |
| GET    | `/api/summary?date=YYYY-MM-DD` | Daily totals per meal + grand total |
| POST   | `/api/mcp`            | Model Context Protocol JSON-RPC      |

### Example: log a meal via the API

```bash
# 1. Log in and grab a token
TOKEN=$(curl -s -XPOST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}' | jq -r .token)

# 2. Create an entry
curl -s -XPOST localhost:3000/api/entries \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Oatmeal","calories":320,"protein":12,"carbs":54,"fat":6,"mealType":"breakfast"}'

# 3. See today's totals
curl -s "localhost:3000/api/summary?date=$(date +%F)" \
  -H "authorization: Bearer $TOKEN"
```

To let your AI assistant do this, connect it to the MCP endpoint or pass it your API key.

## Data model

```
User       id, email, passwordHash, createdAt
FoodEntry  id, userId, name, calories, protein, carbs, fat,
           mealType (breakfast|lunch|dinner|snack), consumedAt, createdAt
```

## Project structure

```
app/
  api/            REST route handlers (auth, entries, summary, openapi.json)
  api-docs/       Scalar-rendered API reference
  login, register, page.tsx   Web UI
lib/
  auth.ts         hashing, JWT, getUserFromRequest
  prisma.ts       Prisma client singleton
  validation.ts   zod schemas (shared by routes + OpenAPI)
  openapi.ts      OpenAPI 3.1 document
  http.ts         JSON error helpers + date-range helper
  time.ts         timezone-aware day boundaries (server)
  time-client.ts  day/clock formatting and entry stamping (browser)
  offline-cache.ts  the device-side snapshot behind offline reads
  units.ts        every unit conversion, and the rules about refusing one
scripts/
  generate-icons.mjs  all app icons from one geometry definition (npm run icons)
public/
  sw.js           shell-caching service worker; never touches /api/
prisma/
  schema.prisma   data model
  seed.ts         demo data
```

## Notes

- SQLite is used for zero-setup local development. To move to Postgres, change
  the `datasource` provider/URL in `prisma/schema.prisma` and re-run the
  migration.
- Set a long, random `JWT_SECRET` in any real deployment.
