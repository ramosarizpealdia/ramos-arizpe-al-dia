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
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
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
    const time = Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
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
    <div class="nav-shell"><div class="container nav-inner"><nav class="main-nav" aria-label="Secciones"><a href="/">Inicio</a><a href="/#mexico">México</a><a href="/#coahuila">Coahuila</a><a href="/#seguridad">Seguridad</a><a href="/#politica">Política</a></nav></div></div>
  </header>
  <main>
    <article class="container article-page">
      <div class="article-breadcrumb"><a href="/">Inicio</a> / <span>${esc(note.category)}</span></div>
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
    <div class="container footer-bottom"><span>© ${new Date().getFullYear()} Ramos Arizpe al Día</span></div>
  </footer>
</body>
</html>`;
}

function buildSitemaps(notes) {
  const urls = [
    `<url><loc>https://ramosarizpealdia.com/</loc></url>`,
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

buildSitemaps(notes);
console.log(`Sitio generado con ${notes.length} noticia(s).`);
