/**
 * Relais Mob — met la clé Mistral hors de portée du navigateur.
 *
 * La page de Mob est publique : tout ce qu'elle contient est lisible par
 * quiconque l'ouvre. Une clé d'API n'y est donc pas « discrète », elle y est
 * publiée. Ce Worker existe pour ça : il garde la clé côté serveur, et la
 * page ne connaît qu'un code d'accès, révocable un par un.
 *
 * Deux points à ne pas confondre :
 *   - le contrôle d'origine (CORS) range les navigateurs, il n'empêche rien
 *     à qui appelle en ligne de commande ;
 *   - le code d'accès, lui, est vérifié ici, donc il tient pour tout le monde.
 * C'est le code qui protège, pas l'origine.
 */

import { DurableObject } from "cloudflare:workers";

/** Compteur d'usage, un objet par code : pas de contention entre personnes. */
export class Ledger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS usage (
         code TEXT NOT NULL,
         day  TEXT NOT NULL,
         n    INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (code, day)
       )`
    );
  }

  async fetch(request) {
    const { code, limit, spend } = await request.json();
    const day = new Date().toISOString().slice(0, 10);

    const rows = this.sql.exec(
      "SELECT n FROM usage WHERE code = ? AND day = ?", code, day
    ).toArray();
    const used = rows.length ? rows[0].n : 0;

    if (!spend) return Response.json({ used, limit, ok: used < limit });
    if (used >= limit) return Response.json({ used, limit, ok: false });

    this.sql.exec(
      `INSERT INTO usage (code, day, n) VALUES (?, ?, 1)
       ON CONFLICT (code, day) DO UPDATE SET n = n + 1`, code, day
    );
    // Les journées passées ne servent plus à rien : on les laisse filer
    // plutôt que de faire grossir la base indéfiniment.
    this.sql.exec("DELETE FROM usage WHERE day < ?", isoDaysAgo(30));

    return Response.json({ used: used + 1, limit, ok: true });
  }
}

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */

const MODELS = [
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest",
];

const MAX_MESSAGES = 60;      // au-delà, c'est la fenêtre de contexte qui dérape
const MAX_CHARS = 60000;      // et le coût en jetons avec elle

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * En-têtes CORS. Une origine absente (curl, app native) est acceptée : elle
 * n'a de toute façon pas besoin de notre permission pour appeler. C'est le
 * code d'accès qui décide, pas l'en-tête.
 */
function corsFor(origin, env) {
  const base = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (!origin) return base;

  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes("*")) return { ...base, "Access-Control-Allow-Origin": "*" };
  if (allowed.includes(origin)) return { ...base, "Access-Control-Allow-Origin": origin };
  return null;                                  // origine refusée
}

/** Les codes vivent dans un secret, jamais dans le dépôt. */
function readCodes(env) {
  try {
    const parsed = JSON.parse(env.ACCESS_CODES || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return null;                                // secret mal formé : on le dira
  }
}

function identify(env, code) {
  const codes = readCodes(env);
  if (codes === null) return { error: "Le relais est mal configuré (ACCESS_CODES).", status: 500 };
  if (typeof code !== "string" || !code.trim()) return { error: "Code d'accès manquant.", status: 401 };

  const entry = codes[code.trim()];
  if (!entry) return { error: "Code d'accès inconnu.", status: 401 };

  return {
    who: {
      code: code.trim(),
      name: String(entry.name || "Invité"),
      role: entry.role === "admin" ? "admin" : "user",
      limit: Number.isFinite(entry.limit) ? entry.limit : Number(env.DAILY_LIMIT || 100),
    },
  };
}

function ledgerFor(env, code) {
  return env.LEDGER.get(env.LEDGER.idFromName(code));
}

async function meter(env, who, spend) {
  const res = await ledgerFor(env, who.code).fetch("https://ledger/", {
    method: "POST",
    body: JSON.stringify({ code: who.code, limit: who.limit, spend }),
  });
  return res.json();
}

/** Le modèle n'est pas au choix de l'appelant : seul l'admin peut en changer. */
function pickModel(env, who, asked) {
  const fallback = MODELS.includes(env.USER_MODEL) ? env.USER_MODEL : MODELS[0];
  if (who.role !== "admin") return fallback;
  return MODELS.includes(asked) ? asked : fallback;
}

function checkMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return "Aucun message à envoyer.";
  if (messages.length > MAX_MESSAGES) return "Conversation trop longue pour le relais.";
  let chars = 0;
  for (const m of messages) {
    if (!m || typeof m.content !== "string") return "Message de forme inattendue.";
    if (!["system", "user", "assistant"].includes(m.role)) return "Rôle de message inconnu.";
    chars += m.content.length;
  }
  if (chars > MAX_CHARS) return "Conversation trop longue pour le relais.";
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsFor(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors || {} });
    }
    if (!cors) return json({ error: "Origine non autorisée." }, 403, {});
    if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, cors);

    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Requête illisible." }, 400, cors);
    }

    const found = identify(env, body && body.code);
    if (found.error) return json({ error: found.error }, found.status, cors);
    const who = found.who;

    // Qui suis-je, et combien me reste-t-il ? Ne consomme rien.
    if (url.pathname === "/session") {
      const state = await meter(env, who, false);
      return json({
        name: who.name, role: who.role,
        used: state.used, limit: state.limit,
        model: pickModel(env, who, null),
      }, 200, cors);
    }

    if (url.pathname !== "/chat") return json({ error: "Chemin inconnu." }, 404, cors);

    const badly = checkMessages(body.messages);
    if (badly) return json({ error: badly }, 400, cors);

    // Le décompte passe avant l'appel : sinon un plafond atteint coûterait
    // quand même une requête à Mistral.
    const state = await meter(env, who, true);
    if (!state.ok) {
      return json({
        error: `Plafond atteint pour aujourd'hui (${state.limit} messages). ` +
               `Il se remet à zéro à minuit UTC.`,
        used: state.used, limit: state.limit,
      }, 429, cors);
    }

    let upstream;
    try {
      upstream = await fetch(env.MISTRAL_URL || "https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: pickModel(env, who, body.model),
          messages: body.messages,
        }),
      });
    } catch (e) {
      return json({ error: "Le modèle est injoignable pour l'instant." }, 502, cors);
    }

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      // Le détail de Mistral peut nommer la clé ou le compte : on ne le
      // renvoie pas au navigateur, on le laisse aux journaux du Worker.
      console.log("mistral", upstream.status, JSON.stringify(data));
      const lisible = upstream.status === 401 || upstream.status === 403
        ? "Le relais n'arrive pas à s'authentifier auprès de Mistral."
        : upstream.status === 429
          ? "Trop de demandes d'un coup, réessaie dans un instant."
          : "Le modèle a refusé la demande.";
      return json({ error: lisible }, upstream.status === 429 ? 429 : 502, cors);
    }

    const content = data && data.choices && data.choices[0] &&
                    data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== "string" || !content.trim()) {
      return json({ error: "Réponse de forme inattendue." }, 502, cors);
    }

    return json({
      content: content.trim(),
      used: state.used, limit: state.limit,
    }, 200, cors);
  },
};
