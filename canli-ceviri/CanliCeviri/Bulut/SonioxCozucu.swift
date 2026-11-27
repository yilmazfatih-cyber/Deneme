import Foundation

// Bulut motorunun (Soniox) saf mantığı: sunucudan gelen metin çerçevelerini ekranın ve hattın kullanacağı olaylara
// çevirir. Yalnız Foundation kullanır; arayüz, ses ve ağ türü yoktur. Zaman dışarıdan verilir (saniye, tekdüze artan
// herhangi bir saat), bu yüzden `tests/ios/cozucu-testi.swift` ile Mac'te `swiftc` ile derlenip sınanır.
//
// Belirteç sırasına dayanmaz (gerçek akış bu sprintte gözlenmedi): çeviri belirteçleri `<end>`'den önce de sonra da
// gelebilir. Cümle `<end>` ile kapanır; çevirisi henüz tamamlanmadıysa kısa bir süre beklenir (`bekleyen`).

/// `error_type`'ın uygulamadaki karşılığı (brief K6). Dallanma `error_type`'a göredir; tür tanınmıyorsa koda bakılır.
enum SonioxHataSinifi: Equatable {
    case gecersizAnahtar
    case izinYok
    case bakiye
    case kota
    case sureSiniri
    /// Geçici anahtarla açılan akışın süresi doldu (`temp_api_key_session_expired`; S03). Sunucudan anahtar alan
    /// yapıda hata değil, "dilim bitti" durumudur: `BulutAkisi` yeni akışa devreder.
    case dilimBitti
    case gecersizIstek
    /// Zaman aşımı ya da hizmet kullanılamıyor: yeni akış denenir (KR5).
    case gecici
    case diger

    var yenidenDenenir: Bool { self == .gecici }

    /// Ekranda gösterilen, ne yapılacağını söyleyen Türkçe açıklama (KR1: motor kendiliğinden değişmez).
    /// Müşteri Ayarlar'ında anahtar ve motor seçimi yoktur (S02 tur 3): iletiler yalnız müşterinin yapabileceğini
    /// söyler; hatanın türü ve kodu Tanılama'dadır.
    var ekranMetni: String {
        switch self {
        case .gecersizAnahtar:
            return "Çeviri hizmeti anahtarı kabul etmedi. Ayarlar'daki Destek bağlantısından bize yazın."
        case .izinYok:
            return "Çeviri hizmeti bu anahtara izin vermiyor. Ayarlar'daki Destek bağlantısından bize yazın."
        case .bakiye:
            return "Çeviri hizmeti şu an kullanılamıyor (bakiye bitti). Ayarlar'daki Destek bağlantısından bize yazın."
        case .kota:
            return "Çeviri hizmeti şu an çok yoğun. Biraz sonra yeniden deneyin."
        case .sureSiniri:
            return "Dinleme 300 dakikalık sınıra ulaştı. Dinlemeyi yeniden başlatın."
        case .dilimBitti:
            return "Çeviri oturumunun süresi doldu. Dinlemeyi yeniden başlatın."
        case .gecersizIstek:
            return "Çeviri hizmeti isteği kabul etmedi. Dil seçimini değiştirip yeniden deneyin."
        case .gecici:
            return "Çeviri hizmetine bağlanılamadı. İnterneti denetleyip dinlemeyi yeniden başlatın."
        case .diger:
            return "Çeviri hizmeti hata verdi. Dinlemeyi yeniden başlatın."
        }
    }
}

/// Sunucunun hata yanıtı. `error_message` alınmaz: içeriğini sunucu belirler (ilke 3).
struct SonioxHatasi: Equatable {
    let kod: Int
    /// `error_type`; yalnız küçük harf, rakam ve alt çizgi (Tanılama'ya yazılabilir).
    let tur: String
    let sinif: SonioxHataSinifi
}

/// Kapanan cümle: asıl metin ve çevirisi.
struct SonioxCumle: Equatable {
    let asil: String
    /// Boş olabilir: konuşma hedef dildeyse çeviri gelmez; çeviri beklendiği hâlde gelmediyse `ceviriBeklendi` doğrudur.
    let ceviri: String
    /// Asıl belirteçlerin dil kodu (ör. "en"); sunucu göndermediyse nil.
    let dil: String?
    let ceviriBeklendi: Bool
    /// `<end>`'den çevirinin tamamlanmasına dek geçen süre, ms (çeviri `<end>`'den önce tamamsa 0).
    let beklemeMs: Int

    /// Asıl metnin kelime sayısı (Tanılama'ya yalnız bu yazılır).
    var kelime: Int {
        asil.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" }).count
    }
}

enum SonioxOlayi: Equatable {
    /// Henüz kapanmamış metin: canlı asıl metin ve akan çeviri (ikisi de boş olabilir).
    case canli(asil: String, ceviri: String)
    case cumle(SonioxCumle)
    case pong(Int?)
    /// `finished` yanıtı: sunucu akışı bitirdi.
    case bitti
    case hata(SonioxHatasi)
    /// JSON olarak okunamayan çerçeve.
    case bozuk
}

struct SonioxCozucu {
    static let model = "stt-rt-v6"

    /// Çevirisi olan bekleyen cümle bu kadar sn yeni çeviri belirteci gelmezse kapanır.
    var kisaBekleme: TimeInterval = 0.4
    /// Çevirisi hiç gelmemiş bekleyen cümle bu kadar sn sonra çevirisiz kapanır.
    var uzunBekleme: TimeInterval = 1.5
    /// `<end>`'den sonra en çok bu kadar sn beklenir.
    var enCokBekleme: TimeInterval = 4
    /// `<end>` gelmeden bu kadar sn süren cümle, çevirisi cümle sonu noktalamasıyla bitince kapanır.
    var uzunCumle: TimeInterval = 6

    /// `<end>` ile kapanmış, çevirisi tamamlanmamış olabilecek cümle.
    private struct Bekleyen {
        var asil: String
        var ceviri: String
        var dil: String?
        var kapanis: TimeInterval
        var sonEtkinlik: TimeInterval
    }

    // Açık cümle: kesin belirteçler birikir; kesin olmayanlar her yanıtta yenilenir.
    private var asilKesin = ""
    private var ceviriKesin = ""
    private var asilGecici = ""
    private var ceviriGecici = ""
    private var acikDil: String?
    private var acikCeviriBeklenir = false
    private var acikBasi: TimeInterval?
    private var bekleyen: Bekleyen?
    private var sonCanliAsil = ""
    private var sonCanliCeviri = ""

    init() {}

    // MARK: Giden iletiler

    /// Akışın ilk metin çerçevesi. `kaynak` nil ise dil kendiliğinden tanınır (KR12). Anahtar burada YOKTUR:
    /// bağlantı isteğinin `Authorization` başlığında gider (K4).
    static func baslangicIletisi(kaynak: String?, hedef: String) -> String {
        var ileti: [String: Any] = [
            "model": model,
            "audio_format": "pcm_s16le",
            "sample_rate": 16000,
            "num_channels": 1,
            "enable_endpoint_detection": true,
            "translation": ["type": "one_way", "target_language": hedef],
        ]
        if let kaynak {
            ileti["language_hints"] = [kaynak]
        } else {
            ileti["enable_language_identification"] = true
        }
        guard let veri = try? JSONSerialization.data(withJSONObject: ileti, options: [.sortedKeys]),
              let metin = String(data: veri, encoding: .utf8) else { return "{}" }
        return metin
    }

    static func pingIletisi(_ kimlik: Int) -> String {
        "{\"type\":\"ping\",\"id\":\(kimlik)}"
    }

    // MARK: Gelen iletiler

    /// Sunucudan gelen bir metin çerçevesini işler.
    mutating func isle(_ metin: String, simdi: TimeInterval) -> [SonioxOlayi] {
        guard let veri = metin.data(using: .utf8),
              let nesne = try? JSONSerialization.jsonObject(with: veri),
              let yanit = nesne as? [String: Any] else { return [.bozuk] }

        var olaylar: [SonioxOlayi] = []

        if let tip = yanit["type"] as? String {
            if tip == "pong" { return [.pong(SonioxCozucu.sayi(yanit["id"]))] }
            // Tanınmayan denetim iletisi (ör. reconnect): yok sayılır.
            if yanit["tokens"] == nil && yanit["error_type"] == nil && yanit["error_code"] == nil { return [] }
        }

        if yanit["error_type"] != nil || yanit["error_code"] != nil {
            let kod = SonioxCozucu.sayi(yanit["error_code"]) ?? 0
            let tur = SonioxCozucu.temizTur(yanit["error_type"] as? String)
            bosalt(simdi: simdi, acigiDa: false, &olaylar)
            canliyiEkle(&olaylar)
            olaylar.append(.hata(SonioxHatasi(kod: kod, tur: tur, sinif: SonioxCozucu.sinif(tur: tur, kod: kod))))
            return olaylar
        }

        if yanit["tokens"] != nil {
            asilGecici = ""
            ceviriGecici = ""
        }
        let belirtecler = (yanit["tokens"] as? [[String: Any]]) ?? []
        for belirtec in belirtecler {
            guard let parca = belirtec["text"] as? String, !parca.isEmpty else { continue }
            if SonioxCozucu.kirp(parca) == "<end>" {
                cumleyiKapat(simdi: simdi, &olaylar)
                continue
            }
            let kesin = (belirtec["is_final"] as? Bool) ?? false
            let durum = (belirtec["translation_status"] as? String) ?? "none"
            if durum == "translation" {
                if !kesin {
                    ceviriGecici += parca
                } else if bekleyen != nil {
                    bekleyen?.ceviri += parca
                    bekleyen?.sonEtkinlik = simdi
                } else {
                    aciginBasiniIsaretle(simdi)
                    ceviriKesin += parca
                }
            } else if !kesin {
                asilGecici += parca
            } else {
                if bekleyen != nil { sonrakiAsilGeldi(simdi: simdi, &olaylar) }
                aciginBasiniIsaretle(simdi)
                asilKesin += parca
                if durum == "original" { acikCeviriBeklenir = true }
                if acikDil == nil { acikDil = SonioxCozucu.temizDil(belirtec["language"] as? String) }
            }
        }

        uzunCumleyiDenetle(simdi: simdi, &olaylar)
        bekleyeniDenetle(simdi: simdi, &olaylar)

        if (yanit["finished"] as? Bool) == true {
            bosalt(simdi: simdi, acigiDa: true, &olaylar)
            canliyiEkle(&olaylar)
            olaylar.append(.bitti)
            return olaylar
        }
        canliyiEkle(&olaylar)
        return olaylar
    }

    /// Yeni ileti gelmese de süresi dolan bekleyen cümleyi kapatır; hat bunu düzenli aralıkla çağırır.
    mutating func zamanGecti(simdi: TimeInterval) -> [SonioxOlayi] {
        var olaylar: [SonioxOlayi] = []
        bekleyeniDenetle(simdi: simdi, &olaylar)
        canliyiEkle(&olaylar)
        return olaylar
    }

    /// Açık cümle yok: son `<end>`'den beri asıl metin gelmedi (konuşmacı cümle arasında). Dilim devri bu anı
    /// yeğler (S03). Çevirisi bekleyen kapanmış cümle buna engel değildir: çevirisi eski akıştan gelmeyi sürdürür.
    var cumleArasinda: Bool {
        SonioxCozucu.kirp(asilKesin).isEmpty && SonioxCozucu.kirp(asilGecici).isEmpty
    }

    /// Bağlantı kapandı ya da koptu: bekleyen cümle olduğu gibi çıkar, yarım cümle atılır (KR5).
    mutating func kapat(simdi: TimeInterval) -> [SonioxOlayi] {
        var olaylar: [SonioxOlayi] = []
        bosalt(simdi: simdi, acigiDa: false, &olaylar)
        canliyiEkle(&olaylar)
        return olaylar
    }

    // MARK: Cümle mantığı

    private mutating func aciginBasiniIsaretle(_ simdi: TimeInterval) {
        if acikBasi == nil { acikBasi = simdi }
    }

    private mutating func acigiSifirla() {
        asilKesin = ""
        ceviriKesin = ""
        acikDil = nil
        acikCeviriBeklenir = false
        acikBasi = nil
    }

    /// `<end>` geldi: açık cümle kapanır. Çevirisi beklenmiyorsa hemen çıkar; bekleniyorsa `bekleyen` olur.
    private mutating func cumleyiKapat(simdi: TimeInterval, _ olaylar: inout [SonioxOlayi]) {
        if bekleyen != nil { bekleyeniCikar(simdi: simdi, geciciyiKullan: false, &olaylar) }
        let asil = SonioxCozucu.kirp(asilKesin)
        let ceviri = SonioxCozucu.kirp(ceviriKesin)
        guard !asil.isEmpty || !ceviri.isEmpty else {
            acigiSifirla()   // boş cümle: olay yok
            return
        }
        if !acikCeviriBeklenir && ceviri.isEmpty {
            // Konuşma hedef dilde (translation_status "none"): çeviri gelmeyecek, beklenmez (KR13).
            olaylar.append(.cumle(SonioxCumle(asil: asil, ceviri: "", dil: acikDil, ceviriBeklendi: false, beklemeMs: 0)))
            acigiSifirla()
            return
        }
        bekleyen = Bekleyen(asil: asilKesin, ceviri: ceviriKesin, dil: acikDil, kapanis: simdi, sonEtkinlik: simdi)
        acigiSifirla()
    }

    /// Bekleyen cümle varken sonraki cümlenin kesin asıl belirteci geldi. Bekleyenin çevirisi hiç gelmediyse iki
    /// cümle birleşir (çeviri gecikmiş olabilir; metin kaybolmaz); geldiyse bekleyen kapanır.
    private mutating func sonrakiAsilGeldi(simdi: TimeInterval, _ olaylar: inout [SonioxOlayi]) {
        guard let b = bekleyen else { return }
        if SonioxCozucu.kirp(b.ceviri).isEmpty && simdi - b.kapanis < uzunBekleme {
            bekleyen = nil
            asilKesin = b.asil + asilKesin
            acikDil = b.dil
            acikCeviriBeklenir = true
            acikBasi = simdi
            return
        }
        bekleyeniCikar(simdi: simdi, geciciyiKullan: false, &olaylar)
    }

    private mutating func bekleyeniDenetle(simdi: TimeInterval, _ olaylar: inout [SonioxOlayi]) {
        guard let b = bekleyen else { return }
        let kesin = SonioxCozucu.kirp(b.ceviri)
        let geciciVar = !SonioxCozucu.kirp(ceviriGecici).isEmpty
        let sessiz = simdi - b.sonEtkinlik
        if !kesin.isEmpty && (SonioxCozucu.cumleSonu(kesin) || (!geciciVar && sessiz >= kisaBekleme)) {
            bekleyeniCikar(simdi: simdi, geciciyiKullan: false, &olaylar)
        } else if kesin.isEmpty && !geciciVar && sessiz >= uzunBekleme {
            bekleyeniCikar(simdi: simdi, geciciyiKullan: false, &olaylar)
        } else if simdi - b.kapanis >= enCokBekleme {
            bekleyeniCikar(simdi: simdi, geciciyiKullan: true, &olaylar)
        }
    }

    /// `geciciyiKullan`: kesin çeviri hiç yoksa kesinleşmemiş çeviri kullanılır (hiç yoktan iyidir).
    private mutating func bekleyeniCikar(simdi: TimeInterval, geciciyiKullan: Bool, _ olaylar: inout [SonioxOlayi]) {
        guard let b = bekleyen else { return }
        bekleyen = nil
        var ceviri = SonioxCozucu.kirp(b.ceviri)
        if ceviri.isEmpty && geciciyiKullan {
            ceviri = SonioxCozucu.kirp(ceviriGecici)
            ceviriGecici = ""
        }
        let ms = max(0, Int(((simdi - b.kapanis) * 1000).rounded()))
        olaylar.append(.cumle(SonioxCumle(asil: SonioxCozucu.kirp(b.asil), ceviri: ceviri, dil: b.dil,
                                          ceviriBeklendi: true, beklemeMs: ms)))
    }

    /// Sunucu `<end>` göndermeden uzun süren konuşma: çevirinin kesin kısmı cümle sonu noktalamasıyla bitiyorsa
    /// o ana kadarki metin bir cümle olarak kapanır (satırlar birikmeden ekrana düşer).
    private mutating func uzunCumleyiDenetle(simdi: TimeInterval, _ olaylar: inout [SonioxOlayi]) {
        guard bekleyen == nil, let bas = acikBasi, simdi - bas >= uzunCumle else { return }
        let ceviri = SonioxCozucu.kirp(ceviriKesin)
        guard SonioxCozucu.cumleSonu(ceviri) else { return }
        olaylar.append(.cumle(SonioxCumle(asil: SonioxCozucu.kirp(asilKesin), ceviri: ceviri, dil: acikDil,
                                          ceviriBeklendi: true, beklemeMs: 0)))
        acigiSifirla()
    }

    /// Bekleyen cümleyi (ve istenirse açık cümleyi) çıkarır, durumu sıfırlar.
    private mutating func bosalt(simdi: TimeInterval, acigiDa: Bool, _ olaylar: inout [SonioxOlayi]) {
        bekleyeniCikar(simdi: simdi, geciciyiKullan: true, &olaylar)
        if acigiDa {
            let asil = SonioxCozucu.kirp(asilKesin)
            let ceviri = SonioxCozucu.kirp(ceviriKesin)
            if !asil.isEmpty || !ceviri.isEmpty {
                olaylar.append(.cumle(SonioxCumle(asil: asil, ceviri: ceviri, dil: acikDil,
                                                  ceviriBeklendi: acikCeviriBeklenir, beklemeMs: 0)))
            }
        }
        acigiSifirla()
        asilGecici = ""
        ceviriGecici = ""
    }

    /// Kapanmamış metin değiştiyse `canli` olayı ekler.
    private mutating func canliyiEkle(_ olaylar: inout [SonioxOlayi]) {
        let asil = SonioxCozucu.kirp((bekleyen?.asil ?? "") + asilKesin + asilGecici)
        let ceviri = SonioxCozucu.kirp((bekleyen?.ceviri ?? "") + ceviriKesin + ceviriGecici)
        guard asil != sonCanliAsil || ceviri != sonCanliCeviri else { return }
        sonCanliAsil = asil
        sonCanliCeviri = ceviri
        olaylar.append(.canli(asil: asil, ceviri: ceviri))
    }

    // MARK: Yardımcılar

    /// `error_type` → sınıf; tür tanınmıyorsa HTTP koduna göre (belge: api-reference/errors).
    static func sinif(tur: String, kod: Int) -> SonioxHataSinifi {
        switch tur {
        case "unauthenticated":
            return .gecersizAnahtar
        case "temp_api_key_session_expired":
            return .dilimBitti
        case "permission_denied":
            return .izinYok
        case "organization_balance_exhausted", "organization_monthly_budget_exhausted",
             "project_monthly_budget_exhausted":
            return .bakiye
        case "limit_exceeded", "max_concurrent_connections_reached":
            return .kota
        case "max_duration_reached":
            return .sureSiniri
        case "invalid_request", "model_not_available":
            return .gecersizIstek
        case "request_timeout", "service_unavailable", "internal_error":
            return .gecici
        default:
            break
        }
        switch kod {
        case 401: return .gecersizAnahtar
        case 402: return .bakiye
        case 403: return .izinYok
        case 408: return .gecici
        case 413: return .sureSiniri
        case 429: return .kota
        case 400: return .gecersizIstek
        case 500...599: return .gecici
        default: return .diger
        }
    }

    /// Metin cümle sonu noktalamasıyla mı bitiyor (sondaki tırnak ve ayraçlar atlanır).
    static func cumleSonu(_ metin: String) -> Bool {
        let kapanislar: Set<Character> = ["\"", "'", "”", "’", "»", ")", "]"]
        let sonlar: Set<Character> = [".", "!", "?", "…", "。", "！", "？", "؟", "۔"]
        var kalan = Substring(kirp(metin))
        while let son = kalan.last, kapanislar.contains(son) { kalan = kalan.dropLast() }
        guard let son = kalan.last else { return false }
        return sonlar.contains(son)
    }

    private static func kirp(_ metin: String) -> String {
        metin.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sayi(_ deger: Any?) -> Int? {
        if let n = deger as? NSNumber { return n.intValue }
        if let s = deger as? String { return Int(s) }
        return nil
    }

    /// Yalnız küçük harf, rakam ve alt çizgi; en çok 48 karakter. Boşsa "bilinmiyor".
    private static func temizTur(_ ham: String?) -> String {
        var sonuc = ""
        for k in (ham ?? "").lowercased() where k.isASCII && (k.isLetter || k.isNumber || k == "_") {
            if sonuc.count < 48 { sonuc.append(k) }
        }
        return sonuc.isEmpty ? "bilinmiyor" : sonuc
    }

    /// Dil kodu: yalnız harf ve tire; en çok 8 karakter. Geçersizse nil.
    private static func temizDil(_ ham: String?) -> String? {
        var sonuc = ""
        for k in (ham ?? "").lowercased() where k.isASCII && (k.isLetter || k == "-") {
            if sonuc.count < 8 { sonuc.append(k) }
        }
        return sonuc.isEmpty ? nil : sonuc
    }
}
