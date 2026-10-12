# GratisStatt – Projektbeschreibung für Claude Code

> Arbeitstitel "GratisStatt" (kann später geändert werden).
> Diese Datei beschreibt das ganze Projekt. Halte dich bei allen Aufgaben daran.

## Idee

Eine **Desktop-App für Windows (.exe)**. Man gibt ein, **für welche Software man gerade zahlt** (z.B. "Photoshop", "Notion", "Dropbox"), und bekommt sofort **kostenlose Open-Source-Alternativen von GitHub**. Dazu sieht man, ob sie gepflegt werden, ob sie unter Windows laufen und wie schwierig die Installation ist. Wenn möglich, kann man den Windows-Installer direkt aus der App herunterladen.

Zielgruppe: normale Leute, keine Entwickler. Alles muss in einfacher Sprache erklärt sein.

## Regeln

- UI-Sprache: Deutsch, Schweizer Schreibweise (immer "ss", nie "ß"). Code, Variablen und Commit-Messages auf Englisch.
- **Alles lokal:** kein eigenes Backend, keine Website, keine Tracker. Die App spricht nur direkt mit der GitHub API (`api.github.com`) und lädt Dateien von GitHub herunter.
- Funktioniert auch **offline** mit den mitgelieferten Daten.
- Keine Logos der bezahlten Produkte (Markenrecht). Nur Textnamen.
- Im "Über"-Bereich: "Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern."
- Nach jeder abgeschlossenen Phase: kurz zusammenfassen, was gemacht wurde und wie ich es testen kann.

## Tech-Stack

- **Electron** mit **electron-vite** (React + TypeScript), Tailwind CSS
- **electron-builder** für die .exe: NSIS-Installer **und** portable .exe, Windows x64
- Fuse.js für die Suche (tolerant bei Tippfehlern)
- Hash-Routing (z.B. `#/statt/adobe-photoshop`)
- Vitest für Tests der Such-, Filter- und Cache-Logik

### Sicherheit (wichtig)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Der Renderer hat keinen Netzwerk- und keinen Dateizugriff. Alle GitHub-Anfragen und Downloads laufen im **Main-Prozess** und werden über ein kleines, typisiertes IPC-API im Preload freigegeben.
- Externe Links nur über `shell.openExternal` und nur für `https://`-URLs.
- Strenge Content-Security-Policy im Renderer.
- Heruntergeladene Dateien werden **nie automatisch ausgeführt**.

## Daten

### 1. `data/alternatives.json` (von Hand gepflegt, wird in die App eingebaut)

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

### 2. `data/repo-stats.snapshot.json` (beim Bauen erzeugt, wird mitgeliefert)

Pro Repo: `stars`, `pushedAt`, `license`, `description`, `homepage`, `archived`, `topics`, `latestRelease` (`tag`, `date`, Liste der Assets mit Name, Grösse, Download-URL). Dazu `generatedAt`.

Erzeugt von `scripts/fetch-stats.mjs`:
- Token aus `GITHUB_TOKEN` in `.env` (steht in `.gitignore`)
- Höchstens 5 Anfragen gleichzeitig, bei Fehlern 2× erneut versuchen
- Gibt am Ende klar aus: fehlende Repos (404), umbenannte Repos (Redirect), archivierte Repos
- Exit-Code 1, wenn ein Repo fehlt

`scripts/validate-data.mjs` prüft: keine doppelten IDs, nur gültige Plattformen/Levels/Kategorien, jedes Repo hat Stats, `summary` max. 120 Zeichen.

### 3. Live-Daten zur Laufzeit (GitHubService im Main-Prozess)

- Beim Start werden der Snapshot und der lokale Cache geladen. Die App ist sofort benutzbar.
- Wird ein Produkt geöffnet, werden **nur dessen Repos** live von GitHub aktualisiert, falls der Cache älter als 24 Stunden ist.
- Cache als JSON im `app.getPath('userData')`-Ordner.
- Ohne Token erlaubt GitHub nur **60 Anfragen pro Stunde**. Die Header `x-ratelimit-remaining` und `x-ratelimit-reset` auswerten. Ist das Limit erreicht, still auf Cache/Snapshot zurückfallen und dezent anzeigen: "GitHub-Limit erreicht, Daten vom <Datum>".
- **Optionaler eigener GitHub-Token** in den Einstellungen (5000 Anfragen pro Stunde). Gespeichert mit Electron `safeStorage`, nie im Klartext und nie im Renderer.
- Offline: Hinweis "Offline – Daten vom <Datum>".

## Bildschirme und Funktionen

### Startseite
- Grosses Suchfeld: "Wofür zahlst du gerade?" (Fokus beim Start, Ctrl+K springt hinein)
- Autovervollständigung über `name` + `aliases` (Fuse.js), mit Pfeiltasten und Enter bedienbar
- Darunter: beliebte Chips (Photoshop, Microsoft 365, Notion, Dropbox, 1Password, Adobe Acrobat)
- Kategorien als Kacheln

### Ergebnisseite `#/statt/<id>`
- Titel: "Gratis statt Adobe Photoshop"
- Eine Karte pro Alternative mit:
  - Name (aus dem Repo-Namen, schön formatiert) und `summary`
  - Sterne (formatiert, z.B. "12.3k")
  - "Zuletzt aktualisiert vor X Monaten" mit Ampel: grün < 6 Monate, gelb < 18 Monate, rot älter oder archiviert
  - Lizenz, Plattform-Icons, Schwierigkeits-Badge
  - `note` gut sichtbar, falls vorhanden
  - Buttons:
    - **"Windows-Installer herunterladen"**, wenn das neueste Release ein passendes Asset hat (`.exe` oder `.msi`, bevorzugt x64, keine Quellcode-Archive). Download im Main-Prozess in den Downloads-Ordner, mit Fortschrittsbalken. Danach "Im Ordner anzeigen" (`shell.showItemInFolder`).
    - Sonst **"Zur Download-Seite"** (website → homepage → Releases-Seite) im Standard-Browser
    - **"Auf GitHub ansehen"**
- Filter: Plattform (Mehrfachauswahl, standardmässig das eigene Betriebssystem vorausgewählt), Schwierigkeit, Schalter "Nur aktiv gepflegt"
- Sortierung: Sterne oder zuletzt aktualisiert

### Kategorieseite `#/kategorie/<name>`
Alle bezahlten Produkte der Kategorie als Liste.

### Kein Treffer → Live-Suche auf GitHub
- Button "Live auf GitHub suchen"
- GitHub Search API (aus dem Main-Prozess): Suchbegriff + "alternative" in Name, Beschreibung und README, sortiert nach Sternen, max. 10 Treffer
- Ergebnisse deutlich markieren: "Nicht von uns geprüft"
- Rate-Limit (ohne Token 10 Suchen pro Minute) freundlich erklären

### Einstellungen
- GitHub-Token eintragen oder entfernen, mit Link zur Anleitung, wie man einen erstellt
- Anzeige: verbleibende GitHub-Anfragen, Datenstand
- Buttons: "Cache leeren", "Alle Daten jetzt aktualisieren" (nur mit Token oder mit Warnung wegen Limit)
- Hell, dunkel oder wie das System

### Über
Version, Datenstand, Haftungshinweis, Link "Alternative vorschlagen" (öffnet ein neues GitHub Issue im Projekt-Repo, im Browser).

## Build

- `npm run dev`: App im Entwicklungsmodus
- `npm run dist`: erst `fetch-stats` und `validate`, dann electron-builder. Ergebnis im Ordner `release/`: Installer-.exe und portable .exe
- App-Name "GratisStatt", eigenes einfaches Icon (selbst gezeichnet als SVG, in .ico umgewandelt)
- Fenster: min. 900×600, merkt sich Grösse und Position

## Kategorien

Büro & PDF · Kreativ & Design · Notizen & Organisation · Speicher & Medien · Sicherheit & Netzwerk · Kommunikation · KI & Entwicklung · Business & Finanzen · Lernen & Fitness · Gaming & PC-Tools · CAD, 3D & GIS

## Startliste

Format: **Bezahlt** → `repo` (Plattformen · Level). W = Windows, M = Mac, L = Linux, A = Android, i = iOS, Web, Server = selbst hosten.
Die Repo-Namen müssen vom Script geprüft werden. Fehlende oder umbenannte Repos korrigieren.

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
