# Einrichtung – was du selbst machen musst

Ein paar Dinge brauchen dein GitHub- bzw. Cloudflare-Konto. Claude darf sie nicht für dich anlegen.
Die App funktioniert auch ohne diese Schritte (Suche, Filter, Live-Suche). Was fehlt:

| Schritt | Ohne diesen Schritt … | Aufwand |
| --- | --- | --- |
| 1. Daten-Repo `moatly-data` | … gibt es keine wöchentlichen Updates der Datenbank | 2 Minuten |
| 2. OAuth App für die Anmeldung | … kann niemand beim Netzwerk mitmachen | 3 Minuten |
| 3. Server auf Cloudflare | … kann niemand beim Netzwerk mitmachen, kein Admin-Dashboard | 20 Minuten, freiwillig |

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
Das erste Mal dauert es etwa 1 Stunde, danach läuft es jeden Montag von selbst.

> Wichtig: Die Action holt den Code aus `main` des App-Repos. Der Pull Request mit der neuen Version muss also
> vorher gemergt sein.

## 2. OAuth App für die Anmeldung beim Netzwerk

1. Öffne **https://github.com/settings/applications/new**
2. Ausfüllen:
   - *Application name:* `Moatly`
   - *Homepage URL:* `https://github.com/tmluc-cool/githuub-appstore`
   - *Authorization callback URL:* `https://github.com/tmluc-cool/githuub-appstore` (wird für die App nicht gebraucht, das Feld ist aber Pflicht)
3. **Register application** klicken
4. Häkchen bei **Enable Device Flow** setzen und speichern
5. Die **Client ID** (beginnt meist mit `Ov23…`) an Claude schicken.
   Die Client ID ist öffentlich und kein Geheimnis. Ein **Client Secret** brauchst du für die App **nicht** – bitte nie weitergeben.

## 3. Server auf Cloudflare (freiwillig, nur fürs Netzwerk)

Dafür brauchst du einen Computer mit [Node.js 22](https://nodejs.org) und ein kostenloses Konto auf
**https://dash.cloudflare.com/sign-up**.

```bash
git clone https://github.com/tmluc-cool/githuub-appstore.git
cd githuub-appstore/server
npm install
npx wrangler login                     # öffnet den Browser, mit Cloudflare anmelden
npx wrangler d1 create moatly     # zeigt eine database_id an
```

Die angezeigte `database_id` in `server/wrangler.toml` eintragen (oder an Claude schicken). Dann die Geheimnisse setzen
(jeweils Wert eintippen, wenn gefragt):

```bash
npx wrangler secret put ADMIN_SECRET       # langer Zufallswert, z.B. von https://www.random.org/strings/
npx wrangler secret put SESSION_SECRET     # nochmals ein anderer langer Zufallswert
npx wrangler secret put ADMIN_GITHUB_ID    # deine GitHub-ID (Zahl), siehe https://api.github.com/users/tmluc-cool → "id"
```

Für das Admin-Dashboard eine **zweite** OAuth App anlegen (wie in Schritt 2, aber ohne Device Flow):
*Authorization callback URL* = `https://<dein-worker>.workers.dev/admin/callback`. Dann:

```bash
npx wrangler secret put ADMIN_OAUTH_CLIENT_ID
npx wrangler secret put ADMIN_OAUTH_CLIENT_SECRET
npm run deploy
```

Die angezeigte Worker-Adresse (`https://moatly.<name>.workers.dev`) an Claude schicken. Claude trägt sie zusammen
mit der Client ID aus Schritt 2 in der App ein. Im Repo `moatly-data` unter *Settings → Secrets and variables →
Actions* noch eintragen:

- Variable `SERVER_URL` = die Worker-Adresse
- Secret `ADMIN_SECRET` = derselbe Wert wie oben

Dashboard: `https://<dein-worker>.workers.dev/admin`

---

Moatly ist ein privates Spass-Projekt. Die Nutzung erfolgt auf eigene Gefahr – es wird keinerlei Haftung übernommen.
