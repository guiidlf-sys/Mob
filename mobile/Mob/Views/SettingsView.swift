import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var serverURLText: String = MobSettings.serverURL?.absoluteString ?? ""
    @State private var model: String = MobSettings.model
    let onSave: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Serveur (ton PC)") {
                    TextField("http://192.168.1.x:11434 ou https://tonpc.tailXXXX.ts.net:11434", text: $serverURLText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Modèle (ex. llama3.1:70b)", text: $model)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Text("Adresse locale si tu es sur le même Wi-Fi que ton PC, ou nom Tailscale pour y accéder depuis l'extérieur — voir mobile/README.md.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("Réglages")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        MobSettings.serverURL = URL(string: serverURLText)
                        MobSettings.model = model
                        onSave()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    SettingsView(onSave: {})
}
