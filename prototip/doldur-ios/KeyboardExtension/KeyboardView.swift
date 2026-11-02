import SwiftUI

/// Klavye arayüzü: üstte durum, ortada "bu alan için" büyük öneri, altında diğer öneriler, en altta temel tuşlar.
struct KeyboardView: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            statusBar
            if !model.hasFullAccess {
                fullAccessHelp
            } else if let primary = model.primary {
                primaryButton(primary)
                suggestionGrid
            } else {
                emptyProfileHelp
            }
            bottomRow
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGray6))
    }

    // MARK: Parçalar

    private var statusBar: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(model.agentActive ? Color.green : Color.secondary.opacity(0.5))
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)
            Text(model.agentActive ? (model.screenTitle ?? model.statusText) : "Ajan kapalı · yalnız profil")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer()
            Button {
                model.requestSmartAnalysis()
            } label: {
                if model.isAnalyzing {
                    ProgressView().controlSize(.small)
                } else {
                    Label("Akıllı analiz", systemImage: "sparkles").font(.footnote.weight(.semibold))
                }
            }
            .disabled(!model.agentActive || model.isAnalyzing)
            .accessibilityHint("Ekranı Claude'a inceletir")
        }
        .frame(height: 28)
    }

    private func primaryButton(_ suggestion: Suggestion) -> some View {
        Button {
            model.insert(suggestion)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(suggestion.reason.rawValue) · \(suggestion.title)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    Text(suggestion.preview)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "arrow.down.to.line")
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor))
        }
        .buttonStyle(.plain)
        .contextMenu { copyButton(suggestion) }
        .accessibilityLabel("\(suggestion.title): \(suggestion.preview). Alana yaz.")
    }

    private var suggestionGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(model.others) { suggestion in
                    Button {
                        model.insert(suggestion)
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(suggestion.title)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(suggestion.reason == .profile ? Color.secondary : Color.accentColor)
                            Text(suggestion.preview)
                                .font(.footnote)
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color(uiColor: .systemBackground)))
                    }
                    .buttonStyle(.plain)
                    .contextMenu { copyButton(suggestion) }
                    .accessibilityLabel("\(suggestion.title): \(suggestion.preview)")
                }
            }
        }
    }

    /// Özel klavyenin açılamadığı alanlar (şifre, telefon tuş takımı) için: kopyala, sonra yapıştır.
    private func copyButton(_ suggestion: Suggestion) -> some View {
        Button {
            model.actions.copy(suggestion.text)
        } label: {
            Label("Kopyala", systemImage: "doc.on.doc")
        }
    }

    private var bottomRow: some View {
        HStack(spacing: 6) {
            if model.needsSwitchKey {
                key(systemImage: "globe", label: "Sonraki klavye") { model.actions.nextKeyboard() }
            }
            key(systemImage: "xmark.circle", label: "Alanı temizle") { model.actions.clearField() }
            Button {
                model.actions.insert(" ")
            } label: {
                Text("boşluk")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color(uiColor: .systemBackground)))
            }
            .buttonStyle(.plain)
            key(systemImage: "delete.left", label: "Sil") { model.actions.deleteBackward() }
            key(systemImage: "return", label: "Enter") { model.actions.insert("\n") }
        }
    }

    private func key(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .frame(width: 48, height: 44)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(uiColor: .systemGray4)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var fullAccessHelp: some View {
        helpText("Önerileri görmek için Ayarlar › Genel › Klavye › Doldur Klavye › Tam Erişim'i açın.")
    }

    private var emptyProfileHelp: some View {
        helpText("Profil boş. Doldur uygulamasında bilgilerinizi bir kez girin.")
    }

    private func helpText(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
