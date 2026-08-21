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
quand le téléphone est déjà déverrouillé ou que Face ID te voit.

## Prérequis

- Un **Mac avec Xcode 15+** (obligatoire — impossible de compiler/tester
  une app iOS sans ça, et cet environnement de travail est un conteneur
  Linux qui n'a ni Xcode ni simulateur iOS).
- Un identifiant Apple (gratuit) pour signer l'app et l'installer sur ton
  iPhone en développement personnel (réinstallation à refaire tous les
  7 jours sans compte Apple Developer payant à 99$/an).
- Un iPhone physique pour tester : le simulateur ne gère pas Siri ni le
  micro de façon réaliste.

## Mise en place (à faire dans Xcode, sur le Mac)

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
   Build Phases → Copy Bundle Resources) sous le nom
   `mob-model.gguf` (ou change `modelResourceName` dans
   `ContentView.swift`). Pour un iPhone, privilégie un petit modèle
   quantifié, ex. Llama 3.2 1B Instruct (Q4_K_M) ou Gemma 3 270M/1B —
   disponibles en `.gguf` sur Hugging Face (comptes comme
   `bartowski` ou `ggml-org` publient des quantifications prêtes à
   l'emploi). Vérifie la licence du modèle choisi avant diffusion.
5. **Active la capacité Siri** : target Mob → Signing & Capabilities →
   `+ Capability` → `Siri`.
6. **Ajoute ces clés à `Info.plist`** (texte à adapter) :
   - `NSMicrophoneUsageDescription` — "Mob a besoin du micro pour
     t'écouter."
   - `NSSpeechRecognitionUsageDescription` — "Mob transcrit ta voix en
     local pour comprendre ta demande."
   - `NSSiriUsageDescription` — "Dis « Mob » pour lancer l'assistant."
7. Signe l'app avec ton identifiant Apple (Signing & Capabilities →
   Team), branche ton iPhone, build & run dessus.
8. Sur l'iPhone : Réglages → Siri et recherche → vérifie que "Dis Siri"
   est activé et entraîné, et que "Autoriser Siri verrouillé" l'est
   aussi si tu veux que ça marche écran éteint. Dis **"Dis Siri, Mob"**
   — si le téléphone est déjà déverrouillé (ou que Face ID te reconnaît
   au moment où tu le sors de ta poche), l'app s'ouvre et commence à
   écouter automatiquement ; sinon il faudra le déverrouiller à la main
   d'abord (voir limite ci-dessous).

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
  téléphone sur les modèles plus gros.
- Locale vocale codée en dur en `fr-FR` dans `SpeechRecognizer.swift`
  et `Speaker.swift` — change-la si besoin.
- `StartMobIntent`/`MobShortcuts` n'ont pas pu être compilés ni testés
  dans cet environnement (pas d'Xcode/macOS ici) : à valider en premier
  sur ta machine, avant d'aller plus loin, exactement comme pour la
  validation Ollama réelle documentée dans le `CLAUDE.md` racine.
