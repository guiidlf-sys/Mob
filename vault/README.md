# Le coffre de Jarvis

> Si ce n'est pas dans le coffre, ça n'a pas eu lieu.

```
vault/
  raw/       captures brutes, ajout seulement (journal du jour, chiffres)
  wiki/      notes consolidées, une idée par note, liées par [[liens]]
  outputs/   ce que Jarvis produit : briefing, plan, chiffres, bilan
```

1. **Tout est Markdown.** Pas de base de données.
2. **Les notes sont liées en graphe** par la syntaxe Obsidian `[[Nom]]`.
3. **Jarvis y cherche et y répond vite** — skill `vault`
   (`.claude/skills/vault/SKILL.md`).
4. **Tu peux tout lire.** Ce ne sont que des fichiers.

## Ouvrir dans Obsidian

Obsidian → « Ouvrir un dossier comme coffre » → ce dossier `vault/`.
La vue Graphe montre les mêmes liens que le HUD.

Pour retrouver le coffre sur l'iPhone, place-le dans le dossier Obsidian
d'iCloud Drive et indique son chemin au HUD :
`JARVIS_VAULT=~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Jarvis`.

## Pourquoi son contenu n'est pas sur GitHub

Le dépôt est **public**. Seule la structure est versionnée ; tout ce que
tu y écris est ignoré par git (voir `.gitignore`). Corollaire : dans une
session Claude Code dans le cloud, le coffre repart vide à chaque fois —
sa place est sur ton Mac.
