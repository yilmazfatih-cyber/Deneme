// Apple'ın UIKit çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).

@_exported import Foundation
// Linux'ta URLSession ayrı bir modüldedir; Apple platformlarında Foundation'ın içindedir.
#if canImport(FoundationNetworking)
@_exported import FoundationNetworking
#endif

@MainActor
open class UIApplication: NSObject {
    public struct OpenExternalURLOptionsKey: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
    }

    open class var shared: UIApplication { UIApplication() }
    nonisolated public class var openSettingsURLString: String { "app-settings:" }

    open var isIdleTimerDisabled: Bool = false

    open func open(
        _ url: URL,
        options: [UIApplication.OpenExternalURLOptionsKey: Any] = [:],
        completionHandler completion: (@MainActor @Sendable (Bool) -> Void)? = nil
    ) {}
}
