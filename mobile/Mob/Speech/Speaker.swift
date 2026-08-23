import AVFoundation

/// Speaks Mob's replies out loud via the on-device speech synthesizer.
final class Speaker {
    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ text: String, locale: String = "fr-FR") {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: locale)
        synthesizer.speak(utterance)
    }
}
