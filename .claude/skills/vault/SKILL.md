---
name: vault
description: Lit et écrit la mémoire de Jarvis — le coffre Obsidian en Markdown (vault/raw, vault/wiki, vault/outputs). À utiliser dès qu'il faut retrouver quelque chose que l'utilisateur a dit, noté ou décidé, ou mémoriser une information pour plus tard ("souviens-toi", "note que", "qu'est-ce que j'avais dit sur…").
---

# vault — la mémoire

Une skill, un rôle : **lire et écrire le coffre**. Rien d'autre.

## Où est le coffre

`$JARVIS_VAULT` s'il est défini, sinon le dossier `vault/` à la racine du
dépôt. Si le serveur du HUD t'a lancé, il t'a donné le chemin exact dans
ses consignes : utilise celui-là.

## Les trois dossiers

| Dossier | Ce qu'il contient | Qui écrit |
|---|---|---|
| `raw/` | Captures brutes, jamais retouchées : journal du jour, dictées, relevés de chiffres | le HUD et les skills, en **ajout seulement** |
| `wiki/` | Notes consolidées, une idée par note, liées entre elles | toi, quand une information mérite d'être retenue |
| `outputs/` | Ce que Jarvis produit : briefings, plans, bilans | les skills `inbox`, `plan`, `metrics`, `wrap` |

## Règles

1. **Tout est Markdown.** Pas de base de données, pas de JSON caché.
2. **Lier, toujours.** Chaque note du `wiki/` cite au moins une autre note
   avec `[[Nom de la note]]` (syntaxe Obsidian). Une note orpheline est une
   note perdue. `[[Index]]` est la racine si rien d'autre ne convient.
3. **Une note par idée**, nommée par son sujet (`Projet Mob.md`, pas
   `note 3.md`). Avant d'en créer une, cherche (Grep) si elle existe déjà :
   complète-la plutôt que de la dupliquer.
4. **`raw/` ne se réécrit jamais** : on y ajoute à la fin, on ne corrige pas
   le passé.
5. **Cite tes sources** : quand tu réponds à partir du coffre, nomme les
   notes utilisées (`d'après [[Projet Mob]]…`). Si le coffre ne contient
   pas la réponse, dis-le — n'invente pas un souvenir.
6. **Rien de secret** : jamais de mot de passe, de clé d'API ou de code
   d'accès dans le coffre.

## Répondre à une question

1. Grep sur le coffre avec les mots-clés de la question (et leurs variantes).
2. Lis les notes trouvées, puis celles qu'elles lient si c'est utile.
3. Réponds court, en citant les notes.

## Mémoriser

1. Cherche la note existante sur ce sujet.
2. Complète-la, ou crée-la dans `wiki/` avec cet en-tête :

```markdown
---
created: 2026-10-11
tags: [personne | projet | idée | décision]
---
# Nom de la note

Le contenu. Lié à [[Autre note]].
```

3. Ajoute un lien vers elle depuis `[[Index]]` ou une note parente.
