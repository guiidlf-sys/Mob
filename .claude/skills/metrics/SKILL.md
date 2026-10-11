---
name: metrics
description: Relève les chiffres de l'utilisateur (abonnés, vues, followers…) et les consigne dans le coffre avec leur évolution. À utiliser pour "mes chiffres", "combien d'abonnés", "note que j'ai 1 200 vues", ou par la routine de 14 h.
---

# metrics — les chiffres

Une skill, un rôle : **relever et consigner des nombres**. Pas de commentaire
motivant, pas d'interprétation au-delà de l'évolution.

## Quelles sources

La liste vit dans le coffre, `wiki/Sources de chiffres.md` :

```markdown
# Sources de chiffres

| Source | Mesure | Comment la lire |
|---|---|---|
| YouTube | abonnés | https://www.youtube.com/@pseudo/about |
| Instagram | followers | à dicter |
```

Si cette note n'existe pas, crée-la avec un exemple commenté et **dis à
l'utilisateur qu'elle est à remplir** — ne devine pas ses comptes.

## Relever

- Une source avec une URL publique : essaie WebFetch. Si la page ne donne
  pas le chiffre (connexion requise, contenu chargé en JavaScript), note
  `non lu` — **ne l'estime jamais**.
- Une source « à dicter » : prends le chiffre que l'utilisateur te donne
  dans sa demande ; sinon `non lu`.

## Ce que tu écris

1. **Ajoute** (jamais de réécriture) une ligne par mesure à
   `raw/metrics.md` :

   ```markdown
   | 2026-10-11 | YouTube | abonnés | 1234 |
   ```

   Si le fichier n'existe pas, commence-le par l'en-tête
   `| date | source | mesure | valeur |` et sa ligne `|---|---|---|---|`.

2. `outputs/AAAA-MM-JJ-metrics.md` : chaque mesure, sa valeur, et l'écart
   avec le relevé précédent de la même mesure (lu dans `raw/metrics.md`).

3. Au journal `raw/AAAA-MM-JJ.md` :
   `- HH:MM chiffres relevés → [[AAAA-MM-JJ-metrics]]`.

## Ta réponse

Une phrase par mesure : valeur et écart. Les `non lu` en dernier.
