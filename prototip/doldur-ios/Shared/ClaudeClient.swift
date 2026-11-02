import Foundation

/// Akıllı analiz: ekran görüntüsünü Claude'a gönderip form alanlarını yapılandırılmış JSON olarak alır.
///
/// Gizlilik kuralı: Claude'a **profil değerleri gönderilmez**; yalnızca alan anahtarları ve adları gider.
/// Claude "bu kutu = eposta" der, değeri klavye cihazda yerleştirir.
/// Swift için resmi Anthropic SDK olmadığından Messages API'ye doğrudan HTTP ile gidilir.
struct ClaudeClient {
    let apiKey: String
    var model: String = AppConfig.claudeModel

    enum ClaudeError: LocalizedError {
        case http(Int, String)
        case refusal(String?)
        case badResponse

        var errorDescription: String? {
            switch self {
            case let .http(code, body): return "Claude yanıt vermedi (\(code)). \(body.prefix(200))"
            case let .refusal(reason): return "Claude bu ekranı incelemedi. \(reason ?? "")"
            case .badResponse: return "Claude yanıtı okunamadı."
            }
        }
    }

    func analyzeScreen(jpeg: Data, profile: Profile) async throws -> ScreenAnalysis {
        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        // Güvenlik sınıflandırıcısı reddederse sunucu tarafında önerilen modele düşülür.
        request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONSerialization.data(withJSONObject: body(jpeg: jpeg, profile: profile))

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw ClaudeError.http(status, String(data: data, encoding: .utf8) ?? "")
        }

        let message = try JSONDecoder().decode(MessageResponse.self, from: data)
        if message.stop_reason == "refusal" {
            throw ClaudeError.refusal(message.stop_details?.explanation)
        }
        guard let text = message.content.first(where: { $0.type == "text" })?.text,
              let json = text.data(using: .utf8),
              let result = try? JSONDecoder().decode(FormResult.self, from: json)
        else { throw ClaudeError.badResponse }

        let knownKeys = Set(profile.fields.map(\.key))
        let fields = result.fields.map { item in
            DetectedField(
                label: item.label,
                profileKey: knownKeys.contains(item.profileKey) ? item.profileKey : nil,
                draftText: item.draftText.isEmpty ? nil : item.draftText,
                isFocused: item.focused,
                y: item.y
            )
        }
        return ScreenAnalysis(timestamp: Date(), source: .claude, screenTitle: result.screenTitle, fields: fields)
    }

    // MARK: İstek gövdesi

    private func body(jpeg: Data, profile: Profile) -> [String: Any] {
        let keyList = profile.fields
            .map { "- \($0.key): \($0.label)" }
            .joined(separator: "\n")
        let userText = """
        Kullanıcının profilinde şu alanlar var (değerler sende değil, yalnızca anahtarlar):
        \(keyList)

        Ekrandaki her doldurulabilir alanı listele.
        """
        return [
            "model": model,
            "max_tokens": 8000,
            "fallbacks": "default",
            "output_config": [
                // Gerçek zamanlı kullanım: düşük çaba yeterli ve hızlı.
                "effort": "low",
                "format": ["type": "json_schema", "schema": Self.schema],
            ],
            "system": Self.systemPrompt,
            "messages": [[
                "role": "user",
                "content": [
                    ["type": "image",
                     "source": ["type": "base64", "media_type": "image/jpeg", "data": jpeg.base64EncodedString()]],
                    ["type": "text", "text": userText],
                ],
            ]],
        ]
    }

    private static let systemPrompt = """
    Bir iPhone ekran görüntüsündeki formu doldurmaya yardım ediyorsun. Görevin yalnızca alanları tanımak; \
    hiçbir yere dokunmuyorsun, değerleri kullanıcının klavyesi cihazda yerleştiriyor.

    Her görünür giriş alanı için:
    - label: alanın ekranda yazan etiketi veya yer tutucu metni, olduğu gibi.
    - profileKey: listedeki en uygun profil anahtarı; emin değilsen boş dize. Anahtar uydurma.
    - draftText: alan profilde karşılığı olmayan serbest metinse (açıklama, not, mesaj) ekrandaki bağlama uygun \
    kısa bir Türkçe taslak; aksi hâlde boş dize. Taslakta kişisel veri (isim, numara, adres) uydurma.
    - focused: imlecin bulunduğu veya vurgulanmış alan için true. En fazla bir alan true olabilir.
    - y: alanın ekrandaki dikey konumu, 0 (üst) ile 1 (alt) arası.

    screenTitle: ekranın veya uygulamanın kısa adı. Ekranda form yoksa boş liste döndür.
    """

    private static let schema: [String: Any] = [
        "type": "object",
        "additionalProperties": false,
        "required": ["screenTitle", "fields"],
        "properties": [
            "screenTitle": ["type": "string"],
            "fields": [
                "type": "array",
                "items": [
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["label", "profileKey", "draftText", "focused", "y"],
                    "properties": [
                        "label": ["type": "string"],
                        "profileKey": ["type": "string"],
                        "draftText": ["type": "string"],
                        "focused": ["type": "boolean"],
                        "y": ["type": "number"],
                    ],
                ],
            ],
        ],
    ]

    // MARK: Yanıt modelleri

    private struct MessageResponse: Decodable {
        struct Block: Decodable { let type: String; let text: String? }
        struct StopDetails: Decodable { let explanation: String? }
        let content: [Block]
        let stop_reason: String?
        let stop_details: StopDetails?
    }

    private struct FormResult: Decodable {
        struct Item: Decodable {
            let label: String
            let profileKey: String
            let draftText: String
            let focused: Bool
            let y: Double
        }
        let screenTitle: String
        let fields: [Item]
    }
}
