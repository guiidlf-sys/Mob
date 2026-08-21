# Jarvis — contexte persistant

## ⚠️ Important — première tâche avant toute chose

Tout ce qui existe dans ce dépôt (`jarvis.py`, `memory.py`, les tests) a été
écrit et testé **par simulation uniquement** : les appels réseau vers Ollama
sont mockés dans `test_jarvis.py` (`unittest.mock.patch` sur
`urllib.request.urlopen`). Ce code n'a **jamais tourné contre un vrai serveur
Ollama** — l'environnement qui l'a écrit n'y avait pas accès.

Toi, Claude Code, tu tournes sur la machine de l'utilisateur et tu peux
réellement lancer `ollama serve`. **Ta première tâche, avant de construire
l'étape 4, est de valider `jarvis.py`, `test_jarvis.py` et `test_memory.py`
en conditions réelles** :

1. Vérifie qu'Ollama est installé (`ollama --version`), sinon guide
   l'utilisateur pour l'installer.
2. `ollama serve` (si pas déjà lancé) puis `ollama pull llama3` (ou un autre
   modèle léger disponible).
3. Lance `python3 jarvis.py` et discute avec pour de vrai, y compris une
   requête de calcul (ex. « combien font 12 * 7 ? ») pour vérifier que le
   marqueur `CALC(...)` et l'outil safe-eval fonctionnent avec les réponses
   réelles du modèle.
4. Compare la forme réelle de la réponse Ollama
   (`POST /api/chat` → `{"message": {"role", "content"}, ...}`) à ce que
   `call_ollama()` attend dans `jarvis.py`. Corrige `call_ollama` si le
   schéma réel diffère (champs manquants, `stream` géré différemment,
   modèle absent localement, etc.).
5. Ne construis l'étape 4 (voir plus bas) qu'une fois cette validation faite
   et les éventuels écarts corrigés.

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
- **Étape 4 — à faire** : validation contre un vrai serveur Ollama (voir
  section ci-dessus) et correction des écarts de schéma trouvés.
- **Étape 5 — à faire** : orchestration multi-outils (au-delà de la seule
  calculatrice — ex. lecture de fichier, recherche web), à ne démarrer
  qu'une fois l'étape 4 validée.

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
  partir de la documentation seule.

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
