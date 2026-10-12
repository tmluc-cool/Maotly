# GratisStatt – Projektbeschreibung für Claude Code

> Arbeitstitel "GratisStatt" (kann später geändert werden).
> Diese Datei beschreibt das ganze Projekt. Halte dich bei allen Aufgaben daran.

## Idee

Eine **Desktop-App für Windows (.exe)** mit einer **lokalen Datenbank von GitHub-Projekten**.

- Die App wird mit einer **Basis-Datenbank** (ca. 100'000 Projekte) ausgeliefert. Man kann sofort und offline alles durchsuchen.
- Gibt man ein, **wofür man gerade zahlt** (z.B. "Photoshop"), erscheinen oben die **kuratierten Gratis-Alternativen** und darunter **alle passenden Projekte** aus der Datenbank (Volltextsuche).
- Ein Klick auf ein Projekt **öffnet die GitHub-Seite im Browser**. Dort lädt man selbst herunter.
- **Einmal pro Woche** lädt die App im Hintergrund ein **Update-Paket** herunter (neue und geänderte Projekte), das eine GitHub Action zentral erstellt. Die Datenbank wächst mit der Zeit. Gelöscht wird nichts, nur aktualisiert.
- Man kann **manuell aktualisieren** und bei fehlenden Treffern **live auf GitHub suchen**. Gefundene Projekte werden lokal gespeichert.
- **GratisStatt-Netzwerk (freiwillig, standardmässig aus):** Wer mitmacht, meldet sich mit GitHub an. Projekte, die er über die Live-Suche findet, kommen nach einer Prüfung ins nächste Update-Paket für **alle**. Der Admin (ich) sieht in einem Dashboard, wer aktiv mitmacht: nur GitHub-Username, App-Version, letzter aktiver Tag und Anzahl Beiträge.

Zielgruppe: normale Leute, keine Entwickler. Alles muss in einfacher Sprache erklärt sein.

## Regeln

- UI-Sprache: Deutsch, Schweizer Schreibweise (immer "ss", nie "ß"). Code, Variablen und Commit-Messages auf Englisch. Projektbeschreibungen von GitHub bleiben im Original (meist Englisch).
- **Lokal zuerst:**
  - **Ohne Netzwerk** spricht die App nur mit GitHub (API und Release-Downloads). Keine Tracker, keine Analytics, keine Absturzberichte.
  - **Mit Netzwerk** spricht sie zusätzlich mit dem eigenen Server, aber nur mit genau den Daten, die im Abschnitt "Netzwerk" beschrieben sind.
- Funktioniert **offline** mit der lokalen Datenbank.
- **Das Netzwerk ist Opt-in:** Nichts wird an den eigenen Server gesendet, bevor der Nutzer aktiv "Mitmachen" gewählt und sich angemeldet hat.
- Keine Dark Patterns: "Mitmachen" und "Nein danke" gleich gross und gleich auffällig, nichts vorausgewählt.
- Keine Logos der bezahlten Produkte (Markenrecht). Nur Textnamen.
- Im "Über"-Bereich: "Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern."
- In der lokalen Datenbank nur öffentliche Repo-Metadaten speichern (keine E-Mail-Adressen, keine User-Profile).
- Nach jeder abgeschlossenen Phase: kurz zusammenfassen, was gemacht wurde und wie ich es testen kann.

## Tech-Stack

**App**
- **Electron** mit **electron-vite** (React + TypeScript), Tailwind CSS
- **better-sqlite3** mit **FTS5** (Volltextsuche), WAL-Modus. Für Electron neu kompilieren (`electron-builder install-app-deps`).
- **worker_threads** für Updates: eigener Worker mit eigener DB-Verbindung, damit die Oberfläche nie einfriert
- Fuse.js nur für die Autovervollständigung der kuratierten Produktnamen
- Virtualisierte Ergebnisliste (z.B. `@tanstack/react-virtual`)
- Hash-Routing (z.B. `#/suche?q=photoshop`, `#/statt/adobe-photoshop`)
- Vitest für Tests
- **electron-builder**: NSIS-Installer **und** portable .exe, Windows x64

**Server (nur für das Netzwerk)**
- **Cloudflare Worker** (TypeScript) + **Cloudflare D1** (SQLite), Gratis-Stufe
- Deploy mit `wrangler`
- Admin-Dashboard als statische Seite, ausgeliefert vom selben Worker unter `/admin`

**Update-Pakete**
- **GitHub Action** im öffentlichen Repo `gratisstatt-data`, läuft wöchentlich
- Veröffentlicht die Pakete als **GitHub Release Assets**

### Code-Aufteilung

- `src/shared/crawler/`: **ein** Crawler-Modul für Basis-Script, GitHub Action und App (Suchanfragen, Aufteilen, Rate-Limits, Upsert)
- `src/main/`: Fenster, IPC, Datenbank-Zugriff, Update-Planung, Netzwerk-Client
- `src/main/sync-worker.ts`: Update-Pakete einmischen, manuelles Update
- `src/preload/`: kleines, typisiertes IPC-API
- `src/renderer/`: Oberfläche (React)
- `server/`: Cloudflare Worker, D1-Schema und Migrationen, Admin-Dashboard
- `.github/workflows/weekly-delta.yml`: wöchentliches Update-Paket (läuft im Repo `gratisstatt-data`, Code kommt aus diesem Repo)

### Sicherheit (wichtig)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Der Renderer hat keinen Netzwerk-, Datei- und DB-Zugriff. Alles läuft im Main-Prozess bzw. Worker und wird über das Preload-API freigegeben.
- Externe Links nur über `shell.openExternal` und nur für `https://github.com/...` und die `website`-URLs aus der kuratierten Liste.
- Strenge Content-Security-Policy im Renderer.
- Alle SQL-Abfragen mit Parametern, nie Strings zusammensetzen. FTS-Eingaben escapen.
- Update-Pakete werden per **SHA-256** gegen das Manifest geprüft, bevor sie eingemischt werden.
- Tokens (GitHub, Server-Session) nur mit Electron `safeStorage`, nie im Klartext, nie im Renderer.
- Server: Eingaben validieren (z.B. mit zod), Limits pro Nutzer, keine Secrets im Code (Wrangler Secrets).

## Datenbank (lokal in der App)

Datei: `gratisstatt.db` im Ordner `app.getPath('userData')`.

### Schema

```sql
CREATE TABLE repos (
  id            INTEGER PRIMARY KEY,   -- GitHub-ID (bleibt bei Umbenennung gleich)
  full_name     TEXT NOT NULL,         -- "owner/name"
  name          TEXT NOT NULL,
  owner         TEXT NOT NULL,
  description   TEXT,
  topics        TEXT,                  -- durch Leerzeichen getrennt
  language      TEXT,
  license       TEXT,                  -- SPDX-ID
  stars         INTEGER NOT NULL,
  forks         INTEGER,
  archived      INTEGER NOT NULL DEFAULT 0,
  homepage      TEXT,
  html_url      TEXT NOT NULL,
  created_at    TEXT,
  pushed_at     TEXT,
  first_seen_at TEXT NOT NULL,         -- wann es in DIESER Datenbank zum ersten Mal auftauchte
  last_seen_at  TEXT NOT NULL,         -- letzte Aktualisierung
  source        TEXT NOT NULL          -- 'base' | 'delta' | 'manual' | 'live'
);

CREATE VIRTUAL TABLE repos_fts USING fts5(
  full_name, description, topics,
  content='repos', content_rowid='id', tokenize='unicode61'
);
-- Trigger halten repos_fts bei INSERT/UPDATE/DELETE synchron

CREATE TABLE sync_runs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,           -- 'delta' | 'manual'
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,           -- 'running' | 'done' | 'paused' | 'failed'
  since       TEXT,
  added       INTEGER DEFAULT 0,
  updated     INTEGER DEFAULT 0,
  progress    TEXT                     -- JSON, zum Fortsetzen
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
-- schema_version, base_version, applied_deltas (JSON-Liste), network_consent, consent_version, ...

CREATE TABLE pending_submissions (     -- Live-Funde, die noch an den Server gehen
  repo_id     INTEGER PRIMARY KEY,
  found_at    TEXT NOT NULL
);
```

- Speichern immer per **Upsert** (`INSERT ... ON CONFLICT(id) DO UPDATE`). `first_seen_at` und `source` beim Update nie überschreiben.
- Schreiben in **Transaktionen** (pro 100 Repos bzw. pro Paket).
- Schema-Migrationen über `meta.schema_version`, vor jeder Migration eine Sicherungskopie anlegen.

## Crawler (`src/shared/crawler/`)

- GitHub **Search API** (`/search/repositories`), 100 Treffer pro Seite. Die Treffer enthalten bereits alle nötigen Felder, also keine Einzelabfragen pro Repo.
- Pro Suchanfrage liefert GitHub **höchstens 1'000 Treffer**. Darum Bereiche **automatisch halbieren**, bis jeder Teil unter 1'000 liegt (nach Sternen, bei Bedarf zusätzlich nach Datum). Diese Logik testen.
- Fertige Teilbereiche speichern, damit ein abgebrochener Lauf **genau dort weitermacht**.
- Rate-Limits: Search API ohne Token **10 Anfragen pro Minute**, mit Token **30**. Header `x-ratelimit-remaining`, `x-ratelimit-reset` und `retry-after` auswerten und warten. Bei 403 oder 429 mit Backoff erneut versuchen, nie hämmern.
- Filter in `src/shared/crawler/config.ts`:
  - **Basis:** `stars:>=100 fork:false archived:false pushed:>=<heute minus 2 Jahre>`
  - **Updates:** `stars:>=100 fork:false pushed:>=<Stichtag>`
  - **Neue Projekte:** `stars:>=20 fork:false created:>=<Stichtag>`
- Archivierte Projekte nicht löschen, nur `archived = 1` setzen.

## Basis-Datenbank

- `scripts/build-base-db.ts` erstellt `resources/base.db` mit dem Basis-Filter.
- Token aus `GITHUB_TOKEN` in `.env` (steht in `.gitignore`).
- Läuft etwa 1 Stunde, zeigt den Fortschritt an, kann abgebrochen und fortgesetzt werden.
- Am Ende: Anzahl Projekte, Dateigrösse, `VACUUM`, `meta.base_version` = Datum.
- **Erster Start der App:** Gibt es noch keine `gratisstatt.db`, wird `base.db` aus den Ressourcen dorthin kopiert.
- **App-Update mit neuerer Basis:** Ist `base_version` der mitgelieferten Datei neuer, wird sie per `ATTACH` und Upsert eingemischt. Vorhandene Daten bleiben erhalten.

## Wöchentliches Update-Paket (für alle Nutzer)

### Erstellen: GitHub Action im Repo `gratisstatt-data`
1. Jeden Montag früh: Crawler mit "Updates" und "Neue Projekte" seit dem letzten Paket.
2. **Netzwerk-Beiträge** abholen: geprüfte Repo-IDs vom Server (`GET /v1/admin/submissions?status=pending`, mit Admin-Secret). Jedes Repo **selbst bei GitHub prüfen**: existiert, öffentlich, kein Fork, mind. 20 Sterne. Ergebnis zurückmelden (`accepted` oder `rejected` mit Grund).
3. Alles in **ein Paket** schreiben: kleine SQLite-Datei `delta-YYYY-MM-DD.db` mit derselben `repos`-Tabelle.
4. `manifest.json` aktualisieren: Liste aller Pakete mit Datum, Anzahl, Grösse und SHA-256, dazu `latest_base` (Datum und Download-URL einer frischen Basis, monatlich neu).
5. Beides als Assets an ein GitHub Release hängen.

### Einmischen: in der App (für alle, auch ohne Netzwerk)
- Beim Start und danach stündlich prüfen, ob die letzte Prüfung älter als 7 Tage ist.
- `manifest.json` laden über `https://github.com/<owner>/gratisstatt-data/releases/latest/download/manifest.json`. Das ist anonym, nur GitHub wird kontaktiert.
- Fehlende Pakete der Reihe nach laden, SHA-256 prüfen, per `ATTACH` und Upsert im Worker einmischen, in `meta.applied_deltas` eintragen.
- Fehlen mehr als 12 Pakete: stattdessen die neueste Basis laden und einmischen.
- Statusleiste unten: "Aktualisiere… 1'240 neu, 3'500 aktualisiert". Danach: "Datenbank: 104'213 Projekte · Stand 12.10.2026".
- Kein Internet → still überspringen, später erneut versuchen.

## Manuelles Update

Button **"Jetzt aktualisieren"** in der Statusleiste und in den Einstellungen:
1. Neue Update-Pakete holen (wie oben).
2. Danach lokal bei GitHub nach Projekten suchen, die **seit dem letzten Paket** neu oder geändert sind. Das passiert im Worker, gedrosselt, mit Pausieren und Fortsetzen nach dem Schliessen.
3. Token: beim Netzwerk der GitHub-Login, sonst optional ein eigener Token aus den Einstellungen, sonst ohne Token (langsamer).

## Live-Suche auf GitHub

- Bei wenigen oder keinen Treffern: Button **"Auf GitHub nach neuen Projekten suchen"**.
- Sucht live (Name, Beschreibung, README, Topics), sortiert nach Sternen, max. 50 Treffer.
- Alle Funde werden **lokal gespeichert** (`source = 'live'`) und erscheinen sofort mit Badge "Neu".
- **Nur wenn das Netzwerk eingeschaltet ist:** Funde, die nicht schon aus Basis oder Paket stammen, kommen in `pending_submissions`. Sie werden gesammelt (max. 1× pro Stunde) als reine Repo-IDs an den Server geschickt.

## GratisStatt-Netzwerk (freiwillig)

### Dialog beim ersten Start
Erscheint einmal, direkt nach dem ersten Start, als Fenster über der App. Er lässt sich nur mit einer der beiden Antworten schliessen. Text in einfacher Sprache, sinngemäss:

> **Willkommen bei GratisStatt!**
> Die App funktioniert komplett ohne Anmeldung.
>
> Wenn du willst, kannst du beim **GratisStatt-Netzwerk** mitmachen. Projekte, die du über die Live-Suche findest, landen dann nach einer Prüfung beim nächsten Update bei allen Nutzern.
>
> **Gespeichert wird:** dein GitHub-Benutzername, die App-Version, an welchem Tag du die App zuletzt benutzt hast und wie viele Projekte du beigetragen hast.
> **Nicht gespeichert wird:** E-Mail, IP-Adresse, Suchbegriffe, Dateien auf deinem Computer.
>
> Du kannst das jederzeit in den Einstellungen ändern und deine Daten löschen.
>
> [ Mitmachen – mit GitHub anmelden ]   [ Nein danke, nur lokal ]
> Datenschutzerklärung lesen

- Antwort in `meta.network_consent` (`yes` / `no`) mit Datum und `consent_version` speichern.
- Wird der Text später wesentlich geändert (`consent_version` erhöhen), wird **nur wer mitmacht** erneut gefragt.

### Anmeldung mit GitHub (Device Flow)
- GitHub OAuth App mit aktiviertem Device Flow, **ohne Scopes** (nur öffentliche Infos).
- Ablauf in der App: Code anzeigen, Button "GitHub öffnen" (`https://github.com/login/device`), im Hintergrund warten, bis bestätigt. Abbrechen jederzeit möglich, dann gilt "Nein".
- Danach `POST /v1/register` mit dem GitHub-Token. Der Server prüft ihn einmal über `GET https://api.github.com/user`, speichert GitHub-ID und Username und gibt ein **eigenes Session-Token** zurück. Den GitHub-Token speichert der Server **nicht**.
- Der GitHub-Token bleibt lokal (safeStorage) und wird für Suchen bei GitHub benutzt (30 statt 10 Suchen pro Minute).

### Einstellungen → "Netzwerk"
- Status: "Nicht dabei" oder "Dabei als @username seit 12.10.2026 · 37 Beiträge"
- Schalter **Mitmachen an/aus**:
  - **Einschalten:** zeigt denselben Erklärtext wie beim ersten Start, dann die Anmeldung.
  - **Ausschalten:** Dialog "Netzwerk verlassen? Deine Daten auf dem Server werden gelöscht." mit [Verlassen und Daten löschen] [Abbrechen]. Ruft `DELETE /v1/me` auf, löscht Session-Token und GitHub-Token lokal, leert `pending_submissions`.
- Button **"Meine gespeicherten Daten anzeigen"** (`GET /v1/me`): zeigt genau, was der Server über mich weiss.
- Link zur Datenschutzerklärung.

### Server (`server/`, Cloudflare Worker + D1)

```sql
CREATE TABLE users (
  github_id        INTEGER PRIMARY KEY,
  login            TEXT NOT NULL,
  app_version      TEXT,
  joined_day       TEXT NOT NULL,      -- nur Datum, keine Uhrzeit
  last_active_day  TEXT NOT NULL,      -- nur Datum
  submissions      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'blocked'
  session_hash     TEXT NOT NULL       -- SHA-256 des Session-Tokens
);

CREATE TABLE submissions (
  repo_id       INTEGER NOT NULL,
  github_id     INTEGER NOT NULL,
  submitted_day TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  reason        TEXT,
  PRIMARY KEY (repo_id, github_id)
);
```

Endpunkte (alle unter `/v1`, JSON, Session-Token im `Authorization`-Header):
- `POST /register`: siehe Anmeldung
- `POST /heartbeat` `{ appVersion }`: höchstens 1× pro Tag aus der App, setzt `last_active_day`
- `POST /submissions` `{ repoIds: number[] }`: max. 50 pro Anfrage, max. 200 pro Tag und Nutzer, nur Zahlen
- `GET /me`: alle gespeicherten Daten dieses Nutzers
- `DELETE /me`: löscht Nutzer und seine offenen Beiträge
- `GET /admin/submissions`, `POST /admin/submissions/result`: nur mit Admin-Secret (für die GitHub Action)

Regeln:
- **Keine IP-Adressen speichern**, keine Request-Logs in D1, Worker-Logs nicht dauerhaft aktivieren.
- Keine Suchbegriffe, keine Geräte-IDs.
- Täglicher Cron im Worker: Nutzer ohne Aktivität seit **12 Monaten automatisch löschen**.
- Blockierte Nutzer: Beiträge werden ignoriert.

### Admin-Dashboard (`/admin`)
- Login über GitHub (OAuth Web Flow). Zugang **nur** für die GitHub-ID in `ADMIN_GITHUB_ID` (Wrangler Secret).
- Zeigt:
  - Aktive Nutzer der letzten 7 und 30 Tage, Gesamtzahl
  - Tabelle: Username, App-Version, beigetreten, zuletzt aktiv, Beiträge, Status, sortier- und durchsuchbar
  - Beiträge: offen / angenommen / abgelehnt, die letzten 100 mit Repo-Link
  - Verlauf: neue Projekte pro Woche (aus den Release-Manifests)
- Aktionen: Nutzer blockieren/entsperren, Nutzer löschen.
- Einfach und schlicht. Muss am Handy lesbar sein.

### Datenschutzerklärung
- `docs/PRIVACY.md` und dieselbe Version in der App unter Einstellungen → Netzwerk.
- Inhalt: wer verantwortlich ist (Platzhalter für Name und Kontakt), welche Daten, wofür, wo gespeichert (Cloudflare), wie lange (bis Austritt oder 12 Monate Inaktivität), wie man sie einsieht und löscht. Was ohne Netzwerk passiert (nur GitHub).

## Kuratierte Liste

- `data/alternatives.json`, wird in die App eingebaut:

```ts
type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'web' | 'server';
type Level = 'einfach' | 'mittel' | 'profi';
// einfach = normale App mit Installer
// mittel  = braucht etwas Einrichtung (z.B. Docker auf NAS, Browser-Erweiterung)
// profi   = Kommandozeile oder eigener Server

interface Alternative {
  repo: string;          // "owner/name" auf GitHub
  summary: string;       // Deutsch, max. 120 Zeichen, einfache Sprache
  platforms: Platform[];
  level: Level;
  website?: string;      // offizielle Download-Seite, falls besser als GitHub
  note?: string;         // Hinweis, z.B. "nur eigene Musikdateien"
}

interface PaidProduct {
  id: string;            // slug, z.B. "adobe-photoshop"
  name: string;          // "Adobe Photoshop"
  aliases: string[];     // ["photoshop", "ps", "bildbearbeitung"]
  category: string;      // eine der Kategorien unten
  note?: string;
  alternatives: Alternative[];
}
```

- `scripts/validate-data.ts` prüft: keine doppelten IDs, nur gültige Werte, `summary` max. 120 Zeichen, **jedes Repo existiert in `base.db`**. Fehlende Repos meldet es mit Namen. Mit `--fix` holt es fehlende Repos von GitHub nach und speichert sie in `base.db`.

## Kategorien und Plattformen aus Topics

- `data/topic-map.json`: welche GitHub-Topics zu welcher Kategorie gehören (z.B. "pdf", "office", "spreadsheet" → Büro & PDF; "gis", "cad", "3d" → CAD, 3D & GIS) und zu welcher Plattform ("windows", "macos", "linux", "android", "ios", "self-hosted", "docker" → server).
- Ohne passende Topics erscheint ein Projekt in keiner Kategorie, ist aber über die Suche findbar.

## Bildschirme und Funktionen

### Startseite
- Grosses Suchfeld: "Wofür zahlst du gerade?" (Fokus beim Start, Ctrl+K springt hinein)
- Autovervollständigung für kuratierte Produkte (Fuse.js), mit Pfeiltasten und Enter bedienbar. Enter ohne Auswahl → Volltextsuche.
- Beliebte Chips (Photoshop, Microsoft 365, Notion, Dropbox, 1Password, Adobe Acrobat)
- Kategorien als Kacheln
- Bereich "Neu entdeckt": die neuesten Projekte aus dem letzten Update

### Suchergebnisse `#/suche?q=...`
- **Oben:** passt der Begriff zu einem kuratierten Produkt, ein Block "Gratis statt Adobe Photoshop" mit den kuratierten Karten.
- **Darunter:** "Weitere Projekte" aus der Volltextsuche. Ranking: FTS5 `bm25`, kombiniert mit einem Bonus für Sterne (logarithmisch) und Abzug für archiviert.
- Jedes Ergebnis zeigt: Name, Besitzer, Beschreibung, Sterne (z.B. "12.3k"), Ampel "aktualisiert vor X Monaten" (grün < 6 Monate, gelb < 18 Monate, rot älter oder archiviert), Lizenz, Sprache, bis zu 5 Topics, Badge "Neu", wenn `first_seen_at` in den letzten 7 Tagen liegt.
- Klick oder Button **"Auf GitHub öffnen"** → `html_url` im Standard-Browser.
- Filter: Kategorie, Plattform, Mindest-Sterne, aktualisiert innerhalb (6 Mt. / 1 J. / 2 J. / egal), nur mit Lizenz, "Nur aktiv gepflegt"
- Sortierung: Relevanz, Sterne, zuletzt aktualisiert, neu entdeckt
- Filter und Sortierung stehen in der URL
- Suche muss bei 100'000+ Projekten **unter 100 ms** bleiben (Indizes, LIMIT, Paging)

### Kuratierte Ergebnisseite `#/statt/<id>`
- Titel: "Gratis statt Adobe Photoshop"
- Eine Karte pro Alternative: Name, deutsche `summary`, Daten aus der DB (Sterne, Ampel, Lizenz), Plattform-Icons, Schwierigkeits-Badge, `note` gut sichtbar
- Buttons: **"Auf GitHub öffnen"** und, falls `website` vorhanden, **"Zur offiziellen Website"**
- Darunter: "Ähnliche Projekte" aus der Volltextsuche

### Kategorieseite `#/kategorie/<name>`
Kuratierte Produkte der Kategorie, darunter die Top-Projekte der Kategorie nach Sternen (mit denselben Filtern).

### Einstellungen
- **Netzwerk** (siehe oben)
- **GitHub-Token** (nur sichtbar, wenn das Netzwerk aus ist; optional, macht das manuelle Update etwa 3× schneller)
- **Automatisches Update:** an/aus
- Status: letztes Update, angewendete Pakete, Anzahl Projekte, Datenbank-Grösse
- Buttons: "Jetzt aktualisieren", "Datenbank optimieren" (`VACUUM`)
- Hell, dunkel oder wie das System
- Nur im Dev-Modus: "Letzte Update-Prüfung um 8 Tage zurücksetzen" und "Ersten-Start-Dialog erneut zeigen" (zum Testen)

### Über
Version, Basis-Version, Datenstand, Haftungshinweis, Link "Alternative vorschlagen" (öffnet ein neues GitHub Issue im Projekt-Repo, im Browser).

## Build und Deploy

- `npm run dev`: App im Entwicklungsmodus
- `npm run build-base-db`: erstellt `resources/base.db` (ca. 1 Stunde, nur ab und zu nötig)
- `npm run validate`: prüft die kuratierte Liste gegen `base.db`
- `npm run dist`: prüft, dass `resources/base.db` existiert, führt `validate` aus und baut mit electron-builder. `base.db` wird als `extraResources` mitgeliefert. Ergebnis im Ordner `release/`: Installer-.exe und portable .exe.
- `npm run server:dev` / `npm run server:deploy`: Worker lokal bzw. auf Cloudflare
- Konfiguration in `src/main/config.ts`: Server-URL, OAuth Client-ID, Name des Daten-Repos. Keine Secrets in der App.
- App-Name "GratisStatt", eigenes einfaches Icon (selbst gezeichnet als SVG, in .ico umgewandelt)
- Fenster: min. 900×600, merkt sich Grösse und Position
- Grössenordnung: 100'000 Projekte ≈ 50–80 MB Datenbank inkl. Volltextindex, ein Wochenpaket wenige MB

## Kategorien

Büro & PDF · Kreativ & Design · Notizen & Organisation · Speicher & Medien · Sicherheit & Netzwerk · Kommunikation · KI & Entwicklung · Business & Finanzen · Lernen & Fitness · Gaming & PC-Tools · CAD, 3D & GIS

## Startliste

Format: **Bezahlt** → `repo` (Plattformen · Level). W = Windows, M = Mac, L = Linux, A = Android, i = iOS, Web, Server = selbst hosten.
Die Repo-Namen werden von `validate` gegen `base.db` geprüft. Fehlende oder umbenannte Repos korrigieren.

### Büro & PDF
- **Microsoft 365 / Office** → `LibreOffice/core` (W M L · einfach, website: libreoffice.org, Repo ist ein Spiegel), `ONLYOFFICE/DesktopEditors` (W M L · einfach)
- **Adobe Acrobat** → `Stirling-Tools/Stirling-PDF` (Web Server · mittel), `pdfarranger/pdfarranger` (W L · einfach), `sumatrapdfreader/sumatrapdf` (W · einfach)
- **DocuSign** → `docusealco/docuseal` (Server · mittel), `documenso/documenso` (Server · mittel)
- **Microsoft Visio / Lucidchart** → `jgraph/drawio-desktop` (W M L · einfach), `excalidraw/excalidraw` (Web · einfach)
- **Grammarly** → `languagetool-org/languagetool` (Server · mittel, note: Browser-Erweiterung gratis nutzbar)
- **DeepL Pro** → `LibreTranslate/LibreTranslate` (Server · mittel)

### Kreativ & Design
- **Adobe Photoshop** → `GNOME/gimp` (W M L · einfach, website: gimp.org), `KDE/krita` (W M L · einfach), `PintaProject/Pinta` (W M L · einfach)
- **Adobe Lightroom** → `darktable-org/darktable` (W M L · einfach), `Beep6581/RawTherapee` (W M L · einfach)
- **Adobe Illustrator** → `inkscape/inkscape` (W M L · einfach, website: inkscape.org)
- **Adobe Premiere Pro / Final Cut** → `KDE/kdenlive` (W M L · einfach), `mltframework/shotcut` (W M L · einfach), `OpenShot/openshot-qt` (W M L · einfach)
- **Adobe After Effects** → `NatronGitHub/Natron` (W M L · profi)
- **Adobe Audition** → `audacity/audacity` (W M L · einfach)
- **FL Studio / Ableton** → `LMMS/lmms` (W M L · einfach)
- **Figma / Canva Pro** → `penpot/penpot` (Web Server · einfach)
- **Midjourney** → `lllyasviel/Fooocus` (W L · mittel), `comfyanonymous/ComfyUI` (W M L · profi, note: braucht eine starke Grafikkarte)
- **Camtasia / Snagit** → `ShareX/ShareX` (W · einfach), `flameshot-org/flameshot` (W M L · einfach), `obsproject/obs-studio` (W M L · einfach)
- **Loom** → `CapSoftware/Cap` (W M · einfach)

### Notizen & Organisation
- **Notion** → `AppFlowy-IO/AppFlowy` (W M L A i · einfach), `toeverything/AFFiNE` (W M L Web · einfach), `anyproto/anytype-ts` (W M L · einfach)
- **Evernote** → `laurent22/joplin` (W M L A i · einfach)
- **Todoist** → `johannesjo/super-productivity` (W M L A · einfach), `go-vikunja/vikunja` (Server · mittel)
- **Trello** → `plankanban/planka` (Server · mittel), `wekan/wekan` (Server · mittel)
- **Jira / Asana** → `makeplane/plane` (Server · mittel), `opf/openproject` (Server · mittel)
- **Airtable** → `nocodb/nocodb` (Server · mittel), `teableio/teable` (Server · mittel)
- **Calendly** → `calcom/cal.com` (Server · profi)
- **Typeform / SurveyMonkey** → `formbricks/formbricks` (Server · mittel)
- **Zapier** → `n8n-io/n8n` (Server · mittel), `activepieces/activepieces` (Server · mittel)
- **Pocket / Readwise** → `wallabag/wallabag` (Server · mittel)
- **Feedly Pro** → `FreshRSS/FreshRSS` (Server · mittel)

### Speicher & Medien
- **Dropbox / Google One / iCloud+** → `nextcloud/server` (Server · mittel), `syncthing/syncthing` (W M L A · mittel)
- **Google Fotos / iCloud Fotos** → `immich-app/immich` (Server A i · mittel), `photoprism/photoprism` (Server · mittel)
- **Plex Pass** → `jellyfin/jellyfin` (Server · mittel, note: für eigene Filme und Serien, kein Netflix-Ersatz)
- **Spotify** → `navidrome/navidrome` (Server · mittel, note: nur für eigene Musikdateien)
- **Backblaze / Acronis** → `duplicati/duplicati` (W M L · einfach), `restic/restic` (W M L · profi)

### Sicherheit & Netzwerk
- **1Password / LastPass** → `bitwarden/clients` (W M L A i Web · einfach), `keepassxreboot/keepassxc` (W M L · einfach), `dani-garcia/vaultwarden` (Server · profi)
- **NordVPN / ExpressVPN** → `wg-easy/wg-easy` (Server · mittel), `juanfont/headscale` (Server · profi), note für das Produkt: "Ein eigenes VPN gibt dir sicheren Zugriff aufs Heimnetz, versteckt deine IP aber nicht wie NordVPN."
- **Norton / McAfee** → `Cisco-Talos/clamav` (W M L · profi), note für das Produkt: "Unter Windows reicht für die meisten der eingebaute Microsoft Defender."
- **TeamViewer / AnyDesk** → `rustdesk/rustdesk` (W M L A i · einfach)

### Kommunikation
- **Zoom** → `jitsi/jitsi-meet` (Web · einfach, website: meet.jit.si)
- **Slack / Microsoft Teams** → `mattermost/mattermost` (Server · mittel), `RocketChat/Rocket.Chat` (Server · mittel), `zulip/zulip` (Server · mittel)
- **Mailchimp** → `knadh/listmonk` (Server · mittel)
- **Hootsuite / Buffer** → `gitroomhq/postiz-app` (Server · mittel)
- **Linktree Pro** → `sethcottle/littlelink` (Web · mittel)

### KI & Entwicklung
- **ChatGPT Plus / Claude Pro** → `janhq/jan` (W M L · einfach), `ollama/ollama` (W M L · mittel), `open-webui/open-webui` (Server · mittel), note für das Produkt: "Lokale KI-Modelle sind schwächer und brauchen einen starken Computer."
- **GitHub Copilot** → `continuedev/continue` (W M L · mittel), `TabbyML/tabby` (Server · profi)
- **Otter.ai / Transkription** → `chidiwilliams/buzz` (W M L · einfach), `ggml-org/whisper.cpp` (W M L · profi)
- **Postman** → `usebruno/bruno` (W M L · einfach), `hoppscotch/hoppscotch` (Web · einfach)
- **Vercel / Heroku** → `coollabsio/coolify` (Server · profi)

### Business & Finanzen
- **Bexio / Rechnungsprogramme** → `invoiceninja/invoiceninja` (Server · mittel), `akaunting/akaunting` (Server · mittel)
- **Banana / QuickBooks** → `Gnucash/gnucash` (W M L · einfach)
- **YNAB** → `actualbudget/actual` (Web Server · mittel), `firefly-iii/firefly-iii` (Server · mittel)
- **HubSpot / Salesforce** → `twentyhq/twenty` (Server · mittel), `espocrm/espocrm` (Server · mittel)
- **Shopify** → `woocommerce/woocommerce` (Server · mittel), `PrestaShop/PrestaShop` (Server · mittel)
- **Wix / Squarespace** → `WordPress/WordPress` (Server · mittel, website: wordpress.org, Repo ist ein Spiegel), `TryGhost/Ghost` (Server · mittel)

### Lernen & Fitness
- **Quizlet Plus** → `ankitects/anki` (W M L · einfach)
- **Strava Premium** → `SamR1/FitTrackee` (Server · mittel)

### Gaming & PC-Tools
- **CCleaner** → `bleachbit/bleachbit` (W L · einfach)
- **WinRAR** → `M2Team/NanaZip` (W · einfach), `peazip/PeaZip` (W M L · einfach)
- **Bandicam / Fraps** → `obsproject/obs-studio` (W M L · einfach)
- **Advanced SystemCare / Game Booster** → `ChrisTitusTech/winutil` (W · profi, note: verändert Windows-Einstellungen, vorher Wiederherstellungspunkt setzen)
- **Parsec Warp** → `LizardByte/Sunshine` (W M L · mittel), `moonlight-stream/moonlight-qt` (W M L · einfach), note für das Produkt: "Sunshine auf dem Gaming-PC, Moonlight auf dem Gerät, auf dem du spielen willst."

### CAD, 3D & GIS
- **AutoCAD** → `LibreCAD/LibreCAD` (W M L · einfach), `FreeCAD/FreeCAD` (W M L · mittel)
- **SolidWorks / Fusion 360** → `FreeCAD/FreeCAD` (W M L · mittel)
- **3ds Max / Maya / Cinema 4D** → `blender/blender` (W M L · mittel, website: blender.org)
- **ArcGIS** → `qgis/QGIS` (W M L · mittel)
