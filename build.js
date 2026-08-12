const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const CONTENT_DIR = path.join(ROOT, "content", "noticias");
const SITE_URL = "https://ramosarizpealdia.com";
const TIME_ZONE = "America/Monterrey";
const LOCAL_OFFSET = "-06:00";

const CATEGORIES = [
  "México",
  "Coahuila",
  "Ramos Arizpe",
  "Saltillo",
  "Región Sureste",
  "Política",
  "Seguridad",
  "Economía",
  "Estados",
  "Mundo",
  "Opinión"
];

const MAIN_NAV = [
  ["Inicio", "/"],
  ["México", "/mexico/"],
  ["Coahuila", "/coahuila/"],
  ["Ramos Arizpe", "/ramos-arizpe/"],
  ["Saltillo", "/saltillo/"],
  ["Seguridad", "/seguridad/"],
  ["Política", "/politica/"],
  ["Economía", "/economia/"]
];

const MORE_NAV = [
  ["Región Sureste", "/region-sureste/"],
  ["Estados", "/estados/"],
  ["Mundo", "/mundo/"],
  ["Opinión", "/opinion/"]
];

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(value = "") {
  return escapeHtml(value);
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripQuotes(value) {
  const s = String(value ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const inner = s.slice(1, -1);
    if (s.startsWith('"')) {
      try { return JSON.parse(s); } catch (_) { return inner; }
    }
    return inner.replace(/''/g, "'");
  }
  return s;
}

function parseScalar(value) {
  const s = String(value ?? "").trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return "";
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(v => stripQuotes(v.trim())).filter(Boolean);
  }
  return stripQuotes(s);
}

/**
 * Parser compatible con el front matter de Decap CMS.
 *
 * Corrige un caso importante:
 *
 * title: Texto muy largo que Decap parte aquí
 *   y continúa en la siguiente línea
 *
 * El parser anterior sólo tomaba la primera línea.
 * Este parser une las líneas indentadas que pertenecen al mismo campo.
 */
function parseFrontMatter(raw, filename) {
  const normalized = String(raw).replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    throw new Error(`Front matter faltante en ${filename}`);
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`Front matter sin cerrar en ${filename}`);
  }

  const headerLines = normalized.slice(4, end).split("\n");
  const body = normalized.slice(end + 4).replace(/^\n+/, "");
  const data = {};

  let i = 0;

  while (i < headerLines.length) {
    const rawLine = headerLines[i].replace(/\t/g, "  ");
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const keyMatch = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1];
    const rawValue = (keyMatch[2] ?? "").trim();

    // Texto multilínea YAML con |, |-, > o >-
    if (/^[>|][+-]?$/.test(rawValue)) {
      const folded = rawValue.startsWith(">");
      const block = [];
      i++;

      while (i < headerLines.length) {
        const candidate = headerLines[i].replace(/\t/g, "  ");

        // Nueva clave principal = termina este bloque.
        if (/^[A-Za-z0-9_-]+:\s*/.test(candidate)) break;

        if (!candidate.trim()) {
          block.push("");
          i++;
          continue;
        }

        if (/^\s+/.test(candidate)) {
          block.push(candidate.replace(/^\s+/, ""));
          i++;
          continue;
        }

        break;
      }

      if (folded) {
        data[key] = block
          .join("\n")
          .split(/\n{2,}/)
          .map(p => p.replace(/\n/g, " ").trim())
          .join("\n\n")
          .trim();
      } else {
        data[key] = block.join("\n").trim();
      }

      continue;
    }

    // Valor vacío: puede ser lista YAML.
    if (rawValue === "") {
      const list = [];
      let j = i + 1;

      while (j < headerLines.length) {
        const candidate = headerLines[j].replace(/\t/g, "  ");
        const listMatch = candidate.match(/^\s*-\s+(.*)$/);
        if (!listMatch) break;
        list.push(stripQuotes(listMatch[1]));
        j++;
      }

      data[key] = list.length ? list : "";
      i = j;
      continue;
    }

    // Valor normal + posibles líneas de continuación indentadas.
    const continuation = [];
    let j = i + 1;

    while (j < headerLines.length) {
      const candidate = headerLines[j].replace(/\t/g, "  ");

      // Si es una nueva clave principal, termina.
      if (/^[A-Za-z0-9_-]+:\s*/.test(candidate)) break;

      // Si inicia una lista, no pertenece al scalar actual.
      if (/^\s*-\s+/.test(candidate)) break;

      if (/^\s+/.test(candidate) && candidate.trim()) {
        continuation.push(candidate.trim());
        j++;
        continue;
      }

      break;
    }

    const fullValue = [rawValue, ...continuation].join(" ").trim();
    data[key] = parseScalar(fullValue);
    i = j;
  }

  return { data, body };
}

function normalizeAssetPath(value = "") {
  let s = String(value || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.startsWith("data:")) return s;

  s = s.replace(/\\/g, "/");
  s = s.replace(/^\.?\//, "");

  if (s.startsWith("public/")) s = s.slice("public/".length);
  if (!s.startsWith("uploads/") && s.includes("/uploads/")) {
    s = s.slice(s.indexOf("uploads/"));
  }

  return `/${s.replace(/^\/+/, "")}`;
}

function localAssetFile(assetPath) {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized || /^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) return null;
  return path.join(ROOT, normalized.replace(/^\/+/, ""));
}

function offsetToMinutes(offset) {
  if (offset === "Z" || offset === "z") return 0;
  const m = String(offset).match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) throw new Error(`Offset inválido: ${offset}`);
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function createInstant(year, month, day, hour, minute, second, offset = LOCAL_OFFSET) {
  const offsetMinutes = offsetToMinutes(offset);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida");
  return d;
}

function parsePublished(value, filename = "") {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`Falta fecha de publicación${filename ? ` en ${filename}` : ""}`);

  let m;

  // DD/MM/YYYYT14:00 o DD/MM/YYYY 14:00
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yyyy, hh, min, sec = "00"] = m;
    return createInstant(+yyyy, +mm, +dd, +hh, +min, +sec, LOCAL_OFFSET);
  }

  // YYYY-MM-DD HH:mm:ss -0600
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2}:?\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd, hh, min, sec = "00", offset] = m;
    return createInstant(+yyyy, +mm, +dd, +hh, +min, +sec, offset);
  }

  // ISO con offset/Z
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i);
  if (m) {
    const [, yyyy, mm, dd, hh, min, sec = "00", offset] = m;
    return createInstant(+yyyy, +mm, +dd, +hh, +min, +sec, offset);
  }

  // ISO local sin zona: se asume Ramos Arizpe/Saltillo.
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, yyyy, mm, dd, hh, min, sec = "00"] = m;
    return createInstant(+yyyy, +mm, +dd, +hh, +min, +sec, LOCAL_OFFSET);
  }

  throw new Error(`Fecha no reconocida "${raw}"${filename ? ` en ${filename}` : ""}`);
}

function formatDate(value, withTime = false) {
  const d = value instanceof Date ? value : parsePublished(value);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  }).format(d);
}

function formatTime(value) {
  const d = value instanceof Date ? value : parsePublished(value);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
}

function currentLocalDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(now);
  return parts.charAt(0).toUpperCase() + parts.slice(1);
}

function markdownInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  return s;
}

function renderMarkdown(markdown = "") {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    out.push(`<p>${markdownInline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    out.push(`<${tag}>${listItems.map(item => `<li>${markdownInline(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    listType = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(ul[1]);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ol[1]);
      continue;
    }

    const quote = line.match(/^\s*>\s*(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${markdownInline(quote[1])}</blockquote>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      continue;
    }

    if (listType) flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return out.join("\n");
}

function readNotes() {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  return fs.readdirSync(CONTENT_DIR)
    .filter(name => name.endsWith(".md"))
    .map(filename => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf8");
      const { data, body } = parseFrontMatter(raw, filename);

      const title = String(data.title || "").trim();
      const category = String(data.category || "").trim();
      if (!title) throw new Error(`Falta title en ${filename}`);
      if (!category) throw new Error(`Falta category en ${filename}`);
      if (!CATEGORIES.includes(category)) {
        throw new Error(`Categoría desconocida "${category}" en ${filename}`);
      }

      const dateRaw = String(data.date || "").trim();
      const published = parsePublished(dateRaw, filename);

      let extraSections = Array.isArray(data.sections) ? data.sections : [];
      extraSections = extraSections.filter(section => CATEGORIES.includes(section));
      const sections = [...new Set([category, ...extraSections])];

      return {
        filename,
        slug: filename.replace(/\.md$/i, ""),
        title,
        summary: String(data.summary || "").trim(),
        category,
        sections,
        author: String(data.author || "Ramos Arizpe al Día").trim(),
        dateRaw,
        published,
        image: normalizeAssetPath(data.image || ""),
        imageCaption: String(data.image_caption || "").trim(),
        relatedUrl: String(data.related_url || "").trim(),
        relatedTitle: String(data.related_title || "").trim(),
        relatedImage: normalizeAssetPath(data.related_image || ""),
        relatedAfter: Math.max(1, Number(data.related_after || 2) || 2),
        featured: data.featured === true || String(data.featured).toLowerCase() === "true",
        body
      };
    })
    .sort((a, b) => b.published.getTime() - a.published.getTime());
}

function articleUrl(note) {
  return `/${slugify(note.category)}/${note.slug}/`;
}

function noteInSection(note, category) {
  return note.sections.includes(category);
}

function notesFor(notes, category) {
  return notes.filter(note => noteInSection(note, category));
}

function img(note, className, fallback = "FOTOGRAFÍA") {
  if (!note.image) return `<div class="${className} placeholder"><span>${fallback}</span></div>`;

  const localFile = localAssetFile(note.image);
  if (localFile && !fs.existsSync(localFile)) {
    return `<div class="${className} placeholder"><span>${fallback}</span></div>`;
  }

  return `<img class="${className}" src="${escapeHtml(note.image)}" alt="${escapeHtml(note.title)}" loading="lazy">`;
}

function navHtml() {
  const links = MAIN_NAV.map(([label, href], i) =>
    `<a${i === 0 ? ' class="active"' : ""} href="${href}">${escapeHtml(label)}</a>`
  ).join("");

  const more = MORE_NAV.map(([label, href]) =>
    `<a href="${href}">${escapeHtml(label)}</a>`
  ).join("");

  return `<div class="nav-shell">
    <div class="container nav-inner">
      <nav class="main-nav" aria-label="Secciones">
        ${links}
        <div class="nav-more">
          <button type="button" class="nav-more-button" aria-expanded="false">Más <span>▾</span></button>
          <div class="nav-more-menu" hidden>${more}</div>
        </div>
      </nav>
    </div>
  </div>`;
}

function headerHtml() {
  return `<div class="utility-bar">
    <div class="container utility-inner">
      <div class="utility-left"><span>${escapeHtml(currentLocalDate())}</span><span class="edition">Edición digital</span></div>
      <div class="utility-right">
        <a href="/quienes-somos/">Quiénes somos</a>
        <a href="/contacto/">Contacto</a>
      </div>
    </div>
  </div>
  <header class="masthead">
    <div class="container masthead-inner">
      <button class="menu-toggle" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span><span></span></button>
      <a class="identity" href="/" aria-label="Ramos Arizpe al Día">
        <img src="/logo-ramos-arizpe-al-dia.jpg" alt="Ramos Arizpe al Día">
        <div class="wordmark"><span class="wordmark-main">RAMOS ARIZPE</span><span class="wordmark-sub">AL DÍA</span></div>
      </a>
      <div class="masthead-actions">
        <a class="social" href="https://www.facebook.com/share/1CWiSRPs4B/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer">Facebook</a>
        <a class="subscribe" href="https://www.facebook.com/share/1CWiSRPs4B/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer">Síguenos</a>
      </div>
    </div>
    ${navHtml()}
  </header>`;
}

function footerHtml() {
  return `<footer class="site-footer">
    <div class="container footer-top">
      <div class="footer-brand">
        <img src="/logo-ramos-arizpe-al-dia.jpg" alt="Ramos Arizpe al Día">
        <div><strong>RAMOS ARIZPE AL DÍA</strong><span>Información de Ramos Arizpe, Saltillo y Coahuila</span></div>
      </div>
      <nav class="footer-links">
        <a href="/quienes-somos/">Quiénes somos</a>
        <a href="/politica-editorial/">Política editorial</a>
        <a href="/contacto/">Contacto</a>
        <a href="/aviso-de-privacidad/">Aviso de privacidad</a>
      </nav>
    </div>
    <div class="container footer-bottom">© ${new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(new Date())} Ramos Arizpe al Día</div>
  </footer>`;
}

function documentHtml({ title, description, canonical, body, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700;8..60,800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=manual-interest-20260811">
  ${extraHead}
  <script defer src="/script.js?v=manual-interest-20260811"></script>
</head>
<body>
${headerHtml()}
${body}
${footerHtml()}
</body>
</html>`;
}

function tickerHtml(notes) {
  const latest = notes.slice(0, 3);
  if (!latest.length) return "";
  return `<section class="ticker">
    <div class="container ticker-inner">
      <span class="ticker-label">AL MOMENTO</span>
      ${latest.map(note => `<a href="${articleUrl(note)}">${escapeHtml(note.title)}</a>`).join('<span class="ticker-sep">•</span>')}
    </div>
  </section>`;
}

function leadHtml(notes) {
  if (!notes.length) return `<section class="container empty-home"><h1>Ramos Arizpe al Día</h1><p>Aún no hay noticias publicadas.</p></section>`;

  const featured = notes.find(note => note.featured) || notes[0];
  const remaining = notes.filter(note => note !== featured);
  const second = remaining[0];
  const third = remaining[1];
  const minute = notes.slice(0, 5);

  return `<section class="container lead-grid">
    <article class="lead-story">
      <a href="${articleUrl(featured)}">
        ${img(featured, "lead-photo", "FOTOGRAFÍA PRINCIPAL")}
        <div class="lead-content">
          <span class="section-label">${escapeHtml(featured.category)}</span>
          <h1>${escapeHtml(featured.title)}</h1>
          ${featured.summary ? `<p>${escapeHtml(featured.summary)}</p>` : ""}
          <div class="byline">Por ${escapeHtml(featured.author)} <span>•</span> ${escapeHtml(formatDate(featured.published, true))}</div>
        </div>
      </a>
    </article>

    <div class="lead-secondary">
      ${second ? `<article class="secondary-story">
        <a href="${articleUrl(second)}">
          ${img(second, "secondary-photo", "FOTO")}
          <span class="section-label">${escapeHtml(second.category)}</span>
          <h2>${escapeHtml(second.title)}</h2>
          <div class="byline">${escapeHtml(second.author)} <span>•</span> ${escapeHtml(formatDate(second.published, true))}</div>
        </a>
      </article>` : ""}
      ${third ? `<article class="secondary-story text-only">
        <a href="${articleUrl(third)}">
          <span class="section-label">${escapeHtml(third.category)}</span>
          <h2>${escapeHtml(third.title)}</h2>
          ${third.summary ? `<p>${escapeHtml(third.summary)}</p>` : ""}
          <div class="byline">${escapeHtml(third.author)} <span>•</span> ${escapeHtml(formatDate(third.published, true))}</div>
        </a>
      </article>` : ""}
    </div>

    <aside class="minute-column">
      <div class="minute-title"><span>AL MINUTO</span><a href="/ultimas/">Ver todo</a></div>
      ${minute.map(note => `<article>
        <time>${escapeHtml(formatTime(note.published))}</time>
        <div><span>${escapeHtml(note.category)}</span><h3><a href="${articleUrl(note)}">${escapeHtml(note.title)}</a></h3></div>
      </article>`).join("")}
    </aside>
  </section>`;
}

function latestHtml(notes) {
  if (!notes.length) return "";
  return `<section class="container section-block">
    <div class="section-header"><div><span class="section-kicker">ACTUALIDAD</span><h2>Últimas noticias</h2></div><a href="/ultimas/">Ver todas →</a></div>
    <div class="news-grid">
      ${notes.slice(0, 9).map(note => `<article class="news-card">
        <a href="${articleUrl(note)}">
          ${img(note, "card-image", "FOTO")}
          <span class="section-label">${escapeHtml(note.category)}</span>
          <h3>${escapeHtml(note.title)}</h3>
          ${note.summary ? `<p>${escapeHtml(note.summary)}</p>` : ""}
          <div class="byline">${escapeHtml(note.author)} <span>•</span> ${escapeHtml(formatDate(note.published))}</div>
        </a>
      </article>`).join("")}
    </div>
  </section>`;
}

function regionalHtml(notes) {
  const pool = notes.filter(note => ["Coahuila", "Ramos Arizpe", "Saltillo", "Región Sureste"].some(c => noteInSection(note, c)));
  if (!pool.length) return "";

  const feature = pool[0];
  const side = pool.slice(1, 4);

  return `<section class="container section-block">
    <div class="section-header">
      <div><span class="section-kicker">NUESTRA REGIÓN</span><h2>Coahuila</h2></div>
      <nav><a href="/coahuila/">Coahuila</a><a href="/ramos-arizpe/">Ramos Arizpe</a><a href="/saltillo/">Saltillo</a><a href="/region-sureste/">Región Sureste</a></nav>
    </div>
    <div class="regional-grid">
      <article class="regional-feature">
        <a href="${articleUrl(feature)}">
          ${img(feature, "regional-photo", "FOTO COAHUILA")}
          <span class="section-label">${escapeHtml(feature.category)}</span>
          <h3>${escapeHtml(feature.title)}</h3>
          ${feature.summary ? `<p>${escapeHtml(feature.summary)}</p>` : ""}
        </a>
      </article>
      <div class="regional-stack">
        ${side.length ? side.map(note => `<article>
          <a class="stack-image" href="${articleUrl(note)}">${img(note, "thumb", "FOTO")}</a>
          <div><span class="section-label">${escapeHtml(note.category)}</span><h4><a href="${articleUrl(note)}">${escapeHtml(note.title)}</a></h4></div>
        </article>`).join("") : `<div class="section-empty">Más información regional aparecerá aquí conforme se publique.</div>`}
      </div>
    </div>
  </section>`;
}

function securityHtml(notes) {
  const list = notesFor(notes, "Seguridad").slice(0, 3);
  if (!list.length) return "";
  const [feature, ...side] = list;

  return `<section class="dark-band">
    <div class="container">
      <div class="section-header inverted"><div><span class="section-kicker">COBERTURA</span><h2>Seguridad</h2></div><a href="/seguridad/">Más noticias →</a></div>
      <div class="dark-grid">
        <article class="dark-feature">
          <a href="${articleUrl(feature)}">
            ${img(feature, "dark-photo", "FOTOGRAFÍA")}
            <span class="section-label">${escapeHtml(feature.category)}</span>
            <h3>${escapeHtml(feature.title)}</h3>
            ${feature.summary ? `<p>${escapeHtml(feature.summary)}</p>` : ""}
          </a>
        </article>
        ${side.map(note => `<article class="dark-card"><span class="section-label">${escapeHtml(note.category)}</span><h4><a href="${articleUrl(note)}">${escapeHtml(note.title)}</a></h4>${note.summary ? `<p>${escapeHtml(note.summary)}</p>` : ""}</article>`).join("")}
      </div>
    </div>
  </section>`;
}

function thematicHtml(notes) {
  const blocks = [];
  for (const category of ["Política", "Economía", "México", "Estados", "Mundo", "Opinión"]) {
    const list = notesFor(notes, category).slice(0, 4);
    if (!list.length) continue;

    blocks.push(`<section class="container section-block">
      <div class="section-header"><div><span class="section-kicker">SECCIÓN</span><h2>${escapeHtml(category)}</h2></div><a href="/${slugify(category)}/">Más noticias →</a></div>
      <div class="news-grid">
        ${list.map(note => `<article class="news-card">
          <a href="${articleUrl(note)}">
            ${img(note, "card-image", "FOTO")}
            <span class="section-label">${escapeHtml(note.category)}</span>
            <h3>${escapeHtml(note.title)}</h3>
            ${note.summary ? `<p>${escapeHtml(note.summary)}</p>` : ""}
          </a>
        </article>`).join("")}
      </div>
    </section>`);
  }
  return blocks.join("");
}

function homepage(notes) {
  const main = `<main>
    ${tickerHtml(notes)}
    ${leadHtml(notes)}
    <div class="container rule"></div>
    ${latestHtml(notes)}
    ${regionalHtml(notes)}
    ${securityHtml(notes)}
    ${thematicHtml(notes)}
  </main>`;

  return documentHtml({
    title: "Ramos Arizpe al Día | Noticias de Ramos Arizpe, Saltillo y Coahuila",
    description: "Noticias de Ramos Arizpe, Saltillo, Coahuila, México, seguridad, política y economía.",
    canonical: `${SITE_URL}/`,
    body: main
  });
}

function categoryPage(category, notes) {
  const list = notesFor(notes, category);
  const cards = list.length ? list.map(note => `<article class="archive-card">
      <a href="${articleUrl(note)}">${img(note, "archive-image", "FOTO")}</a>
      <div>
        <span class="section-label">${escapeHtml(note.category)}</span>
        <h2><a href="${articleUrl(note)}">${escapeHtml(note.title)}</a></h2>
        ${note.summary ? `<p>${escapeHtml(note.summary)}</p>` : ""}
        <div class="byline">Por ${escapeHtml(note.author)} <span>•</span> ${escapeHtml(formatDate(note.published, true))}</div>
      </div>
    </article>`).join("") : `<p class="section-empty">Aún no hay publicaciones en esta sección.</p>`;

  return documentHtml({
    title: `${category} | Ramos Arizpe al Día`,
    description: `Noticias de ${category} publicadas por Ramos Arizpe al Día.`,
    canonical: `${SITE_URL}/${slugify(category)}/`,
    body: `<main class="container archive-page">
      <div class="page-heading"><span class="section-kicker">SECCIÓN</span><h1>${escapeHtml(category)}</h1></div>
      <div class="archive-list">${cards}</div>
    </main>`
  });
}


function normalizeInternalUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, SITE_URL);
    if (url.origin !== SITE_URL) return raw;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function manualInterestHtml(note) {
  if (!note.relatedUrl || !note.relatedTitle) return "";

  const href = normalizeInternalUrl(note.relatedUrl);
  const image = note.relatedImage
    ? `<img src="${escapeHtml(note.relatedImage)}" alt="${escapeHtml(note.relatedTitle)}" loading="lazy">`
    : "";

  return `<aside class="manual-interest" aria-label="Te puede interesar">
    <a href="${escapeHtml(href)}">
      ${image}
      <div class="manual-interest-copy">
        <span>TE PUEDE INTERESAR</span>
        <strong>${escapeHtml(note.relatedTitle)}</strong>
      </div>
    </a>
  </aside>`;
}

function insertInterestBlock(html, block, paragraphNumber = 2) {
  if (!html || !block) return html;

  let count = 0;
  let index = -1;
  const re = /<\/p>/gi;
  let match;

  while ((match = re.exec(html))) {
    count++;
    if (count === paragraphNumber) {
      index = match.index + match[0].length;
      break;
    }
  }

  if (index === -1) return `${html}${block}`;
  return `${html.slice(0, index)}${block}${html.slice(index)}`;
}

function articlePage(note) {
  const canonical = `${SITE_URL}${articleUrl(note)}`;
  const renderedBody = renderMarkdown(note.body);
  const interestBlock = manualInterestHtml(note);
  const articleBodyHtml = interestBlock
    ? insertInterestBlock(renderedBody, interestBlock, note.relatedAfter)
    : renderedBody;

  const imageUrl = note.image
    ? (/^https?:\/\//i.test(note.image) ? note.image : `${SITE_URL}${note.image}`)
    : `${SITE_URL}/logo-ramos-arizpe-al-dia.jpg`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: note.title,
    description: note.summary || note.title,
    datePublished: note.published.toISOString(),
    dateModified: note.published.toISOString(),
    mainEntityOfPage: canonical,
    image: [imageUrl],
    author: { "@type": "Person", name: note.author },
    publisher: {
      "@type": "Organization",
      name: "Ramos Arizpe al Día",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-ramos-arizpe-al-dia.jpg` }
    }
  };

  return documentHtml({
    title: `${note.title} | Ramos Arizpe al Día`,
    description: note.summary || note.title,
    canonical,
    extraHead: `<meta property="og:type" content="article">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="article:published_time" content="${escapeHtml(note.published.toISOString())}">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`,
    body: `<main>
      <article class="container article-page">
        <div class="breadcrumb"><a href="/">Inicio</a> / <a href="/${slugify(note.category)}/">${escapeHtml(note.category)}</a></div>
        <div class="article-sections">${note.sections.map(section => `<a href="/${slugify(section)}/">${escapeHtml(section)}</a>`).join("")}</div>
        <h1>${escapeHtml(note.title)}</h1>
        ${note.summary ? `<p class="article-deck">${escapeHtml(note.summary)}</p>` : ""}
        <div class="article-meta">Por <strong>${escapeHtml(note.author)}</strong> · ${escapeHtml(formatDate(note.published, true))}</div>
        ${note.image && (!localAssetFile(note.image) || fs.existsSync(localAssetFile(note.image))) ? `<figure class="article-media">
          <img class="article-hero" src="${escapeHtml(note.image)}" alt="${escapeHtml(note.imageCaption || note.title)}">
          ${note.imageCaption ? `<figcaption>${escapeHtml(note.imageCaption)}</figcaption>` : ""}
        </figure>` : ""}
        <div class="article-body">${articleBodyHtml}</div>
      </article>
    </main>`
  });
}

function latestPage(notes) {
  return documentHtml({
    title: "Últimas noticias | Ramos Arizpe al Día",
    description: "Las publicaciones más recientes de Ramos Arizpe al Día.",
    canonical: `${SITE_URL}/ultimas/`,
    body: `<main class="container archive-page">
      <div class="page-heading"><span class="section-kicker">ACTUALIDAD</span><h1>Últimas noticias</h1></div>
      <div class="archive-list">
        ${notes.map(note => `<article class="archive-card">
          <a href="${articleUrl(note)}">${img(note, "archive-image", "FOTO")}</a>
          <div><span class="section-label">${escapeHtml(note.category)}</span><h2><a href="${articleUrl(note)}">${escapeHtml(note.title)}</a></h2>${note.summary ? `<p>${escapeHtml(note.summary)}</p>` : ""}<div class="byline">${escapeHtml(formatDate(note.published, true))}</div></div>
        </article>`).join("")}
      </div>
    </main>`
  });
}

function simplePage(slug, title, bodyHtml, description = title) {
  return documentHtml({
    title: `${title} | Ramos Arizpe al Día`,
    description,
    canonical: `${SITE_URL}/${slug}/`,
    body: `<main class="container institutional-page"><h1>${escapeHtml(title)}</h1>${bodyHtml}</main>`
  });
}

function writeFile(relativePath, content) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function copyFileIfExists(name) {
  const source = path.join(ROOT, name);
  if (!fs.existsSync(source)) return;
  const target = path.join(DIST, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirIfExists(name) {
  const source = path.join(ROOT, name);
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, path.join(DIST, name), { recursive: true });
}

function buildSitemaps(notes) {
  const staticUrls = [
    "/",
    "/ultimas/",
    "/quienes-somos/",
    "/contacto/",
    "/politica-editorial/",
    "/aviso-de-privacidad/",
    ...CATEGORIES.map(category => `/${slugify(category)}/`)
  ];

  const urls = [
    ...staticUrls.map(url => `<url><loc>${SITE_URL}${url}</loc></url>`),
    ...notes.map(note => `<url><loc>${SITE_URL}${articleUrl(note)}</loc><lastmod>${note.published.toISOString()}</lastmod></url>`)
  ];

  writeFile("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recent = notes.filter(note => note.published.getTime() >= cutoff);
  const newsUrls = recent.map(note => `<url>
  <loc>${SITE_URL}${articleUrl(note)}</loc>
  <news:news>
    <news:publication><news:name>Ramos Arizpe al Día</news:name><news:language>es</news:language></news:publication>
    <news:publication_date>${note.published.toISOString()}</news:publication_date>
    <news:title>${escapeXml(note.title)}</news:title>
  </news:news>
</url>`);

  writeFile("news-sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${newsUrls.join("")}</urlset>`);

  writeFile("robots.txt", `User-agent: *
Allow: /
Disallow: /admin/
Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/news-sitemap.xml
`);
}

function validateImages(notes) {
  const missing = [];

  for (const note of notes) {
    if (!note.image) continue;
    const file = localAssetFile(note.image);
    if (file && !fs.existsSync(file)) {
      missing.push(`${note.filename}: ${note.image}`);
    }
  }

  if (missing.length) {
    console.warn("ADVERTENCIA: hay imágenes referenciadas que no existen en el repositorio:");
    for (const item of missing) console.warn(`- ${item}`);
    console.warn("La página se generará, pero esas notas mostrarán un espacio de fotografía hasta que el archivo exista en /uploads.");
  }
}

function validateOutput(notes) {
  const home = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const forbidden = [
    "El titular principal del día abre la agenda informativa",
    "La cobertura política se presenta con jerarquía editorial",
    "Industria, inversiones y negocios con especial atención"
  ];
  for (const phrase of forbidden) {
    if (home.includes(phrase)) throw new Error(`Se detectó contenido de demostración: ${phrase}`);
  }
  for (const note of notes.slice(0, Math.min(notes.length, 2))) {
    if (!home.includes(escapeHtml(note.title))) throw new Error(`La portada no contiene la nota real: ${note.title}`);
  }
}

function main() {
  console.log("RAMOS ARIZPE AL DÍA — BUILD LIMPIO v1");

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const notes = readNotes();
  validateImages(notes);
  console.log(`Noticias leídas: ${notes.length}`);
  for (const note of notes) {
    console.log(`- ${formatDate(note.published, true)} | ${note.category} | ${note.title}`);
  }

  copyFileIfExists("styles.css");
  copyFileIfExists("script.js");
  copyFileIfExists("logo-ramos-arizpe-al-dia.jpg");
  copyDirIfExists("uploads");
  copyDirIfExists("admin");

  writeFile("index.html", homepage(notes));
  writeFile("ultimas/index.html", latestPage(notes));

  for (const category of CATEGORIES) {
    writeFile(`${slugify(category)}/index.html`, categoryPage(category, notes));
  }

  for (const note of notes) {
    writeFile(`${slugify(note.category)}/${note.slug}/index.html`, articlePage(note));
  }

  writeFile("quienes-somos/index.html", simplePage(
    "quienes-somos",
    "Quiénes somos",
    `<p>Ramos Arizpe al Día es un medio digital enfocado en informar sobre los acontecimientos de Ramos Arizpe, Saltillo, Coahuila y temas de interés general para sus lectores.</p>
     <p>Nuestro trabajo editorial busca presentar información clara, verificable y de interés público.</p>`,
    "Conoce a Ramos Arizpe al Día y su trabajo informativo."
  ));

  writeFile("contacto/index.html", simplePage(
    "contacto",
    "Contacto",
    `<p>Para información y contacto con Ramos Arizpe al Día, consulta nuestros canales oficiales.</p>
     <p><a class="button-link" href="https://www.facebook.com/share/1CWiSRPs4B/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer">Facebook de Ramos Arizpe al Día</a></p>`,
    "Canales de contacto de Ramos Arizpe al Día."
  ));

  writeFile("politica-editorial/index.html", simplePage(
    "politica-editorial",
    "Política editorial",
    `<p>Ramos Arizpe al Día procura publicar información de interés público con enfoque periodístico, lenguaje neutral y verificación de los datos disponibles.</p>
     <p>Cuando una información se encuentra en desarrollo, puede ser actualizada conforme existan nuevos datos confirmados.</p>`,
    "Principios editoriales de Ramos Arizpe al Día."
  ));

  writeFile("aviso-de-privacidad/index.html", simplePage(
    "aviso-de-privacidad",
    "Aviso de privacidad",
    `<p>Este sitio puede utilizar servicios técnicos necesarios para su funcionamiento. Los datos enviados voluntariamente a través de servicios externos se rigen también por las políticas de dichos proveedores.</p>
     <p>Esta página podrá actualizarse conforme se incorporen nuevas funciones al portal.</p>`,
    "Aviso de privacidad de Ramos Arizpe al Día."
  ));

  buildSitemaps(notes);
  validateOutput(notes);

  console.log("OK: portada generada solo con contenido real.");
  console.log("OK: fechas de las notas permanecen fijas.");
  console.log("OK: secciones, artículos, sitemap y news-sitemap generados.");
}

main();
