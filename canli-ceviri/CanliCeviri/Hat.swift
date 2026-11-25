import AVFoundation
import Observation
import Speech
import UIKit

/// Ekranda gösterilecek, açıklaması Türkçe hata.
struct HatHatasi: LocalizedError {
    let mesaj: String
    var errorDescription: String? { mesaj }
}

/// Mikrofonu dinler, cümleleri ayırır, çeviriyi seslendirir.
@MainActor
@Observable
final class Hat {
    /// O an söylenen, henüz bitmemiş cümle (ekranda canlı gösterilir).
    var canliMetin = ""
    /// Çevirinin okunacağı kulaklığın adı (ör. "AirPods Pro"); kulaklık bağlı değilse nil.
    var kulaklik: String?

    private let motor = AVAudioEngine()
    private let yedekSes = AVSpeechSynthesizer()
    @ObservationIgnored private var taniyici: SFSpeechRecognizer?
    @ObservationIgnored private var gorev: SFSpeechRecognitionTask?
    @ObservationIgnored private var duraklamaGorevi: Task<Void, Never>?
    @ObservationIgnored private var cumleEkle: AsyncThrowingStream<String, Error>.Continuation?
    @ObservationIgnored private var oynatici: AVAudioPlayer?
    @ObservationIgnored private var gozlemciler: [NSObjectProtocol] = []
    @ObservationIgnored private var yolGozlemcileri: [NSObjectProtocol] = []   // uygulama boyunca kalır
    @ObservationIgnored private var tur = 0        // eski tanıma görevlerini elemek için
    @ObservationIgnored private var oturumNo = 0   // durdurulunca bekleyen sesleri atlamak için
    @ObservationIgnored private var donguBasladi = false

    // Seslendirilecek metinlerin sırası (cümleler üst üste binmesin diye).
    private let sesSirasi: AsyncStream<(Int, String)>
    private let sesSirasinaEkle: AsyncStream<(Int, String)>.Continuation

    init() {
        let (akis, ekle) = AsyncStream<(Int, String)>.makeStream()
        sesSirasi = akis
        sesSirasinaEkle = ekle

        // Uygulama AirPods için: kulaklık takılıp çıkarıldıkça ekrandaki durum güncel kalsın.
        kulakligiGuncelle()
        let merkez = NotificationCenter.default
        for ad in [AVAudioSession.routeChangeNotification, UIApplication.didBecomeActiveNotification] {
            yolGozlemcileri.append(merkez.addObserver(forName: ad, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { () -> Void in self?.kulakligiGuncelle() }
            })
        }
    }

    nonisolated static func izinAl() async -> Bool {
        let konusma: Bool = await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        let mikrofon = await AVAudioApplication.requestRecordPermission()
        return konusma && mikrofon
    }

    /// Dinlemeyi başlatır; biten her cümleyi döndürdüğü akışa yazar.
    func baslat(konusmaDili: String) throws -> AsyncThrowingStream<String, Error> {
        guard let t = SFSpeechRecognizer(locale: Locale(identifier: konusmaDili)), t.isAvailable else {
            throw HatHatasi(mesaj: "Bu dil için konuşma tanıma şu an kullanılamıyor.")
        }
        taniyici = t
        oturumNo += 1

        // .allowBluetoothA2DP: ses AirPods'a yüksek kalitede gider,
        // mikrofon olarak iPhone'unki kalır (AirPods mikrofonu açılmaz).
        let oturum = AVAudioSession.sharedInstance()
        try oturum.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP])
        try oturum.setActive(true)
        kulakligiGuncelle()

        // Mikrofon başka bir uygulamadaysa ses biçimi boş gelir; o hâlde dinleme kurmak çökertir.
        let bicim = motor.inputNode.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0 else {
            throw HatHatasi(mesaj: "Mikrofon şu an kullanılamıyor.")
        }

        let (akis, ekle) = AsyncThrowingStream<String, Error>.makeStream()
        cumleEkle = ekle

        tanimayiBaslat()
        motor.prepare()
        try motor.start()
        UIApplication.shared.isIdleTimerDisabled = true   // ekran kilitlenmesin
        kesintileriIzle()

        if !donguBasladi {
            donguBasladi = true
            Task { await seslendirmeDongusu() }
        }
        return akis
    }

    func durdur() {
        oturumNo += 1
        tur += 1
        duraklamaGorevi?.cancel()
        gorev?.cancel()
        gorev = nil
        for g in gozlemciler { NotificationCenter.default.removeObserver(g) }
        gozlemciler = []
        motor.inputNode.removeTap(onBus: 0)
        motor.stop()
        cumleEkle?.finish()
        cumleEkle = nil
        oynatici?.stop()
        yedekSes.stopSpeaking(at: .immediate)
        canliMetin = ""
        UIApplication.shared.isIdleTimerDisabled = false
        // Başka uygulamaların sesi (müzik, podcast) kaldığı yerden sürsün.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: Kulaklık

    /// Sesin gideceği kulaklığı okur: AirPods gibi Bluetooth kulaklık ya da kablolu kulaklık.
    private func kulakligiGuncelle() {
        let turler: [AVAudioSession.Port] = [.bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .headphones]
        let ad = AVAudioSession.sharedInstance().currentRoute.outputs
            .first { turler.contains($0.portType) }?.portName
        if ad != kulaklik { kulaklik = ad }
    }

    // MARK: Kesintiler

    /// AirPods takılıp çıkarılınca, araya telefon görüşmesi girince ya da uygulama arka plandan
    /// dönünce ses motoru durmuş olabilir. Dinleme sürüyorsa kaldığı yerden devam eder.
    private func kesintileriIzle() {
        guard gozlemciler.isEmpty else { return }
        let merkez = NotificationCenter.default
        gozlemciler = [
            // Ses yolu değişti: motor kendini durdurur, mikrofonun ses biçimi değişmiş olabilir.
            merkez.addObserver(forName: .AVAudioEngineConfigurationChange, object: motor,
                               queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { () -> Void in self?.yenidenBaglan() }
            },
            // Telefon görüşmesi, alarm vb. bitti.
            merkez.addObserver(forName: AVAudioSession.interruptionNotification, object: nil,
                               queue: .main) { [weak self] bildirim in
                let tip = bildirim.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                guard tip == AVAudioSession.InterruptionType.ended.rawValue else { return }
                MainActor.assumeIsolated { () -> Void in self?.yenidenBaglan() }
            },
            // Uygulama arka plandan döndü.
            merkez.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil,
                               queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { () -> Void in self?.yenidenBaglan() }
            },
        ]
    }

    /// Ses motoru kendiliğinden durduysa mikrofonu yeniden bağlar ve motoru başlatır.
    private func yenidenBaglan() {
        guard cumleEkle != nil, !motor.isRunning else { return }   // dinlemiyoruz ya da sorun yok
        duraklamaGorevi?.cancel()
        cumleyiKapat()   // yarım cümleyi gönder, mikrofonu yeni ses biçimiyle bağla
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            motor.prepare()
            try motor.start()
        } catch {
            // Sessizce sağır kalmak yerine oturumu açıklamayla bitir (ekranda hata olarak görünür).
            cumleEkle?.finish(throwing: HatHatasi(mesaj: "Mikrofon yeniden açılamadı. Dinlemeyi yeniden başlatın."))
            cumleEkle = nil
        }
    }

    // MARK: Konuşma tanıma

    /// Yeni bir tanıma isteği açar. Her cümleden sonra yeniden çağrılır.
    private func tanimayiBaslat() {
        guard let taniyici else { return }
        tur += 1
        let buTur = tur
        canliMetin = ""

        let istek = SFSpeechAudioBufferRecognitionRequest()
        istek.shouldReportPartialResults = true
        istek.addsPunctuation = true                   // noktalama çeviriyi iyileştirir
        if taniyici.supportsOnDeviceRecognition {
            istek.requiresOnDeviceRecognition = true   // çevrimdışı, süre sınırı yok
        }

        motor.inputNode.removeTap(onBus: 0)
        Hat.mikrofonuBagla(motor.inputNode, istek)

        gorev = Hat.gorevAc(taniyici, istek) { [weak self] metin, bitti in
            guard let self, buTur == self.tur else { return }
            if let metin { self.canliMetin = metin }
            self.duraklamaGorevi?.cancel()

            // Tanıma kendiliğinden bittiyse (ör. süre sınırı) cümleyi beklemeden gönder.
            if bitti, !self.canliMetin.isEmpty {
                self.cumleyiKapat()
                return
            }
            // Her yeni kelimede sayacı sıfırla; sessizlik olunca cümleyi kapat.
            // Tanıma sonuçsuz bittiyse (uzun sessizlik, hata) sayaç dolunca yenisi açılır;
            // böylece dinleme sessizce kesilmez.
            self.duraklamaGorevi = Task { [weak self] in
                try? await Task.sleep(for: .seconds(duraklama))
                guard !Task.isCancelled else { return }
                self?.cumleyiKapat()
            }
        }
    }

    /// Ses verisi ayrı bir iş parçacığında gelir; bu yüzden nonisolated.
    private nonisolated static func mikrofonuBagla(_ giris: AVAudioInputNode,
                                                   _ istek: SFSpeechAudioBufferRecognitionRequest) {
        let bicim = giris.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0 else { return }   // mikrofon yoksa çökme
        giris.installTap(onBus: 0, bufferSize: 1024, format: bicim) { tampon, _ in
            istek.append(tampon)
        }
    }

    /// Tanıma sonuçlarını ana iş parçacığına taşır.
    /// `bitti`: tanıma görevi sona erdi (son sonuç geldi ya da hata oluştu).
    private nonisolated static func gorevAc(_ taniyici: SFSpeechRecognizer,
                                            _ istek: SFSpeechAudioBufferRecognitionRequest,
                                            _ olay: @escaping @MainActor (String?, Bool) -> Void)
    -> SFSpeechRecognitionTask {
        taniyici.recognitionTask(with: istek) { sonuc, hata in
            let metin = sonuc?.bestTranscription.formattedString
            let bitti = hata != nil || sonuc?.isFinal == true
            guard metin != nil || bitti else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { olay(metin, bitti) }
            }
        }
    }

    private func cumleyiKapat() {
        let metin = canliMetin.trimmingCharacters(in: .whitespacesAndNewlines)
        gorev?.cancel()
        gorev = nil
        if !metin.isEmpty { cumleEkle?.yield(metin) }
        tanimayiBaslat()   // dinlemeye kesintisiz devam
    }

    // MARK: Seslendirme

    func seslendir(_ metin: String) {
        sesSirasinaEkle.yield((oturumNo, metin))
    }

    /// Sıradaki metni seslendirir, bitince sonrakine geçer.
    private func seslendirmeDongusu() async {
        for await (no, metin) in sesSirasi {
            guard no == oturumNo else { continue }   // durdurulmuş oturumdan kalma
            let anahtar = UserDefaults.standard.string(forKey: Kayit.alaniaAnahtari) ?? ""
            if anahtar.isEmpty {
                appleIleOku(metin)
                continue
            }
            do {
                let ses = try await alaniaIleSeslendir(metin, anahtar: anahtar)
                guard no == oturumNo else { continue }
                let o = try AVAudioPlayer(data: ses)
                oynatici = o
                o.play()
                while o.isPlaying && no == oturumNo {
                    try? await Task.sleep(for: .milliseconds(50))
                }
            } catch {
                appleIleOku(metin)   // Alania'ya ulaşılamadıysa sessiz kalma
            }
        }
    }

    private func appleIleOku(_ metin: String) {
        let soz = AVSpeechUtterance(string: metin)
        soz.voice = AVSpeechSynthesisVoice(language: "tr-TR")
        yedekSes.speak(soz)
    }

    /// Alania-2 API çağrısı: Türkçe metin gider, WAV ses verisi döner.
    private func alaniaIleSeslendir(_ metin: String, anahtar: String) async throws -> Data {
        let ses = UserDefaults.standard.string(forKey: Kayit.alaniaSesi) ?? "alania2-f1"
        var istek = URLRequest(url: URL(string: alaniaAdres)!)
        istek.httpMethod = "POST"
        istek.timeoutInterval = 15
        istek.setValue("Bearer \(anahtar)", forHTTPHeaderField: "Authorization")
        istek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        istek.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": alaniaModel,
            "input": metin,
            "voice": ses,
        ])

        let (veri, yanit) = try await URLSession.shared.data(for: istek)
        guard let http = yanit as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return veri
    }
}
