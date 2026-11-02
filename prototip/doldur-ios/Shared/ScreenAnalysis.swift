import Foundation

/// Ekranda görülen bir form alanı.
struct DetectedField: Codable, Hashable {
    /// Ekranda yazan etiket ("Teslimat adresi").
    var label: String
    /// Eşleşen profil alanı; yoksa nil.
    var profileKey: String?
    /// Profilde karşılığı olmayan serbest metin alanı için Claude'un önerdiği taslak ("Açıklama" vb.).
    var draftText: String?
    /// İmlecin bulunduğu alan (yalnızca akıllı analizde bilinir).
    var isFocused: Bool = false
    /// Ekrandaki dikey konum (0 = üst, 1 = alt); sıralama için.
    var y: Double = 0
}

struct ScreenAnalysis: Codable, Hashable {
    enum Source: String, Codable {
        /// Cihaz üstü metin tanıma + kural tabanlı eşleştirme. Hiçbir veri telefondan çıkmaz.
        case local
        /// Ekran görüntüsü Claude'a gönderildi (profil değerleri gönderilmez).
        case claude
    }

    var timestamp: Date
    var source: Source
    var screenTitle: String?
    var fields: [DetectedField]

    var isFresh: Bool { Date().timeIntervalSince(timestamp) < AppConfig.analysisFreshness }

    /// Değişiklik algılamak için kısa imza.
    var signature: String {
        fields.map { "\($0.label)|\($0.profileKey ?? "-")" }.joined(separator: ";")
    }
}
