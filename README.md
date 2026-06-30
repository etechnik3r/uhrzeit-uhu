# 🦉 Uhrzeit-Uhu: Der Zeitreisen-Express

Ein kindgerechtes, pädagogisches Browserspiel, das Kindern im Grundschulalter
das Lesen und Einstellen der **analogen und digitalen Uhrzeit** beibringt.

Ein Uhu steuert einen Zeitreise-Zug. Um in die nächste Epoche zu reisen, muss
die große analoge Bahnhofsuhr exakt auf die im Fahrplan vorgegebene
Abfahrtszeit eingestellt werden.

## ✨ Eigenschaften

- **Reines Vanilla JavaScript (ES6+)** – keine Frameworks, keine externen
  Bibliotheken, keine externen Bilddateien (Uhr als inline-SVG, Figuren als Emoji).
- **Drei Schwierigkeitsstufen** (automatisch steigend oder frei wählbar):
  - **Stufe 1:** volle und halbe Stunden (z. B. `08:00`, `14:30`)
  - **Stufe 2:** Viertelstunden (z. B. `15:15`, `09:45`)
  - **Stufe 3:** minutengenaue Zeiten im 24-Stunden-Format (z. B. `12:07`, `23:55`)
- **Touch-optimierte Steuerung – Stunde und Minute getrennt** (wie ein
  mobiler Uhrzeit-Picker):
  - getrennte große `− / +`-Steller für **Stunde** und **Minute**
    (Minuten-Schritt je Stufe: 30 / 15 / 1 Minute)
  - **Drag & Drop** der Zeiger per Finger/Maus: es bewegt sich immer nur der
    *aktive* Zeiger und rastet magnetisch ein – so kann nichts „wegfliegen".
- **Fließender Stundenzeiger** – bewegt sich wie bei einer echten Uhr mit den
  Minuten mit.
- **Mobil-/Hochkant-optimiert:** erkennt Touch-Geräte, große Tap-Targets,
  Layout passt sich an Handy (hochkant), Tablet und Desktop an.
- **Freundliches Feedback:** grüne Erfolgs-Animation + abfahrender Zug bei
  richtiger Eingabe, sanftes Schütteln + ermutigender Hinweis bei Fehlern.
  **Kein Game Over** – unendlich viele Versuche.
- **Browser-native Extras** (ohne externe Abhängigkeiten):
  - 🔊 **Sprachausgabe** der Zielzeit (Web Speech API) – ideal für Leseanfänger
  - 🔉 **Soundeffekte** (Web Audio API) – programmatisch erzeugt
  - 💾 **Speichern** von Punkten, Level und Rekord (localStorage)
## 🚀 Starten

Keine Installation, kein Build nötig. Einfach die Datei **`index.html`** in
einem modernen Browser öffnen (Doppelklick genügt).

Optional über einen lokalen Webserver (empfohlen, damit Sprachausgabe/Audio
zuverlässig funktionieren):

```bash
# Python 3
python3 -m http.server 8000
# danach im Browser öffnen:  http://localhost:8000
```

## 📁 Dateistruktur

| Datei         | Inhalt                                                          |
|---------------|----------------------------------------------------------------|
| `index.html`  | Struktur/Markup (Top-Bar, Fahrplan, SVG-Uhr, Steuerung)        |
| `style.css`   | Aussehen, Layout, Animationen, responsives Verhalten           |
| `game.js`     | Gesamte Spiellogik (State, Uhr-Mathematik, Drag & Drop, APIs)  |
| `README.md`   | Diese Beschreibung                                             |

## 🧮 Wie die Uhr rechnet (kurz erklärt)

Die Basis ist die eingestellte Zeit in **Minuten seit Mitternacht** (`0`–`1439`).
Daraus werden die Zeiger-Winkel berechnet:

- **Minutenzeiger:** `(Minuten % 60) × 6°` (volle Drehung = 360° in 60 Minuten)
- **Stundenzeiger:** `(Minuten % 720) × 0,5°` (volle Drehung = 360° in 720 Minuten)

Der Faktor `0,5` sorgt dafür, dass der Stundenzeiger sich **fließend** mitbewegt
(z. B. steht er um `08:30` genau zwischen 8 und 9). Alle Berechnungen und die
State-Verwaltung sind im Quellcode ausführlich auf Deutsch kommentiert.

## 🎯 Anpassen

Häufige Anpassungen sind im Code zentral möglich:

- **Farben:** CSS-Variablen ganz oben in `style.css` (`:root { ... }`).
- **Schwierigkeit/Schrittweiten:** `LEVEL_CONFIG` in `game.js`.
- **Tempo des Levelaufstiegs:** Konstante `AUFSTIEG_NACH` in `game.js`.
