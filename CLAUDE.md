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

Même chose côté mobile : le code Swift dans `mobile/Mob/` n'a **jamais été
compilé** (cet environnement de travail est un conteneur Linux sans Xcode).
Avant d'avancer sur ce chantier, ouvre-le dans Xcode (ou via Swift
Playgrounds/iPad, ou un service de build cloud — voir `mobile/README.md`),
corrige les erreurs de compilation, et vérifie en particulier l'API réelle
du package `LLM.swift` une fois résolu par Swift Package Manager (voir
`mobile/README.md`, section « Mise en place »).

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
  `LLM.swift` utilisée dans `LLMEngine.swift` a été vérifiée via le
  README du projet, pas testée en conditions réelles — reconfirme-la
  une fois le package résolu par Xcode.

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
