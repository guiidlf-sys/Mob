import Foundation
import LLM

/// Thrown when the on-device model can't be loaded or queried, so the
/// caller can degrade gracefully instead of crashing — same convention
/// as OllamaUnavailableError in jarvis.py.
enum MobEngineError: Error, LocalizedError {
    case modelNotBundled(String)
    case modelFailedToLoad

    var errorDescription: String? {
        switch self {
        case .modelNotBundled(let name):
            return "model file \(name) is not in the app bundle"
        case .modelFailedToLoad:
            return "the on-device model failed to load"
        }
    }
}

/// Wraps LLM.swift (https://github.com/eastriverlee/LLM.swift), which loads
/// a local .gguf file and runs inference on-device via llama.cpp. Checked
/// against the package's actual source (not just its README):
///   public enum Role { case user; case bot }        // top-level, NOT LLM.Role
///   public typealias Chat = (role: Role, content: String)
///   public var history: [Chat]
///   public convenience init?(from: URL, template: Template, ..., historyLimit: Int = 8, ...)
///   public func getCompletion(from input: borrowing String) async -> String
final class LLMEngine {
    private let bot: LLM

    /// - Parameters:
    ///   - modelResourceName: the .gguf file name (without extension) added
    ///     to the Xcode project's "Copy Bundle Resources" build phase.
    ///   - historyLimit: passed through to LLM.swift, which otherwise
    ///     silently caps history at its own default of 8 — that would
    ///     override the caller's context window without any error.
    init(modelResourceName: String, systemPrompt: String, historyLimit: Int) throws {
        guard let modelURL = Bundle.main.url(forResource: modelResourceName, withExtension: "gguf") else {
            throw MobEngineError.modelNotBundled("\(modelResourceName).gguf")
        }
        guard let bot = LLM(from: modelURL, template: .chatML(systemPrompt), historyLimit: historyLimit) else {
            throw MobEngineError.modelFailedToLoad
        }
        self.bot = bot
    }

    /// Runs one turn: sends `history + input` to the on-device model and
    /// returns its reply with any CALC(...) tool call resolved via SafeEval.
    func respond(to input: String, history: [MemoryEntry]) async -> String {
        bot.history = history.map { entry in
            (role: entry.role == "user" ? Role.user : Role.bot, content: entry.content)
        }
        let raw = await bot.getCompletion(from: input)
        return Self.resolveToolCalls(in: raw)
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
