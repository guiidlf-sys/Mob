# Jarvis OS — les 4 pièces

> Une voix. Tout ton flux. Zéro onglet.

| Pièce | Rôle | Où |
|---|---|---|
| **Claude Code** | Le moteur. Route chaque demande vers la bonne skill. | `.claude/skills/` |
| **Obsidian** | La mémoire. Tout est du Markdown lié. | `vault/` |
| **Dun** | La voix. Ce que tu dis devient du texte sur l'iPhone. | clavier iPhone |
| **Le HUD** | Le visage. Un écran : vitals, agenda, commandes. | `hud/` |

Chaque pièce se remplace sans toucher aux autres : le moteur peut être
Ollama (`--engine ollama`), le coffre n'importe quel dossier Obsidian
(`JARVIS_VAULT`), la voix n'importe quel clavier de dictée.

---

## Étape 1 — Le cerveau (fait)

Claude Code + un dossier de skills. Chaque skill est un `SKILL.md` chargé
seulement quand il sert. **Règle : une skill, un rôle.**

| Skill | Rôle | Écrit |
|---|---|---|
| `inbox` | briefing du matin : mails, agenda, actu IA | `outputs/<date>-inbox.md` |
| `plan` | les 3 priorités du jour | `outputs/<date>-plan.md` |
| `metrics` | relève tes chiffres (abonnés, vues…) | `raw/metrics.md` + `outputs/<date>-metrics.md` |
| `vault` | lit et écrit la mémoire | `wiki/*.md` |
| `wrap` | bilan du soir, prépare demain | `outputs/<date>-wrap.md` |

Dans n'importe quelle session Claude Code ouverte dans ce dépôt :
`/plan`, `/wrap fini la maquette`, ou simplement « qu'est-ce que je dois
faire aujourd'hui ? » — Claude choisit la skill d'après sa description.

**Ce que les skills ne font pas toutes seules** : lire tes mails et ton
agenda demande un connecteur branché dans Claude Code (Gmail, Google
Calendar…). Sans lui, `inbox` écrit « Mails : non connectés » — il
n'invente rien. Pareil pour `metrics` : remplis
`vault/wiki/Sources de chiffres.md`, et un chiffre illisible est noté
`non lu`, jamais estimé.

## Étape 2 — La mémoire (fait)

```
vault/
  raw/       captures brutes, ajout seulement
  wiki/      notes liées par [[liens]]
  outputs/   briefings, plans, bilans
```

Ouvre `vault/` dans Obsidian (« Ouvrir un dossier comme coffre ») : la vue
Graphe montre les mêmes liens que le HUD. Le contenu du coffre n'est
**jamais** envoyé sur GitHub (dépôt public) — voir `vault/README.md`.

## Étape 3 — Dun (à toi, 2 minutes)

Dun est un clavier iPhone : tu parles, il tape. Ta voix reste sur
l'iPhone, pas de compte, et il marche partout où tu écris.

1. Installe **Dun** depuis l'App Store.
2. Réglages → Général → Clavier → Claviers → **Ajouter un clavier** → Dun.
3. Dans n'importe quel champ (Mob, Claude, le HUD), touche 🌐 pour passer
   au clavier Dun, et parle.

Dun n'est pas branché à Jarvis : il produit du texte, c'est tout. Les
réponses parlées viennent d'ailleurs — la synthèse vocale du HUD, ou
celle de Mob (bouton 🔊).

Je ne peux pas l'installer à ta place : c'est une app sur ton téléphone.

## Étape 4 — Le visage (fait)

Sur le Mac, dans ce dépôt :

```
python3 hud/server.py
```

puis ouvre **http://127.0.0.1:7777**. Python 3.9+ et Claude Code installé
(`claude` dans le terminal) ; rien d'autre.

![HUD](preview.png)

Un seul écran, pas d'onglets :

- **Vitals** — CPU, mémoire, disque, batterie, et la charge des 5 dernières minutes.
- **Memory graph** — chaque point brillant est une note du coffre, chaque
  trait un `[[lien]]`. Clique un point pour lire la note. (Le nuage pâle
  autour est décoratif.)
- **Audio I/O** — 🎙 ou la barre d'espace pour dicter (Chrome ou Safari),
  niveau réel du micro, réponses lues à voix haute si tu l'actives.
- **Agenda · top 3** — la journée type et tes 3 priorités, lues dans le plan du jour.
- **Commands** — tape ou dicte ; Briefing / Plan / Chiffres / Bilan en un clic.
- **Vault** — recherche et lecture du coffre, liens cliquables.
- **Speak → Route → Execute → Remember** — chaque commande allume les
  quatre étapes ; tout échange finit dans le journal du jour.

### Une vraie journée, sans rien toucher

Tant que le HUD tourne, il lance seul chaque routine dans sa fenêtre :

| Heure | Routine |
|---|---|
| 07:00 | « Briefing. » Mails, agenda et actu IA — lus à voix haute si « Lire les routines » est actif |
| 09:00 | « Plan. » Tes 3 priorités rangées dans le coffre |
| 14:00 | « Chiffres. » Abonnés, vues, followers consignés |
| 19:00 | « Bilan. » Réflexion enregistrée, demain planifié |

Une routine ne tourne qu'une fois par jour et seulement dans sa fenêtre :
ouvrir le HUD à 10 h lance le plan, pas le briefing de 7 h déjà périmé.
`--no-auto` les coupe.

Pour qu'il démarre avec le Mac (non testé sur un Mac réel — il n'y en a
pas dans le conteneur où ce code a été écrit) :

```
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/os.jarvis.hud.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>os.jarvis.hud</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>$PWD/hud/server.py</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$(which claude)"):/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
PLIST
launchctl load ~/Library/LaunchAgents/os.jarvis.hud.plist
```

(À lancer depuis la racine du dépôt : `$PWD` y devient le bon chemin.)

### Réglages

| Variable / option | Défaut | Rôle |
|---|---|---|
| `--port` / `JARVIS_HUD_PORT` | `7777` | port local |
| `--vault` / `JARVIS_VAULT` | `vault/` | n'importe quel coffre Obsidian |
| `--engine` / `JARVIS_ENGINE` | `claude` | `ollama` pour du 100 % local |
| `JARVIS_ALLOWED_TOOLS` | `Read,Write,Edit,Glob,Grep,WebSearch,WebFetch` | outils accordés à Claude |
| `JARVIS_CLAUDE_BIN` | `claude` | chemin du binaire |

**Moteur Claude.** Le HUD lance `claude -p` dans ce dépôt, qui charge les
skills. Claude peut lire et écrire des fichiers, chercher sur le web —
**pas de terminal** (Bash n'est pas dans la liste). Ajoute un connecteur
mail à cette liste (`mcp__…`) si tu veux le briefing des mails.

**Moteur Ollama.** Tout reste sur la machine, mais un petit modèle ne lit
ni n'écrit de fichiers : le serveur lui donne le morceau utile du coffre
et enregistre sa réponse lui-même. Pas de mails, pas de web, et la
qualité d'un ~3B (cf. la décision backend dans `CLAUDE.md`).

### Sécurité

Le serveur n'écoute que `127.0.0.1`. Il refuse toute requête dont l'en-tête
`Host` n'est pas le sien (une page web malveillante qui viserait ton
localhost via un domaine piégé est rejetée), et chaque commande exige un
en-tête `X-Jarvis` qu'un formulaire d'un autre site ne peut pas poser. La
lecture de notes ne sort jamais du coffre.

## Vérifier

```
python3 -m unittest hud/test_server.py -v
node tests/hud-check.mjs        # vrai navigateur, faux moteur
```
