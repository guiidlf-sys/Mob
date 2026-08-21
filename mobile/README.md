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
  créer, compiler et soumettre une app à l'App Store sans Mac. Si tu as
  un iPad (même ancien, iPadOS 15.2+), c'est l'option la plus directe.
- **Services de build Mac dans le cloud** (Xcode Cloud d'Apple,
  Codemagic, Code2Native...) : tu envoies le code, ils compilent sur de
  vrais Macs dans un datacenter, tu récupères l'app signée ou elle part
  directement sur TestFlight pour installation sur ton iPhone. C'est
  l'option réaliste si tu n'as ni Mac ni iPad — pas besoin de matériel
  Apple supplémentaire, juste un compte (souvent payant au-delà d'un
  usage gratuit limité) en plus du compte développeur Apple à 99$/an
  si tu veux dépasser les 7 jours de réinstallation.
- **Depuis ton iPhone seul, sans iPad ni Mac** : aucune de ces deux
  options ne tourne entièrement sur iPhone — il faudra soit un iPad,
  soit un service cloud, pour la partie compilation.

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

## Mise en place (à faire dans Xcode, sur le Mac)

1. Xcode → **File → New → Project → iOS App**, nom du projet **`Mob`**
   (important : c'est ce nom qui sert de phrase d'invocation Siri),
   interface SwiftUI, langage Swift, iOS Deployment Target **17.0**.
2. Copie les fichiers de `mobile/Mob/` de ce dépôt dans le projet Xcode
   généré (glisser-déposer les dossiers `Intents/`, `Speech/`,
   `Engine/`, `Views/` et le fichier `MobApp.swift` dans le navigateur
   Xcode, en cochant "Copy items if needed").
3. Rien à ajouter côté SPM : Mob parle à ton PC en HTTP via
   `OllamaClient.swift` (URLSession stdlib), donc pas de dépendance
   tierce à résoudre pour le moteur IA.
4. **Configure le serveur dans l'app** (pas dans Xcode) : une fois
   buildée, ouvre Mob → icône ⚙️ en haut à droite → renseigne l'adresse
   de ton PC (ex. `http://192.168.1.42:11434` sur le même Wi-Fi, ou ton
   nom Tailscale, ex. `http://mon-pc.tailXXXX.ts.net:11434`) et le nom
   du modèle à utiliser (ex. `llama3.1:70b`, ce que tu as déjà `pull`
   avec Ollama). Voir la section « Backend : ton PC via Ollama »
   ci-dessous pour le choix du modèle et la configuration côté PC.
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

## Backend : ton PC via Ollama, pas un modèle sur le téléphone

Tu as choisi que Mob s'appuie sur un gros modèle auto-hébergé sur ton PC
plutôt qu'un petit modèle embarqué dans l'app — plus capable, mais qui
suppose que ton PC tourne et soit joignable. `LLMEngine.swift` appelle
`OllamaClient.swift`, qui fait exactement ce que fait `call_ollama` dans
`jarvis.py` : `POST /api/chat` avec `{"model", "messages", "stream":
false}`, réponse attendue `{"message": {"content": "..."}}`.

**Ton cas précis : MacBook Air, 8 Go de mémoire unifiée.** Pas de VRAM
séparée sur Apple Silicon — la RAM est partagée entre macOS et le
modèle. Avec seulement 8 Go au total (macOS + apps ouvertes en prennent
déjà 3-5 Go), il faut rester sur un **petit modèle, ~2-4B quantifié**
(ex. Llama 3.2 3B Instruct, Phi-3.5-mini, Qwen2.5 3B) — un 7-8B
swappera et deviendra très lent, voire instable. Le MacBook Air n'a en
plus pas de ventilateur : une conversation soutenue peut chauffer et
throttler la puce.

**⚠️ À relire avant d'aller plus loin :** avec cette RAM, le modèle que
ton Mac peut tenir (~3B) n'est pas plus capable que ce que l'iPhone 17
Pro aurait pu faire tourner **directement sur lui-même** (voir la
recommandation on-device qu'on avait écartée). Le choix "PC
auto-hébergé" avait du sens pour viser *plus* de capacité qu'on-device —
sur ce Mac précis, ça n'apporte pas ce gain. Ça reste utile pour ne pas
solliciter la batterie/le processeur du téléphone, mais si l'objectif
premier était "le plus intelligent possible", il faut qu'on en reparle
(API cloud payante pour les tâches qui le demandent, ou accepter ce
plafond ~3B des deux côtés).

**Côté Mac :**
1. `ollama pull llama3.2` (ou un autre ~3B) — évite les modèles plus
   gros vu la RAM disponible.
2. Par défaut Ollama n'écoute que `127.0.0.1` (donc invisible depuis le
   téléphone). Pour l'ouvrir à ton réseau local : variable d'environnement
   `OLLAMA_HOST=0.0.0.0:11434` avant de lancer `ollama serve` (ou dans la
   config du lancement automatique si tu utilises `brew services`).
3. **⚠️ Sécurité — ne mets jamais ça derrière une redirection de port
   ouverte sur Internet.** L'API Ollama n'a aucune authentification :
   quiconque atteint le port peut l'utiliser ou supprimer tes modèles.
   Pour un accès en dehors de ton Wi-Fi, utilise **Tailscale** (réseau
   privé chiffré gratuit pour un usage perso) installé sur le Mac et sur
   l'iPhone — utilise alors le nom Tailscale du Mac comme adresse dans
   les Réglages de Mob, jamais une redirection de port sur ta box.
4. **Un MacBook (contrairement à un PC de bureau) s'endort quand tu
   fermes l'écran** — et Mob devient injoignable pendant ce temps. Sans
   écran externe branché, il n'y a pas de moyen officiel de désactiver
   cette mise en veille au clapet fermé. Il faudra donc soit garder le
   Mac ouvert et branché en permanence, soit accepter que Mob soit
   hors-ligne quand le capot est fermé (il le dira au lieu de planter).

**Côté iPhone :** ouvre Mob → ⚙️ → renseigne l'adresse et le modèle
(étape 4 ci-dessus). Tant que rien n'est configuré, Mob répond
"Mob est hors-ligne : aucun serveur configuré (Réglages)" au lieu de
planter.

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
- Mob a besoin que ton PC soit **allumé, Ollama lancé, et joignable**
  (Wi-Fi local ou Tailscale) — pas de mode hors-ligne autonome avec ce
  choix d'architecture ; si le PC est éteint ou injoignable, Mob répond
  "hors-ligne" au lieu de planter, mais ne répond pas.
- Latence réseau + temps d'inférence d'un gros modèle : les réponses ne
  seront pas instantanées, surtout via Tailscale depuis l'extérieur.
- Locale vocale codée en dur en `fr-FR` dans `SpeechRecognizer.swift`
  et `Speaker.swift` — change-la si besoin.
- `StartMobIntent`/`MobShortcuts` n'ont pas pu être compilés ni testés
  dans cet environnement (pas d'Xcode/macOS ici) : à valider en premier
  sur ta machine, avant d'aller plus loin, exactement comme pour la
  validation Ollama réelle documentée dans le `CLAUDE.md` racine.
- "Illimité" reste borné par la réalité : ton forfait iCloud a une
  taille, et le stockage de secours sur l'appareil a la taille du
  téléphone. Aucun système ne stocke vraiment à l'infini — l'objectif
  ici est juste de ne plus effacer l'historique par une limite
  arbitraire de code.
