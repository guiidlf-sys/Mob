/**
 * Vérification automatique de l'interface de Mob.
 *
 *   node tests/ui-check.mjs [url]
 *
 * Sans argument, teste le site en ligne. Chaque contrôle pilote un vrai
 * navigateur : les boutons sont réellement cliqués, et l'effet attendu
 * est vérifié dans la page — pas seulement leur présence dans le HTML.
 *
 * Sort en code 1 si quoi que ce soit échoue, pour que l'intégration
 * continue le remarque.
 */
import { chromium } from "playwright";

const URL_BASE = process.argv[2] || "https://guiidlf-sys.github.io/Mob/";

const results = [];
let currentGroup = "général";

function group(name) { currentGroup = name; }

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

// MOB_CHROMIUM permet de désigner un Chromium déjà présent, quand la
// version installée de Playwright ne correspond pas à celle qu'il
// téléchargerait. Sans la variable, comportement normal.
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

// Les confirmations bloquent le navigateur tant qu'on n'y répond pas.
page.on("dialog", (d) => d.accept());

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });

/* ------------------------------------------------------------------ */
group("chargement");

await check("la page répond et s'intitule « Mob »", async () => {
  assert((await page.title()) === "Mob", `titre inattendu : ${await page.title()}`);
});

await check("les éléments de l'écran principal sont là", async () => {
  for (const id of ["#messages", "#composer", "#input", "#send", "#openSettings", "#voiceToggle"]) {
    assert(await page.locator(id).count() === 1, `${id} introuvable`);
  }
});

await check("un thème est appliqué dès le chargement", async () => {
  const theme = await page.getAttribute("html", "data-theme");
  assert(theme === "dark" || theme === "light", `data-theme = ${theme}`);
});

/* ------------------------------------------------------------------ */
group("réglages");

await check("l'engrenage ouvre les réglages", async () => {
  // Sans clé, la fenêtre s'ouvre déjà seule au chargement.
  if (!(await page.locator("#settings").evaluate((d) => d.open))) {
    await page.click("#openSettings");
  }
  assert(await page.locator("#settings").evaluate((d) => d.open), "la fenêtre ne s'est pas ouverte");
});

await check("les cinq sections sont présentes", async () => {
  const titles = await page.locator(".section > h3").allTextContents();
  for (const expected of ["Compte", "Apparence", "Voix", "Conversation", "Données"]) {
    assert(titles.includes(expected), `section « ${expected} » absente (vu : ${titles.join(", ")})`);
  }
});

/* ------------------------------------------------------------------ */
group("thème");

for (const [choice, expected] of [["light", "light"], ["dark", "dark"]]) {
  await check(`le bouton thème « ${choice} » change réellement l'apparence`, async () => {
    await page.click(`#themeSeg button[data-theme-choice="${choice}"]`);
    const theme = await page.getAttribute("html", "data-theme");
    assert(theme === expected, `attendu ${expected}, obtenu ${theme}`);
    const pressed = await page.getAttribute(`#themeSeg button[data-theme-choice="${choice}"]`, "aria-pressed");
    assert(pressed === "true", "le bouton ne s'affiche pas comme sélectionné");
  });
}

await check("le fond suit vraiment le thème clair", async () => {
  await page.click('#themeSeg button[data-theme-choice="light"]');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  assert((r + g + b) / 3 > 180, `fond trop sombre pour un thème clair : ${bg}`);
});

await check("le thème choisi survit à un rechargement", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.getAttribute("html", "data-theme") === "light", "thème oublié après rechargement");
});

/* ------------------------------------------------------------------ */
group("taille du texte");

await check("les quatre tailles modifient la police", async () => {
  if (!(await page.locator("#settings").evaluate((d) => d.open))) await page.click("#openSettings");
  const seen = new Set();
  for (const size of ["15", "16", "18", "21"]) {
    await page.click(`#sizeSeg button[data-size="${size}"]`);
    const fs = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fs"));
    assert(fs === `${size}px`, `attendu ${size}px, obtenu « ${fs} »`);
    seen.add(fs);
  }
  assert(seen.size === 4, "toutes les tailles ne donnent pas un résultat distinct");
});

/* ------------------------------------------------------------------ */
group("curseurs");

await check("la vitesse de lecture met son libellé à jour", async () => {
  await page.locator("#rate").fill("1.5");
  await page.locator("#rate").dispatchEvent("input");
  assert((await page.textContent("#rateVal")) === "rapide", "libellé non mis à jour");
  await page.locator("#rate").fill("0.6");
  await page.locator("#rate").dispatchEvent("input");
  assert((await page.textContent("#rateVal")) === "lente", "libellé non mis à jour");
});

await check("la mémoire met son libellé à jour", async () => {
  await page.locator("#ctx").fill("40");
  await page.locator("#ctx").dispatchEvent("input");
  assert((await page.textContent("#ctxVal")) === "40 messages", "libellé non mis à jour");
});

/* ------------------------------------------------------------------ */
group("compte");

await check("l'état est « Non connecté » sans clé", async () => {
  const txt = await page.textContent("#accountWho");
  assert(txt.includes("Non connecté"), `état affiché : ${txt}`);
  assert(!(await page.locator("#keyFields").isHidden()), "le champ clé devrait être visible");
});

await check("enregistrer une clé connecte le compte", async () => {
  await page.fill("#key", "cle-de-test-pour-verification");
  await page.click('#settingsForm button[type="submit"]');
  await page.click("#openSettings");
  const txt = await page.textContent("#accountWho");
  assert(txt.includes("Connecté"), `état affiché : ${txt}`);
});

await check("la clé n'est PLUS redemandée une fois connecté", async () => {
  assert(await page.locator("#keyFields").isHidden(),
    "le champ clé est encore affiché alors que le compte est connecté");
  assert(!(await page.locator("#signOut").isHidden()), "le bouton de déconnexion manque");
});

await check("la clé survit à un rechargement (plus jamais redemandée)", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  const opened = await page.locator("#settings").evaluate((d) => d.open);
  assert(!opened, "les réglages se rouvrent alors qu'une clé est enregistrée");
  await page.click("#openSettings");
  assert((await page.textContent("#accountWho")).includes("Connecté"), "clé perdue au rechargement");
});

await check("enregistrer un autre réglage n'efface pas la clé", async () => {
  await page.click('#themeSeg button[data-theme-choice="dark"]');
  await page.click('#settingsForm button[type="submit"]');
  await page.click("#openSettings");
  assert((await page.textContent("#accountWho")).includes("Connecté"),
    "la clé a été effacée en enregistrant un autre réglage");
});

await check("la déconnexion remet à zéro", async () => {
  await page.click("#signOut");
  await page.click("#openSettings");
  assert((await page.textContent("#accountWho")).includes("Non connecté"), "toujours connecté après déconnexion");
});

/* ------------------------------------------------------------------ */
group("boutons restants");

await check("« Fermer » ferme les réglages", async () => {
  if (!(await page.locator("#settings").evaluate((d) => d.open))) await page.click("#openSettings");
  await page.click("#closeSettings");
  assert(!(await page.locator("#settings").evaluate((d) => d.open)), "la fenêtre est restée ouverte");
});

await check("le bouton voix bascule son état", async () => {
  const before = await page.getAttribute("#voiceToggle", "aria-pressed");
  await page.click("#voiceToggle");
  const after = await page.getAttribute("#voiceToggle", "aria-pressed");
  assert(before !== after, "aucun changement d'état");
});

await check("« Effacer la conversation » est opérant", async () => {
  await page.click("#openSettings");
  assert(await page.locator("#clearHistory").isEnabled(), "bouton inactif");
  await page.click("#clearHistory");
  assert(!(await page.locator("#settings").evaluate((d) => d.open)), "la fenêtre aurait dû se fermer");
});

await check("le bouton d'envoi réagit à la saisie", async () => {
  await page.fill("#input", "bonjour");
  assert(await page.locator("#send").isEnabled(), "bouton d'envoi inactif");
  await page.fill("#input", "");
});

/* ------------------------------------------------------------------ */
group("entrée vocale (?q=)");

await check("une question dans l'URL est posée automatiquement", async () => {
  await page.evaluate(() => localStorage.setItem("mob.key", JSON.stringify("cle-de-test")));
  await page.goto(`${URL_BASE}?q=question%20de%20test`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".msg.user", { timeout: 15000 });
  const txt = await page.textContent(".msg.user");
  assert(txt.includes("question de test"), `bulle utilisateur : ${txt}`);
});

await check("le paramètre est retiré de l'adresse", async () => {
  assert(!page.url().includes("?q="), `adresse encore polluée : ${page.url()}`);
});

await check("une clé invalide donne un message lisible, pas un plantage", async () => {
  await page.waitForSelector(".msg.error", { timeout: 30000 });
  const txt = await page.textContent(".msg.error");
  assert(txt.trim().length > 0, "bulle d'erreur vide");
});

/* ------------------------------------------------------------------ */
group("lisibilité et robustesse");

// Chacun de ces contrôles correspond à un défaut réellement trouvé :
// ils sont là pour qu'il ne revienne pas.

await check("en thème clair, les bulles se détachent du fond", async () => {
  await page.evaluate(() => {
    localStorage.setItem("mob.theme", JSON.stringify("light"));
    localStorage.setItem("mob.key", JSON.stringify("cle-de-test"));
    localStorage.setItem("mob.history", JSON.stringify([
      { role: "user", content: "question" },
      { role: "assistant", content: "réponse" },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bot = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.bot")).backgroundColor);
  const usr = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.user")).backgroundColor);

  assert(Math.abs(lum(bot) - lum(bg)) > 6, `bulle Mob indistincte du fond (${bot} sur ${bg})`);
  assert(Math.abs(lum(usr) - lum(bg)) > 6, `bulle utilisateur indistincte du fond (${usr} sur ${bg})`);
});

await check("les réglages tiennent dans l'écran", async () => {
  await page.click("#openSettings");
  const fits = await page.evaluate(() => {
    const d = document.getElementById("settings");
    return d.getBoundingClientRect().height <= window.innerHeight + 1;
  });
  assert(fits, "la fenêtre de réglages dépasse la hauteur de l'écran");
  await page.click("#closeSettings");
});

await check("une conversation très longue ne sature pas l'affichage", async () => {
  await page.evaluate(() => {
    const many = [];
    for (let i = 0; i < 400; i++) {
      many.push({ role: i % 2 ? "assistant" : "user", content: "message " + i });
    }
    localStorage.setItem("mob.history", JSON.stringify(many));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const drawn = await page.locator(".msg").count();
  assert(drawn > 0 && drawn <= 80, `${drawn} bulles dessinées pour 400 messages`);
  assert(await page.locator(".older").count() === 1, "le repère « messages plus anciens » manque");
});

await check("une question dictée avant la clé n'est pas perdue", async () => {
  await page.evaluate(() => {
    localStorage.removeItem("mob.key");
    localStorage.removeItem("mob.history");
  });
  await page.goto(`${URL_BASE}?q=question%20avant%20la%20cle`, { waitUntil: "domcontentloaded" });
  assert(await page.locator("#settings").evaluate((d) => d.open), "les réglages auraient dû s'ouvrir");

  await page.fill("#key", "cle-de-test");
  await page.click('#settingsForm button[type="submit"]');
  await page.waitForSelector(".msg.user", { timeout: 15000 });
  const txt = await page.textContent(".msg.user");
  assert(txt.includes("question avant la cle"), `question perdue (bulle : ${txt})`);
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
