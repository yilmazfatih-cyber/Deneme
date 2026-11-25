import AVFoundation
import Observation
import Speech
import UIKit

/// Ekranda gösterilecek, açıklaması Türkçe hata. `kod` yalnız Tanılama içindir (metin içermez).
struct HatHatasi: LocalizedError {
    let mesaj: String
    var kod: String?
    var errorDescription: String? { mesaj }
}

/// Alania yanıtı 200 değil.
struct AlaniaHatasi: Error {
    let http: Int
}

/// Dinleme oturumu sürerken mikrofonun geçici olarak kapanma nedeni (şartname G11).
enum KesintiNedeni: Equatable {
    case telefon        // ses oturumu kesintisi: arama, alarm, Siri
    case arkaPlan       // uygulama arka plana gitti
    case yapilandirma   // ses motorunun yapılandırması ya da ses yolu değişti
    case bekci          // mikrofondan 2 sn ses tamponu gelmedi

    /// "Duraklatıldı: <neden>" içindeki neden.
    var ekranMetni: String {
        switch self {
        case .telefon:      "arama, alarm ya da Siri"
        case .arkaPlan:     "uygulama arka planda"
        case .yapilandirma: "ses yolu değişiyor"
        case .bekci:        "mikrofondan ses gelmiyor"
        }
    }

    /// Tanılama satırındaki neden.
    var kayitAdi: String {
        switch self {
        case .telefon:      "telefon"
        case .arkaPlan:     "arka plan"
        case .yapilandirma: "yapılandırma"
        case .bekci:        "bekçi"
        }
    }
}

/// `Hat`'in `Durum`'a ilettiği olaylar.
enum HatBildirimi {
    case kesintiBasladi(KesintiNedeni)
    case kesintiBitti
    /// Sarı not göster (metin) ya da kaldır (nil).
    case not(NotTuru, String?)
}

/// Mikrofon tamponlarını o anki tanıma isteğine yönlendirir ve son tamponun zamanını tutar
/// (şartname C2, C6). Ses iş parçacığından ve ana aktörden erişildiği için kilitle korunur.
final class MikrofonKutusu: @unchecked Sendable {
    private let kilit = NSLock()
    private var istek: SFSpeechAudioBufferRecognitionRequest?
    private var son = Date.distantPast

    func yonlendir(_ yeni: SFSpeechAudioBufferRecognitionRequest?) {
        kilit.lock()
        istek = yeni
        kilit.unlock()
    }

    /// Bekçi sayacını şimdiden başlatır.
    func sifirla() {
        kilit.lock()
        son = Date()
        kilit.unlock()
    }

    /// Ses iş parçacığında çağrılır.
    func tampon(_ tampon: AVAudioPCMBuffer) {
        kilit.lock()
        son = Date()
        let hedef = istek
        kilit.unlock()
        hedef?.append(tampon)
    }

    /// Son tampondan bu yana geçen süre (sn).
    var gecen: TimeInterval {
        kilit.lock()
        defer { kilit.unlock() }
        return Date().timeIntervalSince(son)
    }
}

/// Apple sesinin ve Alania oynatıcısının bitişini bekletir (şartname S2). Temsilci geri çağrılarının
/// hangi iş parçacığında geldiği belli olmadığı için bekleyen devam kilitle korunur.
final class SesBekleyici: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate, @unchecked Sendable {
    private let kilit = NSLock()
    private var devam: CheckedContinuation<Void, Never>?

    func basla(_ yeni: CheckedContinuation<Void, Never>) {
        kilit.lock()
        let eski = devam
        devam = yeni
        kilit.unlock()
        eski?.resume()
    }

    func bitir() {
        kilit.lock()
        let bekleyen = devam
        devam = nil
        kilit.unlock()
        bekleyen?.resume()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { bitir() }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { bitir() }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { bitir() }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { bitir() }
}

/// Bildirim gözlemcilerini tutar; kendisi bırakılınca (ör. `Hat` bırakılınca) hepsini kaldırır (Ön-5).
final class Gozlemciler {
    private var liste: [NSObjectProtocol] = []

    var bos: Bool { liste.isEmpty }

    func ekle(_ gozlemci: NSObjectProtocol) {
        liste.append(gozlemci)
    }

    func kaldir() {
        for g in liste { NotificationCenter.default.removeObserver(g) }
        liste = []
    }

    deinit { kaldir() }
}

/// Bildirimden yalnız gereken sayılar alınır; ana aktöre bunlar taşınır.
private struct BildirimOzeti {
    let ad: Notification.Name
    let tip: UInt?
    let secenek: UInt?
    let kesintiNedeni: UInt?
    let yolNedeni: UInt?

    init(_ bildirim: Notification) {
        ad = bildirim.name
        tip = bildirim.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        secenek = bildirim.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
        kesintiNedeni = bildirim.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt
        yolNedeni = bildirim.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
    }
}

/// Tanıma görevinin hata ile bitişi (yalnız kod ve sistem açıklaması; konuşma metni yok).
private struct TanimaHatasi {
    let kod: String
    let aciklama: String
}

/// Alania istekleri: toplam süre sınırı (bağlantı + yanıt + gövde) `alaniaSuresi` (şartname S5, KR10).
private let alaniaOturumu: URLSession = {
    let ayar = URLSessionConfiguration.ephemeral
    ayar.timeoutIntervalForRequest = alaniaSuresi
    ayar.timeoutIntervalForResource = alaniaSuresi
    return URLSession(configuration: ayar)
}()

/// Mikrofonu dinler, cümleleri ayırır, çeviriyi seslendirir, kesintileri yönetir.
@MainActor
@Observable
final class Hat {
    /// O an söylenen, henüz bitmemiş cümle (ekranda canlı gösterilir).
    var canliMetin = ""
    /// Çevirinin okunacağı kulaklığın adı (ör. "AirPods Pro"); kulaklık bağlı değilse nil.
    /// Ad yalnız ekranda gösterilir, Tanılama'ya yazılmaz.
    var kulaklik: String?
    /// Ses yolunda sarı uyarı gerektiren durum (telefon kipi, hoparlör, araç, dahili olmayan mikrofon); yoksa nil.
    var yolUyarisi: String?

    /// `Durum`'a giden olaylar. `Durum` kendi `init`'inde bağlar.
    @ObservationIgnored var bildir: (@MainActor (HatBildirimi) -> Void)?
    /// Yalnız DEBUG önizleme kipinde `true` olur (bkz. `onizlemeKipi`).
    @ObservationIgnored fileprivate(set) var onizlemede = false

    @ObservationIgnored private var motor = AVAudioEngine()
    @ObservationIgnored private var yedekSes = AVSpeechSynthesizer()
    private let bekleyici = SesBekleyici()
    private let kutu = MikrofonKutusu()
    private let gozlemciler = Gozlemciler()      // dinleme süresince
    private let yolGozlemcileri = Gozlemciler()  // uygulama boyunca
    @ObservationIgnored private var taniyici: SFSpeechRecognizer?
    @ObservationIgnored private var gorev: SFSpeechRecognitionTask?
    @ObservationIgnored private var duraklamaGorevi: Task<Void, Never>?
    @ObservationIgnored private var bekciGorevi: Task<Void, Never>?
    @ObservationIgnored private var sesGorevi: Task<Void, Never>?
    @ObservationIgnored private var cumleEkle: AsyncThrowingStream<String, Error>.Continuation?
    @ObservationIgnored private var oynatici: AVAudioPlayer?
    @ObservationIgnored private var tur = 0        // eski tanıma görevlerini elemek için
    @ObservationIgnored private var oturumNo = 0   // eski sayaçları elemek için (her Başlat ve Durdur)
    @ObservationIgnored private var sesNo = 0      // bekleyen sesleri atlamak için (Başlat, Durdur, kesinti)
    @ObservationIgnored private var donguBasladi = false
    @ObservationIgnored private var oturumEtkin = false
    @ObservationIgnored private var kesinti: KesintiNedeni?
    @ObservationIgnored private var bosBitis = 0
    @ObservationIgnored private var alaniaHataSayisi = 0
    @ObservationIgnored private var alaniaKapali = false
    @ObservationIgnored private var turkceSesYok = false

    // Seslendirilecek metinlerin sırası (cümleler üst üste binmesin diye).
    private let sesSirasi: AsyncStream<(Int, String)>
    private let sesSirasinaEkle: AsyncStream<(Int, String)>.Continuation

    init() {
        let (akis, ekle) = AsyncStream<(Int, String)>.makeStream()
        sesSirasi = akis
        sesSirasinaEkle = ekle
        yedekSes.delegate = bekleyici

        // Kulaklık durumu, uygulamanın ön/arka plana geçişi ve ses sisteminin sıfırlanması uygulama boyunca izlenir.
        yoluGuncelle()
        let adlar: [Notification.Name] = [
            AVAudioSession.routeChangeNotification,
            AVAudioSession.mediaServicesWereResetNotification,
            UIApplication.didBecomeActiveNotification,
            UIApplication.willResignActiveNotification,
            UIApplication.didEnterBackgroundNotification,
        ]
        for ad in adlar { yolGozlemcileri.ekle(gozle(ad)) }
    }

    /// İzinleri ister: konuşma tanıma, sonra mikrofon.
    nonisolated static func izinler() async -> (konusma: Bool, mikrofon: Bool) {
        let konusma: Bool = await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        let mikrofon = await AVAudioApplication.requestRecordPermission()
        return (konusma, mikrofon)
    }

    /// Dinlemeyi başlatır; biten her cümleyi döndürdüğü akışa yazar (şartname Y1, G5).
    func baslat(konusmaDili: String) throws -> AsyncThrowingStream<String, Error> {
        let kayit = Tanilama.ortak
        guard let t = SFSpeechRecognizer(locale: Locale(identifier: konusmaDili)), t.isAvailable else {
            kayit.kaydet("tanıma açıldı", "\(konusmaDili) kullanılamıyor", uyari: true)
            throw HatHatasi(mesaj: "Bu dil için konuşma tanıma şu an kullanılamıyor. Biraz sonra yeniden deneyin.",
                            kod: "tanıyıcı yok \(konusmaDili)")
        }
        taniyici = t
        oturumNo += 1
        sesNo += 1
        kesinti = nil
        bosBitis = 0
        alaniaHataSayisi = 0
        alaniaKapali = false
        turkceSesYok = false

        // .allowBluetoothA2DP: ses AirPods'a yüksek kalitede gider,
        // mikrofon olarak iPhone'unki kalır (AirPods mikrofonu açılmaz).
        let oturum = AVAudioSession.sharedInstance()
        try oturum.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP])
        try oturum.setActive(true)
        oturumEtkin = true
        dahiliMikrofonuSec()

        let (akis, ekle) = AsyncThrowingStream<String, Error>.makeStream()
        cumleEkle = ekle
        yoluGuncelle()
        yoluKaydet(neden: nil)

        // KR2: cihazda tanıma yoksa reddetme; ekranda kalıcı not ve Tanılama satırı.
        let cihazda = t.supportsOnDeviceRecognition
        kayit.kaydet("tanıma açıldı", "\(konusmaDili) \(cihazda ? "cihazda" : "sunucuda")", uyari: !cihazda)
        bildir?(.not(.sunucuTanima, cihazda ? nil : "Bu dilde konuşma tanıma Apple'ın sunucusunda yapılır."))

        try dinlemeyiAc()
        UIApplication.shared.isIdleTimerDisabled = true   // ekran kilitlenmesin
        kesintileriIzle()
        sesDongusunuBaslat()
        return akis
    }

    /// Kapatma sırası (şartname § 2.3). Her adım bir öncekinden bağımsız çalışır; iki kez çağrılması zararsızdır.
    func durdur() {
        oturumNo += 1
        tur += 1
        duraklamaGorevi?.cancel()
        duraklamaGorevi = nil
        bekciGorevi?.cancel()
        bekciGorevi = nil
        gorev?.cancel()
        gorev = nil
        kutu.yonlendir(nil)
        motor.inputNode.removeTap(onBus: 0)
        motor.stop()
        cumleEkle?.finish()   // akışta bekleyen cümleleri Durum kimlik denetimiyle atar
        cumleEkle = nil
        sesiKes()
        gozlemciler.kaldir()
        UIApplication.shared.isIdleTimerDisabled = false
        oturumuKapat()
        kesinti = nil
        bosBitis = 0
        canliMetin = ""
        yoluGuncelle()
    }

    // MARK: Ses yolu

    /// Kulaklık adını ve sarı uyarıyı günceller (şartname Y4–Y6).
    private func yoluGuncelle() {
        guard !onizlemede else { return }
        let yol = AVAudioSession.sharedInstance().currentRoute
        let kulaklikTurleri: [AVAudioSession.Port] = [.bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .headphones]
        let ad = yol.outputs.first { kulaklikTurleri.contains($0.portType) }?.portName
        if ad != kulaklik { kulaklik = ad }

        let dinlerken = cumleEkle != nil && kesinti == nil
        let uyari = Hat.uyariMetni(cikis: yol.outputs.first?.portType,
                                   giris: dinlerken ? yol.inputs.first?.portType : nil)
        if uyari != yolUyarisi { yolUyarisi = uyari }
    }

    /// Tanılama'ya yalnız tür yazılır, ad asla yazılmaz.
    private func yoluKaydet(neden: String?) {
        let yol = AVAudioSession.sharedInstance().currentRoute
        var ayrinti = "çıkış=\(Hat.turAdi(yol.outputs.first?.portType)) giriş=\(Hat.turAdi(yol.inputs.first?.portType))"
        if let neden { ayrinti += " neden=\(neden)" }
        Tanilama.ortak.kaydet("ses yolu", ayrinti, uyari: yolUyarisi != nil)
    }

    /// Mikrofonlu kablolu kulaklıkta da dinleyen iPhone mikrofonu olsun (şartname Y1, ilke 2).
    private func dahiliMikrofonuSec() {
        let oturum = AVAudioSession.sharedInstance()
        guard let dahili = oturum.availableInputs?.first(where: { $0.portType == .builtInMic }) else {
            Tanilama.ortak.kaydet("ses yolu", "dahili mikrofon bulunamadı", uyari: true)
            return
        }
        do {
            try oturum.setPreferredInput(dahili)
        } catch {
            Tanilama.ortak.kaydet("ses yolu", "dahili mikrofon seçilemedi \(hataKodu(error))", uyari: true)
        }
    }

    private func yolDegisti(_ neden: UInt?) {
        yoluGuncelle()
        yoluKaydet(neden: Hat.yolNedeniAdi(neden.flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }))
        // Motor ses yolu değişince kendini durdurduysa (G10 → G11 → G12).
        if cumleEkle != nil, kesinti == nil, !motor.isRunning {
            kesintiyeGir(.yapilandirma)
            surdur()
        }
    }

    private nonisolated static func uyariMetni(cikis: AVAudioSession.Port?, giris: AVAudioSession.Port?) -> String? {
        if let cikis {
            if cikis == .bluetoothHFP { return "AirPods telefon kipinde; ses kalitesi düşük." }
            if cikis == .builtInSpeaker || cikis == .airPlay {
                return "Ses hoparlörden çıkıyor; mikrofon kendi sesini duyabilir."
            }
            if cikis == .carAudio { return "Ses araç sisteminden çıkıyor." }
        }
        if let giris, giris != .builtInMic { return "Dinleyen iPhone mikrofonu değil; çeviri bozulabilir." }
        return nil
    }

    private nonisolated static func turAdi(_ port: AVAudioSession.Port?) -> String {
        guard let port else { return "yok" }
        if port == .bluetoothA2DP || port == .bluetoothLE { return "bluetooth" }
        if port == .bluetoothHFP { return "hfp" }
        if port == .headphones { return "kablolu" }
        if port == .usbAudio { return "usb" }
        if port == .builtInReceiver { return "ahize" }
        if port == .builtInSpeaker { return "hoparlör" }
        if port == .airPlay { return "airplay" }
        if port == .carAudio { return "araç" }
        if port == .builtInMic { return "dahili" }
        if port == .headsetMic { return "kulaklık mikrofonu" }
        return "diğer"
    }

    private nonisolated static func yolNedeniAdi(_ neden: AVAudioSession.RouteChangeReason?) -> String {
        guard let neden else { return "bilinmiyor" }
        switch neden {
        case .newDeviceAvailable:         return "yeni cihaz"
        case .oldDeviceUnavailable:       return "eski cihaz gitti"
        case .categoryChange:             return "kategori"
        case .override:                   return "yönlendirme"
        case .wakeFromSleep:              return "uykudan uyanma"
        case .noSuitableRouteForCategory: return "uygun yol yok"
        case .routeConfigurationChange:   return "yapılandırma"
        case .unknown:                    return "bilinmiyor"
        @unknown default:                 return "diğer"
        }
    }

    // MARK: Bildirimler ve kesintiler

    /// Bildirim ana kuyrukta gelir; yalnız sayılar ana aktöre taşınır.
    private func gozle(_ ad: Notification.Name, _ nesne: Any? = nil) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(forName: ad, object: nesne, queue: .main) { [weak self] bildirim in
            let ozet = BildirimOzeti(bildirim)
            MainActor.assumeIsolated { () -> Void in self?.bildirimGeldi(ozet) }
        }
    }

    /// Dinleme süresince: motor yapılandırması ve ses oturumu kesintileri.
    private func kesintileriIzle() {
        guard gozlemciler.bos else { return }
        gozlemciler.ekle(gozle(.AVAudioEngineConfigurationChange, motor))
        gozlemciler.ekle(gozle(AVAudioSession.interruptionNotification))
    }

    private func bildirimGeldi(_ o: BildirimOzeti) {
        guard !onizlemede else { return }
        let kayit = Tanilama.ortak
        switch o.ad {
        case AVAudioSession.routeChangeNotification:
            yolDegisti(o.yolNedeni)

        case AVAudioSession.interruptionNotification:
            kesintiBildirimi(o)

        case .AVAudioEngineConfigurationChange:
            // Motor kendini durdurdu (K14): bağlantıyı yeni biçimle kur.
            guard cumleEkle != nil, kesinti == nil else { return }
            kesintiyeGir(.yapilandirma)
            surdur()

        case AVAudioSession.mediaServicesWereResetNotification:
            sesSistemiSifirlandi()

        case UIApplication.didBecomeActiveNotification:
            kayit.kaydet("uygulama", "etkin oldu")
            yoluGuncelle()
            guard cumleEkle != nil else { return }
            if kesinti != nil {
                surdur()                      // K4, K8: dönüşte koşulsuz G12
            } else if !motor.isRunning {
                kesintiyeGir(.yapilandirma)   // bildirimi kaçırılmış bir durma
                surdur()
            }

        case UIApplication.willResignActiveNotification:
            kayit.kaydet("uygulama", "etkinliğini yitirdi")   // K10: dinleme sürer

        case UIApplication.didEnterBackgroundNotification:
            kayit.kaydet("uygulama", "arka planda")
            guard cumleEkle != nil else { return }
            kesintiyeGir(.arkaPlan)           // K8
            oturumuKapat()

        default:
            break
        }
    }

    private func kesintiBildirimi(_ o: BildirimOzeti) {
        let kayit = Tanilama.ortak
        guard let ham = o.tip, let tip = AVAudioSession.InterruptionType(rawValue: ham) else { return }
        switch tip {
        case .began:
            // Arka plandan dönüşte gecikmeli gelen "başladı" yok sayılır (K8). Ham değer 1 = `.appWasSuspended`;
            // adıyla anılmaz çünkü iOS 16'dan beri kullanımdan kalkmış olabilir (uyarı = hata). Sistem artık
            // göndermiyorsa bu dal hiç çalışmaz; neden kodu D8 için kayda yazılır.
            if o.kesintiNedeni == 1 {
                kayit.kaydet("kesinti", "başladı bildirimi yok sayıldı (uygulama askıdaydı)")
                return
            }
            if let n = o.kesintiNedeni { kayit.kaydet("kesinti", "başladı sistem nedeni=\(n)") }
            guard cumleEkle != nil else {
                kayit.kaydet("kesinti", "başladı (dinlemiyor)")
                return
            }
            kesintiyeGir(.telefon)
        case .ended:
            // KR4: shouldResume'a göre davranış değişmez; yalnız kaydedilir (D8).
            let devamEt = o.secenek.map { AVAudioSession.InterruptionOptions(rawValue: $0).contains(.shouldResume) }
            let secenek = devamEt.map { $0 ? "shouldResume=evet" : "shouldResume=hayır" } ?? "seçenek yok"
            guard cumleEkle != nil, kesinti != nil else {
                kayit.kaydet("kesinti", "bitti (dinlemiyor) \(secenek)")
                return
            }
            surdur(secenek)
        @unknown default:
            break
        }
    }

    /// G11: dinleme oturumu sürer ama mikrofon geçici olarak kapanır.
    private func kesintiyeGir(_ neden: KesintiNedeni) {
        guard cumleEkle != nil, kesinti == nil else { return }
        kesinti = neden
        Tanilama.ortak.kaydet("kesinti", "başladı neden=\(neden.kayitAdi)", uyari: true)
        yarimCumleyiGonder()                // C4: gönderilir
        bekciGorevi?.cancel()
        bekciGorevi = nil
        motor.inputNode.removeTap(onBus: 0)
        motor.stop()
        sesiKes()
        yoluGuncelle()
        bildir?(.kesintiBasladi(neden))
    }

    /// G12: oturumu yeniden etkinleştirir, mikrofonu o anki biçimle bağlar (E3, Y1, Y2).
    /// İki kez denenir (ikincisi 0,5 sn sonra); ikisi de olmazsa dinleme hatayla biter (C7, G13).
    private func surdur(_ ayrinti: String = "", deneme: Int = 1) {
        guard cumleEkle != nil, kesinti != nil else { return }
        let kayit = Tanilama.ortak
        if deneme == 1 {
            kayit.kaydet("kesinti", ayrinti.isEmpty ? "bitti" : "bitti \(ayrinti)")
        }
        // Arka plandayken ses oturumu açılamaz; ön plana dönüşte yeniden denenir.
        guard UIApplication.shared.applicationState != .background else {
            kayit.kaydet("kesinti", "arka planda, dönüşte sürecek")
            return
        }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            oturumEtkin = true
            dahiliMikrofonuSec()
            try dinlemeyiAc()
            kesinti = nil
            kayit.kaydet("motor", "yeniden başlatıldı")
            yoluGuncelle()
            yoluKaydet(neden: nil)
            bildir?(.kesintiBitti)
        } catch {
            tur += 1
            gorev?.cancel()
            gorev = nil
            kutu.yonlendir(nil)
            motor.inputNode.removeTap(onBus: 0)
            motor.stop()
            if deneme < 2 {
                kayit.kaydet("motor", "başlatılamadı \(hataKodu(error)), yeniden denenecek", uyari: true)
                let no = oturumNo
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(yenidenDenemeArasi))
                    guard let self, no == self.oturumNo else { return }
                    self.surdur(deneme: 2)
                }
            } else {
                kayit.kaydet("motor", "başlatılamadı \(hataKodu(error))", uyari: true)
                hataylaBitir(HatHatasi(mesaj: "Mikrofon yeniden açılamadı. Dinlemeyi yeniden başlatın.",
                                       kod: "motor \(hataKodu(error))"))
            }
        }
    }

    /// K13: ses nesneleri yeniden kurulur, dinleme kullanıcı başlatmadan sürdürülmez (Ö-2).
    private func sesSistemiSifirlandi() {
        Tanilama.ortak.kaydet("ses sistemi", "sıfırlandı", uyari: true)
        if let ekle = cumleEkle {
            ekle.finish(throwing: HatHatasi(mesaj: "Ses sistemi yeniden başladı. Dinlemeyi yeniden başlatın.",
                                            kod: "medya servisleri sıfırlandı"))
            cumleEkle = nil
        }
        durdur()
        oturumEtkin = false
        motor = AVAudioEngine()
        yedekSes = AVSpeechSynthesizer()
        yedekSes.delegate = bekleyici
    }

    private func oturumuKapat() {
        guard oturumEtkin else { return }
        oturumEtkin = false
        // Başka uygulamaların sesi (müzik, podcast) kaldığı yerden sürsün.
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            // Apple belgesi: isBusy dönse de oturum etkisizleşir; yalnız kaydedilir (Ön-3).
            Tanilama.ortak.kaydet("ses oturumu", "kapatılamadı \(hataKodu(error))", uyari: true)
        }
    }

    /// Dinlemeyi Hat içinden açıklamayla bitirir (ekranda hata olarak görünür).
    private func hataylaBitir(_ hata: HatHatasi) {
        cumleEkle?.finish(throwing: hata)
        cumleEkle = nil
        durdur()
    }

    // MARK: Mikrofon ve bekçi

    /// Y1 sırası: bağlantı → tanıma → prepare → start; bekçi sıfırlanır.
    private func dinlemeyiAc() throws {
        let bicim = try Hat.mikrofonuBagla(motor.inputNode, kutu)
        Tanilama.ortak.kaydet("mikrofon", bicim)
        tanimayiBaslat()
        motor.prepare()
        try motor.start()
        kutu.sifirla()
        bekciyiKur()
    }

    /// Ses verisi ayrı bir iş parçacığında gelir; bu yüzden nonisolated. Bağlantı dinleme boyunca bir kez kurulur;
    /// tampon o anki tanıma isteğine yönlendirilir (C2). Biçim geçersizse sessizce dönmek yerine hata (Y2).
    private nonisolated static func mikrofonuBagla(_ giris: AVAudioInputNode, _ kutu: MikrofonKutusu) throws -> String {
        let bicim = giris.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0 else {
            throw HatHatasi(mesaj: "Mikrofon şu an kullanılamıyor. Başka bir uygulama kullanıyorsa kapatıp yeniden başlatın.",
                            kod: "mikrofon biçimi geçersiz")
        }
        giris.removeTap(onBus: 0)
        giris.installTap(onBus: 0, bufferSize: 1024, format: bicim) { tampon, _ in
            kutu.tampon(tampon)
        }
        return "\(Int(bicim.sampleRate)) Hz, \(bicim.channelCount) kanal"
    }

    /// C6: DİNLİYOR'da her saniye son tamponun zamanına bakar; 2 sn ses yoksa G11 (bekçi) → G12.
    private func bekciyiKur() {
        bekciGorevi?.cancel()
        let no = oturumNo
        bekciGorevi = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(bekciAraligi))
                guard !Task.isCancelled, let self, no == self.oturumNo else { return }
                self.bekciDenetle()
            }
        }
    }

    private func bekciDenetle() {
        guard cumleEkle != nil, kesinti == nil, kutu.gecen > bekciSiniri else { return }
        kesintiyeGir(.bekci)
        surdur()
    }

    // MARK: Konuşma tanıma

    /// Yeni bir tanıma isteği açar. Her cümleden sonra yeniden çağrılır.
    private func tanimayiBaslat() {
        guard let taniyici else { return }
        tur += 1
        let buTur = tur
        canliMetin = ""
        duraklamaGorevi?.cancel()

        let istek = SFSpeechAudioBufferRecognitionRequest()
        istek.shouldReportPartialResults = true
        istek.addsPunctuation = true                   // noktalama çeviriyi iyileştirir
        if taniyici.supportsOnDeviceRecognition {
            istek.requiresOnDeviceRecognition = true   // çevrimdışı, süre sınırı yok
        }
        kutu.yonlendir(istek)

        let acilis = Date()
        gorev = Hat.gorevAc(taniyici, istek) { [weak self] metin, bitti, hata in
            guard let self, buTur == self.tur else { return }
            // C1: sayaç yalnız metin gerçekten değişince sıfırlanır.
            if let metin, metin != self.canliMetin {
                self.canliMetin = metin
                self.bosBitis = 0
                self.duraklamayiKur()
            }
            if bitti { self.tanimaBitti(acilis: acilis, hata: hata) }
        }
    }

    private func duraklamayiKur() {
        duraklamaGorevi?.cancel()
        duraklamaGorevi = Task { [weak self] in
            try? await Task.sleep(for: .seconds(duraklama))
            guard !Task.isCancelled else { return }
            self?.cumleyiKapat()
        }
    }

    /// T2/T3: görev kendiliğinden bitti. Yarım cümle hemen gönderilir, yeni görev hemen açılır;
    /// art arda 5 kez 2 sn içinde sonuçsuz biterse dinleme hatayla durur (E2).
    private func tanimaBitti(acilis: Date, hata: TanimaHatasi?) {
        let neden = hata.map { "neden=hata \($0.kod) \($0.aciklama)" } ?? "neden=son sonuç"
        Tanilama.ortak.kaydet("tanıma bitti", neden, uyari: hata != nil, tekrarPenceresi: tanimaBitisPenceresi)

        let bos = canliMetin.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if bos && Date().timeIntervalSince(acilis) < bosBitisPenceresi {
            bosBitis += 1
            if bosBitis >= bosBitisSiniri {
                let kod = hata?.kod ?? "sonuçsuz"
                hataylaBitir(HatHatasi(mesaj: "Konuşma tanıma çalışmıyor (\(kod)). Dinlemeyi yeniden başlatın.",
                                       kod: "tanıma \(kod)"))
                return
            }
        } else if bos {
            bosBitis = 0
        }
        cumleyiKapat()
    }

    /// Tanıma sonuçlarını ana iş parçacığına taşır.
    /// `bitti`: tanıma görevi sona erdi (son sonuç geldi ya da hata oluştu).
    private nonisolated static func gorevAc(_ taniyici: SFSpeechRecognizer,
                                            _ istek: SFSpeechAudioBufferRecognitionRequest,
                                            _ olay: @escaping @MainActor (String?, Bool, TanimaHatasi?) -> Void)
    -> SFSpeechRecognitionTask {
        taniyici.recognitionTask(with: istek) { sonuc, hata in
            let metin = sonuc?.bestTranscription.formattedString
            let bitti = hata != nil || sonuc?.isFinal == true
            guard metin != nil || bitti else { return }
            let ozet = hata.map { h -> TanimaHatasi in
                let n = h as NSError
                return TanimaHatasi(kod: "\(n.domain)/\(n.code)", aciklama: n.localizedDescription)
            }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { olay(metin, bitti, ozet) }
            }
        }
    }

    /// Cümleyi gönderir ve dinlemeye kesintisiz devam eder.
    private func cumleyiKapat() {
        yarimCumleyiGonder()
        guard cumleEkle != nil, kesinti == nil else { return }
        tanimayiBaslat()
    }

    /// Ekrandaki yarım cümleyi akışa yazar ve tanıma görevini kapatır; yenisini açmaz.
    private func yarimCumleyiGonder() {
        duraklamaGorevi?.cancel()
        let metin = canliMetin.trimmingCharacters(in: .whitespacesAndNewlines)
        tur += 1
        gorev?.cancel()
        gorev = nil
        kutu.yonlendir(nil)
        canliMetin = ""
        guard !metin.isEmpty, let ekle = cumleEkle else { return }
        ekle.yield(metin)
        // Yalnız kelime sayısı; metin asla yazılmaz.
        Tanilama.ortak.kaydet("cümle", "kelime=\(metin.split(whereSeparator: \.isWhitespace).count)")
    }

    // MARK: Seslendirme

    func seslendir(_ metin: String) {
        guard cumleEkle != nil, kesinti == nil else {
            Tanilama.ortak.kaydet("ses", "atlandı (dinleme duraklatıldı)")
            return
        }
        sesSirasinaEkle.yield((sesNo, metin))
    }

    private func sesDongusunuBaslat() {
        guard !donguBasladi else { return }
        donguBasladi = true
        let sira = sesSirasi
        Task { [weak self] in
            for await (no, metin) in sira {
                guard let self else { return }
                await self.sesCal(no, metin)
            }
        }
    }

    /// Sıradaki öğeyi iptal edilebilir bir görevde çalar (Durdur uçuştaki Alania isteğini de keser).
    private func sesCal(_ no: Int, _ metin: String) async {
        guard no == sesNo else { return }   // durdurulmuş oturumdan kalma
        let calma = Task { await self.oku(no, metin) }
        sesGorevi = calma
        await calma.value
        sesGorevi = nil
    }

    private func oku(_ no: Int, _ metin: String) async {
        let anahtar = Anahtarlik.alaniaAnahtari
        guard !anahtar.isEmpty, !alaniaKapali else {
            await appleIleOku(no, metin)
            return
        }
        let ses = UserDefaults.standard.string(forKey: Kayit.alaniaSesi) ?? "alania2-f1"
        let bas = Date()
        let veri: Data
        do {
            veri = try await Hat.alaniaIste(metin, anahtar: anahtar, ses: ses)
        } catch {
            guard no == sesNo, !Task.isCancelled else { return }
            let sonuc = Hat.alaniaAyrinti(error)
            alaniaBasarisiz(sonuc.ayrinti, gecersiz: sonuc.gecersiz)
            await appleIleOku(no, metin)
            return
        }
        guard no == sesNo, !Task.isCancelled else { return }
        let o: AVAudioPlayer
        do {
            o = try AVAudioPlayer(data: veri)
        } catch {
            alaniaBasarisiz("ses çözülemedi", gecersiz: false)
            await appleIleOku(no, metin)
            return
        }
        Tanilama.ortak.kaydet("ses", "alania \(gecenMs(bas)) ms")
        alaniaHataSayisi = 0
        bildir?(.not(.alania, nil))
        o.delegate = bekleyici
        oynatici = o
        guard no == sesNo else { return }   // S3: çalmadan hemen önce
        await bekle(sigorta: o.duration + 2) { o.play() }
        oynatici = nil
    }

    private func appleIleOku(_ no: Int, _ metin: String) async {
        guard no == sesNo, !Task.isCancelled else { return }
        let soz = AVSpeechUtterance(string: metin)
        if let turkce = AVSpeechSynthesisVoice(language: "tr-TR") {
            soz.voice = turkce
        } else if !turkceSesYok {
            // S7: okuma yine denenir.
            turkceSesYok = true
            Tanilama.ortak.kaydet("ses", "Türkçe ses yok", uyari: true)
            bildir?(.not(.turkceSes, "Türkçe ses yüklü değil; çeviri başka bir sesle okunabilir."))
        }
        Tanilama.ortak.kaydet("ses", "apple")
        let sentez = yedekSes
        await bekle(sigorta: 4 + Double(metin.count) * 0.12) {
            sentez.speak(soz)
            return true
        }
    }

    /// Sesin bitişini (ya da iptalini) bekler. Temsilci hiç haber vermezse sigorta süresi sonunda geçilir.
    private func bekle(sigorta: TimeInterval, _ baslat: () -> Bool) async {
        let b = bekleyici
        let sigortaGorevi = Task {
            try? await Task.sleep(for: .seconds(sigorta))
            if !Task.isCancelled { b.bitir() }
        }
        await withCheckedContinuation { (devam: CheckedContinuation<Void, Never>) in
            b.basla(devam)
            if !baslat() { b.bitir() }
        }
        sigortaGorevi.cancel()
    }

    /// S4: çalan ses hemen kesilir, uçuştaki Alania isteği iptal edilir, sıra boşaltılır.
    private func sesiKes() {
        sesNo += 1
        sesGorevi?.cancel()
        sesGorevi = nil
        oynatici?.stop()
        oynatici = nil
        yedekSes.stopSpeaking(at: .immediate)
        bekleyici.bitir()
    }

    /// S5, S6, KR10: yedeğe düşüş notla söylenir; art arda 3 hatada (401/403'te hemen) oturum boyunca Apple sesi.
    private func alaniaBasarisiz(_ ayrinti: String, gecersiz: Bool) {
        alaniaHataSayisi += 1
        Tanilama.ortak.kaydet("ses", "alania hatası \(ayrinti)", uyari: true)
        if gecersiz || alaniaHataSayisi >= alaniaKesiciEsigi {
            if !alaniaKapali {
                alaniaKapali = true
                Tanilama.ortak.kaydet("ses", "alania bu oturumda kapatıldı, apple sesi kullanılacak", uyari: true)
            }
            bildir?(.not(.alania, gecersiz ? "Alania anahtarı geçersiz; Apple sesi kullanılıyor."
                                           : "Alania'ya ulaşılamadı; Apple sesi kullanılıyor."))
        } else {
            bildir?(.not(.alania, "Alania'ya ulaşılamadı; bu cümle Apple sesiyle okundu."))
        }
    }

    private nonisolated static func alaniaAyrinti(_ hata: Error) -> (ayrinti: String, gecersiz: Bool) {
        if let a = hata as? AlaniaHatasi { return ("http=\(a.http)", a.http == 401 || a.http == 403) }
        if let u = hata as? URLError {
            if u.code == .timedOut { return ("zaman aşımı", false) }
            if u.code == .notConnectedToInternet { return ("internet yok", false) }
            return ("ağ \(u.code.rawValue)", false)
        }
        return (hataKodu(hata), false)
    }

    /// Alania-2 API çağrısı: yalnız Türkçe çeviri metni ve ses adı gider (S9), WAV ses verisi döner.
    private nonisolated static func alaniaIste(_ metin: String, anahtar: String, ses: String) async throws -> Data {
        var istek = URLRequest(url: URL(string: alaniaAdres)!)
        istek.httpMethod = "POST"
        istek.timeoutInterval = alaniaSuresi
        istek.setValue("Bearer \(anahtar)", forHTTPHeaderField: "Authorization")
        istek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        istek.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": alaniaModel,
            "input": metin,
            "voice": ses,
        ])

        let (veri, yanit) = try await alaniaOturumu.data(for: istek)
        let kod = (yanit as? HTTPURLResponse)?.statusCode ?? 0
        guard kod == 200 else { throw AlaniaHatasi(http: kod) }
        return veri
    }
}

#if DEBUG
extension Hat {
    /// Simülatör ekran görüntüleri ve önizlemeler için: açıldıktan sonra gerçek ses yolu okunmaz,
    /// gözlemciler durumu ezmez; kulaklık ve uyarı elle verilir. Mikrofon, tanıma ve çeviri açılmaz.
    func onizlemeKipi(kulaklik: String?, yolUyarisi: String? = nil, canliMetin: String = "") {
        onizlemede = true
        self.kulaklik = kulaklik
        self.yolUyarisi = yolUyarisi
        self.canliMetin = canliMetin
    }
}
#endif
