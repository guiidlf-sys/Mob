import Foundation

/// Persistent conversation memory for Mob, with two storage tiers:
/// 1. iCloud Drive (ubiquity container), when available — grows with the
///    user's iCloud plan instead of the phone's fixed local storage, and
///    syncs across devices. This is the "quasi illimité" option, and is
///    tried first whenever it's reachable.
/// 2. Local device storage (Documents directory), as the fallback when
///    iCloud Drive isn't signed in, disabled, or the container isn't
///    configured — bounded only by whatever free space the phone has.
///
/// Unlike jarvis.py's Python-side Memory, this one never truncates what's
/// persisted to disk — the full history is kept, bounded only by real
/// storage space. `recent(limit:)` exists separately to hand the model a
/// bounded context window: a model's context limit is a different
/// concern from how much history is kept on disk.
enum MemoryBackend {
    case iCloud
    case device
}

struct MemoryEntry: Codable {
    let role: String
    let content: String
}

final class Memory {
    private let fileName: String
    private(set) var history: [MemoryEntry]
    private(set) var backend: MemoryBackend

    init(fileName: String = "memory.json") {
        self.fileName = fileName
        let (url, backend) = Memory.resolveStorageURL(fileName: fileName)
        self.backend = backend
        self.history = Memory.load(from: url)
    }

    /// iCloud Drive first — requires the app's "iCloud Documents"
    /// capability and a container identifier configured in Xcode, and the
    /// user signed into iCloud with Drive enabled. Falls back to on-device
    /// storage when that container is unavailable, rather than failing.
    private static func resolveStorageURL(fileName: String) -> (URL, MemoryBackend) {
        if let ubiquityContainer = FileManager.default.url(forUbiquityContainerIdentifier: nil) {
            let documents = ubiquityContainer.appendingPathComponent("Documents")
            try? FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
            return (documents.appendingPathComponent(fileName), .iCloud)
        }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return (documents.appendingPathComponent(fileName), .device)
    }

    private static func load(from url: URL) -> [MemoryEntry] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        guard let decoded = try? JSONDecoder().decode([MemoryEntry].self, from: data) else {
            return []
        }
        return decoded
    }

    /// No truncation here on purpose — see the type-level doc comment.
    func append(role: String, content: String) {
        history.append(MemoryEntry(role: role, content: content))
    }

    /// The last `limit` entries, for feeding a bounded prompt to the
    /// model. Storage retention and model context window are separate
    /// concerns — this is the seam between them.
    func recent(limit: Int) -> [MemoryEntry] {
        Array(history.suffix(limit))
    }

    func save() {
        guard let data = try? JSONEncoder().encode(history) else { return }
        let (url, resolvedBackend) = Memory.resolveStorageURL(fileName: fileName)
        if (try? data.write(to: url, options: .atomic)) != nil {
            backend = resolvedBackend
            return
        }
        // iCloud write failed (quota, signed out mid-session, container
        // not ready yet, ...) — degrade to local storage instead of
        // losing the conversation, same convention as jarvis.py.
        if resolvedBackend == .iCloud {
            let localDocuments = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let localURL = localDocuments.appendingPathComponent(fileName)
            _ = try? data.write(to: localURL, options: .atomic)
            backend = .device
        }
    }
}
