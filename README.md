# rationd

A self-hosted calorie, macro, and gym workout tracker. Runs as a single Docker
container with a SQLite database on your own storage — no third-party account,
no data leaving your server. It works as an installable app on your phone (PWA)
and can also be connected to an AI assistant (Claude, ChatGPT, etc.) so you can
log food or workouts just by describing them.

## Features

- **Food logging** — calories, protein, carbs, fat, fiber, sugar, sodium, grouped
  by meal, with running totals against your daily goals
- **Barcode scanning** — scan a product with your phone camera or a photo, or
  save a nutrition label; scanned products are saved to your own catalog so
  you never have to re-enter them
- **Favorites & quick re-log** — repeat a meal or copy a previous day's entries
  in a couple of taps
- **Body weight tracking** with kg/lb and trend charts (7/30/90 days)
- **Gym workout tracking** — log a session in plain text (e.g. `Bench Press` /
  `- 80kg x 8`) and it's parsed into exercises and sets automatically, with
  personal-record detection, per-exercise history, and workout summaries
- **Works offline** — installs to your home screen and still opens (read-only)
  without a network
- **Light/dark theme**
- **Multi-account** — each person who logs in only sees their own data, so it
  can be shared with family without extra setup
- **AI assistant integration** — connect any MCP-compatible assistant to log
  meals or workouts in natural language, or scan a nutrition label photo and
  have it saved automatically

## Self-hosting with Docker

This is the recommended way to run rationd.

```bash
git clone <this-repo-url>
cd diet-app
cp .env.example .env
# edit .env and set a long, random JWT_SECRET
docker compose up -d --build
```

The app is served on port `3000` inside the container. The `docker-compose.yml`
expects an external `coolify` network and exposes the port rather than
publishing it, since it's meant to sit behind [Coolify](https://coolify.io/) or
another reverse proxy — put a proxy (Coolify, Caddy, Traefik, nginx) in front
of it for TLS and to publish it publicly. If you just want to try it locally,
either add a proxy or temporarily change `expose` to `ports: ["3000:3000"]` in
`docker-compose.yml`.

Your database lives in the `diet_data` Docker volume, mounted at
`/app/data/diet.db` inside the container — back that volume up and it's the
entire app state. Database migrations run automatically on container start.

### Configuration

Set these as environment variables (or in `.env` for Compose):

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | yes | Long random string used to sign login sessions. Generate one with `openssl rand -hex 32`. |
| `DATABASE_URL` | no | Defaults to `file:/app/data/diet.db`. Only change this if you're moving the database elsewhere. |

### First run

Open the app, register an account, and start logging. There's no separate
admin setup — the first account you create is just a normal account.

### Updating

```bash
git pull
docker compose up -d --build
```

Existing data in the `diet_data` volume is untouched; pending database
migrations are applied automatically when the container restarts.

## Installing it on your phone

Open the site in your phone's browser and use "Add to Home Screen" (iOS
Safari) or "Install app" (Android Chrome). It then behaves like a normal app —
full screen, its own icon, and it still opens if you're offline (today's data
is cached on the device; saving new entries does still need a connection).

## Connecting an AI assistant

In Settings, copy your personal connector URL. Add it to any assistant that
supports MCP (Claude, Cursor, Windsurf, ChatGPT, etc.) and you can then just
tell it things like "log 200g of chicken and rice for lunch" or paste a photo
of a nutrition label or a workout note, and it'll save it to your account.
There's also a plain REST API with interactive documentation at `/api-docs` if
you'd rather integrate something yourself.

## Running it for development

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed   # optional demo user: demo@example.com / password123
npm run dev
```

Open <http://localhost:3000>.

Built with Next.js, Prisma, and SQLite. See `AGENTS.md` and `DESIGN.md` for
notes on the app's internals if you're looking to modify it.

## Notes

- SQLite is used by design — this is meant for one person or a small household
  on a single server, not a multi-tenant SaaS. Moving to Postgres is possible
  (change the `datasource` in `prisma/schema.prisma`) but isn't necessary for
  normal self-hosted use.
- Your data is yours: everything lives in one SQLite file in the Docker
  volume, and export endpoints exist for both food entries and workouts if you
  ever want a copy.
