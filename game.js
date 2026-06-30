/* ===========================================================================
   Uhrzeit-Uhu: Der Zeitreisen-Express  –  Spiellogik (game.js)
   ---------------------------------------------------------------------------
   Reines Vanilla JavaScript (ES6+), keine externen Bibliotheken.

   INHALTSVERZEICHNIS
     0. "use strict" + IIFE-Kapselung
     1. Konstanten & Konfiguration
     2. Der zentrale Spielzustand (State)
     3. Referenzen auf HTML-Elemente
     4. Hilfsfunktionen (Zeit-Mathematik & Formatierung)
     5. Aufbau des Zifferblatts (SVG)
     6. Darstellung / Rendering (Zeiger drehen, Anzeigen aktualisieren)
     7. Aufgaben-Erzeugung & Level-Verwaltung
     8. Steuerung per Buttons (+/- Minuten)
     9. Steuerung per Drag & Drop (Maus & Touch)
    10. Pruefung "Abfahrt!" + Feedback
    11. Zusatz-APIs: Sprachausgabe, Soundeffekte, Speichern (localStorage)
    12. Verdrahtung der Events + Spielstart
   ===========================================================================*/

/* 0. ----------------------------------------------------------------------
   "use strict" aktiviert den strikten Modus -> Tippfehler (z.B. Zugriff auf
   nicht deklarierte Variablen) werfen sofort einen Fehler statt still zu
   scheitern. Die gesamte Logik liegt in einer IIFE (sofort ausgefuehrte
   Funktion), damit keine globalen Variablen "auslaufen" und mit anderem
   Code kollidieren koennen.
   ------------------------------------------------------------------------- */
(function () {
  "use strict";


  /* 1. --------------------------------------------------------------------
     KONSTANTEN & KONFIGURATION
     ----------------------------------------------------------------------- */

  // Ein voller Tag hat 24 * 60 = 1440 Minuten. Die Spielzeit laeuft daher
  // immer im Bereich 0 (00:00) bis 1439 (23:59).
  var MINUTEN_PRO_TAG = 1440;

  // Pro Level legen wir fest:
  //   raster: Auf welches Minuten-Raster die Zielzeiten und das magnetische
  //           Einrasten beim Ziehen gerundet werden.
  //   schritt: Wie viele Minuten ein Klick auf +/- veraendert.
  //   name:   Anzeigetext.
  var LEVEL_CONFIG = {
    1: { raster: 30, schritt: 5, name: "Volle & halbe Stunden" }, // 00 oder 30
    2: { raster: 15, schritt: 5, name: "Viertelstunden" },        // 00/15/30/45
    3: { raster: 1,  schritt: 1, name: "Minutengenau (24h)" }     // jede Minute
  };

  // Punkte, ab denen automatisch ins naechste Level aufgestiegen wird.
  // (3 richtige Abfahrten pro Level, bis Level 3 erreicht ist.)
  var AUFSTIEG_NACH = 3;

  // Schluessel, unter dem der Spielstand im Browser gespeichert wird.
  var SPEICHER_SCHLUESSEL = "uhrzeit-uhu-state";

  // Freundliche Hinweistexte bei falscher Eingabe (zufaellig ausgewaehlt).
  var FEHLER_TIPPS = [
    "Fast! Schau noch einmal genau auf den Minutenzeiger.",
    "Noch nicht ganz. Probiere es ruhig weiter – du schaffst das!",
    "Knapp daneben. Vergleiche die beiden Zeiten Ziffer fuer Ziffer.",
    "Hoppla, der Uhu wartet noch. Stelle die Zeiger neu ein."
  ];


  /* 2. --------------------------------------------------------------------
     DER ZENTRALE SPIELZUSTAND (State)
     -----------------------------------------------------------------------
     Alle veraenderlichen Werte des Spiels stehen in EINEM Objekt. Das ist
     das Herzstueck der State-Verwaltung: Statt Daten ueber viele Variablen
     zu verstreuen, gibt es eine einzige "Quelle der Wahrheit". Jede Aktion
     veraendert nur dieses Objekt und ruft danach die Render-Funktion auf,
     die den Bildschirm an den neuen Zustand anpasst.

       aktuelleMinuten : aktuell auf der Uhr eingestellte Zeit (0..1439)
       zielMinuten     : die geforderte Abfahrtszeit               (0..1439)
       level           : aktuelle Stufe (1, 2 oder 3)
       punkte          : Punktestand der laufenden Sitzung
       rekord          : hoechster je erreichter Punktestand (gespeichert)
       schrittweite    : aktuelle +/- Schrittgroesse (aus LEVEL_CONFIG)
     ----------------------------------------------------------------------- */
  var state = {
    aktuelleMinuten: 8 * 60,   // Start: 08:00
    zielMinuten:     8 * 60,
    level:           1,
    punkte:          0,
    rekord:          0,
    schrittweite:    5
  };


  /* 3. --------------------------------------------------------------------
     REFERENZEN AUF HTML-ELEMENTE
     Wir holen alle benoetigten Elemente EINMAL und merken sie uns. Das ist
     schneller und uebersichtlicher, als sie staendig neu zu suchen.
     ----------------------------------------------------------------------- */
  var el = {
    // Top-Bar
    level:   document.getElementById("anzeige-level"),
    punkte:  document.getElementById("anzeige-punkte"),
    rekord:  document.getElementById("anzeige-rekord"),
    levelButtons: document.querySelectorAll(".level-button"),

    // Fahrplan
    zielZeit:    document.getElementById("anzeige-ziel"),
    auftrag:     document.getElementById("auftrag-text"),
    vorlesen:    document.getElementById("button-vorlesen"),
    zug:         document.getElementById("szene-zug"),

    // Uhr
    svg:          document.getElementById("uhr-svg"),
    zeigerStunde: document.getElementById("zeiger-stunde"),
    zeigerMinute: document.getElementById("zeiger-minute"),
    markierungen: document.getElementById("zifferblatt-markierungen"),
    istZeit:      document.getElementById("anzeige-ist"),

    // Steuerung
    minus:      document.getElementById("button-minus"),
    plus:       document.getElementById("button-plus"),
    labelMinus: document.getElementById("label-minus"),
    labelPlus:  document.getElementById("label-plus"),
    abfahrt:    document.getElementById("button-abfahrt"),
    hinweis:    document.getElementById("hinweis-text")
  };


  /* 4. --------------------------------------------------------------------
     HILFSFUNKTIONEN: ZEIT-MATHEMATIK & FORMATIERUNG
     ----------------------------------------------------------------------- */

  /**
   * Begrenzt einen Minutenwert sauber auf den Bereich 0..1439.
   * Beispiel: -5 wird zu 1435 (= 23:55), 1445 wird zu 5 (= 00:05).
   *
   * Mathematik dahinter (Modulo-Rechnung):
   *   ((wert % 1440) + 1440) % 1440
   * Das doppelte Modulo sorgt dafuer, dass auch NEGATIVE Werte korrekt
   * "umlaufen" – in JavaScript liefert (-5 % 1440) naemlich -5, was wir
   * durch +1440 und erneutes Modulo in den positiven Bereich holen.
   */
  function normalisiereMinuten(wert) {
    return ((wert % MINUTEN_PRO_TAG) + MINUTEN_PRO_TAG) % MINUTEN_PRO_TAG;
  }

  /**
   * Wandelt eine Minutenzahl (0..1439) in einen "HH:MM"-Text um.
   * z.B. 487 -> "08:07".  padStart(2, "0") fuellt mit fuehrender Null auf.
   */
  function formatZeit(minutenGesamt) {
    var stunden = Math.floor(minutenGesamt / 60);   // ganze Stunden
    var minuten = minutenGesamt % 60;               // Restminuten
    return String(stunden).padStart(2, "0") + ":" + String(minuten).padStart(2, "0");
  }

  /**
   * Liefert eine zufaellige ganze Zahl im Bereich [min, max] (beide inklusive).
   * Wird zum Erzeugen neuer Aufgaben benoetigt.
   */
  function zufallGanzzahl(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }


  /* 5. --------------------------------------------------------------------
     AUFBAU DES ZIFFERBLATTS (SVG)
     Wir erzeugen die 12 Stundenmarkierungen und Ziffern einmalig per Code,
     damit das HTML schlank bleibt. Gerechnet wird mit Winkeln und Sinus/Kosinus.
     ----------------------------------------------------------------------- */

  // Kleiner Helfer, um SVG-Elemente korrekt zu erzeugen. SVG-Tags brauchen
  // einen speziellen Namensraum (Namespace) – mit document.createElement
  // allein wuerden sie NICHT dargestellt.
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(typ, attribute) {
    var element = document.createElementNS(SVG_NS, typ);
    for (var name in attribute) {
      element.setAttribute(name, attribute[name]);
    }
    return element;
  }

  /**
   * Zeichnet die 12 Stunden-Striche und die Ziffern 1..12.
   *
   * Winkel-Mathematik:
   *   - Der Vollkreis hat 360 Grad, 12 Stunden -> 30 Grad pro Stunde.
   *   - In SVG zeigt der Winkel 0 nach RECHTS (3-Uhr-Position) und waechst
   *     im Uhrzeigersinn nach unten. Damit die "12" oben steht, ziehen wir
   *     90 Grad ab (-90).
   *   - Umrechnung Grad -> Radiant (fuer Math.cos/Math.sin): grad * PI / 180.
   *   - Position auf einem Kreis mit Radius r um den Mittelpunkt (100,100):
   *         x = 100 + r * cos(winkel)
   *         y = 100 + r * sin(winkel)
   */
  function zeichneZifferblatt() {
    for (var stunde = 1; stunde <= 12; stunde++) {
      var winkelGrad = stunde * 30 - 90;                 // 30 Grad je Stunde, oben = 12
      var winkelRad  = winkelGrad * Math.PI / 180;       // in Radiant umrechnen
      var cos = Math.cos(winkelRad);
      var sin = Math.sin(winkelRad);

      // (a) Markierungsstrich: von Radius 78 bis 88 nach aussen.
      var strich = svgEl("line", {
        x1: 100 + 78 * cos, y1: 100 + 78 * sin,
        x2: 100 + 88 * cos, y2: 100 + 88 * sin,
        // Die "Haupt"-Stunden 3,6,9,12 bekommen einen dickeren Strich.
        class: "markierung-strich" + (stunde % 3 === 0 ? " voll" : "")
      });
      el.markierungen.appendChild(strich);

      // (b) Stundenziffer: etwas weiter innen (Radius 66).
      var zahl = svgEl("text", {
        x: 100 + 66 * cos,
        y: 100 + 66 * sin,
        class: "markierung-zahl"
      });
      zahl.textContent = String(stunde);
      el.markierungen.appendChild(zahl);
    }
  }


  /* 6. --------------------------------------------------------------------
     DARSTELLUNG / RENDERING
     Diese Funktion bringt den Bildschirm in Einklang mit dem State. Sie wird
     nach JEDER Zustandsaenderung aufgerufen ("ein Ort, der alles aktualisiert").
     ----------------------------------------------------------------------- */

  /**
   * Berechnet die Zeiger-Winkel aus der aktuellen Zeit und dreht die SVG-Zeiger.
   *
   * Die zentrale Uhren-Mathematik:
   *   MINUTENZEIGER:
   *     Er macht in 60 Minuten eine volle 360-Grad-Drehung.
   *     -> 360 / 60 = 6 Grad pro Minute.
   *     minutenWinkel = (aktuelleMinuten % 60) * 6
   *
   *   STUNDENZEIGER (bewegt sich FLIESSEND mit):
   *     Er macht in 12 Stunden (= 720 Minuten) eine volle 360-Grad-Drehung.
   *     -> 360 / 720 = 0,5 Grad pro Minute.
   *     stundenWinkel = (aktuelleMinuten % 720) * 0,5
   *     Dadurch steht der Stundenzeiger z.B. um 08:30 genau zwischen 8 und 9
   *     – wie bei einer echten Uhr.
   *
   * Da die Zeiger im HTML bereits nach OBEN (12-Uhr) zeigen, entspricht der
   * berechnete Winkel direkt der noetigen Drehung im Uhrzeigersinn.
   */
  function aktualisiereUhr() {
    var minutenWinkel = (state.aktuelleMinuten % 60) * 6;
    var stundenWinkel = (state.aktuelleMinuten % 720) * 0.5;

    // rotate(grad, drehpunktX, drehpunktY) dreht um den Uhr-Mittelpunkt (100,100).
    el.zeigerMinute.setAttribute("transform", "rotate(" + minutenWinkel + " 100 100)");
    el.zeigerStunde.setAttribute("transform", "rotate(" + stundenWinkel + " 100 100)");

    // Die digitale IST-Anzeige unter der Uhr mitfuehren.
    el.istZeit.textContent = formatZeit(state.aktuelleMinuten);
  }

  /**
   * Aktualisiert die Top-Bar (Level, Punkte, Rekord) und die Button-Beschriftungen.
   */
  function aktualisiereStatus() {
    el.level.textContent  = state.level;
    el.punkte.textContent = state.punkte;
    el.rekord.textContent = state.rekord;

    // Button-Labels an die aktuelle Schrittweite anpassen.
    el.labelMinus.textContent = state.schrittweite + " Minuten";
    el.labelPlus.textContent  = state.schrittweite + " Minuten";

    // Das aktive Level optisch hervorheben.
    el.levelButtons.forEach(function (button) {
      var istAktiv = Number(button.dataset.level) === state.level;
      button.classList.toggle("aktiv", istAktiv);
    });
  }


  /* 7. --------------------------------------------------------------------
     AUFGABEN-ERZEUGUNG & LEVEL-VERWALTUNG
     ----------------------------------------------------------------------- */

  /**
   * Erzeugt eine neue Zielzeit passend zum uebergebenen/aktuellen Level.
   *
   * Vorgehen je Level:
   *   Level 1: Stunde 0..23 + Minute aus {0, 30}.
   *   Level 2: Stunde 0..23 + Minute aus {0, 15, 30, 45}.
   *   Level 3: irgendeine Minute aus 0..1439 (volles 24h-Format, minutengenau).
   *
   * Damit die Aufgabe nicht zufaellig gleich der bereits eingestellten Zeit
   * ist, wiederholen wir die Ziehung notfalls.
   */
  function neueAufgabe() {
    var raster = LEVEL_CONFIG[state.level].raster;
    var neuesZiel;

    do {
      if (state.level === 3) {
        // Minutengenau: jede der 1440 Minuten ist moeglich.
        neuesZiel = zufallGanzzahl(0, MINUTEN_PRO_TAG - 1);
      } else {
        // Level 1 & 2: zufaellige Stunde + ein erlaubter Minutenwert.
        var stunde = zufallGanzzahl(0, 23);
        // Anzahl moeglicher Rasterschritte innerhalb einer Stunde:
        //   Level 1 -> raster 30 -> 60/30 = 2 Werte (0, 30)
        //   Level 2 -> raster 15 -> 60/15 = 4 Werte (0,15,30,45)
        var minuteSchritt = zufallGanzzahl(0, 60 / raster - 1);
        neuesZiel = stunde * 60 + minuteSchritt * raster;
      }
    } while (neuesZiel === state.zielMinuten); // keine identische Wiederholung

    state.zielMinuten = neuesZiel;

    // Die Uhr selbst stellen wir bewusst NICHT auf die Loesung, sondern auf
    // einen neutralen Startwert (volle Stunde 12:00), damit das Kind die
    // Zeiger aktiv einstellen muss.
    state.aktuelleMinuten = 12 * 60;

    // Bildschirm aktualisieren.
    el.zielZeit.textContent = formatZeit(state.zielMinuten);
    aktualisiereUhr();
    zeigeHinweis("Stelle die Uhr auf " + formatZeit(state.zielMinuten) + ".", "");
  }

  /**
   * Wechselt das Level, uebernimmt dessen Konfiguration und startet eine
   * neue Aufgabe. Wird sowohl von den Level-Buttons als auch beim
   * automatischen Aufstieg verwendet.
   */
  function setzeLevel(neuesLevel) {
    // Sicherheitshalber auf gueltigen Bereich 1..3 begrenzen.
    state.level = Math.max(1, Math.min(3, neuesLevel));
    state.schrittweite = LEVEL_CONFIG[state.level].schritt;

    aktualisiereStatus();
    neueAufgabe();
    speichereStand();
  }


  /* 8. --------------------------------------------------------------------
     STEUERUNG PER BUTTONS (+/- Minuten)
     ----------------------------------------------------------------------- */

  /**
   * Veraendert die eingestellte Zeit um +/- die aktuelle Schrittweite.
   * "richtung" ist +1 (plus) oder -1 (minus).
   *
   * Die Modulo-Logik in normalisiereMinuten() sorgt fuer einen sauberen
   * 24-Stunden-Umlauf: von 23:55 +5 Min -> 00:00, von 00:00 -5 Min -> 23:55.
   */
  function aendereZeit(richtung) {
    var neu = state.aktuelleMinuten + richtung * state.schrittweite;
    state.aktuelleMinuten = normalisiereMinuten(neu);
    aktualisiereUhr();
  }


  /* 9. --------------------------------------------------------------------
     STEUERUNG PER DRAG & DROP (Maus & Touch ueber Pointer Events)
     -----------------------------------------------------------------------
     Pointer Events vereinheitlichen Maus, Finger und Stift in EINER API –
     so muessen wir Touch und Maus nicht getrennt behandeln.

     Idee:
       1. Beim Druck auf die Uhr stellen wir fest, welcher Zeiger gemeint ist
          (Minute oder Stunde) – je nachdem, ob der Klick eher am langen oder
          kurzen Zeiger liegt.
       2. Waehrend der Bewegung berechnen wir aus der Cursor-/Finger-Position
          relativ zum Uhr-Mittelpunkt den Winkel (Math.atan2) und rechnen ihn
          in Minuten um.
       3. Der Wert rastet magnetisch auf das Level-Raster ein.
     ----------------------------------------------------------------------- */

  // Merkt sich, welcher Zeiger gerade gezogen wird: "minute", "stunde" oder null.
  var aktiverZeiger = null;

  /**
   * Rechnet eine Bildschirm-Position (clientX/clientY) in einen Winkel in Grad
   * um, gemessen vom Uhr-Mittelpunkt aus, wobei 0 Grad = 12-Uhr-Position (oben)
   * und im Uhrzeigersinn ansteigend.
   *
   * Math.atan2(dy, dx) liefert den Winkel des Punktes (dx, dy) zur X-Achse im
   * Bereich -180..+180 Grad. Da bei uns 0 nach OBEN zeigen soll (statt nach
   * rechts) und im Uhrzeigersinn laufen soll, vertauschen/justieren wir die
   * Argumente: atan2(dx, -dy) liefert genau diese gedrehte Orientierung.
   */
  function positionZuWinkel(clientX, clientY) {
    var rechteck = el.svg.getBoundingClientRect();
    // Mittelpunkt der Uhr in Bildschirmkoordinaten.
    var mitteX = rechteck.left + rechteck.width / 2;
    var mitteY = rechteck.top + rechteck.height / 2;

    var dx = clientX - mitteX;
    var dy = clientY - mitteY;

    // atan2(dx, -dy): 0 Grad oben, 90 Grad rechts, 180 unten, 270 links.
    var winkel = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (winkel < 0) { winkel += 360; }   // in den Bereich 0..360 bringen
    return winkel;
  }

  /**
   * Verarbeitet eine Zieh-Position: wandelt sie in eine Zeit um und rastet ein.
   *
   * - Wird der MINUTENZEIGER gezogen, bestimmt der Winkel die Minute (0..59):
   *       minute = winkel / 6        (denn 6 Grad pro Minute)
   *   Die Stunde bleibt erhalten. Anschliessend rasten wir minutengenau bzw.
   *   auf das Level-Raster ein.
   *
   * - Wird der STUNDENZEIGER gezogen, bestimmt der Winkel die Stunde innerhalb
   *   eines 12-Stunden-Zifferblatts:
   *       stunde12 = winkel / 30     (30 Grad pro Stunde)
   *   Wir behalten dabei die Vormittag/Nachmittag-Haelfte (AM/PM) bei, damit
   *   sich die 24h-Zuordnung nicht unbeabsichtigt umdreht.
   */
  function verarbeiteZiehen(clientX, clientY) {
    var winkel = positionZuWinkel(clientX, clientY);

    if (aktiverZeiger === "minute") {
      // Winkel -> Minute (0..59), kaufmaennisch gerundet.
      var minute = Math.round(winkel / 6) % 60;
      var stundeBisher = Math.floor(state.aktuelleMinuten / 60);
      var gesamt = stundeBisher * 60 + minute;
      // Magnetisches Einrasten auf das Level-Raster (z.B. naechste 15 Min).
      state.aktuelleMinuten = rasteEin(gesamt);

    } else if (aktiverZeiger === "stunde") {
      // Winkel -> Stunde auf dem 12er-Blatt (0..11). 0 Grad = 12 Uhr -> Index 0.
      var stunde12 = Math.round(winkel / 30) % 12;
      // Aktuelle Tageshaelfte beibehalten: 0 = vormittags (0..11),
      // 1 = nachmittags (12..23).
      var haelfte = state.aktuelleMinuten >= 12 * 60 ? 1 : 0;
      var minuteBisher = state.aktuelleMinuten % 60;
      var stunde24 = haelfte * 12 + stunde12;
      state.aktuelleMinuten = normalisiereMinuten(stunde24 * 60 + minuteBisher);
    }

    aktualisiereUhr();
  }

  /**
   * Rundet eine Gesamtzeit (Minuten) auf das aktuelle Level-Raster.
   *   Level 1 -> auf 30er-Schritte, Level 2 -> 15er, Level 3 -> 1er (kein Effekt).
   * Beispiel Level 2: 487 (08:07) -> rundet auf 480 (08:00) bzw. 495 (08:15),
   * je nachdem was naeher liegt.
   */
  function rasteEin(minutenGesamt) {
    var raster = LEVEL_CONFIG[state.level].raster;
    var gerundet = Math.round(minutenGesamt / raster) * raster;
    return normalisiereMinuten(gerundet);
  }

  /**
   * Entscheidet beim ersten Druck, welcher Zeiger "gemeint" ist.
   * Strategie: Wir vergleichen den Druckwinkel mit den aktuellen Winkeln von
   * Minuten- und Stundenzeiger und waehlen den, der WINKELMAESSIG naeher liegt.
   * Das fuehlt sich natuerlich an: Man greift den Zeiger, auf den man zeigt.
   */
  function waehleZeiger(clientX, clientY) {
    var druckWinkel = positionZuWinkel(clientX, clientY);
    var minutenWinkel = (state.aktuelleMinuten % 60) * 6;
    var stundenWinkel = (state.aktuelleMinuten % 720) * 0.5;

    // Hilfsfunktion: kleinster Abstand zweier Winkel (beachtet den 360-Umlauf).
    function winkelAbstand(a, b) {
      var d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    }

    var abstandMinute = winkelAbstand(druckWinkel, minutenWinkel);
    var abstandStunde = winkelAbstand(druckWinkel, stundenWinkel);

    return abstandMinute <= abstandStunde ? "minute" : "stunde";
  }

  // --- Event-Handler fuer das Ziehen ---

  function aufZeigerDruck(ereignis) {
    // Standardverhalten (z.B. Text markieren) unterdruecken.
    ereignis.preventDefault();
    aktiverZeiger = waehleZeiger(ereignis.clientX, ereignis.clientY);

    // Transition abschalten, damit der Zeiger dem Finger sofort folgt.
    el.svg.classList.add("wird-gezogen");

    // pointer capture: alle weiteren Bewegungen gehen an dieses Element,
    // auch wenn der Finger das SVG kurz verlaesst.
    if (el.svg.setPointerCapture) {
      el.svg.setPointerCapture(ereignis.pointerId);
    }
    verarbeiteZiehen(ereignis.clientX, ereignis.clientY);
  }

  function aufZeigerBewegung(ereignis) {
    if (!aktiverZeiger) { return; } // nur reagieren, wenn wirklich gezogen wird
    ereignis.preventDefault();
    verarbeiteZiehen(ereignis.clientX, ereignis.clientY);
  }

  function aufZeigerLoslassen() {
    aktiverZeiger = null;
    el.svg.classList.remove("wird-gezogen");
  }


  /* 10. -------------------------------------------------------------------
     PRUEFUNG "ABFAHRT!" + FEEDBACK
     ----------------------------------------------------------------------- */

  /**
   * Vergleicht die eingestellte Zeit mit der Zielzeit und gibt Rueckmeldung.
   * Es gibt KEIN Game Over: Bei Fehlern darf beliebig oft weiterprobiert werden.
   */
  function pruefeAbfahrt() {
    if (state.aktuelleMinuten === state.zielMinuten) {
      // ---- RICHTIG ----
      state.punkte += 1;
      if (state.punkte > state.rekord) { state.rekord = state.punkte; }

      zeigeHinweis("Super! Der Zeitreise-Express faehrt ab! 🎉", "erfolg");
      spielKlang("erfolg");
      starteErfolgsAnimation();

      // Automatischer Levelaufstieg: nach AUFSTIEG_NACH Punkten je Stufe.
      // Beispiel: 3 Punkte -> Level 2, 6 Punkte -> Level 3.
      var gewuenschtesLevel = Math.min(3, Math.floor(state.punkte / AUFSTIEG_NACH) + 1);

      aktualisiereStatus();
      speichereStand();

      // Nach kurzer Verzoegerung (damit die Animation sichtbar ist) geht es
      // mit der naechsten Aufgabe weiter – ggf. in der naechsten Epoche/Level.
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
      var tipp = FEHLER_TIPPS[zufallGanzzahl(0, FEHLER_TIPPS.length - 1)];
      zeigeHinweis(tipp, "fehler");
      spielKlang("fehler");
      starteSchuettelAnimation();
    }
  }

  /**
   * Setzt den Hinweistext und seine Farbklasse ("erfolg", "fehler" oder "").
   */
  function zeigeHinweis(text, art) {
    el.hinweis.textContent = text;
    el.hinweis.className = "hinweis" + (art ? " " + art : "");
  }

  /**
   * Loest die gruene Erfolgs-Animation der Uhr und die Zug-Abfahrt aus.
   * Die Animationsklassen werden nach Ablauf wieder entfernt, damit sie beim
   * naechsten Mal erneut greifen.
   */
  function starteErfolgsAnimation() {
    el.svg.classList.add("erfolg");
    el.zug.classList.add("faehrt");
    window.setTimeout(function () {
      el.svg.classList.remove("erfolg");
      el.zug.classList.remove("faehrt");
    }, 1000);
  }

  /**
   * Loest das kurze Schuetteln der Uhr bei falscher Antwort aus.
   */
  function starteSchuettelAnimation() {
    el.svg.classList.add("schuetteln");
    window.setTimeout(function () {
      el.svg.classList.remove("schuetteln");
    }, 500);
  }


  /* 11. -------------------------------------------------------------------
     ZUSATZ-APIs: SPRACHAUSGABE, SOUNDEFFEKTE, SPEICHERN
     Alle drei sind rein browser-nativ (keine externen Bibliotheken) und mit
     Schutzabfragen versehen, falls ein Browser sie nicht unterstuetzt.
     ----------------------------------------------------------------------- */

  /* --- 11a) SPRACHAUSGABE (Web Speech API / SpeechSynthesis) --- */

  /**
   * Liest einen Text laut vor. Sprache: Deutsch (de-DE).
   * window.speechSynthesis ist in modernen Browsern verfuegbar; fehlt es,
   * passiert einfach nichts (kein Fehler).
   */
  function sprich(text) {
    if (!("speechSynthesis" in window)) { return; }
    // Eventuell laufende Ausgabe stoppen, damit nichts uebereinander spricht.
    window.speechSynthesis.cancel();
    var aeusserung = new SpeechSynthesisUtterance(text);
    aeusserung.lang = "de-DE";
    aeusserung.rate = 0.9;   // etwas langsamer – kindgerecht und deutlich
    window.speechSynthesis.speak(aeusserung);
  }

  /**
   * Wandelt eine Zielzeit in einen vorlesbaren deutschen Satz um.
   * Beispiele: 480 -> "acht Uhr", 510 -> "acht Uhr dreissig",
   *            727 -> "zwoelf Uhr sieben".
   * Wir nutzen Zahlwoerter fuer 0..59, damit die Aussprache natuerlich klingt.
   */
  function zeitInWorten(minutenGesamt) {
    var stunde = Math.floor(minutenGesamt / 60);
    var minute = minutenGesamt % 60;
    var satz = zahlInWorten(stunde) + " Uhr";
    if (minute > 0) {
      satz += " " + zahlInWorten(minute);
    }
    return satz;
  }

  /**
   * Liefert das deutsche Zahlwort fuer 0..59 (ausreichend fuer Stunden/Minuten).
   * Aufbau der deutschen Zahlen 21..99: Einer + "und" + Zehner
   * (z.B. 21 = "einundzwanzig"). Diese Logik bilden wir hier nach.
   */
  function zahlInWorten(n) {
    var einer = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs",
                 "sieben", "acht", "neun", "zehn", "elf", "zwoelf", "dreizehn",
                 "vierzehn", "fuenfzehn", "sechzehn", "siebzehn", "achtzehn",
                 "neunzehn"];
    var zehner = ["", "", "zwanzig", "dreissig", "vierzig", "fuenfzig"];

    if (n < 20) { return einer[n]; }            // 0..19 direkt aus der Liste
    var z = Math.floor(n / 10);                 // Zehnerstelle
    var e = n % 10;                             // Einerstelle
    if (e === 0) { return zehner[z]; }          // glatte Zehner: 20,30,40,50
    // z.B. 7 + "und" + "zwanzig" = "siebenundzwanzig"
    return einer[e] + "und" + zehner[z];
  }


  /* --- 11b) SOUNDEFFEKTE (Web Audio API) --- */

  // Der AudioContext wird erst bei der ersten Nutzer-Interaktion erzeugt.
  // Hintergrund: Browser blockieren automatisches Abspielen von Ton, bis der
  // Nutzer aktiv etwas angeklickt/angetippt hat (Autoplay-Policy).
  var audioContext = null;

  function holeAudioContext() {
    if (audioContext === null) {
      // webkitAudioContext als Fallback fuer aeltere Safari-Versionen.
      var AudioKlasse = window.AudioContext || window.webkitAudioContext;
      if (AudioKlasse) { audioContext = new AudioKlasse(); }
    }
    // Falls der Kontext (z.B. nach Tab-Wechsel) pausiert wurde, fortsetzen.
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }
    return audioContext;
  }

  /**
   * Spielt einen kurzen Ton-Effekt. "typ" ist "erfolg" oder "fehler".
   *
   * Funktionsweise (Web Audio):
   *   - Ein OscillatorNode erzeugt eine reine Tonfrequenz (Sinuswelle).
   *   - Ein GainNode regelt die Lautstaerke; wir lassen den Ton sanft
   *     ausklingen (Fade-out), damit nichts hart abbricht.
   *   - Bei "erfolg" spielen wir einen aufsteigenden Dreiklang (froehlich),
   *     bei "fehler" einen einzelnen tiefen, weichen Ton (kein "Buzzer").
   */
  function spielKlang(typ) {
    var ctx = holeAudioContext();
    if (!ctx) { return; } // Browser ohne Web Audio: lautlos weiterspielen

    // Drei froehliche, aufsteigende Toene (C5, E5, G5) fuer den Erfolg.
    var erfolgsToene = [523.25, 659.25, 783.99];
    // Ein tiefer, sanfter Ton fuer den freundlichen Fehlerhinweis.
    var fehlerToene  = [196.00];

    var toene = (typ === "erfolg") ? erfolgsToene : fehlerToene;

    toene.forEach(function (frequenz, index) {
      var oszillator = ctx.createOscillator();
      var verstaerker = ctx.createGain();

      oszillator.type = (typ === "erfolg") ? "triangle" : "sine";
      oszillator.frequency.value = frequenz;

      // Startzeitpunkt: die Erfolgs-Toene leicht versetzt (Arpeggio-Effekt).
      var start = ctx.currentTime + index * 0.12;
      var dauer = 0.22;

      // Lautstaerke-Verlauf: schnell an, dann sanft ausklingen.
      verstaerker.gain.setValueAtTime(0.0001, start);
      verstaerker.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      verstaerker.gain.exponentialRampToValueAtTime(0.0001, start + dauer);

      // Signalkette verbinden: Oszillator -> Verstaerker -> Lautsprecher.
      oszillator.connect(verstaerker);
      verstaerker.connect(ctx.destination);

      oszillator.start(start);
      oszillator.stop(start + dauer);
    });
  }


  /* --- 11c) SPEICHERN / LADEN (localStorage) --- */

  /**
   * Speichert die relevanten Werte (Level, Punkte, Rekord) im Browser.
   * try/catch schuetzt vor Fehlern, falls localStorage deaktiviert ist
   * (z.B. strenge Privatsphaere-Einstellungen oder Inkognito-Modus).
   */
  function speichereStand() {
    try {
      var daten = {
        level:  state.level,
        punkte: state.punkte,
        rekord: state.rekord
      };
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
    } catch (fehler) {
      // Speichern ist optional – das Spiel laeuft auch ohne Persistenz weiter.
    }
  }

  /**
   * Laedt einen zuvor gespeicherten Stand (falls vorhanden) in den State.
   */
  function ladeStand() {
    try {
      var roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { return; }
      var daten = JSON.parse(roh);

      // Werte vorsichtig uebernehmen und auf gueltige Bereiche begrenzen.
      if (typeof daten.level  === "number") { state.level  = Math.max(1, Math.min(3, daten.level)); }
      if (typeof daten.punkte === "number") { state.punkte = Math.max(0, daten.punkte); }
      if (typeof daten.rekord === "number") { state.rekord = Math.max(0, daten.rekord); }

      // Schrittweite passend zum geladenen Level setzen.
      state.schrittweite = LEVEL_CONFIG[state.level].schritt;
    } catch (fehler) {
      // Beschaedigte/fehlende Daten ignorieren – mit Standardwerten starten.
    }
  }


  /* 12. -------------------------------------------------------------------
     VERDRAHTUNG DER EVENTS + SPIELSTART
     ----------------------------------------------------------------------- */

  function verbindeEvents() {
    // --- Steuerungs-Buttons ---
    el.minus.addEventListener("click", function () { aendereZeit(-1); });
    el.plus.addEventListener("click",  function () { aendereZeit(+1); });
    el.abfahrt.addEventListener("click", pruefeAbfahrt);

    // --- Vorlese-Button (Sprachausgabe) ---
    el.vorlesen.addEventListener("click", function () {
      sprich("Die Abfahrtszeit ist " + zeitInWorten(state.zielMinuten));
    });

    // --- Level-Auswahl-Buttons ---
    el.levelButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setzeLevel(Number(button.dataset.level));
      });
    });

    // --- Drag & Drop der Zeiger (Pointer Events: Maus + Touch zugleich) ---
    el.svg.addEventListener("pointerdown", aufZeigerDruck);
    el.svg.addEventListener("pointermove", aufZeigerBewegung);
    // pointerup / pointercancel beenden das Ziehen zuverlaessig.
    el.svg.addEventListener("pointerup", aufZeigerLoslassen);
    el.svg.addEventListener("pointercancel", aufZeigerLoslassen);

    // --- Tastatur-Komfort (optional, fuer Maus/Laptop-Nutzung) ---
    // Pfeiltasten links/rechts = Zeit verstellen, Leertaste/Enter = Abfahrt.
    document.addEventListener("keydown", function (ereignis) {
      if (ereignis.key === "ArrowLeft")  { aendereZeit(-1); }
      if (ereignis.key === "ArrowRight") { aendereZeit(+1); }
      if (ereignis.key === "Enter" || ereignis.key === " ") {
        // Nur ausloesen, wenn nicht gerade ein Button den Fokus hat
        // (sonst wuerde der Klick doppelt zaehlen).
        if (document.activeElement === document.body) {
          ereignis.preventDefault();
          pruefeAbfahrt();
        }
      }
    });
  }

  /**
   * Startpunkt des Spiels: einmalig beim Laden ausfuehren.
   */
  function start() {
    zeichneZifferblatt();   // SVG-Zifferblatt aufbauen
    ladeStand();            // ggf. gespeicherten Fortschritt holen
    verbindeEvents();       // alle Interaktionen aktivieren

    // Schrittweite passend zum (geladenen) Level setzen und alles anzeigen.
    state.schrittweite = LEVEL_CONFIG[state.level].schritt;
    aktualisiereStatus();
    neueAufgabe();          // erste Aufgabe erzeugen + Uhr rendern
  }

  // Das Skript steht am Ende des <body>, daher ist das DOM bereits geladen.
  // Zur Sicherheit warten wir trotzdem auf "DOMContentLoaded", falls die Datei
  // einmal anders eingebunden wird.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
