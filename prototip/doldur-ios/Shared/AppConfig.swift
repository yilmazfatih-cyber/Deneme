import Foundation

/// Uygulama ve üç uzantının ortak sabitleri. Bundle kimliklerini değiştirirseniz `project.yml` ile birlikte değiştirin.
enum AppConfig {
    static let appGroup = "group.com.ornek.doldur"
    static let broadcastExtensionID = "com.ornek.doldur.broadcast"

    /// Akıllı analizde kullanılan Claude modeli.
    static let claudeModel = "claude-opus-5-5"

    /// Yerel (cihaz üstü) ekran okuma en fazla bu sıklıkta çalışır.
    static let localAnalysisInterval: TimeInterval = 1.0

    /// Bu süreden eski ekran analizi klavyede "ekranda görülen" olarak kullanılmaz.
    static let analysisFreshness: TimeInterval = 30

    /// Uzantılar arası anlık haber (Darwin bildirimleri).
    enum Notice {
        static let analysisUpdated = "com.ornek.doldur.analysisUpdated"
        static let smartAnalysisRequested = "com.ornek.doldur.smartAnalysisRequested"
        static let profileUpdated = "com.ornek.doldur.profileUpdated"
    }
}
