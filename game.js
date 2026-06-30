/* ===========================================================================
   Uhrzeit-Uhu: Der Zeitreisen-Express  –  Spiellogik (game.js)
   ---------------------------------------------------------------------------
   Reines Vanilla JavaScript (ES6+), keine externen Bibliotheken.

   BEDIENKONZEPT (fuer Erstklaesser, viele Symbole, wenig Text)
   -----------------------------------------------------------
   Die Uhr wird AUSSCHLIESSLICH durch Ziehen der Zeiger gestellt:

     1. Einen Zeiger ANTIPPEN  -> er wird ORANGE (= ausgewaehlt).
     2. Den ausgewaehlten Zeiger am Zifferblatt auf die Stelle ZIEHEN.
          * grosser Zeiger (Minute): rastet in 5-Minuten-Schritten ein
          * kleiner Zeiger (Stunde): gleitet "fliessend" zwischen die Stunden
            (z.B. bei "halb" steht er genau zwischen zwei Zahlen)

   Es gibt bewusst KEINE +/- Knoepfe mehr – das Kind soll die echte Uhr stellen.
   Die analoge Uhr ist eine 12-Stunden-Uhr; ein AM/PM-Schalter ist nicht noetig
   (18:00 wird ueber die 6-Uhr-Stellung eingestellt).

   INHALT
     1. Konstanten & Konfiguration
     2. Spielzustand (State)
     3. HTML-Referenzen
     4. Hilfsfunktionen (Zeit-Mathematik)
     5. Zifferblatt (SVG) aufbauen
     6. Rendering (Zeiger, Auswahl, Status)
     7. Aufgaben & Level
     8. Zeiger per Ziehen stellen (Tippen waehlt aus, Ziehen stellt ein)
     9. Pruefung "Abfahrt!" + Feedback + Zug-Abfahrt
    10. Zusatz-APIs: Sprachausgabe, Soundeffekte, Speichern
    11. Geraete-Erkennung + Events + Start
   ===========================================================================*/

(function () {
  "use strict";


  /* 1. KONSTANTEN & KONFIGURATION ---------------------------------------- */

  var MINUTEN_PRO_TAG = 1440;        // 24 * 60

  // Der grosse (Minuten-)Zeiger rastet immer in 5-Minuten-Schritten ein.
  var MINUTEN_RASTER = 5;

  // Pro Level wird festgelegt, WIE GENAU die Zielzeiten erzeugt werden:
  //   L1: volle/halbe Stunden (Minute 0 oder 30)
  //   L2: Viertelstunden      (Minute 0/15/30/45)
  //   L3: jede 5-Minuten-Marke (Minute 0,5,10,...,55), volles Tagesbild
  var LEVEL_CONFIG = {
    1: { zielRaster: 30 },
    2: { zielRaster: 15 },
    3: { zielRaster: 5  }
  };

  var AUFSTIEG_NACH = 3;             // richtige Abfahrten je Stufe bis Aufstieg
  var SPEICHER_SCHLUESSEL = "uhrzeit-uhu-state";


  /* 2. SPIELZUSTAND (State) ----------------------------------------------
     EINE Quelle der Wahrheit. Jede Aktion aendert nur dieses Objekt und ruft
     danach das Rendering auf.
       aktuelleMinuten : eingestellte Zeit (0..1439)
       zielMinuten     : geforderte Abfahrtszeit (0..1439)
       level / punkte / rekord
       aktiverZeiger   : "stunde" | "minute" | null  (der orange Zeiger)
       istAmZiehen     : true, solange ein Finger zieht
   ---------------------------------------------------------------------- */
  var state = {
    aktuelleMinuten: 12 * 60,
    zielMinuten:     8 * 60,
    level:           1,
    punkte:          0,
    rekord:          0,
    aktiverZeiger:   "stunde",
    istAmZiehen:     false
  };


  /* 3. HTML-REFERENZEN ---------------------------------------------------- */
  var el = {
    punkte:       document.getElementById("anzeige-punkte"),
    rekord:       document.getElementById("anzeige-rekord"),
    levelButtons: document.querySelectorAll(".level-button"),

    zielZeit:  document.getElementById("anzeige-ziel"),
    vorlesen:  document.getElementById("button-vorlesen"),

    svg:          document.getElementById("uhr-svg"),
    zeigerStunde: document.getElementById("zeiger-stunde"),
    zeigerMinute: document.getElementById("zeiger-minute"),
    kappe:        document.getElementById("uhr-kappe"),
    markierungen: document.getElementById("zifferblatt-markierungen"),
    hinweis:      document.getElementById("hinweis-text"),

    zug:     document.getElementById("zug"),
    abfahrt: document.getElementById("button-abfahrt")
  };


  /* 4. HILFSFUNKTIONEN: ZEIT-MATHEMATIK ---------------------------------- */

  /** Begrenzt Minuten sauber auf 0..1439 (auch fuer negative Werte). */
  function normalisiereMinuten(wert) {
    return ((wert % MINUTEN_PRO_TAG) + MINUTEN_PRO_TAG) % MINUTEN_PRO_TAG;
  }

  /** "HH:MM" aus Minutenzahl (487 -> "08:07"). */
  function formatZeit(min) {
    return zweiStellen(Math.floor(min / 60)) + ":" + zweiStellen(min % 60);
  }
  function zweiStellen(z) { return String(z).padStart(2, "0"); }

  function zufallGanzzahl(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function aktuelleStunde() { return Math.floor(state.aktuelleMinuten / 60); }
  function aktuelleMinute() { return state.aktuelleMinuten % 60; }


  /* 5. ZIFFERBLATT (SVG) -------------------------------------------------- */

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(typ, attribute) {
    var e = document.createElementNS(SVG_NS, typ);
    for (var n in attribute) { e.setAttribute(n, attribute[n]); }
    return e;
  }

  /**
   * Zeichnet 12 Stunden-Striche + Ziffern.
   * Winkel: 30 Grad je Stunde, oben = 12 (deshalb -90 Grad). Grad->Radiant:
   * grad*PI/180. Punkt auf Kreis (Radius r) um (100,100):
   *   x = 100 + r*cos(winkel),  y = 100 + r*sin(winkel)
   */
  function zeichneZifferblatt() {
    for (var s = 1; s <= 12; s++) {
      var rad = (s * 30 - 90) * Math.PI / 180;
      var cos = Math.cos(rad), sin = Math.sin(rad);
      el.markierungen.appendChild(svgEl("line", {
        x1: 100 + 78 * cos, y1: 100 + 78 * sin,
        x2: 100 + 88 * cos, y2: 100 + 88 * sin,
        class: "markierung-strich" + (s % 3 === 0 ? " voll" : "")
      }));
      var zahl = svgEl("text", { x: 100 + 66 * cos, y: 100 + 66 * sin, class: "markierung-zahl" });
      zahl.textContent = String(s);
      el.markierungen.appendChild(zahl);
    }
  }


  /* 6. RENDERING ---------------------------------------------------------- */

  /**
   * Dreht die Zeiger entsprechend der aktuellen Zeit.
   *   Minutenzeiger: 360/60 = 6 Grad pro Minute
   *   Stundenzeiger: 360/720 = 0,5 Grad pro Minute  -> bewegt sich FLIESSEND
   *     mit; bei 08:30 steht er genau zwischen 8 und 9 (8*30 + 30*0,5 = 255 Grad).
   */
  function aktualisiereUhr() {
    var minutenWinkel = (state.aktuelleMinuten % 60) * 6;
    var stundenWinkel = (state.aktuelleMinuten % 720) * 0.5;
    el.zeigerMinute.style.transform = "rotate(" + minutenWinkel + "deg)";
    el.zeigerStunde.style.transform = "rotate(" + stundenWinkel + "deg)";
    markiereAktivenZeiger();
  }

  /**
   * Hebt den ausgewaehlten Zeiger orange hervor und sortiert ihn nach oben
   * (vor die Mittelkappe), damit er auch bei Ueberdeckung (z.B. 12:00) sichtbar
   * ist. Aktualisiert ausserdem den kurzen Hinweis-Text.
   */
  function markiereAktivenZeiger() {
    var stundeAktiv = state.aktiverZeiger === "stunde";
    var minuteAktiv = state.aktiverZeiger === "minute";

    el.zeigerStunde.classList.toggle("aktiv", stundeAktiv);
    el.zeigerMinute.classList.toggle("aktiv", minuteAktiv);

    // Aktiven Zeiger im SVG nach oben holen (direkt vor die Mittelkappe).
    if (stundeAktiv) { el.svg.insertBefore(el.zeigerStunde, el.kappe); }
    else if (minuteAktiv) { el.svg.insertBefore(el.zeigerMinute, el.kappe); }

    // Kurzer, symbolischer Hinweis (nur wenn gerade kein Feedback angezeigt wird).
    if (!el.hinweis.classList.contains("erfolg") && !el.hinweis.classList.contains("fehler")) {
      el.hinweis.textContent = stundeAktiv
        ? "🟠 kleiner Zeiger – zieh ihn auf die Stunde"
        : "🟠 großer Zeiger – zieh ihn auf die Minute";
    }
  }

  /** Aktualisiert Punkte, Rekord und die aktive Level-Schaltflaeche. */
  function aktualisiereStatus() {
    el.punkte.textContent = state.punkte;
    el.rekord.textContent = state.rekord;
    el.levelButtons.forEach(function (b) {
      b.classList.toggle("aktiv", Number(b.dataset.level) === state.level);
    });
  }


  /* 7. AUFGABEN & LEVEL --------------------------------------------------- */

  /**
   * Erzeugt eine neue Zielzeit passend zum Level.
   *   L1: Minute aus {0,30}; L2: {0,15,30,45}; L3: jede 5-Minuten-Marke.
   *   Stunde immer 0..23 (Anzeige im 24h-Format, Einstellung auf der 12h-Uhr).
   */
  function neueAufgabe() {
    var raster = LEVEL_CONFIG[state.level].zielRaster;
    var neu;
    do {
      var stunde = zufallGanzzahl(0, 23);
      var minute = zufallGanzzahl(0, 60 / raster - 1) * raster;
      neu = stunde * 60 + minute;
    } while (neu === state.zielMinuten);

    state.zielMinuten = neu;
    state.aktuelleMinuten = 12 * 60;   // neutraler Start (12:00)
    state.aktiverZeiger = "stunde";    // Stunde zuerst

    el.zielZeit.textContent = formatZeit(state.zielMinuten);
    el.zug.classList.remove("faehrt"); // frischer Zug am Bahnhof
    zeigeHinweis("", "");              // Hinweis zuruecksetzen -> zeigt aktiven Zeiger
    aktualisiereUhr();
  }

  function setzeLevel(neuesLevel) {
    state.level = Math.max(1, Math.min(3, neuesLevel));
    aktualisiereStatus();
    neueAufgabe();
    speichereStand();
  }


  /* 8. ZEIGER PER ZIEHEN STELLEN ----------------------------------------- */

  /** Waehlt einen Zeiger aus (macht ihn orange). */
  function waehleZeiger(welcher) {
    state.aktiverZeiger = welcher;
    markiereAktivenZeiger();
  }

  /**
   * Bildschirmposition -> Winkel in Grad (0 = oben/12 Uhr, im Uhrzeigersinn).
   * atan2(dx, -dy) liefert genau diese Orientierung.
   */
  function positionZuWinkel(clientX, clientY) {
    var r = el.svg.getBoundingClientRect();
    var dx = clientX - (r.left + r.width / 2);
    var dy = clientY - (r.top + r.height / 2);
    var w = Math.atan2(dx, -dy) * 180 / Math.PI;
    return w < 0 ? w + 360 : w;
  }

  /** Bildschirm-Koordinaten der Spitze eines Zeigers (fuer die Auswahl). */
  function zeigerSpitze(welcher) {
    var grad = (welcher === "minute")
      ? (state.aktuelleMinuten % 60) * 6
      : (state.aktuelleMinuten % 720) * 0.5;
    var rad = grad * Math.PI / 180;
    var len = (welcher === "minute") ? 72 : 50;
    var r = el.svg.getBoundingClientRect();
    return {
      x: r.left + ((100 + len * Math.sin(rad)) / 200) * r.width,
      y: r.top  + ((100 - len * Math.cos(rad)) / 200) * r.height
    };
  }

  /** Abstand eines Punktes zur Strecke Mitte->Spitze (ganzer Zeiger zaehlt). */
  function abstandZuStrecke(px, py, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y;
    var wx = px - a.x, wy = py - a.y;
    var lenQ = vx * vx + vy * vy;
    var t = lenQ > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenQ)) : 0;
    var dx = px - (a.x + t * vx), dy = py - (a.y + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Beim Antippen: bestimmt, welcher Zeiger gemeint ist – der naehere von
   * Stunden- und Minutenzeiger (Abstand zur jeweiligen Zeiger-Strecke).
   * Bei Ueberdeckung (fast gleicher Abstand, z.B. um 12:00) entscheidet die
   * Entfernung zur Mitte: nah an der Mitte = kurzer (Stunden-)Zeiger,
   * weiter aussen = langer (Minuten-)Zeiger.
   */
  function zeigerBeiDruck(px, py) {
    var r = el.svg.getBoundingClientRect();
    var mitte = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    var dM = abstandZuStrecke(px, py, mitte, zeigerSpitze("minute"));
    var dS = abstandZuStrecke(px, py, mitte, zeigerSpitze("stunde"));

    if (Math.abs(dM - dS) < r.width * 0.06) {
      // Ueberdeckung -> nach Entfernung zur Mitte entscheiden.
      var radius = Math.sqrt((px - mitte.x) * (px - mitte.x) + (py - mitte.y) * (py - mitte.y));
      var stundenLaengePx = (50 / 200) * r.width; // kurzer Zeiger
      return radius < stundenLaengePx * 0.8 ? "stunde" : "minute";
    }
    return dM < dS ? "minute" : "stunde";
  }

  /**
   * Bewegt den AKTIVEN Zeiger entsprechend der Zieh-Position.
   *
   *   MINUTE: Winkel -> Minute, eingerastet auf 5er-Schritte.
   *       minute = round(winkel / 30) * 5   (30 Grad entsprechen 5 Minuten)
   *     Die Stunde bleibt; der Stundenzeiger gleitet im Rendering automatisch
   *     mit (fliessend), wenn sich die Minute aendert.
   *
   *   STUNDE: Winkel -> Stunde. Da der kleine Zeiger MINUTENABHAENGIG zwischen
   *     den Stunden steht, rechnen wir den Minutenanteil (Minute*0,5 Grad)
   *     heraus, bevor wir auf die naechste volle Stunde runden:
   *       h12 = round((winkel - minute*0,5) / 30)
   *     So liefert z.B. die 8:30-Stellung (Hand bei 255 Grad) korrekt die
   *     Stunde 8 und nicht 9. Die Tageshaelfte (vor-/nachmittags) bleibt erhalten.
   */
  function zieheAktivenZeiger(clientX, clientY) {
    var winkel = positionZuWinkel(clientX, clientY);
    var stunde = aktuelleStunde();
    var minute = aktuelleMinute();

    if (state.aktiverZeiger === "minute") {
      minute = (Math.round(winkel / (6 * MINUTEN_RASTER)) * MINUTEN_RASTER) % 60;
    } else {
      var haelfte = stunde >= 12 ? 12 : 0;
      var h12 = Math.round((winkel - minute * 0.5) / 30);
      h12 = ((h12 % 12) + 12) % 12;
      stunde = haelfte + h12;
    }
    state.aktuelleMinuten = normalisiereMinuten(stunde * 60 + minute);
    aktualisiereUhr();
  }

  // --- Pointer-Events: Tippen waehlt aus, Ziehen stellt ein ---

  function aufZeigerDruck(ereignis) {
    ereignis.preventDefault();
    // Antippen waehlt den gemeinten Zeiger aus (er wird orange) ...
    waehleZeiger(zeigerBeiDruck(ereignis.clientX, ereignis.clientY));
    // ... das eigentliche Stellen passiert erst beim Ziehen (pointermove),
    // damit ein reines Antippen den Zeiger nur auswaehlt (nicht verspringt).
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


  /* 9. PRUEFUNG + FEEDBACK + ZUG-ABFAHRT --------------------------------- */

  /**
   * Vergleich auf 12-STUNDEN-BASIS: die analoge Uhr ist eine 12h-Uhr, daher
   * zaehlt die Zeiger-STELLUNG. "% 720" bildet vor- und nachmittags auf dieselbe
   * Stellung ab – so wird 18:00 korrekt ueber die 6-Uhr-Stellung eingestellt.
   * Kein Game Over: beliebig viele Versuche.
   */
  function pruefeAbfahrt() {
    if ((state.aktuelleMinuten % 720) === (state.zielMinuten % 720)) {
      // RICHTIG
      state.punkte += 1;
      if (state.punkte > state.rekord) { state.rekord = state.punkte; }

      zeigeHinweis("✅ Super! Der Zug fährt ab! 🎉", "erfolg");
      spielKlang("erfolg");
      el.svg.classList.add("erfolg");
      el.zug.classList.add("faehrt");           // Zug faehrt los

      var zielLevel = Math.min(3, Math.floor(state.punkte / AUFSTIEG_NACH) + 1);
      aktualisiereStatus();
      speichereStand();

      window.setTimeout(function () {
        el.svg.classList.remove("erfolg");
        if (zielLevel !== state.level) {
          setzeLevel(zielLevel);
          zeigeHinweis("🚀 Neue Epoche – Stufe " + state.level + "!", "erfolg");
        } else {
          neueAufgabe();
        }
      }, 1300);

    } else {
      // FALSCH – sanft und ermutigend, kein Game Over
      zeigeHinweis("🔁 Fast! Schau noch mal genau hin.", "fehler");
      spielKlang("fehler");
      el.svg.classList.add("schuetteln");
      window.setTimeout(function () { el.svg.classList.remove("schuetteln"); }, 500);
    }
  }

  /** Setzt Hinweistext + Farbklasse. Leerer Text -> zeigt wieder den aktiven Zeiger. */
  function zeigeHinweis(text, art) {
    el.hinweis.className = "hinweis" + (art ? " " + art : "");
    if (text) { el.hinweis.textContent = text; }
    else { markiereAktivenZeiger(); }   // ohne Feedback: aktiven Zeiger anzeigen
  }


  /* 10. ZUSATZ-APIs: SPRACHAUSGABE, SOUND, SPEICHERN --------------------- */

  /* 10a) Sprachausgabe (Web Speech API) */
  function sprich(text) {
    if (!("speechSynthesis" in window)) { return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  /** Zielzeit als deutscher Satz, z.B. "acht Uhr dreissig". */
  function zeitInWorten(min) {
    var stunde = Math.floor(min / 60), minute = min % 60;
    var satz = zahlInWorten(stunde) + " Uhr";
    if (minute > 0) { satz += " " + zahlInWorten(minute); }
    return satz;
  }
  function zahlInWorten(n) {
    var einer = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs",
                 "sieben", "acht", "neun", "zehn", "elf", "zwoelf", "dreizehn",
                 "vierzehn", "fuenfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
    var zehner = ["", "", "zwanzig", "dreissig", "vierzig", "fuenfzig"];
    if (n < 20) { return einer[n]; }
    var z = Math.floor(n / 10), e = n % 10;
    return e === 0 ? zehner[z] : einer[e] + "und" + zehner[z];
  }

  /* 10b) Soundeffekte (Web Audio API) – erst bei erster Interaktion erzeugt */
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

  /* 10c) Speichern/Laden (localStorage) */
  function speichereStand() {
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({
        level: state.level, punkte: state.punkte, rekord: state.rekord
      }));
    } catch (e) { /* optional */ }
  }
  function ladeStand() {
    try {
      var roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { return; }
      var d = JSON.parse(roh);
      if (typeof d.level  === "number") { state.level  = Math.max(1, Math.min(3, d.level)); }
      if (typeof d.punkte === "number") { state.punkte = Math.max(0, d.punkte); }
      if (typeof d.rekord === "number") { state.rekord = Math.max(0, d.rekord); }
    } catch (e) { /* beschaedigte Daten ignorieren */ }
  }


  /* 11. GERAETE-ERKENNUNG + EVENTS + START ------------------------------- */

  /** Setzt body-Klassen fuer Touch/Handy (zusaetzlich zu den CSS-Media-Queries). */
  function erkenneGeraet() {
    var touch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
             || ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    var handy = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
    document.body.classList.toggle("ist-touch", !!touch);
    document.body.classList.toggle("ist-handy", !!handy);
  }

  function verbindeEvents() {
    el.abfahrt.addEventListener("click", pruefeAbfahrt);

    // Abfahrtszeit antippen -> vorlesen
    el.vorlesen.addEventListener("click", function () {
      sprich("Die Abfahrtszeit ist " + zeitInWorten(state.zielMinuten));
    });

    el.levelButtons.forEach(function (b) {
      b.addEventListener("click", function () { setzeLevel(Number(b.dataset.level)); });
    });

    // Zeiger per Pointer Events stellen (Maus + Touch).
    el.svg.addEventListener("pointerdown", aufZeigerDruck);
    el.svg.addEventListener("pointermove", aufZeigerBewegung);
    el.svg.addEventListener("pointerup", aufZeigerLoslassen);
    el.svg.addEventListener("pointercancel", aufZeigerLoslassen);

    // Tastatur-Komfort (Desktop): Zeiger waehlen + in Schritten bewegen.
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft")  { waehleZeiger("stunde"); }
      if (ev.key === "ArrowRight") { waehleZeiger("minute"); }
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        var r = ev.key === "ArrowUp" ? 1 : -1;
        if (state.aktiverZeiger === "minute") {
          state.aktuelleMinuten = normalisiereMinuten(state.aktuelleMinuten + r * MINUTEN_RASTER);
        } else {
          state.aktuelleMinuten = normalisiereMinuten(state.aktuelleMinuten + r * 60);
        }
        aktualisiereUhr();
      }
      if ((ev.key === "Enter" || ev.key === " ") && document.activeElement === document.body) {
        ev.preventDefault();
        pruefeAbfahrt();
      }
    });

    window.addEventListener("resize", erkenneGeraet);
  }

  function start() {
    erkenneGeraet();
    zeichneZifferblatt();
    ladeStand();
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
