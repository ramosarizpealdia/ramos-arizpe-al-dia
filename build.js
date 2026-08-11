const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

const root = process.cwd();
const dist = path.join(root, "dist");
const contentDir = path.join(root, "content", "noticias");

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDate(value) {
  if (!value) return new Date();

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const mx = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/);
  if (mx) {
    const [, dd, mm, yyyy, hh = "00", min = "00"] = mx;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (ymd) {
    const [, yyyy, mm, dd, hh = "00", min = "00"] = ymd;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  console.warn("Fecha no reconocida:", raw, "— se usará la fecha actual para evitar que falle el despliegue.");
  return new Date();
}

function copyFile(name) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) {
    const dest = path.join(dist, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyDir(name) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(dist, name), { recursive: true });
  }
}

function formatDate(dateValue, withTime = false) {
  const d = parseDate(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  }).format(d);
}

function articleURL(note) {
  return `/${slugify(note.category || "noticias")}/${note.slug}/`;
}

function imageMarkup(note, className, fallbackText = "FOTOGRAFÍA") {
  if (note.image) {
    return `<img class="${className} article-cover" src="${esc(note.image)}" alt="${esc(note.title)}" loading="lazy">`;
  }
  return `<div class="${className} placeholder"><span>${fallbackText}</span></div>`;
}

function loadNotes() {
  if (!fs.existsSync(contentDir)) return [];
  return fs.readdirSync(contentDir)
    .filter(f => f.endsWith(".md"))
    .map(filename => {
      const raw = fs.readFileSync(path.join(contentDir, filename), "utf8");
      const parsed = matter(raw);
      const data = parsed.data || {};
      const base = filename.replace(/\.md$/i, "");
      return {
        title: data.title || "Sin título",
        summary: data.summary || "",
        category: data.category || "Noticias",
        author: data.author || "Ramos Arizpe al Día",
        date: data.date || new Date().toISOString(),
        image: data.image || "",
        featured: Boolean(data.featured),
        body: parsed.content || "",
        slug: base
      };
    })
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

function renderLead(notes) {
  if (!notes.length) return null;
  const featured = notes.find(n => n.featured) || notes[0];
  const remaining = notes.filter(n => n !== featured);
  const second = remaining[0];
  const third = remaining[1];
  const minute = notes.slice(0, 4);

  const secondHtml = second ? `
    <article class="secondary-story">
      <a href="${articleURL(second)}">
        ${imageMarkup(second, "secondary-photo", "FOTO")}
        <span class="section-label">${esc(second.category)}</span>
        <h2>${esc(second.title)}</h2>
        <div class="byline">${esc(second.author)} <span>•</span> ${esc(formatDate(second.date))}</div>
      </a>
    </article>` : "";

  const thirdHtml = third ? `
    <article class="secondary-story text-only">
      <a href="${articleURL(third)}">
        <span class="section-label">${esc(third.category)}</span>
        <h2>${esc(third.title)}</h2>
        ${third.summary ? `<p>${esc(third.summary)}</p>` : ""}
        <div class="byline">${esc(third.author)} <span>•</span> ${esc(formatDate(third.date))}</div>
      </a>
    </article>` : "";

  const minuteHtml = minute.map(n => {
    const d = parseDate(n.date);
    const time = Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-MX", { timeZone: "America/Monterrey", hour: "2-digit", minute: "2-digit", hour12: false });
    return `<article><time>${esc(time)}</time><div><span>${esc(n.category)}</span><h3><a href="${articleURL(n)}">${esc(n.title)}</a></h3></div></article>`;
  }).join("\n");

  return `<section class="container lead-grid" id="mexico">
    <article class="lead-story">
      <a href="${articleURL(featured)}">
        ${imageMarkup(featured, "lead-photo", "FOTOGRAFÍA PRINCIPAL")}
        <div class="lead-content">
          <span class="section-label">${esc(featured.category)}</span>
          <h1>${esc(featured.title)}</h1>
          ${featured.summary ? `<p>${esc(featured.summary)}</p>` : ""}
          <div class="byline">${esc(featured.author)} <span>•</span> ${esc(formatDate(featured.date, true))}</div>
        </div>
      </a>
    </article>
    <div class="lead-secondary">${secondHtml}${thirdHtml}</div>
    <aside class="minute-column">
      <div class="minute-title"><span>AL MINUTO</span><span>Últimas publicaciones</span></div>
      ${minuteHtml}
    </aside>
  </section>`;
}

function renderLatest(notes) {
  if (!notes.length) return "";
  return `<section class="container generated-latest" id="ultimas">
    <div class="section-header">
      <div><span class="section-kicker">ACTUALIDAD</span><h2>Últimas noticias</h2></div>
    </div>
    <div class="generated-news-grid">
      ${notes.slice(0, 9).map(n => `
        <article class="generated-news-card">
          <a href="${articleURL(n)}">
            ${imageMarkup(n, "generated-card-image", "FOTO")}
            <div class="generated-card-copy">
              <span class="section-label">${esc(n.category)}</span>
              <h3>${esc(n.title)}</h3>
              ${n.summary ? `<p>${esc(n.summary)}</p>` : ""}
              <div class="byline">${esc(n.author)} <span>•</span> ${esc(formatDate(n.date))}</div>
            </div>
          </a>
        </article>`).join("")}
    </div>
  </section>`;
}


function categoryNotes(notes, category) {
  return notes.filter(n => String(n.category || "").toLowerCase() === String(category).toLowerCase());
}

function noteLink(note, inner) {
  return `<a href="${articleURL(note)}">${inner}</a>`;
}

function renderCoahuilaSection(notes) {
  const coahuila = categoryNotes(notes, "Coahuila");
  const ramos = categoryNotes(notes, "Ramos Arizpe");
  const region = categoryNotes(notes, "Región Sureste");
  const pool = [...coahuila, ...ramos, ...region]
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));

  if (!pool.length) return "";

  const feature = coahuila[0] || pool[0];
  const used = new Set([feature.slug]);
  const stack = [];

  for (const candidate of [ramos[0], region[0], coahuila[1], ...pool]) {
    if (candidate && !used.has(candidate.slug)) {
      stack.push(candidate);
      used.add(candidate.slug);
    }
    if (stack.length === 3) break;
  }

  return `<section class="container section-block" id="coahuila">
    <div class="section-header">
      <div><span class="section-kicker">NUESTRA REGIÓN</span><h2>Coahuila</h2></div>
      <nav>
        <a href="/coahuila/">Coahuila</a>
        <a href="/ramos-arizpe/">Ramos Arizpe</a>
        <a href="/region-sureste/">Región Sureste</a>
      </nav>
    </div>
    <div class="regional-grid">
      <article class="regional-feature">
        ${noteLink(feature, `
          ${imageMarkup(feature, "regional-photo", "FOTO COAHUILA")}
          <span class="section-label">${esc(feature.category)}</span>
          <h3>${esc(feature.title)}</h3>
          ${feature.summary ? `<p>${esc(feature.summary)}</p>` : ""}
        `)}
      </article>
      <div class="regional-stack">
        ${stack.map((n, i) => `<article${n.category === "Ramos Arizpe" ? ' id="ramos"' : ""}>
          ${imageMarkup(n, "thumb", "FOTO")}
          <div>
            <span class="section-label">${esc(n.category)}</span>
            <h4>${noteLink(n, esc(n.title))}</h4>
          </div>
        </article>`).join("")}
      </div>
    </div>
  </section>`;
}

function renderSecuritySection(notes) {
  const list = categoryNotes(notes, "Seguridad").slice(0, 3);
  if (!list.length) return "";
  const [feature, second, third] = list;

  return `<section class="dark-band" id="seguridad">
    <div class="container">
      <div class="section-header inverted">
        <div><span class="section-kicker">COBERTURA</span><h2>Seguridad</h2></div>
        <a href="/seguridad/">Más noticias →</a>
      </div>
      <div class="dark-grid">
        <article class="dark-feature">
          ${noteLink(feature, `
            ${imageMarkup(feature, "dark-photo", "FOTOGRAFÍA")}
            <span class="section-label">${esc(feature.category)}</span>
            <h3>${esc(feature.title)}</h3>
            ${feature.summary ? `<p>${esc(feature.summary)}</p>` : ""}
          `)}
        </article>
        ${second ? `<article class="dark-card">
          <span class="section-label">${esc(second.category)}</span>
          <h4>${noteLink(second, esc(second.title))}</h4>
          ${second.summary ? `<p>${esc(second.summary)}</p>` : ""}
        </article>` : `<article class="dark-card empty-editorial"><span>Sin más publicaciones recientes</span></article>`}
        ${third ? `<article class="dark-card">
          <span class="section-label">${esc(third.category)}</span>
          <h4>${noteLink(third, esc(third.title))}</h4>
          ${third.summary ? `<p>${esc(third.summary)}</p>` : ""}
        </article>` : `<article class="dark-card empty-editorial"><span>Sin más publicaciones recientes</span></article>`}
      </div>
    </div>
  </section>`;
}

function renderPoliticsEconomySection(notes) {
  const politics = categoryNotes(notes, "Política").slice(0, 2);
  const economy = categoryNotes(notes, "Economía").slice(0, 4);

  if (!politics.length && !economy.length) return "";

  const politicsHtml = politics.length ? `
    <div class="split-main" id="politica">
      <div class="section-header simple"><div><span class="section-kicker">AGENDA PÚBLICA</span><h2>Política</h2></div></div>
      ${politics.map(n => `<article class="wide-story">
        ${imageMarkup(n, "wide-photo", "FOTO")}
        <div>
          <span class="section-label">${esc(n.category)}</span>
          <h3>${noteLink(n, esc(n.title))}</h3>
          ${n.summary ? `<p>${esc(n.summary)}</p>` : ""}
          <div class="byline">${esc(n.author)} <span>•</span> ${esc(formatDate(n.date))}</div>
        </div>
      </article>`).join("")}
    </div>` : "";

  const economyHtml = economy.length ? `
    <aside class="split-side" id="economia">
      <div class="section-header simple"><div><span class="section-kicker">NEGOCIOS</span><h2>Economía</h2></div></div>
      <div class="market-bar"><div><span>DÓLAR</span><strong>$—</strong></div><div><span>IPC</span><strong>—</strong></div><div><span>WTI</span><strong>$—</strong></div></div>
      <article class="economy-lead">
        <span class="section-label">${esc(economy[0].category)}</span>
        <h3>${noteLink(economy[0], esc(economy[0].title))}</h3>
        ${economy[0].summary ? `<p>${esc(economy[0].summary)}</p>` : ""}
      </article>
      ${economy.length > 1 ? `<ol class="economy-list">
        ${economy.slice(1,4).map((n, i) => `<li><span>${String(i+1).padStart(2,"0")}</span>${noteLink(n, esc(n.title))}</li>`).join("")}
      </ol>` : ""}
    </aside>` : "";

  return `<section class="container split-sections">${politicsHtml}${economyHtml}</section>`;
}

function renderOpinionSection(notes) {
  const list = categoryNotes(notes, "Opinión").slice(0, 3);
  if (!list.length) return "";

  return `<section class="container opinion" id="opinion">
    <div class="section-header">
      <div><span class="section-kicker">ANÁLISIS</span><h2>Opinión</h2></div>
      <a href="/opinion/">Todas las opiniones →</a>
    </div>
    <div class="opinion-grid">
      ${list.map((n, i) => `<article>
        <div class="avatar">${i === 0 ? "AR" : String(i).padStart(2,"0")}</div>
        <span>${esc(n.category)}</span>
        <h3>${noteLink(n, esc(n.title))}</h3>
        <p>${esc(n.author)}</p>
      </article>`).join("")}
    </div>
  </section>`;
}

function renderNationalExtraSections(notes) {
  const categories = ["México", "Estados", "Mundo"];
  const blocks = categories.map(cat => {
    const list = categoryNotes(notes, cat).slice(0, 4);
    if (!list.length) return "";
    return `<section class="container generated-category-section" id="${slugify(cat)}">
      <div class="section-header">
        <div><span class="section-kicker">COBERTURA</span><h2>${esc(cat)}</h2></div>
        <a href="/${slugify(cat)}/">Más noticias →</a>
      </div>
      <div class="generated-news-grid">
        ${list.map(n => `<article class="generated-news-card">
          ${noteLink(n, `
            ${imageMarkup(n, "generated-card-image", "FOTO")}
            <div class="generated-card-copy">
              <span class="section-label">${esc(n.category)}</span>
              <h3>${esc(n.title)}</h3>
              ${n.summary ? `<p>${esc(n.summary)}</p>` : ""}
              <div class="byline">${esc(n.author)} <span>•</span> ${esc(formatDate(n.date))}</div>
            </div>
          `)}
        </article>`).join("")}
      </div>
    </section>`;
  }).filter(Boolean);

  return blocks.join("");
}

function categoryArchivePage(category, notes) {
  const list = categoryNotes(notes, category);
  const slug = slugify(category);
  const cards = list.map(n => `<article class="generated-news-card">
    ${noteLink(n, `
      ${imageMarkup(n, "generated-card-image", "FOTO")}
      <div class="generated-card-copy">
        <span class="section-label">${esc(n.category)}</span>
        <h3>${esc(n.title)}</h3>
        ${n.summary ? `<p>${esc(n.summary)}</p>` : ""}
        <div class="byline">${esc(n.author)} <span>•</span> ${esc(formatDate(n.date))}</div>
      </div>
    `)}
  </article>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(category)} | Ramos Arizpe al Día</title>
  <meta name="description" content="Noticias de ${esc(category)} en Ramos Arizpe al Día.">
  <link rel="canonical" href="https://ramosarizpealdia.com/${slug}/">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="utility-bar"><div class="container utility-inner"><div class="utility-left"><span>${esc(formatDate(new Date()))}</span><span class="edition">Edición digital</span></div></div></div>
  <header class="masthead">
    <div class="container masthead-inner">
      <a class="identity" href="/" aria-label="Ramos Arizpe al Día">
        <img src="/logo-ramos-arizpe-al-dia.jpg" alt="Ramos Arizpe al Día">
        <div class="wordmark"><span class="wordmark-main">RAMOS ARIZPE</span><span class="wordmark-sub">AL DÍA</span></div>
      </a>
    </div>
    <div class="nav-shell"><div class="container nav-inner"><nav class="main-nav" aria-label="Secciones"><a href="/">Inicio</a><a href="/mexico/">México</a><a href="/politica/">Política</a><a href="/economia/">Economía</a><a href="/seguridad/">Seguridad</a><a href="/estados/">Estados</a><a href="/mundo/">Mundo</a><a class="local" href="/coahuila/">Coahuila</a><a class="local" href="/ramos-arizpe/">Ramos Arizpe</a><a href="/opinion/">Opinión</a></nav></div></div>
  </header>
  <main class="container category-page">
    <div class="section-header"><div><span class="section-kicker">SECCIÓN</span><h1>${esc(category)}</h1></div></div>
    ${cards ? `<div class="generated-news-grid">${cards}</div>` : `<p class="empty-category">Aún no hay publicaciones en esta sección.</p>`}
  </main>
  <footer><div class="container footer-bottom"><span>© ${new Intl.DateTimeFormat("en", { timeZone: "America/Monterrey", year: "numeric" }).format(new Date())} Ramos Arizpe al Día</span></div></footer>
</body>
</html>`;
}

function articlePage(note) {
  const canonical = `https://ramosarizpealdia.com${articleURL(note)}`;
  const image = note.image ? `https://ramosarizpealdia.com${note.image.startsWith("/") ? note.image : "/" + note.image}` : "https://ramosarizpealdia.com/logo-ramos-arizpe-al-dia.jpg";
  const bodyHtml = marked.parse(note.body || "");
  const published = parseDate(note.date).toISOString();

  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": note.title,
    "description": note.summary || "",
    "datePublished": published,
    "dateModified": published,
    "mainEntityOfPage": canonical,
    "image": [image],
    "author": { "@type": "Person", "name": note.author },
    "publisher": {
      "@type": "Organization",
      "name": "Ramos Arizpe al Día",
      "logo": {
        "@type": "ImageObject",
        "url": "https://ramosarizpealdia.com/logo-ramos-arizpe-al-dia.jpg"
      }
    }
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(note.title)} | Ramos Arizpe al Día</title>
  <meta name="description" content="${esc(note.summary || note.title)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(note.title)}">
  <meta property="og:description" content="${esc(note.summary || "")}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta property="article:published_time" content="${published}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Libre+Franklin:wght@500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700;8..60,800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <div class="utility-bar"><div class="container utility-inner"><div class="utility-left"><span>${esc(formatDate(new Date()))}</span><span class="edition">Edición digital</span></div><div class="utility-right"><a href="/">Inicio</a></div></div></div>
  <header class="masthead">
    <div class="container masthead-inner">
      <a class="identity" href="/" aria-label="Ramos Arizpe al Día">
        <img src="/logo-ramos-arizpe-al-dia.jpg" alt="Logo de Ramos Arizpe al Día">
        <div class="wordmark"><span class="wordmark-main">RAMOS ARIZPE</span><span class="wordmark-sub">AL DÍA</span></div>
      </a>
    </div>
    <div class="nav-shell"><div class="container nav-inner"><nav class="main-nav" aria-label="Secciones"><a href="/">Inicio</a><a href="/mexico/">México</a><a href="/politica/">Política</a><a href="/economia/">Economía</a><a href="/seguridad/">Seguridad</a><a href="/estados/">Estados</a><a href="/mundo/">Mundo</a><a class="local" href="/coahuila/">Coahuila</a><a class="local" href="/ramos-arizpe/">Ramos Arizpe</a><a href="/opinion/">Opinión</a></nav></div></div>
  </header>
  <main>
    <article class="container article-page">
      <div class="article-breadcrumb"><a href="/">Inicio</a> / <a href="/${slugify(note.category)}/">${esc(note.category)}</a></div>
      <span class="section-label">${esc(note.category)}</span>
      <h1>${esc(note.title)}</h1>
      ${note.summary ? `<p class="article-deck">${esc(note.summary)}</p>` : ""}
      <div class="article-meta">Por <strong>${esc(note.author)}</strong> · Publicado ${esc(formatDate(note.date, true))}</div>
      ${note.image ? `<img class="article-hero-image" src="${esc(note.image)}" alt="${esc(note.title)}">` : ""}
      <div class="article-body">${bodyHtml}</div>
    </article>
  </main>
  <footer>
    <div class="container footer-top"><div class="footer-brand"><img src="/logo-ramos-arizpe-al-dia.jpg" alt="Ramos Arizpe al Día"><div><strong>RAMOS ARIZPE AL DÍA</strong><span>Información de México y Coahuila</span></div></div></div>
    <div class="container footer-bottom"><span>© ${new Intl.DateTimeFormat("en", { timeZone: "America/Monterrey", year: "numeric" }).format(new Date())} Ramos Arizpe al Día</span></div>
  </footer>
</body>
</html>`;
}

function buildSitemaps(notes) {
  const categoryUrls = ["México","Coahuila","Ramos Arizpe","Región Sureste","Política","Seguridad","Economía","Estados","Mundo","Opinión"]
    .map(category => `<url><loc>https://ramosarizpealdia.com/${slugify(category)}/</loc></url>`);
  const urls = [
    `<url><loc>https://ramosarizpealdia.com/</loc></url>`,
    ...categoryUrls,
    ...notes.map(n => `<url><loc>https://ramosarizpealdia.com${articleURL(n)}</loc><lastmod>${parseDate(n.date).toISOString()}</lastmod></url>`)
  ];
  fs.writeFileSync(path.join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`
  );

  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const recent = notes.filter(n => parseDate(n.date).getTime() >= cutoff);
  const news = recent.map(n => `<url>
    <loc>https://ramosarizpealdia.com${articleURL(n)}</loc>
    <news:news>
      <news:publication><news:name>Ramos Arizpe al Día</news:name><news:language>es</news:language></news:publication>
      <news:publication_date>${parseDate(n.date).toISOString()}</news:publication_date>
      <news:title>${esc(n.title)}</news:title>
    </news:news>
  </url>`);
  fs.writeFileSync(path.join(dist, "news-sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${news.join("")}</urlset>`
  );
  fs.writeFileSync(path.join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: https://ramosarizpealdia.com/sitemap.xml\nSitemap: https://ramosarizpealdia.com/news-sitemap.xml\n`
  );
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

["styles.css", "script.js", "logo-ramos-arizpe-al-dia.jpg"].forEach(copyFile);
["admin", "uploads"].forEach(copyDir);

const notes = loadNotes();
let home = fs.readFileSync(path.join(root, "index.html"), "utf8");

const lead = renderLead(notes);
if (lead) {
  home = home.replace(/<section class="container lead-grid" id="mexico">[\s\S]*?<\/section>/, lead);
  const latest = renderLatest(notes);
  home = home.replace('<div class="container rule"></div>', `${latest}<div class="container rule"></div>`);
}

// Sustituye los módulos de demostración por noticias reales según categoría.
home = home.replace(/<section class="container section-block" id="coahuila">[\s\S]*?<\/section>/, renderCoahuilaSection(notes));
home = home.replace(/<section class="dark-band" id="seguridad">[\s\S]*?<\/section>/, renderSecuritySection(notes));
home = home.replace(/<section class="container split-sections">[\s\S]*?<\/section>/, renderPoliticsEconomySection(notes));
home = home.replace(/<section class="container opinion" id="opinion">[\s\S]*?<\/section>/, renderOpinionSection(notes));

// México, Estados y Mundo se agregan como módulos reales cuando haya contenido.
const nationalExtras = renderNationalExtraSections(notes);
if (nationalExtras) {
  home = home.replace('<section class="newsletter">', `${nationalExtras}<section class="newsletter">`);
}

fs.writeFileSync(path.join(dist, "index.html"), home);

const extraCss = `
/* Contenido generado automáticamente desde /admin */
.lead-story>a,.secondary-story>a,.generated-news-card>a{color:inherit;text-decoration:none;display:block}
.article-cover{width:100%;height:100%;object-fit:cover;display:block}
.generated-latest{padding-top:24px;padding-bottom:55px}
.generated-news-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.generated-news-card{border-top:1px solid #d7d7d7;padding-top:14px}
.generated-card-image{width:100%;aspect-ratio:16/9;object-fit:cover;margin-bottom:14px}
.generated-card-copy h3{font-family:"Source Serif 4",Georgia,serif;font-size:25px;line-height:1.08;margin:7px 0}
.generated-card-copy p{color:#626262;line-height:1.45}
.article-page{max-width:860px;padding-top:50px;padding-bottom:80px}
.article-breadcrumb{font-size:13px;color:#6c6c6c;margin-bottom:24px}
.article-page h1{font-family:"Source Serif 4",Georgia,serif;font-size:clamp(38px,6vw,68px);line-height:1.02;letter-spacing:-1.5px;margin:10px 0 16px}
.article-deck{font-family:"Source Serif 4",Georgia,serif;font-size:23px;line-height:1.35;color:#555}
.article-meta{font-size:14px;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:14px 0;margin:25px 0}
.article-hero-image{width:100%;height:auto;margin:25px 0}
.article-body{font-family:"Source Serif 4",Georgia,serif;font-size:20px;line-height:1.72}
.article-body p{margin:0 0 1.3em}
.article-body h2,.article-body h3{font-family:"Libre Franklin",Arial,sans-serif;line-height:1.15;margin-top:1.8em}
.article-body img{max-width:100%;height:auto}
.regional-feature>a,.dark-feature>a,.dark-card a,.wide-story a,.economy-lead a,.economy-list a,.opinion-grid a{color:inherit;text-decoration:none}
.regional-feature>a{display:block}
.regional-stack article .thumb{overflow:hidden}
.regional-stack article .thumb.article-cover{object-fit:cover}
.dark-feature .article-cover,.wide-story .article-cover{object-fit:cover}
.dark-card.empty-editorial{display:flex;align-items:center;justify-content:center;min-height:140px;opacity:.55}

/* Corrección mínima de flujo: conserva el diseño editorial original */
.section-block,
.dark-band,
.split-sections,
.opinion,
.generated-category-section,
.latest{
  position:relative;
  clear:both;
  overflow:visible;
}

.section-block::after,
.dark-band::after,
.split-sections::after,
.opinion::after,
.generated-category-section::after,
.latest::after{
  content:"";
  display:block;
  clear:both;
}

/* Evita que textos largos invadan el módulo siguiente sin cambiar columnas */
.section-block h1,
.section-block h2,
.section-block h3,
.section-block h4,
.dark-band h1,
.dark-band h2,
.dark-band h3,
.dark-band h4,
.split-sections h1,
.split-sections h2,
.split-sections h3,
.split-sections h4,
.opinion h1,
.opinion h2,
.opinion h3,
.opinion h4,
.generated-category-section h1,
.generated-category-section h2,
.generated-category-section h3,
.generated-category-section h4,
.latest h1,
.latest h2,
.latest h3,
.latest h4{
  overflow-wrap:anywhere;
  word-break:normal;
}

/* Las imágenes no pueden desbordar su tarjeta */
.section-block img,
.dark-band img,
.split-sections img,
.opinion img,
.generated-category-section img,
.latest img{
  max-width:100%;
}

/* Espacio de seguridad entre módulos, sin alterar su composición interna */
.section-block,
.dark-band,
.split-sections,
.opinion,
.generated-category-section,
.latest{
  margin-bottom:28px;
}

.newsletter{
  clear:both;
  position:relative;
  z-index:1;
}
.generated-category-section{padding-top:38px;padding-bottom:48px;border-top:1px solid #e3e3e3}
.category-page{padding-top:48px;padding-bottom:80px}
.category-page .section-header h1{font-family:"Source Serif 4",Georgia,serif;font-size:48px;margin:0}
.empty-category{padding:40px 0;color:#666}
@media(max-width:800px){
  .generated-news-grid{grid-template-columns:1fr}
  .article-page{padding-top:28px}
  .article-page h1{font-size:42px}
  .article-deck{font-size:20px}
  .article-body{font-size:19px}
}
`;
const cssPath = path.join(dist, "styles.css");
fs.appendFileSync(cssPath, "\n" + extraCss);

for (const note of notes) {
  const pageDir = path.join(dist, slugify(note.category || "noticias"), note.slug);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, "index.html"), articlePage(note));
}

// Genera una página de archivo para cada categoría usada en el CMS.
const allCategories = ["México","Coahuila","Ramos Arizpe","Región Sureste","Política","Seguridad","Economía","Estados","Mundo","Opinión"];
for (const category of allCategories) {
  const categoryDir = path.join(dist, slugify(category));
  fs.mkdirSync(categoryDir, { recursive: true });
  fs.writeFileSync(path.join(categoryDir, "index.html"), categoryArchivePage(category, notes));
}

buildSitemaps(notes);
console.log(`Sitio generado con ${notes.length} noticia(s) y secciones automáticas.`);
