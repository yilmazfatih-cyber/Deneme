import AVFoundation
import Foundation

// Bulut motorunun ağ ve ses tarafı (S02): mikrofon sesi 16 kHz tek kanal 16 bit'e çevrilip Soniox'un canlı tanıma
// WebSocket'ine akar; yanıtları `SonioxCozucu` cümlelere ayırır. Ses oturumu, mikrofon bağlantısı, kesintiler ve
// seslendirme `Hat`'tedir ve iki motorda aynıdır (ilke 1 ve 2).
//
// Gizlilik (K5): anahtar yalnız bağlantı isteğinin `Authorization` başlığına konur; başlangıç iletisinde, Tanılama'da
// ve ekranda yoktur. Tanılama'ya konuşma ya da çeviri metni yazılmaz; yalnız süre, sayı, hata kodu ve dil kodu yazılır.
//
// S03: mağaza yapısında anahtar geçici anahtar sunucusundan gelir ve tek bir akışı, sınırlı süre ("dilim") açar.
// Dinleme sürerken dilim bitmeden yeni anahtarla ikinci bir akış açılır ve ses ona devredilir (bkz. `BulutAkisi`,
// zamanlama kararı `DilimPlani`).

/// Bulut akışının `Hat`'e ilettiği olaylar.
enum BulutOlayi {
    /// Kapanmamış metin: canlı asıl metin ve akan çeviri.
    case canli(asil: String, ceviri: String)
    case cumle(SonioxCumle)
    /// Akış başladı (sunucu ilk ping'i yanıtladı): artık dinleniyor.
    case akista
    /// Bağlantı koptu, yeni akış denenecek (KR5). `akiyordu`: o sırada söylenenler kaybolmuş olabilir.
    case koptu(akiyordu: Bool)
    /// Dilim bitti (ya da devir hazırlanırken akış kapandı) ve yeni akış henüz başlamadı: ses bekletiliyor, ekran
    /// "Dinliyorum" demez (S03). Yeni akış başlayınca `akista` gelir.
    case bekliyor
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

/// Tek bir Soniox WebSocket bağlantısı ve yalnız ona ait durum: çözücü, ping ve alma döngüsü. Dilim devrinde (S03)
/// iki bağlantı kısa süre birlikte yaşar; metinleri karışmasın diye her birinin kendi çözücüsü vardır.
@MainActor
private final class BulutBaglantisi {
    let gorev: URLSessionWebSocketTask
    /// Sunucudan gelen geçici anahtarla açıldıysa dilimin süresi, sn; gömülü ya da kullanıcı anahtarında nil.
    let sureSn: Int?
    /// Dilimin başı: anahtarın alındığı an (çözücü saatiyle, sn).
    let dilimBasi: TimeInterval
    let acilis = Date()
    var cozucu = SonioxCozucu()
    var almaGorevi: Task<Void, Never>?
    /// Başlangıç iletisi gönderildi: ses bu bağlantıya akabilir.
    var hazir = false
    /// Sunucu yanıt verdi (pong ya da belirteç): akış başladı.
    var akista = false
    /// Dilim devriyle etkinleşti: bağlantı zaten kuruludur, pong için başlama süresi kadar beklenmez.
    var devralindi = false
    var ilkSonucBekleniyor = true
    var pingNo = 0
    var bekleyenPing: Int?
    var sonPing = Date()
    /// Sunucudan son ileti (yanıt ya da pong) ne zaman geldi.
    var sonGelen = Date.distantPast

    init(gorev: URLSessionWebSocketTask, sureSn: Int?, dilimBasi: TimeInterval) {
        self.gorev = gorev
        self.sureSn = sureSn
        self.dilimBasi = dilimBasi
    }
}

/// Bir dinleme oturumunun Soniox akışı: bağlanır, başlangıç iletisini gönderir, ping ile bağlantıyı denetler,
/// yanıtları çözücüye verir, kopmada en çok iki kez yeni akış dener (KR5).
///
/// Dilim devri (S03): anahtar sunucudan geldiyse akış `sure_sn` sonra kapanır. Dilim bitmeden yeni anahtar istenir,
/// ikinci bir bağlantı (`yedek`) açılır ve uygun ilk anda (cümle arasında, en geç dilimin son saniyelerinde)
/// mikrofon sesi ona yönlenir; eski bağlantı (`biten`) boş metin çerçevesiyle bitirilir ve son yanıtları ekrana
/// işlenir. Zamanlama kararını `DilimPlani` verir. Gömülü ya da kullanıcı anahtarında dilim yoktur, devir yapılmaz.
@MainActor
final class BulutAkisi {
    /// `Hat` bağlar.
    var olay: (@MainActor (BulutOlayi) -> Void)?
    /// Mikrofon tamponlarının gittiği yer (`MikrofonKutusu` yönlendirir).
    let hedef = BulutSesHedefi()
    /// Sesin gittiği akış başladı ve bağlantı sağlam: yalnız bu doğruyken ekran "Dinliyorum" diyebilir (K6).
    private(set) var akista = false

    private let kaynak: String?
    private let hedefDil: String
    /// Mikrofon sesinin gittiği bağlantı.
    private var etkin: BulutBaglantisi?
    /// Dilim devri için hazırlanan yeni bağlantı; ses henüz gitmiyor.
    private var yedek: BulutBaglantisi?
    /// Devirden sonra boş metin çerçevesiyle bitirilen eski bağlantı: son yanıtları (kalan çeviri) işlenir.
    private var biten: BulutBaglantisi?
    /// `biten` için en geç kapanış anı (sunucu `finished` göndermezse).
    private var bitenSonu = Date.distantPast
    /// `biten` sürerken yeni akıştan gelen olaylar: eski akışın cümlelerinden sonra, sırayla ekrana verilir.
    private var bekleyenOlaylar: [SonioxOlayi] = []
    /// İlk bağlantı ya da yeniden bağlanma için anahtarın `SonioxAnahtarKaynagi`'ndan istenmesi sürüyor.
    private var anahtarGorevi: Task<Void, Never>?
    /// Dilim devri için yeni anahtarın istenmesi sürüyor.
    private var yenilemeGorevi: Task<Void, Never>?
    /// Etkin dilimin zamanlaması; gömülü ya da kullanıcı anahtarında nil (devir yok).
    private var plan: DilimPlani?
    /// Etkin dilimin başı (çözücü saatiyle, sn).
    private var dilimBasi: TimeInterval = 0
    private var yenileme = DilimPlani.Yenileme.istenmedi
    /// Yeni anahtar ya da yeni akış alınamadıysa dilim bitince ekranda gösterilecek açıklama.
    private var yenilemeHatasi: HatHatasi?
    /// Eski akış kapandı (dilim bitti ya da devir hazırlanırken koptu), yeni akış bekleniyor; ses bekletiliyor.
    private var devirBekleniyor = false
    /// Oturum kuşağı: her açılış ve kapanışta artar; eski görevler yan etki yapmadan çıkar. Devirde değişmez.
    private var no = 0
    private var saatGorevi: Task<Void, Never>?
    private var denemeGorevi: Task<Void, Never>?
    private var deneme = 0
    /// Bu dinleme oturumunda akış hiç başlamadı (ilk bağlantıda internet yoksa yeniden denenmez).
    private var hicAkmadi = true
    private var internetYok = false

    /// `kaynak` nil ise dil kendiliğinden tanınır (KR12). Anahtar burada tutulmaz: her yeni akışta
    /// `SonioxAnahtarKaynagi`'ndan istenir ve yalnız bağlantı isteğinin başlığına konur.
    init(kaynak: String?, hedef: String) {
        self.kaynak = kaynak
        self.hedefDil = hedef
    }

    /// Akışı açar; açıksa, bağlanıyorsa, devir ya da yeniden deneme bekliyorsa dokunmaz (kesintiden dönüşte de çağrılır).
    func ac() {
        guard etkin == nil, yedek == nil, !devirBekleniyor, denemeGorevi == nil, anahtarGorevi == nil else { return }
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

    /// Yeni akış: önce anahtar `SonioxAnahtarKaynagi`'ndan istenir (her akışta yeniden), sonra bağlantı açılır.
    private func baglan() {
        no += 1
        let buNo = no
        akista = false
        Tanilama.ortak.kaydet("bulut", deneme == 0 ? "bağlanıyor" : "bağlanıyor deneme=\(deneme + 1)")
        anahtarGorevi?.cancel()
        anahtarGorevi = Task { [weak self] in
            let sonuc = await BulutAkisi.anahtarIste()
            guard let self, buNo == self.no, !Task.isCancelled else { return }
            self.anahtarGorevi = nil
            switch sonuc {
            case .success(let anahtar):
                guard let yeni = self.baglantiyiAc(anahtar) else {
                    self.durdur(BulutAkisi.hatHatasi(.anahtarYok))
                    return
                }
                self.etkin = yeni
                self.planiKur(yeni)
                self.saatiKur(buNo)
            case .failure(let hata):
                // Değer de işlem de kayda yazılmaz; sunucunun hata kodu `sunucu` olayındadır.
                Tanilama.ortak.kaydet("bulut", "anahtar alınamadı", uyari: true)
                self.durdur(BulutAkisi.hatHatasi(hata))
            }
        }
    }

    /// Yeni bir bağlantı açar ve başlangıç iletisini gönderir. `anahtar` yalnız burada, bağlantı isteğinin
    /// `Authorization` başlığında kullanılır (K5); saklanmaz. Çağıran dönen bağlantıyı hemen `etkin` ya da `yedek`
    /// yapar; sahipsiz kalan bağlantının geri çağrıları yan etki yapmadan çıkar (`yasiyor`).
    private func baglantiyiAc(_ anahtar: SonioxAnahtari) -> BulutBaglantisi? {
        guard let adres = URL(string: sonioxAdres) else { return nil }
        var istek = URLRequest(url: adres)
        istek.timeoutInterval = bulutBaslamaSuresi
        istek.setValue("Bearer \(anahtar.anahtar)", forHTTPHeaderField: "Authorization")
        let gorev = bulutOturumu.webSocketTask(with: istek)
        let yeni = BulutBaglantisi(gorev: gorev, sureSn: anahtar.sureSn, dilimBasi: BulutAkisi.saat())
        gorev.resume()

        // İlk metin çerçevesi: başlangıç iletisi (anahtar içermez). Ses ancak o gittikten sonra akar.
        let baslangic = SonioxCozucu.baslangicIletisi(kaynak: kaynak, hedef: hedefDil)
        BulutAkisi.gonder(gorev, baslangic) { [weak self] hata in
            guard let self, self.yasiyor(yeni) else { return }
            if let hata {
                self.baglantiKoptu(yeni, hata)
            } else {
                self.baglantiHazir(yeni)
            }
        }
        dinle(yeni)
        return yeni
    }

    /// Bağlantı hâlâ bu akışın bir parçası mı (bırakılan bağlantının geç gelen geri çağrıları elenir).
    private func yasiyor(_ b: BulutBaglantisi) -> Bool {
        b === etkin || b === yedek || b === biten
    }

    /// Başlangıç iletisi gitti: etkin bağlantıya ses akmaya başlar; yedek bağlantı devre hazırdır.
    private func baglantiHazir(_ b: BulutBaglantisi) {
        b.hazir = true
        if b === etkin {
            hedef.bagla(b.gorev)
            pingGonder(b)   // bu ping akış başlayınca yanıtlanır
        } else if b === yedek {
            yenileme = .hazir
            Tanilama.ortak.kaydet("bulut", "yeni akış hazır \(gecenMs(b.acilis)) ms")
            pingGonder(b)   // her ileti sunucudaki boşta kalma süresini sıfırlar
            dilimiDenetle()
        }
    }

    /// Etkin dilimin zamanlamasını kurar (ilk bağlantıda ve her devirde).
    private func planiKur(_ b: BulutBaglantisi) {
        plan = b.sureSn.map { DilimPlani(sureSn: $0) }
        dilimBasi = b.dilimBasi
        yenileme = .istenmedi
        yenilemeHatasi = nil
        devirBekleniyor = false
    }

    /// Bütün bağlantıları bırakır; bekleyen cümle varsa çıkarır. `bitir`: etkin akış boş metin çerçevesiyle (K7).
    private func birak(bitir: Bool) {
        no += 1
        saatGorevi?.cancel()
        saatGorevi = nil
        anahtarGorevi?.cancel()
        anahtarGorevi = nil
        yenilemeGorevi?.cancel()
        yenilemeGorevi = nil
        hedef.bagla(nil)
        akista = false
        plan = nil
        yenileme = .istenmedi
        yenilemeHatasi = nil
        devirBekleniyor = false
        let eskiBiten = biten
        let eskiYedek = yedek
        let eskiEtkin = etkin
        biten = nil
        yedek = nil
        etkin = nil
        let bekleyenler = bekleyenOlaylar
        bekleyenOlaylar = []
        let simdi = BulutAkisi.saat()

        if let b = eskiYedek {
            b.almaGorevi?.cancel()
            BulutAkisi.kapatGorev(b.gorev, bitir: false)
        }
        // Sıra korunur: önce devirde bitirilen eski akışın cümlesi, sonra yeni akışın bekletilen olayları.
        if let b = eskiBiten {
            b.almaGorevi?.cancel()
            BulutAkisi.kapatGorev(b.gorev, bitir: false)
            yay(b.cozucu.kapat(simdi: simdi))
        }
        yay(bekleyenler)
        guard let b = eskiEtkin else { return }
        b.almaGorevi?.cancel()
        Tanilama.ortak.kaydet("bulut", "ses gönderildi \(hedef.gonderilenSaniye()) sn")
        Tanilama.ortak.kaydet("bulut", "kapandı süre=\(Int(Date().timeIntervalSince(b.acilis))) sn")
        BulutAkisi.kapatGorev(b.gorev, bitir: bitir)
        yay(b.cozucu.kapat(simdi: simdi))
    }

    /// Bir bağlantı koptu ya da kurulamadı (pong gelmedi, ağ hatası, sunucu kapattı).
    private func baglantiKoptu(_ b: BulutBaglantisi, _ hata: BulutAgHatasi) {
        if b === biten {
            bitenTamam()   // bitirilen eski akışın kapanması beklenen bitiştir
        } else if b === yedek {
            Tanilama.ortak.kaydet("bulut", "yeni akış kurulamadı \(hata.kod)", uyari: true)
            let mesaj = hata.internetYok ? BulutAkisi.internetMesaji : BulutAkisi.kopmaMesaji
            yedekDustu(HatHatasi(mesaj: mesaj, kod: "bulut yeni akış kurulamadı"), kesin: false)
        } else if b === etkin {
            Tanilama.ortak.kaydet("bulut", "koptu \(hata.kod)", uyari: true)
            etkinDustu(internetYok: hata.internetYok)
        }
    }

    /// Etkin akış koptu ya da geçici bir sunucu hatası verdi. Dilim devri hazırlanıyorsa yeni akış beklenir (yeni
    /// anahtar zaten yoldadır); değilse yeni akış en çok `bulutDenemeSiniri` kez denenir (KR5).
    private func etkinDustu(internetYok yok: Bool) {
        if yedek != nil || yenilemeGorevi != nil {
            etkinKapandi()
            return
        }
        internetYok = yok
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

    // MARK: Dilim devri (S03)

    /// `DilimPlani`'nın kararını uygular. Saat her adımda, ayrıca cümle kapanınca ve yenileme durumu değişince çağırır.
    private func dilimiDenetle() {
        guard let plan else { return }
        let gecen = BulutAkisi.saat() - dilimBasi
        let cumleArasi = etkin?.cozucu.cumleArasinda ?? true
        switch plan.karar(gecen: gecen, yenileme: yenileme, cumleArasi: cumleArasi, akisKapandi: devirBekleniyor) {
        case .bekle:
            break
        case .anahtarIste:
            yenilemeyiBaslat()
        case .devret:
            devret()
        case .dur:
            // Yeni anahtar alınamadı ve dilim bitti: dinleme nedenini söyleyerek durur.
            durdur(yenilemeHatasi ?? HatHatasi(mesaj: BulutAkisi.dilimMesaji, kod: "bulut dilim bitti"))
        }
    }

    /// Yeni dilim için anahtar ister ve ikinci bağlantıyı açar. Eski akış bu sırada sürer.
    private func yenilemeyiBaslat() {
        guard yenilemeGorevi == nil, yedek == nil else { return }
        yenileme = .isteniyor
        let buNo = no
        Tanilama.ortak.kaydet("bulut", "dilim yenileniyor")
        yenilemeGorevi = Task { [weak self] in
            let sonuc = await BulutAkisi.anahtarIste()
            guard let self, buNo == self.no, !Task.isCancelled else { return }
            self.yenilemeGorevi = nil
            switch sonuc {
            case .success(let anahtar):
                guard let yeni = self.baglantiyiAc(anahtar) else {
                    self.yedekDustu(BulutAkisi.hatHatasi(.anahtarYok), kesin: true)
                    return
                }
                yeni.ilkSonucBekleniyor = false   // "ilk sonuç" süresi yalnız oturumun ilk akışında anlamlıdır
                self.yedek = yeni
            case .failure(let hata):
                self.yedekDustu(BulutAkisi.hatHatasi(hata), kesin: !hata.yenidenDenenir)
            }
        }
    }

    /// Yeni anahtar ya da yeni akış alınamadı: eski akış süresi dolana dek sürer. Geçici hatada plan yeniden
    /// dener; dilim bittiğinde hâlâ yeni akış yoksa dinleme `hata` ile durur.
    private func yedekDustu(_ hata: HatHatasi, kesin: Bool) {
        if let b = yedek {
            yedek = nil
            b.almaGorevi?.cancel()
            BulutAkisi.kapatGorev(b.gorev, bitir: false)
        }
        yenilemeHatasi = hata
        yenileme = kesin ? .kesinHata : .geciciHata(an: BulutAkisi.saat() - dilimBasi)
        dilimiDenetle()
    }

    /// Dilim devri: mikrofon sesi yeni akışa yönlenir; eski akış boş metin çerçevesiyle bitirilir ve son yanıtları
    /// (kalan çeviri) `biten` olarak işlenir. Ses her an tek akışa gider; bu yüzden cümle çift yazılmaz.
    private func devret() {
        guard let yeni = yedek, yeni.hazir else { return }
        // Önceki devirden kalan bağlantı hâlâ bitiriliyorsa (çok kısa dilim) önce o kapanır.
        bitenTamam()
        let eski = etkin
        let gonderilen = hedef.gonderilenSaniye()
        yedek = nil
        etkin = yeni
        yeni.devralindi = true
        hedef.bagla(yeni.gorev)
        planiKur(yeni)
        pingGonder(yeni)   // pong `bulutPingAraligi` içinde gelmezse yeni akış kopmuş sayılır
        if let eski {
            Tanilama.ortak.kaydet("bulut", "devredildi ses=\(gonderilen) sn süre=\(Int(Date().timeIntervalSince(eski.acilis))) sn")
            biten = eski
            bitenSonu = Date().addingTimeInterval(bulutDevirBitisSuresi)
            BulutAkisi.bitir(eski.gorev)
        } else {
            // Eski akış devirden önce kapanmıştı (dilim bitti): ekran bekleme durumundaydı.
            Tanilama.ortak.kaydet("bulut", "devredildi (eski akış kapanmıştı)")
            if yeni.akista { ekraniAc() }   // değilse ilk yanıtı gelince açılır (`akisBasladi`)
        }
    }

    /// Eski akışın son yanıtları bitti (`finished`, kapanış ya da süre): bekleyen cümlesi çıkar, bağlantı kapanır;
    /// bu sırada yeni akıştan gelip bekletilen olaylar sırayla ekrana verilir.
    private func bitenTamam() {
        guard let eski = biten else { return }
        biten = nil
        eski.almaGorevi?.cancel()
        BulutAkisi.kapatGorev(eski.gorev, bitir: false)
        yay(eski.cozucu.kapat(simdi: BulutAkisi.saat()))
        let bekleyenler = bekleyenOlaylar
        bekleyenOlaylar = []
        yay(bekleyenler)
    }

    /// Etkin akış kapandı ama yerine geçecek akış yolda ya da istenebilir (dilim bitti; devir hazırlanırken kopma).
    /// Ses bekletilir ve ekran "Dinliyorum" demez (ilke 5); yeni akış hazır olunca devredilir, olmazsa dinleme
    /// açıklamayla durur.
    private func etkinKapandi() {
        guard let eski = etkin else { return }
        bitenTamam()
        etkin = nil
        hedef.bagla(nil)
        akista = false
        eski.almaGorevi?.cancel()
        Tanilama.ortak.kaydet("bulut", "ses gönderildi \(hedef.gonderilenSaniye()) sn")
        Tanilama.ortak.kaydet("bulut", "dilim kapandı süre=\(Int(Date().timeIntervalSince(eski.acilis))) sn")
        BulutAkisi.kapatGorev(eski.gorev, bitir: false)
        yay(eski.cozucu.kapat(simdi: BulutAkisi.saat()))
        devirBekleniyor = true
        dilimiDenetle()
        // Yeni akış henüz hazır değilse ya da devralındı ama daha yanıt vermediyse ekran bekleme durumunu gösterir
        // (dinleme durdurulduysa ikisi de yanlıştır: olay gönderilmez).
        if devirBekleniyor || (etkin != nil && !akista) { olay?(.bekliyor) }
    }

    // MARK: Gelen iletiler

    private func dinle(_ b: BulutBaglantisi) {
        let gorev = b.gorev
        b.almaGorevi = Task { [weak self] in
            while !Task.isCancelled {
                let gelen = await BulutAkisi.al(gorev)
                guard let self, !Task.isCancelled, self.yasiyor(b) else { return }
                switch gelen {
                case .metin(let metin):
                    self.iletiGeldi(b, metin)
                case .diger:
                    break
                case .hata(let hata):
                    self.baglantiKoptu(b, hata)
                    return
                }
            }
        }
    }

    private func iletiGeldi(_ b: BulutBaglantisi, _ metin: String) {
        b.sonGelen = Date()
        var okundu = true
        for olay in b.cozucu.isle(metin, simdi: BulutAkisi.saat()) {
            switch olay {
            case .canli, .cumle:
                akisBasladi(b)
                ilet(b, [olay])
            case .pong(let kimlik):
                if kimlik == nil || kimlik == b.bekleyenPing { b.bekleyenPing = nil }
            case .bitti:
                if b === biten {
                    bitenTamam()   // boş çerçeveden sonra beklenen `finished`
                } else {
                    // Boş çerçeve göndermeden gelen `finished`: sunucu akışı kendisi bitirdi.
                    baglantiKoptu(b, BulutAgHatasi(kod: "sunucu bitirdi"))
                }
                return
            case .hata(let hata):
                sunucuHatasi(b, hata)
                return
            case .bozuk:
                okundu = false
                Tanilama.ortak.kaydet("bulut", "bozuk yanıt", uyari: true, tekrarPenceresi: 5)
            }
        }
        // Hata olmayan her yanıt (pong ya da belirteç yanıtı) akışın başladığını gösterir.
        if okundu { akisBasladi(b) }
        // Cümle kapandıysa devir için uygun an gelmiş olabilir.
        if b === etkin { dilimiDenetle() }
    }

    /// Sunucunun hata yanıtı. `temp_api_key_session_expired` sunucudan anahtar alan yapıda hata değil, "dilim
    /// bitti" durumudur (S03).
    private func sunucuHatasi(_ b: BulutBaglantisi, _ hata: SonioxHatasi) {
        if b === biten {
            bitenTamam()   // bitirilen eski akışta sürenin dolması beklenen bitiştir
            return
        }
        if b === etkin, hata.sinif == .dilimBitti, plan != nil {
            // Yeni akış hazırsa devredilir, hazırlanıyorsa beklenir, alınamadıysa dinleme açıklamayla durur.
            Tanilama.ortak.kaydet("bulut", "dilim bitti")
            etkinKapandi()
            return
        }
        Tanilama.ortak.kaydet("bulut", "hata \(hata.kod) \(hata.tur)", uyari: true)
        let aciklama = HatHatasi(mesaj: hata.sinif.ekranMetni, kod: "bulut \(hata.kod) \(hata.tur)")
        if b === yedek {
            yedekDustu(aciklama, kesin: !hata.sinif.yenidenDenenir)
        } else if b === etkin {
            if hata.sinif.yenidenDenenir {
                etkinDustu(internetYok: false)
            } else {
                durdur(aciklama)
            }
        }
    }

    /// Bir bağlantının olaylarını sırayı koruyarak ekrana verir: eski akış bitirilirken yeni akışın olayları bekler.
    /// Yedek akış ses almaz, metin üretmez.
    private func ilet(_ b: BulutBaglantisi, _ olaylar: [SonioxOlayi]) {
        guard !olaylar.isEmpty, b !== yedek else { return }
        ilkSonucuKaydet(b, olaylar)
        if b === etkin, biten != nil {
            bekleyenOlaylar.append(contentsOf: olaylar)
        } else {
            yay(olaylar)
        }
    }

    /// Canlı metni ve kapanan cümleleri `Hat`'e verir. Tanılama'ya yalnız kelime sayısı ve dil kodu yazılır.
    private func yay(_ olaylar: [SonioxOlayi]) {
        for olay in olaylar {
            switch olay {
            case .canli(let asil, let ceviri):
                self.olay?(.canli(asil: asil, ceviri: ceviri))
            case .cumle(let cumle):
                var ayrinti = "kelime=\(cumle.kelime)"
                if let dil = cumle.dil { ayrinti += " dil=\(dil)" }
                Tanilama.ortak.kaydet("cümle", ayrinti)
                self.olay?(.cumle(cumle))
            case .pong, .bitti, .hata, .bozuk:
                break
            }
        }
    }

    private func ilkSonucuKaydet(_ b: BulutBaglantisi, _ olaylar: [SonioxOlayi]) {
        guard b.ilkSonucBekleniyor else { return }
        let sonucVar = olaylar.contains { olay in
            switch olay {
            case .canli(let asil, let ceviri): return !(asil.isEmpty && ceviri.isEmpty)
            case .cumle:                       return true
            case .pong, .bitti, .hata, .bozuk: return false
            }
        }
        guard sonucVar else { return }
        b.ilkSonucBekleniyor = false
        Tanilama.ortak.kaydet("bulut", "ilk sonuç \(gecenMs(b.acilis)) ms")
    }

    private func akisBasladi(_ b: BulutBaglantisi) {
        guard !b.akista else { return }
        b.akista = true
        guard b === etkin else { return }
        Tanilama.ortak.kaydet("bulut", "akış başladı \(gecenMs(b.acilis)) ms")
        ekraniAc()
    }

    /// Sesin gittiği akış başladı: ekran "Dinliyorum" diyebilir.
    private func ekraniAc() {
        hicAkmadi = false
        deneme = 0
        guard !akista else { return }
        akista = true
        olay?(.akista)
    }

    // MARK: Saat: bekleyen cümle, ping, pong, dilim

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
        if hedef.hataVar {
            Tanilama.ortak.kaydet("bulut", "ses dönüştürülemedi", uyari: true)
            durdur(HatHatasi(mesaj: "Mikrofon sesi buluta uygun biçime çevrilemedi. Dinlemeyi yeniden başlatın.",
                             kod: "bulut ses dönüşümü"))
            return
        }
        let simdi = BulutAkisi.saat()
        if let b = biten {
            yay(b.cozucu.zamanGecti(simdi: simdi))
            if Date() >= bitenSonu { bitenTamam() }
        }
        if let b = etkin { ilet(b, b.cozucu.zamanGecti(simdi: simdi)) }
        if let b = yedek { yedegiDenetle(b) }
        if let b = etkin { pingiDenetle(b) }
        dilimiDenetle()
    }

    /// KR5: etkin akışta pong süresinde gelmezse bağlantı kopmuş sayılır.
    private func pingiDenetle(_ b: BulutBaglantisi) {
        let gecen = Date().timeIntervalSince(b.sonPing)
        if b.bekleyenPing != nil {
            // Akış başlamadan gönderilen ilk ping akış başlayınca yanıtlanır; ona bağlantı ve başlama süresi kadar
            // beklenir. Devralınan bağlantı zaten kuruludur: ona ping aralığı kadar beklenir.
            let bekleme = (b.akista || b.devralindi) ? bulutPingAraligi : bulutBaslamaSuresi
            guard gecen > bekleme else { return }
            if b.sonGelen > b.sonPing {
                // Pong yok ama sunucu ping'den sonra yanıt gönderdi: bağlantı canlı, kopmuş sayılmaz.
                Tanilama.ortak.kaydet("bulut", "pong gelmedi, yanıtlar sürüyor", uyari: true, tekrarPenceresi: 60)
                pingGonder(b)
            } else {
                baglantiKoptu(b, BulutAgHatasi(kod: "pong yok"))
            }
        } else if gecen >= bulutPingAraligi {
            pingGonder(b)
        }
    }

    /// Yedek akışa ses gitmez. Bağlantı başlama süresinde kurulamadıysa bırakılır; kurulduysa sunucudaki boşta kalma
    /// süresi dolmasın diye ping gönderilir. Pong'a bakılmaz: belgeye göre ping "akış başlayınca" yanıtlanır ve ses
    /// almayan akışın ne zaman başlamış sayıldığı belgede yazmıyor.
    private func yedegiDenetle(_ b: BulutBaglantisi) {
        if !b.hazir {
            if Date().timeIntervalSince(b.acilis) > bulutBaslamaSuresi {
                baglantiKoptu(b, BulutAgHatasi(kod: "bağlanamadı"))
            }
            return
        }
        if Date().timeIntervalSince(b.sonPing) >= bulutPingAraligi { pingGonder(b) }
    }

    private func pingGonder(_ b: BulutBaglantisi) {
        b.pingNo += 1
        b.bekleyenPing = b.pingNo
        b.sonPing = Date()
        BulutAkisi.gonder(b.gorev, SonioxCozucu.pingIletisi(b.pingNo)) { _ in }
    }

    // MARK: Anahtar

    /// Anahtarı `SonioxAnahtarKaynagi`'ndan ister; alınamazsa nedenini türüyle döndürür.
    private static func anahtarIste() async -> Result<SonioxAnahtari, AnahtarHatasi> {
        do {
            let anahtar = try await SonioxAnahtarKaynagi.anahtarAl()
            return .success(anahtar)
        } catch let hata as AnahtarHatasi {
            return .failure(hata)
        } catch {
            return .failure(.ulasilamadi(kod: "bilinmeyen_hata"))
        }
    }

    /// Anahtar hatasının ekrandaki açıklaması; kod yalnız Tanılama içindir.
    private static func hatHatasi(_ hata: AnahtarHatasi) -> HatHatasi {
        HatHatasi(mesaj: hata.ekranMetni(), kod: "bulut anahtar \(hata.tanilamaKodu)", fiyatEkrani: hata.fiyatEkrani)
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

    /// Dilim devrinde eski akış için boş metin çerçevesi: sunucu son yanıtları ve `finished`'ı gönderir. Bağlantı
    /// yanıtlar işlenince (`bitenTamam`) kapatılır.
    private nonisolated static func bitir(_ gorev: URLSessionWebSocketTask) {
        gorev.send(.string("")) { _ in }
    }

    /// Çözücünün saati: tekdüze artan saniye.
    private nonisolated static func saat() -> TimeInterval {
        ProcessInfo.processInfo.systemUptime
    }

    // Müşteri Ayarlar'ında motor ve anahtar yoktur (S02 tur 3); iletiler yalnız müşterinin yapabileceğini söyler.
    private static let internetMesaji =
        "İnternet bağlantısı yok. Çeviri için internet gerekli; bağlanıp dinlemeyi yeniden başlatın."
    private static let kopmaMesaji =
        "Bağlantı koptu ve yeniden kurulamadı. İnterneti denetleyip dinlemeyi yeniden başlatın."
    private static let dilimMesaji =
        "Çeviri oturumu yenilenemedi. Dinlemeyi yeniden başlatın."
}
