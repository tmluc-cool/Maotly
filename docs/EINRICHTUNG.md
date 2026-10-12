# Einrichtung – was du selbst machen musst

Ein paar Dinge brauchen dein GitHub- bzw. Cloudflare-Konto. Claude darf sie nicht für dich anlegen.
Die App funktioniert auch ohne diese Schritte (Suche, Filter, Live-Suche). Was fehlt:

| Schritt | Ohne diesen Schritt … | Aufwand |
| --- | --- | --- |
| 1. Daten-Repo `moatly-data` | … gibt es keine wöchentlichen Updates der Datenbank | 2 Minuten |
| 2. Netzwerk einschalten (Cloudflare + OAuth App + ein Knopf) | … kann niemand beim Netzwerk mitmachen und bewerten | 15 Minuten, alles im Browser |

---

## 1. Daten-Repo für die wöchentlichen Updates

1. Öffne **https://github.com/new**
2. *Repository name:* `moatly-data`
3. **Public** auswählen (muss öffentlich sein, damit die App die Updates ohne Anmeldung laden kann)
4. Häkchen bei **Add a README file**
5. **Create repository** klicken
6. Claude Bescheid geben → Claude legt dort die Update-Action an.

Danach einmal von Hand starten: im Repo `moatly-data` → **Actions** → **Weekly update package** →
**Run workflow** → Häkchen bei «Also build a fresh base database» → **Run workflow**.
Das erste Mal dauert es etwa 2 Stunden, danach läuft es jeden Montag von selbst.

## 2. Netzwerk einschalten («Mitmachen»)

Alles passiert im Browser, du brauchst kein Terminal. Am Schluss drückst du einen Knopf auf GitHub,
der den Server einrichtet und die App damit verbindet.

### A. Cloudflare-Konto (gratis)

1. Konto erstellen auf **https://dash.cloudflare.com/sign-up** und die E-Mail bestätigen.
2. Links im Menü **Workers & Pages** öffnen. Beim ersten Mal fragt Cloudflare nach deiner Adresse
   (*workers.dev subdomain*), z.B. `tmluc`. Bestätigen. Der Server heisst später `https://moatly.tmluc.workers.dev`.
3. Die **Account ID** kopieren: Sie steht auf der Seite **Workers & Pages** rechts (*Account ID*).

### B. Cloudflare-Schlüssel (API-Token)

1. Öffne **https://dash.cloudflare.com/profile/api-tokens** → **Create Token**
2. Bei der Vorlage **Edit Cloudflare Workers** auf **Use template** klicken
3. Bei *Permissions* auf **+ Add more** klicken und diese Zeile wählen: **Account** · **D1** · **Edit**
4. Bei *Account Resources* dein Konto wählen, bei *Zone Resources* **All zones**
5. **Continue to summary** → **Create Token** → den Token kopieren (er wird nur einmal angezeigt)

### C. Beides bei GitHub eintragen

Im App-Repo auf GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

- Name `CLOUDFLARE_API_TOKEN`, Wert = der Token aus B
- Name `CLOUDFLARE_ACCOUNT_ID`, Wert = die Account ID aus A

Diese Werte bleiben geheim. Niemand sieht sie, auch nicht in den Protokollen der Action.

### D. GitHub-Anmeldung für die App (OAuth App)

1. Öffne **https://github.com/settings/applications/new**
2. Ausfüllen:
   - *Application name:* `Moatly`
   - *Homepage URL:* `https://github.com/tmluc-cool/githuub-appstore`
   - *Authorization callback URL:* `https://github.com/tmluc-cool/githuub-appstore` (wird für die App nicht gebraucht, das Feld ist aber Pflicht)
3. **Register application** klicken
4. Häkchen bei **Enable Device Flow** setzen und speichern
5. Die **Client ID** kopieren (beginnt meist mit `Ov23…`). Sie ist öffentlich und kein Geheimnis.
   Ein **Client Secret** brauchst du dafür **nicht** – bitte nie weitergeben.

### E. Knopf drücken

1. Im App-Repo: **Actions** → links **Deploy server** → rechts **Run workflow**
2. Die Client ID aus D ins Feld einfügen → **Run workflow**
3. Nach 2–3 Minuten ist der Lauf grün. In der Zusammenfassung steht die Adresse des Servers.

Die Action trägt Server-Adresse und Client ID selbst in die App ein und startet einen neuen Windows-Build.
Sobald das neue Release da ist: herunterladen, installieren, **Einstellungen → Netzwerk → Mitmachen**.

Wenn sich später am Server-Code etwas ändert, aktualisiert die Action den Server automatisch.

### Freiwillig: Admin-Dashboard

Für das Dashboard (`https://moatly.<deine-adresse>.workers.dev/admin`) eine **zweite** OAuth App anlegen
(wie in D, aber ohne Device Flow) mit *Authorization callback URL* = `https://moatly.<deine-adresse>.workers.dev/admin/callback`.
Dann im App-Repo zwei weitere Secrets eintragen: `ADMIN_OAUTH_CLIENT_ID` und `ADMIN_OAUTH_CLIENT_SECRET`
(hier ist das Client Secret nötig, es bleibt als Secret geschützt) und **Deploy server** nochmals starten.
Zugang hat nur dein GitHub-Konto.

### Später: Netzwerk-Funde und Bewertungen in den Wochenpaketen

Sobald es das Repo `moatly-data` gibt:

1. Einen langen Zufallswert erzeugen, z.B. auf https://www.random.org/strings/
2. Ihn als Secret `ADMIN_SECRET` eintragen – im App-Repo **und** im Repo `moatly-data`
3. Im Repo `moatly-data` unter *Settings → Secrets and variables → Actions → Variables* die Variable
   `SERVER_URL` = Adresse des Servers anlegen
4. **Deploy server** nochmals starten

---

Moatly ist ein privates Spass-Projekt. Die Nutzung erfolgt auf eigene Gefahr – es wird keinerlei Haftung übernommen.
