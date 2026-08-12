export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.ARTICLE_VIEWS) {
      return Response.json(
        { ok: false, error: "ARTICLE_VIEWS no está vinculado" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const slug = String(body.slug || "").trim();
    const category = String(body.category || "").trim();
    const title = String(body.title || "").trim();
    const url = String(body.url || "").trim();
    const image = String(body.image || "").trim();

    if (!slug || !category || !title || !url) {
      return Response.json(
        { ok: false, error: "Faltan datos de la nota" },
        { status: 400 }
      );
    }

    const key = `article:${slug}`;
    const current = await env.ARTICLE_VIEWS.get(key, { type: "json" });

    const next = {
      slug,
      category,
      title,
      url,
      image,
      views: Number(current?.views || 0) + 1,
      updatedAt: new Date().toISOString()
    };

    await env.ARTICLE_VIEWS.put(key, JSON.stringify(next));

    return Response.json({
      ok: true,
      views: next.views
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Error al registrar visita"
      },
      { status: 500 }
    );
  }
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    if (!env.ARTICLE_VIEWS) {
      return Response.json(
        { ok: false, error: "ARTICLE_VIEWS no está vinculado" },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const category = String(url.searchParams.get("category") || "").trim();

    const list = await env.ARTICLE_VIEWS.list({
      prefix: "article:",
      limit: 100
    });

    const articles = [];

    for (const key of list.keys) {
      const item = await env.ARTICLE_VIEWS.get(key.name, { type: "json" });

      if (!item) continue;
      if (category && item.category !== category) continue;

      articles.push(item);
    }

    articles.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));

    return Response.json({
      ok: true,
      articles: articles.slice(0, 5)
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Error al consultar visitas"
      },
      { status: 500 }
    );
  }
}
