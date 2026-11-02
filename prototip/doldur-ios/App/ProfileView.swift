import SwiftUI

/// Kullanıcının kendi bilgileri. Yalnızca bu telefonda, uygulama grubunun şifreli kapsayıcısında durur.
struct ProfileView: View {
    @State private var profile = SharedStore.shared.loadProfile()
    @State private var newFieldLabel = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($profile.fields) { $field in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 4) {
                                Text(field.label).font(.footnote.weight(.semibold))
                                if field.isSensitive {
                                    Image(systemName: "lock.fill").font(.caption2)
                                        .accessibilityLabel("Hassas")
                                }
                            }
                            .foregroundStyle(.secondary)
                            TextField(field.label, text: $field.value, axis: field.key == "adres" ? .vertical : .horizontal)
                                .textInputAutocapitalization(field.key == "eposta" ? .never : .words)
                                .autocorrectionDisabled()
                        }
                        .padding(.vertical, 2)
                    }
                    .onDelete { offsets in
                        profile.fields.remove(atOffsets: offsets)
                    }
                } footer: {
                    Text("🔒 işaretli alanlar klavyede maskeli görünür. Hiçbir değer buluta gönderilmez.")
                }

                Section("Yeni alan") {
                    HStack {
                        TextField("ör. Sicil no", text: $newFieldLabel)
                        Button("Ekle", action: addField)
                            .disabled(newFieldLabel.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle("Profilim")
            .onChange(of: profile) { _, newValue in
                SharedStore.shared.saveProfile(newValue)
            }
        }
    }

    private func addField() {
        let label = newFieldLabel.trimmingCharacters(in: .whitespaces)
        let key = "ozel_" + FieldMatcher.normalize(label).replacingOccurrences(of: " ", with: "_")
        guard profile.field(key) == nil else { return }
        profile.fields.append(ProfileField(key: key, label: label, value: "", synonyms: [FieldMatcher.normalize(label)]))
        newFieldLabel = ""
    }
}
