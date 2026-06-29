# SAP Favorites Portal — Product Specification

**Version:** 2.0  
**Status:** Implemented — Phases 1–6 scaffolded and working (AI adapters wired but default `noop`)  
**Stack:** OpenUI5 · Node.js (Express) · PostgreSQL · AI-ready  
**Theme:** SAP Horizon Dark  
**Hosting:** Local-first → Azure App Service / Railway / Render / GitHub Pages (static viewer)

> **Spec note:** This document reflects the current state of the codebase. Where the
> running implementation differs from the original v2.0 design, the spec has been
> updated to match the code (auth hardening, SSRF protection, custom migration runner,
> i18n, formatter, and dependency choices).

> ### 🛠️ Use this spec to build your own
> This spec is intentionally self-contained so you can **hand it to an AI coding agent**
> (Claude Code, Cursor, etc.) and have it scaffold the whole app — or your own variant.
>
> - **Same stack:** "Build the app described in this spec." Then run it (see the README).
> - **Different stack:** keep §2–§5, §7, §10–§13 (concepts, data model, API, env, NFRs)
>   and rewrite §6 (frontend) and §8 (tech stack) for React/Vue/Svelte, Supabase/SQLite,
>   etc. The **data model and REST contract are the stable core** — everything else is
>   swappable.
> - **Extend it:** the AI adapter interface (§3.4) and feed sources (§3.2) are designed as
>   clean extension points.
>
> MIT-licensed — fork it, ship it, make it yours.

---

## 1. Overview

A personal favorites portal styled as a Fiori Launchpad — a curated, self-maintained dashboard
of links organized into pages (categories), displayed as Fiori tiles with rich previews.
Targets SAP professionals who regularly consume SAP Learning Hub, SAP Blogs, SAP Help
Documentation, GitHub repositories, and YouTube content.

The architecture is designed for three horizons:

| Horizon | Description |
|---------|-------------|
| **Now** | Local development, full CRUD via admin UI, PostgreSQL via Docker or Supabase free tier |
| **Soon** | Deploy backend to Azure App Service or Railway; static viewer optionally to GitHub Pages |
| **Future** | AI layer: auto-scraping, content suggestions, auto-tagging, summarisation — pluggable, provider-agnostic |

---

## 2. Core Concepts

| Term | Definition |
|------|-----------|
| **Page** | A named category (e.g. "ABAP", "BTP", "YouTube"). Rendered as a tab in the nav bar. |
| **Tile** | A Fiori-style card representing one link. Contains title, subtitle, preview image, description, URL, and type tag. |
| **Preview** | Auto-fetched thumbnail/favicon pulled from the target URL at tile creation time. |
| **Type Tag** | Badge indicating content source: SAP Blog, Learning Hub, GitHub, YouTube, SAP Help, Other. |
| **Feed Source** | A configured source (YouTube channel, SAP Blog tag, GitHub topic) that the AI scraper monitors. |
| **Suggestion** | An AI-proposed tile awaiting user approval before appearing on the board. |

---

## 3. Feature List

### 3.1 Viewer (Public / Default View)
- Fiori Launchpad-style layout, `sap_horizon_dark` theme
- Top navigation bar with page tabs
- Responsive tile grid: 4 col desktop · 2 col tablet · 1 col mobile
- Each tile displays:
  - Thumbnail or favicon preview
  - Title + subtitle
  - Short description (truncated, expandable on hover)
  - Type badge (color-coded by source)
  - Hover: elevation glow + scale(1.02)
- Click opens link in new tab
- Global search bar filtering tiles across all pages
- Empty state when a page has no tiles

### 3.2 Admin UI (Protected, `/admin`)
- PIN/password protected (bcrypt hash stored in DB)
- **Page management:** create · rename · reorder · delete · set icon
- **Tile management:**
  - Paste URL → auto-fetch preview (title, OG image, favicon, description)
  - Override any field manually
  - Assign to page · set type tag · set position
  - Drag-and-drop reorder
  - Delete with confirmation
- **Feed Source management** (AI-ready):
  - Register a feed source: type (YouTube channel, SAP Blog tag, GitHub topic, RSS), identifier, target page
  - Enable/disable auto-scrape per source
  - Set scrape frequency (daily / weekly)
- **Suggestions inbox:**
  - Review AI-proposed tiles
  - Approve (adds to board) · Edit then approve · Reject
- **Import / Export:** full JSON backup and restore

### 3.3 Preview Fetcher Service
- Endpoint: `GET /api/preview?url=<url>`
- **SSRF protection:** the target hostname is resolved and rejected if it points at
  `localhost`, `*.local`, or any private/loopback/link-local IP range (IPv4 + IPv6).
  Fails closed on DNS errors.
- Strategy per source type:
  - **YouTube:** extract video ID → `https://img.youtube.com/vi/{id}/mqdefault.jpg`, pull title via YouTube Data API v3 (API key optional, OG fallback)
  - **GitHub:** extract `owner/repo` → GitHub REST API for description + social preview image
  - **SAP Help / SAP Blogs / Learning Hub:** `node-fetch` + `cheerio` OG tag scraping
  - **Generic:** OG tags (`og:title`, `og:image`, `og:description`) → `<title>` + favicon fallback
- Returns: `{ title, subtitle, description, imageUrl, faviconUrl, detectedType }`

### 3.4 AI Service Layer (Pluggable, v2+)
Designed as an internal service module — swappable provider, clean interface.

**Interface contract (`ai-service.js`):**
```js
// All methods are provider-agnostic. Swap the adapter without touching callers.
aiService.summarise(url, content)       → { summary, tags[] }
aiService.detectType(url, content)      → { type, confidence }
aiService.suggestTiles(feedSource)      → { tiles[] }
aiService.rankSuggestions(tiles[])      → { tiles[] }  // by relevance
```

**Adapters (one active at a time, set via env var):**
- `adapters/openai.js` — OpenAI / Azure OpenAI
- `adapters/anthropic.js` — Claude API
- `adapters/ollama.js` — local LLM (Ollama, fully offline)
- `adapters/noop.js` — no-op stub (default, safe for local dev without any API key)

**AI Features (activate per adapter when ready):**

| Feature | Description |
|---------|-------------|
| Auto-summarise | When a tile is created, generate a 1–2 sentence summary of the linked page |
| Auto-tag | Detect type and suggest tags based on URL + page content |
| Feed scraping | Given a registered feed source, scrape latest items and propose tiles |
| Relevance ranking | Score and rank suggestions by inferred relevance to user's existing content |

**Scraping scheduler:**
- `node-cron` job runs on configurable schedule
- Reads active feed sources from DB
- For each source, calls the appropriate scraper + AI adapter
- Inserts results into `suggestions` table
- Admin gets notified via badge on the Suggestions inbox

---

## 4. Data Model (PostgreSQL)

```sql
-- Pages (categories / tabs)
CREATE TABLE pages (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,                -- SAP icon name or emoji
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tiles (individual link cards)
CREATE TABLE tiles (
  id           SERIAL PRIMARY KEY,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  description  TEXT,
  url          TEXT NOT NULL,
  image_url    TEXT,
  favicon_url  TEXT,
  type         TEXT CHECK(type IN (
                 'sap-blog','learning-hub','github',
                 'youtube','sap-help','other'
               )) DEFAULT 'other',
  position     INTEGER NOT NULL DEFAULT 0,
  ai_summary   TEXT,              -- populated by AI service, nullable
  ai_tags      TEXT[],            -- array of AI-generated tags
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Feed Sources (for AI scraper)
CREATE TABLE feed_sources (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT CHECK(type IN (
                 'youtube-channel','sap-blog-tag',
                 'github-topic','rss'
               )) NOT NULL,
  identifier   TEXT NOT NULL,     -- channel ID, tag slug, topic, RSS URL
  target_page  INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  enabled      BOOLEAN DEFAULT TRUE,
  frequency    TEXT CHECK(frequency IN ('daily','weekly')) DEFAULT 'weekly',
  last_scraped TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- AI-proposed tiles awaiting approval
CREATE TABLE suggestions (
  id           SERIAL PRIMARY KEY,
  feed_source_id INTEGER REFERENCES feed_sources(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  description  TEXT,
  url          TEXT NOT NULL,
  image_url    TEXT,
  type         TEXT DEFAULT 'other',
  ai_summary   TEXT,
  ai_tags      TEXT[],
  status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  published_at TIMESTAMPTZ,        -- original publish date of the scraped item (003)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_suggestions_status ON suggestions(status);
CREATE INDEX idx_suggestions_published_at ON suggestions(published_at DESC);

-- App settings (admin PIN hash, site title, active AI adapter, etc.)
CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value        TEXT
);
```

---

## 5. REST API (Express)

### Pages
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/pages` | List all pages with tile counts |
| POST | `/api/pages` | Create a page |
| PUT | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page and tiles |
| POST | `/api/pages/reorder` | Batch reorder pages |

### Tiles
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/pages/:id/tiles` | List tiles for a page |
| GET | `/api/tiles` | All tiles (for search) |
| POST | `/api/tiles` | Create tile |
| PUT | `/api/tiles/:id` | Update tile |
| DELETE | `/api/tiles/:id` | Delete tile |
| POST | `/api/tiles/reorder` | Batch reorder tiles |

### Utilities
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Health check — returns DB connectivity status |
| GET | `/api/preview` | Fetch URL preview metadata (SSRF-guarded) |
| GET | `/api/export` | Export full DB as JSON *(auth required)* |
| POST | `/api/import` | Import JSON (merge or replace) *(auth required)* |

### Feed Sources & AI
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/feeds` | List feed sources |
| POST | `/api/feeds` | Create feed source |
| PUT | `/api/feeds/:id` | Update feed source |
| DELETE | `/api/feeds/:id` | Delete feed source |
| POST | `/api/feeds/:id/scrape` | Trigger manual scrape now |
| GET | `/api/suggestions` | List pending suggestions |
| PUT | `/api/suggestions/:id/approve` | Approve → promote to tile |
| PUT | `/api/suggestions/:id/reject` | Reject suggestion |

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Verify PIN → return JWT (12h TTL). IP rate-limited: 10 attempts / 15 min |
| POST | `/api/auth/change-pin` | Change admin PIN (auth required; verifies current PIN) |

**Authorization model:**
- All write endpoints require `Authorization: Bearer <jwt>`.
- The admin-only read endpoints (`/api/feeds`, `/api/suggestions`, `/api/export`)
  also require auth — they expose management data, not public content.
- Public read endpoints (`/api/pages`, `/api/tiles`, `/api/pages/:id/tiles`,
  `/api/preview`, `/api/health`) are unauthenticated.
- JWTs are stateless and carry `role: 'admin'`. The admin PIN is stored as a
  bcrypt hash in the `settings` table (`admin_pin_hash`), seeded from `ADMIN_PIN`
  on first run. Production refuses default `JWT_SECRET` / `ADMIN_PIN` values.

---

## 6. Frontend Architecture (OpenUI5)

### App Structure
```
webapp/
├── index.html                   ← OpenUI5 CDN bootstrap, sap_horizon_dark
├── manifest.json                ← App descriptor, routing config
├── Component.js
├── controller/
│   ├── App.controller.js        ← Shell, routing, auth state
│   ├── Home.controller.js       ← Viewer: pages + tile grid + search
│   ├── Admin.controller.js      ← Admin shell
│   ├── AdminTiles.controller.js ← Tile CRUD
│   ├── AdminPages.controller.js ← Page CRUD
│   ├── AdminFeeds.controller.js ← Feed source management
│   └── AdminSuggestions.controller.js ← Suggestions inbox
├── view/
│   ├── App.view.xml
│   ├── Home.view.xml
│   ├── Admin.view.xml
│   ├── AdminTiles.view.xml
│   ├── AdminPages.view.xml
│   ├── AdminFeeds.view.xml
│   └── AdminSuggestions.view.xml
├── fragment/
│   ├── TileDialog.fragment.xml
│   ├── PageDialog.fragment.xml
│   ├── FeedDialog.fragment.xml
│   └── LoginDialog.fragment.xml
├── model/
│   ├── models.js                ← JSONModel, API fetch helpers
│   └── formatter.js             ← Type-badge colour/label + text formatters
├── i18n/
│   └── i18n.properties          ← UI text resource bundle
└── css/
    └── custom.css               ← Tile hover glow, badge colours, overrides
```

### Key OpenUI5 Components
| Component | Usage |
|-----------|-------|
| `sap.f.GridContainer` | Responsive tile grid |
| `sap.m.GenericTile` | Individual link tiles |
| `sap.m.IconTabBar` | Page/category tabs |
| `sap.m.SearchField` | Global tile search |
| `sap.m.Dialog` | Create/edit forms |
| `sap.m.MessageBox` | Delete confirmations |
| `sap.m.NotificationListItem` | Suggestions inbox items |
| `sap.m.BadgeCustomData` | Pending suggestion count badge |

### Tile Design
```
┌──────────────────────────────┐
│  [thumbnail / favicon]       │  ← 100% width, 120px, object-fit: cover
│                              │
│  Title                       │  ← Bold
│  Subtitle                    │  ← Muted, truncated
│  Short description           │  ← 2-line clamp, revealed on hover
│  [TYPE BADGE]  [AI TAG] ...  │  ← Colored pills
└──────────────────────────────┘
  Hover: box-shadow glow + scale(1.02) transition 150ms
```

---

## 7. Type Badge Colour Scheme (Dark Theme)

| Type | Label | Hex |
|------|-------|-----|
| `sap-blog` | SAP Blog | `#0070F2` |
| `learning-hub` | Learning Hub | `#E76500` |
| `github` | GitHub | `#8B949E` |
| `youtube` | YouTube | `#FF0000` |
| `sap-help` | SAP Help | `#188918` |
| `other` | Link | `#6E6E6E` |

---

## 8. Full Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| UI Framework | OpenUI5 (CDN) | No build step required |
| Theme | `sap_horizon_dark` | Via OpenUI5 theming |
| Backend | Node.js 20 LTS + Express 4 | |
| Database | PostgreSQL 16 | Local: Docker · Cloud: Supabase / Azure DB / Railway |
| ORM / Query | `pg` (node-postgres) + raw SQL | Custom migration runner (`server/migrate.js`, `schema_migrations` table) |
| Preview scraping | Native `fetch` (Node 20) + `cheerio` | No `node-fetch` dependency |
| Scheduler | `node-cron` (v4) | Feed scraping jobs (daily 06:00, weekly Mon 06:00) |
| CORS | `cors` | Allowlist via `CORS_ORIGIN` env var |
| Auth | `jsonwebtoken` + `bcryptjs` | Stateless JWT (12h), bcrypt PIN hash, login rate-limiting |
| AI Adapter | Provider-agnostic interface | Default: noop stub; swap via `AI_ADAPTER` env var |
| Dev tooling | `nodemon` · `dotenv` · `eslint` | |
| Containerisation | Docker + `docker-compose.yml` | PostgreSQL + app in compose for local dev |
| **Future hosting** | Azure App Service (backend) | Standard tier, Node runtime |
| | Azure Database for PostgreSQL | Flexible server |
| | GitHub Pages (static viewer) | JSON export mode |
| | Railway / Render / Supabase | Cheaper alternative paths |

---

## 9. Project Folder Structure

```
favorites-portal/
├── docker-compose.yml           ← Local dev: app + postgres containers
├── Dockerfile                   ← Production image
├── package.json
├── .env.example                 ← Template for required env vars
├── .gitignore
├── README.md
│
├── server/
│   ├── index.js                 ← Express entry point (health, CORS, routes, SPA fallback)
│   ├── db.js                    ← pg pool + query helper
│   ├── migrate.js               ← Migration runner (tracks via schema_migrations)
│   ├── seed.js                  ← Seed example pages + tiles, set admin PIN hash
│   ├── export.js                ← Static-viewer JSON export (docs/)
│   ├── auth.js                  ← JWT + bcrypt PIN helpers, requireAuth middleware
│   ├── scheduler.js             ← node-cron feed jobs
│   │
│   ├── routes/
│   │   ├── pages.js
│   │   ├── tiles.js
│   │   ├── preview.js
│   │   ├── feeds.js
│   │   ├── suggestions.js
│   │   ├── auth.js
│   │   └── importExport.js
│   │
│   ├── services/
│   │   ├── previewFetcher.js    ← OG/YouTube/GitHub scraper
│   │   ├── feedScraper.js       ← Per-source scrape logic
│   │   └── ai/
│   │       ├── aiService.js     ← Provider-agnostic interface
│   │       └── adapters/
│   │           ├── noop.js      ← Default stub (no API key needed)
│   │           ├── openai.js    ← OpenAI / Azure OpenAI
│   │           ├── anthropic.js ← Claude API
│   │           └── ollama.js    ← Local LLM
│   │
│   └── migrations/
│       ├── 001_initial.sql              ← pages, tiles, settings
│       ├── 002_ai_tables.sql            ← feed_sources, suggestions
│       └── 003_suggestion_published.sql ← suggestions.published_at + index
│
└── webapp/                      ← OpenUI5 frontend (see §6)
    └── ...
```

---

## 10. Environment Variables (`.env`)

```dotenv
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/favorites

# Auth
JWT_SECRET=change-me-to-a-long-random-string
ADMIN_PIN=1234

# CORS allowlist (comma-separated origins). Empty = same-origin only.
# Example: CORS_ORIGIN=http://localhost:8080,https://portal.example.com
CORS_ORIGIN=

# Preview fetching (optional, improves quality)
YOUTUBE_API_KEY=
GITHUB_TOKEN=

# AI (set adapter name; leave blank to use noop stub)
AI_ADAPTER=noop            # options: noop | openai | anthropic | ollama
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## 11. Deployment Guides (Summary)

### Local Development
```bash
docker-compose up        # starts postgres + app
# OR
npm install
npm run migrate          # apply pending SQL migrations
npm run seed             # optional: example pages/tiles + admin PIN hash
npm run dev              # nodemon
```

Other scripts: `npm start` (production), `npm run export` (static viewer JSON),
`npm run lint` (eslint).

### Azure App Service
1. Create Azure App Service (Node 20 LTS, Linux)
2. Create Azure Database for PostgreSQL (Flexible Server)
3. Set all env vars in App Service → Configuration
4. Deploy via GitHub Actions CI/CD or `az webapp deploy`

### Railway / Render
1. Connect GitHub repo
2. Add PostgreSQL plugin (auto-injects `DATABASE_URL`)
3. Set remaining env vars in dashboard
4. Deploy — zero config needed

### GitHub Pages (Static Viewer Only)
1. Run `npm run export` → generates `docs/data.json` + copies `webapp/`
2. Enable GitHub Pages pointing to `/docs`
3. Viewer reads `data.json` directly; admin UI not available in this mode

---

## 12. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Tile grid render time | < 200ms for 200 tiles |
| API response time | < 300ms for all CRUD endpoints |
| Preview fetch timeout | 5s max per URL, non-blocking |
| Accessibility | Keyboard navigable, ARIA labels, visible focus |
| Responsive | 1920px desktop → 375px mobile |
| Security | JWT auth on all write APIs; bcrypt PIN; no secrets in frontend |
| Portability | Single `DATABASE_URL` env var → works on any Postgres host |

---

## 13. Out of Scope (v1)

- Multi-user / team support
- OAuth / SSO / social login
- Public sharing of tile collections
- Browser extension for one-click saving
- Full-text search of linked page content
- AI features active by default (stubbed, not wired)

---

## 14. Development Phases

> **Current state:** Phases 1–6 are scaffolded and functional. The four AI adapters
> (`noop`, `openai`, `anthropic`, `ollama`) are present and wired through the
> provider-agnostic `aiService` interface; `noop` is the default, so AI features are
> inert until an adapter + API key is configured.

### Phase 1 — Foundation
- Repo scaffold with `docker-compose.yml` (app + postgres)
- DB schema + migrations (`node-pg-migrate`)
- Express app skeleton with health check endpoint
- Auth: PIN login → JWT

### Phase 2 — Core API
- Full CRUD for pages and tiles
- Preview fetcher (OG + YouTube + GitHub)
- Import/export endpoints

### Phase 3 — Viewer UI (OpenUI5)
- `sap_horizon_dark` bootstrap
- `IconTabBar` page navigation
- `GenericTile` grid with type badges
- Global search

### Phase 4 — Admin UI (OpenUI5)
- Login dialog
- Page management (create · rename · reorder · delete)
- Tile management with URL preview auto-fetch
- Drag-and-drop reorder

### Phase 5 — AI Infrastructure
- `aiService.js` interface + `noop` adapter
- Feed source table + admin UI
- `node-cron` scheduler skeleton
- Suggestions inbox (pending → approve/reject)
- Wire in first real adapter (OpenAI or Anthropic)

### Phase 6 — Polish & Deploy
- Dockerfile + production `docker-compose`
- GitHub Actions CI/CD pipeline (test → build → deploy)
- GitHub Pages static export script
- Azure deployment guide in README
- Seed data script (example pages + tiles)

---

*Generated: June 2026 · Last synced with codebase: 2026-06-29*
