import AppIntents

/// Invoked by saying "Hey Siri, Mob" — iOS has no API for a fully custom
/// wake word without "Hey Siri", and every App Shortcut phrase must embed
/// \(.applicationName) (verified against Apple's App Intents docs and real
/// developer reports before writing this). Naming the app "Mob" makes that
/// required token double as the wake word the user actually wants.
///
/// openAppWhenRun is true on purpose: running local LLM inference from the
/// Siri extension's background context (no UI opened) is not realistic —
/// that context has tight memory/time limits unsuited to an on-device
/// model. Opening the app is the trade-off for reliability; ContentView
/// starts listening immediately on appear so the interaction still reads
/// as "say Mob, then talk."
struct StartMobIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to Mob"
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(name: .mobShouldStartListening, object: nil)
        return .result(dialog: "J'écoute.")
    }
}

struct MobShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartMobIntent(),
            phrases: [
                "\(.applicationName)",
                "Parle à \(.applicationName)",
            ],
            shortTitle: "Parler à Mob",
            systemImageName: "waveform"
        )
    }
}

extension Notification.Name {
    static let mobShouldStartListening = Notification.Name("mobShouldStartListening")
}
