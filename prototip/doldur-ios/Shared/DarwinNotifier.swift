import Foundation

/// Uygulama ve uzantılar arasında yük taşımayan anlık sinyaller (Darwin bildirim merkezi).
/// Veri `SharedStore` üzerinden okunur; bildirim yalnızca "yeni veri var" der.
enum DarwinNotifier {
    private final class Token {}
    private static let token = Token()
    private static var observer: UnsafeRawPointer { UnsafeRawPointer(Unmanaged.passUnretained(token).toOpaque()) }
    private static var handlers: [String: () -> Void] = [:]
    private static let lock = NSLock()
    private static var center: CFNotificationCenter { CFNotificationCenterGetDarwinNotifyCenter() }

    static func post(_ name: String) {
        CFNotificationCenterPostNotification(center, CFNotificationName(name as CFString), nil, nil, true)
    }

    /// Aynı ad için yeniden çağrılırsa önceki işleyicinin yerine geçer. İşleyici rastgele bir iş parçacığında çalışır.
    static func observe(_ name: String, handler: @escaping () -> Void) {
        lock.lock()
        let isNew = handlers[name] == nil
        handlers[name] = handler
        lock.unlock()
        guard isNew else { return }
        CFNotificationCenterAddObserver(center, observer, { _, _, cfName, _, _ in
            guard let cfName else { return }
            DarwinNotifier.dispatch(cfName.rawValue as String)
        }, name as CFString, nil, .deliverImmediately)
    }

    static func removeAll() {
        lock.lock()
        handlers.removeAll()
        lock.unlock()
        CFNotificationCenterRemoveEveryObserver(center, observer)
    }

    private static func dispatch(_ name: String) {
        lock.lock()
        let handler = handlers[name]
        lock.unlock()
        handler?()
    }
}
