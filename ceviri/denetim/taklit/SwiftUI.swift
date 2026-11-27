// Apple'ın SwiftUI çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).
// İmzalar ve aktör yalıtımı iOS 18 SDK'sındaki bildirimlere göre yazılmıştır; gövdeler boştur.

@_exported import Combine
@_exported import Foundation

// MARK: - Temel protokoller

@MainActor @preconcurrency
public protocol View {
    associatedtype Body: View
    @ViewBuilder @MainActor @preconcurrency var body: Self.Body { get }
}

@MainActor @preconcurrency
public protocol Scene {
    associatedtype Body: Scene
    @SceneBuilder @MainActor @preconcurrency var body: Self.Body { get }
}

@MainActor @preconcurrency
public protocol App {
    associatedtype Body: Scene
    @SceneBuilder @MainActor @preconcurrency var body: Self.Body { get }
    @MainActor @preconcurrency init()
}

extension App {
    @MainActor @preconcurrency public static func main() {}
}

extension Never: View, Scene {
    public var body: Never { return fatalError() }
}

public protocol _Ilkel: View where Body == Never {}
extension _Ilkel {
    public var body: Never { return fatalError() }
}

/// Bir değiştiricinin döndürdüğü görünüm.
public struct _D<Icerik>: _Ilkel {
    nonisolated public init() {}
}

public struct EmptyView: _Ilkel {
    nonisolated public init() {}
}

public struct AnyView: _Ilkel {
    nonisolated public init<V: View>(_ view: V) {}
}

public struct TupleView<T>: _Ilkel {
    nonisolated public init(_ value: T) {}
}

public struct _ConditionalContent<TrueContent: View, FalseContent: View>: _Ilkel {
    nonisolated init() {}
}

extension Optional: View where Wrapped: View {
    public typealias Body = Never
    public var body: Never { return fatalError() }
}

@resultBuilder
public struct ViewBuilder {
    public static func buildExpression<Content: View>(_ content: Content) -> Content { content }
    public static func buildBlock() -> EmptyView { EmptyView() }
    public static func buildBlock<Content: View>(_ content: Content) -> Content { content }
    public static func buildBlock<each Content: View>(_ content: repeat each Content) -> TupleView<(repeat each Content)> {
        TupleView((repeat each content))
    }
    public static func buildIf<Content: View>(_ content: Content?) -> Content? { content }
    public static func buildEither<TrueContent: View, FalseContent: View>(first: TrueContent) -> _ConditionalContent<TrueContent, FalseContent> {
        _ConditionalContent()
    }
    public static func buildEither<TrueContent: View, FalseContent: View>(second: FalseContent) -> _ConditionalContent<TrueContent, FalseContent> {
        _ConditionalContent()
    }
    public static func buildLimitedAvailability<Content: View>(_ content: Content) -> AnyView { AnyView(content) }
}

@resultBuilder
public struct SceneBuilder {
    public static func buildBlock<Content: Scene>(_ content: Content) -> Content { content }
}

public struct WindowGroup<Content: View>: Scene {
    public typealias Body = Never
    public var body: Never { return fatalError() }
    nonisolated public init(@ViewBuilder content: () -> Content) {}
}

// MARK: - Durum sarmalayıcıları

public protocol DynamicProperty {}

@propertyWrapper
public struct State<Value>: DynamicProperty {
    public init(wrappedValue value: Value) {}
    public init(initialValue value: Value) {}
    public var wrappedValue: Value {
        get { fatalError() }
        nonmutating set {}
    }
    public var projectedValue: Binding<Value> { fatalError() }
}

@propertyWrapper @dynamicMemberLookup
public struct Binding<Value> {
    public init(get: @escaping () -> Value, set: @escaping (Value) -> Void) {}
    public var wrappedValue: Value {
        get { fatalError() }
        nonmutating set {}
    }
    public var projectedValue: Binding<Value> { self }
    public static func constant(_ value: Value) -> Binding<Value> { fatalError() }
    public subscript<Subject>(dynamicMember keyPath: WritableKeyPath<Value, Subject>) -> Binding<Subject> { fatalError() }
}

@propertyWrapper
public struct ObservedObject<ObjectType: ObservableObject>: DynamicProperty {
    @dynamicMemberLookup
    public struct Wrapper {
        public subscript<Subject>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, Subject>) -> Binding<Subject> {
            fatalError()
        }
    }

    public init(wrappedValue: ObjectType) {}
    public init(initialValue: ObjectType) {}
    @MainActor @preconcurrency public var wrappedValue: ObjectType {
        get { fatalError() }
        set {}
    }
    @MainActor @preconcurrency public var projectedValue: Wrapper { fatalError() }
}

@propertyWrapper
public struct StateObject<ObjectType: ObservableObject>: DynamicProperty {
    nonisolated public init(wrappedValue thunk: @autoclosure @escaping () -> ObjectType) {}
    @MainActor @preconcurrency public var wrappedValue: ObjectType { fatalError() }
    @MainActor @preconcurrency public var projectedValue: ObservedObject<ObjectType>.Wrapper { fatalError() }
}

@propertyWrapper
public struct EnvironmentObject<ObjectType: ObservableObject>: DynamicProperty {
    @dynamicMemberLookup
    public struct Wrapper {
        public subscript<Subject>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, Subject>) -> Binding<Subject> {
            fatalError()
        }
    }

    public init() {}
    @MainActor @preconcurrency public var wrappedValue: ObjectType { fatalError() }
    @MainActor @preconcurrency public var projectedValue: Wrapper { fatalError() }
}

public struct EnvironmentValues {
    public var scenePhase: ScenePhase { fatalError() }
}

@propertyWrapper
public struct Environment<Value>: DynamicProperty {
    public init(_ keyPath: KeyPath<EnvironmentValues, Value>) {}
    public var wrappedValue: Value { fatalError() }
}

@propertyWrapper
public struct Namespace: DynamicProperty {
    public struct ID: Hashable, Sendable {}
    public init() {}
    public var wrappedValue: Namespace.ID { ID() }
}

// MARK: - Değer tipleri

public enum ScenePhase: Comparable, Hashable, Sendable {
    case background
    case inactive
    case active
}

public enum ColorScheme: CaseIterable, Hashable, Sendable {
    case light
    case dark
}

public enum Edge: Int8, CaseIterable, Hashable, Sendable {
    case top, leading, bottom, trailing

    public struct Set: OptionSet, Sendable {
        public let rawValue: Int8
        public init(rawValue: Int8) { self.rawValue = rawValue }
        public static let top = Set(rawValue: 1)
        public static let leading = Set(rawValue: 2)
        public static let bottom = Set(rawValue: 4)
        public static let trailing = Set(rawValue: 8)
        public static let all: Set = [.top, .leading, .bottom, .trailing]
        public static let horizontal: Set = [.leading, .trailing]
        public static let vertical: Set = [.top, .bottom]
    }
}

public enum VerticalEdge: Int8, CaseIterable, Hashable, Sendable {
    case top, bottom
}

public enum Axis: Int8, CaseIterable, Hashable, Sendable {
    case horizontal, vertical

    public struct Set: OptionSet, Sendable {
        public let rawValue: Int8
        public init(rawValue: Int8) { self.rawValue = rawValue }
        public static let horizontal = Set(rawValue: 1)
        public static let vertical = Set(rawValue: 2)
    }
}

public struct SafeAreaRegions: OptionSet, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let container = SafeAreaRegions(rawValue: 1)
    public static let keyboard = SafeAreaRegions(rawValue: 2)
    public static let all: SafeAreaRegions = [.container, .keyboard]
}

public struct HorizontalAlignment: Equatable, Sendable {
    public static let leading = HorizontalAlignment()
    public static let center = HorizontalAlignment()
    public static let trailing = HorizontalAlignment()
}

public struct VerticalAlignment: Equatable, Sendable {
    public static let top = VerticalAlignment()
    public static let center = VerticalAlignment()
    public static let bottom = VerticalAlignment()
    public static let firstTextBaseline = VerticalAlignment()
    public static let lastTextBaseline = VerticalAlignment()
}

public struct Alignment: Equatable, Sendable {
    public static let center = Alignment()
    public static let leading = Alignment()
    public static let trailing = Alignment()
    public static let top = Alignment()
    public static let bottom = Alignment()
    public static let topLeading = Alignment()
    public static let topTrailing = Alignment()
    public static let bottomLeading = Alignment()
    public static let bottomTrailing = Alignment()
}

public enum TextAlignment: Hashable, CaseIterable, Sendable {
    case leading, center, trailing
}

public struct UnitPoint: Hashable, Sendable {
    public var x: CGFloat
    public var y: CGFloat
    public init() { x = 0; y = 0 }
    public init(x: CGFloat, y: CGFloat) { self.x = x; self.y = y }
    public static let zero = UnitPoint()
    public static let center = UnitPoint()
    public static let leading = UnitPoint()
    public static let trailing = UnitPoint()
    public static let top = UnitPoint()
    public static let bottom = UnitPoint()
    public static let topLeading = UnitPoint()
    public static let topTrailing = UnitPoint()
    public static let bottomLeading = UnitPoint()
    public static let bottomTrailing = UnitPoint()
}

public enum Visibility: Hashable, CaseIterable, Sendable {
    case automatic, visible, hidden
}

public enum RoundedCornerStyle: Hashable, Sendable {
    case circular, continuous
}

public struct FillStyle: Equatable, Sendable {
    public init(eoFill: Bool = false, antialiased: Bool = true) {}
}

public struct Animation: Equatable, Sendable {
    public static let `default` = Animation()
    public static let linear = Animation()
    public static let easeInOut = Animation()
    public static let easeIn = Animation()
    public static let easeOut = Animation()
    public static func easeInOut(duration: TimeInterval) -> Animation { Animation() }
    public static func easeIn(duration: TimeInterval) -> Animation { Animation() }
    public static func easeOut(duration: TimeInterval) -> Animation { Animation() }
    public static func linear(duration: TimeInterval) -> Animation { Animation() }
    public static func spring(response: Double = 0.5, dampingFraction: Double = 0.825, blendDuration: TimeInterval = 0) -> Animation {
        Animation()
    }
}

public func withAnimation<Result>(_ animation: Animation? = .default, _ body: () throws -> Result) rethrows -> Result {
    try body()
}

public struct AnyTransition {
    public static let opacity = AnyTransition()
    public static let slide = AnyTransition()
    public static let identity = AnyTransition()
    public static var scale: AnyTransition { AnyTransition() }
    public static func move(edge: Edge) -> AnyTransition { AnyTransition() }
    public func combined(with other: AnyTransition) -> AnyTransition { self }
}

public struct ButtonRole: Equatable, Sendable {
    public static let destructive = ButtonRole()
    public static let cancel = ButtonRole()
}

public struct AccessibilityTraits: SetAlgebra, Sendable {
    private var bitler: UInt = 0
    public init() {}
    private init(_ bitler: UInt) { self.bitler = bitler }
    public static let isButton = AccessibilityTraits(1)
    public static let isHeader = AccessibilityTraits(2)
    public static let isSelected = AccessibilityTraits(4)
    public static let isStaticText = AccessibilityTraits(8)
    public func contains(_ member: AccessibilityTraits) -> Bool { bitler & member.bitler == member.bitler }
    public func union(_ other: AccessibilityTraits) -> AccessibilityTraits { AccessibilityTraits(bitler | other.bitler) }
    public func intersection(_ other: AccessibilityTraits) -> AccessibilityTraits { AccessibilityTraits(bitler & other.bitler) }
    public func symmetricDifference(_ other: AccessibilityTraits) -> AccessibilityTraits { AccessibilityTraits(bitler ^ other.bitler) }
    public mutating func insert(_ newMember: AccessibilityTraits) -> (inserted: Bool, memberAfterInsert: AccessibilityTraits) {
        bitler |= newMember.bitler
        return (true, newMember)
    }
    public mutating func remove(_ member: AccessibilityTraits) -> AccessibilityTraits? {
        bitler &= ~member.bitler
        return member
    }
    public mutating func update(with newMember: AccessibilityTraits) -> AccessibilityTraits? {
        bitler |= newMember.bitler
        return newMember
    }
    public mutating func formUnion(_ other: AccessibilityTraits) { bitler |= other.bitler }
    public mutating func formIntersection(_ other: AccessibilityTraits) { bitler &= other.bitler }
    public mutating func formSymmetricDifference(_ other: AccessibilityTraits) { bitler ^= other.bitler }
}

public struct AccessibilityChildBehavior: Hashable, Sendable {
    public static let ignore = AccessibilityChildBehavior()
    public static let contain = AccessibilityChildBehavior()
    public static let combine = AccessibilityChildBehavior()
}

public struct ScrollIndicatorVisibility: Equatable, Sendable {
    public static var automatic: ScrollIndicatorVisibility { ScrollIndicatorVisibility() }
    public static var visible: ScrollIndicatorVisibility { ScrollIndicatorVisibility() }
    public static var hidden: ScrollIndicatorVisibility { ScrollIndicatorVisibility() }
    public static var never: ScrollIndicatorVisibility { ScrollIndicatorVisibility() }
}

public struct ScrollDismissesKeyboardMode: Sendable {
    public static var automatic: ScrollDismissesKeyboardMode { ScrollDismissesKeyboardMode() }
    public static var immediately: ScrollDismissesKeyboardMode { ScrollDismissesKeyboardMode() }
    public static var interactively: ScrollDismissesKeyboardMode { ScrollDismissesKeyboardMode() }
    public static var never: ScrollDismissesKeyboardMode { ScrollDismissesKeyboardMode() }
}

public struct TextInputAutocapitalization: Sendable {
    public static var never: TextInputAutocapitalization { TextInputAutocapitalization() }
    public static var words: TextInputAutocapitalization { TextInputAutocapitalization() }
    public static var sentences: TextInputAutocapitalization { TextInputAutocapitalization() }
    public static var characters: TextInputAutocapitalization { TextInputAutocapitalization() }
}

public struct SubmitLabel: Sendable {
    public static var done: SubmitLabel { SubmitLabel() }
    public static var go: SubmitLabel { SubmitLabel() }
    public static var send: SubmitLabel { SubmitLabel() }
    public static var search: SubmitLabel { SubmitLabel() }
    public static var next: SubmitLabel { SubmitLabel() }
    public static var `return`: SubmitLabel { SubmitLabel() }
}

public struct SensoryFeedback: Equatable, Sendable {
    public static let success = SensoryFeedback()
    public static let warning = SensoryFeedback()
    public static let error = SensoryFeedback()
    public static let selection = SensoryFeedback()
    public static let impact = SensoryFeedback()
    public static let start = SensoryFeedback()
    public static let stop = SensoryFeedback()
}

public struct MatchedGeometryProperties: OptionSet, Sendable {
    public let rawValue: UInt32
    public init(rawValue: UInt32) { self.rawValue = rawValue }
    public static let position = MatchedGeometryProperties(rawValue: 1)
    public static let size = MatchedGeometryProperties(rawValue: 2)
    public static let frame: MatchedGeometryProperties = [.position, .size]
}

// MARK: - Yazı

public struct LocalizedStringKey: Equatable, ExpressibleByStringInterpolation, Sendable {
    public init(_ value: String) {}
    public init(stringLiteral value: String) {}
    public init(stringInterpolation: StringInterpolation) {}

    public struct StringInterpolation: StringInterpolationProtocol, Sendable {
        public init(literalCapacity: Int, interpolationCount: Int) {}
        public mutating func appendLiteral(_ literal: String) {}
        public mutating func appendInterpolation(_ string: String) {}
        public mutating func appendInterpolation(_ value: Int) {}
        public mutating func appendInterpolation(_ value: Double) {}
        public mutating func appendInterpolation(_ text: Text) {}
    }
}

public struct Font: Hashable, Sendable {
    public static let largeTitle = Font()
    public static let title = Font()
    public static let title2 = Font()
    public static let title3 = Font()
    public static let headline = Font()
    public static let subheadline = Font()
    public static let body = Font()
    public static let callout = Font()
    public static let footnote = Font()
    public static let caption = Font()
    public static let caption2 = Font()

    public static func system(_ style: Font.TextStyle, design: Font.Design? = nil, weight: Font.Weight? = nil) -> Font { Font() }
    public static func system(size: CGFloat, weight: Font.Weight? = nil, design: Font.Design? = nil) -> Font { Font() }

    public func weight(_ weight: Font.Weight) -> Font { self }
    public func bold() -> Font { self }
    public func italic() -> Font { self }
    public func monospacedDigit() -> Font { self }

    public struct Weight: Hashable, Sendable {
        public static let ultraLight = Weight()
        public static let thin = Weight()
        public static let light = Weight()
        public static let regular = Weight()
        public static let medium = Weight()
        public static let semibold = Weight()
        public static let bold = Weight()
        public static let heavy = Weight()
        public static let black = Weight()
    }

    public enum Design: Hashable, Sendable {
        case `default`, serif, rounded, monospaced
    }

    public enum TextStyle: CaseIterable, Hashable, Sendable {
        case largeTitle, title, title2, title3, headline, subheadline, body, callout, footnote, caption, caption2
    }
}

public struct Text: _Ilkel, Equatable, Sendable {
    nonisolated public init(_ key: LocalizedStringKey, tableName: String? = nil, bundle: Bundle? = nil, comment: StaticString? = nil) {}
    @_disfavoredOverload nonisolated public init<S: StringProtocol>(_ content: S) {}
    nonisolated public init(verbatim content: String) {}

    nonisolated public func font(_ font: Font?) -> Text { self }
    nonisolated public func fontWeight(_ weight: Font.Weight?) -> Text { self }
    nonisolated public func bold() -> Text { self }
    nonisolated public func italic() -> Text { self }
    nonisolated public func tracking(_ tracking: CGFloat) -> Text { self }
    nonisolated public func kerning(_ kerning: CGFloat) -> Text { self }
    nonisolated public func foregroundStyle<S: ShapeStyle>(_ style: S) -> Text { self }
}

public struct Image: _Ilkel, Equatable, Sendable {
    nonisolated public init(systemName: String) {}
    nonisolated public init(_ name: String, bundle: Bundle? = nil) {}
}

public struct Label<Title: View, Icon: View>: _Ilkel {
    nonisolated public init(@ViewBuilder title: () -> Title, @ViewBuilder icon: () -> Icon) {}
}

extension Label where Title == Text, Icon == Image {
    nonisolated public init(_ titleKey: LocalizedStringKey, systemImage name: String) {}
    @_disfavoredOverload nonisolated public init<S: StringProtocol>(_ title: S, systemImage name: String) {}
}

// MARK: - Renk ve dolgu

public protocol ShapeStyle: Sendable {}

public struct Color: Hashable, ShapeStyle, Sendable {
    public enum RGBColorSpace: Hashable, Sendable {
        case sRGB, sRGBLinear, displayP3
    }

    nonisolated public init(_ colorSpace: RGBColorSpace = .sRGB, red: Double, green: Double, blue: Double, opacity: Double = 1) {}
    nonisolated public init(_ colorSpace: RGBColorSpace = .sRGB, white: Double, opacity: Double = 1) {}
    nonisolated public init(_ name: String, bundle: Bundle? = nil) {}

    public static let white = Color(white: 1)
    public static let black = Color(white: 0)
    public static let clear = Color(white: 0, opacity: 0)
    public static let red = Color(white: 0)
    public static let blue = Color(white: 0)
    public static let green = Color(white: 0)
    public static let yellow = Color(white: 0)
    public static let orange = Color(white: 0)
    public static let gray = Color(white: 0)
    public static let primary = Color(white: 0)
    public static let secondary = Color(white: 0)
    public static let accentColor = Color(white: 0)

    nonisolated public func opacity(_ opacity: Double) -> Color { self }
    public var gradient: AnyGradient { AnyGradient() }
}

extension ShapeStyle where Self == Color {
    public static var white: Color { Color.white }
    public static var black: Color { Color.black }
    public static var clear: Color { Color.clear }
    public static var red: Color { Color.red }
    public static var blue: Color { Color.blue }
    public static var green: Color { Color.green }
    public static var yellow: Color { Color.yellow }
    public static var orange: Color { Color.orange }
    public static var gray: Color { Color.gray }
}

extension Color: _Ilkel {}

public struct AnyGradient: Hashable, ShapeStyle, Sendable {}

public struct HierarchicalShapeStyle: ShapeStyle, Sendable {}

extension ShapeStyle where Self == HierarchicalShapeStyle {
    public static var primary: HierarchicalShapeStyle { HierarchicalShapeStyle() }
    public static var secondary: HierarchicalShapeStyle { HierarchicalShapeStyle() }
    public static var tertiary: HierarchicalShapeStyle { HierarchicalShapeStyle() }
}

public struct ForegroundStyle: ShapeStyle, Sendable {}

extension ShapeStyle where Self == ForegroundStyle {
    public static var foreground: ForegroundStyle { ForegroundStyle() }
}

public struct Material: ShapeStyle, Sendable {
    public static let ultraThin = Material()
    public static let thin = Material()
    public static let regular = Material()
    public static let thick = Material()
}

extension ShapeStyle where Self == Material {
    public static var ultraThinMaterial: Material { Material.ultraThin }
    public static var thinMaterial: Material { Material.thin }
    public static var regularMaterial: Material { Material.regular }
    public static var thickMaterial: Material { Material.thick }
}

public struct LinearGradient: ShapeStyle, Sendable {
    nonisolated public init(colors: [Color], startPoint: UnitPoint, endPoint: UnitPoint) {}
}

public struct RadialGradient: ShapeStyle, Sendable {
    nonisolated public init(colors: [Color], center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat) {}
}

extension LinearGradient: _Ilkel {}
extension RadialGradient: _Ilkel {}

// MARK: - Şekiller

public protocol Shape: Sendable, View {}

public protocol InsettableShape: Shape {}

extension Shape {
    nonisolated public func fill<S: ShapeStyle>(_ content: S = .foreground, style: FillStyle = FillStyle()) -> some View { _D<Self>() }
    nonisolated public func stroke<S: ShapeStyle>(_ content: S, lineWidth: CGFloat = 1) -> some View { _D<Self>() }
}

extension InsettableShape {
    nonisolated public func strokeBorder<S: ShapeStyle>(_ content: S = .foreground, lineWidth: CGFloat = 1, antialiased: Bool = true) -> some View {
        _D<Self>()
    }
}

public struct Rectangle: InsettableShape, _Ilkel {
    nonisolated public init() {}
}

public struct Circle: InsettableShape, _Ilkel {
    nonisolated public init() {}
}

public struct Capsule: InsettableShape, _Ilkel {
    nonisolated public init(style: RoundedCornerStyle = .continuous) {}
}

public struct RoundedRectangle: InsettableShape, _Ilkel {
    nonisolated public init(cornerRadius: CGFloat, style: RoundedCornerStyle = .continuous) {}
}

// MARK: - Yerleşim

public struct VStack<Content: View>: _Ilkel {
    nonisolated public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {}
}

public struct HStack<Content: View>: _Ilkel {
    nonisolated public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {}
}

public struct ZStack<Content: View>: _Ilkel {
    nonisolated public init(alignment: Alignment = .center, @ViewBuilder content: () -> Content) {}
}

public struct LazyVStack<Content: View>: _Ilkel {
    nonisolated public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {}
}

public struct ScrollView<Content: View>: _Ilkel {
    nonisolated public init(_ axes: Axis.Set = .vertical, @ViewBuilder content: () -> Content) {}
}

public struct Spacer: _Ilkel {
    nonisolated public init(minLength: CGFloat? = nil) {}
}

public struct Divider: _Ilkel {
    nonisolated public init() {}
}

public struct ForEach<Data: RandomAccessCollection, ID: Hashable, Content> {}

extension ForEach: View where Content: View {
    public typealias Body = Never
    public var body: Never { return fatalError() }
}

extension ForEach where ID == Data.Element.ID, Content: View, Data.Element: Identifiable {
    nonisolated public init(_ data: Data, @ViewBuilder content: @escaping (Data.Element) -> Content) {}
}

extension ForEach where Content: View {
    nonisolated public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) {}
}

// MARK: - Denetimler

public struct Button<Label: View>: _Ilkel {
    @preconcurrency nonisolated public init(action: @escaping @MainActor () -> Void, @ViewBuilder label: () -> Label) {}
}

extension Button where Label == Text {
    @preconcurrency nonisolated public init(_ titleKey: LocalizedStringKey, action: @escaping @MainActor () -> Void) {}
    @_disfavoredOverload @preconcurrency nonisolated public init<S: StringProtocol>(_ title: S, action: @escaping @MainActor () -> Void) {}
    @preconcurrency nonisolated public init(_ titleKey: LocalizedStringKey, role: ButtonRole?, action: @escaping @MainActor () -> Void) {}
    @_disfavoredOverload @preconcurrency nonisolated public init<S: StringProtocol>(_ title: S, role: ButtonRole?, action: @escaping @MainActor () -> Void) {}
}

public struct ButtonStyleConfiguration {
    public struct Label: _Ilkel {}
    public let role: ButtonRole?
    public let label: ButtonStyleConfiguration.Label
    public let isPressed: Bool
}

@MainActor @preconcurrency
public protocol ButtonStyle {
    associatedtype Body: View
    @ViewBuilder @MainActor @preconcurrency func makeBody(configuration: Self.Configuration) -> Self.Body
    typealias Configuration = ButtonStyleConfiguration
}

@MainActor @preconcurrency
public protocol PrimitiveButtonStyle {}

public struct PlainButtonStyle: PrimitiveButtonStyle {
    nonisolated public init() {}
}

public struct BorderlessButtonStyle: PrimitiveButtonStyle {
    nonisolated public init() {}
}

extension PrimitiveButtonStyle where Self == PlainButtonStyle {
    @MainActor @preconcurrency public static var plain: PlainButtonStyle { PlainButtonStyle() }
}

extension PrimitiveButtonStyle where Self == BorderlessButtonStyle {
    @MainActor @preconcurrency public static var borderless: BorderlessButtonStyle { BorderlessButtonStyle() }
}

public struct Menu<Label: View, Content: View>: _Ilkel {
    nonisolated public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {}
}

public struct Picker<Label: View, SelectionValue: Hashable, Content: View>: _Ilkel {
    nonisolated public init(selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {}
}

extension Picker where Label == Text {
    nonisolated public init(_ titleKey: LocalizedStringKey, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) {}
    @_disfavoredOverload nonisolated public init<S: StringProtocol>(_ title: S, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) {}
}

public struct Toggle<Label: View>: _Ilkel {
    nonisolated public init(isOn: Binding<Bool>, @ViewBuilder label: () -> Label) {}
}

extension Toggle where Label == Text {
    nonisolated public init(_ titleKey: LocalizedStringKey, isOn: Binding<Bool>) {}
    @_disfavoredOverload nonisolated public init<S: StringProtocol>(_ title: S, isOn: Binding<Bool>) {}
}

public struct SecureField<Label: View>: _Ilkel {}

extension SecureField where Label == Text {
    nonisolated public init(_ titleKey: LocalizedStringKey, text: Binding<String>) {}
    @_disfavoredOverload nonisolated public init<S: StringProtocol>(_ title: S, text: Binding<String>) {}
    nonisolated public init(_ titleKey: LocalizedStringKey, text: Binding<String>, prompt: Text?) {}
}

public struct ProgressView<Label: View, CurrentValueLabel: View>: _Ilkel {}

extension ProgressView where Label == EmptyView, CurrentValueLabel == EmptyView {
    nonisolated public init() {}
}

// MARK: - Değiştiriciler

extension View {
    // Yerleşim
    nonisolated public func padding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> some View { _D<Self>() }
    nonisolated public func padding(_ length: CGFloat) -> some View { _D<Self>() }
    nonisolated public func frame(width: CGFloat? = nil, height: CGFloat? = nil, alignment: Alignment = .center) -> some View { _D<Self>() }
    nonisolated public func frame(
        minWidth: CGFloat? = nil, idealWidth: CGFloat? = nil, maxWidth: CGFloat? = nil,
        minHeight: CGFloat? = nil, idealHeight: CGFloat? = nil, maxHeight: CGFloat? = nil,
        alignment: Alignment = .center
    ) -> some View { _D<Self>() }
    nonisolated public func fixedSize(horizontal: Bool, vertical: Bool) -> some View { _D<Self>() }
    nonisolated public func fixedSize() -> some View { _D<Self>() }
    nonisolated public func ignoresSafeArea(_ regions: SafeAreaRegions = .all, edges: Edge.Set = .all) -> some View { _D<Self>() }
    nonisolated public func safeAreaInset<V: View>(
        edge: VerticalEdge, alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil,
        @ViewBuilder content: () -> V
    ) -> some View { _D<Self>() }

    // Görünüş
    nonisolated public func font(_ font: Font?) -> some View { _D<Self>() }
    nonisolated public func foregroundStyle<S: ShapeStyle>(_ style: S) -> some View { _D<Self>() }
    nonisolated public func tint<S: ShapeStyle>(_ tint: S?) -> some View { _D<Self>() }
    nonisolated public func tint(_ tint: Color?) -> some View { _D<Self>() }
    nonisolated public func opacity(_ opacity: Double) -> some View { _D<Self>() }
    nonisolated public func background<S: ShapeStyle, T: InsettableShape>(_ style: S, in shape: T, fillStyle: FillStyle = FillStyle()) -> some View {
        _D<Self>()
    }
    nonisolated public func background<S: ShapeStyle>(_ style: S, ignoresSafeAreaEdges edges: Edge.Set = .all) -> some View { _D<Self>() }
    nonisolated public func background<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> some View { _D<Self>() }
    nonisolated public func overlay<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> some View { _D<Self>() }
    nonisolated public func shadow(color: Color = Color(.sRGBLinear, white: 0, opacity: 0.33), radius: CGFloat, x: CGFloat = 0, y: CGFloat = 0) -> some View {
        _D<Self>()
    }
    nonisolated public func scaleEffect(_ s: CGFloat, anchor: UnitPoint = .center) -> some View { _D<Self>() }
    nonisolated public func contentShape<S: Shape>(_ shape: S, eoFill: Bool = false) -> some View { _D<Self>() }
    nonisolated public func preferredColorScheme(_ colorScheme: ColorScheme?) -> some View { _D<Self>() }
    nonisolated public func lineLimit(_ number: Int?) -> some View { _D<Self>() }
    nonisolated public func multilineTextAlignment(_ alignment: TextAlignment) -> some View { _D<Self>() }

    // Canlandırma
    nonisolated public func animation<V: Equatable>(_ animation: Animation?, value: V) -> some View { _D<Self>() }
    nonisolated public func transition(_ t: AnyTransition) -> some View { _D<Self>() }
    nonisolated public func matchedGeometryEffect<ID: Hashable>(
        id: ID, in namespace: Namespace.ID, properties: MatchedGeometryProperties = .frame,
        anchor: UnitPoint = .center, isSource: Bool = true
    ) -> some View { _D<Self>() }

    // Davranış
    nonisolated public func environmentObject<T: ObservableObject>(_ object: T) -> some View { _D<Self>() }
    nonisolated public func disabled(_ disabled: Bool) -> some View { _D<Self>() }
    nonisolated public func tag<V: Hashable>(_ tag: V, includeOptional: Bool = true) -> some View { _D<Self>() }
    nonisolated public func onChange<V: Equatable>(
        of value: V, initial: Bool = false, _ action: @escaping (_ oldValue: V, _ newValue: V) -> Void
    ) -> some View { _D<Self>() }
    nonisolated public func onChange<V: Equatable>(of value: V, initial: Bool = false, _ action: @escaping () -> Void) -> some View {
        _D<Self>()
    }
    nonisolated public func sensoryFeedback<T: Equatable>(_ feedback: SensoryFeedback, trigger: T) -> some View { _D<Self>() }
    nonisolated public func buttonStyle<S: ButtonStyle>(_ style: S) -> some View { _D<Self>() }
    nonisolated public func buttonStyle<S: PrimitiveButtonStyle>(_ style: S) -> some View { _D<Self>() }
    nonisolated public func confirmationDialog<A: View>(
        _ titleKey: LocalizedStringKey, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic,
        @ViewBuilder actions: () -> A
    ) -> some View { _D<Self>() }

    // Kaydırma ve klavye
    nonisolated public func defaultScrollAnchor(_ anchor: UnitPoint?) -> some View { _D<Self>() }
    nonisolated public func scrollIndicators(_ visibility: ScrollIndicatorVisibility, axes: Axis.Set = [.vertical, .horizontal]) -> some View {
        _D<Self>()
    }
    nonisolated public func scrollDismissesKeyboard(_ mode: ScrollDismissesKeyboardMode) -> some View { _D<Self>() }
    nonisolated public func textInputAutocapitalization(_ autocapitalization: TextInputAutocapitalization?) -> some View { _D<Self>() }
    nonisolated public func autocorrectionDisabled(_ disable: Bool = true) -> some View { _D<Self>() }
    nonisolated public func submitLabel(_ submitLabel: SubmitLabel) -> some View { _D<Self>() }

    // Erişilebilirlik
    nonisolated public func accessibilityLabel(_ label: Text) -> some View { _D<Self>() }
    nonisolated public func accessibilityLabel(_ labelKey: LocalizedStringKey) -> some View { _D<Self>() }
    @_disfavoredOverload nonisolated public func accessibilityLabel<S: StringProtocol>(_ label: S) -> some View { _D<Self>() }
    nonisolated public func accessibilityHint(_ hint: Text) -> some View { _D<Self>() }
    nonisolated public func accessibilityHint(_ hintKey: LocalizedStringKey) -> some View { _D<Self>() }
    @_disfavoredOverload nonisolated public func accessibilityHint<S: StringProtocol>(_ hint: S) -> some View { _D<Self>() }
    nonisolated public func accessibilityHidden(_ hidden: Bool) -> some View { _D<Self>() }
    nonisolated public func accessibilityAddTraits(_ traits: AccessibilityTraits) -> some View { _D<Self>() }
    nonisolated public func accessibilityElement(children: AccessibilityChildBehavior = .ignore) -> some View { _D<Self>() }
}
