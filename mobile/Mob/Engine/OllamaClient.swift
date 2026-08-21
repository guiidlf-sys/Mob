import Foundation

/// Talks to the user's own Ollama server (their PC) — the phone-side
/// mirror of jarvis.py's call_ollama: same request/response shape
/// assumption (`POST /api/chat` → `{"message": {"role", "content"}}`),
/// same "degrade, never crash" contract.
struct OllamaMessage: Codable {
    let role: String
    let content: String
}

private struct OllamaChatRequest: Encodable {
    let model: String
    let messages: [OllamaMessage]
    let stream: Bool
}

private struct OllamaChatResponse: Decodable {
    struct Message: Decodable { let role: String; let content: String }
    let message: Message
}

final class OllamaClient {
    private let baseURL: URL
    private let model: String
    private let session: URLSession

    init(baseURL: URL, model: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.model = model
        self.session = session
    }

    func chat(messages: [OllamaMessage], timeout: TimeInterval = 30) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = timeout
        request.httpBody = try JSONEncoder().encode(
            OllamaChatRequest(model: model, messages: messages, stream: false)
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw MobEngineError.serverUnreachable(baseURL.absoluteString, error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw MobEngineError.unexpectedResponse("le serveur a répondu avec le statut \(status)")
        }

        do {
            return try JSONDecoder().decode(OllamaChatResponse.self, from: data).message.content
        } catch {
            throw MobEngineError.unexpectedResponse("réponse Ollama de forme inattendue")
        }
    }
}
