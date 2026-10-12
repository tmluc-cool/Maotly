# Moatly

Desktop app for Windows with a **local database of GitHub projects** (about 230,000). You type in what you are
paying for – the curated free alternatives appear at the top, and below them all matching projects from the database.
Everything can be searched offline. One click opens the project on GitHub.

The app is available in English, German and Spanish (Settings → Language).

- Once a week, the app downloads an **update package** (from GitHub Releases, verified with SHA-256).
- **Live search** on GitHub when there are only a few results; finds are saved locally.
- **Moatly network** (optional, off by default): after a review, live finds are shared with everyone.

> **Note:** Moatly is a private fun project. Use at your own risk – no liability whatsoever is accepted,
> neither for the app nor for the listed programs, data, links or downloads.

## Download

The ready-to-use Windows program is available under **[Releases](https://github.com/tmluc-cool/githuub-appstore/releases/latest)**:

- `Moatly-Setup-<version>.exe` – installer (recommended)
- `Moatly-<version>-portable.exe` – runs without installation

Windows shows a warning on the first start because the program is not signed: "More info" → "Run anyway".

It is built automatically by the GitHub Action `.github/workflows/build-windows.yml` on every push to `main`
(or manually under *Actions → Build Windows app → Run workflow*). The database is crawled again once a week
(about 2 hours); otherwise it is taken from the cache. The download is about 175 MB, mostly the database.

## Support

Moatly is free and stays free – without ads or tracking. If it saves you money, you can support it on
**[GitHub Sponsors](https://github.com/sponsors/tmluc-cool)** ❤ (also via the coffee cup ☕ at the bottom right of the app).
Completely voluntary.

## Quick start (development)

```bash
npm install
npm run fetch-base          # download the latest base database (once moatly-data has releases)
# or: npm run build-base-db  (crawl it yourself, about 2 hours with a token in .env)
npm run dev
npm test                    # crawler, database, search (<100 ms with 100,000 projects), packages, network, server
npm run typecheck
```

For a quick test, a small database is enough:
`npm run build-base-db -- --filter "stars:>=20000"` (about 2,000 projects, a few minutes even without a token).

## Building the Windows program

1. Provide `resources/base.db` (`npm run fetch-base` or `npm run build-base-db`).
2. On **Windows**: `npm run dist` (or simply let the GitHub Action do it, see "Download")
   – checks that `base.db` exists, runs `validate` (curated list against `base.db`) and builds with
   electron-builder. Output in `release/`: `Moatly-Setup-<version>.exe` and `Moatly-<version>-portable.exe`.

`npm run validate -- --fix` fetches repos from the curated list that are missing in `base.db` from GitHub.

## Setup (one-time)

Step by step in plain language: **[docs/EINRICHTUNG.md](docs/EINRICHTUNG.md)** (German).

### 1. Data repo `moatly-data`
1. Create the public repo `<owner>/moatly-data`.
2. Copy `.github/workflows/weekly-delta.yml` from this repo into it.
3. There, under *Settings → Secrets and variables → Actions*:
   - Variable `APP_REPO` = `<owner>/githuub-appstore`
   - Variable `SERVER_URL` = URL of the Worker (only for the network)
   - Secret `ADMIN_SECRET` = the same value as on the server (only for the network)
4. Start the action once manually with "Also build a fresh base database". After that, it runs every Monday.

Every release contains `delta-YYYY-MM-DD.db`, `manifest.json` (all packages with date, count, size, SHA-256 and
`latest_base`) and, once a month, `base-YYYY-MM-DD.db`. The app loads
`https://github.com/<owner>/moatly-data/releases/latest/download/manifest.json`.

### 2. Sign in with GitHub and network (OAuth App + Cloudflare server)
No terminal needed. Create a GitHub OAuth App with "Enable Device Flow" and run
*Actions → Set up sign-in and server → Run workflow* with its Client ID: that alone turns on "Sign in with GitHub"
(faster searches, no server involved). For the network, also add the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (free Cloudflare account) and run it again. The workflow (`.github/workflows/deploy-server.yml`)
creates the D1 database, applies the migrations, creates missing random secrets, deploys the Worker, writes the
server address and Client ID into `src/main/config.ts` and starts a new Windows build. Step by step:
[docs/EINRICHTUNG.md](docs/EINRICHTUNG.md) (German).

Manually instead: `cd server && npm install && npx wrangler login`, `npx wrangler d1 create moatly` (enter the
`database_id` in `wrangler.toml`), set the secrets `ADMIN_SECRET`, `SESSION_SECRET`, `ADMIN_GITHUB_ID`,
`ADMIN_OAUTH_CLIENT_ID`, `ADMIN_OAUTH_CLIENT_SECRET` with `npx wrangler secret put <NAME>`, then `npm run server:deploy`.
Locally: `npm run server:dev`.

Endpoints under `/v1`: `POST /register`, `POST /heartbeat`, `POST /submissions`, `GET /me`, `DELETE /me`,
`GET /admin/submissions`, `POST /admin/submissions/result`. Dashboard under `/admin`.

## Structure

```
src/shared/crawler/   One crawler for the base script, GitHub Action and app (search, splitting, rate limits, upsert)
src/shared/db/        Full-text search (FTS5, bm25 + star bonus), filters
src/main/             Window, IPC, database, update scheduling, live search, network client
src/main/sync-worker  Merging update packages, manual update (own thread, own DB connection)
src/preload/          Small, typed IPC API
src/renderer/         User interface (React, Tailwind, virtualized list)
server/               Cloudflare Worker, D1 schema, admin dashboard
scripts/              build-base-db, build-delta, validate-data, fetch-base, make-icon
data/                 alternatives.json (curated), topic-map.json (categories/platforms from topics)
docs/PRIVACY.md       Privacy policy (also in the app); German: PRIVACY.de.md, Spanish: PRIVACY.es.md
```

## Security and privacy

- `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP. The renderer has no network, file or DB access.
- External links only to `https://github.com/…` and the `website` URLs of the curated list.
- All SQL queries use parameters; search input for FTS5 is escaped.
- Update packages are verified with SHA-256 before they are merged.
- Tokens only with Electron `safeStorage`, never in plain text, never in the renderer.
- Without the network, the app only talks to GitHub. The network is opt-in; nothing is sent to the server before that.
- Server: input validated with zod, limits per user, no IP addresses, no logs, inactive users deleted after 12 months.

Full privacy policy: [docs/PRIVACY.md](docs/PRIVACY.md) (also in [German](docs/PRIVACY.de.md) and [Spanish](docs/PRIVACY.es.md)).

---

No affiliation with the companies mentioned. Product names belong to their respective owners.
