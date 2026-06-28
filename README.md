# SAP Favorites Portal

A personal favorites portal styled as a **Fiori Launchpad** — a curated, self-maintained
dashboard of links organized into pages (categories), displayed as Fiori tiles with rich
previews. Built for SAP professionals who live in SAP Learning Hub, SAP Blogs, SAP Help,
GitHub, and YouTube.

**Stack:** OpenUI5 (CDN) · Node.js / Express · PostgreSQL · pluggable AI layer
**Theme:** `sap_horizon_dark`

---

## Quick start

### Option A — Docker (everything in one command)

```bash
cp .env.example .env        # optional: tweak ADMIN_PIN / JWT_SECRET
docker compose up --build
```

This starts PostgreSQL, runs migrations + seed data, and serves the app at
<http://localhost:3000>.

### Option B — Local Node + your own Postgres

```bash
cp .env.example .env        # set DATABASE_URL to your Postgres instance
npm install
npm run migrate             # create tables
npm run seed                # seed example pages/tiles + admin PIN
npm run dev                 # nodemon, http://localhost:3000
```

Need a quick Postgres? `docker compose up postgres -d` starts just the database
on `localhost:5432` (user/pass/db all `favorites`).

---

## Using the app

- **Viewer** (`/`): browse pages as tabs, click a tile to open the link in a new tab,
  use the global search box to filter across all pages.
- **Admin** (gear icon → `/admin`): log in with the PIN (`ADMIN_PIN`, default `1234`).
  - **Pages** — create / rename / reorder / delete, set an icon (SAP icon name or emoji).
  - **Tiles** — paste a URL and hit **Fetch preview** to auto-fill title / image /
    description / type; override anything; reorder; export / import JSON backups.
  - **Feed Sources** — register YouTube channels, SAP blog tags, GitHub topics, or RSS
    feeds to be scraped on a schedule.
  - **Suggestions** — review AI/scraper-proposed tiles and approve, or reject them.

---

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `PORT` | HTTP port (default 3000) |
| `DATABASE_URL` | Postgres connection string — the only thing needed to retarget any host |
| `JWT_SECRET` | Signing secret for admin tokens |
| `ADMIN_PIN` | Initial admin PIN (hashed into the `settings` table on seed) |
| `YOUTUBE_API_KEY` / `GITHUB_TOKEN` | Optional, improve preview quality |
| `AI_ADAPTER` | `noop` (default) · `openai` · `anthropic` · `ollama` |
| `OPENAI_*` / `ANTHROPIC_*` / `OLLAMA_*` | Per-adapter credentials/models |

The default `noop` AI adapter requires **no API key** and never calls out — feed scraping
still works (it proposes raw items); summaries/tags simply stay empty until you switch
to a real adapter.

---

## REST API

All write endpoints require `Authorization: Bearer <jwt>` (obtain via `POST /api/auth/login`).

- Pages: `GET/POST /api/pages`, `PUT/DELETE /api/pages/:id`, `POST /api/pages/reorder`
- Tiles: `GET /api/tiles`, `GET /api/pages/:id/tiles`, `POST /api/tiles`,
  `PUT/DELETE /api/tiles/:id`, `POST /api/tiles/reorder`
- Utilities: `GET /api/preview?url=`, `GET /api/export`, `POST /api/import`
- Feeds/AI: `GET/POST /api/feeds`, `PUT/DELETE /api/feeds/:id`,
  `POST /api/feeds/:id/scrape`, `GET /api/suggestions`,
  `PUT /api/suggestions/:id/approve|reject`
- Auth: `POST /api/auth/login`, `POST /api/auth/change-pin`
- Health: `GET /api/health`

---

## Project layout

```
server/                 Express API, services, migrations
  index.js              entry point + static hosting + SPA fallback
  db.js  auth.js  scheduler.js  migrate.js  seed.js  export.js
  routes/               pages, tiles, preview, feeds, suggestions, auth, importExport
  services/
    previewFetcher.js   OG / YouTube / GitHub preview scraping
    feedScraper.js      per-source scraping → suggestions
    ai/aiService.js     provider-agnostic AI interface
    ai/adapters/        noop (default) · openai · anthropic · ollama
  migrations/           001_initial.sql · 002_ai_tables.sql
webapp/                 OpenUI5 frontend (no build step)
```

---

## Deployment

### Railway / Render
1. Connect the repo, add a PostgreSQL plugin (injects `DATABASE_URL`).
2. Set `JWT_SECRET`, `ADMIN_PIN` (and any AI/keys) in the dashboard.
3. Build = `npm install`, release = `npm run migrate && npm run seed`, start = `npm start`.

### Azure App Service
1. Create an App Service (Node 20 LTS, Linux) + Azure Database for PostgreSQL (Flexible Server).
2. Set all env vars in **Configuration**. Set `PGSSL=true` (or include `sslmode=require`).
3. Deploy via GitHub Actions or `az webapp deploy`; run `npm run migrate` once.

### GitHub Pages (static viewer only)
```bash
npm run export      # writes docs/data.json + copies webapp/ → docs/
```
Enable Pages on `/docs`. The viewer reads `data.json` directly; the admin UI is disabled
in this mode.

---

## Notes

- `bcryptjs` (pure-JS) is used instead of native `bcrypt` for zero-build portability.
- Node 20's built-in global `fetch` is used in place of `node-fetch`.
- The scheduler registers daily (06:00) and weekly (Mon 06:00) scrape jobs; you can also
  scrape any source on demand from the admin UI.
```
