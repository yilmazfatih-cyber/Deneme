import SwiftUI

/// Uygulama içinde klavyeyi denemek için örnek bir kargo formu.
/// Bazı alanlarda bilerek `textContentType` yok: o alanları ajan yalnızca ekranda okuyarak tanır.
struct DemoFormView: View {
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var address = ""
    @State private var city = ""
    @State private var district = ""
    @State private var postalCode = ""
    @State private var tckn = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Alıcı") {
                    labeled("Ad Soyad") { TextField("", text: $name).textContentType(.name) }
                    labeled("E-posta") {
                        TextField("", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                    }
                    // Not: .phonePad klavyesinde iOS özel klavyelere izin vermez; bu yüzden varsayılan klavye.
                    labeled("Cep telefonu") { TextField("", text: $phone).textContentType(.telephoneNumber) }
                    // İpucu yok: ajan bu alanı ekrandaki "T.C. Kimlik No" yazısından tanımalı.
                    labeled("T.C. Kimlik No") { TextField("", text: $tckn) }
                }
                Section("Teslimat adresi") {
                    labeled("Açık adres") { TextField("", text: $address, axis: .vertical) }
                    labeled("İl") { TextField("", text: $city) }
                    labeled("İlçe") { TextField("", text: $district) }
                    labeled("Posta kodu") { TextField("", text: $postalCode).textContentType(.postalCode) }
                }
                Section("Teslimat notu") {
                    TextField("Kuryeye not", text: $note, axis: .vertical)
                }
                Section {
                    Button("Formu temizle", role: .destructive) {
                        name = ""; email = ""; phone = ""; address = ""; city = ""
                        district = ""; postalCode = ""; tckn = ""; note = ""
                    }
                }
            }
            .navigationTitle("Kargo gönderimi")
        }
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }
}
