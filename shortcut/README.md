# « Dis Siri, Mob » — le déclenchement vocal

Le raccourci sert de **porte d'entrée vocale** à la web app : il dicte ta
question et ouvre Mob avec elle déjà posée. Trois actions, aucune clé
d'API à l'intérieur, et Siri lance un raccourci **par son nom seul** —
donc « Dis Siri, Mob » fonctionne sans compte développeur, sans Xcode et
sans péremption à 7 jours.

C'est le seul chemin vocal gratuit sur iOS, et iOS 27 ne l'a pas changé :
SiriKit y est retiré au profit des App Intents, mais ceux-ci exigent
toujours l'autorisation `com.apple.developer.siri`, réservée au compte
Apple Developer à 99 $/an. Le raccourci contourne tout ça.

## Prérequis

La web app doit déjà fonctionner : ouvre
**https://guiidlf-sys.github.io/Mob/**, mets ta clé dans ⚙, et vérifie
qu'une question obtient bien une réponse. Le raccourci ne fait que lui
envoyer du texte — si elle ne marche pas, lui non plus.

## Construire le raccourci

App **Raccourcis** → **+** → renomme-le exactement **`Mob`** (c'est ce
mot que Siri écoute : pas d'espace, pas de faute).

**1. Dicter le texte**
- Langue : Français
- *Arrêter d'écouter* : **Après une pause**

**2. Coder le texte en URL**
- Cherche `URL` et prends **Coder le texte en URL** (parfois « URL
  Encode »). Elle doit recevoir le **Texte dicté**.
- Sans elle, une question contenant `?`, `&` ou `#` casserait l'adresse.
  Les accents et les espaces passent sans elle, mais autant être tranquille.

**3. Ouvrir les URL**
- Contenu : colle cette adresse, puis insère la variable de l'étape 2
  **juste derrière**, sans espace :

```
https://guiidlf-sys.github.io/Mob/?q=
```

Le résultat doit se lire : `…/Mob/?q=` suivi de la pastille bleue.

## Utiliser

Dis **« Dis Siri, Mob »** → parle → Mob s'ouvre et répond, à l'écrit et
à voix haute si tu as activé 🔊.

Ça marche aussi sans la voix :
- **Toucher au dos** : Réglages → Accessibilité → Tactile → Toucher au
  dos → Double toucher → Mob
- **Bouton Action** (iPhone 17 Pro) : Réglages → Bouton Action →
  Raccourci → Mob

**Astuce :** ajoute d'abord Mob à ton écran d'accueil (Safari →
Partager → Sur l'écran d'accueil). Le raccourci ouvrira alors l'app
installée, en plein écran, au lieu d'un onglet Safari.

## Limites

- **Le téléphone doit être déverrouillé.** Ouvrir une app au premier plan
  l'exige, quel que soit le déclencheur. Avec Face ID qui te reconnaît
  quand tu sors le téléphone, c'est quasi invisible ; posé sur une table,
  il faudra le code.
- **Mob s'ouvre**, il ne répond pas en arrière-plan. Une app tierce ne
  peut pas parler par-dessus l'écran verrouillé comme le fait Siri.
- Éteint, rien ne fonctionne — aucun assistant ne tourne sans appareil
  allumé.

## Si ça ne marche pas

- **Siri ouvre autre chose** → un contact ou une autre app s'appelle
  aussi Mob. Dis « Dis Siri, lance Mob », ou renomme le raccourci.
- **Mob s'ouvre mais ne demande rien** → la variable de l'étape 2 n'est
  pas dans l'URL, ou il y a un espace entre `?q=` et elle.
- **Réponse à côté de la question** → l'encodage manque et la question a
  été coupée à un caractère spécial. Vérifie l'étape 2.
- **Mob demande une clé** → la web app n'est pas encore configurée :
  ouvre-la directement et renseigne ⚙.

---

## Variante : répondre sans ouvrir l'app

Si tu préfères que Siri énonce la réponse **sans rien ouvrir**, le
raccourci peut appeler l'API lui-même : *Dicter le texte* → *Obtenir le
contenu de l'URL* (POST vers `https://api.mistral.ai/v1/chat/completions`,
en-têtes `Authorization: Bearer TA_CLÉ` et `Content-Type:
application/json`, corps JSON avec `model` et un tableau `messages`) →
quatre *Obtenir la valeur du dictionnaire* pour descendre jusqu'à
`choices` → premier élément → `message` → `content` → *Énoncer le texte*.

C'est plus long à monter, ça embarque ta clé dans le raccourci (ne le
partage jamais), et ça perd la mémoire, les images et les sites générés.
À réserver au cas où tu veux vraiment une réponse purement vocale.

**Note pour la clé Mistral**, valable dans les deux cas : après avoir créé
le compte sur [console.mistral.ai](https://console.mistral.ai), il faut
**vérifier son numéro de téléphone** puis, section **Billing**,
**sélectionner explicitement le plan gratuit « Experiment »**. Sans ce
choix, la clé est bien créée mais refusée à chaque appel — c'est la cause
la plus fréquente d'un « Invalid API Key » sur une clé pourtant correcte.
