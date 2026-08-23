# Mob

Un assistant personnel, décliné en quatre pistes selon ce qui est
réellement installable. Chacune a son dossier et son guide.

| Piste | Où | État | Ce qu'elle demande |
|---|---|---|---|
| **Web app** | `docs/` | ✅ prête | rien d'autre qu'un navigateur |
| Raccourci Siri | `shortcut/` | 📝 guide écrit | 5 min dans l'app Raccourcis |
| App iOS native | `mobile/` | ✅ compile (CI verte) | Xcode + Mac, et 99 $/an pour la voix |
| Cœur Python | racine | ✅ testé pour de vrai | Python 3.9+ et Ollama |

Le contexte complet du projet — décisions prises, limites rencontrées,
conventions — est dans [`CLAUDE.md`](CLAUDE.md).

---

## Web app (`docs/`) — la voie la plus courte

Une page unique, sans dépendance, qui parle à l'API Mistral depuis le
navigateur. Elle apporte ce que les autres pistes n'obtenaient qu'au
prix de gros détours :

- **Aucune installation** : pas d'Xcode, pas de signature, pas de compte
  développeur, pas de réinstallation tous les 7 jours.
- **Sur l'écran d'accueil** : « Partager → Sur l'écran d'accueil » lui
  donne son icône et la lance en plein écran, sans barre Safari. Elle se
  comporte alors comme une app.
- **Mémoire persistante** : la conversation est conservée dans le
  navigateur et survit à la fermeture. L'historique complet reste sur
  l'appareil ; seuls les 24 derniers messages partent au modèle à chaque
  tour, parce que la fenêtre de contexte d'un modèle et la place sur le
  disque sont deux limites différentes.
- **Voix dans les deux sens** : dictée (là où le navigateur la propose)
  et lecture à voix haute des réponses, activable par le bouton 🔊.
- **Marche aussi sur le Mac**, même adresse.
- **Deux fournisseurs au choix** dans ⚙, chacun avec sa propre clé :
  **Mistral** (palier gratuit) ou **Claude** (facturé à l'usage, aucun
  palier gratuit). On bascule de l'un à l'autre selon la question.

### Recherche web (Claude uniquement)

Avec Claude, Mob peut **aller chercher l'information à jour** au lieu de
répondre depuis la mémoire figée du modèle. Activable dans ⚙, allumé par
défaut.

Ça marche dans un navigateur parce que la recherche s'exécute **sur les
serveurs d'Anthropic**, pas dans la page — c'est ce qui la distingue des
capacités qu'une page web ne peut pas avoir (lire des fichiers, lancer
des commandes). Quand la recherche prend du temps, l'API rend la main
avec `stop_reason: "pause_turn"` au lieu d'une réponse finie ; Mob
relance alors le tour jusqu'à cinq fois, sinon la réponse arriverait
vide.

Le type d'outil dépend du modèle : la variante récente
(`web_search_20260209`) n'existe que sur Opus et Sonnet, donc Haiku 4.5
bascule automatiquement sur la variante de base — la demander sur Haiku
ferait échouer la requête.

### Choisir son fournisseur

| | Mistral | Claude |
|---|---|---|
| Coût | gratuit | ~0,5 à 2,6 ¢ la question |
| Capacité | correcte | nettement supérieure |
| Compte requis | console.mistral.ai | console.anthropic.com |

Ordres de grandeur pour Claude, sur une question courte avec le contexte
des 24 derniers messages : **Opus 5** ~2,6 ¢, **Sonnet 5** ~1,6 ¢,
**Haiku 4.5** ~0,5 ¢. Une réponse longue coûte davantage. À dix
questions par jour, Opus 5 revient à environ 8 $/mois — souvent moins
qu'un abonnement, puisqu'on ne paie que les jours où l'on s'en sert.

Note technique : l'API d'Anthropic refuse les appels navigateur sans
l'en-tête `anthropic-dangerous-direct-browser-access`. Mob l'envoie.
La clé reste dans le `localStorage` de l'appareil, comme celle de
Mistral — même niveau d'exposition, à savoir aucun côté dépôt.

### Activer l'hébergement (une seule fois)

Le dépôt est public, donc GitHub Pages est gratuit.

1. Sur GitHub : **Settings** → **Pages**
2. *Source* : **Deploy from a branch**
3. *Branch* : la branche qui contient ce dossier → dossier **`/docs`**
4. **Save**, puis attends une minute

L'adresse sera **https://guiidlf-sys.github.io/Mob/**

### Première utilisation

Ouvre l'adresse, touche ⚙, colle une clé d'API, **Enregistrer**.

Pour obtenir la clé sur [console.mistral.ai](https://console.mistral.ai)
— deux étapes non évidentes que le site ne met pas en avant :

1. Connexion (email, Google ou Apple)
2. **Vérification par numéro de téléphone** — obligatoire pour activer
   l'accès API, même gratuit
3. **Section Billing → sélectionner explicitement le plan gratuit
   « Experiment »**. Aucune carte bancaire n'est demandée, mais sans ce
   choix explicite **la clé est créée et ne fonctionne pas** : c'est la
   cause la plus fréquente d'un « Clé d'API refusée » alors que la clé
   semble correcte.
4. **API Keys → Create new key**, puis copier tout de suite — la valeur
   n'est affichée qu'une seule fois.

### Où va la clé

Elle est enregistrée **dans le stockage local de ton navigateur**, sur
cet appareil uniquement. Elle n'est jamais écrite dans le code de la
page, jamais poussée sur GitHub, et n'est envoyée qu'à Mistral. La page
elle-même est publique et ne contient aucun secret — quelqu'un qui
l'ouvre devra fournir sa propre clé.

### Limites

- Il faut une connexion internet : rien ne tourne en local.
- Tes questions transitent par Mistral. Pour un usage strictement privé
  et hors-ligne, c'est l'app native (`mobile/`) qu'il faut, avec ses
  propres contraintes.
- La dictée du navigateur n'est pas exposée par toutes les versions de
  Safari. Quand elle manque, le bouton 🎙 disparaît et la saisie au
  clavier prend le relais — l'app reste utilisable.

---

## Les autres pistes

- **`shortcut/README.md`** — le raccourci Siri. Seul moyen gratuit
  d'obtenir « Dis Siri, Mob » par la voix.
- **`mobile/README.md`** — l'app SwiftUI, modèle tournant sur le
  téléphone (donc hors-ligne et privé). Compile en CI ; l'installation
  demande un Mac, et le déclenchement vocal un compte payant.
- **`jarvis.py` / `memory.py`** — le cœur Python d'origine, client
  Ollama avec mémoire persistante et outil calculatrice en safe-eval.
  Validé contre un vrai serveur Ollama.

## Tests

```
python3 -m unittest test_jarvis.py test_memory.py -v
```
