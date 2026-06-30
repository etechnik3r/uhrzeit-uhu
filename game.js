/* ===========================================================================
   Uhrzeit-Uhu: Der Zeitreisen-Express  –  Spiellogik (game.js)
   ---------------------------------------------------------------------------
   Reines Vanilla JavaScript (ES6+), keine externen Bibliotheken.

   BEDIENUNG
     - Einen Zeiger ANTIPPEN -> er wird ORANGE (= ausgewaehlt).
     - Den ausgewaehlten Zeiger am Zifferblatt ZIEHEN.
         * grosser Zeiger (Minute): rastet in 5-Minuten-Schritten ein
         * kleiner Zeiger (Stunde): gleitet fliessend zwischen die Stunden
     - Einstellungen ueber das Zahnrad ⚙️ (Schwierigkeit, 12/24h, Ziffernblatt).

   INHALT
     1. Konstanten & Konfiguration
     2. Spielzustand (State) inkl. Einstellungen
     3. HTML-Referenzen
     4. Hilfsfunktionen (Zeit-Mathematik)
     5. Zifferblatt (SVG) – je nach gewaehltem Blatt + 12/24h
     6. Rendering
     7. Aufgaben & Schwierigkeit
     8. Zeiger per Ziehen stellen
     9. Pruefung "Abfahrt!" + Feedback + Zug
    10. Zusatz-APIs: Sprachausgabe, Soundeffekte, Speichern
    11. Einstellungsmenue + Erklaer-Popover
    12. Geraete-Erkennung + Events + Start
   ===========================================================================*/

(function () {
  "use strict";


  /* 1. KONSTANTEN -------------------------------------------------------- */

  var MINUTEN_PRO_TAG = 1440;
  var MINUTEN_RASTER  = 5;            // grosser Zeiger rastet in 5er-Schritten
  var SPEICHER_SCHLUESSEL = "uhrzeit-uhu-state";

  // Ziel-Raster je Schwierigkeit (wie genau die Zielminute ist).
  var LEVEL_CONFIG = {
    1: { zielRaster: 30, name: "Leicht" },   // 0/30
    2: { zielRaster: 15, name: "Mittel" },   // 0/15/30/45
    3: { zielRaster: 5,  name: "Schwer" }    // alle 5 Minuten
  };


  /* 2. SPIELZUSTAND (State) ----------------------------------------------
     Einstellbare Optionen sind Teil des States und werden gespeichert:
       level      : 1..3   (Schwierigkeit)
       zeitformat : "12" | "24"   (werden Zeiten bis 12 oder bis 24 genannt)
       blatt      : "schlicht" | "zahlen" | "minuten" | "zwanzigvier"
   ---------------------------------------------------------------------- */
  var state = {
    aktuelleMinuten: 12 * 60,
    zielMinuten:     8 * 60,
    level:           1,
    pokale:          0,   // gesammelte Pokale (jede richtige Abfahrt = 1)
    aktiverZeiger:   "stunde",
    istAmZiehen:     false,
    letzteZiehMinute: 0,  // fuer die mechanische Mitnahme der Stunde beim Ziehen

    zeitformat: "24",
    blatt:      "zahlen",
    zeiger:     "standard"   // Zeiger-Stil: standard | duenn | dick | pfeil
  };


  /* 3. HTML-REFERENZEN ---------------------------------------------------- */
  var el = {
    pokale: document.getElementById("anzeige-pokale"),
    statPokale: document.getElementById("stat-pokale"),
    about: document.getElementById("button-about"),
    zahnrad: document.getElementById("button-einstellungen"),

    zielZeit: document.getElementById("anzeige-ziel"),
    vorlesen: document.getElementById("button-vorlesen"),

    svg:          document.getElementById("uhr-svg"),
    zeigerStunde: document.getElementById("zeiger-stunde"),
    zeigerMinute: document.getElementById("zeiger-minute"),
    kappe:        document.getElementById("uhr-kappe"),
    markierungen: document.getElementById("zifferblatt-markierungen"),
    hinweis:      document.getElementById("hinweis-text"),

    zug:     document.getElementById("zug"),
    abfahrt: document.getElementById("button-abfahrt"),

    popover:      document.getElementById("popover"),
    modal:        document.getElementById("einstellungen"),
    modalZu:      document.getElementById("einstellungen-zu"),
    modalFertig:  document.getElementById("einstellungen-fertig"),
    reset:        document.getElementById("button-reset"),
    optKarten:    document.querySelectorAll(".opt-karte")
  };


  /* 4. HILFSFUNKTIONEN: ZEIT-MATHEMATIK ---------------------------------- */

  function normalisiereMinuten(w) {
    return ((w % MINUTEN_PRO_TAG) + MINUTEN_PRO_TAG) % MINUTEN_PRO_TAG;
  }
  function formatZeit(min) { return zweiStellen(Math.floor(min / 60)) + ":" + zweiStellen(min % 60); }
  function zweiStellen(z) { return String(z).padStart(2, "0"); }
  function zufallGanzzahl(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function aktuelleStunde() { return Math.floor(state.aktuelleMinuten / 60); }
  function aktuelleMinute() { return state.aktuelleMinuten % 60; }


  /* 5. ZIFFERBLATT (SVG) -------------------------------------------------- */

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(typ, attribute) {
    var e = document.createElementNS(SVG_NS, typ);
    for (var n in attribute) { e.setAttribute(n, attribute[n]); }
    return e;
  }
  function leere(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

  /**
   * Zeichnet das Zifferblatt passend zur Einstellung state.blatt:
   *   schlicht      : nur 12 Stundenstriche (keine Zahlen)
   *   zahlen        : 12 Striche + Ziffern 1..12
   *   minuten       : wie "zahlen" + 60 feine Minutenstriche
   *   minutenzahlen : wie "minuten" + aussen die Minuten-Zahlen 5,10,...,55
   *   zwanzigvier   : wie "zahlen" + innen die 24h-Ziffern (13..24)
   *
   * Winkel: 30 Grad je Stunde, oben = 12 (deshalb -90 Grad). Position auf einem
   * Kreis (Radius r) um (100,100): x = 100 + r*cos, y = 100 + r*sin.
   */
  function zeichneZifferblatt() {
    leere(el.markierungen);
    var blatt = state.blatt;
    var mitMinutenstrichen = (blatt === "minuten" || blatt === "minutenzahlen");
    var mitMinutenzahlen   = (blatt === "minutenzahlen");
    // Bei Minuten-Zahlen ruecken die Stunden-Ziffern nach innen, damit aussen
    // Platz fuer die Minuten-Zahlen ist.
    var stundenRadius = mitMinutenzahlen ? 58 : 66;

    // (a) Feine Minutenstriche.
    if (mitMinutenstrichen) {
      for (var m = 0; m < 60; m++) {
        if (m % 5 === 0) { continue; }                 // 5er-Marken sind die Stundenstriche
        var rm = (m * 6 - 90) * Math.PI / 180;
        el.markierungen.appendChild(svgEl("line", {
          x1: 100 + 86 * Math.cos(rm), y1: 100 + 86 * Math.sin(rm),
          x2: 100 + 90 * Math.cos(rm), y2: 100 + 90 * Math.sin(rm),
          class: "markierung-strich minute"
        }));
      }
    }

    // (b) 12 Stundenstriche (in allen Blättern).
    for (var s = 1; s <= 12; s++) {
      var r = (s * 30 - 90) * Math.PI / 180;
      var cos = Math.cos(r), sin = Math.sin(r);
      el.markierungen.appendChild(svgEl("line", {
        x1: 100 + 78 * cos, y1: 100 + 78 * sin,
        x2: 100 + 88 * cos, y2: 100 + 88 * sin,
        class: "markierung-strich" + (s % 3 === 0 ? " voll" : "")
      }));

      // (c) Stunden-Ziffern 1..12 (ausser beim schlichten Blatt).
      if (blatt !== "schlicht") {
        var z = svgEl("text", { x: 100 + stundenRadius * cos, y: 100 + stundenRadius * sin, class: "markierung-zahl" });
        z.textContent = String(s);
        el.markierungen.appendChild(z);
      }

      // (d) Minuten-Zahlen (5,10,...,55) aussen – beim Blatt "minutenzahlen".
      //     Die Stunde s entspricht der Minute s*5; bei 12 (oben) ist es 0 und
      //     wird ausgelassen, damit dort die Stunden-12 frei steht.
      if (mitMinutenzahlen && s !== 12) {
        var zm = svgEl("text", { x: 100 + 73 * cos, y: 100 + 73 * sin, class: "markierung-zahl minutenzahl" });
        zm.textContent = String(s * 5);
        el.markierungen.appendChild(zm);
      }

      // (e) 24h-Ziffern innen (13..24) beim Blatt "zwanzigvier".
      if (blatt === "zwanzigvier") {
        var z24 = svgEl("text", { x: 100 + 52 * cos, y: 100 + 52 * sin, class: "markierung-zahl innen24" });
        z24.textContent = String(s === 12 ? 24 : s + 12);
        el.markierungen.appendChild(z24);
      }
    }
  }

  /** Setzt die Zeiger-Stil-Klasse am Uhr-SVG (standard|duenn|dick|pfeil). */
  function wendeZeigerStilAn() {
    el.svg.classList.remove("zeiger-stil-standard", "zeiger-stil-duenn", "zeiger-stil-dick", "zeiger-stil-pfeil");
    el.svg.classList.add("zeiger-stil-" + state.zeiger);
  }


  /* 6. RENDERING ---------------------------------------------------------- */

  /**
   * Dreht die Zeiger.
   *   Minutenzeiger: 6 Grad pro Minute.
   *   Stundenzeiger: 0,5 Grad pro Minute -> bewegt sich FLIESSEND mit
   *     (bei 08:30: 8*30 + 30*0,5 = 255 Grad -> zwischen 8 und 9).
   */
  function aktualisiereUhr() {
    el.zeigerMinute.style.transform = "rotate(" + ((state.aktuelleMinuten % 60) * 6) + "deg)";
    el.zeigerStunde.style.transform = "rotate(" + ((state.aktuelleMinuten % 720) * 0.5) + "deg)";
    markiereAktivenZeiger();
  }

  function markiereAktivenZeiger() {
    var stundeAktiv = state.aktiverZeiger === "stunde";
    el.zeigerStunde.classList.toggle("aktiv", stundeAktiv);
    el.zeigerMinute.classList.toggle("aktiv", !stundeAktiv);

    // Aktiven Zeiger nach oben sortieren (vor die Mittelkappe), damit er auch
    // bei Ueberdeckung (z.B. 12:00) sichtbar ist.
    if (stundeAktiv) { el.svg.insertBefore(el.zeigerStunde, el.kappe); }
    else { el.svg.insertBefore(el.zeigerMinute, el.kappe); }

    if (!el.hinweis.classList.contains("erfolg") && !el.hinweis.classList.contains("fehler")) {
      el.hinweis.textContent = stundeAktiv
        ? "🟠 kleiner Zeiger – zieh ihn auf die Stunde"
        : "🟠 großer Zeiger – zieh ihn auf die Minute";
    }
  }

  function aktualisiereStatus() {
    el.pokale.textContent = state.pokale;
    markiereAktiveOptionen();
  }

  /* --- Zug am Bahnhof: einfahren (von rechts) / abfahren (nach links) ---
     Wir setzen die Animationsklasse jeweils frisch (Reflow erzwingen), damit
     dieselbe Animation auch bei aufeinanderfolgenden Aufgaben erneut startet. */
  function starteZugAnimation(klasse) {
    el.zug.classList.remove("einfahren", "abfahren");
    void el.zug.getBoundingClientRect();   // Reflow -> Animation kann neu starten
    el.zug.classList.add(klasse);
  }
  function zugEinfahren() { starteZugAnimation("einfahren"); }
  function zugAbfahren()  { starteZugAnimation("abfahren"); }


  /* 7. AUFGABEN & SCHWIERIGKEIT ------------------------------------------ */

  /**
   * Neue Zielzeit. Stunde abhaengig vom Zeitformat:
   *   12h: Stunde 1..12   (Anzeige 01..12 Uhr)
   *   24h: Stunde 0..23
   * Minute aus dem Ziel-Raster der Schwierigkeit.
   */
  function neueAufgabe() {
    var raster = LEVEL_CONFIG[state.level].zielRaster;
    var neu;
    do {
      var stunde = (state.zeitformat === "12") ? zufallGanzzahl(1, 12) : zufallGanzzahl(0, 23);
      var minute = zufallGanzzahl(0, 60 / raster - 1) * raster;
      neu = stunde * 60 + minute;
    } while (neu === state.zielMinuten);

    state.zielMinuten = neu;
    state.aktuelleMinuten = 12 * 60;
    state.aktiverZeiger = "stunde";

    el.zielZeit.textContent = formatZeit(state.zielMinuten);
    zugEinfahren();           // ein neuer Zug faehrt von rechts ein und haelt
    zeigeHinweis("", "");
    aktualisiereUhr();
  }

  function setzeLevel(neuesLevel) {
    state.level = Math.max(1, Math.min(3, neuesLevel));
    aktualisiereStatus();
    neueAufgabe();
    speichereStand();
  }


  /* 8. ZEIGER PER ZIEHEN STELLEN ----------------------------------------- */

  function waehleZeiger(welcher) { state.aktiverZeiger = welcher; markiereAktivenZeiger(); }

  function positionZuWinkel(clientX, clientY) {
    var r = el.svg.getBoundingClientRect();
    var dx = clientX - (r.left + r.width / 2);
    var dy = clientY - (r.top + r.height / 2);
    var w = Math.atan2(dx, -dy) * 180 / Math.PI;
    return w < 0 ? w + 360 : w;
  }

  function zeigerSpitze(welcher) {
    var grad = (welcher === "minute") ? (state.aktuelleMinuten % 60) * 6 : (state.aktuelleMinuten % 720) * 0.5;
    var rad = grad * Math.PI / 180;
    var len = (welcher === "minute") ? 72 : 50;
    var r = el.svg.getBoundingClientRect();
    return {
      x: r.left + ((100 + len * Math.sin(rad)) / 200) * r.width,
      y: r.top  + ((100 - len * Math.cos(rad)) / 200) * r.height
    };
  }

  function abstandZuStrecke(px, py, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, wx = px - a.x, wy = py - a.y;
    var lenQ = vx * vx + vy * vy;
    var t = lenQ > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenQ)) : 0;
    var dx = px - (a.x + t * vx), dy = py - (a.y + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function zeigerBeiDruck(px, py) {
    var r = el.svg.getBoundingClientRect();
    var mitte = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    var dM = abstandZuStrecke(px, py, mitte, zeigerSpitze("minute"));
    var dS = abstandZuStrecke(px, py, mitte, zeigerSpitze("stunde"));
    if (Math.abs(dM - dS) < r.width * 0.06) {
      var radius = Math.sqrt((px - mitte.x) * (px - mitte.x) + (py - mitte.y) * (py - mitte.y));
      return radius < (50 / 200) * r.width * 0.8 ? "stunde" : "minute";
    }
    return dM < dS ? "minute" : "stunde";
  }

  /**
   * Bewegt den aktiven Zeiger.
   *   MINUTE: minute = round(winkel / 30) * 5  (5-Minuten-Raster), Stunde bleibt.
   *   STUNDE: minutenbereinigt runden, damit der fliessende kleine Zeiger die
   *           richtige Stunde liefert:  h12 = round((winkel - minute*0,5)/30).
   */
  function zieheAktivenZeiger(clientX, clientY) {
    var winkel = positionZuWinkel(clientX, clientY);
    var stunde = aktuelleStunde();
    var minute = aktuelleMinute();
    if (state.aktiverZeiger === "minute") {
      var rohMinute = (Math.round(winkel / (6 * MINUTEN_RASTER)) * MINUTEN_RASTER) % 60;

      // MECHANISCHE MITNAHME (wie eine echte Uhr):
      // Ueberquert der grosse Zeiger beim Drehen die 12, wandert die Stunde mit.
      // Wir erkennen den Sprung am Vorzeichen der Minuten-Differenz zum letzten
      // Schritt: 55 -> 0 (delta stark negativ) = VORWAERTS  -> Stunde + 1.
      //          0 -> 55 (delta stark positiv) = RUECKWAERTS -> Stunde - 1.
      // So springt der Stundenzeiger nicht zurueck, sondern laeuft weiter (drei
      // volle Kreise von 0:00 ergeben 3:00).
      var delta = rohMinute - state.letzteZiehMinute;
      if (delta < -30) { stunde += 1; }
      else if (delta > 30) { stunde -= 1; }
      state.letzteZiehMinute = rohMinute;
      minute = rohMinute;
    } else {
      var haelfte = stunde >= 12 ? 12 : 0;
      var h12 = ((Math.round((winkel - minute * 0.5) / 30) % 12) + 12) % 12;
      stunde = haelfte + h12;
    }
    state.aktuelleMinuten = normalisiereMinuten(stunde * 60 + minute);
    aktualisiereUhr();
  }

  function aufZeigerDruck(ereignis) {
    ereignis.preventDefault();
    waehleZeiger(zeigerBeiDruck(ereignis.clientX, ereignis.clientY));
    state.letzteZiehMinute = aktuelleMinute();   // Ausgangswert fuer mechanische Mitnahme
    state.istAmZiehen = true;
    el.svg.classList.add("wird-gezogen");
    if (el.svg.setPointerCapture) {
      try { el.svg.setPointerCapture(ereignis.pointerId); } catch (e) { /* egal */ }
    }
  }
  function aufZeigerBewegung(ereignis) {
    if (!state.istAmZiehen) { return; }
    ereignis.preventDefault();
    zieheAktivenZeiger(ereignis.clientX, ereignis.clientY);
  }
  function aufZeigerLoslassen() {
    state.istAmZiehen = false;
    el.svg.classList.remove("wird-gezogen");
  }


  /* 9. PRUEFUNG + FEEDBACK + ZUG ----------------------------------------- */

  /**
   * Vergleich auf 12-STUNDEN-BASIS (% 720): die analoge Uhr ist eine 12h-Uhr,
   * daher zaehlt die Zeiger-STELLUNG. So wird 18:00 ueber die 6-Uhr-Stellung
   * korrekt eingestellt. Kein Game Over.
   */
  function pruefeAbfahrt() {
    if ((state.aktuelleMinuten % 720) === (state.zielMinuten % 720)) {
      state.pokale += 1;   // ein Pokal pro richtiger Abfahrt

      zeigeHinweis("✅ Super! Der Zug fährt ab! 🎉", "erfolg");
      spielKlang("erfolg");
      el.svg.classList.add("erfolg");
      zugAbfahren();           // der Zug faehrt nach links los

      aktualisiereStatus();
      speichereStand();

      // Die Schwierigkeit waehlt das Kind selbst im Einstellungsmenue – daher
      // KEIN automatischer Levelwechsel. Nach kurzer Pause neue Aufgabe.
      window.setTimeout(function () {
        el.svg.classList.remove("erfolg");
        neueAufgabe();
      }, 1400);

    } else {
      zeigeHinweis("🔁 Fast! Schau noch mal genau hin.", "fehler");
      spielKlang("fehler");
      el.svg.classList.add("schuetteln");
      window.setTimeout(function () { el.svg.classList.remove("schuetteln"); }, 500);
    }
  }

  function zeigeHinweis(text, art) {
    el.hinweis.className = "hinweis" + (art ? " " + art : "");
    if (text) { el.hinweis.textContent = text; } else { markiereAktivenZeiger(); }
  }


  /* 10. ZUSATZ-APIs ------------------------------------------------------- */

  function sprich(text) {
    if (!("speechSynthesis" in window)) { return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE"; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }
  function zahlInWorten(n) {
    var einer = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs", "sieben",
                 "acht", "neun", "zehn", "elf", "zwoelf", "dreizehn", "vierzehn",
                 "fuenfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
    var zehner = ["", "", "zwanzig", "dreissig", "vierzig", "fuenfzig"];
    if (n < 20) { return einer[n]; }
    var z = Math.floor(n / 10), e = n % 10;
    return e === 0 ? zehner[z] : einer[e] + "und" + zehner[z];
  }

  /** Wie zahlInWorten, aber 1 = "eins" (allein stehend, z.B. "halb eins",
   *  "Viertel nach eins") statt "ein" (das nur vor "Uhr" passt). */
  function zahlAllein(n) { return n === 1 ? "eins" : zahlInWorten(n); }

  /**
   * Liefert ALLE gaengigen deutschen Sprechweisen einer Uhrzeit als Liste.
   * Beispiele fuer 09:30 -> ["neun Uhr dreissig", "halb zehn"],
   *            09:15 -> ["neun Uhr fuenfzehn", "Viertel nach neun"],
   *            09:45 -> ["... ", "Viertel vor zehn", "drei Viertel zehn"].
   *
   * Die umgangssprachlichen Formen (Viertel/halb/nach/vor) sind 12-Stunden-
   * basiert: h12 = aktuelle Stunde als 1..12, hNaechste = die darauf folgende
   * Stunde (fuer "halb"/"Viertel vor"/"... vor ..."). Die formale Form nutzt
   * die echte Stunde (also auch 13..24 im 24h-Modus).
   */
  function sprechweisen(min) {
    var stunde = Math.floor(min / 60), minute = min % 60;
    var h12 = (stunde % 12) || 12;            // 1..12
    var hNaechste = ((stunde + 1) % 12) || 12; // folgende Stunde, 1..12

    // (1) Formale Form: "<Stunde> Uhr [Minute]".
    var formen = [zahlInWorten(stunde) + " Uhr" + (minute ? " " + zahlAllein(minute) : "")];

    // (2) Umgangssprachliche Formen je nach Minute.
    if (minute === 0) {
      formen.push(zahlInWorten(h12) + " Uhr");                 // "neun Uhr"
    } else if (minute === 15) {
      formen.push("Viertel nach " + zahlAllein(h12));          // "Viertel nach neun"
    } else if (minute === 30) {
      formen.push("halb " + zahlAllein(hNaechste));            // "halb zehn"
    } else if (minute === 45) {
      formen.push("Viertel vor " + zahlAllein(hNaechste));     // "Viertel vor zehn"
      formen.push("drei Viertel " + zahlAllein(hNaechste));    // "drei Viertel zehn"
    } else if (minute < 30) {
      formen.push(zahlInWorten(minute) + " nach " + zahlAllein(h12)); // "zwanzig nach neun"
      if (minute === 20) { formen.push("zehn vor halb " + zahlAllein(hNaechste)); }
      if (minute === 25) { formen.push("fuenf vor halb " + zahlAllein(hNaechste)); }
    } else { // 31..59 (ausser 45)
      formen.push(zahlInWorten(60 - minute) + " vor " + zahlAllein(hNaechste)); // "zehn vor zehn"
      if (minute === 35) { formen.push("fuenf nach halb " + zahlAllein(hNaechste)); }
      if (minute === 40) { formen.push("zehn nach halb " + zahlAllein(hNaechste)); }
    }
    // Doppelte Eintraege entfernen (z.B. bei vollen Stunden ist formal =
    // umgangssprachlich), damit keine Form bevorzugt wird.
    return formen.filter(function (f, i) { return formen.indexOf(f) === i; });
  }

  /** Eine ZUFAELLIGE Sprechweise der Uhrzeit (trainiert alle Varianten). */
  function zeitInWorten(min) {
    var formen = sprechweisen(min);
    return formen[zufallGanzzahl(0, formen.length - 1)];
  }

  var audioContext = null;
  function holeAudioContext() {
    if (audioContext === null) {
      var A = window.AudioContext || window.webkitAudioContext;
      if (A) { audioContext = new A(); }
    }
    if (audioContext && audioContext.state === "suspended") { audioContext.resume(); }
    return audioContext;
  }
  function spielKlang(typ) {
    var ctx = holeAudioContext();
    if (!ctx) { return; }
    var toene = (typ === "erfolg") ? [523.25, 659.25, 783.99] : [196.00];
    toene.forEach(function (frequenz, i) {
      var osz = ctx.createOscillator(), gain = ctx.createGain();
      osz.type = (typ === "erfolg") ? "triangle" : "sine";
      osz.frequency.value = frequenz;
      var start = ctx.currentTime + i * 0.12, dauer = 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
      osz.connect(gain); gain.connect(ctx.destination);
      osz.start(start); osz.stop(start + dauer);
    });
  }

  function speichereStand() {
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({
        level: state.level, pokale: state.pokale,
        zeitformat: state.zeitformat, blatt: state.blatt, zeiger: state.zeiger
      }));
    } catch (e) { /* optional */ }
  }
  function ladeStand() {
    try {
      var roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { return; }
      var d = JSON.parse(roh);
      if (typeof d.level  === "number") { state.level  = Math.max(1, Math.min(3, d.level)); }
      // Pokale (frueher hiess das Feld "punkte" – beides akzeptieren).
      if (typeof d.pokale === "number") { state.pokale = Math.max(0, d.pokale); }
      else if (typeof d.punkte === "number") { state.pokale = Math.max(0, d.punkte); }
      if (d.zeitformat === "12" || d.zeitformat === "24") { state.zeitformat = d.zeitformat; }
      if (["schlicht", "zahlen", "minuten", "minutenzahlen", "zwanzigvier"].indexOf(d.blatt) >= 0) { state.blatt = d.blatt; }
      if (["standard", "duenn", "dick", "pfeil"].indexOf(d.zeiger) >= 0) { state.zeiger = d.zeiger; }
    } catch (e) { /* ignorieren */ }
  }


  /* 11. EINSTELLUNGSMENUE + ERKLAER-POPOVER ------------------------------ */

  // Erklaer-Text fuer die Pokale (kindgerecht, kurz).
  var INFO_POKALE = "🏆 Pokale: So oft hast du den Zug schon richtig auf die Reise geschickt! Jede richtige Abfahrt gibt einen Pokal.";

  // Inhalt des "Über das Spiel"-Fensters (Klick auf den Uhu).
  var ABOUT_HTML =
    '<span class="about-titel">🦉 Uhrzeit-Uhu</span>' +
    '<span class="about-unter">Der Zeitreisen-Express</span>' +
    '<span class="about-studio">by JONFIE STUDIOS</span>';

  /** Positioniert das (bereits gefuellte) Popover unter dem Anker-Element. */
  function platzierePopover(ankerEl) {
    el.popover.hidden = false;
    var r = ankerEl.getBoundingClientRect();
    var p = el.popover.getBoundingClientRect();
    var left = r.left + r.width / 2 - p.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    el.popover.style.left = left + "px";
    el.popover.style.top = (r.bottom + 8) + "px";
  }
  /** Reines Text-Popover (z.B. Pokale-Erklaerung). */
  function zeigeInfo(text, ankerEl) { el.popover.textContent = text; platzierePopover(ankerEl); }
  /** Reichhaltiges Popover (Spielname + Studio). */
  function zeigeAbout(ankerEl) { el.popover.innerHTML = ABOUT_HTML; platzierePopover(ankerEl); }
  function versteckePopover() { el.popover.hidden = true; }

  /** Hebt die aktuell gewaehlten Optionen im Menue hervor. */
  function markiereAktiveOptionen() {
    el.optKarten.forEach(function (karte) {
      var setting = karte.dataset.setting, wert = karte.dataset.wert;
      var aktiv = (setting === "level"      && String(state.level) === wert)
               || (setting === "zeitformat" && state.zeitformat === wert)
               || (setting === "blatt"      && state.blatt === wert)
               || (setting === "zeiger"     && state.zeiger === wert);
      karte.classList.toggle("aktiv", aktiv);
    });
  }

  function oeffneMenue()   { el.modal.classList.add("offen"); el.modal.setAttribute("aria-hidden", "false"); }
  function schliesseMenue(){ el.modal.classList.remove("offen"); el.modal.setAttribute("aria-hidden", "true"); }

  /** Wendet die Auswahl einer Option an. */
  function waehleOption(setting, wert) {
    if (setting === "level") {
      setzeLevel(Number(wert));                 // neue Aufgabe in neuer Schwierigkeit
    } else if (setting === "zeitformat") {
      state.zeitformat = wert;
      speichereStand();
      neueAufgabe();                            // neue Aufgabe passend zum Format
    } else if (setting === "blatt") {
      state.blatt = wert;
      speichereStand();
      zeichneZifferblatt();                     // Ziffernblatt neu zeichnen
      aktualisiereUhr();
    } else if (setting === "zeiger") {
      state.zeiger = wert;
      speichereStand();
      wendeZeigerStilAn();                       // Zeiger-Stil anwenden
    }
    markiereAktiveOptionen();
  }

  /** Setzt die gesammelten Pokale zurueck (mit kurzer Rueckfrage). */
  function setzeFortschrittZurueck() {
    if (!window.confirm("Wirklich alle Pokale auf 0 zurücksetzen?")) { return; }
    state.pokale = 0;
    aktualisiereStatus();
    speichereStand();
  }


  /* 12. GERAETE-ERKENNUNG + EVENTS + START ------------------------------- */

  function erkenneGeraet() {
    var touch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
             || ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    var handy = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
    document.body.classList.toggle("ist-touch", !!touch);
    document.body.classList.toggle("ist-handy", !!handy);
  }

  function verbindeEvents() {
    el.abfahrt.addEventListener("click", pruefeAbfahrt);
    el.vorlesen.addEventListener("click", function () {
      sprich("Die Abfahrtszeit ist " + zeitInWorten(state.zielMinuten));
    });

    // Zeiger stellen (Pointer Events = Maus + Touch).
    el.svg.addEventListener("pointerdown", aufZeigerDruck);
    el.svg.addEventListener("pointermove", aufZeigerBewegung);
    el.svg.addEventListener("pointerup", aufZeigerLoslassen);
    el.svg.addEventListener("pointercancel", aufZeigerLoslassen);

    // Erklaer-Popover fuer ⭐ / 🏆. Anzeige beim Klick.
    el.statPokale.addEventListener("click", function () { zeigeInfo(INFO_POKALE, el.statPokale); });
    el.about.addEventListener("click", function () { zeigeAbout(el.about); });
    // Jede weitere Beruehrung (auch auf der Uhr) schliesst das Popover wieder.
    // pointerdown statt click, weil Beruehrungen auf der Uhr per preventDefault
    // kein click-Event erzeugen. Beim Antippen der Stat-Buttons feuert pointerdown
    // VOR click -> erst schliessen (no-op), dann zeigt der Button es wieder an.
    document.addEventListener("pointerdown", versteckePopover);

    // Einstellungsmenue.
    el.zahnrad.addEventListener("click", oeffneMenue);
    el.modalZu.addEventListener("click", schliesseMenue);
    el.modalFertig.addEventListener("click", schliesseMenue);
    el.reset.addEventListener("click", setzeFortschrittZurueck);
    el.modal.addEventListener("click", function (e) { if (e.target === el.modal) { schliesseMenue(); } });
    el.optKarten.forEach(function (karte) {
      karte.addEventListener("click", function () { waehleOption(karte.dataset.setting, karte.dataset.wert); });
    });

    // Tastatur-Komfort (Desktop).
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { schliesseMenue(); versteckePopover(); }
      if (ev.key === "ArrowLeft")  { waehleZeiger("stunde"); }
      if (ev.key === "ArrowRight") { waehleZeiger("minute"); }
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        var r = ev.key === "ArrowUp" ? 1 : -1;
        var schritt = state.aktiverZeiger === "minute" ? MINUTEN_RASTER : 60;
        state.aktuelleMinuten = normalisiereMinuten(state.aktuelleMinuten + r * schritt);
        aktualisiereUhr();
      }
      if ((ev.key === "Enter" || ev.key === " ") && document.activeElement === document.body) {
        ev.preventDefault(); pruefeAbfahrt();
      }
    });

    window.addEventListener("resize", function () { erkenneGeraet(); versteckePopover(); });
  }

  function start() {
    erkenneGeraet();
    ladeStand();
    zeichneZifferblatt();
    wendeZeigerStilAn();
    verbindeEvents();
    aktualisiereStatus();
    neueAufgabe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
