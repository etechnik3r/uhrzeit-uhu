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
  - **Stufe 3:** alle 5‑Minuten‑Marken, volles Tagesbild (z. B. `12:05`, `23:55`)
- **Direktes Stellen der Zeiger (wie eine echte Uhr):**
  - einen Zeiger **antippen** → er wird **orange** (= ausgewählt),
  - dann am Zifferblatt auf die richtige Stelle **ziehen** (Finger/Maus).
  - der große (Minuten-)Zeiger rastet in **5‑Minuten‑Schritten** ein,
  - der kleine (Stunden-)Zeiger **gleitet fließend** zwischen die Stunden
    (bei „halb" steht er genau zwischen zwei Zahlen – wie in echt).
  - Keine +/- Knöpfe – das Kind stellt die Uhr selbst.
- **Wenig Text, viele Symbole** – auch für Kinder, die noch nicht lesen können
  (Zeit per 🔊 anhörbar, Punkte ⭐ / Rekord 🏆 als Symbole).
- **Kleiner SVG-Zug am Bahnhof**: fährt von rechts ein, hält, und fährt bei
  richtiger Zeit nach links los (Lok voran) – dann kommt der nächste Zug.
- **Einstellungs-Seite** über das Menü ⚙️ (oben rechts):
  - Schwierigkeit (Leicht / Mittel / Schwer) mit Symbolen und Erklärung,
  - Zeitformat **12 / 24 Stunden**,
  - **5 Ziffernblätter**: Schlicht / Zahlen / Minutenstriche / **Minuten-Zahlen
    (5, 10, 15 …)** / 24‑Stunden‑Ring,
  - **Zeiger-Stil**: Standard / Dünn / Dick / Pfeil (mit Spitze),
  - **Pokale zurücksetzen**.
- **🏆 Pokale**: ein Zähler, der bei jeder richtigen Abfahrt hochzählt
  (mit Erklär-Popup beim Antippen).
- **Klick auf den Uhu 🦉** zeigt Spielname und Studio.
- **Mechanische Zeiger-Logik**: Dreht man den Minutenzeiger über die 12,
  wandert der Stundenzeiger mit (er springt nicht zurück) – wie bei einer
  echten Uhr; drei volle Umdrehungen ergeben drei Stunden.
- **12-Stunden-Uhr ohne AM/PM:** Eine Zielzeit wie `18:00` wird einfach über die
  `6`-Uhr-Stellung eingestellt – die Zeiger-Stellung zählt (Vergleich auf
  12-Stunden-Basis), kein Vormittag/Nachmittag-Schalter nötig.
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
- **Schwierigkeit (Ziel-Raster je Stufe):** `LEVEL_CONFIG` in `game.js`.
- **Raster des Minutenzeigers:** Konstante `MINUTEN_RASTER` in `game.js` (Standard 5).
- **Tempo des Levelaufstiegs:** Konstante `AUFSTIEG_NACH` in `game.js`.
