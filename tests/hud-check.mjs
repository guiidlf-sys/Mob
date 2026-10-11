/**
 * Vérification du HUD de Jarvis dans un vrai navigateur.
 *
 *   node tests/hud-check.mjs
 *
 * Lance hud/server.py sur un coffre temporaire, avec un faux `claude` qui
 * se comporte comme les skills (il écrit le plan dans le coffre) : aucun
 * jeton dépensé. Les boutons sont réellement cliqués et l'effet est vérifié
 * dans la page. Sort en code 1 au premier contrôle rouge.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "hud-"));
const vault = join(work, "coffre");
const shots = process.env.HUD_SHOTS || work;
const port = 7800 + Math.floor(Math.random() * 150);

// Le faux moteur : lit la commande sur stdin, trouve le coffre dans --add-dir.
const fake = join(work, "claude");
writeFileSync(fake, `#!/usr/bin/env python3
import sys, datetime, pathlib
prompt = sys.stdin.read().strip()
args = sys.argv[1:]
coffre = pathlib.Path(args[args.index("--add-dir") + 1])
jour = datetime.date.today().isoformat()
if prompt.startswith("/plan"):
    (coffre / "outputs" / f"{jour}-plan.md").write_text(
        "# Plan\\n\\n1. Finir le HUD\\n2. Relire [[Jarvis]]\\n3. Marcher\\n", encoding="utf-8")
    print("Trois priorités : finir le HUD, relire Jarvis, marcher.")
elif prompt.startswith("/metrics"):
    print("échec simulé", file=sys.stderr); sys.exit(3)
else:
    print("Réponse à : " + prompt)
`);
chmodSync(fake, 0o755);

const srv = spawn("python3", [join(root, "hud/server.py"), "--port", String(port), "--vault", vault, "--no-auto"],
  { env: { ...process.env, JARVIS_CLAUDE_BIN: fake }, stdio: ["ignore", "pipe", "pipe"] });
let srvErr = "";
srv.stderr.on("data", (d) => { srvErr += d; });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base + "api/state")).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const results = [];
async function check(label, fn) {
  try { await fn(); results.push([true, label]); }
  catch (e) { results.push([false, label, e.message]); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch(process.env.MOB_CHROMIUM ? { executablePath: process.env.MOB_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });

await page.goto(base);

await check("un seul écran, sans défilement de page sur un Mac", async () => {
  await page.waitForFunction(() => document.querySelector("#status").textContent === "ACTIF");
  const [sh, ih] = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
  assert(sh <= ih + 1, `la page défile (${sh} > ${ih})`);
  for (const id of ["vitals", "core", "audio", "agenda", "console", "vault"]) {
    assert(await page.isVisible("#" + id), `panneau ${id} invisible`);
  }
  assert((await page.locator("nav, [role=tablist]").count()) === 0, "des onglets sont apparus");
});

await check("les signes vitaux sont mesurés", async () => {
  const cpu = await page.locator("#vitalList .vital output").first().textContent();
  assert(/\d+%/.test(cpu), `CPU illisible : ${cpu}`);
});

await check("l'agenda montre la journée type", async () => {
  const times = await page.locator("#slots time").allTextContents();
  assert(times.join(",") === "07:00,09:00,14:00,19:00", times.join(","));
});

await check("le graphe compte les notes de départ et leurs liens", async () => {
  await page.waitForFunction(() => /\d+ notes · [1-9]\d* liens/.test(document.querySelector("#graphCount").textContent));
});

await check("« Plan » passe par le moteur, écrit le top 3 et coche l'agenda", async () => {
  await page.click('#quick button[data-cmd="/plan"]');
  await page.waitForSelector("#log .line:not(.me):not(.sys) >> text=Trois priorités", { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll("#top3 li").length === 3);
  const top = await page.locator("#top3 li").allTextContents();
  assert(top[0] === "Finir le HUD", top.join(" | "));
  assert(await page.locator(".slot.done").count() === 1, "le créneau 9 h n'est pas coché");
  assert(existsSync(join(vault, "outputs")), "pas de dossier outputs");
});

await check("le pipeline SPEAK → REMEMBER s'est allumé", async () => {
  const on = await page.locator(".stage.on").count();
  assert(on >= 3, `${on} étapes allumées`);
  assert((await page.textContent('[data-stage="route"] small')).includes("plan"), "route non affichée");
});

await check("l'échange est consigné dans le journal du coffre", async () => {
  const jour = new Date().toISOString().slice(0, 10);
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const file = [jour, local].map((d) => join(vault, "raw", d + ".md")).find(existsSync);
  assert(file, "journal absent");
  assert(readFileSync(file, "utf8").includes("[hud · plan]"), "ligne absente du journal");
});

await check("un échec du moteur s'affiche, sans casser l'écran", async () => {
  await page.click('#quick button[data-cmd="/metrics"]');
  await page.waitForSelector("#log .line.err", { timeout: 8000 });
  assert((await page.textContent("#log .line.err")).includes("Claude Code a échoué"), "message d'échec absent");
});

await check("une phrase tapée part au moteur telle quelle", async () => {
  await page.fill("#cmd", "qui est Paul ?");
  await page.press("#cmd", "Enter");
  await page.waitForSelector("#log >> text=Réponse à : qui est Paul ?", { timeout: 8000 });
});

await check("le créneau fait ouvre sa note, et un [[lien]] se suit", async () => {
  await page.click(".slot.done button");
  await page.waitForSelector("#noteBox:not([hidden])");
  assert((await page.textContent("#noteName")).endsWith("-plan.md"), "mauvaise note");
  await page.click('#noteView .wl[data-name="Jarvis"]');
  await page.waitForFunction(() => document.querySelector("#noteName").textContent === "wiki/Jarvis.md");
  await page.click("#noteClose");
  assert(await page.isVisible("#vaultList"), "la liste ne revient pas");
});

await check("la recherche fouille le coffre", async () => {
  await page.fill("#vaultSearch", "Obsidian");
  await page.waitForSelector('#vaultList [data-path="wiki/Jarvis.md"]');
  await page.fill("#vaultSearch", "");
});

await check("les interrupteurs de voix survivent au rechargement", async () => {
  await page.click("#tVoice");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#status").textContent === "ACTIF");
  assert(await page.getAttribute("#tVoice", "aria-pressed") === "true", "préférence perdue");
});

await check("cliquer un nœud du graphe ouvre sa note", async () => {
  await page.waitForFunction(() => /[1-9]\d* liens/.test(document.querySelector("#graphCount").textContent));
  await page.waitForTimeout(400);
  const box = await page.locator("#graph").boundingBox();
  let opened = false;
  for (let y = 40; y < box.height - 20 && !opened; y += 6) {
    for (let x = 20; x < box.width - 20 && !opened; x += 6) {
      await page.mouse.move(box.x + x, box.y + y);
      if (await page.isVisible("#nodeTip")) {
        await page.mouse.click(box.x + x, box.y + y);
        opened = await page.isVisible("#noteBox").catch(() => false);
      }
    }
  }
  assert(opened, "aucun nœud cliquable trouvé");
  await page.click("#noteClose");
});

await page.screenshot({ path: join(shots, "hud-desktop.png") });
await page.setViewportSize({ width: 402, height: 874 });
await page.waitForTimeout(300);
await check("sur téléphone, les panneaux s'empilent sans débordement horizontal", async () => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(sw <= iw, `débordement : ${sw} > ${iw}`);
});
await page.screenshot({ path: join(shots, "hud-mobile.png"), fullPage: true });

await check("aucune erreur JavaScript", async () => {
  const real = jsErrors.filter((e) => !/getUserMedia|speech/i.test(e));
  assert(real.length === 0, real.join(" | "));
});

await browser.close();
srv.kill();

let failed = 0;
for (const [ok, label, why] of results) {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : " — " + why}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} contrôles au vert. Captures : ${shots}`);
if (srvErr.trim()) console.log("stderr du serveur :\n" + srvErr);
process.exit(failed ? 1 : 0);
