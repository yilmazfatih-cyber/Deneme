import CoreGraphics
import Foundation

/// Cihaz üstü metin tanımadan gelen bir satır. `box` Vision koordinatlarındadır (0…1, orijin sol alt).
struct OCRLine: Hashable {
    let text: String
    let box: CGRect
}

/// Kural tabanlı eşleştirici: ekrandaki etiketleri ve odaklı alanın türünü profil alanlarına bağlar.
/// Bulut gerektirmez; akıllı analiz kapalıyken ajanın tamamı bununla çalışır.
enum FieldMatcher {
    private static let turkish = Locale(identifier: "tr_TR")

    /// "Adınız Soyadınız *:" → "adiniz soyadiniz". Türkçe harfler sadeleştirilir; OCR'ın ı/i karışıklığı tolere edilir.
    static func normalize(_ text: String) -> String {
        let lowered = text.lowercased(with: turkish).replacingOccurrences(of: "ı", with: "i")
        let folded = lowered.folding(options: [.diacriticInsensitive], locale: turkish)
        let cleaned = folded.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? Character($0) : " " }
        return String(cleaned).split(separator: " ").joined(separator: " ")
    }

    private static func tokens(_ text: String) -> [Substring] {
        normalize(text).split(separator: " ")
    }

    /// Bir etiket metninin bir profil alanına uyma puanı (0…1).
    static func score(label: String, field: ProfileField) -> Double {
        let labelTokens = tokens(label)
        guard !labelTokens.isEmpty, labelTokens.count <= 6 else { return 0 }
        var best = 0.0
        for synonym in field.synonyms {
            let synTokens = tokens(synonym)
            guard !synTokens.isEmpty else { continue }
            if labelTokens == synTokens {
                return 1.0
            } else if labelTokens.starts(with: synTokens) {
                best = max(best, 0.9)
            } else if containsSequence(labelTokens, synTokens) {
                best = max(best, 0.8)
            }
        }
        return best
    }

    private static func containsSequence(_ hay: [Substring], _ needle: [Substring]) -> Bool {
        guard needle.count <= hay.count else { return false }
        for start in 0...(hay.count - needle.count) where Array(hay[start..<(start + needle.count)]) == needle {
            return true
        }
        return false
    }

    /// Ekran satırlarından form alanı etiketlerini bulur. Aynı profil alanı birden çok kez görünebilir
    /// (ör. teslimat ve fatura adresi); hepsi korunur.
    static func match(lines: [OCRLine], profile: Profile) -> [DetectedField] {
        var result: [DetectedField] = []
        for line in lines {
            let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count <= 40 else { continue } // Etiketler kısadır; paragrafları atla.
            var bestKey: String?
            var bestScore = 0.0
            for field in profile.fields {
                let s = score(label: text, field: field)
                if s > bestScore { bestScore = s; bestKey = field.key }
            }
            guard bestScore >= 0.8, let key = bestKey else { continue }
            let y = 1 - line.box.midY // Vision orijini alttadır; üstten alta sırala.
            result.append(DetectedField(label: text, profileKey: key, y: y))
        }
        return result.sorted { $0.y < $1.y }
    }

    /// Odaklı metin alanının iOS ipuçlarından profil alanı çıkarır (`UITextContentType` ham değeri).
    static func profileKey(contentType: String?, isEmailKeyboard: Bool, profile: Profile) -> String? {
        if let contentType, let field = profile.fields.first(where: { $0.contentTypes.contains(contentType) }) {
            return field.key
        }
        if isEmailKeyboard { return "eposta" }
        return nil
    }
}
