// Apple'ın AVFoundation (AVFAudio) çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).

@_exported import Foundation

// MARK: - Ses motoru

public typealias AVAudioFrameCount = UInt32
public typealias AVAudioChannelCount = UInt32
public typealias AVAudioNodeBus = Int

#if TAP_SENDABLE_DEGIL
public typealias AVAudioNodeTapBlock = (AVAudioPCMBuffer, AVAudioTime) -> Void
#else
public typealias AVAudioNodeTapBlock = @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void
#endif

open class AVAudioFormat: NSObject {
    open var sampleRate: Double { 0 }
    open var channelCount: AVAudioChannelCount { 0 }
}

open class AVAudioBuffer: NSObject {}

open class AVAudioPCMBuffer: AVAudioBuffer {
    open var frameLength: AVAudioFrameCount = 0
    open var frameCapacity: AVAudioFrameCount { 0 }
    open var floatChannelData: UnsafePointer<UnsafeMutablePointer<Float>>? { nil }
}

open class AVAudioTime: NSObject {}

open class AVAudioNode: NSObject {
    open func installTap(onBus bus: AVAudioNodeBus, bufferSize: AVAudioFrameCount, format: AVAudioFormat?, block tapBlock: @escaping AVAudioNodeTapBlock) {}
    open func removeTap(onBus bus: AVAudioNodeBus) {}
    open func outputFormat(forBus bus: AVAudioNodeBus) -> AVAudioFormat { AVAudioFormat() }
    open func inputFormat(forBus bus: AVAudioNodeBus) -> AVAudioFormat { AVAudioFormat() }
}

open class AVAudioIONode: AVAudioNode {}

open class AVAudioInputNode: AVAudioIONode {}

open class AVAudioEngine: NSObject {
    public override init() {}
    open var inputNode: AVAudioInputNode { AVAudioInputNode() }
    open var isRunning: Bool { false }
    open func prepare() {}
    open func start() throws {}
    open func stop() {}
}

extension NSNotification.Name {
    public static let AVAudioEngineConfigurationChange = NSNotification.Name("AVAudioEngineConfigurationChangeNotification")
}

// MARK: - Ses oturumu

public let AVAudioSessionInterruptionTypeKey: String = "AVAudioSessionInterruptionTypeKey"

open class AVAudioSession: NSObject {
    open class func sharedInstance() -> AVAudioSession { AVAudioSession() }

    public struct Category: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public static let ambient = Category(rawValue: "ambient")
        public static let soloAmbient = Category(rawValue: "soloAmbient")
        public static let playback = Category(rawValue: "playback")
        public static let record = Category(rawValue: "record")
        public static let playAndRecord = Category(rawValue: "playAndRecord")
    }

    public struct Mode: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public static let `default` = Mode(rawValue: "default")
        public static let voiceChat = Mode(rawValue: "voiceChat")
        public static let measurement = Mode(rawValue: "measurement")
        public static let spokenAudio = Mode(rawValue: "spokenAudio")
        public static let videoRecording = Mode(rawValue: "videoRecording")
    }

    public struct CategoryOptions: OptionSet, Sendable {
        public let rawValue: UInt
        public init(rawValue: UInt) { self.rawValue = rawValue }
        public static let mixWithOthers = CategoryOptions(rawValue: 1)
        public static let duckOthers = CategoryOptions(rawValue: 2)
        public static let allowBluetooth = CategoryOptions(rawValue: 4)
        public static let defaultToSpeaker = CategoryOptions(rawValue: 8)
        public static let interruptSpokenAudioAndMixWithOthers = CategoryOptions(rawValue: 0x11)
        public static let allowBluetoothA2DP = CategoryOptions(rawValue: 0x20)
        public static let allowAirPlay = CategoryOptions(rawValue: 0x40)
    }

    public struct SetActiveOptions: OptionSet, Sendable {
        public let rawValue: UInt
        public init(rawValue: UInt) { self.rawValue = rawValue }
        public static let notifyOthersOnDeactivation = SetActiveOptions(rawValue: 1)
    }

    public struct Port: Hashable, RawRepresentable, Sendable {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public static let builtInMic = Port(rawValue: "MicrophoneBuiltIn")
        public static let builtInReceiver = Port(rawValue: "Receiver")
        public static let builtInSpeaker = Port(rawValue: "Speaker")
        public static let headphones = Port(rawValue: "Headphones")
        public static let bluetoothA2DP = Port(rawValue: "BluetoothA2DPOutput")
        public static let bluetoothHFP = Port(rawValue: "BluetoothHFP")
        public static let bluetoothLE = Port(rawValue: "BluetoothLE")
    }

    public enum InterruptionType: UInt, Sendable {
        case began = 1
        case ended = 0
    }

    public class var routeChangeNotification: NSNotification.Name { NSNotification.Name("AVAudioSessionRouteChangeNotification") }
    public class var interruptionNotification: NSNotification.Name { NSNotification.Name("AVAudioSessionInterruptionNotification") }

    open var currentRoute: AVAudioSessionRouteDescription { AVAudioSessionRouteDescription() }
    open func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions = []) throws {}
    open func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions = []) throws {}
}

open class AVAudioSessionRouteDescription: NSObject {
    open var inputs: [AVAudioSessionPortDescription] { [] }
    open var outputs: [AVAudioSessionPortDescription] { [] }
}

open class AVAudioSessionPortDescription: NSObject {
    open var portType: AVAudioSession.Port { .builtInSpeaker }
    open var portName: String { "" }
}

open class AVAudioApplication: NSObject {
    open class func requestRecordPermission(completionHandler response: @escaping @Sendable (Bool) -> Void) {}
    open class func requestRecordPermission() async -> Bool { false }
}

// MARK: - Konuşma sentezi

public let AVSpeechUtteranceMinimumSpeechRate: Float = 0
public let AVSpeechUtteranceMaximumSpeechRate: Float = 1
public let AVSpeechUtteranceDefaultSpeechRate: Float = 0.5

public enum AVSpeechBoundary: Int, Sendable {
    case immediate = 0
    case word = 1
}

public enum AVSpeechSynthesisVoiceQuality: Int, Sendable {
    case `default` = 1
    case enhanced = 2
    case premium = 3
}

public enum AVSpeechSynthesisVoiceGender: Int, Sendable {
    case unspecified = 0
    case male = 1
    case female = 2
}

open class AVSpeechSynthesisVoice: NSObject {
    open class func speechVoices() -> [AVSpeechSynthesisVoice] { [] }
    public init?(language languageCode: String?) {}
    open var language: String { "" }
    open var name: String { "" }
    open var quality: AVSpeechSynthesisVoiceQuality { .default }
    open var gender: AVSpeechSynthesisVoiceGender { .unspecified }
}

open class AVSpeechUtterance: NSObject {
    public init(string: String) {}
    open var voice: AVSpeechSynthesisVoice?
    open var rate: Float = 0.5
    open var pitchMultiplier: Float = 1
    open var volume: Float = 1
}

public protocol AVSpeechSynthesizerDelegate: NSObjectProtocol {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance)
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance)
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance)
}

// Gerçek protokolde bu yöntemler isteğe bağlıdır.
extension AVSpeechSynthesizerDelegate {
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {}
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {}
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {}
}

open class AVSpeechSynthesizer: NSObject {
    public override init() {}
    weak open var delegate: (any AVSpeechSynthesizerDelegate)?
    open var isSpeaking: Bool { false }
    open func speak(_ utterance: AVSpeechUtterance) {}
    @discardableResult open func stopSpeaking(at boundary: AVSpeechBoundary) -> Bool { true }
}

// MARK: - Ses çalıcı

public protocol AVAudioPlayerDelegate: NSObjectProtocol {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool)
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?)
}

extension AVAudioPlayerDelegate {
    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {}
    public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?) {}
}

open class AVAudioPlayer: NSObject {
    public init(data: Data) throws {}
    public init(contentsOf url: URL) throws {}
    weak open var delegate: (any AVAudioPlayerDelegate)?
    open var duration: TimeInterval { 0 }
    open var isPlaying: Bool { false }
    open var enableRate: Bool = false
    open var rate: Float = 1
    open var volume: Float = 1
    @discardableResult open func prepareToPlay() -> Bool { true }
    @discardableResult open func play() -> Bool { true }
    open func stop() {}
}
