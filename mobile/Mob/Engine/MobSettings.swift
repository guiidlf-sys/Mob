import Foundation

/// Where the user's own PC is configured — can't be hardcoded, it's their
/// specific network address (local Wi-Fi IP or Tailscale hostname).
/// Persisted via UserDefaults, editable from SettingsView.
enum MobSettings {
    private static let serverURLKey = "ollamaServerURL"
    private static let modelKey = "ollamaModel"

    static var serverURL: URL? {
        get { UserDefaults.standard.string(forKey: serverURLKey).flatMap(URL.init(string:)) }
        set { UserDefaults.standard.set(newValue?.absoluteString, forKey: serverURLKey) }
    }

    static var model: String {
        get { UserDefaults.standard.string(forKey: modelKey) ?? "llama3.1" }
        set { UserDefaults.standard.set(newValue, forKey: modelKey) }
    }
}
