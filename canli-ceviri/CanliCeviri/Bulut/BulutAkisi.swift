import AVFoundation
import Foundation

// Bulut motorunun ağ ve ses tarafı (S02): mikrofon sesi 16 kHz tek kanal 16 bit'e çevrilip Soniox'un canlı tanıma
// WebSocket'ine akar; yanıtları `SonioxCozucu` cümlelere ayırır. Ses oturumu, mikrofon bağlantısı, kesintiler ve
// seslendirme `Hat`'tedir ve iki motorda aynıdır (ilke 1 ve 2).
//
// Gizlilik (K5): anahtar yalnız bağlantı isteğinin `Authorization` başlığına konur; başlangıç iletisinde, Tanılama'da
// ve ekranda yoktur. Tanılama'ya konuşma ya da çeviri metni yazılmaz; yalnız süre, sayı, hata kodu ve dil kodu yazılır.

/// Bulut akışının `Hat`'e ilettiği olaylar.
enum BulutOlayi {
    /// Kapanmamış metin: canlı asıl metin ve akan çeviri.
    case canli(asil: String, ceviri: String)
    case cumle(SonioxCumle)
    /// Akış başladı (sunucu ilk ping'i yanıtladı): artık dinleniyor.
    case akista
    /// Bağlantı koptu, yeni akış denenecek (KR5). `akiyordu`: o sırada söylenenler kaybolmuş olabilir.
    case koptu(akiyordu: Bool)
    /// Bulut motoru çalışamıyor; dinleme Türkçe açıklamayla durur (KR1).
    case durdu(HatHatasi)
}

/// Ağ hatasının özeti: yalnız alan/kod. Sistem açıklaması alınmaz (ilke 3).
struct BulutAgHatasi: Sendable {
    let kod: String
    let internetYok: Bool

    init(kod: String, internetYok: Bool = false) {
        self.kod = kod
        self.internetYok = internetYok
    }

    init(_ hata: Error) {
        let n = hata as NSError
        kod = "\(n.domain)/\(n.code)"
        let internetKodlari = [NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed,
                               NSURLErrorInternationalRoamingOff]
        internetYok = n.domain == NSURLErrorDomain && internetKodlari.contains(n.code)
    }
}

/// Soniox bağlantıları: çerez ve önbellek tutmayan oturum; bağlantı yoksa beklemeden hata verir.
private let bulutOturumu: URLSession = {
    let ayar = URLSessionConfiguration.ephemeral
    ayar.waitsForConnectivity = false
    return URLSession(configuration: ayar)
}()

/// Dönüştürücüye tek bir tamponu bir kez verir (giriş bloğu yalnız bu kutuyu yakalar).
private final class TamponKutusu: @unchecked Sendable {
    private var tampon: AVAudioPCMBuffer?

    init(_ tampon: AVAudioPCMBuffer) {
        self.tampon = tampon
    }

    func al() -> AVAudioPCMBuffer? {
        let verilen = tampon
        tampon = nil
        return verilen
    }
}

/// Mikrofon tamponlarını 16 kHz, tek kanal, 16 bit (`pcm_s16le`) sese çevirir ve yaklaşık 100 ms'lik ikili
/// çerçevelerle gönderir (KR3). Ses iş parçacığından ve ana aktörden erişildiği için kilitle korunur.
final class BulutSesHedefi: @unchecked Sendable {
    private let kilit = NSLock()
    private let hedefBicim = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1,
                                           interleaved: true)
    private var girisBicimi: AVAudioFormat?
    private var donusturucu: AVAudioConverter?
    private var baglanti: URLSessionWebSocketTask?
    private var birikim = Data()
    private var gonderilenBayt = 0
    private var donusumHatasi = false

    /// Sesin gideceği bağlantı; nil ise ses gönderilmez, yalnız son 1 saniye bekletilir (bağlantı kurulurken).
    func bagla(_ yeni: URLSessionWebSocketTask?) {
        kilit.lock()
        defer { kilit.unlock() }
        baglanti = yeni
        if yeni == nil {
            birikim = Data()
        } else {
            gonder()
        }
    }

    /// Ses iş parçacığında çağrılır.
    func tampon(_ tampon: AVAudioPCMBuffer) {
        kilit.lock()
        defer { kilit.unlock() }
        guard let hedefBicim = hedefBicim, tampon.frameLength > 0 else { return }
        let giris = tampon.format
        if girisBicimi != giris {
            // İlk tampon ya da ses yolu değişti: dönüştürücü mikrofonun o anki biçimiyle kurulur.
            girisBicimi = giris
            donusturucu = AVAudioConverter(from: giris, to: hedefBicim)
            if donusturucu == nil { donusumHatasi = true }
        }
        guard let cevirici = donusturucu, giris.sampleRate > 0 else { return }
        let oran = hedefBicim.sampleRate / giris.sampleRate
        let kapasite = AVAudioFrameCount(Double(tampon.frameLength) * oran) + 64
        guard let cikis = AVAudioPCMBuffer(pcmFormat: hedefBicim, frameCapacity: kapasite) else { return }
        let kaynak = TamponKutusu(tampon)
        var hata: NSError?
        let durum = cevirici.convert(to: cikis, error: &hata) { _, girisDurumu in
            guard let verilen = kaynak.al() else {
                girisDurumu.pointee = .noDataNow
                return nil
            }
            girisDurumu.pointee = .haveData
            return verilen
        }
        if durum == .error || hata != nil {
            donusumHatasi = true
            return
        }
        guard let kanal = cikis.int16ChannelData, cikis.frameLength > 0 else { return }
        birikim.append(Data(bytes: kanal[0], count: Int(cikis.frameLength) * 2))
        gonder()
    }

    /// Gönderilen sesin süresi, sn (Tanılama için); sayaç sıfırlanır.
    func gonderilenSaniye() -> Int {
        kilit.lock()
        defer { kilit.unlock() }
        let saniye = gonderilenBayt / 32_000
        gonderilenBayt = 0
        return saniye
    }

    /// Mikrofon sesi dönüştürülemedi mi.
    var hataVar: Bool {
        kilit.lock()
        defer { kilit.unlock() }
        return donusumHatasi
    }

    /// Kilit altında çağrılır. Bir iletide en çok 100 ms ses gider (sınır 2.097.144 bayt).
    private func gonder() {
        guard let gorev = baglanti else {
            if birikim.count > bulutOnBellekBayt {
                birikim = Data(birikim.suffix(bulutOnBellekBayt))
            }
            return
        }
        while birikim.count >= bulutCerceveBayt {
            let cerceve = Data(birikim.prefix(bulutCerceveBayt))
            birikim = Data(birikim.dropFirst(bulutCerceveBayt))
            gonderilenBayt += cerceve.count
            gorev.send(.data(cerceve)) { _ in }
        }
    }
}

/// Bir dinleme oturumunun Soniox akışı: bağlanır, başlangıç iletisini gönderir, ping ile bağlantıyı denetler,
/// yanıtları çözücüye verir, kopmada en çok iki kez yeni akış dener (KR5).
@MainActor
final class BulutAkisi {
    /// `Hat` bağlar.
    var olay: (@MainActor (BulutOlayi) -> Void)?
    /// Mikrofon tamponlarının gittiği yer (`MikrofonKutusu` yönlendirir).
    let hedef = BulutSesHedefi()
    /// Akış başladı ve bağlantı sağlam: yalnız bu doğruyken ekran "Dinliyorum" diyebilir (K6).
    private(set) var akista = false

    private let kaynak: String?
    private let hedefDil: String
    private let anahtar: String
    private var baglanti: URLSessionWebSocketTask?
    /// Bağlantı kuşağı: her açılış ve kapanışta artar; eski geri çağrılar yan etki yapmadan çıkar.
    private var no = 0
    private var cozucu = SonioxCozucu()
    private var saatGorevi: Task<Void, Never>?
    private var almaGorevi: Task<Void, Never>?
    private var denemeGorevi: Task<Void, Never>?
    private var deneme = 0
    /// Bu dinleme oturumunda akış hiç başlamadı (ilk bağlantıda internet yoksa yeniden denenmez).
    private var hicAkmadi = true
    private var internetYok = false
    private var acilis = Date()
    private var ilkSonucBekleniyor = true
    private var pingNo = 0
    private var bekleyenPing: Int?
    private var sonPing = Date()
    /// Sunucudan son ileti (yanıt ya da pong) ne zaman geldi.
    private var sonGelen = Date.distantPast

    /// `kaynak` nil ise dil kendiliğinden tanınır (KR12). `anahtar` yalnız bağlantı isteğinin başlığına konur.
    init(kaynak: String?, hedef: String, anahtar: String) {
        self.kaynak = kaynak
        self.hedefDil = hedef
        self.anahtar = anahtar
    }

    /// Akışı açar; açıksa, bağlanıyorsa ya da yeniden deneme bekliyorsa dokunmaz (kesintiden dönüşte de çağrılır).
    func ac() {
        guard baglanti == nil, denemeGorevi == nil else { return }
        deneme = 0
        internetYok = false
        baglan()
    }

    /// Akışı boş metin çerçevesiyle bitirir ve bağlantıyı kapatır (Durdur, arama ve arka plan kesintisi; K7).
    func kapat() {
        denemeGorevi?.cancel()
        denemeGorevi = nil
        birak(bitir: true)
    }

    // MARK: Bağlantı

    private func baglan() {
        guard let adres = URL(string: sonioxAdres) else { return }
        no += 1
        let buNo = no
        akista = false
        ilkSonucBekleniyor = true
        bekleyenPing = nil
        sonPing = Date()
        sonGelen = Date.distantPast
        acilis = Date()
        cozucu = SonioxCozucu()
        Tanilama.ortak.kaydet("bulut", deneme == 0 ? "bağlanıyor" : "bağlanıyor deneme=\(deneme + 1)")

        var istek = URLRequest(url: adres)
        istek.timeoutInterval = bulutBaslamaSuresi
        istek.setValue("Bearer \(anahtar)", forHTTPHeaderField: "Authorization")
        let gorev = bulutOturumu.webSocketTask(with: istek)
        baglanti = gorev
        gorev.resume()

        // İlk metin çerçevesi: başlangıç iletisi (anahtar içermez). Ses ancak o gittikten sonra akar.
        let baslangic = SonioxCozucu.baslangicIletisi(kaynak: kaynak, hedef: hedefDil)
        BulutAkisi.gonder(gorev, baslangic) { [weak self] hata in
            guard let self, buNo == self.no else { return }
            if let hata {
                self.koptu(hata)
                return
            }
            self.hedef.bagla(gorev)
            self.pingGonder()   // bu ping akış başlayınca yanıtlanır
        }
        dinle(gorev, buNo)
        saatiKur(buNo)
    }

    /// Bağlantıyı bırakır; bekleyen cümle varsa çıkarır. `bitir`: boş metin çerçevesiyle (K7).
    private func birak(bitir: Bool) {
        no += 1
        saatGorevi?.cancel()
        saatGorevi = nil
        almaGorevi?.cancel()
        almaGorevi = nil
        hedef.bagla(nil)
        akista = false
        bekleyenPing = nil
        guard let gorev = baglanti else { return }
        baglanti = nil
        Tanilama.ortak.kaydet("bulut", "ses gönderildi \(hedef.gonderilenSaniye()) sn")
        Tanilama.ortak.kaydet("bulut", "kapandı süre=\(Int(Date().timeIntervalSince(acilis))) sn")
        BulutAkisi.kapatGorev(gorev, bitir: bitir)
        ilet(cozucu.kapat(simdi: BulutAkisi.saat()))
    }

    /// Bağlantı koptu ya da kurulamadı (pong gelmedi, ağ hatası, sunucu kapattı).
    private func koptu(_ hata: BulutAgHatasi) {
        guard baglanti != nil else { return }
        Tanilama.ortak.kaydet("bulut", "koptu \(hata.kod)", uyari: true)
        internetYok = hata.internetYok
        yenidenDene()
    }

    /// KR5: yeni akış en çok `bulutDenemeSiniri` kez denenir; olmazsa dinleme Türkçe hatayla durur.
    private func yenidenDene() {
        let akiyordu = akista
        birak(bitir: false)
        if internetYok && hicAkmadi {
            durdur(HatHatasi(mesaj: BulutAkisi.internetMesaji, kod: "bulut internet yok"))
            return
        }
        guard deneme < bulutDenemeSiniri else {
            durdur(HatHatasi(mesaj: internetYok ? BulutAkisi.internetMesaji : BulutAkisi.kopmaMesaji,
                             kod: "bulut bağlantı kurulamadı"))
            return
        }
        deneme += 1
        olay?(.koptu(akiyordu: akiyordu))
        let bekleme = bulutDenemeArasi * Double(deneme)
        denemeGorevi = Task { [weak self] in
            try? await Task.sleep(for: .seconds(bekleme))
            guard let self, !Task.isCancelled else { return }
            self.denemeGorevi = nil
            self.baglan()
        }
    }

    /// Bulut motoru çalışamıyor: bağlantı bırakılır, `Hat` dinlemeyi açıklamayla bitirir.
    private func durdur(_ hata: HatHatasi) {
        denemeGorevi?.cancel()
        denemeGorevi = nil
        birak(bitir: false)
        olay?(.durdu(hata))
    }

    // MARK: Gelen iletiler

    private func dinle(_ gorev: URLSessionWebSocketTask, _ buNo: Int) {
        almaGorevi?.cancel()
        almaGorevi = Task { [weak self] in
            while !Task.isCancelled {
                let gelen = await BulutAkisi.al(gorev)
                guard let self, buNo == self.no, !Task.isCancelled else { return }
                switch gelen {
                case .metin(let metin):
                    self.iletiGeldi(metin)
                case .diger:
                    break
                case .hata(let hata):
                    self.koptu(hata)
                    return
                }
            }
        }
    }

    private func iletiGeldi(_ metin: String) {
        sonGelen = Date()
        var okundu = true
        for olay in cozucu.isle(metin, simdi: BulutAkisi.saat()) {
            switch olay {
            case .canli, .cumle:
                akisBasladi()
                ilet([olay])
            case .pong(let kimlik):
                if kimlik == nil || kimlik == bekleyenPing { bekleyenPing = nil }
            case .bitti:
                // Boş çerçeve göndermeden gelen `finished`: sunucu akışı kendisi bitirdi.
                koptu(BulutAgHatasi(kod: "sunucu bitirdi"))
                return
            case .hata(let hata):
                Tanilama.ortak.kaydet("bulut", "hata \(hata.kod) \(hata.tur)", uyari: true)
                if hata.sinif.yenidenDenenir {
                    internetYok = false
                    yenidenDene()
                } else {
                    durdur(HatHatasi(mesaj: hata.sinif.ekranMetni, kod: "bulut \(hata.kod) \(hata.tur)"))
                }
                return
            case .bozuk:
                okundu = false
                Tanilama.ortak.kaydet("bulut", "bozuk yanıt", uyari: true, tekrarPenceresi: 5)
            }
        }
        // Hata olmayan her yanıt (pong ya da belirteç yanıtı) akışın başladığını gösterir.
        if okundu { akisBasladi() }
    }

    /// Canlı metni ve kapanan cümleleri `Hat`'e iletir. Tanılama'ya yalnız kelime sayısı ve dil kodu yazılır.
    private func ilet(_ olaylar: [SonioxOlayi]) {
        for olay in olaylar {
            switch olay {
            case .canli(let asil, let ceviri):
                ilkSonucuKaydet(bos: asil.isEmpty && ceviri.isEmpty)
                self.olay?(.canli(asil: asil, ceviri: ceviri))
            case .cumle(let cumle):
                ilkSonucuKaydet(bos: false)
                var ayrinti = "kelime=\(cumle.kelime)"
                if let dil = cumle.dil { ayrinti += " dil=\(dil)" }
                Tanilama.ortak.kaydet("cümle", ayrinti)
                self.olay?(.cumle(cumle))
            case .pong, .bitti, .hata, .bozuk:
                break
            }
        }
    }

    private func ilkSonucuKaydet(bos: Bool) {
        guard ilkSonucBekleniyor, !bos else { return }
        ilkSonucBekleniyor = false
        Tanilama.ortak.kaydet("bulut", "ilk sonuç \(gecenMs(acilis)) ms")
    }

    private func akisBasladi() {
        guard !akista else { return }
        akista = true
        hicAkmadi = false
        deneme = 0
        Tanilama.ortak.kaydet("bulut", "akış başladı \(gecenMs(acilis)) ms")
        olay?(.akista)
    }

    // MARK: Saat: bekleyen cümle, ping, pong

    private func saatiKur(_ buNo: Int) {
        saatGorevi?.cancel()
        saatGorevi = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(bulutSaatAraligi))
                guard !Task.isCancelled, let self, buNo == self.no else { return }
                self.tik()
            }
        }
    }

    private func tik() {
        guard baglanti != nil else { return }
        if hedef.hataVar {
            Tanilama.ortak.kaydet("bulut", "ses dönüştürülemedi", uyari: true)
            durdur(HatHatasi(mesaj: "Mikrofon sesi buluta uygun biçime çevrilemedi. Dinlemeyi yeniden başlatın.",
                             kod: "bulut ses dönüşümü"))
            return
        }
        ilet(cozucu.zamanGecti(simdi: BulutAkisi.saat()))
        let gecen = Date().timeIntervalSince(sonPing)
        if bekleyenPing != nil {
            // KR5: pong süresinde gelmedi. Akış başlamadan gönderilen ilk ping akış başlayınca yanıtlanır;
            // ona bağlantı ve başlama süresi kadar beklenir.
            guard gecen > (akista ? bulutPingAraligi : bulutBaslamaSuresi) else { return }
            if sonGelen > sonPing {
                // Pong yok ama sunucu ping'den sonra yanıt gönderdi: bağlantı canlı, kopmuş sayılmaz.
                Tanilama.ortak.kaydet("bulut", "pong gelmedi, yanıtlar sürüyor", uyari: true, tekrarPenceresi: 60)
                pingGonder()
            } else {
                koptu(BulutAgHatasi(kod: "pong yok"))
            }
        } else if gecen >= bulutPingAraligi {
            pingGonder()
        }
    }

    private func pingGonder() {
        guard let gorev = baglanti else { return }
        pingNo += 1
        bekleyenPing = pingNo
        sonPing = Date()
        BulutAkisi.gonder(gorev, SonioxCozucu.pingIletisi(pingNo)) { _ in }
    }

    // MARK: Ağ (ana aktör dışında)

    private enum Gelen {
        case metin(String)
        case diger
        case hata(BulutAgHatasi)
    }

    private nonisolated static func al(_ gorev: URLSessionWebSocketTask) async -> Gelen {
        do {
            let ileti = try await gorev.receive()
            if case .string(let metin) = ileti { return .metin(metin) }
            return .diger
        } catch {
            return .hata(BulutAgHatasi(error))
        }
    }

    /// Metin çerçevesi gönderir; sonucu ana aktöre taşır (yalnız hata özeti).
    private nonisolated static func gonder(_ gorev: URLSessionWebSocketTask, _ metin: String,
                                           _ sonuc: @escaping @MainActor (BulutAgHatasi?) -> Void) {
        gorev.send(.string(metin)) { hata in
            let ozet = hata.map { BulutAgHatasi($0) }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { sonuc(ozet) }
            }
        }
    }

    /// K7: boş metin çerçevesi akışı bitirir; sunucu son yanıtları gönderip bağlantıyı kapatır. Kapanmazsa kısa bir
    /// süre sonra bağlantı buradan kapatılır (ücret akış süresine göre işler).
    private nonisolated static func kapatGorev(_ gorev: URLSessionWebSocketTask, bitir: Bool) {
        guard bitir else {
            gorev.cancel(with: .goingAway, reason: nil)
            return
        }
        gorev.send(.string("")) { _ in }
        DispatchQueue.global().asyncAfter(deadline: .now() + bulutBitisSuresi) {
            gorev.cancel(with: .normalClosure, reason: nil)
        }
    }

    /// Çözücünün saati: tekdüze artan saniye.
    private nonisolated static func saat() -> TimeInterval {
        ProcessInfo.processInfo.systemUptime
    }

    private static let internetMesaji =
        "İnternet bağlantısı yok. Bulut motoru için internet gerekli; bağlanıp yeniden başlatın ya da Ayarlar'dan cihaz motoruna geçin."
    private static let kopmaMesaji =
        "Bulut bağlantısı koptu ve yeniden kurulamadı. Yeniden başlatın ya da Ayarlar'dan cihaz motoruna geçin."
}
