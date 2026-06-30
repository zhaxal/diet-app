# 🥗 Diet Tracker

A simple, API-first calorie & macro tracker built with **Next.js 16**, **Prisma**,
and **SQLite**. It has a small web UI for logging meals and a fully documented
**OpenAPI** REST API so an assistant like Claude can create entries for you.

## Features

- Email/password auth with JWT (30-day tokens)
- Log food entries: name, calories, protein/carbs/fat, meal type, timestamp
- Daily dashboard with per-meal grouping and running totals
- REST API documented with OpenAPI 3.1, browsable at `/api-docs`
- Each user only sees their own entries

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

## The API (how Claude logs entries)

Auth is JWT-based. A client logs in once, gets a token, and sends it as a
`Bearer` token on every request. Interactive docs live at
<http://localhost:3000/api-docs>; the raw spec is at `/api/openapi.json`.

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

To let Claude do this, give it the base URL and a token from step 1 (or point a
custom connector at `/api/openapi.json`), and it can create and review entries
for you.

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
prisma/
  schema.prisma   data model
  seed.ts         demo data
```

## Notes

- SQLite is used for zero-setup local development. To move to Postgres, change
  the `datasource` provider/URL in `prisma/schema.prisma` and re-run the
  migration.
- Set a long, random `JWT_SECRET` in any real deployment.
