import CoreImage
import ImageIO
import ReplayKit
import UIKit
import Vision

/// Ajanın "gözü": kullanıcı Denetim Merkezi'nden yayını başlattığında tüm ekran kareleri buraya gelir.
///
/// - Her ~1 saniyede bir, kare küçültülür ve cihaz üstü Vision ile metinler okunur (internet yok).
/// - Okunan etiketler profil alanlarıyla eşleştirilip App Group'a yazılır; klavye bunu anında görür.
/// - Klavyeden "Akıllı analiz" istenirse son kare Claude'a gönderilir (yalnızca kullanıcı açtıysa).
///
/// Yayın uzantılarının bellek sınırı ~50 MB'tır; bu yüzden tek kare tutulur ve kareler 720 px'e küçültülür.
final class SampleHandler: RPBroadcastSampleHandler {
    private let store = SharedStore.shared
    private let ciContext = CIContext()
    private let workQueue = DispatchQueue(label: "doldur.broadcast.analysis", qos: .userInitiated)

    private var lastProcessed = Date.distantPast
    private var isBusy = false
    private var isSmartBusy = false
    private var latestFrame: CGImage?
    private var lastSignature = ""
    private var profile = SharedStore.shared.loadProfile()

    // MARK: Yayın yaşam döngüsü

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        store.agentActive = true
        store.agentStatus = "Ekran okunuyor"
        DarwinNotifier.observe(AppConfig.Notice.smartAnalysisRequested) { [weak self] in
            self?.workQueue.async { self?.runSmartAnalysis() }
        }
        DarwinNotifier.observe(AppConfig.Notice.profileUpdated) { [weak self] in
            self?.workQueue.async { self?.profile = SharedStore.shared.loadProfile() }
        }
        DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
    }

    override func broadcastPaused() { store.agentStatus = "Duraklatıldı" }
    override func broadcastResumed() { store.agentStatus = "Ekran okunuyor" }

    override func broadcastFinished() {
        DarwinNotifier.removeAll()
        store.agentActive = false
        store.agentStatus = "Kapalı"
        DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
    }

    // MARK: Kareler

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        let now = Date()
        guard now.timeIntervalSince(lastProcessed) >= AppConfig.localAnalysisInterval else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastProcessed = now

        // Kare tamponu ReplayKit'e geri döneceği için görüntüyü burada küçültüp kopyalıyoruz.
        let orientation = Self.orientation(of: sampleBuffer)
        var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation)
        let scale = min(1, 720 / image.extent.width)
        image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let frame = ciContext.createCGImage(image, from: image.extent) else { return }

        workQueue.async { [weak self] in
            guard let self else { return }
            self.latestFrame = frame
            guard !self.isBusy else { return }
            self.isBusy = true
            self.runLocalAnalysis(on: frame)
            self.isBusy = false
        }
    }

    private static func orientation(of sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
        guard let number = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString,
                                           attachmentModeOut: nil) as? NSNumber,
              let value = CGImagePropertyOrientation(rawValue: number.uint32Value)
        else { return .up }
        return value
    }

    // MARK: Yerel analiz (cihaz üstü)

    private func runLocalAnalysis(on frame: CGImage) {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["tr-TR", "en-US"]
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: frame, options: [:])
        do { try handler.perform([request]) } catch { return }

        let lines = (request.results ?? []).compactMap { observation -> OCRLine? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            return OCRLine(text: candidate.string, box: observation.boundingBox)
        }
        let fields = FieldMatcher.match(lines: lines, profile: profile)

        // Akıllı analiz yeni yapıldıysa ve ekran değişmediyse onu ezme.
        if let current = store.loadAnalysis(), current.source == .claude, current.isFresh,
           Set(fields.compactMap(\.profileKey)).isSubset(of: Set(current.fields.compactMap(\.profileKey))) {
            return
        }

        let analysis = ScreenAnalysis(timestamp: Date(), source: .local, screenTitle: nil, fields: fields)
        if analysis.signature != lastSignature {
            lastSignature = analysis.signature
            store.saveAnalysis(analysis)
        } else if let current = store.loadAnalysis(), Date().timeIntervalSince(current.timestamp) > 10 {
            // Ekran aynı; analizin "taze" kalması için zaman damgasını yenile.
            store.saveAnalysis(analysis)
        }
    }

    // MARK: Akıllı analiz (Claude)

    private func runSmartAnalysis() {
        guard !isSmartBusy else { return }
        guard store.smartAnalysisEnabled else {
            store.agentStatus = "Akıllı analiz kapalı (Ayarlar)"
            DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
            return
        }
        guard let apiKey = Keychain.loadAPIKey(), !apiKey.isEmpty else {
            store.agentStatus = "API anahtarı yok (Ayarlar)"
            DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
            return
        }
        guard let frame = latestFrame,
              let jpeg = UIImage(cgImage: frame).jpegData(compressionQuality: 0.6) else { return }

        isSmartBusy = true
        store.agentStatus = "Claude inceliyor…"
        DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
        let profile = self.profile

        Task { [weak self] in
            defer { self?.workQueue.async { self?.isSmartBusy = false } }
            do {
                let analysis = try await ClaudeClient(apiKey: apiKey).analyzeScreen(jpeg: jpeg, profile: profile)
                self?.store.agentStatus = "Ekran okunuyor"
                self?.store.saveAnalysis(analysis)
            } catch {
                self?.store.agentStatus = error.localizedDescription
                DarwinNotifier.post(AppConfig.Notice.analysisUpdated)
            }
        }
    }
}
