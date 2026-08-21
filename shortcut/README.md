# Mob en raccourci Siri — la version qui marche ce soir

Piste parallèle à l'app native (`mobile/`), pas un remplacement. Elle
existe parce qu'elle contourne tout ce qui bloque : **pas de Xcode, pas
de Mac, pas de signature, pas de compte développeur, pas de
réinstallation tous les 7 jours.** Cinq minutes sur le téléphone.

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
- URL : `https://api.mistral.ai/v1/chat/completions`
- Déplie **Afficher plus** :
  - **Méthode** : `POST`
  - **En-têtes** :
    - `Authorization` → `Bearer VOTRE_CLÉ` (colle ta clé après `Bearer `,
      en gardant l'espace)
    - `Content-Type` → `application/json`
  - **Corps de la requête** : `JSON`, puis construis :
    - `model` (Texte) → `mistral-small-latest`
    - `messages` (Tableau) → deux dictionnaires :
      - 1er : `role` → `system`, `content` → *voir le texte ci-dessous*
      - 2e : `role` → `user`, `content` → **Texte dicté** (la variable
        de l'étape 1, pas du texte tapé)

Texte du message `system` — il compte, parce que la réponse sera **lue
à voix haute** et qu'un pavé de 300 mots à l'oral est insupportable :

```
Tu es Mob, un assistant vocal. Réponds en français, brièvement :
une à trois phrases maximum. Pas de listes, pas de titres, pas de
mise en forme — ta réponse sera lue à voix haute.
```

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

## Étape 3 — essayer

Dis **« Dis Siri, Mob »**, puis pose ta question. Siri dicte, envoie,
et lit la réponse.

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

- **Rien n'est énoncé** → l'une des étapes 3-6 renvoie du vide.
  Ajoute une action **Affichage rapide** juste après l'étape 2 pour
  voir la réponse brute : elle contient presque toujours un champ
  `message` expliquant le refus (clé invalide, quota dépassé, JSON
  malformé).
- **« Unauthorized » / 401** → le mot `Bearer` manque, ou l'espace
  après lui, ou la clé a été tronquée à la copie.
- **Siri ouvre autre chose** → un autre raccourci ou contact s'appelle
  aussi Mob. Renomme-le, ou dis « Dis Siri, lance Mob ».
