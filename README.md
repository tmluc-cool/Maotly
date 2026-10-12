# GratisStatt

Desktop-App für Windows: Du gibst ein, **für welche Software du gerade zahlst** – und bekommst kostenlose
Open-Source-Alternativen von GitHub. Mit Ampel für die Pflege, Lizenz, Plattformen, Schwierigkeit und – wenn
vorhanden – direktem Download des Windows-Installers.

Alles läuft lokal. Kein Backend, keine Tracker. Die App spricht nur mit `api.github.com` und lädt Dateien von
GitHub. Offline funktioniert sie mit den mitgelieferten Daten.

## Schnellstart

```bash
npm install
npm run dev          # App im Entwicklungsmodus
npm test             # Tests (Suche, Filter, Cache, Installer-Auswahl, GitHub-Service, Daten)
npm run typecheck
```

## Windows-Programm bauen

1. Einen GitHub-Token erstellen (keine Berechtigungen nötig) und in eine Datei `.env` schreiben
   (siehe `.env.example`):
   ```
   GITHUB_TOKEN=github_pat_...
   ```
2. Auf **Windows** ausführen:
   ```bash
   npm run dist
   ```
   Das holt zuerst frische Daten (`fetch-stats`), prüft sie (`validate`) und baut dann mit electron-builder.
   Ergebnis im Ordner `release/`:
   - `GratisStatt-Setup-<version>.exe` (Installer)
   - `GratisStatt-<version>-portable.exe` (ohne Installation)

`npm run dist:offline` baut ohne neue Daten. Unter Linux/macOS braucht electron-builder für das Windows-Paket `wine`.

## Daten

| Datei | Inhalt |
| --- | --- |
| `data/alternatives.json` | Von Hand gepflegt: Kategorien, bezahlte Produkte und ihre Alternativen |
| `data/repo-stats.snapshot.json` | Erzeugt von `npm run fetch-stats`: Sterne, letzte Änderung, Lizenz, neuestes Release |

- `npm run fetch-stats` – max. 5 Anfragen gleichzeitig, 2 Wiederholungen. Meldet fehlende (404), umbenannte und
  archivierte Repos. Exit-Code 1, wenn ein Repo fehlt.
- `npm run validate` – prüft doppelte IDs, Plattformen, Levels, Kategorien, Länge der `summary` (max. 120), „ß“ und ob
  jedes Repo Stats hat.
- `npm run icon` – erzeugt `build/icon.png` und `build/icon.ico` aus `build/icon.svg`.

Der aktuell eingecheckte Snapshot ist ein **Seed** (nur Sterne, ohne Releases und Lizenzen). Die App ergänzt die
fehlenden Angaben live, sobald ein Produkt geöffnet wird. Vor einem Release `npm run fetch-stats` laufen lassen.

## Aufbau

```
src/main/        Main-Prozess: Fenster, IPC, GitHub-Service, Cache, Token (safeStorage), Downloads
src/preload/     Kleines, typisiertes API (window.api) über contextBridge
src/renderer/    React-Oberfläche (Hash-Routing, Tailwind)
src/shared/      Typen und reine Logik (Cache, Installer-Auswahl), auch von den Tests genutzt
scripts/         fetch-stats, validate-data, make-icon
tests/           Vitest
```

### Sicherheit

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strenge Content-Security-Policy
- Der Renderer hat keinen Netzwerk- und keinen Dateizugriff; alles läuft über IPC im Main-Prozess
- Downloads: Der Renderer nennt nur Repo + Dateiname, die URL kommt aus den eigenen Daten und muss auf GitHub zeigen.
  Dateien werden **nie automatisch ausgeführt**
- Externe Links nur `https://` und nur über `shell.openExternal`
- Der eigene GitHub-Token wird mit Electron `safeStorage` verschlüsselt und nie an den Renderer gegeben

---

Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern.
