// Apple'ın Speech çatısının, uygulamanın kullandığı kadarının taklidi (yalnızca tip denetimi için).

@_exported import AVFoundation
@_exported import Foundation

public enum SFSpeechRecognizerAuthorizationStatus: Int, Sendable {
    case notDetermined = 0
    case denied = 1
    case restricted = 2
    case authorized = 3
}

public enum SFSpeechRecognitionTaskHint: Int, Sendable {
    case unspecified = 0
    case dictation = 1
    case search = 2
    case confirmation = 3
}

open class SFSpeechRecognitionMetadata: NSObject {}

open class SFTranscription: NSObject {
    open var formattedString: String { "" }
}

open class SFSpeechRecognitionResult: NSObject {
    open var bestTranscription: SFTranscription { SFTranscription() }
    open var transcriptions: [SFTranscription] { [] }
    open var isFinal: Bool { false }
    open var speechRecognitionMetadata: SFSpeechRecognitionMetadata? { nil }
}

open class SFSpeechRecognitionRequest: NSObject {
    open var taskHint: SFSpeechRecognitionTaskHint = .unspecified
    open var shouldReportPartialResults: Bool = true
    open var contextualStrings: [String] = []
    open var requiresOnDeviceRecognition: Bool = false
    open var addsPunctuation: Bool = false
}

open class SFSpeechAudioBufferRecognitionRequest: SFSpeechRecognitionRequest {
    public override init() {}
    open func append(_ audioPCMBuffer: AVAudioPCMBuffer) {}
    open func endAudio() {}
}

open class SFSpeechRecognitionTask: NSObject {
    open var isFinishing: Bool { false }
    open var isCancelled: Bool { false }
    open func finish() {}
    open func cancel() {}
}

open class SFSpeechRecognizer: NSObject {
    open class func authorizationStatus() -> SFSpeechRecognizerAuthorizationStatus { .notDetermined }
    open class func requestAuthorization(_ handler: @escaping @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void) {}

    public convenience override init() { self.init(yerel: Locale.current) }
    public init?(locale: Locale) {}
    private init(yerel: Locale) {}

    open var isAvailable: Bool { false }
    open var locale: Locale { Locale.current }
    open var supportsOnDeviceRecognition: Bool = false
    open var queue: OperationQueue = .main

    #if GERI_CAGRI_SENDABLE_DEGIL
    open func recognitionTask(
        with request: SFSpeechRecognitionRequest,
        resultHandler: @escaping (SFSpeechRecognitionResult?, (any Error)?) -> Void
    ) -> SFSpeechRecognitionTask { SFSpeechRecognitionTask() }
    #else
    open func recognitionTask(
        with request: SFSpeechRecognitionRequest,
        resultHandler: @escaping @Sendable (SFSpeechRecognitionResult?, (any Error)?) -> Void
    ) -> SFSpeechRecognitionTask { SFSpeechRecognitionTask() }
    #endif
}
