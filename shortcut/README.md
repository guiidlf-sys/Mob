# Mob en raccourci Siri — la version qui marche ce soir

Piste parallèle à l'app native (`mobile/`), pas un remplacement. Elle
existe parce qu'elle contourne tout ce qui bloque : **pas de Xcode, pas
de Mac, pas de signature, pas de compte développeur, pas de
réinstallation tous les 7 jours.** Cinq minutes sur le téléphone.

**Tout se fait depuis l'iPhone, du début à la fin** : créer le compte
Mistral (Safari), créer le raccourci (app Raccourcis), le tester, et le
déclencher. Aucun ordinateur n'est nécessaire à aucune étape. C'est le
seul chemin vers un Mob fonctionnel qui ait cette propriété — l'app
native, elle, ne peut pas être compilée depuis un iPhone (voir plus
bas).

La contrepartie est réelle et il faut l'avoir en tête : un raccourci ne
peut pas faire tourner un modèle en local. Il appelle forcément un
service en ligne. Donc Mob en raccourci a besoin d'internet, et le
service voit ce que tu lui dis — contrairement à l'app native, qui
garde tout sur le téléphone.

## Pourquoi « Dis Siri, Mob » marche mieux ici que dans l'app

Siri lance un raccourci **en disant simplement son nom**. Nomme le
raccourci `Mob` et « Dis Siri, Mob » le déclenche — sans la contrainte
des App Intents, qui obligent à glisser le nom de l'app dans une phrase
plus longue. Sur ce point précis, le raccourci est plus proche de ce que
tu voulais que l'app.

## Étape 1 — la clé d'API (gratuite, sans carte bancaire)

1. Va sur [console.mistral.ai](https://console.mistral.ai), crée un
   compte, et prends le plan gratuit (« Experiment »).
2. Crée une clé d'API et copie-la.

**Cette clé est un mot de passe.** Elle sera écrite en clair dans le
raccourci. Ne partage jamais ce raccourci avec quelqu'un (le lien
iCloud embarquerait la clé). Si tu la perds ou la partages par erreur,
révoque-la dans la console et fais-en une nouvelle.

## Étape 2 — construire le raccourci

App **Raccourcis** → **+** → nomme-le exactement **`Mob`**.

Ajoute ces actions dans l'ordre :

**1. Dicter le texte**
- Langue : Français
- « Arrêter d'écouter » : *Après une pause*

**2. Obtenir le contenu de l'URL**

⚠️ **Deux pièges dès l'ajout de cette action** — les deux ont été
rencontrés pour de vrai :

1. **Raccourcis glisse tout seul la variable « Texte dicté » dans le
   champ URL.** L'app enchaîne systématiquement la sortie de l'action
   précédente dans l'entrée de la suivante. Il faut **la supprimer** :
   place le curseur juste après la pastille bleue, puis ⌫. Cette
   variable servira plus bas, dans le champ `content` — pas ici.
2. **La ligne « Corps de la requête » n'existe pas tant que la méthode
   est `GET`.** Elle n'apparaît qu'une fois passé en `POST`. Si tu ne
   la trouves pas, c'est presque toujours ça.

- URL : `https://api.mistral.ai/v1/chat/completions`
- Déplie **Afficher plus** :
  - **Méthode** : `POST`
  - **En-têtes** :
    - `Authorization` → `Bearer VOTRE_CLÉ` (colle ta clé après `Bearer `,
      en gardant l'espace)
    - `Content-Type` → `application/json`
  - **Corps de la requête** : `JSON`, puis construis :
    - champ **Texte** nommé `model` → `mistral-small-latest`
    - champ **Tableau** nommé `messages` → un seul **Dictionnaire**
      dedans, contenant deux champs Texte :
      - `role` → `user`
      - `content` → la consigne ci-dessous **suivie de la variable
        Texte dicté**

Texte à mettre dans `content`, avant la variable :

```
Réponds en français, en une à trois phrases maximum, sans listes ni
mise en forme — ta réponse sera lue à voix haute. Question :
```

On glisse la consigne dans le message de l'utilisateur au lieu
d'ajouter un second dictionnaire `role: system`. Le résultat est
quasiment le même, et ça évite de construire deux dictionnaires
imbriqués au doigt sur un écran de téléphone. La consigne compte : la
réponse est **lue à voix haute**, et un pavé de 300 mots à l'oral est
insupportable.

**3. Obtenir la valeur du dictionnaire**
- Clé : `choices`

**4. Obtenir l'élément de la liste**
- *Premier élément*

**5. Obtenir la valeur du dictionnaire**
- Clé : `message`

**6. Obtenir la valeur du dictionnaire**
- Clé : `content`

**7. Énoncer le texte**
- Entrée : le résultat de l'étape 6

On découpe la lecture de la réponse en étapes 3→6 au lieu d'un chemin
`choices.0.message.content` d'un seul coup : Shortcuts gère mal les
index de tableau dans un chemin de clés, et l'échec est silencieux
(tu obtiens du vide sans message d'erreur).

## Étape 3 — tester par paliers (ne monte pas les 7 actions d'un coup)

Sept actions montées d'un bloc qui ne produisent rien, ça ne dit pas
**où** c'est cassé. Ajoute-les par paliers, en vérifiant à chaque fois.
Chaque palier isole une catégorie de panne différente.

Tout se fait depuis l'iPhone — aucun ordinateur n'intervient à aucun
palier.

**Palier A — la clé et l'appel API, 2 actions seulement.** Construis
d'abord *uniquement* l'action **Obtenir le contenu de l'URL**
(configurée comme à l'étape 2, mais avec une question tapée en dur dans
`content` au lieu de la variable dictée), suivie de **Affichage
rapide**. Lance avec ▶️.

- Un JSON contenant une phrase → réseau, clé et corps de requête sont
  bons. C'est l'essentiel de validé.
- `{"detail":"Invalid API Key"}` → la clé est fausse, tronquée, ou il
  manque `Bearer ` devant.

L'adresse et le format JSON ont été vérifiés en conditions réelles
(l'API répond bien `401` sur une clé bidon, donc la requête est
correcte jusqu'à l'authentification).

**Palier B — le décodage.** Ajoute les quatre actions d'extraction,
garde *Affichage rapide* en dernier. Tu dois maintenant voir **juste la
phrase**, sans le JSON autour. Du vide ici = c'est l'une de ces quatre
actions qui décroche, pas l'API.

**Palier C — la voix.** Remplace le texte tapé en dur par *Dicter le
texte* en tête, et *Affichage rapide* par *Énoncer le texte* en fin.

**Palier D — Siri.** Dis **« Dis Siri, Mob »**, puis pose ta question.

*(Accessoirement, si tu as un Mac sous la main, `curl -X POST
https://api.mistral.ai/v1/chat/completions -H "Content-Type:
application/json" -H "Authorization: Bearer TA_CLÉ" -d
'{"model":"mistral-small-latest","messages":[{"role":"user","content":"Dis
bonjour"}]}'` teste la clé en dix secondes. Ce n'est qu'un confort : le
palier A fait exactement la même vérification depuis le téléphone.)*

Tu peux aussi le lancer sans la voix :
- **Toucher au dos** : Réglages → Accessibilité → Tactile → Toucher au
  dos → Double toucher → Mob
- **Bouton Action** (présent sur l'iPhone 17 Pro) : Réglages → Bouton
  Action → Raccourci → Mob

## Ce que cette version ne fait pas encore

- **Pas de mémoire.** Chaque appel repart de zéro : Mob ne se souvient
  pas de la phrase précédente. Ça s'ajoute plus tard (stocker
  l'historique dans un fichier, le relire et le réinjecter dans le
  tableau `messages`), mais ça alourdit nettement le raccourci.
- **Pas d'outil calculatrice.** L'app native intercepte `CALC(...)` et
  l'évalue en safe-eval ; ici c'est le modèle qui calcule, avec les
  approximations que ça implique.
- **Pas hors-ligne, pas privé.** Chaque question part chez Mistral.
  C'est le prix du « ça marche ce soir ».

## Si ça ne marche pas

- **Rien n'est énoncé** → reviens au palier C ci-dessus : l'une des
  actions 3-6 renvoie du vide. Une action **Affichage rapide** placée
  juste après l'appel API montre la réponse brute.
- **`{"detail": "Invalid API Key"}`** (c'est bien `detail`, pas
  `message` ni `error`) → le mot `Bearer` manque, ou l'espace après
  lui, ou la clé a été tronquée à la copie.
- **Erreur de quota** → le palier gratuit a des limites de débit.
  Attends une minute et réessaie.
- **Siri ouvre autre chose** → un autre raccourci ou contact s'appelle
  aussi Mob. Renomme-le, ou dis « Dis Siri, lance Mob ».
