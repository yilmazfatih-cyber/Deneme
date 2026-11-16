// Apple'ın Combine çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).

public final class ObservableObjectPublisher: @unchecked Sendable {
    public init() {}
    public func send() {}
}

public protocol ObservableObject: AnyObject {
    associatedtype ObjectWillChangePublisher = ObservableObjectPublisher
    var objectWillChange: Self.ObjectWillChangePublisher { get }
}

extension ObservableObject where Self.ObjectWillChangePublisher == ObservableObjectPublisher {
    public var objectWillChange: ObservableObjectPublisher { ObservableObjectPublisher() }
}

@propertyWrapper
public struct Published<Value> {
    private final class Kutu {
        var deger: Value
        init(_ deger: Value) { self.deger = deger }
    }

    private let kutu: Kutu

    public init(wrappedValue: Value) { kutu = Kutu(wrappedValue) }
    public init(initialValue: Value) { kutu = Kutu(initialValue) }

    @available(*, unavailable, message: "@Published yalnızca sınıfların özelliklerinde kullanılabilir")
    public var wrappedValue: Value {
        get { fatalError() }
        set { fatalError() }
    }

    public static subscript<EnclosingSelf: AnyObject>(
        _enclosingInstance object: EnclosingSelf,
        wrapped wrappedKeyPath: ReferenceWritableKeyPath<EnclosingSelf, Value>,
        storage storageKeyPath: ReferenceWritableKeyPath<EnclosingSelf, Published<Value>>
    ) -> Value {
        get { object[keyPath: storageKeyPath].kutu.deger }
        set { object[keyPath: storageKeyPath].kutu.deger = newValue }
    }

    public struct Publisher {}

    public var projectedValue: Publisher {
        mutating get { Publisher() }
        set {}
    }
}
