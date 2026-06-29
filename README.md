# SAP Favorites Portal

> **Tired of drowning in browser bookmarks and doom-scrolling to find the SAP content that actually matters?**
> This is a self-hosted, Fiori-style launchpad that turns your scattered links into one clean, searchable dashboard you own and control.

A personal favorites portal styled as a **Fiori Launchpad** — a curated, self-maintained
dashboard of links organized into pages (categories), displayed as Fiori tiles with rich
previews. Built for SAP professionals who live in SAP Learning Hub, SAP Blogs, SAP Help,
GitHub, and YouTube — but it works just as well for any link collection.

**Stack:** OpenUI5 (CDN) · Node.js / Express · PostgreSQL · pluggable AI layer
**Theme:** `sap_horizon_dark`
<img width="2906" height="1584" alt="image" src="https://github.com/user-attachments/assets/9535274d-6bf9-438e-85fe-f65451d8c4d0" />

<img width="2834" height="1050" alt="image" src="https://github.com/user-attachments/assets/05175c26-9a48-4d3c-93d2-a9575322275b" />
**
Approve the content to add them to your board.**

<img width="2874" height="1136" alt="image" src="https://github.com/user-attachments/assets/87ebdec0-5ecb-4b0e-b706-f94e05e40ad1" />

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)

---

## ✨ Features

- 🧩 **Fiori Launchpad UI** — responsive tile grid, page tabs, `sap_horizon_dark` theme, no build step.
- 🔎 **Global search** across every page.
- 🔗 **Smart previews** — paste a URL and auto-fetch the title, image, description, and source type (YouTube / GitHub / SAP Blog / SAP Help / Learning Hub).
- 👤 **Make it yours** — set your name, role, and profile photo right from the admin UI.
- 🔐 **Simple admin** — one PIN, JWT-protected write APIs, bcrypt-hashed, login rate-limiting.
- 🤖 **AI-ready (optional)** — pluggable adapters (OpenAI / Anthropic / Ollama / no-op) for auto-summaries, tagging, and feed scraping. Off by default, zero keys required.
- 📦 **Import / export** your whole board as JSON.
- 🐳 **One-command Docker** setup, or run locally against your own Postgres.

---

## Quick start

### Option A — Docker (everything in one command)

```bash
cp .env.example .env        # set strong ADMIN_PIN / JWT_SECRET before sharing
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
  - **Profile** — set your **name, role/title, and photo** (uploaded inline, stored in the
    DB). It shows in the header so the portal feels like *yours*. Ships blank, so anyone
    who clones it personalizes their own.
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
| `CORS_ORIGIN` | Comma-separated allowed browser origins; empty = same-origin only |
| `YOUTUBE_API_KEY` / `GITHUB_TOKEN` | Optional, improve preview quality |
| `AI_ADAPTER` | `noop` (default) · `openai` · `anthropic` · `ollama` |
| `OPENAI_*` / `ANTHROPIC_*` / `OLLAMA_*` | Per-adapter credentials/models |

The default `noop` AI adapter requires **no API key** and never calls out — feed scraping
still works (it proposes raw items); summaries/tags simply stay empty until you switch
to a real adapter.

---

## REST API

All admin-sensitive endpoints require `Authorization: Bearer <jwt>` (obtain via `POST /api/auth/login`).

- Pages: `GET/POST /api/pages`, `PUT/DELETE /api/pages/:id`, `POST /api/pages/reorder`
- Tiles: `GET /api/tiles`, `GET /api/pages/:id/tiles`, `POST /api/tiles`,
  `PUT/DELETE /api/tiles/:id`, `POST /api/tiles/reorder`
- Utilities: `GET /api/preview?url=`, `GET /api/export` (auth), `POST /api/import`
- Feeds/AI: `GET/POST /api/feeds`, `PUT/DELETE /api/feeds/:id`,
  `POST /api/feeds/:id/scrape`, `GET /api/suggestions`,
  `PUT /api/suggestions/:id/approve|reject`
- Profile: `GET /api/profile` (public), `PUT /api/profile` (auth)
- Auth: `POST /api/auth/login`, `POST /api/auth/change-pin`
- Health: `GET /api/health`

---

## Project layout

```
server/                 Express API, services, migrations
  index.js              entry point + static hosting + SPA fallback
  db.js  auth.js  scheduler.js  migrate.js  seed.js  export.js
  routes/               pages, tiles, preview, feeds, suggestions, auth, profile, importExport
  services/
    previewFetcher.js   OG / YouTube / GitHub preview scraping
    feedScraper.js      per-source scraping → suggestions
    ai/aiService.js     provider-agnostic AI interface
    ai/adapters/        noop (default) · openai · anthropic · ollama
  migrations/           001_initial.sql · 002_ai_tables.sql · 003_suggestion_published.sql
webapp/                 OpenUI5 frontend (no build step)
  controller/ view/     Home + Admin (Profile, Pages, Tiles, Feeds, Suggestions)
  model/ fragment/ css/ i18n/
SAP_Favorites_Portal_Spec.md   full product/architecture spec (see below)
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

---

## 🏗️ Build your own from the spec

Don't just clone it — **use it as a blueprint.** The complete product and architecture
spec lives in **[`SAP_Favorites_Portal_Spec.md`](SAP_Favorites_Portal_Spec.md)**: data
model, REST API, OpenUI5 component map, AI adapter contract, env vars, and a phase-by-phase
build plan.

Two ways to use it:

1. **Run this app** — follow Quick start above.
2. **Generate your own** — hand the spec to your AI coding agent (Claude Code, Cursor, etc.)
   as the source of truth and have it scaffold a fresh implementation, swap the stack, or
   extend it. The spec is written to be self-contained for exactly this.

> Want a different stack (React + Supabase, Vue + SQLite, etc.)? Keep the spec, change
> §6 and §8, and rebuild. The data model and API contract are the stable core.

---

## 🤝 Contributing

Issues and PRs welcome. To run locally, see **Option B** above. Please run `npm run lint`
before opening a PR. Keep the frontend build-free (OpenUI5 from CDN) and the default AI
adapter `noop` so the app runs with zero external keys out of the box.

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute. Make it your own.
