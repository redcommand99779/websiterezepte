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

// ---------- Navigation und Zeiträume ----------

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

function navigationFlach() {
  return navigationEintraege.flatMap(e => e.eintraege || [e]);
}

const MONATE_LANG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function aktiveDatei() {
  return location.pathname.split("/").pop() || "index.html";
}

function adminAktiv() {
  return document.documentElement.hasAttribute("data-admin");
}

// Zeitraum als { von: "MM-TT", bis: "MM-TT" }, jedes Jahr gültig; von > bis geht über den Jahreswechsel
function zeitraumVerfuegbar(zeitraum, heute = new Date()) {
  const jetzt = String(heute.getMonth() + 1).padStart(2, "0") + "-" + String(heute.getDate()).padStart(2, "0");
  return zeitraum.von <= zeitraum.bis
    ? jetzt >= zeitraum.von && jetzt <= zeitraum.bis
    : jetzt >= zeitraum.von || jetzt <= zeitraum.bis;
}

function zeitraumText(zeitraum, monate, trenner = " – ") {
  const format = md => {
    const [monat, tag] = md.split("-").map(Number);
    return `${tag}. ${monate[monat - 1]}`;
  };
  return `${format(zeitraum.von)}${trenner}${format(zeitraum.bis)}`;
}

// Tage bis zum nächsten Beginn des Zeitraums (nur sinnvoll, solange er nicht läuft)
function tageBisStart(zeitraum, heute = new Date()) {
  const [monat, tag] = zeitraum.von.split("-").map(Number);
  const heuteTag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  let start = new Date(heute.getFullYear(), monat - 1, tag);
  if (start <= heuteTag) start = new Date(heute.getFullYear() + 1, monat - 1, tag);
  return Math.round((start - heuteTag) / 86400000);
}

function gesperrtText(was, zeitraum) {
  const tage = tageBisStart(zeitraum);
  const noch = tage === 1 ? "Noch 1 Tag." : `Noch ${tage} Tage.`;
  return `${was} ist nur vom ${zeitraumText(zeitraum, MONATE_LANG, " bis ")} verfügbar. ${noch}`;
}

function zeitraumGesperrt(zeitraum) {
  return Boolean(zeitraum) && !adminAktiv() && !zeitraumVerfuegbar(zeitraum);
}

// Zeitraum der aktuellen Seite (aus navigation.json); null = immer verfügbar
let aktuellerZeitraum = null;

// ---------- Rezepte ----------

let alleRezepteGlobal = [];
let rezepteGeladen = null;

function rezepteLaden() {
  rezepteGeladen ??= fetch("rezepte.json")
    .then(antwort => antwort.json())
    .then(daten => { alleRezepteGlobal = daten; });
  return rezepteGeladen;
}

function rezeptId(rezept) {
  return rezept.id || String(rezept.titel).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rezeptLink(rezept) {
  return `rezept.html?id=${encodeURIComponent(rezeptId(rezept))}`;
}

function rezeptKarte(rezept) {
  const kategorieKlasse = rezept.kategorie === "Backen" ? "backen" : "kochen";
  const titel = htmlEscape(rezept.titel);
  const link = rezeptLink(rezept);
  const bild = rezept.bild
    ? `<img src="${htmlEscape(sichereUrl(rezept.bild))}" alt="${titel}" loading="lazy">`
    : '<div class="karte-bild-leer"></div>';
  const pdf = rezept.pdf ? sichereUrl(rezept.pdf) : null;
  const dauer = rezept.dauer ? ` · ${htmlEscape(rezept.dauer)} Min` : "";

  return `
    <article class="karte">
      <a class="karte-bildlink" href="${link}" tabindex="-1" aria-hidden="true">${bild}</a>
      <div class="karte-inhalt">
        <h2><a href="${link}">${titel}</a></h2>
        <span class="kategorie-label">
          <span class="punkt ${kategorieKlasse}"></span>
          ${htmlEscape(rezept.kategorie)}${dauer}
        </span>
        <div class="karte-buttons">
          <a class="button" href="${link}">Ansehen</a>
          ${pdf ? `<a class="button" href="${htmlEscape(pdf)}" download="${htmlEscape(pdf.split("/").pop())}">PDF herunterladen</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

const FILTER = [
  { key: "vegetarisch", label: "Vegetarisch", passt: r => (r.tags || []).some(t => t === "vegetarisch" || t === "vegan") },
  { key: "vegan", label: "Vegan", passt: r => (r.tags || []).includes("vegan") },
  { key: "schnell", label: "Schnell (bis 30 Min)", passt: r => r.dauer > 0 && r.dauer <= 30 }
];
const aktiveFilter = new Set();

let aktuellerKategorieFilter = null;

function gridRendern() {
  const grid = document.getElementById("rezepte-grid");
  if (!grid) return;

  const filterLeiste = document.getElementById("filter-leiste");
  const suche = (document.getElementById("suche")?.value || "").trim().toLowerCase();
  const gesperrt = zeitraumGesperrt(aktuellerZeitraum);

  const kategorieRezepte = alleRezepteGlobal.filter(r => !aktuellerKategorieFilter || r.kategorie === aktuellerKategorieFilter);
  if (filterLeiste) filterLeiste.hidden = gesperrt || !kategorieRezepte.length;

  if (gesperrt) {
    grid.innerHTML = `<p class="leer-hinweis">${htmlEscape(gesperrtText("Diese Seite", aktuellerZeitraum))}</p>`;
  } else {
    const rezepte = kategorieRezepte.filter(r =>
      (!suche || r.titel.toLowerCase().includes(suche)) &&
      [...aktiveFilter].every(key => FILTER.find(f => f.key === key).passt(r))
    );

    if (rezepte.length) {
      grid.innerHTML = rezepte.map(rezeptKarte).join("");
    } else {
      const text = kategorieRezepte.length ? "Keine Rezepte passen zu Suche und Filter." : "Noch keine Rezepte hier.";
      grid.innerHTML = `<p class="leer-hinweis">${text}</p>`;
    }
  }

  leinwandAnordnen();
}

function rezeptDetailRendern() {
  const container = document.getElementById("rezept-detail");
  if (!container) return;

  const id = new URLSearchParams(location.search).get("id");
  const rezept = alleRezepteGlobal.find(r => rezeptId(r) === id);

  if (!rezept) {
    container.innerHTML = '<p class="leer-hinweis">Dieses Rezept gibt es nicht. <a href="index.html">Zur Startseite</a></p>';
    leinwandAnordnen();
    return;
  }

  const kategorieEintrag = navigationFlach().find(e => e.label === rezept.kategorie);
  const zurueck = `<a class="zurueck-link" href="${htmlEscape(kategorieEintrag?.href || "index.html")}">← ${htmlEscape(rezept.kategorie)}</a>`;

  if (zeitraumGesperrt(kategorieEintrag?.zeitraum)) {
    container.innerHTML = `${zurueck}<p class="leer-hinweis">${htmlEscape(gesperrtText("Dieses Rezept", kategorieEintrag.zeitraum))}</p>`;
    document.title = "Rezept – Meine Rezepte";
    leinwandAnordnen();
    return;
  }

  const meta = [
    rezept.kategorie,
    rezept.dauer ? `${rezept.dauer} Min` : null,
    rezept.portionen ? `${rezept.portionen} Portionen` : null,
    ...(rezept.tags || []).map(t => t.charAt(0).toUpperCase() + t.slice(1))
  ].filter(Boolean).map(t => `<span class="rezept-meta-chip">${htmlEscape(t)}</span>`).join("");

  const liste = (tag, eintraege) => eintraege?.length
    ? `<${tag}>${eintraege.map(e => `<li>${htmlEscape(e)}</li>`).join("")}</${tag}>`
    : "";
  const pdf = rezept.pdf ? sichereUrl(rezept.pdf) : null;

  container.innerHTML = `
    ${zurueck}
    <h1 class="leinwand-h1 rezept-titel">${htmlEscape(rezept.titel)}</h1>
    <div class="rezept-meta">${meta}</div>
    ${rezept.bild ? `<img class="rezept-bild" src="${htmlEscape(sichereUrl(rezept.bild))}" alt="${htmlEscape(rezept.titel)}">` : ""}
    ${rezept.zutaten?.length ? `<h2 class="rezept-abschnitt">Zutaten</h2>${liste("ul", rezept.zutaten)}` : ""}
    ${rezept.schritte?.length ? `<h2 class="rezept-abschnitt">Zubereitung</h2>${liste("ol", rezept.schritte)}` : ""}
    ${pdf ? `<a class="button rezept-pdf" href="${htmlEscape(pdf)}" download="${htmlEscape(pdf.split("/").pop())}">PDF herunterladen</a>` : ""}
  `;
  document.title = `${rezept.titel} – Meine Rezepte`;
  leinwandAnordnen();
}

async function zufallsRezeptOeffnen(hinweis) {
  try {
    await rezepteLaden();
  } catch {
    hinweis.textContent = "Rezepte konnten nicht geladen werden.";
    return;
  }

  const verfuegbar = alleRezepteGlobal.filter(r => {
    const zeitraum = navigationFlach().find(e => e.label === r.kategorie)?.zeitraum;
    return !zeitraumGesperrt(zeitraum);
  });

  if (!verfuegbar.length) {
    hinweis.textContent = "Noch keine Rezepte verfügbar.";
    return;
  }
  location.href = rezeptLink(verfuegbar[Math.floor(Math.random() * verfuegbar.length)]);
}

function sucheInitialisieren() {
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.filter;
      if (aktiveFilter.has(key)) aktiveFilter.delete(key);
      else aktiveFilter.add(key);
      chip.setAttribute("aria-pressed", String(aktiveFilter.has(key)));
      gridRendern();
    });
  });

  const feld = document.getElementById("suche");
  if (feld) feld.addEventListener("input", gridRendern);
}

function adminModusInitialisieren() {
  const knopf = document.getElementById("admin-toggle");
  if (!knopf) return;

  function anwenden(aktiv) {
    document.documentElement.toggleAttribute("data-admin", aktiv);
    knopf.textContent = aktiv ? "🔧 Admin-Modus: AN" : "🔧 Admin-Modus";
    knopf.setAttribute("aria-pressed", String(aktiv));
    localStorage.setItem("adminModus", aktiv ? "1" : "0");
    zeitraumSperrenAktualisieren();
  }

  anwenden(localStorage.getItem("adminModus") === "1");

  knopf.addEventListener("click", () => {
    anwenden(!adminAktiv());
  });
}

// ---------- Seitenleiste ----------

function seitenleisteLink(eintrag, aktiveSeite) {
  const aktiv = eintrag.href === aktiveSeite;
  const zeitraum = eintrag.zeitraum;
  const zeitraumAttribut = zeitraum ? ` data-zeitraum="${htmlEscape(zeitraum.von)}|${htmlEscape(zeitraum.bis)}"` : "";
  const hinweis = zeitraum ? `<small>${htmlEscape(zeitraumText(zeitraum, MONATE_KURZ))}</small>` : "";
  return `<a class="seitenleiste-link${aktiv ? " aktiv" : ""}" href="${htmlEscape(eintrag.href)}" data-href="${htmlEscape(eintrag.href)}"${zeitraumAttribut}${aktiv ? ' aria-current="page"' : ""}>${htmlEscape(eintrag.label)}${hinweis}</a>`;
}

function seitenleisteMarkup() {
  const aktiveSeite = aktiveDatei();

  return navigationEintraege.map(eintrag => {
    if (!Array.isArray(eintrag.eintraege)) return seitenleisteLink(eintrag, aktiveSeite);

    return `
      <details class="seitenleiste-gruppe" open>
        <summary>${htmlEscape(eintrag.gruppe)}</summary>
        ${eintrag.eintraege.map(e => seitenleisteLink(e, aktiveSeite)).join("")}
      </details>
    `;
  }).join("");
}

function seitenleisteSperrenAktualisieren() {
  document.querySelectorAll(".seitenleiste-link[data-zeitraum]").forEach(link => {
    const [von, bis] = link.dataset.zeitraum.split("|");
    const frei = !zeitraumGesperrt({ von, bis });

    link.classList.toggle("gesperrt", !frei);
    if (frei) {
      link.setAttribute("href", link.dataset.href);
      link.removeAttribute("aria-disabled");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
    }
  });
}

function zeitraumSperrenAktualisieren() {
  seitenleisteSperrenAktualisieren();
  gridRendern();
  rezeptDetailRendern();
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
  leiste.innerHTML = `
    <button type="button" class="seitenleiste-link seitenleiste-zufall">🎲 Zufalls-Rezept</button>
    <p class="seitenleiste-hinweis" role="status"></p>
    <nav aria-label="Hauptnavigation">${seitenleisteMarkup()}</nav>
  `;

  document.body.append(knopf, hintergrund, leiste);

  const hinweis = leiste.querySelector(".seitenleiste-hinweis");
  leiste.querySelector(".seitenleiste-zufall").addEventListener("click", () => zufallsRezeptOeffnen(hinweis));

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

// ---------- Leinwand ----------

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
    const filterHtml = element.filter === false
      ? ""
      : `<div class="filter-leiste" id="filter-leiste" role="group" aria-label="Filter" hidden>${
          FILTER.map(f => `<button type="button" class="filter-chip" data-filter="${f.key}" aria-pressed="false">${f.label}</button>`).join("")
        }</div>`;
    div.innerHTML = `${sucheHtml}${filterHtml}<div class="grid" id="rezepte-grid"></div>`;
  } else if (element.typ === "rezept-detail") {
    div.innerHTML = '<div id="rezept-detail"></div>';
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

function leinwandElementErstellen(element) {
  const istSeitenende = element.typ === "seitenende";

  const div = document.createElement("div");
  div.className = "leinwand-element";
  div.dataset.typ = element.typ;
  div.dataset.schema = JSON.stringify(element);
  div.style.left = (istSeitenende ? 0 : (element.x || 0)) + "px";

  const breite = istSeitenende ? 1280 : element.breite;
  if (breite) div.style.width = breite + "px";
  if (element.hoehe) div.style.height = element.hoehe + "px";

  leinwandElementFuellen(div, element);
  return div;
}

// Elemente der aktuellen Seite: { element, div }
let leinwandEintraege = [];

// Setzt die Positionen neu (Elemente ohne y stapeln sich unter dem vorherigen) und passt die Leinwandhöhe an
function leinwandAnordnen() {
  const leinwand = document.getElementById("leinwand");
  if (!leinwand) return;

  let naechsteY = 0;
  let unterkante = 0;
  let seitenEndeY = null;

  for (const { div } of leinwandEintraege) div.classList.remove("nach-seitenende");

  for (const { element, div } of leinwandEintraege) {
    const y = element.y !== undefined ? element.y : naechsteY;
    div.style.top = y + "px";

    if (element.typ === "seitenende") {
      seitenEndeY = seitenEndeY === null ? y : Math.min(seitenEndeY, y);
    }

    unterkante = Math.max(unterkante, y + div.offsetHeight);
    naechsteY = y + div.offsetHeight + (element.abstandNach ?? 32);
  }

  if (seitenEndeY !== null) {
    leinwand.style.height = seitenEndeY + "px";
    for (const { element, div } of leinwandEintraege) {
      const oben = parseFloat(div.style.top) || 0;
      if (element.typ !== "seitenende" && oben >= seitenEndeY) div.classList.add("nach-seitenende");
    }
  } else {
    leinwand.style.height = Math.max(naechsteY, unterkante + 32) + "px";
  }

  leinwandSkalieren();
}

async function seiteRendern(schemaPfad) {
  const [antwort] = await Promise.all([fetch(schemaPfad), navigationLaden()]);
  const elemente = await antwort.json();

  aktuellerZeitraum = navigationFlach().find(e => e.href === aktiveDatei())?.zeitraum || null;

  const leinwand = document.getElementById("leinwand");
  leinwand.innerHTML = "";

  leinwandEintraege = elemente.map(element => {
    const div = leinwandElementErstellen(element);
    leinwand.appendChild(div);
    return { element, div };
  });

  if (elemente.some(e => e.typ === "rezept-grid" || e.typ === "rezept-detail")) {
    await rezepteLaden().catch(() => {});
  }
  aktuellerKategorieFilter = elemente.find(e => e.typ === "rezept-grid")?.kategorie || null;
  gridRendern();
  rezeptDetailRendern();

  seitenleisteInitialisieren();
  sucheInitialisieren();
  adminModusInitialisieren();
  seitenleisteSperrenAktualisieren();
  leinwandAnordnen();
}
