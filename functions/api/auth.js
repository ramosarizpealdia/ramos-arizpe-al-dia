function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response("Falta configurar GITHUB_CLIENT_ID en Cloudflare.", { status: 500 });
  }

  const url = new URL(request.url);
  const state = randomState();
  const callback = `${url.origin}/api/callback`;

  const github = new URL("https://github.com/login/oauth/authorize");
  github.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  github.searchParams.set("redirect_uri", callback);
  github.searchParams.set("scope", "repo user");
  github.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      "Set-Cookie": `rad_oauth_state=${state}; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
