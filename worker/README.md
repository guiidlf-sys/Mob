# Le relais — mettre la clé hors de portée du navigateur

Mob est une page publique : **tout ce qu'elle contient est lisible par
quiconque l'ouvre**. Une clé d'API posée dedans n'est pas discrète, elle est
publiée — et des robots scannent GitHub en continu pour exactement ça.

Ce dossier contient un petit serveur (un *Worker* Cloudflare) qui résout le
problème : **la clé vit sur le serveur**, et la page ne connaît qu'un **code
d'accès**. Tu distribues un code par personne, tu peux en révoquer un sans
gêner les autres, et tu plafonnes chacun pour que personne ne vide ton quota.

> **La contrepartie, à voir avant de commencer :** c'est ta clé Mistral, donc
> **c'est ton quota pour tout le monde**. C'est fait pour quelques personnes
> que tu choisis. Pas pour une page ouverte à tout internet.

## Ce que le relais garantit — et ce qu'il ne garantit pas

| Garanti | Comment |
|---|---|
| La clé ne part jamais au navigateur | Elle est ajoutée par le serveur, et jamais renvoyée. Vérifié par un test. |
| Un code peut être retiré seul | Tu l'enlèves du secret, les autres continuent. |
| Personne ne vide ton quota | Plafond quotidien par code, compté côté serveur. |
| L'admin est réel | Le choix du modèle est **imposé par le serveur** : un utilisateur ne peut pas s'offrir Mistral Large. |

Ce qui n'est **pas** garanti : la liste des origines autorisées (CORS) range
les navigateurs, elle n'empêche rien à qui appelle en ligne de commande.
C'est le **code d'accès** qui protège, pas l'origine. Ne compte pas sur le
CORS pour autre chose que du rangement.

## Déploiement

Cinq étapes, une seule fois. Les deux premières sont à toi : je ne peux pas
créer de compte ni accepter des conditions d'utilisation à ta place.

### 1. Un compte Cloudflare

Sur [dash.cloudflare.com](https://dash.cloudflare.com) — gratuit, sans carte
bancaire. Le plan gratuit suffit largement : 100 000 requêtes par jour, et
100 000 écritures de compteur par jour.

### 2. Une clé Mistral neuve

Sur [console.mistral.ai](https://console.mistral.ai). **Prends-en une
nouvelle** : celle que tu utilisais dans le navigateur a pu être vue.
Pense à choisir le plan gratuit « Experiment » dans Billing, sinon la clé est
créée mais ne fonctionne pas.

### 3. Se connecter et poser les secrets

```bash
cd worker
npm install
npx wrangler login          # ouvre le navigateur, à valider une fois

npx wrangler secret put MISTRAL_API_KEY
# colle la clé, Entrée

npx wrangler secret put ACCESS_CODES
# colle le JSON décrit ci-dessous, Entrée
```

Un secret n'est **jamais** écrit dans le dépôt : il est stocké chez
Cloudflare et n'en ressort pas, même pour toi.

#### Le format des codes

```json
{
  "un-code-long-et-difficile":  { "name": "Guillaume", "role": "admin", "limit": 400 },
  "un-autre-code-different":    { "name": "Maman",     "role": "user",  "limit": 60  },
  "encore-un-autre":            { "name": "Ami",       "role": "user",  "limit": 30  }
}
```

- **la clé de l'objet** est le code que la personne tapera dans Mob ;
- `role` : `admin` te donne l'onglet Admin et le choix du modèle. Tout le
  reste doit être `user` ;
- `limit` : messages par jour, remis à zéro à minuit UTC.

Choisis des codes **longs et non devinables** — `mob`, `1234` ou un prénom
sont trouvés en quelques secondes. Trois ou quatre mots sans rapport font un
bon code.

### 4. Déployer

```bash
npx wrangler deploy
```

Wrangler affiche l'adresse à la fin, du genre :

```
https://mob-relais.ton-compte.workers.dev
```

Vérifie au passage que `ALLOWED_ORIGINS`, dans `wrangler.jsonc`, contient
bien l'adresse de ton site (`https://guiidlf-sys.github.io` par défaut).

### 5. Donner l'adresse à Mob

Dans `docs/index.html`, tout en haut du script, une ligne attend cette
adresse :

```js
var RELAY_URL = "";     // ← colle-la ici
```

Une fois remplie et la page republiée, **tout le monde n'a plus qu'un code à
saisir**. Tant qu'elle est vide, Mob fonctionne comme avant : chacun sa
propre clé.

Pour essayer sans republier la page, il y a aussi un champ *Adresse du
relais* dans **Réglages → Compte** — il ne vaut que pour ton navigateur.

## Au quotidien

| Besoin | Geste |
|---|---|
| Ajouter quelqu'un | Rejoue `npx wrangler secret put ACCESS_CODES` avec le JSON complet, code en plus |
| Retirer quelqu'un | Idem, code en moins. Effet immédiat. |
| Changer les plafonds | Idem, `limit` modifié |
| Voir ce qui se passe | `npx wrangler tail` |

Le JSON est réécrit **en entier** à chaque fois : garde-le quelque part, chez
toi, hors du dépôt.

## Tests

```bash
node worker/test/relay.test.mjs
```

13 contrôles, sur le vrai moteur Cloudflare (`wrangler dev`) et non sur une
imitation : le Durable Object, SQLite et le CORS sont ceux qui tourneront en
production. Mistral est remplacé par un serveur local, pour ne dépenser ni
jeton ni quota. La suite vérifie notamment que **la clé n'apparaît dans
aucune réponse**, que le plafond arrête réellement la dépense *avant*
d'appeler Mistral, et qu'un utilisateur ne peut pas s'offrir un modèle plus
cher que celui que tu lui as fixé.
