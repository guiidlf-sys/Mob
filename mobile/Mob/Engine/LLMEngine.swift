import Foundation

/// Thrown when Mob can't reach the user's PC or gets an odd reply, so the
/// caller can degrade gracefully instead of crashing — same convention as
/// OllamaUnavailableError in jarvis.py.
enum MobEngineError: Error, LocalizedError {
    case serverNotConfigured
    case serverUnreachable(String, String)
    case unexpectedResponse(String)

    var errorDescription: String? {
        switch self {
        case .serverNotConfigured:
            return "aucun serveur configuré (Réglages)"
        case .serverUnreachable(let url, let reason):
            return "impossible de joindre \(url) : \(reason)"
        case .unexpectedResponse(let detail):
            return detail
        }
    }
}

/// Runs Mob's reasoning on the user's own PC (over the network) rather
/// than on the phone — chosen over on-device inference so Mob can run a
/// genuinely capable open model instead of a phone-sized one. See
/// mobile/README.md for reachability (local Wi-Fi vs Tailscale) and
/// model choice.
final class LLMEngine {
    private let client: OllamaClient
    private let systemPrompt: String

    init(systemPrompt: String) throws {
        guard let serverURL = MobSettings.serverURL else {
            throw MobEngineError.serverNotConfigured
        }
        self.client = OllamaClient(baseURL: serverURL, model: MobSettings.model)
        self.systemPrompt = systemPrompt
    }

    /// Runs one turn against the PC's Ollama server and resolves any
    /// CALC(...) tool call. Never throws — a reachability or shape error
    /// becomes an inline "offline" reply, same as jarvis.py's chat_turn.
    func respond(to input: String, history: [MemoryEntry]) async -> String {
        var messages = [OllamaMessage(role: "system", content: systemPrompt)]
        messages += history.map { OllamaMessage(role: $0.role, content: $0.content) }
        messages.append(OllamaMessage(role: "user", content: input))

        do {
            let raw = try await client.chat(messages: messages)
            return Self.resolveToolCalls(in: raw)
        } catch {
            return "Mob est hors-ligne : \(error.localizedDescription)"
        }
    }

    /// Same CALC(<expression>) convention as jarvis.py's maybe_run_tool.
    static func resolveToolCalls(in reply: String) -> String {
        guard let start = reply.range(of: "CALC(") else { return reply }
        guard let end = reply.range(of: ")", range: start.upperBound..<reply.endIndex) else {
            return reply
        }
        let expression = String(reply[start.upperBound..<end.lowerBound])
        do {
            let result = try SafeEval.evaluate(expression)
            return "\(reply)\n[calculator] \(expression) = \(result)"
        } catch {
            return "\(reply)\n[tool error: \(error.localizedDescription)]"
        }
    }
}
