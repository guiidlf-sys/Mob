# Mob — app iPhone (prototype)

## Ce que c'est réellement, et ce que ce n'est pas

Tu as demandé un mot de réveil ("dire Mob") qui fonctionne en permanence,
même app fermée, tant que la batterie tient — comme "Hey Siri" ou "Dis
Siri". **Ce n'est pas possible nativement sur iOS pour une app tierce.**
Apple n'expose aucune API permettant à une app d'écouter le micro en
continu en arrière-plan pour détecter un mot-clé personnalisé ; seule
Siri (le système) a ce privilège. Ce n'est pas une limite de mon code,
c'est une restriction du système d'exploitation (vérifié via la doc
Apple App Intents et des retours de développeurs, pas deviné).

**Ce qui est réellement faisable et livré ici :** l'app se nomme "Mob",
et App Shortcuts d'Apple exige que chaque phrase d'invocation contienne
le nom de l'app. Résultat : dire **"Dis Siri, Mob"** (ou "Hey Siri, Mob"
en anglais) déclenche l'app automatiquement, où qu'on soit, tant que
Siri est activé sur le téléphone. C'est l'équivalent le plus proche
possible de ta demande sur iOS stock (sans jailbreak, que je ne
recommande pas : ça sort de l'App Store, casse les mises à jour et
affaiblit la sécurité du téléphone).

Contrepartie technique : l'app s'ouvre brièvement (`openAppWhenRun =
true` dans `StartMobIntent`) au lieu de rester invisible — faire tourner
un modèle de langage on-device depuis l'extension Siri en arrière-plan
(sans ouvrir l'app) n'est pas réaliste : ce contexte a des limites de
mémoire/temps trop strictes pour de l'inférence LLM. Dès l'ouverture,
`ContentView` se met à écouter automatiquement, donc l'expérience reste
"je dis Mob, puis je parle."

**⚠️ Correction : le téléphone doit être déverrouillé.** Parce que
`openAppWhenRun = true` amène l'app au premier plan, iOS exige un
déverrouillage (Face ID ou code) avant de l'ouvrir — ouvrir une app au
premier plan donne accès aux données protégées par le verrouillage, et
le système l'impose quel que soit le contenu de l'intent
(`authenticationPolicy` ne change rien ici, vérifié via les forums
développeurs Apple). Concrètement : téléphone verrouillé + Face ID qui
te reconnaît d'un coup d'œil → quasi invisible ; téléphone à plat ou en
poche → il faut le sortir et taper le code avant que Mob n'écoute. Ce
n'est donc pas "sans toucher l'écran" dans tous les cas — seulement
quand le téléphone est déjà déverrouillé ou que Face ID te voit. Sur
iPhone 17 Pro, c'est Face ID (pas de Touch ID) : le cas "poche/table"
demandera donc le code, pas une empreinte.

## Déclenchement vocal : "Dis Siri" est-il vraiment le seul moyen ?

Vérifié (pas supposé) : pour un déclenchement **par la voix, sans toucher
le téléphone**, oui — "Dis Siri" est la seule porte sur iOS. Aucune API
publique ne permet à une app tierce de réagir à un mot prononcé sans
passer par Siri.

Il existe des déclencheurs **tactiles** qui n'utilisent pas la voix mais
qui n'exigent pas non plus de dire "Dis Siri" :
- **Back Tap** (Réglages → Accessibilité → Tactile → Toucher au dos) :
  double ou triple tape à l'arrière du téléphone → lance un Raccourci.
  Fonctionne même verrouillé pour des actions en arrière-plan.
- **Le bouton Action** (présent sur l'iPhone 17 Pro) peut être réassigné
  à un Raccourci dans Réglages → Bouton Action.

Nuance importante à ne pas manquer : ces deux déclencheurs évitent de
dire "Dis Siri", mais **s'ils ouvrent Mob au premier plan** (comme le
fait `StartMobIntent`), la même règle iOS de déverrouillage obligatoire
s'applique — ce n'est pas spécifique à Siri, c'est lié à l'ouverture
d'une app au premier plan en général (voir plus haut). Ils ne
suppriment donc pas la contrainte de déverrouillage, seulement le besoin
de dire un mot. Utile si tu préfères une pression physique à la voix,
mais ça ne remplace pas "dire Mob" — juste une alternative.

## Faut-il un Mac ? (Xcode sans Mac)

Vérifié : compiler et signer une vraie app iOS nécessite toujours un Mac
**quelque part**, mais pas forcément le tien :

- **Swift Playgrounds sur iPad** (pas sur iPhone — la fonctionnalité de
  build/publication n'existe que sur iPad, pas sur iPhone) permet de
  créer et compiler une app sans Mac. Si tu as un iPad (même ancien,
  iPadOS 15.2+), c'est l'option la plus directe.
- **Services de build Mac dans le cloud** (Xcode Cloud d'Apple,
  Codemagic, Code2Native...) : tu envoies le code, ils compilent sur de
  vrais Macs dans un datacenter, tu récupères l'app signée. C'est
  l'option réaliste si tu n'as ni Mac ni iPad — pas besoin de matériel
  Apple supplémentaire.
- **Depuis ton iPhone seul, sans iPad ni Mac** : aucune de ces deux
  options ne tourne entièrement sur iPhone — il faudra soit un iPad,
  soit un service cloud, pour la partie compilation.

**Comme Mob est pour ton usage personnel uniquement (toi et toi seul,
pas de distribution)** : pas besoin de soumettre quoi que ce soit à
l'App Store ni à TestFlight — ce que je mentionnais dans une version
précédente de ce fichier ne s'applique pas à ton cas. Il suffit
d'installer l'app directement sur ton iPhone en développement personnel
(bouton "Run" dans Xcode avec l'iPhone branché ou sur le même réseau).
Ça simplifie aussi le compte Apple : un identifiant Apple gratuit
suffit techniquement, la seule contrepartie étant de rebrancher et
relancer un build tous les 7 jours pour renouveler la signature — le
compte développeur payant (99$/an) sert uniquement à éviter cette
corvée de réinstallation, pas à publier quoi que ce soit.

## Prérequis

- Un **Mac avec Xcode 15+** (le chemin le plus direct — voir alternatives
  ci-dessus si tu n'en as pas), ou un iPad + Swift Playgrounds, ou un
  service de build cloud. Impossible de compiler/tester une app iOS
  depuis cet environnement de travail (conteneur Linux, sans Xcode ni
  simulateur iOS).
- Un identifiant Apple (gratuit) pour signer l'app et l'installer sur ton
  iPhone en développement personnel (réinstallation à refaire tous les
  7 jours sans compte Apple Developer payant à 99$/an).
- Un iPhone physique pour tester : le simulateur ne gère pas Siri ni le
  micro de façon réaliste.

## Voie rapide : générer le projet en une commande (recommandé)

`project.yml` décrit tout le projet Xcode (dépendance SPM, capacités
Siri et iCloud, clés `Info.plist`, cible iOS 17, iPhone only). Plutôt
que de refaire tout ça à la main dans l'assistant Xcode :

```
brew install xcodegen
cd mobile
xcodegen generate
open Mob.xcodeproj
```

Avant le premier build, **une seule chose à changer** : dans
`project.yml`, remplace `com.example.Mob` par un identifiant à toi
(ex. `com.tonnom.Mob`) **aux trois endroits** (`PRODUCT_BUNDLE_IDENTIFIER`
et les deux `iCloud.com.example.Mob`), puis relance `xcodegen generate`.
Ensuite dans Xcode : onglet **Signing & Capabilities** → choisis ton
équipe (ton identifiant Apple) → branche l'iPhone → **Run**.

Le modèle `.gguf` n'est pas dans le dépôt (~2 Go, exclu par
`.gitignore`) : télécharge-le et dépose-le dans `mobile/Mob/` sous le
nom `mob-model.gguf` (voir étape 4 ci-dessous pour le choix du modèle).
Sans lui l'app compile et se lance quand même — elle affiche
« Mob est hors-ligne : model file mob-model.gguf is not in the app
bundle » au lieu de planter, ce qui est utile pour valider que le reste
fonctionne avant de télécharger 2 Go.

## Mise en place manuelle (si tu préfères l'assistant Xcode)

1. Xcode → **File → New → Project → iOS App**, nom du projet **`Mob`**
   (important : c'est ce nom qui sert de phrase d'invocation Siri),
   interface SwiftUI, langage Swift, iOS Deployment Target **17.0**.
2. Copie les fichiers de `mobile/Mob/` de ce dépôt dans le projet Xcode
   généré (glisser-déposer les dossiers `Intents/`, `Speech/`,
   `Engine/`, `Views/` et le fichier `MobApp.swift` dans le navigateur
   Xcode, en cochant "Copy items if needed").
3. **Ajoute la dépendance SPM** : File → Add Package Dependencies →
   `https://github.com/eastriverlee/LLM.swift` → ajoute le produit `LLM`
   à la target `Mob`. J'ai vérifié l'API (`LLM(from:template:)`,
   `getCompletion(from:)`) via le README du projet avant d'écrire
   `LLMEngine.swift`, mais **vérifie-la à nouveau une fois le package
   résolu par Xcode** (autocomplétion / erreurs de compilation) — la
   version exacte que SPM installera peut avoir changé son API depuis.
4. **Ajoute un modèle `.gguf`** au bundle de l'app (target Mob →
   Build Phases → Copy Bundle Resources) sous le nom `mob-model.gguf`
   (ou change `modelResourceName` dans `ContentView.swift`). Sur ton
   **iPhone 17 Pro (A19 Pro, 12 Go de RAM, Neural Engine 16 cœurs)**,
   vise un **Llama 3.2 3B Instruct** ou **Qwen2.5 3B Instruct**
   quantifié en Q4_K_M (~2 Go) — nettement mieux qu'un modèle 1B, sans
   risquer la limite mémoire par app d'iOS (le "jetsam"). Reste prudent
   au-delà : un 7-8B passera en mémoire mais cognera contre cette
   limite, surtout avec d'autres apps ouvertes en tâche de fond.
   Modèles en `.gguf` disponibles sur Hugging Face (comptes comme
   `bartowski` ou `ggml-org` publient des quantifications prêtes à
   l'emploi). Vérifie la licence du modèle choisi avant diffusion.

   Note pour plus tard : le Neural Engine 16 cœurs de l'A19 Pro (avec
   accélérateurs dédiés par cœur) n'est pas exploité par `LLM.swift`
   (backend Metal/GPU via llama.cpp) — le framework MLX d'Apple tire
   mieux parti du Neural Engine sur ce chip. Pas un changement à faire
   maintenant, mais une piste d'optimisation valable une fois le
   scaffold actuel validé.
5. **Active la capacité Siri** : target Mob → Signing & Capabilities →
   `+ Capability` → `Siri`.
6. **Active iCloud pour la mémoire extensible** (voir section « Mémoire »
   ci-dessous) : target Mob → Signing & Capabilities → `+ Capability` →
   `iCloud` → coche `iCloud Documents` → laisse Xcode créer le
   conteneur par défaut (`iCloud.<ton-bundle-id>`). Sans cette capacité,
   `Memory.swift` bascule automatiquement sur le stockage local de
   l'appareil — l'app fonctionne quand même, juste sans le tier
   "illimité".
7. **Ajoute ces clés à `Info.plist`** (texte à adapter) :
   - `NSMicrophoneUsageDescription` — "Mob a besoin du micro pour
     t'écouter."
   - `NSSpeechRecognitionUsageDescription` — "Mob transcrit ta voix en
     local pour comprendre ta demande."
   - `NSSiriUsageDescription` — "Dis « Mob » pour lancer l'assistant."
8. Signe l'app avec ton identifiant Apple (Signing & Capabilities →
   Team), branche ton iPhone, build & run dessus.
9. Sur l'iPhone : Réglages → Siri et recherche → vérifie que "Dis Siri"
   est activé et entraîné, et que "Autoriser Siri verrouillé" l'est
   aussi si tu veux que ça marche écran éteint. Dis **"Dis Siri, Mob"**
   — si le téléphone est déjà déverrouillé (ou que Face ID te reconnaît
   au moment où tu le sors de ta poche), l'app s'ouvre et commence à
   écouter automatiquement ; sinon il faudra le déverrouiller à la main
   d'abord (voir limite ci-dessous).

## Backend : sur l'iPhone, pas sur le Mac

Retour à l'architecture on-device après avoir vérifié le MacBook Air
(8 Go de mémoire unifiée, sans VRAM séparée) : un modèle qui y tiendrait
correctement (~3B) n'aurait pas dépassé ce que l'iPhone 17 Pro peut déjà
faire tourner lui-même, tout en ajoutant la dépendance à un Mac allumé
et joignable (avec en plus le problème du clapet qui s'endort). Mob
tourne donc entièrement sur l'iPhone via `LLMEngine.swift`/`LLM.swift`
(voir l'étape 4 ci-dessus pour le choix du modèle) — gratuit, privé, et
fonctionne sans connexion, avec le plafond de capacité d'un modèle
~3B propre au matériel du téléphone (voir la discussion sur les
compromis possibles si tu veux revisiter ça plus tard : API cloud
payante pour des tâches ponctuelles plus exigeantes, par exemple).

## Mémoire : iCloud en priorité, appareil en secours

`Memory.swift` essaie d'abord d'écrire dans **iCloud Drive** (conteneur
iCloud de l'app) — ce n'est pas littéralement "illimité" (rien ne l'est),
mais ça grandit avec ton forfait iCloud plutôt qu'avec le stockage fixe
du téléphone, et ça se synchronise entre appareils. Si iCloud Drive
n'est pas configuré/activé/connecté, l'app bascule automatiquement sur
le stockage local de l'appareil (Documents), sans rien casser. Si une
écriture iCloud échoue en cours de route (quota dépassé, déconnexion),
elle est retentée en local à la sauvegarde suivante — même logique de
dégradation propre que le reste du projet. Le petit texte sous le titre
dans l'app ("Mémoire : iCloud" / "Mémoire : sur l'appareil") indique
laquelle est active.

Important : l'historique complet n'est **plus jamais tronqué** sur le
disque (contrairement à `memory.py` côté Python, qui garde sa limite à
40 messages et n'a pas été modifié). Seul ce qui est envoyé au modèle à
chaque tour est borné (`contextWindow` dans `ContentView.swift`, 40 par
défaut) — parce que la fenêtre de contexte d'un modèle est une limite
différente du stockage : même avec un espace illimité, le modèle ne peut
"lire" qu'une quantité bornée de texte par requête.

Nécessite la capacité iCloud Documents activée dans Xcode (étape 6
ci-dessous) pour que le tier iCloud soit seulement *disponible* — sans
ça, l'app fonctionne quand même, juste toujours sur l'appareil.

## Limites connues à garder en tête

- Pas de vrai mot de réveil invisible en permanence (restriction iOS,
  voir plus haut) — le déclenchement passe toujours par "Dis Siri".
- **Téléphone éteint = rien ne fonctionne**, aucun assistant vocal ne
  peut tourner sans que l'appareil soit allumé.
- **Déverrouillage requis si le téléphone est verrouillé** : parce que
  `StartMobIntent` a `openAppWhenRun = true`, iOS impose un
  déverrouillage (Face ID ou code) avant d'ouvrir l'app — ce n'est pas
  contournable via `authenticationPolicy`. Quasi invisible si Face ID te
  voit en sortant le téléphone, sinon il faut taper le code à la main.
- Premier chargement du modèle plus lent (décompression/allocation du
  `.gguf`) ; l'inférence on-device consomme batterie et chauffe le
  téléphone sur les conversations soutenues.
- Plafond de capacité propre au matériel du téléphone (~3B) : correct
  pour du texte simple et un peu de code basique, pas un niveau Claude.
- Locale vocale codée en dur en `fr-FR` dans `SpeechRecognizer.swift`
  et `Speaker.swift` — change-la si besoin.
- **Rien de ce code Swift n'a été compilé** (pas d'Xcode/macOS dans
  l'environnement où il a été écrit). Il a en revanche été relu ligne à
  ligne contre le **code source réel** de `LLM.swift` (pas seulement son
  README), ce qui a déjà corrigé quatre défauts qui auraient cassé ou
  faussé le premier build :
  1. `Role` est un enum **au niveau du module**, pas `LLM.Role` —
     erreur de compilation franche.
  2. `LLM.swift` impose son propre `historyLimit: Int = 8`, qui
     ramenait silencieusement la fenêtre de contexte de 40 à 8 :
     désormais passé explicitement.
  3. `Memory` était une classe simple derrière `@State` — SwiftUI ne
     se redessinait jamais, donc la conversation serait restée
     invisible à l'écran. Passée en `ObservableObject`/`@StateObject`.
  4. `Speaker` était recréé à chaque redessin de la vue, ce qui pouvait
     désallouer `AVSpeechSynthesizer` en pleine phrase et couper Mob au
     milieu d'un mot. Retenu via `@State`.

  Attends-toi quand même à quelques erreurs résiduelles au premier
  build : une relecture, même minutieuse, ne remplace pas un
  compilateur. Note-les et on les corrige.
- "Illimité" reste borné par la réalité : ton forfait iCloud a une
  taille, et le stockage de secours sur l'appareil a la taille du
  téléphone. Aucun système ne stocke vraiment à l'infini — l'objectif
  ici est juste de ne plus effacer l'historique par une limite
  arbitraire de code.
