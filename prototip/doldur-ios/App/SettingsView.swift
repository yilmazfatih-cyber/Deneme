import SwiftUI

struct SettingsView: View {
    @State private var apiKey = Keychain.loadAPIKey() ?? ""
    @State private var smartEnabled = SharedStore.shared.smartAnalysisEnabled
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Akıllı analiz (Claude)", isOn: $smartEnabled)
                        .onChange(of: smartEnabled) { _, value in SharedStore.shared.smartAnalysisEnabled = value }
                } footer: {
                    Text("""
                    Kapalıyken her şey telefonda olur: ekran cihaz üstünde okunur, hiçbir şey gönderilmez. \
                    Açıkken klavyedeki ✨ düğmesine bastığınızda o anki ekran görüntüsü Claude'a gönderilir. \
                    Profil değerleriniz gönderilmez; ama ekranda görünen her şey görüntüde yer alır.
                    """)
                }

                Section {
                    SecureField("sk-ant-…", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(saved ? "Kaydedildi" : "Anahtarı kaydet") {
                        saved = Keychain.saveAPIKey(apiKey)
                    }
                } header: {
                    Text("Claude API anahtarı")
                } footer: {
                    Text("Anahtar yalnızca bu cihazın anahtar zincirinde durur. Model: \(AppConfig.claudeModel)")
                }

                Section("Sınırlar") {
                    Text("iOS başka uygulamalara dokunmaya izin vermez. Doldur bu yüzden alanlara klavye ile yazar; alanlar arası geçişi siz yaparsınız.")
                    Text("Şifre ve telefon tuş takımı alanlarında iOS özel klavyeyi kapatır. Önceki alandayken öneriyi uzun basıp kopyalayın, sonra yapıştırın.")
                }
                .font(.callout)
                .foregroundStyle(.secondary)
            }
            .navigationTitle("Ayarlar")
        }
    }
}
