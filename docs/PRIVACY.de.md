# Datenschutzerklärung Moatly

Stand: 12.10.2026 (Version 2: Bewertungen)

## Wer ist verantwortlich?

Moatly ist ein **privates Spass-Projekt** von [@tmluc-cool](https://github.com/tmluc-cool) – kein Unternehmen und kein kommerzielles Angebot.
Kontakt: über die [Issues im Projekt-Repo](https://github.com/tmluc-cool/githuub-appstore/issues).

Die Nutzung erfolgt auf eigene Gefahr. Es wird keinerlei Haftung übernommen.

## Kurz gesagt

- Moatly funktioniert **ohne Anmeldung** und speichert alles **lokal auf deinem Computer**.
- Ohne Netzwerk spricht die App **nur mit GitHub**. Es gibt keine Werbung, keine Tracker, keine Analytics und keine Absturzberichte.
- Das **Moatly-Netzwerk ist freiwillig** und standardmässig aus. Erst wenn du «Mitmachen» wählst und dich mit GitHub anmeldest, sendet die App Daten an unseren Server.

## Was passiert ohne Netzwerk?

Die App lädt einmal pro Woche ein Update-Paket von GitHub (github.com, öffentliches Repository «moatly-data»). Bei der Live-Suche und beim manuellen Update spricht die App direkt mit GitHub. Projekte öffnet sie in deinem Browser. Dabei gelten die Datenschutzbestimmungen von GitHub. Wir erhalten davon nichts.

Auf deinem Computer speichert die App eine Datenbank mit öffentlichen Angaben zu GitHub-Projekten (Name, Beschreibung, Sterne usw.), deine Einstellungen und – falls du einen eingibst – deinen GitHub-Token verschlüsselt.

## Welche Daten speichern wir, wenn du beim Netzwerk mitmachst?

| Daten | Wofür |
| --- | --- |
| GitHub-ID und GitHub-Benutzername | um dich als Mitglied zu erkennen |
| App-Version | um zu sehen, welche Versionen noch benutzt werden |
| Tag des Beitritts und letzter aktiver Tag (nur Datum, keine Uhrzeit) | um inaktive Mitglieder automatisch zu löschen |
| Anzahl Beiträge und die IDs der vorgeschlagenen GitHub-Projekte | um die Vorschläge zu prüfen und ins nächste Update aufzunehmen |
| Deine Bewertungen (Sterne, Text, Datum) und Antworten als Projekt-Owner | damit andere sie lesen können – **öffentlich mit deinem GitHub-Benutzernamen** |
| Welche Bewertungen du hochgewählt hast | damit jede Person nur einmal wählen kann – veröffentlicht wird nur die Anzahl, nicht wer gewählt hat |

**Nicht gespeichert werden:** E-Mail-Adresse, IP-Adresse, Suchbegriffe, Geräte-IDs, Dateien auf deinem Computer. Deinen GitHub-Token prüfen wir bei der Anmeldung ein einziges Mal und speichern ihn nicht.

## Bewertungen

- Bewertungen schreiben, hochwählen und beantworten kann nur, wer beim Netzwerk mitmacht. **Lesen kann jeder.**
- Einmal pro Woche werden alle Bewertungen mit deinem GitHub-Benutzernamen in das öffentliche Update-Paket auf GitHub
  (Repository «moatly-data», neuestes Release) geschrieben. So bekommen alle Nutzer sie, ohne mit unserem Server
  zu sprechen. Ältere Kopien entfernen wir aus früheren Releases.
- Ob du der Owner eines Projekts bist, prüft der Server beim Antworten einmalig bei GitHub mit deinem GitHub-Token.
  Den Token speichert er nicht.
- Deine eigene Bewertung kannst du jederzeit ändern oder löschen. Gelöschte Bewertungen verschwinden mit dem nächsten
  wöchentlichen Update auch bei allen anderen.
- Wir können Bewertungen ausblenden oder löschen, z.B. bei Spam oder Beleidigungen.

## Wo werden die Daten gespeichert?

Bei Cloudflare (Cloudflare Workers und Cloudflare D1). Wir haben dauerhafte Protokolle (Logs) ausgeschaltet.

## Wie lange?

Bis du das Netzwerk verlässt – oder automatisch nach **12 Monaten ohne Aktivität**.

## Deine Rechte: einsehen und löschen

- **Einsehen:** Einstellungen → Netzwerk → «Meine gespeicherten Daten anzeigen» zeigt genau, was der Server über dich weiss.
- **Löschen:** Einstellungen → Netzwerk → Schalter «Mitmachen» ausschalten → «Verlassen und Daten löschen». Dein Konto, deine noch offenen Vorschläge, deine Bewertungen, Upvotes und Antworten werden sofort auf dem Server gelöscht und verschwinden mit dem nächsten wöchentlichen Update auch aus den Apps der anderen.
- Für alle anderen Fragen kannst du dich an die oben genannte Kontaktadresse wenden.

## Änderungen

Ändert sich diese Erklärung wesentlich, fragt die App alle Mitglieder des Netzwerks erneut um ihr Einverständnis.
