---
name: plan
description: Écrit les 3 priorités du jour dans le coffre. À utiliser pour "planifie ma journée", "mes priorités", "qu'est-ce que je fais aujourd'hui", ou par la routine de 9 h.
---

# plan — les 3 priorités du jour

Une skill, un rôle : **choisir trois choses, pas dix**.

## Matière première

Dans le coffre, lis s'ils existent :

- `outputs/<aujourd'hui>-inbox.md` — le briefing du matin ;
- `outputs/<hier>-wrap.md` — la section « Demain » du bilan d'hier ;
- `raw/<aujourd'hui>.md` — ce que l'utilisateur a déjà dit aujourd'hui ;
- les notes du `wiki/` marquées `tags: [projet]`.

Si l'utilisateur te dicte lui-même ses priorités, **elles priment** sur
tout le reste.

## Ce que tu écris

`outputs/AAAA-MM-JJ-plan.md` — le format est lu par le HUD, respecte-le :

```markdown
# Plan — dimanche 11 octobre

1. Première priorité, en une phrase qui commence par un verbe
2. Deuxième
3. Troisième

## Pourquoi
Une ligne par priorité, avec le lien vers la note d'où elle vient : [[Projet Mob]].
```

Exactement **trois** lignes numérotées `1.` `2.` `3.`, avant toute autre
liste numérotée. Si le fichier existe déjà, remplace-le (on replanifie).

Ajoute au journal `raw/AAAA-MM-JJ.md` :
`- HH:MM plan écrit → [[AAAA-MM-JJ-plan]]`.

## Ta réponse

Les trois priorités, en une phrase chacune.
