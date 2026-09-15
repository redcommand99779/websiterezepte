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

async function ladeUndRenderRezepte(kategorieFilter) {
  const antwort = await fetch("rezepte.json");
  const alleRezepte = await antwort.json();
  const rezepte = kategorieFilter
    ? alleRezepte.filter(r => r.kategorie === kategorieFilter)
    : alleRezepte;

  const grid = document.getElementById("rezepte-grid");
  grid.innerHTML = rezepte.map(rezeptKarte).join("");
}
