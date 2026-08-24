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

/** Une discussion du journal, telle que l'app la stocke. */
let chatCounter = 0;
const chat = (messages, title = "Discussion de test") => ({
  id: "test-" + (++chatCounter),
  title,
  created: Date.now(),
  updated: Date.now(),
  messages,
});
const seedChats = (list) => seed({ "mob.chats": list });

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

await check("le thème sombre est appliqué par défaut", async () => {
  // La maquette est sombre : ouvrir Mob sur un appareil en mode clair ne
  // doit pas donner une interface blanche qui ne lui ressemble pas.
  assert(await page.getAttribute("html", "data-theme") === "dark",
    `thème par défaut = ${await page.getAttribute("html", "data-theme")}`);
});

await check("sans clé, l'app ouvre la conversation — jamais les réglages", async () => {
  assert(await page.locator("#view-chat.active").count() === 1,
    "le lancement devrait ouvrir la conversation");
  assert(await page.locator("#view-settings.active").count() === 0,
    "le lancement atterrit encore sur les réglages");
  assert(await page.locator("#keyBanner").isVisible(),
    "rien n'invite à ajouter la clé");
});

await check("le bandeau mène aux réglages et disparaît une fois la clé mise", async () => {
  await page.click("#addKey");
  assert(await page.locator("#view-settings.active").count() === 1,
    "« Ajouter ma clé » n'ouvre pas les réglages");
  await setKey("cle-de-test-bandeau");
  await go("chat");
  assert(await page.locator("#keyBanner").isHidden(), "le bandeau reste affiché une fois connecté");
  // On repart sans clé : les contrôles suivants vérifient l'état déconnecté.
  await page.evaluate(() => localStorage.removeItem("mob.key"));
  await page.reload({ waitUntil: "domcontentloaded" });
});

/* ------------------------------------------------------------------ */
group("navigation");

await check("les vues de base s'ouvrent", async () => {
  for (const view of ["home", "chat", "historique", "creations", "settings"]) {
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
group("tableau de bord");

// Le tableau de bord ne calcule que sur des messages datés : on en sème
// à des dates connues, comme le ferait un usage réel étalé sur la semaine.
const DAY = 86400000;
const dated = (offsetDays, role, content) =>
  ({ role, content, ts: Date.now() - offsetDays * DAY });

await check("l'accueil s'ouvre sur le tableau de bord", async () => {
  await go("home");
  for (const sel of ["#heroValue", "#watchlist", "#metrics", "#chartHost", "#homeTabs"]) {
    assert(await page.locator(sel).count() === 1, `${sel} introuvable`);
  }
});

await check("le chiffre principal compte l'activité de la période", async () => {
  await seedChats([chat([
    dated(1, "user", "hier"),
    dated(2, "assistant", "réponse IMAGE(a violet robot)"),
  ]), chat([
    dated(3, "user", "avant-hier"),
    dated(40, "user", "il y a longtemps"),
  ])]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("home");
  assert((await page.textContent("#heroValue")) === "3",
    `attendu 3 sur 30 jours, obtenu ${await page.textContent("#heroValue")}`);
});

await check("changer de période change le chiffre", async () => {
  await page.selectOption("#period", "365");
  assert((await page.textContent("#heroValue")) === "4",
    `attendu 4 sur un an, obtenu ${await page.textContent("#heroValue")}`);
  await page.selectOption("#period", "30");
});

await check("la liste d'activité détaille quatre lignes chiffrées", async () => {
  assert(await page.locator("#watchlist .list-row").count() === 4,
    "la liste d'activité ne montre pas ses quatre lignes");
  assert(await page.locator("#watchlist .delta").count() === 4, "les variations manquent");
  const images = await page.textContent("#watchlist .list-row:nth-child(3) .vl b");
  assert(images === "1", `une image attendue, obtenu ${images}`);
});

await check("les quatre tuiles de « Ton espace » sont remplies", async () => {
  assert(await page.locator("#metrics .metric").count() === 4, "il manque des tuiles");
  assert((await page.textContent("#metrics .metric:nth-child(1) b")) === "2", "nombre de discussions faux");
  assert((await page.textContent("#metrics .metric:nth-child(2) b")) === "4", "total de messages faux");
});

await check("le graphique est réellement tracé", async () => {
  assert(await page.locator("#chartHost svg").count() === 1, "aucune courbe dessinée");
  assert(await page.locator("#chartHost .tip").count() === 1, "l'infobulle manque");
  assert((await page.textContent("#chartHost .tip")).trim().length > 0, "infobulle vide");
});

await check("les pilules de période redessinent la courbe", async () => {
  // Sur 1 jour il n'y a rien : la courbe doit céder la place à un message,
  // pas rester figée sur le tracé du mois.
  await page.click('#ranges button[data-range="1J"]');
  assert(await page.getAttribute('#ranges button[data-range="1J"]', "aria-pressed") === "true",
    "la pilule ne s'affiche pas comme sélectionnée");
  assert(await page.locator("#chartHost .chart-empty").count() === 1,
    "la courbe n'a pas été redessinée pour la journée");
  await page.click('#ranges button[data-range="1M"]');
  assert(await page.locator("#chartHost svg").count() === 1, "retour au mois sans courbe");
});

await check("les onglets changent réellement les panneaux affichés", async () => {
  await page.click('#homeTabs button[data-tab="outils"]');
  assert(await page.locator("#quick").isVisible(), "les actions rapides ne s'affichent pas");
  assert(await page.locator("#watchlist").isHidden(), "la liste d'activité aurait dû être masquée");
  await page.click('#homeTabs button[data-tab="apercu"]');
  assert(await page.locator("#watchlist").isVisible(), "la liste d'activité n'est pas revenue");
  assert(await page.locator("#quick").isHidden(), "les actions rapides auraient dû être masquées");
});

await check("une action rapide prépare la question dans la conversation", async () => {
  await page.click('#homeTabs button[data-tab="outils"]');
  await page.click("#quick button:first-child");
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation ne s'est pas ouverte");
  const typed = await page.inputValue("#input");
  assert(typed.startsWith("Génère une image"), `saisie préparée inattendue : « ${typed} »`);
  await page.fill("#input", "");
});

await check("le bouton de la carte en dégradé ouvre la conversation", async () => {
  await go("home");
  await page.click('#homeTabs button[data-tab="apercu"]');
  await page.click("#promoCta");
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation ne s'est pas ouverte");
});

/* ------------------------------------------------------------------ */
group("en-tête");

await check("la barre « Demande à Mob » pose bien la question", async () => {
  // Sans clé, la question est mise de côté et la conversation s'ouvre
  // avec son bandeau : l'effet se vérifie sans appel réseau.
  await page.evaluate(() => localStorage.removeItem("mob.key"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("home");
  await page.fill("#ask", "une question depuis l'en-tête");
  await page.locator("#ask").press("Enter");
  assert(await page.locator("#view-chat.active").count() === 1,
    "la question de l'en-tête n'a pas ouvert la conversation");
  assert(await page.locator("#keyBanner").isVisible(), "le bandeau de clé manque");
});

await check("la cloche ouvre puis referme les notifications", async () => {
  await page.click("#bell");
  assert(await page.locator("#notifs").isVisible(), "le panneau ne s'est pas ouvert");
  assert((await page.textContent("#notifBody")).includes("clé"), "le panneau ne dit rien de la clé");
  await page.click("#headSub");
  assert(await page.locator("#notifs").isHidden(), "le panneau est resté ouvert");
});

await check("le bloc profil mène aux réglages", async () => {
  await go("home");
  await page.click("#profileBtn");
  assert(await page.locator("#view-settings.active").count() === 1, "les réglages ne se sont pas ouverts");
});

await check("le nom affiché apparaît dans la salutation et l'avatar", async () => {
  await page.fill("#displayName", "Guillaume");
  await page.locator("#displayName").dispatchEvent("change");
  assert((await page.textContent("#profileName")) === "Guillaume", "le profil n'affiche pas le nom");
  assert((await page.textContent("#avatar")) === "G", "l'avatar ne porte pas l'initiale");
  await go("home");
  assert((await page.textContent("#headTitleText")).includes("Guillaume"),
    `salutation sans le nom : ${await page.textContent("#headTitleText")}`);
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
  await seedChats([chat([
    { role: "user", content: "dessine" },
    { role: "assistant", content: "voilà IMAGE(a red cube)" },
    { role: "assistant", content: "```html\n<!doctype html><h1>Hello</h1>\n```" },
  ])]);
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
group("historique des discussions");

await check("entrer sur le site ouvre une discussion neuve", async () => {
  await seed({ "mob.key": "cle-de-test" });
  await seedChats([chat([
    { role: "user", content: "vieille question", ts: Date.now() - 3600000 },
    { role: "assistant", content: "vieille réponse", ts: Date.now() - 3600000 },
  ], "Vieille discussion")]);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation ne s'ouvre pas au lancement");
  assert(await page.locator(".msg").count() === 0,
    "la discussion précédente a été rouverte au lieu d'une neuve");
  assert((await page.textContent("#chatTitle")) === "Nouvelle discussion", "le bandeau ne dit pas « nouvelle »");
});

await check("la discussion précédente est retrouvable dans l'historique", async () => {
  await go("historique");
  assert(await page.locator("#histList .hist-row").count() === 1, "le journal est vide");
  assert((await page.textContent("#histList .hist-open b")) === "Vieille discussion",
    "le titre de la discussion manque");
});

await check("rouvrir une discussion restaure ses messages", async () => {
  await page.click("#histList .hist-open");
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation ne s'est pas ouverte");
  assert(await page.locator(".msg").count() === 2, "les messages n'ont pas été restaurés");
  assert((await page.textContent("#chatTitle")) === "Vieille discussion", "le bandeau n'a pas suivi");
});

await check("« ＋ Nouvelle » repart d'une page blanche sans rien perdre", async () => {
  await page.click("#newChat");
  assert(await page.locator(".msg").count() === 0, "la nouvelle discussion n'est pas vide");
  await go("historique");
  assert(await page.locator("#histList .hist-row").count() === 1,
    "l'ancienne discussion a disparu du journal");
});

await check("une discussion vide n'entre pas au journal", async () => {
  // Sans cette règle, chaque ouverture du site laisserait une coquille vide.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mob.chats") || "[]").length);
  assert(stored === 1, `${stored} discussions enregistrées au lieu d'une`);
});

await check("supprimer une discussion la retire vraiment", async () => {
  await page.click("#histList .hist-del");
  assert(await page.locator("#histList .hist-row").count() === 0, "la ligne est restée");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mob.chats") || "[]").length);
  assert(stored === 0, `${stored} discussions encore stockées`);
});

await check("l'ancienne conversation unique est reprise, pas perdue", async () => {
  // Les utilisateurs de la version précédente ont un « mob.history » :
  // il doit devenir la première discussion du journal, pas disparaître.
  await page.evaluate(() => {
    localStorage.removeItem("mob.chats");
    localStorage.setItem("mob.history", JSON.stringify([
      { role: "user", content: "question d'avant la mise à jour", ts: Date.now() - 7200000 },
      { role: "assistant", content: "réponse d'avant", ts: Date.now() - 7200000 },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("historique");
  assert(await page.locator("#histList .hist-row").count() === 1, "l'ancienne conversation a été perdue");
  assert((await page.textContent("#histList .hist-open b")).includes("avant la mise à jour"),
    "le titre repris est faux");
  const legacy = await page.evaluate(() => localStorage.getItem("mob.history"));
  assert(legacy === null, "l'ancienne clé subsiste et sera comptée deux fois");
});

await check("« Effacer tout l'historique » vide le journal", async () => {
  await page.click("#clearAll");
  assert(await page.locator("#histList .hist-row").count() === 0, "des discussions subsistent");
});

/* ------------------------------------------------------------------ */
group("créations");

await check("les images et pages générées sont regroupées", async () => {
  await seedChats([chat([
    { role: "assistant", content: "voilà IMAGE(a red cube)" },
    { role: "assistant", content: "```html\n<!doctype html><h1>Hello</h1>\n```" },
  ])]);
  await page.reload({ waitUntil: "domcontentloaded" });
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

await check("« Effacer la discussion en cours » vide bien la conversation", async () => {
  await go("settings");
  await page.click("#clearHistory");
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation ne s'est pas rouverte");
  assert(await page.locator(".msg").count() === 0, "des bulles subsistent");
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
  assert(await page.locator("#view-chat.active").count() === 1, "la conversation aurait dû s'ouvrir");
  assert(await page.locator("#keyBanner").isVisible(), "le bandeau de clé manque");
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
    "mob.chats": [chat([{ role: "user", content: "question" }, { role: "assistant", content: "réponse" }])],
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("historique");
  await page.click("#histList .hist-open");
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bot = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.bot")).backgroundColor);
  const usr = await page.evaluate(() => getComputedStyle(document.querySelector(".msg.user")).backgroundColor);
  assert(Math.abs(lum(bot) - lum(bg)) > 6, `bulle Mob indistincte du fond (${bot} sur ${bg})`);
  assert(Math.abs(lum(usr) - lum(bg)) > 6, `bulle utilisateur indistincte du fond (${usr} sur ${bg})`);
});

await check("la barre de recherche est une pilule, pas une boîte dans une boîte", async () => {
  // La règle générale des champs de formulaire l'emportait sur celle de la
  // barre : le champ redessinait un cadre gris à l'intérieur de la pilule.
  const box = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("#ask"));
    return { border: cs.borderTopWidth, bg: cs.backgroundColor };
  });
  assert(box.border === "0px", `le champ garde une bordure (${box.border})`);
  assert(/rgba\(0, 0, 0, 0\)|transparent/.test(box.bg), `le champ garde un fond (${box.bg})`);
});

await check("le sélecteur de période reste une pastille", async () => {
  await go("home");
  const ratio = await page.evaluate(() => {
    const sel = document.querySelector("#period").getBoundingClientRect();
    const card = document.querySelector(".hero").getBoundingClientRect();
    return sel.width / card.width;
  });
  assert(ratio < 0.7, `le sélecteur occupe ${Math.round(ratio * 100)} % de la carte`);
});

await check("l'infobulle du graphique reste dans sa carte", async () => {
  await seedChats([chat([
    { role: "user", content: "a", ts: Date.now() - 2 * 86400000 },
    { role: "assistant", content: "b", ts: Date.now() - 2 * 86400000 },
    { role: "user", content: "c", ts: Date.now() - 1 * 86400000 },
  ])]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("home");
  const inside = await page.evaluate(() => {
    const tip = document.querySelector("#chartHost .tip").getBoundingClientRect();
    const card = document.querySelector(".chart-wrap").getBoundingClientRect();
    return tip.top >= card.top - 1 && tip.bottom <= card.bottom + 1;
  });
  assert(inside, "l'infobulle sort de la carte du graphique");
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
    localStorage.setItem("mob.chats", JSON.stringify([{
      id: "long", title: "Longue", created: Date.now(), updated: Date.now(), messages: many,
    }]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("historique");
  await page.click("#histList .hist-open");
  const drawn = await page.locator(".msg").count();
  assert(drawn > 0 && drawn <= 80, `${drawn} bulles dessinées pour 400 messages`);
  assert(await page.locator(".older").count() === 1, "le repère « messages plus anciens » manque");
});

/* ------------------------------------------------------------------ */
group("grand écran");

await check("la navigation devient une barre latérale à gauche", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const [navBox, mainBox] = await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect();
                       return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    return [r("nav"), r("main")];
  });
  assert(navBox.x < mainBox.x, "la barre latérale n'est pas à gauche du contenu");
  assert(navBox.h > navBox.w, "la barre latérale n'est pas en colonne");
});

await check("Réglages et Aide sont épinglés en bas de la barre", async () => {
  const gap = await page.evaluate(() => {
    const main = document.querySelector(".nav-main").getBoundingClientRect();
    const foot = document.querySelector(".nav-foot").getBoundingClientRect();
    const nav = document.querySelector("nav").getBoundingClientRect();
    return { after: foot.y - main.bottom, toBottom: nav.bottom - foot.bottom };
  });
  assert(gap.after > 40, "le bloc du bas n'est pas repoussé vers le bas");
  assert(gap.toBottom < 40, "le bloc du bas ne touche pas le bas de la barre");
});

await check("l'onglet Aide s'ouvre sur grand écran", async () => {
  await go("help");
  assert(await page.locator("#view-help .card").count() >= 3, "la page d'aide est vide");
});

await check("le tableau de bord passe sur deux colonnes", async () => {
  await go("home");
  const cols = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".dash")).gridTemplateColumns.split(" ").length);
  assert(cols === 2, `${cols} colonne(s) au lieu de 2`);
});

await check("rien ne déborde non plus sur grand écran", async () => {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `${overflow}px de débordement horizontal`);
  await page.setViewportSize({ width: 402, height: 874 });
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
