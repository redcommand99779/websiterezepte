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

// ---------- Akzentfarbe je Seite/Kategorie ("farbe" in navigation.json) ----------

function farbeGueltig(farbe) {
  return /^#[0-9a-f]{6}$/i.test(farbe || "") ? farbe : null;
}

function akzentSetzen(farbe) {
  const hex = farbeGueltig(farbe);
  const stil = document.documentElement.style;

  if (!hex) {
    stil.removeProperty("--akzent");
    stil.removeProperty("--akzent-rgb");
    return;
  }
  const zahl = parseInt(hex.slice(1), 16);
  stil.setProperty("--akzent", hex);
  stil.setProperty("--akzent-rgb", `${zahl >> 16}, ${(zahl >> 8) & 255}, ${zahl & 255}`);
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

// ---------- Coin-Vorteil: gesperrte Seite für 24 Stunden öffnen ----------
// Nur ein Spiel: Münzstand und Freischaltungen liegen im Browser und lassen sich ändern.

const FREISCHALT_PREIS = 100;
const FREISCHALT_DAUER_MS = 24 * 60 * 60 * 1000;

function freischaltungenLaden() {
  try {
    const liste = JSON.parse(localStorage.getItem("freischaltungen"));
    return liste && typeof liste === "object" ? liste : {};
  } catch {
    return {};
  }
}

// Ablaufzeit in Millisekunden, 0 = nicht freigeschaltet
function freischaltungBis(label) {
  const bis = Number(freischaltungenLaden()[label]);
  return bis > Date.now() ? bis : 0;
}

// Ein Navigationseintrag ist gesperrt, wenn sein Zeitraum nicht läuft, kein Admin-Modus an ist und keine Coin-Freischaltung gilt
function eintragGesperrt(eintrag) {
  return Boolean(eintrag?.zeitraum) && !adminAktiv() && !zeitraumVerfuegbar(eintrag.zeitraum) && !freischaltungBis(eintrag.label);
}

function coinsAbziehen(menge) {
  const stand = coinsLesen();
  if (menge > stand) return false;
  try {
    localStorage.setItem("rezeptecoins", String(stand - menge));
  } catch {
    return false;
  }
  coinsAnzeigen();
  return true;
}

function seiteFreischalten(label) {
  const eintrag = navigationFlach().find(e => e.label === label);
  if (!eintrag || !eintragGesperrt(eintrag) || !coinsAbziehen(FREISCHALT_PREIS)) return;

  const liste = freischaltungenLaden();
  liste[label] = Date.now() + FREISCHALT_DAUER_MS;
  try {
    localStorage.setItem("freischaltungen", JSON.stringify(liste));
  } catch {
    // Speichern geht nicht: Coins zurückgeben statt sie zu verlieren
    localStorage.setItem("rezeptecoins", String(coinsLesen() + FREISCHALT_PREIS));
    coinsAnzeigen();
    return;
  }
  zeitraumSperrenAktualisieren();
}

function freischaltBlock(eintrag) {
  const stand = coinsLesen();
  const fehlt = FREISCHALT_PREIS - stand;
  const unten = fehlt <= 0
    ? `<button type="button" class="kochmodus-knopf" id="freischalten-knopf" data-label="${htmlEscape(eintrag.label)}">🔓 Für ${FREISCHALT_PREIS} Coins 24 Stunden öffnen</button>`
    : `<p>Dir fehlen noch ${fehlt} Coins. <a href="../rezeptegames/index.html">Zu den Spielen</a></p>`;

  return `<div class="freischalten"><p>Mit Coins kannst du ${htmlEscape(eintrag.label)} für 24 Stunden öffnen. Du hast ${stand} Coins.</p>${unten}</div>`;
}

function freischaltHinweis(eintrag) {
  const bis = freischaltungBis(eintrag?.label);
  if (!bis || adminAktiv() || zeitraumVerfuegbar(eintrag.zeitraum)) return "";

  const zeit = new Date(bis).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return `<p class="freischalten-hinweis">🔓 Mit Coins freigeschaltet bis ${htmlEscape(zeit)} Uhr.</p>`;
}

// ---------- Coin-Vorteil: Rezept drucken (pro Rezept, dauerhaft) ----------

const DRUCK_PREIS = 30;

function druckFreigaben() {
  try {
    const liste = JSON.parse(localStorage.getItem("druckfreigaben"));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function druckFrei(rezept) {
  return adminAktiv() || druckFreigaben().includes(rezeptId(rezept));
}

function druckFreischalten(id) {
  const rezept = alleRezepteGlobal.find(r => rezeptId(r) === id);
  if (!rezept || druckFrei(rezept) || !coinsAbziehen(DRUCK_PREIS)) return;

  try {
    localStorage.setItem("druckfreigaben", JSON.stringify([...druckFreigaben(), id]));
  } catch {
    // Speichern geht nicht: Coins zurückgeben statt sie zu verlieren
    localStorage.setItem("rezeptecoins", String(coinsLesen() + DRUCK_PREIS));
    coinsAnzeigen();
    return;
  }
  rezeptDetailRendern();
}

// Knöpfe unter den Rezeptdaten: Kochmodus und Drucken
function aktionenHtml(rezept) {
  const knoepfe = [];
  if (rezept.schritte?.length) {
    knoepfe.push('<button type="button" class="kochmodus-knopf" id="kochmodus-starten">▶ Kochmodus</button>');
  }

  if (rezept.zutaten?.length || rezept.schritte?.length) {
    const id = htmlEscape(rezeptId(rezept));
    const fehlt = DRUCK_PREIS - coinsLesen();
    if (druckFrei(rezept)) {
      knoepfe.push(`<button type="button" class="kochmodus-knopf druck-knopf" id="drucken-knopf" data-aktion="drucken" data-id="${id}">🖨 Drucken</button>`);
    } else if (fehlt <= 0) {
      knoepfe.push(`<button type="button" class="kochmodus-knopf druck-knopf" id="drucken-knopf" data-aktion="freischalten" data-id="${id}">🔓 Drucken freischalten (${DRUCK_PREIS} Coins)</button>`);
    } else {
      knoepfe.push(`<button type="button" class="kochmodus-knopf druck-knopf" disabled title="Dir fehlen noch ${fehlt} Coins">🖨 Drucken ab ${DRUCK_PREIS} Coins</button>`);
    }
  }
  return knoepfe.length ? `<div class="rezept-aktionen">${knoepfe.join("")}</div>` : "";
}

// Eintrag der aktuellen Seite aus navigation.json; ohne Zeitraum ist die Seite immer verfügbar
let aktuellerEintrag = null;

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

// ---------- Favoriten (nur im Browser gespeichert) ----------

function favoritenLaden() {
  try {
    const liste = JSON.parse(localStorage.getItem("favoriten"));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function favoritUmschalten(id) {
  const liste = favoritenLaden();
  const neu = liste.includes(id) ? liste.filter(f => f !== id) : [...liste, id];
  try {
    localStorage.setItem("favoriten", JSON.stringify(neu));
  } catch {
    // Ohne Browser-Speicher (z. B. privates Fenster) wird der Favorit nicht gemerkt
  }
  return neu.includes(id);
}

function herzKnopf(rezept, klasse = "") {
  const id = rezeptId(rezept);
  const aktiv = favoritenLaden().includes(id);
  return `<button type="button" class="herz ${klasse}" data-id="${htmlEscape(id)}" aria-pressed="${aktiv}" aria-label="Als Favorit merken" title="Als Favorit merken">♥</button>`;
}

// ---------- Schwierigkeit ----------

const SCHWIERIGKEIT = ["einfach", "mittel", "anspruchsvoll"];

function schwierigkeitStufe(rezept) {
  const stufe = Math.round(Number(rezept.schwierigkeit));
  return stufe >= 1 && stufe <= 3 ? stufe : 0;
}

function sterne(stufe) {
  return "★".repeat(stufe) + "☆".repeat(3 - stufe);
}

// ---------- Portionen umrechnen ----------

const BRUECHE = [[0.125, "1/8"], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"]];

function mengeFormat(wert) {
  const ganz = Math.floor(wert);
  const rest = wert - ganz;

  if (rest < 0.02) return String(ganz);
  if (rest > 0.98) return String(ganz + 1);

  const bruch = BRUECHE.find(([zahl]) => Math.abs(rest - zahl) < 0.02);
  if (bruch) return ganz > 0 ? `${ganz} ${bruch[1]}` : bruch[1];

  return String(Math.round(wert * 100) / 100).replace(".", ",");
}

// Skaliert die Zahl am Anfang einer Zutat ("100 g Mehl", "1/2 l Milch", "1 1/2 EL Zucker"); alles andere bleibt
function zutatSkalieren(text, faktor) {
  if (faktor === 1) return text;

  const treffer = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?=\s)/);
  if (!treffer) return text;

  const roh = treffer[1];
  let wert;
  if (roh.includes("/")) {
    const teile = roh.split(/\s+/);
    const [zaehler, nenner] = teile[teile.length - 1].split("/").map(Number);
    wert = (teile.length > 1 ? Number(teile[0]) : 0) + zaehler / nenner;
  } else {
    wert = Number(roh.replace(",", "."));
  }
  const rest = text.slice(roh.length);
  // Gramm und Milliliter als ganze Zahl statt als Bruch
  if (/^\s+(g|ml)\b/.test(rest)) return Math.round(wert * faktor) + rest;
  return mengeFormat(wert * faktor) + rest;
}

let detailRezept = null;
let detailPortionen = null;

function zutatenListeHtml() {
  const faktor = detailRezept.portionen && detailPortionen ? detailPortionen / detailRezept.portionen : 1;
  return detailRezept.zutaten.map(z => `<li>${htmlEscape(zutatSkalieren(z, faktor))}</li>`).join("");
}

function portionenAendern(schritt) {
  if (!detailRezept || !detailPortionen) return;

  detailPortionen = Math.min(24, Math.max(1, detailPortionen + schritt));
  document.getElementById("portionen-wert").textContent = detailPortionen;
  document.getElementById("zutaten-liste").innerHTML = zutatenListeHtml();
  leinwandAnordnen();
}

function rezeptKarte(rezept) {
  const punktFarbe = farbeGueltig(navigationFlach().find(e => e.label === rezept.kategorie)?.farbe);
  const punktStil = punktFarbe ? ` style="background: ${punktFarbe}; color: ${punktFarbe}"` : "";
  const titel = htmlEscape(rezept.titel);
  const link = rezeptLink(rezept);
  const bild = rezept.bild
    ? `<img src="${htmlEscape(sichereUrl(rezept.bild))}" alt="${titel}" loading="lazy">`
    : '<div class="karte-bild-leer"></div>';
  const dauer =rezept.dauer ? ` · ${htmlEscape(rezept.dauer)} Min` : "";
  const stufe = schwierigkeitStufe(rezept);
  const schwierigkeit = stufe
    ? ` · <span title="Schwierigkeit: ${SCHWIERIGKEIT[stufe - 1]}" aria-label="Schwierigkeit: ${SCHWIERIGKEIT[stufe - 1]}">${sterne(stufe)}</span>`
    : "";

  return `
    <article class="karte">
      ${herzKnopf(rezept)}
      <a class="karte-bildlink" href="${link}" tabindex="-1" aria-hidden="true">${bild}</a>
      <div class="karte-inhalt">
        <h2><a href="${link}">${titel}</a></h2>
        <span class="kategorie-label">
          <span class="punkt"${punktStil}></span>
          ${htmlEscape(rezept.kategorie)}${dauer}${schwierigkeit}
        </span>
        <div class="karte-buttons">
          <a class="button" href="${link}">Ansehen</a>
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
let nurFavoriten = false;

function gridRendern() {
  const grid = document.getElementById("rezepte-grid");
  if (!grid) return;

  const filterLeiste = document.getElementById("filter-leiste");
  const suche = (document.getElementById("suche")?.value || "").trim().toLowerCase();
  const gesperrt = eintragGesperrt(aktuellerEintrag);

  const favoriten = favoritenLaden();
  const kategorieRezepte = alleRezepteGlobal.filter(r =>
    (!aktuellerKategorieFilter || r.kategorie === aktuellerKategorieFilter) &&
    (!nurFavoriten || (favoriten.includes(rezeptId(r)) && !eintragGesperrt(navigationFlach().find(e => e.label === r.kategorie))))
  );
  if (filterLeiste) filterLeiste.hidden = gesperrt || !kategorieRezepte.length;

  if (gesperrt) {
    grid.innerHTML = `<p class="leer-hinweis">${htmlEscape(gesperrtText("Diese Seite", aktuellerEintrag.zeitraum))}</p>${freischaltBlock(aktuellerEintrag)}`;
  } else {
    const rezepte = kategorieRezepte.filter(r =>
      (!suche || r.titel.toLowerCase().includes(suche)) &&
      [...aktiveFilter].every(key => FILTER.find(f => f.key === key).passt(r))
    );

    const hinweis = freischaltHinweis(aktuellerEintrag);
    if (rezepte.length) {
      grid.innerHTML = hinweis + rezepte.map(rezeptKarte).join("");
    } else {
      const leer = nurFavoriten ? "Noch keine Favoriten. Tippe bei einem Rezept auf das Herz." : "Noch keine Rezepte hier.";
      const text = kategorieRezepte.length ? "Keine Rezepte passen zu Suche und Filter." : leer;
      grid.innerHTML = `${hinweis}<p class="leer-hinweis">${text}</p>`;
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
  akzentSetzen(kategorieEintrag?.farbe);
  const zurueck = `<a class="zurueck-link" href="${htmlEscape(kategorieEintrag?.href || "index.html")}">← ${htmlEscape(rezept.kategorie)}</a>`;

  if (eintragGesperrt(kategorieEintrag)) {
    container.innerHTML = `${zurueck}<p class="leer-hinweis">${htmlEscape(gesperrtText("Dieses Rezept", kategorieEintrag.zeitraum))}</p>${freischaltBlock(kategorieEintrag)}`;
    document.title = "Rezept – Meine Rezepte";
    leinwandAnordnen();
    return;
  }

  if (detailRezept !== rezept) {
    detailRezept = rezept;
    detailPortionen = rezept.portionen || null;
  }
  const mitRegler = Boolean(rezept.zutaten?.length && rezept.portionen);
  const stufe = schwierigkeitStufe(rezept);

  const meta = [
    rezept.kategorie,
    rezept.dauer ? `${rezept.dauer} Min` : null,
    rezept.portionen && !mitRegler ? `${rezept.portionen} Portionen` : null,
    stufe ? `Schwierigkeit: ${sterne(stufe)} (${SCHWIERIGKEIT[stufe - 1]})` : null,
    ...(rezept.tags || []).map(t => t.charAt(0).toUpperCase() + t.slice(1))
  ].filter(Boolean).map(t => `<span class="rezept-meta-chip">${htmlEscape(t)}</span>`).join("");

  const regler = mitRegler
    ? `<div class="portionen-regler">
        <span>Portionen</span>
        <button type="button" data-portionen="-1" aria-label="Eine Portion weniger">−</button>
        <output id="portionen-wert" aria-live="polite">${detailPortionen}</output>
        <button type="button" data-portionen="1" aria-label="Eine Portion mehr">+</button>
      </div>`
    : "";

  const liste = (tag, eintraege) => eintraege?.length
    ? `<${tag}>${eintraege.map(e => `<li>${htmlEscape(e)}</li>`).join("")}</${tag}>`
    : "";
  container.innerHTML = `
    ${zurueck}
    <h1 class="leinwand-h1 rezept-titel">${htmlEscape(rezept.titel)}</h1>
    <div class="rezept-meta">${meta}${herzKnopf(rezept, "herz-gross")}</div>
    ${aktionenHtml(rezept)}
    ${rezept.bild ? `<img class="rezept-bild" src="${htmlEscape(sichereUrl(rezept.bild))}" alt="${htmlEscape(rezept.titel)}">` : ""}
    ${rezept.zutaten?.length ? `<h2 class="rezept-abschnitt">Zutaten</h2>${regler}<ul id="zutaten-liste">${zutatenListeHtml()}</ul>` : ""}
    ${rezept.schritte?.length ? `<h2 class="rezept-abschnitt">Zubereitung</h2>${liste("ol", rezept.schritte)}` : ""}
    ${rezept.quelle ? `<p class="rezept-quelle">Quelle: ${htmlEscape(rezept.quelle)}</p>` : ""}
    <p class="druck-hinweis">Die Druckansicht ist für dieses Rezept noch nicht freigeschaltet. Auf der Rezeptseite lässt sie sich mit Coins öffnen.</p>
  `;
  // Ist das Drucken nicht freigeschaltet, zeigt der Druck nur den Hinweis (siehe @media print in style.css)
  document.documentElement.toggleAttribute("data-druck-gesperrt", !druckFrei(rezept));
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

  const verfuegbar = alleRezepteGlobal.filter(r => !eintragGesperrt(navigationFlach().find(e => e.label === r.kategorie)));

  if (!verfuegbar.length) {
    hinweis.textContent = "Noch keine Rezepte verfügbar.";
    return;
  }
  location.href = rezeptLink(verfuegbar[Math.floor(Math.random() * verfuegbar.length)]);
}

function geradeOffenRendern() {
  const container = document.getElementById("gerade-offen");
  if (!container) return;

  const tagMonat = md => {
    const [monat, tag] = md.split("-").map(Number);
    return `${tag}. ${MONATE_LANG[monat - 1]}`;
  };
  const offen = navigationFlach().filter(e => e.zeitraum && zeitraumVerfuegbar(e.zeitraum));

  const inhalt = offen.length
    ? offen.map(e => `<a class="offen-karte" href="${htmlEscape(e.href)}"><strong>${htmlEscape(e.label)}</strong><small>noch bis ${htmlEscape(tagMonat(e.zeitraum.bis))}</small></a>`).join("")
    : '<p class="leer-hinweis">Gerade ist keine Fest- oder Jahreszeitenseite offen.</p>';

  container.innerHTML = `<h2 class="gerade-offen-titel">Gerade offen</h2><div class="gerade-offen-liste">${inhalt}</div>`;
}

// ---------- Kochmodus: ein Schritt pro Bildschirm, Bildschirm bleibt an ----------

let wakeLock = null;
let kochmodusOffen = false;

async function bildschirmWachhalten(an) {
  try {
    if (an && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!an && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // Vom Browser abgelehnt (z. B. Energiesparmodus): der Kochmodus läuft trotzdem
  }
  return Boolean(wakeLock);
}

// Der Browser gibt die Sperre frei, sobald der Tab verdeckt wird; beim Zurückkommen neu anfordern
document.addEventListener("visibilitychange", () => {
  if (kochmodusOffen && document.visibilityState === "visible") {
    bildschirmWachhalten(true).then(aktualisiereKochmodusHinweis);
  }
});

function aktualisiereKochmodusHinweis(aktiv) {
  const hinweis = document.getElementById("kochmodus-hinweis");
  if (!hinweis) return;

  hinweis.textContent = aktiv
    ? "Bildschirm bleibt an"
    : ("wakeLock" in navigator ? "Bildschirm konnte nicht wachgehalten werden" : "Dein Browser kann den Bildschirm nicht wachhalten");
}

function kochmodusOeffnen() {
  if (!detailRezept?.schritte?.length || kochmodusOffen) return;

  const rezept = detailRezept;
  const seiten = [
    {
      titel: `Zutaten${detailPortionen ? ` für ${detailPortionen} Portionen` : ""}`,
      html: rezept.zutaten?.length ? `<ul class="kochmodus-zutaten">${zutatenListeHtml()}</ul>` : ""
    },
    ...rezept.schritte.map((text, i) => ({
      titel: `Schritt ${i + 1} von ${rezept.schritte.length}`,
      html: `<p class="kochmodus-text">${htmlEscape(text)}</p>`
    }))
  ];
  if (!seiten[0].html) seiten.shift();

  let index = 0;
  const overlay = document.createElement("div");
  overlay.className = "kochmodus";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `Kochmodus: ${rezept.titel}`);
  overlay.innerHTML = `
    <header class="kochmodus-kopf">
      <div>
        <strong class="kochmodus-rezept">${htmlEscape(rezept.titel)}</strong>
        <small id="kochmodus-hinweis" role="status"></small>
      </div>
      <button type="button" class="kochmodus-zu" aria-label="Kochmodus schließen">✕</button>
    </header>
    <div class="kochmodus-fortschritt"><span></span></div>
    <main class="kochmodus-inhalt" aria-live="polite">
      <h2 class="kochmodus-titel"></h2>
      <div class="kochmodus-seite"></div>
    </main>
    <footer class="kochmodus-fuss">
      <button type="button" class="kochmodus-zurueck">← Zurück</button>
      <button type="button" class="kochmodus-weiter">Weiter →</button>
    </footer>
  `;

  const titel = overlay.querySelector(".kochmodus-titel");
  const seite = overlay.querySelector(".kochmodus-seite");
  const balken = overlay.querySelector(".kochmodus-fortschritt span");
  const zurueck = overlay.querySelector(".kochmodus-zurueck");
  const weiter = overlay.querySelector(".kochmodus-weiter");

  function zeigen() {
    titel.textContent = seiten[index].titel;
    seite.innerHTML = seiten[index].html;
    balken.style.width = `${((index + 1) / seiten.length) * 100}%`;
    zurueck.disabled = index === 0;
    weiter.textContent = index === seiten.length - 1 ? "Fertig ✓" : "Weiter →";
    overlay.querySelector(".kochmodus-inhalt").scrollTop = 0;
  }

  function schliessen() {
    document.removeEventListener("keydown", taste);
    overlay.remove();
    document.body.style.overflow = "";
    kochmodusOffen = false;
    bildschirmWachhalten(false);
    document.getElementById("kochmodus-starten")?.focus();
  }

  function vor() {
    if (index === seiten.length - 1) schliessen();
    else { index += 1; zeigen(); }
  }

  function taste(e) {
    if (e.key === "Escape") schliessen();
    else if (e.key === "ArrowRight") vor();
    else if (e.key === "ArrowLeft" && index > 0) { index -= 1; zeigen(); }
  }

  zurueck.addEventListener("click", () => { index -= 1; zeigen(); });
  weiter.addEventListener("click", vor);
  overlay.querySelector(".kochmodus-zu").addEventListener("click", schliessen);
  document.addEventListener("keydown", taste);

  // Wischen am Handy: nach links = weiter, nach rechts = zurück
  let startX = null;
  overlay.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener("touchend", e => {
    if (startX === null) return;
    const diff = e.changedTouches[0].clientX - startX;
    startX = null;
    if (diff < -60) vor();
    else if (diff > 60 && index > 0) { index -= 1; zeigen(); }
  }, { passive: true });

  document.body.append(overlay);
  document.body.style.overflow = "hidden";
  kochmodusOffen = true;
  zeigen();
  weiter.focus();
  bildschirmWachhalten(true).then(aktualisiereKochmodusHinweis);
}

function interaktionenInitialisieren() {
  document.addEventListener("click", e => {
    if (e.target.closest("#kochmodus-starten")) {
      kochmodusOeffnen();
      return;
    }

    const drucken = e.target.closest("#drucken-knopf");
    if (drucken) {
      if (drucken.dataset.aktion === "drucken") window.print();
      else druckFreischalten(drucken.dataset.id);
      return;
    }

    const freischalten = e.target.closest("#freischalten-knopf");
    if (freischalten) {
      seiteFreischalten(freischalten.dataset.label);
      return;
    }

    const herz = e.target.closest(".herz");
    if (herz) {
      const id = herz.dataset.id;
      const aktiv = favoritUmschalten(id);
      document.querySelectorAll(".herz").forEach(h => {
        if (h.dataset.id === id) h.setAttribute("aria-pressed", String(aktiv));
      });
      if (nurFavoriten) gridRendern();
      return;
    }

    const schritt = e.target.closest("[data-portionen]");
    if (schritt) portionenAendern(Number(schritt.dataset.portionen));
  });
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

// Münzstand der Schwesterseite Rezepte-Spiele (gleiche Herkunft, gleicher localStorage-Schlüssel)
function coinsLesen() {
  try {
    const zahl = parseInt(localStorage.getItem("rezeptecoins"), 10);
    return zahl > 0 ? zahl : 0;
  } catch {
    return 0;
  }
}

function coinsAnzeigen() {
  document.querySelectorAll("[data-coins]").forEach(el => { el.textContent = coinsLesen(); });
}

window.addEventListener("storage", coinsAnzeigen);

function seitenleisteLink(eintrag, aktiveSeite) {
  const aktiv = eintrag.href === aktiveSeite;
  const zeitraum = eintrag.zeitraum;
  const zeitraumAttribut = zeitraum ? ` data-zeitraum="${htmlEscape(zeitraum.von)}|${htmlEscape(zeitraum.bis)}"` : "";
  const hinweis = zeitraum ? `<small>${htmlEscape(zeitraumText(zeitraum, MONATE_KURZ))}</small><small class="countdown"></small>` : "";
  const farbe = farbeGueltig(eintrag.farbe);
  const farbeAttribut = farbe ? ` style="--farbe: ${farbe}"` : "";
  return `<a class="seitenleiste-link${aktiv ? " aktiv" : ""}${farbe ? " mit-farbe" : ""}"${farbeAttribut} href="${htmlEscape(eintrag.href)}" data-href="${htmlEscape(eintrag.href)}"${zeitraumAttribut}${aktiv ? ' aria-current="page"' : ""}>${htmlEscape(eintrag.label)}${hinweis}</a>`;
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
    const eintrag = navigationFlach().find(e => e.href === link.dataset.href);
    const frei = !eintragGesperrt(eintrag);

    const tage = tageBisStart({ von, bis });
    link.querySelector(".countdown").textContent = frei ? "" : (tage === 1 ? "Noch 1 Tag" : `Noch ${tage} Tage`);
    link.classList.toggle("gesperrt", !frei);
    // Gesperrte Links führen weiter zur Seite: dort lässt sich die Seite mit Coins öffnen
    link.setAttribute("href", link.dataset.href);
    if (frei) link.removeAttribute("title");
    else link.setAttribute("title", `Gesperrt: mit ${FREISCHALT_PREIS} Coins für 24 Stunden öffnen`);
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
    <a class="seitenleiste-coins" href="../rezeptegames/index.html" title="Zu den Rezepte-Spielen"><span class="coin-symbol"></span><strong data-coins>0</strong> Coins</a>
    <button type="button" class="seitenleiste-link seitenleiste-zufall">🎲 Zufalls-Rezept</button>
    <p class="seitenleiste-hinweis" role="status"></p>
    <nav aria-label="Hauptnavigation">${seitenleisteMarkup()}</nav>
  `;

  document.body.append(knopf, hintergrund, leiste);
  coinsAnzeigen();

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
    // Die Höhe ist erst nach dem Laden bekannt, danach muss die Leinwand neu anordnen
    bild.addEventListener("load", leinwandAnordnen);
    div.appendChild(bild);
  } else if (element.typ === "ueber-uns") {
    div.innerHTML = `
      <section class="ueber-uns">
        <h2>${htmlEscape(element.titel)}</h2>
        ${String(element.text ?? "").split("\n").map(absatz => `<p>${htmlEscape(absatz)}</p>`).join("")}
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
  } else if (element.typ === "gerade-offen") {
    div.innerHTML = '<div id="gerade-offen"></div>';
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

  const seitenEintrag = navigationFlach().find(e => e.href === aktiveDatei());
  aktuellerEintrag = seitenEintrag || null;
  akzentSetzen(seitenEintrag?.farbe);

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
  const gridElement = elemente.find(e => e.typ === "rezept-grid");
  aktuellerKategorieFilter = gridElement?.kategorie || null;
  nurFavoriten = Boolean(gridElement?.nurFavoriten);
  gridRendern();
  rezeptDetailRendern();
  geradeOffenRendern();
  interaktionenInitialisieren();

  seitenleisteInitialisieren();
  sucheInitialisieren();
  adminModusInitialisieren();
  seitenleisteSperrenAktualisieren();
  leinwandAnordnen();
}
