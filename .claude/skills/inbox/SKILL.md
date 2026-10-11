---
name: inbox
description: Briefing du matin — boîte mail, agenda du jour et actualité de l'IA, en un texte court fait pour être lu à voix haute. À utiliser pour "briefing", "quoi de neuf ce matin", "résume mes mails", ou par la routine de 7 h.
---

# inbox — le briefing du matin

Une skill, un rôle : **dire à l'utilisateur ce qui l'attend aujourd'hui**.

## Sources, dans cet ordre

1. **Mails** — si un outil mail est branché (connecteur Gmail ou autre
   serveur MCP), lis les fils non lus ou reçus depuis 24 h. Garde ceux qui
   demandent une action ou viennent d'une vraie personne ; ignore
   newsletters et notifications automatiques.
2. **Agenda** — si un outil calendrier est branché, les événements
   d'aujourd'hui. Sinon, la section « Agenda » de
   `wiki/Agenda.md` dans le coffre si elle existe.
3. **Actualité IA** — une recherche web (WebSearch) sur les annonces des
   dernières 24 h. Trois titres au plus, chacun avec sa source.
4. **Le coffre** — le plan d'hier (`outputs/<hier>-plan.md`) et le bilan
   d'hier (`outputs/<hier>-wrap.md`) : ce qui était prévu pour aujourd'hui.

**Une source absente n'est pas une erreur.** Si aucun outil mail n'est
branché, écris « Mails : non connectés » et continue. N'invente jamais un
mail, un rendez-vous ou une actualité.

## Ce que tu écris

`outputs/AAAA-MM-JJ-inbox.md` (date du jour), dans le coffre :

```markdown
# Briefing — dimanche 11 octobre

## Mails
- …

## Agenda
- 10:00 — …

## IA
- … (source)

## Prévu d'hier
- …
```

Puis ajoute une ligne au journal `raw/AAAA-MM-JJ.md` :
`- HH:MM briefing écrit → [[AAAA-MM-JJ-inbox]]`.

## Ta réponse

Le briefing lui-même, **en phrases parlées** : pas de tableau, pas de
lien brut, moins de 120 mots. Il sera lu à voix haute par le HUD.
