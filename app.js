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

function navMarkup(aktiveSeite) {
  const seiten = [
    { label: "Home", href: "index.html" },
    { label: "Backen", href: "backen.html" },
    { label: "Kochen", href: "kochen.html" }
  ];

  const links = seiten
    .map(s => `<a class="nav-tab${s.label === aktiveSeite ? " aktiv" : ""}" href="${s.href}">${s.label}</a>`)
    .join("");

  return `<nav class="site-nav" aria-label="Hauptnavigation">${links}</nav>`;
}

function leinwandElementFuellen(div, element) {
  if (element.typ === "text") {
    const tag = document.createElement(element.tag || "p");
    tag.textContent = element.text;
    if (element.klasse) tag.className = element.klasse;
    div.appendChild(tag);
  } else if (element.typ === "nav") {
    div.innerHTML = navMarkup(element.aktiv);
  } else if (element.typ === "ueber-uns") {
    div.innerHTML = `
      <section class="ueber-uns">
        <h2>${element.titel}</h2>
        <p>${element.text}</p>
      </section>
    `;
  } else if (element.typ === "rezept-grid") {
    const sucheHtml = element.suche === false
      ? ""
      : '<input type="search" id="suche" class="suche-feld" placeholder="Rezept suchen…" aria-label="Rezept suchen">';
    div.innerHTML = `${sucheHtml}<div class="grid" id="rezepte-grid"></div>`;
  } else if (element.typ === "admin") {
    div.innerHTML = `
      <div class="admin-bereich">
        <button id="admin-toggle" class="admin-toggle" type="button" aria-pressed="false">🔧 Admin-Modus</button>
        <div class="admin-badge">🔧 Admin-Modus aktiv</div>
      </div>
    `;
  }
}

function leinwandSkalieren() {
  const aussen = document.getElementById("leinwand-aussen");
  const leinwand = document.getElementById("leinwand");
  if (!aussen || !leinwand) return;

  if (window.innerWidth <= 600) {
    leinwand.style.transform = "";
    return;
  }

  const REFERENZBREITE = 1280;
  const massstab = Math.min(1, aussen.clientWidth / REFERENZBREITE);
  leinwand.style.transform = `scale(${massstab})`;
  aussen.style.height = (leinwand.offsetHeight * massstab) + "px";
}

window.addEventListener("resize", leinwandSkalieren);
window.addEventListener("load", leinwandSkalieren);

async function seiteRendern(schemaPfad) {
  const antwort = await fetch(schemaPfad);
  const elemente = await antwort.json();

  const leinwand = document.getElementById("leinwand");
  leinwand.innerHTML = "";

  let naechsteY = 0;

  for (const element of elemente) {
    const y = element.y !== undefined ? element.y : naechsteY;

    const div = document.createElement("div");
    div.className = "leinwand-element";
    div.style.left = (element.x || 0) + "px";
    div.style.top = y + "px";
    if (element.breite) div.style.width = element.breite + "px";

    leinwandElementFuellen(div, element);
    leinwand.appendChild(div);

    if (element.typ === "rezept-grid") {
      await ladeUndRenderRezepte(element.kategorie || null);
    }

    naechsteY = y + div.offsetHeight + (element.abstandNach ?? 32);
  }

  leinwand.style.height = naechsteY + "px";

  sucheInitialisieren();
  adminModusInitialisieren();
  leinwandSkalieren();
}
