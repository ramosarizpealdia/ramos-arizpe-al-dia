function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function decapResponse(status, content, httpStatus = 200) {
  const contentJson = safeJson(content);
  const statusJson = safeJson(status);

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Autorización</title></head>
<body>
<script>
(function () {
  const status = ${statusJson};
  const content = ${contentJson};

  function receiveMessage(message) {
    if (!window.opener) return;
    window.opener.postMessage(
      "authorization:github:" + status + ":" + JSON.stringify(content),
      message.origin
    );
    window.removeEventListener("message", receiveMessage, false);
    window.close();
  }

  window.addEventListener("message", receiveMessage, false);

  if (window.opener) {
    window.opener.postMessage("authorizing:github", "*");
  } else {
    document.body.textContent = "No se pudo comunicar con la ventana de administración.";
  }
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: httpStatus,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "rad_oauth_state=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  });
}

export async function onRequest({ request, env }) {
  try {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return decapResponse("error", {
        message: "Faltan las credenciales OAuth de GitHub en Cloudflare.",
      }, 500);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = getCookie(request, "rad_oauth_state");

    if (!code) {
      return decapResponse("error", { message: "GitHub no devolvió un código de autorización." }, 400);
    }

    if (!state || !storedState || state !== storedState) {
      return decapResponse("error", { message: "La validación de seguridad OAuth no coincidió." }, 400);
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Ramos-Arizpe-al-Dia-Decap-CMS",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const result = await tokenResponse.json();

    if (!tokenResponse.ok || result.error || !result.access_token) {
      return decapResponse("error", {
        message: result.error_description || result.error || "GitHub no entregó un token de acceso.",
      }, 401);
    }

    return decapResponse("success", {
      token: result.access_token,
      provider: "github",
    });
  } catch (error) {
    return decapResponse("error", {
      message: error instanceof Error ? error.message : "Error desconocido durante OAuth.",
    }, 500);
  }
}
