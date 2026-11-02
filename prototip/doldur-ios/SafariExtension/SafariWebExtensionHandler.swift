import SafariServices

/// Safari uzantısının JavaScript tarafına profili verir (yerel mesajlaşma).
/// Sayfaya yalnızca değeri dolu alanlar gider; veri ağ üzerinden hiçbir yere taşınmaz.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any]

        var payload: [String: Any] = [:]
        if message?["type"] as? String == "getProfile" {
            let fields = SharedStore.shared.loadProfile().fields.filter { !$0.value.isEmpty }
            payload["fields"] = fields.map { field in
                [
                    "key": field.key,
                    "label": field.label,
                    "value": field.value,
                    "synonyms": field.synonyms,
                    "autocomplete": field.autocomplete,
                ] as [String: Any]
            }
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: payload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
