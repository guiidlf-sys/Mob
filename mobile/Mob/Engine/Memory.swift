import Foundation

/// Mirrors memory.py: a small JSON-file-backed conversation history,
/// trimmed to maxHistory entries, degrading to an empty history rather
/// than crashing on a missing or corrupted file.
struct MemoryEntry: Codable {
    let role: String
    let content: String
}

final class Memory {
    private let url: URL
    private let maxHistory: Int
    private(set) var history: [MemoryEntry]

    init(fileName: String = "memory.json", maxHistory: Int = 40) {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.url = documents.appendingPathComponent(fileName)
        self.maxHistory = maxHistory
        self.history = Memory.load(from: self.url, maxHistory: maxHistory)
    }

    private static func load(from url: URL, maxHistory: Int) -> [MemoryEntry] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        guard let decoded = try? JSONDecoder().decode([MemoryEntry].self, from: data) else {
            return []
        }
        return Array(decoded.suffix(maxHistory))
    }

    func append(role: String, content: String) {
        history.append(MemoryEntry(role: role, content: content))
        if history.count > maxHistory {
            history = Array(history.suffix(maxHistory))
        }
    }

    func save() {
        guard let data = try? JSONEncoder().encode(history) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
