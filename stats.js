// Besucherstatistik über GoatCounter (kostenlos, ohne Cookies).
// Hier den Namen der Statistik eintragen = der Teil vor ".goatcounter.com". Leer = es wird nichts gezählt.
const GOATCOUNTER_CODE = "theredcommand";

(function () {
  if (!GOATCOUNTER_CODE) return;

  // Der eigene Admin-Modus (Testschalter) zählt nicht mit
  function adminModus() {
    try {
      return localStorage.getItem("adminModus") === "1";
    } catch {
      return false;
    }
  }

  function zaehlen(daten) {
    if (adminModus() || !window.goatcounter || !window.goatcounter.count) return;
    window.goatcounter.count(daten);
  }

  function seitenpfad() {
    const datei = location.pathname.split("/").pop() || "index.html";
    const id = new URLSearchParams(location.search).get("id");
    // Jedes Rezept bekommt einen eigenen Pfad, damit die Aufrufe pro Rezept sichtbar sind
    return datei === "rezept.html" && id ? `rezept/${id}` : datei;
  }

  window.goatcounter = { no_onload: true };

  const skript = document.createElement("script");
  skript.async = true;
  skript.src = "https://gc.zgo.at/count.js";
  skript.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  skript.addEventListener("load", () => zaehlen({ path: seitenpfad() }));
  document.head.appendChild(skript);

  document.addEventListener("click", e => {
    const ziel = e.target.closest("a[download], .seitenleiste-zufall, .filter-chip");
    if (!ziel) return;

    if (ziel.matches("a[download]")) {
      zaehlen({ path: `pdf/${ziel.getAttribute("download")}`, title: "PDF-Download", event: true });
    } else if (ziel.matches(".seitenleiste-zufall")) {
      zaehlen({ path: "zufalls-rezept", title: "Zufalls-Rezept", event: true });
    } else {
      zaehlen({ path: `filter/${ziel.dataset.filter}`, title: "Filter", event: true });
    }
  });
})();
