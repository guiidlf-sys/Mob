/**
 * Vérification automatique de l'interface de Mob.
 *
 *   node tests/ui-check.mjs [url]
 *
 * Sans argument, teste le site en ligne. Chaque contrôle pilote un vrai
 * navigateur : les boutons sont réellement cliqués, et l'effet obtenu est
 * vérifié dans la page — pas seulement leur présence dans le HTML.
 *
 * Sort en code 1 si quoi que ce soit échoue, pour que l'intégration
 * continue le remarque.
 */
import { chromium } from "playwright";

const URL_BASE = process.argv[2] || "https://guiidlf-sys.github.io/Mob/";

const results = [];
let currentGroup = "général";
const group = (name) => { currentGroup = name; };

async function check(label, fn) {
  try {
    await fn();
    results.push({ group: currentGroup, label, ok: true });
  } catch (err) {
    results.push({ group: currentGroup, label, ok: false, why: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// MOB_CHROMIUM désigne un Chromium déjà présent, quand la version
// installée de Playwright ne correspond pas à celle qu'il téléchargerait.
const browser = await chromium.launch(
  process.env.MOB_CHROMIUM ? { executablePath: process.env.MOB_CHROMIUM } : {}
);
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },        // iPhone 17 Pro, en gros
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) " +
             "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile Safari/604.1",
});
const page = await context.newPage();

// Une erreur JavaScript non gérée est une panne, même si l'écran a l'air normal.
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });
page.on("dialog", (d) => d.accept());

/** Passe dans une vue par la barre de navigation, comme le ferait un doigt. */
const go = async (view) => {
  await page.click(`nav button[data-view="${view}"]`);
  await page.waitForSelector(`#view-${view}.active`, { timeout: 4000 });
};

/** Enregistre une clé : la sauvegarde se fait à la validation du champ. */
const setKey = async (value) => {
  await go("settings");
  if (await page.locator("#keyFields").isHidden()) await page.click("#editKey");
  await page.fill("#key", value);
  await page.locator("#key").dispatchEvent("change");
};

const seed = (state) => page.evaluate((s) => {
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
}, state);

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });

/* ------------------------------------------------------------------ */
group("chargement");

await check("la page répond et s'intitule « Mob »", async () => {
  assert((await page.title()) === "Mob", `titre inattendu : ${await page.title()}`);
});

await check("les éléments de l'écran principal sont là", async () => {
  for (const sel of ["#messages", "#composer", "#input", "#send", "#voiceToggle", "nav"]) {
    assert(await page.locator(sel).count() === 1, `${sel} introuvable`);
  }
});

await check("un thème est appliqué dès le chargement", async () => {
  const theme = await page.getAttribute("html", "data-theme");
  assert(theme === "dark" || theme === "light", `data-theme = ${theme}`);
});

await check("sans clé, l'app conduit vers les réglages", async () => {
  assert(await page.locator("#view-settings.active").count() === 1,
    "la vue Réglages devrait être ouverte au premier lancement");
});

/* ------------------------------------------------------------------ */
group("navigation");

await check("les trois vues de base s'ouvrent", async () => {
  for (const view of ["chat", "creations", "settings"]) {
    await go(view);
    assert(await page.locator(`#view-${view}.active`).count() === 1, `vue ${view} inactive`);
  }
});

await check("une seule vue est visible à la fois", async () => {
  assert(await page.locator(".view.active").count() === 1, "plusieurs vues actives simultanément");
});

await check("l'onglet courant est signalé", async () => {
  await go("chat");
  const marked = await page.locator('nav button[aria-current="page"]').count();
  assert(marked === 1, `${marked} onglets marqués comme courants`);
});

/* ------------------------------------------------------------------ */
group("thème");

for (const choice of ["light", "dark"]) {
  await check(`le bouton thème « ${choice} » change réellement l'apparence`, async () => {
    await go("settings");
    await page.click(`#themeSeg button[data-theme-choice="${choice}"]`);
    assert(await page.getAttribute("html", "data-theme") === choice,
      `attendu ${choice}, obtenu ${await page.getAttribute("html", "data-theme")}`);
    assert(await page.getAttribute(`#themeSeg button[data-theme-choice="${choice}"]`, "aria-pressed") === "true",
      "le bouton ne s'affiche pas comme sélectionné");
  });
}

await check("le thème choisi survit à un rechargement", async () => {
  await page.click('#themeSeg button[data-theme-choice="light"]');
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.getAttribute("html", "data-theme") === "light", "thème oublié après rechargement");
});

/* ------------------------------------------------------------------ */
group("taille du texte");

await check("les quatre tailles modifient la police", async () => {
  await go("settings");
  const seen = new Set();
  for (const size of ["15", "16", "18", "21"]) {
    await page.click(`#sizeSeg button[data-size="${size}"]`);
    const fs = await page.evaluate(() => document.documentElement.style.getPropertyValue("--fs"));
    assert(fs === `${size}px`, `attendu ${size}px, obtenu « ${fs} »`);
    seen.add(fs);
  }
  assert(seen.size === 4, "toutes les tailles ne donnent pas un résultat distinct");
});

/* ------------------------------------------------------------------ */
group("compte");

await check("l'état est « Non connecté » sans clé", async () => {
  const txt = await page.textContent("#accountWho");
  assert(txt.includes("Non connecté"), `état affiché : ${txt}`);
  assert(!(await page.locator("#keyFields").isHidden()), "le champ clé devrait être visible");
});

await check("enregistrer une clé connecte le compte", async () => {
  await setKey("cle-de-test-pour-verification");
  assert((await page.textContent("#accountWho")).includes("Connecté"), "état non mis à jour");
});

await check("la clé n'est PLUS redemandée une fois connecté", async () => {
  assert(await page.locator("#keyFields").isHidden(),
    "le champ clé est encore affiché alors que le compte est connecté");
  assert(!(await page.locator("#signOut").isHidden()), "le bouton de déconnexion manque");
});

await check("la clé survit à un rechargement (plus jamais redemandée)", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("settings");
  assert((await page.textContent("#accountWho")).includes("Connecté"), "clé perdue au rechargement");
});

await check("changer un autre réglage n'efface pas la clé", async () => {
  await page.click('#themeSeg button[data-theme-choice="dark"]');
  await page.click('#sizeSeg button[data-size="18"]');
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("settings");
  assert((await page.textContent("#accountWho")).includes("Connecté"),
    "la clé a été effacée en changeant un autre réglage");
});

await check("la déconnexion remet à zéro", async () => {
  await page.click("#signOut");
  await go("settings");
  assert((await page.textContent("#accountWho")).includes("Non connecté"), "toujours connecté après déconnexion");
});

/* ------------------------------------------------------------------ */
group("espace admin");

await check("l'onglet Admin est absent par défaut", async () => {
  assert(await page.locator("#navAdmin").isHidden(), "l'onglet Admin est visible sans déverrouillage");
  assert(await page.locator("#adminBadge").isHidden(), "le badge Admin est visible sans déverrouillage");
});

await check("un mauvais code n'ouvre rien", async () => {
  await go("settings");
  await page.fill("#adminCode", "mauvais-code");
  await page.click("#adminEnter");
  assert(await page.locator("#navAdmin").isHidden(), "l'espace admin s'est ouvert avec un mauvais code");
});

await check("le bon code ouvre l'espace admin", async () => {
  await page.fill("#adminCode", "mob");
  await page.click("#adminEnter");
  assert(!(await page.locator("#navAdmin").isHidden()), "l'onglet Admin ne s'est pas affiché");
  assert(!(await page.locator("#adminBadge").isHidden()), "le badge Admin ne s'est pas affiché");
  assert(await page.locator("#view-admin.active").count() === 1, "la vue Admin ne s'est pas ouverte");
});

await check("les réglages avancés ne sont QUE dans l'espace admin", async () => {
  // Modèle, mémoire et personnalité doivent être hors de portée de l'utilisateur simple.
  for (const sel of ["#model", "#ctx", "#sysPrompt"]) {
    const inAdmin = await page.locator(`#view-admin ${sel}`).count();
    assert(inAdmin === 1, `${sel} devrait vivre dans l'espace admin`);
    assert(await page.locator(`#view-settings ${sel}`).count() === 0,
      `${sel} ne devrait pas être accessible depuis les réglages utilisateur`);
  }
});

await check("les statistiques se remplissent", async () => {
  await seed({ "mob.history": [
    { role: "user", content: "dessine" },
    { role: "assistant", content: "voilà IMAGE(a red cube)" },
    { role: "assistant", content: "```html\n<!doctype html><h1>Hello</h1>\n```" },
  ] });
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("admin");
  assert((await page.textContent("#statMsgs")) === "3", "compte de messages faux");
  assert((await page.textContent("#statImgs")) === "1", "compte d'images faux");
  assert((await page.textContent("#statSites")) === "1", "compte de pages faux");
});

await check("la personnalité est modifiable et se rétablit", async () => {
  await page.fill("#sysPrompt", "Tu es un pirate.");
  await page.locator("#sysPrompt").dispatchEvent("change");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mob.prompt")));
  assert(saved === "Tu es un pirate.", `prompt non enregistré : ${saved}`);
  await page.click("#resetPrompt");
  const back = await page.inputValue("#sysPrompt");
  assert(back.includes("IMAGE("), "le texte d'origine n'a pas été rétabli");
});

await check("quitter le mode admin referme l'espace", async () => {
  await go("settings");
  await page.click("#adminLeave");
  assert(await page.locator("#navAdmin").isHidden(), "l'onglet Admin est resté visible");
  assert(await page.locator("#view-admin.active").count() === 0, "la vue Admin est restée ouverte");
});

await check("l'espace admin reste fermé après rechargement", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.locator("#navAdmin").isHidden(), "l'onglet Admin revient tout seul");
});

/* ------------------------------------------------------------------ */
group("créations");

await check("les images et pages générées sont regroupées", async () => {
  await go("creations");
  assert(await page.locator("#creations .tile img").count() >= 1, "aucune image dans la galerie");
  assert(await page.locator("#creations .gen-actions button").count() >= 3,
    "les boutons d'une page générée manquent");
});

/* ------------------------------------------------------------------ */
group("boutons restants");

await check("le bouton voix bascule des deux côtés", async () => {
  const before = await page.getAttribute("#voiceToggle", "aria-pressed");
  await page.click("#voiceToggle");
  assert(await page.getAttribute("#voiceToggle", "aria-pressed") !== before, "aucun changement d'état");
  await go("settings");
  assert(await page.getAttribute("#speakPref", "aria-pressed") !== before,
    "le réglage Voix ne reflète pas le bouton de l'en-tête");
  await page.click("#speakPref");
  assert(await page.getAttribute("#voiceToggle", "aria-pressed") === before,
    "le bouton de l'en-tête ne reflète pas le réglage");
});

await check("la vitesse de lecture met son libellé à jour", async () => {
  await page.locator("#rate").fill("1.5");
  await page.locator("#rate").dispatchEvent("input");
  assert((await page.textContent("#rateVal")) === "rapide", "libellé non mis à jour");
  await page.locator("#rate").fill("0.6");
  await page.locator("#rate").dispatchEvent("input");
  assert((await page.textContent("#rateVal")) === "lente", "libellé non mis à jour");
});

await check("« Effacer la conversation » vide bien la conversation", async () => {
  await page.click("#clearHistory");
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem("mob.history") || "[]").length);
  assert(left === 0, `${left} messages restants`);
});

await check("le bouton d'envoi réagit à la saisie", async () => {
  await go("chat");
  await page.fill("#input", "bonjour");
  assert(await page.locator("#send").isEnabled(), "bouton d'envoi inactif");
  await page.fill("#input", "");
});

/* ------------------------------------------------------------------ */
group("entrée vocale (?q=)");

await check("une question dans l'URL est posée automatiquement", async () => {
  await seed({ "mob.key": "cle-de-test" });
  await page.goto(`${URL_BASE}?q=question%20de%20test`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".msg.user", { timeout: 15000 });
  assert((await page.textContent(".msg.user")).includes("question de test"), "question non posée");
});

await check("le paramètre est retiré de l'adresse", async () => {
  assert(!page.url().includes("?q="), `adresse encore polluée : ${page.url()}`);
});

await check("une clé invalide donne un message lisible, pas un plantage", async () => {
  await page.waitForSelector(".msg.error", { timeout: 30000 });
  assert((await page.textContent(".msg.error")).trim().length > 0, "bulle d'erreur vide");
});

await check("une question dictée avant la clé n'est pas perdue", async () => {
  await page.evaluate(() => { localStorage.removeItem("mob.key"); localStorage.removeItem("mob.history"); });
  await page.goto(`${URL_BASE}?q=question%20avant%20la%20cle`, { waitUntil: "domcontentloaded" });
  assert(await page.locator("#view-settings.active").count() === 1, "les réglages auraient dû s'ouvrir");
  await setKey("cle-de-test");
  await page.waitForSelector(".msg.user", { timeout: 15000 });
  assert((await page.textContent(".msg.user")).includes("question avant la cle"), "question perdue");
  // Attendre l'issue de l'appel : une réponse arrivant plus tard
  // réécrirait l'historique préparé par le contrôle suivant.
  await page.waitForSelector(".msg.error", { timeout: 30000 });
});

/* ------------------------------------------------------------------ */
group("lisibilité et robustesse");

// Chacun de ces contrôles correspond à un défaut réellement trouvé :
// ils sont là pour qu'il ne revienne pas.

await check("en thème clair, les bulles se détachent du fond", async () => {
  await seed({
    "mob.theme": "light", "mob.key": "cle-de-test",
    "mob.history": [{ role: "user", content: "question" }, { role: "assistant", content: "réponse" }],
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bot = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.bot")).backgroundColor);
  const usr = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.user")).backgroundColor);
  assert(Math.abs(lum(bot) - lum(bg)) > 6, `bulle Mob indistincte du fond (${bot} sur ${bg})`);
  assert(Math.abs(lum(usr) - lum(bg)) > 6, `bulle utilisateur indistincte du fond (${usr} sur ${bg})`);
});

await check("rien ne déborde horizontalement", async () => {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `${overflow}px de débordement horizontal`);
});

await check("une conversation très longue ne sature pas l'affichage", async () => {
  await page.evaluate(() => {
    const many = [];
    for (let i = 0; i < 400; i++) many.push({ role: i % 2 ? "assistant" : "user", content: "message " + i });
    localStorage.setItem("mob.history", JSON.stringify(many));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const drawn = await page.locator(".msg").count();
  assert(drawn > 0 && drawn <= 80, `${drawn} bulles dessinées pour 400 messages`);
  assert(await page.locator(".older").count() === 1, "le repère « messages plus anciens » manque");
});

/* ------------------------------------------------------------------ */
group("erreurs JavaScript");

await check("aucune erreur JavaScript pendant toute la session", async () => {
  // Les échecs réseau attendus (clé de test invalide) ne sont pas des bugs.
  const real = jsErrors.filter((e) =>
    !/401|403|Failed to load resource|net::ERR|status of 4\d\d/i.test(e));
  assert(real.length === 0, real.join(" | "));
});

/* ------------------------------------------------------------------ */
await browser.close();

const failed = results.filter((r) => !r.ok);
let lastGroup = "";
for (const r of results) {
  if (r.group !== lastGroup) { console.log(`\n▸ ${r.group}`); lastGroup = r.group; }
  console.log(`  ${r.ok ? "✅" : "❌"} ${r.label}${r.ok ? "" : `\n      → ${r.why}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies — ${URL_BASE}`);

process.exit(failed.length ? 1 : 0);
