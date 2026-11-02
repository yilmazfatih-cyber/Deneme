import ReplayKit
import SwiftUI

/// Ana ekran: ajanı başlat/durdur, ajanın şu an ne gördüğünü göster, kurulum adımlarını listele.
struct AgentView: View {
    @State private var agentActive = SharedStore.shared.agentActive
    @State private var status = SharedStore.shared.agentStatus
    @State private var analysis = SharedStore.shared.loadAnalysis()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(agentActive ? Color.green : Color.secondary.opacity(0.4))
                                .frame(width: 14, height: 14)
                            Text(agentActive ? "Ajan ekranı izliyor" : "Ajan kapalı")
                                .font(.title3.weight(.semibold))
                        }
                        Text(agentActive ? status : "Başlatınca ekran kaydı simgesi kırmızı yanar. Durdurmak için ona dokunun.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        BroadcastButton(isActive: agentActive)
                            .frame(maxWidth: .infinity, minHeight: 56)
                    }
                    .padding(.vertical, 6)
                }

                Section("Ajanın gördüğü") {
                    if let analysis, analysis.isFresh, !analysis.fields.isEmpty {
                        if let title = analysis.screenTitle, !title.isEmpty {
                            Text(title).font(.headline)
                        }
                        ForEach(Array(analysis.fields.enumerated()), id: \.offset) { _, field in
                            HStack {
                                Text(field.label)
                                Spacer()
                                Text(fieldTarget(field))
                                    .foregroundStyle(.secondary)
                                if field.isFocused {
                                    Image(systemName: "character.cursor.ibeam").foregroundStyle(.tint)
                                }
                            }
                        }
                        Text(analysis.source == .claude ? "Kaynak: Claude (akıllı analiz)" : "Kaynak: cihaz üstü okuma")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Henüz form alanı görülmedi.").foregroundStyle(.secondary)
                    }
                }

                Section("Nasıl çalışır?") {
                    step(1, "Profil sekmesinde bilgilerinizi bir kez girin.")
                    step(2, "Ayarlar › Genel › Klavye › Klavyeler › Yeni Klavye Ekle › Doldur Klavye. Tam Erişim'i açın.")
                    step(3, "Ajanı başlatın. Herhangi bir uygulamada form açın.")
                    step(4, "Bir alana dokunun, 🌐 ile Doldur Klavye'ye geçin, öneriye tek dokunun.")
                    step(5, "Safari'deki formlar için: Safari › Uzantılar › Doldur Safari › Formu doldur.")
                    Button("Ayarlar uygulamasını aç") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                }
            }
            .navigationTitle("Doldur")
            .onReceive(ticker) { _ in refresh() }
        }
    }

    private func refresh() {
        let store = SharedStore.shared
        agentActive = store.agentActive
        status = store.agentStatus
        analysis = store.loadAnalysis()
    }

    private func fieldTarget(_ field: DetectedField) -> String {
        if let key = field.profileKey, let label = SharedStore.shared.loadProfile().field(key)?.label {
            return "→ \(label)"
        }
        return field.draftText == nil ? "eşleşme yok" : "→ taslak"
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)")
                .font(.footnote.weight(.bold))
                .frame(width: 24, height: 24)
                .background(Circle().fill(Color.accentColor.opacity(0.15)))
            Text(text).font(.callout)
        }
    }
}

/// Sistem yayın seçicisini (RPSystemBroadcastPickerView) büyük ve okunur bir düğmenin arkasına saklar.
/// iOS, ekran kaydını yalnızca kullanıcının bu sistem düğmesiyle başlatmasına izin verir.
struct BroadcastButton: UIViewRepresentable {
    var isActive: Bool

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        let picker = RPSystemBroadcastPickerView(frame: .zero)
        picker.preferredExtension = AppConfig.broadcastExtensionID
        picker.showsMicrophoneButton = false
        picker.alpha = 0.011 // Görünmez ama dokunulabilir kalmalı.
        picker.translatesAutoresizingMaskIntoConstraints = false

        let button = UIButton(configuration: .filled())
        button.translatesAutoresizingMaskIntoConstraints = false
        button.isUserInteractionEnabled = false // Dokunuşu üstteki seçici alır.
        button.tag = 1

        container.addSubview(button)
        container.addSubview(picker)
        for view in [button, picker] {
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                view.topAnchor.constraint(equalTo: container.topAnchor),
                view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])
        }
        // Seçicinin iç düğmesini tüm alana yay.
        picker.subviews.compactMap { $0 as? UIButton }.forEach { inner in
            inner.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                inner.leadingAnchor.constraint(equalTo: picker.leadingAnchor),
                inner.trailingAnchor.constraint(equalTo: picker.trailingAnchor),
                inner.topAnchor.constraint(equalTo: picker.topAnchor),
                inner.bottomAnchor.constraint(equalTo: picker.bottomAnchor),
            ])
        }
        container.isAccessibilityElement = true
        container.accessibilityTraits = .button
        update(container)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) { update(uiView) }

    private func update(_ container: UIView) {
        guard let button = container.viewWithTag(1) as? UIButton else { return }
        var config = UIButton.Configuration.filled()
        config.title = isActive ? "Ajanı durdur" : "Ajanı başlat"
        config.image = UIImage(systemName: isActive ? "stop.circle.fill" : "record.circle")
        config.imagePadding = 8
        config.baseBackgroundColor = isActive ? .systemGray : .tintColor
        config.cornerStyle = .large
        button.configuration = config
        container.accessibilityLabel = config.title
    }
}
