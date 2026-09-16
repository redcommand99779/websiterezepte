function rezeptKarte(rezept) {
  const kategorieKlasse = rezept.kategorie === "Backen" ? "backen" : "kochen";
  const dateiname = rezept.pdf.split("/").pop();

  return `
    <article class="karte">
      <img src="${rezept.bild}" alt="${rezept.titel}" loading="lazy">
      <div class="karte-inhalt">
        <h2>${rezept.titel}</h2>
        <span class="kategorie-label">
          <span class="punkt ${kategorieKlasse}"></span>
          ${rezept.kategorie}
        </span>
        <div class="karte-buttons">
          <a class="button" href="${rezept.pdf}" target="_blank" rel="noopener">Ansehen</a>
          <a class="button" href="${rezept.pdf}" download="${dateiname}">Herunterladen</a>
        </div>
      </div>
    </article>
  `;
}

let alleRezepteGlobal = [];
let aktuellerKategorieFilter = null;

function gridRendern(suchbegriff) {
  const grid = document.getElementById("rezepte-grid");
  const suche = (suchbegriff || "").trim().toLowerCase();

  const rezepte = alleRezepteGlobal.filter(r => {
    const passtKategorie = !aktuellerKategorieFilter || r.kategorie === aktuellerKategorieFilter;
    const passtSuche = !suche || r.titel.toLowerCase().includes(suche);
    return passtKategorie && passtSuche;
  });

  grid.innerHTML = rezepte.map(rezeptKarte).join("");
}

async function ladeUndRenderRezepte(kategorieFilter) {
  aktuellerKategorieFilter = kategorieFilter || null;
  const antwort = await fetch("rezepte.json");
  alleRezepteGlobal = await antwort.json();
  gridRendern();
}

function sucheInitialisieren() {
  const feld = document.getElementById("suche");
  if (!feld) return;

  feld.addEventListener("input", () => gridRendern(feld.value));
}

function adminModusInitialisieren() {
  const knopf = document.getElementById("admin-toggle");
  if (!knopf) return;

  function anwenden(aktiv) {
    document.documentElement.toggleAttribute("data-admin", aktiv);
    knopf.textContent = aktiv ? "🔧 Admin-Modus: AN" : "🔧 Admin-Modus";
    knopf.setAttribute("aria-pressed", String(aktiv));
    localStorage.setItem("adminModus", aktiv ? "1" : "0");
  }

  anwenden(localStorage.getItem("adminModus") === "1");

  knopf.addEventListener("click", () => {
    anwenden(!document.documentElement.hasAttribute("data-admin"));
  });
}
