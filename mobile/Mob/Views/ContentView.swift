import SwiftUI

private let systemPrompt = """
Tu es Mob, un assistant local et utile. Pour un calcul, réponds avec \
CALC(<expression>) afin que l'outil calculatrice l'exécute.
"""

/// The name of the .gguf file added to the Xcode target's bundle
/// resources — see mobile/README.md for model choice and licensing.
private let modelResourceName = "mob-model"

struct ContentView: View {
    @StateObject private var speech = SpeechRecognizer()
    @State private var engine: LLMEngine?
    @State private var engineError: String?
    @State private var memory = Memory()
    @State private var isThinking = false
    @State private var lastReply = ""
    private let speaker = Speaker()

    var body: some View {
        VStack(spacing: 16) {
            Text("Mob").font(.largeTitle.bold())

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(memory.history.enumerated()), id: \.offset) { _, entry in
                        Text("\(entry.role == "user" ? "Toi" : "Mob") : \(entry.content)")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding()
            }

            if speech.isListening {
                Text(speech.transcript.isEmpty ? "J'écoute…" : speech.transcript)
                    .foregroundStyle(.secondary)
            } else if isThinking {
                ProgressView("Mob réfléchit…")
            } else if let engineError {
                Text("Mob est hors-ligne : \(engineError)")
                    .foregroundStyle(.red)
            }

            Button(speech.isListening ? "Arrêter" : "Parler à Mob") {
                speech.isListening ? speech.stop() : startListening()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .task {
            loadEngine()
            _ = await speech.requestAuthorization()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mobShouldStartListening)) { _ in
            startListening()
        }
        .onChange(of: speech.isListening) { _, listening in
            guard !listening, !speech.transcript.isEmpty else { return }
            let input = speech.transcript
            speech.transcript = ""
            Task { await handle(input) }
        }
    }

    private func loadEngine() {
        do {
            engine = try LLMEngine(modelResourceName: modelResourceName, systemPrompt: systemPrompt)
            engineError = nil
        } catch {
            engine = nil
            engineError = error.localizedDescription
        }
    }

    private func startListening() {
        do {
            try speech.start()
        } catch {
            speech.lastError = error.localizedDescription
        }
    }

    private func handle(_ input: String) async {
        memory.append(role: "user", content: input)
        guard let engine else {
            let reply = "Mob est hors-ligne : \(engineError ?? "modèle indisponible")"
            memory.append(role: "assistant", content: reply)
            memory.save()
            lastReply = reply
            speaker.speak(reply)
            return
        }
        isThinking = true
        let reply = await engine.respond(to: input, history: memory.history)
        isThinking = false
        memory.append(role: "assistant", content: reply)
        memory.save()
        lastReply = reply
        speaker.speak(reply)
    }
}

#Preview {
    ContentView()
}
