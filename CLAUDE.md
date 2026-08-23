# Jarvis — contexte persistant

## ✅ Validation réelle d'Ollama — faite

`jarvis.py` a été testé contre un **vrai serveur Ollama** (installé et lancé
dans une session Claude Code, modèle `llama3.2:1b`, CPU pur) :
`call_ollama()` tape bien `POST /api/chat` et la réponse réelle a exactement
la forme attendue (`{"message": {"role", "content"}, ...}`) — aucun écart de
schéma, aucune correction nécessaire. Testé bout en bout : conversation
normale, dégradation propre sur URL injoignable (`[Jarvis is offline: ...]`,
pas de crash), et le marqueur `CALC(12*7)` correctement détecté et évalué à
84 par `safe_eval()`. Les 19 tests mockés passent toujours. Cette validation
a eu lieu dans un conteneur cloud éphémère (pas la machine de l'utilisateur),
mais Ollama et le code testé sont réels — si tu relances cette validation sur
la machine réelle de l'utilisateur, considère-la comme une reconfirmation,
pas comme un prérequis bloquant avant l'étape 4.

## ✅ L'app iOS compile — vérifié en CI

`.github/workflows/ios-build.yml` compile l'app sur un runner macOS de
GitHub (XcodeGen + `xcodebuild`, destination simulateur,
`CODE_SIGNING_ALLOWED=NO`) : **build vert**. C'est le moyen de valider le
code Swift sans Mac — utilise-le à chaque changement dans `mobile/` plutôt
que de deviner. Deux choses apprises en le mettant en place :

- `-skipMacroValidation` est **obligatoire** : `LLM.swift` embarque des
  macros Swift, et sans ce drapeau le build meurt sur « Macro
  LLMMacrosImplementation ... must be enabled ». En interface graphique
  Xcode montre une boîte « Trust & Enable » à la place.
- Le pin `from: "3.0.3"` résout bien (LLM.swift 3.0.3 + swift-syntax
  602.0.0).

**⚠️ Limite de compte, découverte après coup et déterminante pour cette
piste** : un compte Apple **gratuit** (« Personal Team ») n'a droit ni à
la capacité **iCloud** ni à la capacité **Siri**. Sans l'autorisation
`com.apple.developer.siri`, l'App Intent apparaît dans l'app Raccourcis
mais **Siri refuse de le déclencher à la voix, silencieusement**. Donc
avec un compte gratuit : pas de « Dis Siri, Mob », pas de mémoire
iCloud (repli automatique sur l'appareil), et réinstallation tous les
7 jours. Le déclenchement vocal natif coûte 99 $/an. Il faut alors
retirer le bloc `entitlements:` de `project.yml`, sinon la signature
échoue — voir `mobile/README.md`. C'est la raison principale pour
laquelle la piste raccourci (`shortcut/README.md`) n'est pas un
pis-aller : elle obtient le déclenchement vocal gratuitement.

Les comptes Apple du Mac et de l'iPhone peuvent être **différents**,
ça ne bloque ni la compilation ni l'installation.

Ce qui reste hors de portée d'une session : **signer et installer sur
l'iPhone**. Ça exige un certificat lié à l'identifiant Apple de
l'utilisateur — ni un conteneur cloud ni la CI ne peuvent le faire, et
accepter les contrats Apple à sa place n'est pas acceptable. Restent à
lui : connecter son identifiant Apple dans Xcode → Settings → Accounts,
choisir l'équipe dans Signing & Capabilities, et accepter « Faire
confiance à ce développeur » sur l'iPhone.

L'API de `LLM.swift` a été vérifiée contre le **code source réel** du
package (pas seulement son README) : `Role` est un enum au niveau du
module (pas `LLM.Role`), `history: [Chat]` avec
`Chat = (role: Role, content: String)`, init failable
`init?(from:template:...historyLimit:)` — dont le `historyLimit: Int = 8`
par défaut, qu'il faut passer explicitement sinon il écrase la fenêtre de
contexte du appelant. Épinglé sur la ligne 3.x (dernier tag v3.0.3).

`mobile/project.yml` (XcodeGen) génère le projet Xcode complet en une
commande — c'est la voie recommandée pour le premier build, elle évite
les réglages manuels de capacités/Info.plist. Voir `mobile/README.md`.

**Si tu tournes sur le Mac de l'utilisateur** (et pas dans un conteneur
cloud), tu as `xcodebuild` : compile, lis les erreurs, corrige, itère —
sans lui faire l'aller-retour à la main. Commence toujours par le build
simulateur avec `CODE_SIGNING_ALLOWED=NO` (commandes exactes dans
`mobile/README.md`, section « Faire compiler par Claude Code ») : il
isole les vraies erreurs de code des problèmes de signature. Deux
étapes restent hors de ta portée et lui reviennent : connecter son
identifiant Apple dans Xcode → Settings → Accounts, et accepter
« Faire confiance à ce développeur » sur l'iPhone.

## État d'avancement

- **Étape 1 — faite** : client Ollama minimal (`call_ollama` dans
  `jarvis.py`), en stdlib pur (`urllib.request`), avec dégradation propre
  si le serveur est injoignable (`OllamaUnavailableError` → message
  `[Jarvis is offline: ...]` plutôt qu'un crash).
- **Étape 2 — faite** : mémoire de conversation persistante (`memory.py`,
  classe `Memory`) — fichier JSON, troncature à `max_history` messages,
  dégradation silencieuse vers une mémoire vide si le fichier est absent
  ou corrompu.
- **Étape 3 — faite** : outil calculatrice déclenché par le marqueur
  `CALC(<expression>)` dans la réponse du modèle, évalué par `safe_eval()`
  (parcours d'AST restreint aux opérateurs arithmétiques — jamais
  `eval()` brut).
- **Étape 4 — faite** : validation contre un vrai serveur Ollama (voir
  section ci-dessus) — aucun écart de schéma, aucune correction nécessaire.
- **Étape 5 — à faire** : orchestration multi-outils (au-delà de la seule
  calculatrice — ex. lecture de fichier, recherche web).
- **Piste mobile (iPhone) — scaffold écrit, non compilé** : app SwiftUI
  dans `mobile/Mob/` qui porte les mêmes conventions (safe-eval,
  dégradation propre) sur iOS, et déclenchement vocal via App
  Intents/Siri (« Dis Siri, Mob »). **Backend IA : on-device, sur
  l'iPhone lui-même** (`LLMEngine.swift` + `LLM.swift`, modèle `.gguf`
  ~3B embarqué) — voir « Décision backend » ci-dessous pour l'historique
  de ce choix. Mémoire (`Memory.swift`) : iCloud Drive en priorité
  (extensible avec le forfait iCloud), stockage local de l'appareil en
  secours automatique, historique jamais tronqué sur disque (seule la
  fenêtre envoyée au modèle est bornée). Détails, limites et étapes de
  build manuelles dans `mobile/README.md` — à valider sur un Mac (ou
  iPad/service de build cloud, voir README) avant de continuer.
- **Piste web app — `docs/index.html`, EN LIGNE ET VÉRIFIÉE** :
  déployée sur **https://guiidlf-sys.github.io/Mob/** (GitHub Pages,
  branche `main`, dossier `/docs`) — page et icône répondent bien `200`.
  C'est la piste aboutie ; les autres restent des chantiers.
  page unique autonome (aucune dépendance, aucun build) qui appelle
  l'API Mistral **directement depuis le navigateur** — vérifié que
  `api.mistral.ai` renvoie bien `access-control-allow-origin: *`, donc
  pas de proxy nécessaire. Servie par GitHub Pages depuis `docs/` (le
  dépôt est public, donc gratuit) : https://guiidlf-sys.github.io/Mob/
  Elle réunit ce que les autres pistes n'obtenaient qu'au prix de gros
  détours : installable sur l'écran d'accueil sans Xcode ni signature ni
  péremption à 7 jours, mémoire persistante en `localStorage`
  (historique complet gardé, fenêtre de contexte bornée à 24 messages —
  deux limites distinctes), dictée et lecture vocale, et ça marche
  aussi sur le Mac. La clé d'API vit dans le `localStorage` du
  navigateur : **jamais dans le fichier, jamais dans le dépôt** (le
  dépôt est public — ne jamais y coder une clé en dur).
  ⚠️ Une page publiée en Artifact claude.ai ne pourrait **pas** faire
  ça : sa politique de sécurité bloque les appels vers des hôtes
  externes, et le compte de l'utilisateur n'expose aucune capacité
  permettant à une page d'interroger Claude (roster : `artifact`,
  `downloads`, `mcp`, `self`).
- **Piste raccourci Siri — `shortcut/README.md`, choisie en parallèle de
  l'app** : un raccourci iOS nommé `Mob` (dictée → API Mistral, palier
  gratuit → énoncé vocal). Elle existe parce qu'elle contourne tout le
  parcours Xcode/signature/réinstallation-7-jours, et parce que Siri
  lance un raccourci **par son nom seul** — donc « Dis Siri, Mob » y est
  plus propre que via les App Intents. Contrepartie assumée : pas de
  modèle local, donc pas hors-ligne et pas privé ; ni mémoire ni
  safe-eval dans la v1. Ce n'est **pas** un abandon de l'app native :
  l'utilisateur a explicitement choisi de mener les deux.
- **Décision backend — tranchée avec l'utilisateur, ne pas rouvrir sans
  lui en reparler** : Mob ne peut pas avoir les capacités du Claude le
  plus cher tout en étant gratuit et on-device — contrainte
  matérielle/économique réelle, pas un manque d'ingénierie (aucun
  modèle de ce calibre ne tient sur un téléphone ou un Mac perso).
  Trajet suivi : petit modèle on-device → l'utilisateur a demandé un
  gros modèle auto-hébergé sur son Mac → son MacBook Air (8 Go de
  mémoire unifiée) ne tient qu'un ~3B, pas mieux que l'iPhone 17 Pro en
  direct → l'utilisateur a choisi de revenir sur l'iPhone en on-device.
  Résultat final : modèle ~3B on-device sur l'iPhone, plafonné par le
  matériel, gratuit et privé. Si le besoin de capacité "niveau Claude"
  revient, l'option qui reste sur la table est une API cloud payante
  pour les tâches ponctuelles qui le demandent — ne pas la construire
  sans que l'utilisateur le redemande explicitement.

## Conventions établies

- **safe-eval, jamais `eval()` brut.** Toute évaluation d'expression
  utilisateur passe par un parseur d'AST à liste blanche d'opérateurs
  (voir `safe_eval` dans `jarvis.py`). N'ajoute jamais un `eval()` ou
  `exec()` direct sur une entrée utilisateur ou une sortie de modèle.
- **Dégradation propre, jamais de crash.** Une panne réseau, un fichier de
  mémoire absent/corrompu, ou une réponse Ollama de forme inattendue
  doivent produire un message clair ou un état vide — jamais une
  exception non gérée qui tue la boucle REPL.
- **Vérifie les signatures des libs avant usage.** Ce projet utilise
  volontairement `urllib.request` (stdlib) plutôt que le paquet `ollama`
  pour éviter un décalage de version. Si tu ajoutes une dépendance tierce
  (le paquet `ollama`, `requests`, etc.), vérifie sa signature réelle
  installée avant de coder contre elle — ne suppose jamais une API à
  partir de la documentation seule. Même règle côté Swift : l'API de
  `LLM.swift` utilisée dans `LLMEngine.swift` a été relue dans le code
  source réel du package, ce qui a rattrapé une erreur de compilation
  (`LLM.Role` au lieu de `Role`) et un défaut silencieux
  (`historyLimit` par défaut à 8) que son README seul ne montrait pas —
  illustration directe de pourquoi cette convention existe.

## Setup

Aucune dépendance tierce : `jarvis.py` et `memory.py` n'utilisent que la
stdlib. Il faut seulement Python 3.9+ et, pour un usage réel, Ollama
installé et lancé (`ollama serve`).

Variables d'environnement optionnelles :
- `OLLAMA_URL` (défaut `http://localhost:11434/api/chat`)
- `JARVIS_MODEL` (défaut `llama3`)
- `JARVIS_MEMORY_PATH` (défaut `memory.json` à côté de `jarvis.py`)

## Lancer

```
python3 jarvis.py
```

## Tests

```
python3 -m unittest test_jarvis.py test_memory.py -v
```

Ces tests mockent tous les appels réseau — ils ne remplacent pas la
validation en conditions réelles décrite en tête de ce fichier.
