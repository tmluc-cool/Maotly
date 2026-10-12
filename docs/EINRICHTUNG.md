# Einrichtung – was du selbst machen musst

Ein paar Dinge brauchen dein GitHub- bzw. Cloudflare-Konto. Claude darf sie nicht für dich anlegen.
Die App funktioniert auch ohne diese Schritte (Suche, Filter, Live-Suche). Was fehlt:

| Schritt | Ohne diesen Schritt … | Aufwand |
| --- | --- | --- |
| 1. Daten-Repo `moatly-data` | … gibt es keine wöchentlichen Updates der Datenbank | 2 Minuten |
| 2. «Mit GitHub anmelden» einschalten (OAuth App + ein Knopf) | … kann sich niemand mit GitHub anmelden | 5 Minuten, im Browser |
| 3. Netzwerk einschalten (Cloudflare + derselbe Knopf) | … kann niemand beim Netzwerk mitmachen und bewerten | 10 Minuten, im Browser |

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

## 2. «Mit GitHub anmelden» einschalten

Damit erscheint in der App oben rechts **Anmelden**. Wer sich anmeldet, sucht schneller bei GitHub.
Dafür braucht es keinen Server.

### A. GitHub-Anmeldung für die App (OAuth App)

1. Öffne **https://github.com/settings/applications/new**
2. Ausfüllen:
   - *Application name:* `Moatly`
   - *Homepage URL:* `https://github.com/tmluc-cool/githuub-appstore`
   - *Authorization callback URL:* `https://github.com/tmluc-cool/githuub-appstore` (wird für die App nicht gebraucht, das Feld ist aber Pflicht)
3. **Register application** klicken
4. Häkchen bei **Enable Device Flow** setzen und speichern
5. Die **Client ID** kopieren (beginnt meist mit `Ov23…`). Sie ist öffentlich und kein Geheimnis.
   Ein **Client Secret** brauchst du dafür **nicht** – bitte nie weitergeben.

### B. Knopf drücken

1. Im App-Repo: **Actions** → links **Set up sign-in and server** → rechts **Run workflow**
2. Die Client ID aus A ins Feld einfügen → **Run workflow**
3. Nach etwa einer Minute ist der Lauf grün.

Die Action trägt die Client ID selbst in die App ein und startet einen neuen Windows-Build.
Sobald das neue Release da ist: herunterladen, installieren, oben rechts **Anmelden**.

## 3. Netzwerk einschalten («Mitmachen»)

Dafür braucht es zusätzlich einen kleinen Server auf Cloudflare (gratis). Auch das geht ganz im Browser.

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

### D. Knopf nochmals drücken

**Actions** → **Set up sign-in and server** → **Run workflow** (die Client ID ist schon eingetragen, das Feld darf leer bleiben).
Nach 2–3 Minuten ist der Lauf grün, in der Zusammenfassung steht die Adresse des Servers. Die Action
trägt sie in die App ein und startet einen neuen Windows-Build. Danach: **Einstellungen → Netzwerk → Mitmachen**.

Wenn sich später am Server-Code etwas ändert, aktualisiert die Action den Server automatisch.

### Freiwillig: Admin-Dashboard

Für das Dashboard (`https://moatly.<deine-adresse>.workers.dev/admin`) eine **zweite** OAuth App anlegen
(wie in 2A, aber ohne Device Flow) mit *Authorization callback URL* = `https://moatly.<deine-adresse>.workers.dev/admin/callback`.
Dann im App-Repo zwei weitere Secrets eintragen: `ADMIN_OAUTH_CLIENT_ID` und `ADMIN_OAUTH_CLIENT_SECRET`
(hier ist das Client Secret nötig, es bleibt als Secret geschützt) und **Set up sign-in and server** nochmals starten.
Zugang hat nur dein GitHub-Konto.

### Später: Netzwerk-Funde und Bewertungen in den Wochenpaketen

Sobald es das Repo `moatly-data` gibt:

1. Einen langen Zufallswert erzeugen, z.B. auf https://www.random.org/strings/
2. Ihn als Secret `ADMIN_SECRET` eintragen – im App-Repo **und** im Repo `moatly-data`
3. Im Repo `moatly-data` unter *Settings → Secrets and variables → Actions → Variables* die Variable
   `SERVER_URL` = Adresse des Servers anlegen
4. **Set up sign-in and server** nochmals starten

---

Moatly ist ein privates Spass-Projekt. Die Nutzung erfolgt auf eigene Gefahr – es wird keinerlei Haftung übernommen.
