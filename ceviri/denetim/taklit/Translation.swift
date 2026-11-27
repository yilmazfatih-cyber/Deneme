// Apple'ın Translation çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).
// Bildirimler Apple belgelerinden alınmıştır (developer.apple.com/documentation/translation).

@_exported import Foundation
import SwiftUI

public class TranslationSession {
    public struct Configuration: Equatable {
        public var source: Locale.Language?
        public var target: Locale.Language?
        public var version: Int = 0

        public init(source: Locale.Language? = nil, target: Locale.Language? = nil) {
            self.source = source
            self.target = target
        }

        public mutating func invalidate() { version += 1 }
    }

    public struct Response: Sendable {
        public let sourceLanguage: Locale.Language
        public let targetLanguage: Locale.Language
        public let sourceText: String
        public let targetText: String
        public let clientIdentifier: String?
    }

    public let sourceLanguage: Locale.Language? = nil
    public let targetLanguage: Locale.Language? = nil
    public var canRequestDownloads: Bool { true }
    public var isReady: Bool { true }

    init() {}

    public func prepareTranslation() async throws {}
    public func translate(_ string: String) async throws -> TranslationSession.Response { fatalError() }
    public func cancel() {}
}

public class LanguageAvailability {
    public enum Status: Hashable, Sendable {
        case installed
        case supported
        case unsupported
    }

    public init() {}

    public var supportedLanguages: [Locale.Language] {
        get async { [] }
    }

    public func status(from source: Locale.Language, to target: Locale.Language?) async -> LanguageAvailability.Status { .supported }
}

extension View {
    nonisolated public func translationTask(
        _ configuration: TranslationSession.Configuration?,
        action: @escaping (TranslationSession) async -> Void
    ) -> some View { _D<Self>() }
}
