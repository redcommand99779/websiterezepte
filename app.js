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

  grid.innerHTML = rezepte.length
    ? rezepte.map(rezeptKarte).join("")
    : '<p class="leer-hinweis">Noch keine Rezepte hier.</p>';
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

function htmlEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sichereUrl(ziel) {
  const text = String(ziel ?? "").trim();
  if (!text) return "#";
  if (/^(https?:|mailto:)/i.test(text)) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return "#";
  return text;
}

let navigationEintraege = [
  { label: "Home", href: "index.html" },
  { label: "Backen", href: "backen.html" },
  { label: "Kochen", href: "kochen.html" }
];

async function navigationLaden() {
  try {
    const antwort = await fetch("navigation.json");
    if (antwort.ok) navigationEintraege = await antwort.json();
  } catch {
    // Ohne navigation.json bleibt die eingebaute Standardliste aktiv
  }
}

function seitenleisteLink(eintrag, aktiveDatei) {
  const aktiv = eintrag.href === aktiveDatei;
  return `<a class="seitenleiste-link${aktiv ? " aktiv" : ""}" href="${htmlEscape(eintrag.href)}"${aktiv ? ' aria-current="page"' : ""}>${htmlEscape(eintrag.label)}</a>`;
}

function seitenleisteMarkup() {
  const aktiveDatei = location.pathname.split("/").pop() || "index.html";

  return navigationEintraege.map(eintrag => {
    if (!Array.isArray(eintrag.eintraege)) return seitenleisteLink(eintrag, aktiveDatei);

    return `
      <details class="seitenleiste-gruppe" open>
        <summary>${htmlEscape(eintrag.gruppe)}</summary>
        ${eintrag.eintraege.map(e => seitenleisteLink(e, aktiveDatei)).join("")}
      </details>
    `;
  }).join("");
}

function seitenleisteInitialisieren() {
  if (document.getElementById("seitenleiste")) return;

  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "seitenleiste-knopf";
  knopf.setAttribute("aria-controls", "seitenleiste");
  knopf.setAttribute("aria-expanded", "false");
  knopf.setAttribute("aria-label", "Menü öffnen");
  knopf.innerHTML = "<span></span><span></span><span></span>";

  const hintergrund = document.createElement("div");
  hintergrund.className = "seitenleiste-hintergrund";

  const leiste = document.createElement("aside");
  leiste.id = "seitenleiste";
  leiste.className = "seitenleiste";
  leiste.innerHTML = `<nav aria-label="Hauptnavigation">${seitenleisteMarkup()}</nav>`;

  document.body.append(knopf, hintergrund, leiste);

  function umschalten(offen) {
    leiste.classList.toggle("offen", offen);
    hintergrund.classList.toggle("offen", offen);
    knopf.setAttribute("aria-expanded", String(offen));
    knopf.setAttribute("aria-label", offen ? "Menü schließen" : "Menü öffnen");
  }

  knopf.addEventListener("click", () => umschalten(!leiste.classList.contains("offen")));
  hintergrund.addEventListener("click", () => umschalten(false));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && leiste.classList.contains("offen")) {
      umschalten(false);
      knopf.focus();
    }
  });
}

function leinwandElementFuellen(div, element) {
  if (element.typ === "text") {
    const tag = document.createElement(element.tag || "p");
    tag.textContent = element.text;
    if (element.klasse) tag.className = element.klasse;
    div.appendChild(tag);
  } else if (element.typ === "knopf") {
    const link = document.createElement("a");
    link.className = "button leinwand-knopf";
    link.textContent = element.text || "Knopf";
    const ziel = sichereUrl(element.ziel);
    link.href = ziel;
    if (ziel !== "#") {
      if (element.aktion === "herunterladen") {
        link.setAttribute("download", ziel.split("/").pop());
      } else if (element.aktion === "ansehen" || /^https?:/i.test(ziel)) {
        link.target = "_blank";
        link.rel = "noopener";
      }
    }
    div.appendChild(link);
  } else if (element.typ === "kasten") {
    div.innerHTML = '<div class="leinwand-kasten"></div>';
  } else if (element.typ === "bild") {
    const bild = document.createElement("img");
    bild.className = "leinwand-bild";
    bild.src = element.bild;
    bild.alt = element.alt || "";
    div.appendChild(bild);
  } else if (element.typ === "ueber-uns") {
    div.innerHTML = `
      <section class="ueber-uns">
        <h2>${htmlEscape(element.titel)}</h2>
        <p>${htmlEscape(element.text)}</p>
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

  if (massstab >= 0.999) {
    leinwand.style.transform = "none";
    aussen.style.height = leinwand.offsetHeight + "px";
  } else {
    leinwand.style.transform = `scale(${massstab})`;
    aussen.style.height = (leinwand.offsetHeight * massstab) + "px";
  }
}

window.addEventListener("resize", leinwandSkalieren);
window.addEventListener("load", leinwandSkalieren);

function leinwandElementErstellen(element, y) {
  const istSeitenende = element.typ === "seitenende";

  const div = document.createElement("div");
  div.className = "leinwand-element";
  div.dataset.typ = element.typ;
  div.dataset.schema = JSON.stringify(element);
  div.style.left = (istSeitenende ? 0 : (element.x || 0)) + "px";
  div.style.top = y + "px";

  const breite = istSeitenende ? 1280 : element.breite;
  if (breite) div.style.width = breite + "px";
  if (element.hoehe) div.style.height = element.hoehe + "px";

  leinwandElementFuellen(div, element);
  return div;
}

async function seiteRendern(schemaPfad) {
  const [antwort] = await Promise.all([fetch(schemaPfad), navigationLaden()]);
  const elemente = await antwort.json();

  const leinwand = document.getElementById("leinwand");
  leinwand.innerHTML = "";

  let naechsteY = 0;
  let unterkante = 0;
  let seitenEndeY = null;

  for (const element of elemente) {
    const y = element.y !== undefined ? element.y : naechsteY;

    const div = leinwandElementErstellen(element, y);
    leinwand.appendChild(div);

    if (element.typ === "rezept-grid") {
      await ladeUndRenderRezepte(element.kategorie || null);
    }

    if (element.typ === "seitenende") {
      seitenEndeY = seitenEndeY === null ? y : Math.min(seitenEndeY, y);
    }

    unterkante = Math.max(unterkante, y + div.offsetHeight);
    naechsteY = y + div.offsetHeight + (element.abstandNach ?? 32);
  }

  if (seitenEndeY !== null) {
    leinwand.style.height = seitenEndeY + "px";
    leinwand.querySelectorAll(":scope > .leinwand-element").forEach(div => {
      const oben = parseFloat(div.style.top) || 0;
      if (div.dataset.typ !== "seitenende" && oben >= seitenEndeY) {
        div.classList.add("nach-seitenende");
      }
    });
  } else {
    leinwand.style.height = Math.max(naechsteY, unterkante + 32) + "px";
  }

  seitenleisteInitialisieren();
  sucheInitialisieren();
  adminModusInitialisieren();
  leinwandSkalieren();
}
