# GratisStatt

Desktop-App für Windows mit einer **lokalen Datenbank von GitHub-Projekten** (ca. 100'000). Du gibst ein, wofür du
zahlst – oben erscheinen die kuratierten Gratis-Alternativen, darunter alle passenden Projekte aus der Datenbank.
Alles lässt sich offline durchsuchen. Ein Klick öffnet das Projekt auf GitHub.

- Einmal pro Woche lädt die App ein **Update-Paket** (von GitHub Releases, per SHA-256 geprüft).
- **Live-Suche** auf GitHub bei wenigen Treffern; Funde werden lokal gespeichert.
- **GratisStatt-Netzwerk** (freiwillig, standardmässig aus): Live-Funde gehen nach einer Prüfung an alle.

> **Hinweis:** GratisStatt ist ein privates Spass-Projekt. Die Nutzung erfolgt auf eigene Gefahr – es wird keinerlei
> Haftung übernommen, weder für die App noch für die angezeigten Programme, Daten, Links oder Downloads.

## Herunterladen

Das fertige Windows-Programm gibt es unter **[Releases](https://github.com/tmluc-cool/githuub-appstore/releases/latest)**:

- `GratisStatt-Setup-<version>.exe` – Installer (empfohlen)
- `GratisStatt-<version>-portable.exe` – startet ohne Installation

Windows warnt beim ersten Start, weil das Programm nicht signiert ist: «Weitere Informationen» → «Trotzdem ausführen».

Gebaut wird automatisch von der GitHub Action `.github/workflows/build-windows.yml` bei jedem Push auf `main`
(oder von Hand unter *Actions → Windows-Programm bauen → Run workflow*). Die Datenbank wird dabei einmal pro Woche
neu gecrawlt (ca. 1 Stunde), sonst aus dem Cache genommen.

## Schnellstart (Entwicklung)

```bash
npm install
npm run fetch-base          # neueste Basis-Datenbank herunterladen (sobald gratisstatt-data Releases hat)
# oder: npm run build-base-db  (selbst crawlen, ca. 1 Stunde mit Token in .env)
npm run dev
npm test                    # Crawler, Datenbank, Suche (<100 ms bei 100'000 Projekten), Pakete, Netzwerk, Server
npm run typecheck
```

Für einen schnellen Test reicht eine kleine Datenbank:
`npm run build-base-db -- --filter "stars:>=20000"` (ca. 2'000 Projekte, ein paar Minuten auch ohne Token).

## Windows-Programm bauen

1. `resources/base.db` bereitstellen (`npm run fetch-base` oder `npm run build-base-db`).
2. Auf **Windows**: `npm run dist` (oder einfach die GitHub Action machen lassen, siehe «Herunterladen»)
   – prüft, dass `base.db` existiert, führt `validate` aus (kuratierte Liste gegen `base.db`) und baut mit
   electron-builder. Ergebnis in `release/`: `GratisStatt-Setup-<version>.exe` und `GratisStatt-<version>-portable.exe`.

`npm run validate -- --fix` holt Repos der kuratierten Liste, die in `base.db` fehlen, von GitHub nach.

## Einrichtung (einmalig)

Schritt für Schritt in einfacher Sprache: **[docs/EINRICHTUNG.md](docs/EINRICHTUNG.md)**.

### 1. Daten-Repo `gratisstatt-data`
1. Öffentliches Repo `<owner>/gratisstatt-data` anlegen.
2. `.github/workflows/weekly-delta.yml` aus diesem Repo dorthin kopieren.
3. Dort unter *Settings → Secrets and variables → Actions*:
   - Variable `APP_REPO` = `<owner>/githuub-appstore`
   - Variable `SERVER_URL` = URL des Workers (nur fürs Netzwerk)
   - Secret `ADMIN_SECRET` = derselbe Wert wie auf dem Server (nur fürs Netzwerk)
4. Action einmal manuell starten mit «Also build a fresh base database». Danach läuft sie jeden Montag.

Jedes Release enthält `delta-YYYY-MM-DD.db`, `manifest.json` (alle Pakete mit Datum, Anzahl, Grösse, SHA-256 und
`latest_base`) und einmal im Monat `base-YYYY-MM-DD.db`. Die App lädt
`https://github.com/<owner>/gratisstatt-data/releases/latest/download/manifest.json`.

### 2. GitHub OAuth Apps
- **App-Anmeldung (Device Flow):** neue OAuth App, «Enable Device Flow» an. Client-ID in `src/main/config.ts`
  (`oauthClientId`) eintragen. Keine Scopes, kein Secret in der App.
- **Admin-Dashboard (Web Flow):** zweite OAuth App mit Callback `https://<worker>/admin/callback`.

### 3. Server (Cloudflare Worker + D1)
```bash
cd server && npm install
npx wrangler d1 create gratisstatt         # database_id in wrangler.toml eintragen
npx wrangler secret put ADMIN_SECRET        # langer Zufallswert
npx wrangler secret put ADMIN_GITHUB_ID     # deine numerische GitHub-ID
npx wrangler secret put ADMIN_OAUTH_CLIENT_ID
npx wrangler secret put ADMIN_OAUTH_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # langer Zufallswert
cd .. && npm run server:deploy
```
Danach die Worker-URL in `src/main/config.ts` (`serverUrl`) eintragen. Lokal: `npm run server:dev`.

Endpunkte unter `/v1`: `POST /register`, `POST /heartbeat`, `POST /submissions`, `GET /me`, `DELETE /me`,
`GET /admin/submissions`, `POST /admin/submissions/result`. Dashboard unter `/admin`.

## Aufbau

```
src/shared/crawler/   Ein Crawler für Basis-Script, GitHub Action und App (Suche, Halbieren, Rate-Limits, Upsert)
src/shared/db/        Volltextsuche (FTS5, bm25 + Sterne-Bonus), Filter
src/main/             Fenster, IPC, Datenbank, Update-Planung, Live-Suche, Netzwerk-Client
src/main/sync-worker  Update-Pakete einmischen, manuelles Update (eigener Thread, eigene DB-Verbindung)
src/preload/          Kleines, typisiertes IPC-API
src/renderer/         Oberfläche (React, Tailwind, virtualisierte Liste)
server/               Cloudflare Worker, D1-Schema, Admin-Dashboard
scripts/              build-base-db, build-delta, validate-data, fetch-base, make-icon
data/                 alternatives.json (kuratiert), topic-map.json (Kategorien/Plattformen aus Topics)
docs/PRIVACY.md       Datenschutzerklärung (auch in der App)
```

## Sicherheit und Datenschutz

- `contextIsolation`, `sandbox`, kein `nodeIntegration`, strenge CSP. Der Renderer hat keinen Netz-, Datei- oder DB-Zugriff.
- Externe Links nur `https://github.com/…` und die `website`-URLs der kuratierten Liste.
- Alle SQL-Abfragen mit Parametern, Sucheingaben für FTS5 escaped.
- Update-Pakete werden vor dem Einmischen per SHA-256 geprüft.
- Tokens nur mit Electron `safeStorage`, nie im Klartext, nie im Renderer.
- Ohne Netzwerk spricht die App nur mit GitHub. Das Netzwerk ist Opt-in; vorher wird nichts an den Server gesendet.
- Server: Eingaben mit zod geprüft, Limits pro Nutzer, keine IP-Adressen, keine Logs, Inaktive nach 12 Monaten gelöscht.

---

Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern.
