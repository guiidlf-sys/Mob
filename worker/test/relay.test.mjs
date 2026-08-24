/**
 * Vérifie le relais sur le vrai moteur Cloudflare (`wrangler dev`), pas sur
 * une imitation : le Durable Object, le SQLite et le CORS sont ceux qui
 * tourneront en production. Mistral est remplacé par un serveur local, pour
 * ne dépenser ni jeton ni quota.
 *
 *   node worker/test/relay.test.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { writeFileSync, unlinkSync } from "node:fs";

const RELAY = "http://127.0.0.1:8787";
const FAUX_MISTRAL = 8788;
const CLE = "cle-mistral-qui-ne-doit-jamais-sortir";
const ORIGINE = "https://guiidlf-sys.github.io";

const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, why: e.message }); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

/* ---- faux Mistral : répond comme le vrai, et retient ce qu'il reçoit ---- */
let dernier = null;
let prochainStatut = 200;
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    dernier = { auth: req.headers.authorization, ...JSON.parse(body || "{}") };
    if (prochainStatut !== 200) {
      res.writeHead(prochainStatut, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: `secret interne : ${CLE} invalide` }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Bonjour depuis le faux Mistral." } }] }));
  });
});
await new Promise((r) => stub.listen(FAUX_MISTRAL, r));

/* ---- secrets locaux : jamais dans le dépôt (.dev.vars est ignoré par git) ---- */
const codes = {
  "code-admin": { name: "Guillaume", role: "admin", limit: 50 },
  "code-famille": { name: "Famille", role: "user", limit: 50 },
  "code-serre": { name: "Bridé", role: "user", limit: 2 },
};
writeFileSync("worker/.dev.vars",
  `MISTRAL_API_KEY=${CLE}\n` +
  `ACCESS_CODES=${JSON.stringify(codes)}\n` +
  `MISTRAL_URL=http://127.0.0.1:${FAUX_MISTRAL}/v1/chat/completions\n` +
  `ALLOWED_ORIGINS=${ORIGINE},http://localhost:8899\n`);

const wrangler = spawn("npx", ["wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1"], {
  cwd: "worker", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" },
});
let journal = "";
wrangler.stdout.on("data", (d) => (journal += d));
wrangler.stderr.on("data", (d) => (journal += d));

const post = (chemin, corps, origine = ORIGINE) =>
  fetch(RELAY + chemin, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origine ? { Origin: origine } : {}) },
    body: JSON.stringify(corps),
  });

// Attendre que le Worker réponde vraiment, plutôt que de deviner un délai.
let debout = false;
for (let i = 0; i < 60 && !debout; i++) {
  try {
    await post("/session", { code: "code-famille" });
    debout = true;
  } catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!debout) {
  console.error("wrangler dev n'a pas démarré :\n" + journal.slice(-3000));
  process.exit(1);
}

/* ------------------------------- contrôles ------------------------------- */

await check("le pré-vol CORS autorise l'origine du site", async () => {
  const r = await fetch(RELAY + "/chat", { method: "OPTIONS", headers: { Origin: ORIGINE } });
  assert(r.status === 204, `statut ${r.status}`);
  assert(r.headers.get("access-control-allow-origin") === ORIGINE, "origine non renvoyée");
});

await check("une origine inconnue est refusée", async () => {
  const r = await post("/session", { code: "code-famille" }, "https://site-de-quelqu-un-dautre.example");
  assert(r.status === 403, `statut ${r.status}`);
});

await check("un code inconnu n'obtient rien", async () => {
  const r = await post("/session", { code: "code-invente" });
  assert(r.status === 401, `statut ${r.status}`);
  const j = await r.json();
  assert(!JSON.stringify(j).includes(CLE), "la clé fuit dans la réponse");
});

await check("un code valide se présente avec son rôle et son plafond", async () => {
  const j = await (await post("/session", { code: "code-famille" })).json();
  assert(j.name === "Famille", `nom : ${j.name}`);
  assert(j.role === "user", `rôle : ${j.role}`);
  assert(j.limit === 50, `plafond : ${j.limit}`);
});

await check("une question passe et revient avec la réponse du modèle", async () => {
  const j = await (await post("/chat", {
    code: "code-famille", messages: [{ role: "user", content: "salut" }],
  })).json();
  assert(j.content === "Bonjour depuis le faux Mistral.", `contenu : ${j.content}`);
  assert(dernier.auth === `Bearer ${CLE}`, "la clé n'a pas été ajoutée par le relais");
});

await check("la clé n'apparaît jamais dans ce que reçoit le navigateur", async () => {
  const brut = await (await post("/chat", {
    code: "code-famille", messages: [{ role: "user", content: "salut" }],
  })).text();
  assert(!brut.includes(CLE), "la clé est renvoyée au navigateur");
});

await check("un utilisateur ne peut pas s'offrir un modèle plus cher", async () => {
  await post("/chat", {
    code: "code-famille", model: "mistral-large-latest",
    messages: [{ role: "user", content: "salut" }],
  });
  assert(dernier.model === "mistral-small-latest",
    `modèle réellement demandé : ${dernier.model}`);
});

await check("l'admin, lui, peut changer de modèle", async () => {
  await post("/chat", {
    code: "code-admin", model: "mistral-large-latest",
    messages: [{ role: "user", content: "salut" }],
  });
  assert(dernier.model === "mistral-large-latest",
    `modèle réellement demandé : ${dernier.model}`);
});

await check("un modèle inventé retombe sur le modèle par défaut", async () => {
  await post("/chat", {
    code: "code-admin", model: "gpt-secret-9",
    messages: [{ role: "user", content: "salut" }],
  });
  assert(dernier.model === "mistral-small-latest", `modèle : ${dernier.model}`);
});

await check("le plafond quotidien arrête vraiment la dépense", async () => {
  const q = { code: "code-serre", messages: [{ role: "user", content: "salut" }] };
  assert((await post("/chat", q)).status === 200, "1er message refusé");
  assert((await post("/chat", q)).status === 200, "2e message refusé");
  const avant = dernier.model;
  const trop = await post("/chat", q);
  assert(trop.status === 429, `3e message : statut ${trop.status}`);
  assert((await trop.json()).error.includes("Plafond"), "message de plafond absent");
  assert(dernier.model === avant, "le 3e message a quand même été envoyé à Mistral");
});

await check("le plafond se compte par code, pas globalement", async () => {
  const r = await post("/chat", { code: "code-famille", messages: [{ role: "user", content: "salut" }] });
  assert(r.status === 200, `un autre code est bloqué à tort : ${r.status}`);
});

await check("une conversation démesurée est refusée avant l'appel", async () => {
  const enorme = [{ role: "user", content: "x".repeat(70000) }];
  const r = await post("/chat", { code: "code-famille", messages: enorme });
  assert(r.status === 400, `statut ${r.status}`);
});

await check("une erreur de Mistral ne recopie pas son détail au navigateur", async () => {
  prochainStatut = 401;
  const r = await post("/chat", { code: "code-famille", messages: [{ role: "user", content: "salut" }] });
  const brut = await r.text();
  prochainStatut = 200;
  assert(!brut.includes(CLE), "le détail de Mistral, clé comprise, a été recopié");
  assert(brut.includes("authentifier"), `message peu clair : ${brut}`);
});

/* -------------------------------- bilan --------------------------------- */
wrangler.kill("SIGTERM");
stub.close();
try { unlinkSync("worker/.dev.vars"); } catch (e) { /* déjà parti */ }

for (const r of results) {
  console.log(`  ${r.ok ? "✅" : "❌"} ${r.label}${r.ok ? "" : `\n      → ${r.why}`}`);
}
const rates = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - rates}/${results.length} contrôles du relais réussis`);
process.exit(rates ? 1 : 0);
