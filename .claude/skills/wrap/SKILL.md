---
name: wrap
description: Bilan du soir — enregistre la réflexion du jour et prépare demain. À utiliser pour "bilan", "fin de journée", "wrap up", ou par la routine de 19 h.
---

# wrap — le bilan du soir

Une skill, un rôle : **fermer la journée et ouvrir demain**.

## Matière première

Dans le coffre :

- `outputs/<aujourd'hui>-plan.md` — les trois priorités ;
- `raw/<aujourd'hui>.md` — le journal : tout ce qui a été dit et fait ;
- `outputs/<aujourd'hui>-metrics.md` s'il existe.

Si l'utilisateur dicte sa réflexion avec la demande (« bilan : j'ai fini la
maquette mais pas les tests »), **c'est la source principale** : recopie-la
fidèlement, ne la reformule pas en mieux.

## Ce que tu écris

`outputs/AAAA-MM-JJ-wrap.md` :

```markdown
# Bilan — dimanche 11 octobre

## Priorités
- [x] Première priorité
- [ ] Deuxième — pourquoi elle n'a pas avancé, si on le sait
- [ ] Troisième

## Réflexion
Ce que l'utilisateur a dit, tel quel. S'il n'a rien dicté : « Pas de
réflexion dictée aujourd'hui. » — n'en invente pas une.

## Demain
1. …
2. …
3. …
```

Une priorité est cochée **seulement** si le journal ou l'utilisateur dit
qu'elle est faite. Dans le doute, elle reste ouverte. « Demain » reprend
d'abord ce qui n'est pas fini — la skill `plan` le lira à 9 h.

Si la journée a produit une information durable (une décision, une
personne, un projet), mémorise-la avec la skill `vault`.

Au journal `raw/AAAA-MM-JJ.md` :
`- HH:MM bilan écrit → [[AAAA-MM-JJ-wrap]]`.

## Ta réponse

Combien de priorités sont faites sur trois, et les trois de demain.
