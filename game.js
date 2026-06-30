/* ===========================================================================
   Uhrzeit-Uhu: Der Zeitreisen-Express  –  Spiellogik (game.js)
   ---------------------------------------------------------------------------
   Reines Vanilla JavaScript (ES6+), keine externen Bibliotheken.

   BEDIENKONZEPT (mobil-/touch-optimiert)
   --------------------------------------
   Stunde und Minute werden GETRENNT eingestellt – das ist die uebliche,
   robuste Variante (vergleichbar mit dem Uhrzeit-Picker auf dem Handy):

     * Es gibt zwei Steller-Zeilen: eine fuer die STUNDE, eine fuer die MINUTE.
       Jede hat grosse "-" und "+" Knoepfe.
     * Eine der beiden Zeilen ist "aktiv". Der zur aktiven Zeile gehoerende
       Zeiger ist auf der Uhr farblich hervorgehoben.
     * Beim ZIEHEN am Zifferblatt bewegt sich IMMER NUR der aktive Zeiger und
       folgt dem Finger. Beim Antippen waehlt das Spiel automatisch den Zeiger,
       dessen Spitze dem Finger am naechsten ist.

   Dadurch entfaellt das fehleranfaellige "Erraten", welcher Zeiger gemeint ist,
   und die Zeiger koennen nicht mehr unkontrolliert ueber den Bildschirm fliegen.

   INHALTSVERZEICHNIS
     1. Konstanten & Konfiguration
     2. Der zentrale Spielzustand (State)
     3. Referenzen auf HTML-Elemente
     4. Hilfsfunktionen (Zeit-Mathematik & Formatierung)
     5. Aufbau des Zifferblatts (SVG)
     6. Darstellung / Rendering
     7. Aufgaben-Erzeugung & Level-Verwaltung
     8. Steuerung per Stepper-Knoepfen (Stunde/Minute getrennt)
     9. Steuerung per Drag & Drop am Zifferblatt
    10. Pruefung "Abfahrt!" + Feedback
    11. Zusatz-APIs: Sprachausgabe, Soundeffekte, Speichern
    12. Mobil-Erkennung + Event-Verdrahtung + Spielstart
   ===========================================================================*/

(function () {
  "use strict";


  /* 1. --------------------------------------------------------------------
     KONSTANTEN & KONFIGURATION
     ----------------------------------------------------------------------- */

  // Ein voller Tag hat 24 * 60 = 1440 Minuten -> Spielzeit 0..1439.
  var MINUTEN_PRO_TAG = 1440;

  // Pro Level:
  //   minuteRaster: erlaubte Minuten-Schrittweite. Sie bestimmt zugleich,
  //                 - auf welche Werte der Minuten-Steller springt,
  //                 - und worauf der Minutenzeiger beim Ziehen magnetisch einrastet.
  //                 (L1: 0/30, L2: 0/15/30/45, L3: jede Minute)
  //   name:         Anzeigename der Stufe.
  var LEVEL_CONFIG = {
    1: { minuteRaster: 30, name: "Volle & halbe Stunden" },
    2: { minuteRaster: 15, name: "Viertelstunden" },
    3: { minuteRaster: 1,  name: "Minutengenau (24h)" }
  };

  // Nach so vielen richtigen Abfahrten pro Stufe wird automatisch aufgestiegen.
  var AUFSTIEG_NACH = 3;

  // Speicher-Schluessel fuer localStorage.
  var SPEICHER_SCHLUESSEL = "uhrzeit-uhu-state";

  // Freundliche Hinweise bei falscher Eingabe (zufaellig gewaehlt).
  var FEHLER_TIPPS = [
    "Fast! Schau noch einmal genau auf den Minutenzeiger.",
    "Noch nicht ganz. Probiere es ruhig weiter – du schaffst das!",
    "Knapp daneben. Vergleiche beide Zeiten Ziffer fuer Ziffer.",
    "Hoppla, der Uhu wartet noch. Stelle Stunde und Minute neu ein."
  ];


  /* 2. --------------------------------------------------------------------
     DER ZENTRALE SPIELZUSTAND (State)
     -----------------------------------------------------------------------
     EINE einzige "Quelle der Wahrheit". Jede Aktion aendert nur dieses Objekt
     und ruft danach die Render-Funktionen auf, die den Bildschirm anpassen.

       aktuelleMinuten : eingestellte Zeit auf der Uhr (0..1439)
       zielMinuten     : geforderte Abfahrtszeit         (0..1439)
       level           : Stufe 1..3
       punkte          : Punkte der laufenden Sitzung
       rekord          : hoechster je erreichter Punktestand (gespeichert)
       aktiverModus    : "stunde" oder "minute" – welcher Zeiger gerade
                         per Ziehen/Steller bewegt wird
       istAmZiehen     : true, solange ein Finger/Maustaste die Uhr zieht
     ----------------------------------------------------------------------- */
  var state = {
    aktuelleMinuten: 12 * 60,   // Start: 12:00 (neutraler Ausgangspunkt)
    zielMinuten:     8 * 60,
    level:           1,
    punkte:          0,
    rekord:          0,
    aktiverModus:    "stunde",
    istAmZiehen:     false
  };


  /* 3. --------------------------------------------------------------------
     REFERENZEN AUF HTML-ELEMENTE (einmalig holen)
     ----------------------------------------------------------------------- */
  var el = {
    // Top-Bar
    level:        document.getElementById("anzeige-level"),
    punkte:       document.getElementById("anzeige-punkte"),
    rekord:       document.getElementById("anzeige-rekord"),
    levelButtons: document.querySelectorAll(".level-button"),

    // Fahrplan
    zielZeit:  document.getElementById("anzeige-ziel"),
    vorlesen:  document.getElementById("button-vorlesen"),
    zug:       document.getElementById("szene-zug"),

    // Uhr
    svg:          document.getElementById("uhr-svg"),
    zeigerStunde: document.getElementById("zeiger-stunde"),
    zeigerMinute: document.getElementById("zeiger-minute"),
    markierungen: document.getElementById("zifferblatt-markierungen"),
    istZeit:      document.getElementById("anzeige-ist"),

    // Steuerung
    stepperBtns: document.querySelectorAll(".stepper-btn"),     // − / + Knoepfe
    stepperMitte: document.querySelectorAll(".stepper-mitte"),  // Wert-Bereiche
    zeileStunde: document.getElementById("zeile-stunde"),
    zeileMinute: document.getElementById("zeile-minute"),
    wertStunde:  document.getElementById("wert-stunde"),
    wertMinute:  document.getElementById("wert-minute"),
    abfahrt:     document.getElementById("button-abfahrt"),
    hinweis:     document.getElementById("hinweis-text")
  };


  /* 4. --------------------------------------------------------------------
     HILFSFUNKTIONEN: ZEIT-MATHEMATIK & FORMATIERUNG
     ----------------------------------------------------------------------- */

  /**
   * Begrenzt Minuten sauber auf 0..1439 (mit korrektem 24h-Umlauf).
   * Das doppelte Modulo faengt auch NEGATIVE Werte ab:
   *   ((wert % 1440) + 1440) % 1440
   */
  function normalisiereMinuten(wert) {
    return ((wert % MINUTEN_PRO_TAG) + MINUTEN_PRO_TAG) % MINUTEN_PRO_TAG;
  }

  /** Wandelt 0..1439 in "HH:MM" (z.B. 487 -> "08:07"). */
  function formatZeit(minutenGesamt) {
    var stunden = Math.floor(minutenGesamt / 60);
    var minuten = minutenGesamt % 60;
    return zweiStellen(stunden) + ":" + zweiStellen(minuten);
  }

  /** Fuellt eine Zahl auf zwei Stellen mit fuehrender Null auf (7 -> "07"). */
  function zweiStellen(zahl) {
    return String(zahl).padStart(2, "0");
  }

  /** Zufaellige ganze Zahl im Bereich [min, max] (beide inklusive). */
  function zufallGanzzahl(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Aktuelle Stunde (0..23) aus dem State. */
  function aktuelleStunde() { return Math.floor(state.aktuelleMinuten / 60); }
  /** Aktuelle Minute (0..59) aus dem State. */
  function aktuelleMinute() { return state.aktuelleMinuten % 60; }


  /* 5. --------------------------------------------------------------------
     AUFBAU DES ZIFFERBLATTS (SVG)
     ----------------------------------------------------------------------- */

  var SVG_NS = "http://www.w3.org/2000/svg";

  /** Erzeugt ein SVG-Element mit Attributen (SVG braucht den Namespace). */
  function svgEl(typ, attribute) {
    var element = document.createElementNS(SVG_NS, typ);
    for (var name in attribute) { element.setAttribute(name, attribute[name]); }
    return element;
  }

  /**
   * Zeichnet die 12 Stunden-Striche und Ziffern 1..12.
   *
   * Winkel-Mathematik:
   *   - 360 Grad / 12 Stunden = 30 Grad pro Stunde.
   *   - In SVG zeigt Winkel 0 nach RECHTS und waechst im Uhrzeigersinn; damit
   *     die "12" oben steht, ziehen wir 90 Grad ab.
   *   - Grad -> Radiant: grad * PI / 180.
   *   - Punkt auf Kreis (Radius r) um Mittelpunkt (100,100):
   *         x = 100 + r * cos(winkel),  y = 100 + r * sin(winkel)
   */
  function zeichneZifferblatt() {
    for (var stunde = 1; stunde <= 12; stunde++) {
      var winkelGrad = stunde * 30 - 90;
      var winkelRad  = winkelGrad * Math.PI / 180;
      var cos = Math.cos(winkelRad);
      var sin = Math.sin(winkelRad);

      el.markierungen.appendChild(svgEl("line", {
        x1: 100 + 78 * cos, y1: 100 + 78 * sin,
        x2: 100 + 88 * cos, y2: 100 + 88 * sin,
        class: "markierung-strich" + (stunde % 3 === 0 ? " voll" : "")
      }));

      var zahl = svgEl("text", { x: 100 + 66 * cos, y: 100 + 66 * sin, class: "markierung-zahl" });
      zahl.textContent = String(stunde);
      el.markierungen.appendChild(zahl);
    }
  }


  /* 6. --------------------------------------------------------------------
     DARSTELLUNG / RENDERING
     Bringt den Bildschirm in Einklang mit dem State.
     ----------------------------------------------------------------------- */

  /**
   * Berechnet die Zeiger-Winkel und dreht die Zeiger.
   *
   * Uhren-Mathematik:
   *   MINUTENZEIGER: volle Drehung in 60 Min -> 360/60 = 6 Grad pro Minute.
   *       minutenWinkel = (aktuelleMinuten % 60) * 6
   *   STUNDENZEIGER: volle Drehung in 12 h (720 Min) -> 360/720 = 0,5 Grad/Min.
   *       stundenWinkel = (aktuelleMinuten % 720) * 0,5
   *   Der Faktor 0,5 sorgt fuer das FLIESSENDE Mitwandern: um 08:30 steht der
   *   Stundenzeiger genau zwischen 8 und 9 – wie bei einer echten Uhr.
   *
   * Die Drehung wird ueber die CSS-Eigenschaft "transform" gesetzt (siehe
   * Erklaerung im CSS): zusammen mit transform-box/-origin dreht sich der
   * Zeiger zuverlaessig um die Uhrmitte – auch auf Touch-Geraeten.
   */
  function aktualisiereUhr() {
    var minutenWinkel = (state.aktuelleMinuten % 60) * 6;
    var stundenWinkel = (state.aktuelleMinuten % 720) * 0.5;

    el.zeigerMinute.style.transform = "rotate(" + minutenWinkel + "deg)";
    el.zeigerStunde.style.transform = "rotate(" + stundenWinkel + "deg)";

    // Digitale IST-Anzeige unter der Uhr.
    el.istZeit.textContent = formatZeit(state.aktuelleMinuten);

    // Steller-Werte (zweistellig) aktualisieren.
    el.wertStunde.textContent = zweiStellen(aktuelleStunde());
    el.wertMinute.textContent = zweiStellen(aktuelleMinute());

    // Aktiven Zeiger + aktive Steller-Zeile hervorheben.
    markiereAktivenModus();
  }

  /** Hebt den aktiven Zeiger und die aktive Steller-Zeile optisch hervor. */
  function markiereAktivenModus() {
    var stundeAktiv = state.aktiverModus === "stunde";
    el.zeigerStunde.classList.toggle("aktiv", stundeAktiv);
    el.zeigerMinute.classList.toggle("aktiv", !stundeAktiv);
    el.zeileStunde.classList.toggle("aktiv", stundeAktiv);
    el.zeileMinute.classList.toggle("aktiv", !stundeAktiv);
  }

  /** Aktualisiert Top-Bar (Level, Punkte, Rekord) und die Level-Buttons. */
  function aktualisiereStatus() {
    el.level.textContent  = state.level;
    el.punkte.textContent = state.punkte;
    el.rekord.textContent = state.rekord;

    el.levelButtons.forEach(function (button) {
      button.classList.toggle("aktiv", Number(button.dataset.level) === state.level);
    });
  }


  /* 7. --------------------------------------------------------------------
     AUFGABEN-ERZEUGUNG & LEVEL-VERWALTUNG
     ----------------------------------------------------------------------- */

  /**
   * Erzeugt eine neue Zielzeit passend zum aktuellen Level.
   *   Level 1: Stunde 0..23 + Minute aus {0, 30}
   *   Level 2: Stunde 0..23 + Minute aus {0, 15, 30, 45}
   *   Level 3: irgendeine Minute aus 0..1439 (minutengenau, 24h)
   */
  function neueAufgabe() {
    var raster = LEVEL_CONFIG[state.level].minuteRaster;
    var neuesZiel;

    do {
      if (state.level === 3) {
        neuesZiel = zufallGanzzahl(0, MINUTEN_PRO_TAG - 1);
      } else {
        var stunde = zufallGanzzahl(0, 23);
        // Anzahl erlaubter Minutenwerte pro Stunde: 60 / raster
        //   L1 -> 60/30 = 2 (0,30);  L2 -> 60/15 = 4 (0,15,30,45)
        var minute = zufallGanzzahl(0, 60 / raster - 1) * raster;
        neuesZiel = stunde * 60 + minute;
      }
    } while (neuesZiel === state.zielMinuten); // keine direkte Wiederholung

    state.zielMinuten = neuesZiel;

    // Uhr auf neutralen Startwert (12:00) – das Kind stellt aktiv ein.
    state.aktuelleMinuten = 12 * 60;
    // Zu Beginn jeder Aufgabe ist die Stunde aktiv (Stunde zuerst einstellen).
    state.aktiverModus = "stunde";

    el.zielZeit.textContent = formatZeit(state.zielMinuten);
    aktualisiereUhr();
    zeigeHinweis("Stelle die Uhr auf " + formatZeit(state.zielMinuten) + ".", "");
  }

  /** Wechselt das Level, uebernimmt dessen Konfiguration, startet neue Aufgabe. */
  function setzeLevel(neuesLevel) {
    state.level = Math.max(1, Math.min(3, neuesLevel));
    aktualisiereStatus();
    neueAufgabe();
    speichereStand();
  }


  /* 8. --------------------------------------------------------------------
     STEUERUNG PER STEPPER-KNOEPFEN (Stunde/Minute GETRENNT)
     -----------------------------------------------------------------------
     Stunde und Minute werden unabhaengig voneinander veraendert. Das ist die
     entscheidende Verbesserung gegenueber "nur +/- Minuten": Eine Zielzeit wie
     18:30 ist so in wenigen Tipps erreichbar (Stunde hoch bis 18, Minute auf 30)
     statt durch dutzendfaches Minuten-Klicken.
     ----------------------------------------------------------------------- */

  /**
   * Aktiviert einen Modus ("stunde" oder "minute"): legt fest, welcher Zeiger
   * per Ziehen bewegt wird, und hebt die passende Zeile/den Zeiger hervor.
   */
  function setzeModus(modus) {
    state.aktiverModus = modus;
    markiereAktivenModus();
  }

  /**
   * Veraendert eine Zeitkomponente um +1/-1 Schritt.
   *   modus = "stunde": Stunde +/- 1, im 24h-Umlauf (23 -> 0, 0 -> 23).
   *   modus = "minute": Minute +/- minuteRaster, im 60-Min-Umlauf, OHNE die
   *                     Stunde zu veraendern (Stunde und Minute bleiben getrennt).
   */
  function aendereKomponente(modus, richtung) {
    setzeModus(modus); // der bediente Steller wird automatisch aktiv

    var stunde = aktuelleStunde();
    var minute = aktuelleMinute();

    if (modus === "stunde") {
      // (stunde + richtung + 24) % 24  -> sauberer 0..23-Umlauf
      stunde = (stunde + richtung + 24) % 24;
    } else {
      var raster = LEVEL_CONFIG[state.level].minuteRaster;
      // (minute + richtung*raster + 60) % 60 -> sauberer 0..59-Umlauf
      minute = (minute + richtung * raster + 60) % 60;
    }

    state.aktuelleMinuten = stunde * 60 + minute;
    aktualisiereUhr();
  }


  /* 9. --------------------------------------------------------------------
     STEUERUNG PER DRAG & DROP AM ZIFFERBLATT (Maus & Touch)
     -----------------------------------------------------------------------
     Pointer Events vereinheitlichen Maus, Finger und Stift in EINER API.
     Beim Druck waehlen wir den Zeiger, dessen SPITZE dem Finger am naechsten
     ist, und ziehen dann NUR diesen Zeiger. So kann nichts "wegfliegen".
     ----------------------------------------------------------------------- */

  /**
   * Rechnet eine Bildschirmposition in einen Winkel (Grad) um, gemessen von der
   * Uhrmitte, mit 0 Grad = 12-Uhr (oben), steigend im Uhrzeigersinn.
   *
   * Math.atan2(dx, -dy) liefert genau diese Orientierung:
   *   - normalerweise misst atan2(dy, dx) von der X-Achse (3-Uhr) gegen den
   *     Uhrzeigersinn; durch Vertauschen/Vorzeichen drehen wir den Nullpunkt
   *     nach oben und die Richtung in den Uhrzeigersinn.
   */
  function positionZuWinkel(clientX, clientY) {
    var r = el.svg.getBoundingClientRect();
    var mitteX = r.left + r.width  / 2;
    var mitteY = r.top  + r.height / 2;
    var dx = clientX - mitteX;
    var dy = clientY - mitteY;
    var winkel = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (winkel < 0) { winkel += 360; }
    return winkel;
  }

  /**
   * Liefert die Bildschirm-Koordinaten der Spitze eines Zeigers. Wird benoetigt,
   * um beim Antippen den naechstgelegenen Zeiger zu bestimmen.
   *
   * Spitze in viewBox-Koordinaten (Laenge len ab Mitte, Winkel des Zeigers):
   *     x = 100 + len * sin(winkel),  y = 100 - len * cos(winkel)
   * Danach rechnen wir viewBox (0..200) auf die echte Pixelgroesse um.
   */
  function zeigerSpitze(modus) {
    var winkelGrad = (modus === "minute")
      ? (state.aktuelleMinuten % 60) * 6
      : (state.aktuelleMinuten % 720) * 0.5;
    var rad = winkelGrad * Math.PI / 180;
    var len = (modus === "minute") ? 70 : 48; // Zeigerlaengen in viewBox-Einheiten

    var vbX = 100 + len * Math.sin(rad);
    var vbY = 100 - len * Math.cos(rad);

    var r = el.svg.getBoundingClientRect();
    return {
      x: r.left + (vbX / 200) * r.width,
      y: r.top  + (vbY / 200) * r.height
    };
  }

  /**
   * Abstand eines Punktes (px,py) zur Strecke A->B (Zeiger als Linie).
   * Wir projizieren den Punkt auf die Strecke (Parameter t, auf 0..1 begrenzt)
   * und messen den Abstand zur Projektion. So zaehlt nicht nur die Spitze,
   * sondern der ganze Zeiger-Strahl als "greifbar".
   */
  function abstandZuStrecke(px, py, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y;
    var wx = px - a.x,  wy = py - a.y;
    var laengeQuadrat = vx * vx + vy * vy;
    // t = Projektion von w auf v, geteilt durch |v|^2 (auf [0,1] geklemmt).
    var t = laengeQuadrat > 0 ? (wx * vx + wy * vy) / laengeQuadrat : 0;
    t = Math.max(0, Math.min(1, t));
    var projX = a.x + t * vx, projY = a.y + t * vy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
  }

  /**
   * Entscheidet beim Antippen, ob (und auf welchen) Zeiger umgeschaltet wird.
   *
   * Idee: Liegt der Druck EINDEUTIG nahe an einem Zeiger, greift man diesen.
   * Liegt er irgendwo im freien Bereich (z.B. am Rand oder in der Mitte), bleibt
   * der zuvor per Steller gewaehlte aktive Zeiger erhalten – und wird beim
   * Ziehen dorthin bewegt. Das verhindert, dass eine Beruehrung in der Mitte
   * ungewollt den Zeiger wechselt.
   *
   * Rueckgabe: "minute" / "stunde" (umschalten) oder null (aktiven Modus behalten).
   */
  function bestimmeZeigerBeiDruck(px, py) {
    var r = el.svg.getBoundingClientRect();
    var mitte = { x: r.left + r.width / 2, y: r.top + r.height / 2 };

    var dMinute = abstandZuStrecke(px, py, mitte, zeigerSpitze("minute"));
    var dStunde = abstandZuStrecke(px, py, mitte, zeigerSpitze("stunde"));

    var schwelle = r.width * 0.16;            // "nahe an einem Zeiger"
    if (Math.min(dMinute, dStunde) > schwelle) { return null; }        // zu weit weg
    if (Math.abs(dMinute - dStunde) < r.width * 0.05) { return null; } // zu mehrdeutig
    return dMinute < dStunde ? "minute" : "stunde";
  }

  /**
   * Verarbeitet eine Zieh-Position: bewegt NUR den aktiven Zeiger.
   *
   *   MINUTE aktiv: winkel -> Minute (0..59), magnetisch auf das Level-Raster
   *                 eingerastet. Die Stunde bleibt erhalten.
   *       minute = round(winkel / 6)            (6 Grad pro Minute)
   *   STUNDE aktiv: winkel -> Position auf dem 12er-Blatt (0..11). Die aktuelle
   *                 Tageshaelfte (vormittags 0..11 / nachmittags 12..23) bleibt
   *                 erhalten; zwischen den Haelften wechselt man bequem mit den
   *                 Stunden-Knoepfen.
   *       pos = round(winkel / 30)              (30 Grad pro Stunde)
   */
  function verarbeiteZiehen(clientX, clientY) {
    var winkel = positionZuWinkel(clientX, clientY);
    var stunde = aktuelleStunde();
    var minute = aktuelleMinute();

    if (state.aktiverModus === "minute") {
      var rohMinute = Math.round(winkel / 6) % 60;
      minute = rasteMinuteEin(rohMinute);
    } else {
      var pos = Math.round(winkel / 30) % 12;       // 0 = 12-Uhr-Position
      var haelfte = (stunde >= 12) ? 12 : 0;        // aktuelle Tageshaelfte
      stunde = haelfte + pos;                       // 0..23
    }

    state.aktuelleMinuten = normalisiereMinuten(stunde * 60 + minute);
    aktualisiereUhr();
  }

  /**
   * Rastet eine Minute (0..59) magnetisch auf das Level-Raster ein.
   *   L1 -> 0/30, L2 -> 0/15/30/45, L3 -> jede Minute.
   * round(minute / raster) * raster, danach sauber in 0..59 halten.
   */
  function rasteMinuteEin(minute) {
    var raster = LEVEL_CONFIG[state.level].minuteRaster;
    var gerundet = Math.round(minute / raster) * raster;
    return ((gerundet % 60) + 60) % 60;
  }

  // --- Event-Handler fuers Ziehen ---

  function aufZeigerDruck(ereignis) {
    ereignis.preventDefault();
    state.istAmZiehen = true;

    // Nur umschalten, wenn der Druck eindeutig nahe an einem Zeiger liegt –
    // sonst bleibt der aktive (per Steller gewaehlte) Zeiger erhalten.
    var gewaehlt = bestimmeZeigerBeiDruck(ereignis.clientX, ereignis.clientY);
    if (gewaehlt) { setzeModus(gewaehlt); }

    // ... weiche Animation abschalten (Zeiger folgt sofort) ...
    el.svg.classList.add("wird-gezogen");

    // ... und alle weiteren Bewegungen an die Uhr "fesseln" (auch ausserhalb).
    if (el.svg.setPointerCapture) {
      try { el.svg.setPointerCapture(ereignis.pointerId); } catch (e) { /* egal */ }
    }
    verarbeiteZiehen(ereignis.clientX, ereignis.clientY);
  }

  function aufZeigerBewegung(ereignis) {
    if (!state.istAmZiehen) { return; }
    ereignis.preventDefault();
    verarbeiteZiehen(ereignis.clientX, ereignis.clientY);
  }

  function aufZeigerLoslassen() {
    state.istAmZiehen = false;
    el.svg.classList.remove("wird-gezogen");
  }


  /* 10. -------------------------------------------------------------------
     PRUEFUNG "ABFAHRT!" + FEEDBACK
     ----------------------------------------------------------------------- */

  /** Vergleicht eingestellte Zeit mit Zielzeit. Kein Game Over – beliebig oft. */
  function pruefeAbfahrt() {
    if (state.aktuelleMinuten === state.zielMinuten) {
      // ---- RICHTIG ----
      state.punkte += 1;
      if (state.punkte > state.rekord) { state.rekord = state.punkte; }

      zeigeHinweis("Super! Der Zeitreise-Express faehrt ab! 🎉", "erfolg");
      spielKlang("erfolg");
      starteErfolgsAnimation();

      // Automatischer Aufstieg: 3 Punkte -> L2, 6 Punkte -> L3 (max. L3).
      var gewuenschtesLevel = Math.min(3, Math.floor(state.punkte / AUFSTIEG_NACH) + 1);

      aktualisiereStatus();
      speichereStand();

      // Kurz warten (Animation sichtbar), dann naechste Aufgabe/Epoche.
      window.setTimeout(function () {
        if (gewuenschtesLevel !== state.level) {
          setzeLevel(gewuenschtesLevel);
          zeigeHinweis("Neue Epoche! Willkommen in Stufe " + state.level + ". 🚀", "erfolg");
        } else {
          neueAufgabe();
        }
      }, 1100);

    } else {
      // ---- FALSCH ---- (sanftes, ermutigendes Feedback)
      zeigeHinweis(FEHLER_TIPPS[zufallGanzzahl(0, FEHLER_TIPPS.length - 1)], "fehler");
      spielKlang("fehler");
      starteSchuettelAnimation();
    }
  }

  /** Setzt Hinweistext und Farbklasse ("erfolg", "fehler" oder ""). */
  function zeigeHinweis(text, art) {
    el.hinweis.textContent = text;
    el.hinweis.className = "hinweis" + (art ? " " + art : "");
  }

  /** Gruene Erfolgs-Animation + abfahrender Zug. */
  function starteErfolgsAnimation() {
    el.svg.classList.add("erfolg");
    el.zug.classList.add("faehrt");
    window.setTimeout(function () {
      el.svg.classList.remove("erfolg");
      el.zug.classList.remove("faehrt");
    }, 1000);
  }

  /** Kurzes Schuetteln der Uhr bei falscher Antwort. */
  function starteSchuettelAnimation() {
    el.svg.classList.add("schuetteln");
    window.setTimeout(function () { el.svg.classList.remove("schuetteln"); }, 500);
  }


  /* 11. -------------------------------------------------------------------
     ZUSATZ-APIs: SPRACHAUSGABE, SOUNDEFFEKTE, SPEICHERN
     Alle rein browser-nativ, mit Schutzabfragen fuer aeltere Browser.
     ----------------------------------------------------------------------- */

  /* --- 11a) SPRACHAUSGABE (Web Speech API) --- */

  /** Liest einen deutschen Text vor (falls der Browser es unterstuetzt). */
  function sprich(text) {
    if (!("speechSynthesis" in window)) { return; }
    window.speechSynthesis.cancel(); // laufende Ausgabe stoppen
    var aeusserung = new SpeechSynthesisUtterance(text);
    aeusserung.lang = "de-DE";
    aeusserung.rate = 0.9;           // etwas langsamer – kindgerecht
    window.speechSynthesis.speak(aeusserung);
  }

  /** Wandelt eine Zielzeit in einen vorlesbaren Satz, z.B. "acht Uhr dreissig". */
  function zeitInWorten(minutenGesamt) {
    var stunde = Math.floor(minutenGesamt / 60);
    var minute = minutenGesamt % 60;
    var satz = zahlInWorten(stunde) + " Uhr";
    if (minute > 0) { satz += " " + zahlInWorten(minute); }
    return satz;
  }

  /**
   * Deutsches Zahlwort fuer 0..59.
   * Deutsche Zahlen 21..59: Einer + "und" + Zehner (21 = "einundzwanzig").
   */
  function zahlInWorten(n) {
    var einer = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs",
                 "sieben", "acht", "neun", "zehn", "elf", "zwoelf", "dreizehn",
                 "vierzehn", "fuenfzehn", "sechzehn", "siebzehn", "achtzehn",
                 "neunzehn"];
    var zehner = ["", "", "zwanzig", "dreissig", "vierzig", "fuenfzig"];
    if (n < 20) { return einer[n]; }
    var z = Math.floor(n / 10), e = n % 10;
    if (e === 0) { return zehner[z]; }
    return einer[e] + "und" + zehner[z];
  }


  /* --- 11b) SOUNDEFFEKTE (Web Audio API) --- */

  // Erst bei der ersten Nutzer-Interaktion erzeugen (Autoplay-Policy).
  var audioContext = null;

  function holeAudioContext() {
    if (audioContext === null) {
      var AudioKlasse = window.AudioContext || window.webkitAudioContext;
      if (AudioKlasse) { audioContext = new AudioKlasse(); }
    }
    if (audioContext && audioContext.state === "suspended") { audioContext.resume(); }
    return audioContext;
  }

  /**
   * Spielt einen kurzen Ton. "erfolg" = froehlicher aufsteigender Dreiklang,
   * "fehler" = einzelner sanfter tiefer Ton (kein harter "Buzzer").
   * Erzeugt mit Oszillator + Lautstaerke-Huellkurve (Fade-out).
   */
  function spielKlang(typ) {
    var ctx = holeAudioContext();
    if (!ctx) { return; }

    var erfolgsToene = [523.25, 659.25, 783.99]; // C5, E5, G5
    var fehlerToene  = [196.00];                  // tiefes G3
    var toene = (typ === "erfolg") ? erfolgsToene : fehlerToene;

    toene.forEach(function (frequenz, index) {
      var oszillator  = ctx.createOscillator();
      var verstaerker = ctx.createGain();

      oszillator.type = (typ === "erfolg") ? "triangle" : "sine";
      oszillator.frequency.value = frequenz;

      var start = ctx.currentTime + index * 0.12; // Arpeggio-Versatz
      var dauer = 0.22;

      verstaerker.gain.setValueAtTime(0.0001, start);
      verstaerker.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      verstaerker.gain.exponentialRampToValueAtTime(0.0001, start + dauer);

      oszillator.connect(verstaerker);
      verstaerker.connect(ctx.destination);
      oszillator.start(start);
      oszillator.stop(start + dauer);
    });
  }


  /* --- 11c) SPEICHERN / LADEN (localStorage) --- */

  /** Speichert Level, Punkte und Rekord (try/catch schuetzt vor Blockaden). */
  function speichereStand() {
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({
        level: state.level, punkte: state.punkte, rekord: state.rekord
      }));
    } catch (fehler) { /* Persistenz ist optional */ }
  }

  /** Laedt einen gespeicherten Stand (falls vorhanden) vorsichtig in den State. */
  function ladeStand() {
    try {
      var roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { return; }
      var daten = JSON.parse(roh);
      if (typeof daten.level  === "number") { state.level  = Math.max(1, Math.min(3, daten.level)); }
      if (typeof daten.punkte === "number") { state.punkte = Math.max(0, daten.punkte); }
      if (typeof daten.rekord === "number") { state.rekord = Math.max(0, daten.rekord); }
    } catch (fehler) { /* beschaedigte Daten ignorieren */ }
  }


  /* 12. -------------------------------------------------------------------
     MOBIL-ERKENNUNG + EVENT-VERDRAHTUNG + SPIELSTART
     ----------------------------------------------------------------------- */

  /**
   * Erkennt Touch-/Handy-Nutzung und setzt entsprechende Klassen am <body>.
   * Damit kann das Spiel gezielt mobil-optimiert reagieren (zusaetzlich zu den
   * CSS-Media-Queries). "pointer: coarse" trifft Finger-/Touch-Bedienung,
   * maxTouchPoints erkennt Touch-Hardware.
   */
  function erkenneGeraet() {
    var istTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
                || ("ontouchstart" in window)
                || (navigator.maxTouchPoints > 0);
    // Als "Handy" werten wir schmale Bildschirme.
    var istHandy = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;

    document.body.classList.toggle("ist-touch", !!istTouch);
    document.body.classList.toggle("ist-handy", !!istHandy);
  }

  function verbindeEvents() {
    // --- Stepper-Knoepfe (Stunde/Minute getrennt) ---
    el.stepperBtns.forEach(function (button) {
      button.addEventListener("click", function () {
        aendereKomponente(button.dataset.modus, Number(button.dataset.richtung));
      });
    });

    // --- Tippen auf den Wert-Bereich aktiviert den jeweiligen Modus ---
    // (so legt man fest, welcher Zeiger beim Ziehen am Zifferblatt reagiert)
    el.stepperMitte.forEach(function (mitte) {
      mitte.addEventListener("click", function () { setzeModus(mitte.dataset.modus); });
    });

    // --- Abfahrt-Pruefung ---
    el.abfahrt.addEventListener("click", pruefeAbfahrt);

    // --- Vorlese-Button (Sprachausgabe) ---
    el.vorlesen.addEventListener("click", function () {
      sprich("Die Abfahrtszeit ist " + zeitInWorten(state.zielMinuten));
    });

    // --- Level-Auswahl ---
    el.levelButtons.forEach(function (button) {
      button.addEventListener("click", function () { setzeLevel(Number(button.dataset.level)); });
    });

    // --- Drag & Drop am Zifferblatt (Maus + Touch via Pointer Events) ---
    el.svg.addEventListener("pointerdown", aufZeigerDruck);
    el.svg.addEventListener("pointermove", aufZeigerBewegung);
    el.svg.addEventListener("pointerup", aufZeigerLoslassen);
    el.svg.addEventListener("pointercancel", aufZeigerLoslassen);

    // --- Tastatur-Komfort (fuer Laptop/Desktop) ---
    document.addEventListener("keydown", function (ereignis) {
      // Links/Rechts wechselt den aktiven Steller, Hoch/Runter veraendert ihn.
      if (ereignis.key === "ArrowLeft")  { setzeModus("stunde"); }
      if (ereignis.key === "ArrowRight") { setzeModus("minute"); }
      if (ereignis.key === "ArrowUp")    { aendereKomponente(state.aktiverModus, +1); }
      if (ereignis.key === "ArrowDown")  { aendereKomponente(state.aktiverModus, -1); }
      if ((ereignis.key === "Enter" || ereignis.key === " ") &&
          document.activeElement === document.body) {
        ereignis.preventDefault();
        pruefeAbfahrt();
      }
    });

    // Bei Bildschirmdrehung/Groessenaenderung die Geraete-Erkennung auffrischen.
    window.addEventListener("resize", erkenneGeraet);
  }

  /** Startpunkt: einmalig beim Laden. */
  function start() {
    erkenneGeraet();        // Touch/Handy erkennen
    zeichneZifferblatt();   // SVG-Zifferblatt aufbauen
    ladeStand();            // ggf. gespeicherten Fortschritt holen
    verbindeEvents();       // Interaktionen aktivieren

    aktualisiereStatus();
    neueAufgabe();          // erste Aufgabe + Uhr rendern
  }

  // DOM ist am Skript-Ende geladen; zur Sicherheit dennoch absichern.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
