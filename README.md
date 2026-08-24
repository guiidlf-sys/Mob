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
- **Une discussion neuve à chaque visite** : ouvrir Mob donne une page
  blanche, jamais la conversation d'hier à moitié relue. Les précédentes
  sont rangées dans l'onglet **Historique**, où on les rouvre, les
  poursuit ou les supprime une par une. Une discussion restée vide n'y
  entre pas.
- **Mémoire persistante** : tout est conservé dans le navigateur et
  survit à la fermeture. L'historique complet reste sur l'appareil ;
  seuls les 24 derniers messages de la discussion en cours partent au
  modèle à chaque tour, parce que la fenêtre de contexte d'un modèle et
  la place sur le disque sont deux limites différentes.
- **Voix dans les deux sens** : dictée (là où le navigateur la propose)
  et lecture à voix haute des réponses, activable par le bouton 🔊.
- **Marche aussi sur le Mac** — la navigation devient une barre latérale
  sur grand écran, et reste en bas sur téléphone.
- **Galerie des créations** : toutes les images et pages produites au fil
  des conversations, regroupées dans un onglet.
- **Génère des images** — demande-en une, Mob l'affiche. Sans clé ni
  compte : le service ([Pollinations](https://pollinations.ai)) sert
  l'image par simple URL, donc une balise `<img>` suffit. Contrepartie :
  environ une image toutes les 15 secondes, et le service peut être
  saturé — l'échec est alors affiché, pas silencieux.
- **Génère des sites web** — demande une page, Mob écrit un document HTML
  complet et autonome, puis propose **Aperçu**, **Enregistrer** et
  **Copier le code**. Le code est retiré de la bulle pour rester lisible
  sur téléphone ; il reste entier derrière les boutons.

### Déclenchement vocal : « Dis Siri, Mob »

Un raccourci iOS de **trois actions** dicte ta question et ouvre Mob
avec elle déjà posée, via `?q=`. Aucune clé d'API dedans, aucun compte
développeur, aucune péremption à 7 jours — voir
[`shortcut/README.md`](shortcut/README.md).

C'est le seul chemin vocal gratuit, et iOS 27 ne l'a pas changé : SiriKit
y est retiré au profit des App Intents, mais ceux-ci exigent toujours
l'autorisation Siri, réservée au compte Apple Developer payant.

### Le tableau de bord

L'écran d'accueil est un tableau de bord, repris du modèle que tu as
envoyé : salutation et bloc profil en haut, barre **« Demande à Mob »**
qui pose une question directement depuis l'en-tête, cloche de
notifications, onglets **Aperçu / Activité / Outils**, et en dessous une
grande carte chiffrée, une carte en dégradé, une courbe d'activité avec
ses pilules **1J / 1S / 1M / 6M / 1A**, la liste **Ton activité** avec
ses variations, et les quatre tuiles **Ton espace**.

Tout y est calculé sur tes vraies données — chaque message est horodaté,
et le chiffre, la courbe et les pourcentages en découlent. Les messages
antérieurs à cette version n'ont pas de date : ils comptent dans le
total, jamais dans une période, plutôt que d'être datés d'aujourd'hui et
de gonfler les chiffres.

Sur grand écran, la navigation devient une barre latérale avec
**Réglages** et **Aide** épinglés en bas ; sur téléphone elle reste en
bas de l'écran.

### Deux espaces : utilisateur et administrateur

L'interface est séparée en deux. Un visiteur ordinaire voit **Accueil**,
**Chat**, **Historique**, **Créations**, **Réglages** et **Aide**. Le propriétaire ouvre
en plus un onglet **Admin** avec ce qui engage le coût ou le
comportement : choix du modèle, profondeur de mémoire, texte de
personnalité, statistiques, effacement total.

⚠️ **Cette séparation range l'interface, elle ne la protège pas.** Mob est
une page web : son code est lisible par quiconque, donc rien de ce qui
est masqué ici n'est réellement inaccessible. Le code d'accès évite
qu'un utilisateur de passage dérègle le modèle, rien de plus. Une vraie
séparation de droits demanderait un serveur.

Code par défaut : `mob` — modifiable via la clé `mob.adminCode` du
stockage local.

### Réglages

Une vraie fenêtre de réglages, en cinq sections :

| Section | Contenu |
|---|---|
| **Compte** | État connecté, repère de la clé (`···1234`), nom affiché, *Modifier*, *Se déconnecter* |
| **Apparence** | Thème **Auto / Sombre / Clair**, taille du texte sur quatre crans |
| **Voix** | Lecture à voix haute, vitesse de lecture |
| **Conversation** | Modèle, mémoire relue à chaque question (4 à 60 messages) |
| **Données** | Effacer la discussion en cours |

**La clé n'est demandée qu'une fois.** Une fois enregistrée, le champ
disparaît et l'état passe à « Connecté » ; enregistrer un autre réglage
ne l'efface pas, et un rechargement la retrouve. Seul *Se déconnecter*
la supprime.

⚠️ Sur iOS, **l'app ajoutée à l'écran d'accueil a un stockage distinct
de Safari**. Si la clé semble redemandée, c'est presque toujours ça :
il faut la saisir une fois dans chacun des deux. Ce n'est pas un oubli
de l'app, ce sont deux emplacements séparés par le système.

### Vérification automatique

`tests/ui-check.mjs` pilote un navigateur et **clique chaque bouton**,
en vérifiant l'effet obtenu — le thème change-t-il vraiment, la clé
survit-elle à un rechargement — plutôt que la présence des éléments
dans le HTML. 68 contrôles.

`.github/workflows/health-check.yml` la rejoue **toutes les 3 heures**
sur le site en ligne, à chaque poussée sur `main`, et sur chaque pull
request. Un échec fait rougir l'onglet Actions.

```
cd docs && python3 -m http.server 8899 &
node tests/ui-check.mjs http://localhost:8899/
```

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
