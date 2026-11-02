import Foundation

/// Uygulama ile uzantıların ortak deposu (App Group kapsayıcısı).
/// Profil ve son ekran analizi JSON dosyası olarak, küçük ayarlar `UserDefaults` içinde tutulur.
final class SharedStore {
    static let shared = SharedStore()

    private let defaults: UserDefaults
    private let containerURL: URL

    private init() {
        defaults = UserDefaults(suiteName: AppConfig.appGroup) ?? .standard
        containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppConfig.appGroup)
            ?? FileManager.default.temporaryDirectory
    }

    // MARK: Profil

    func loadProfile() -> Profile {
        guard var profile: Profile = read("profile.json") else { return .template }
        // Şablona sonradan eklenen alanları mevcut profile kat.
        for field in Profile.template.fields where profile.field(field.key) == nil {
            profile.fields.append(field)
        }
        return profile
    }

    func saveProfile(_ profile: Profile) {
        write(profile, to: "profile.json")
        DarwinNotifier.post(AppConfig.Notice.profileUpdated)
    }

    // MARK: Ekran analizi

    func loadAnalysis() -> ScreenAnalysis? { read("analysis.json") }

    func saveAnalysis(_ analysis: ScreenAnalysis) {
        write(analysis, to: "analysis.json")
        DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
    }

    // MARK: Ajan durumu ve ayarlar

    var agentActive: Bool {
        get { defaults.bool(forKey: "agentActive") }
        set { defaults.set(newValue, forKey: "agentActive") }
    }

    /// Ajanın son durumu, kullanıcıya gösterilir ("Ekran okunuyor", "Claude inceliyor"…).
    var agentStatus: String {
        get { defaults.string(forKey: "agentStatus") ?? "Kapalı" }
        set { defaults.set(newValue, forKey: "agentStatus") }
    }

    /// Akıllı analiz (Claude) açık mı? Varsayılan kapalı: kullanıcı açıkça izin vermeli.
    var smartAnalysisEnabled: Bool {
        get { defaults.bool(forKey: "smartAnalysisEnabled") }
        set { defaults.set(newValue, forKey: "smartAnalysisEnabled") }
    }

    // MARK: Dosya yardımcıları

    private func read<T: Decodable>(_ name: String) -> T? {
        let url = containerURL.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, to name: String) {
        let url = containerURL.appendingPathComponent(name)
        guard let data = try? JSONEncoder().encode(value) else { return }
        // Klavye ve yayın uzantısı kilit ekranından sonra da okuyabilsin diye "ilk kilit açılışına kadar" koruma.
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
