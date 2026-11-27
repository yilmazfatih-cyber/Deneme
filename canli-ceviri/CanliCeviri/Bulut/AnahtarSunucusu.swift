import Foundation

// Geçici anahtar sunucusunun (S03; `canli-ceviri/sunucu`) sözleşmesinin saf kısmı: istek gövdesi, yanıtın çözülmesi,
// hataların Türkçe açıklaması ve kota metinleri. Yalnız Foundation kullanır; ağ, StoreKit ve arayüz türü yoktur, bu
// yüzden `tests/ios/dilim-testi.swift` ile Mac'te `swiftc` ile derlenip sınanır. İsteği gönderen yer
// `SonioxAnahtarKaynagi`'dır.
//
// Sözleşme: `POST <sunucu>/v1/oturum`, gövde `{"islem": "<StoreKit 2 imzalı işlem, JWS>"}`.
//   200 `{"anahtar", "sure_sn", "kalan_sn", "donem_bitis_ms"}`; hata `{"hata": "<kod>", "ileti": "..."}`.
// Hata türü HTTP durumundan değil `hata` alanından ayrılır. Sunucunun `ileti` metni alınmaz (ilke 3).

/// Bulut motorunun bir akış için kullanacağı anahtar ve, sunucudan geldiyse, dilim ve kota bilgisi.
/// Anahtar yalnız bağlantı isteğinin `Authorization` başlığına konur; hiçbir kayda ve ekrana yazılmaz.
struct SonioxAnahtari: Equatable, Sendable {
    let anahtar: String
    /// Bu anahtarla açılan akışın en uzun süresi, sn. Gömülü ya da kullanıcının girdiği anahtarda nil (dilim yok).
    let sureSn: Int?
    /// Bu üyelik döneminde kalan kota, sn; bilinmiyorsa nil.
    let kalanSn: Int?
    /// Kotanın yenileneceği an (epoch ms); bilinmiyorsa nil.
    let donemBitisMs: Int?

    init(anahtar: String, sureSn: Int? = nil, kalanSn: Int? = nil, donemBitisMs: Int? = nil) {
        self.anahtar = anahtar
        self.sureSn = sureSn
        self.kalanSn = kalanSn
        self.donemBitisMs = donemBitisMs
    }
}

/// Anahtarın alınamama nedeni.
enum AnahtarHatasi: Error, Equatable, Sendable {
    /// Yerel anahtar yok ve sunucu kullanılmıyor.
    case anahtarYok
    /// Sunucu geçerli üyelik bulamadı (ya da telefonda doğrulanmış işlem yok).
    case abonelikYok
    /// Bu dönemin kotası doldu; `donemBitisMs`: kotanın yenileneceği an.
    case sinirDoldu(donemBitisMs: Int?)
    /// Çok sık istek; `beklemeSn`: sunucunun `Retry-After` değeri (varsa).
    case cokSik(beklemeSn: Int?)
    case imzaGecersiz
    /// Sunucu isteği geçersiz buldu (uygulama hatası; yeniden denemek değiştirmez).
    case gecersizIstek
    /// Ağ hatası, zaman aşımı, `sunucu_hatasi` ya da okunamayan yanıt. `kod` yalnız Tanılama içindir.
    case ulasilamadi(kod: String)

    /// Dilim yenilenirken bu hatadan sonra yeniden denemek anlamlı mı.
    var yenidenDenenir: Bool {
        switch self {
        case .ulasilamadi, .cokSik:
            return true
        case .anahtarYok, .abonelikYok, .sinirDoldu, .imzaGecersiz, .gecersizIstek:
            return false
        }
    }

    /// Dinleme durunca fiyat ekranı açılsın mı.
    var fiyatEkrani: Bool { self == .abonelikYok }

    /// Tanılama'ya yazılan kod (`sunucu  hata <kod>`); içerik, anahtar ya da işlem içermez.
    var tanilamaKodu: String {
        switch self {
        case .anahtarYok:           return "anahtar_yok"
        case .abonelikYok:          return "abonelik_yok"
        case .sinirDoldu:           return "sinir_doldu"
        case .cokSik:               return "cok_sik"
        case .imzaGecersiz:         return "imza_gecersiz"
        case .gecersizIstek:        return "gecersiz_istek"
        case .ulasilamadi(let kod): return kod
        }
    }

    /// Ekranda gösterilen, müşterinin yapabileceğini söyleyen kısa Türkçe açıklama. Tür ve kod Tanılama'dadır.
    func ekranMetni(saatDilimi: TimeZone = .current) -> String {
        switch self {
        case .anahtarYok, .gecersizIstek:
            return "Çeviri hizmetine bağlanılamadı. Biraz sonra yeniden deneyin; sürerse Ayarlar'daki Destek bağlantısından bize yazın."
        case .abonelikYok:
            return "Geçerli üyelik bulunamadı. Üye olun ya da Ayarlar'dan satın alımları geri yükleyin."
        case .sinirDoldu(let donemBitisMs):
            guard let donemBitisMs else {
                return "Bu haftaki çeviri kotanız doldu. Üyelik döneminiz yenilenince sürer."
            }
            let zaman = KotaMetni.yenilenme(donemBitisMs: donemBitisMs, saatDilimi: saatDilimi)
            return "Bu haftaki çeviri kotanız doldu. \(zaman) yenilenir."
        case .cokSik(let beklemeSn):
            guard let beklemeSn else { return "Çok sık denendi. Biraz sonra yeniden deneyin." }
            return "Çok sık denendi. \(beklemeSn) saniye sonra yeniden deneyin."
        case .imzaGecersiz:
            return "Üyelik doğrulanamadı. Ayarlar'dan satın alımları geri yükleyin."
        case .ulasilamadi:
            return "Sunucuya ulaşılamadı. İnternet bağlantınızı denetleyip yeniden deneyin."
        }
    }
}

enum AnahtarSunucusu {
    static let yol = "/v1/oturum"
    /// `Retry-After` bu kadar saniyeden uzunsa ekranda sayı gösterilmez ("biraz sonra" denir).
    static let enUzunBekleme = 600

    /// Uç noktanın adresi. `kok`: `https://…` kök adresi (sonunda `/` olsa da olur). Yalnız `https` kabul edilir;
    /// boş, bozuk ya da başka şemalı adreste nil.
    static func adres(kok: String) -> URL? {
        var temiz = kok.trimmingCharacters(in: .whitespacesAndNewlines)
        while temiz.hasSuffix("/") { temiz.removeLast() }
        guard !temiz.isEmpty, let tam = URL(string: temiz + yol) else { return nil }
        guard tam.scheme?.lowercased() == "https", let sunucu = tam.host, !sunucu.isEmpty else { return nil }
        return tam
    }

    /// İstek gövdesi. `islem` (imzalı işlem) yalnız burada, gövdede yer alır.
    static func istekGovdesi(islem: String) -> Data? {
        guard !islem.isEmpty else { return nil }
        return try? JSONSerialization.data(withJSONObject: ["islem": islem])
    }

    /// Sunucunun yanıtını çözer. JSON olmayan yanıt (ör. barındırıcının kendi hata sayfası) "ulaşılamadı" sayılır.
    static func yanitiCoz(durum: Int, govde: Data, retryAfter: String?) -> Result<SonioxAnahtari, AnahtarHatasi> {
        guard let nesne = (try? JSONSerialization.jsonObject(with: govde)) as? [String: Any] else {
            return .failure(.ulasilamadi(kod: "http_\(durum)_bozuk_yanit"))
        }
        if let kod = nesne["hata"] as? String {
            switch kod {
            case "abonelik_yok":
                return .failure(.abonelikYok)
            case "sinir_doldu":
                return .failure(.sinirDoldu(donemBitisMs: pozitif(nesne["donem_bitis_ms"])))
            case "cok_sik":
                return .failure(.cokSik(beklemeSn: bekleme(retryAfter)))
            case "imza_gecersiz":
                return .failure(.imzaGecersiz)
            case "gecersiz_istek":
                return .failure(.gecersizIstek)
            case "sunucu_hatasi":
                return .failure(.ulasilamadi(kod: "sunucu_hatasi"))
            default:
                return .failure(.ulasilamadi(kod: "bilinmeyen_\(temizKod(kod))"))
            }
        }
        guard durum == 200, let anahtar = nesne["anahtar"] as? String, !anahtar.isEmpty,
              let sure = pozitif(nesne["sure_sn"]) else {
            return .failure(.ulasilamadi(kod: "http_\(durum)_eksik_yanit"))
        }
        let kalan = sayi(nesne["kalan_sn"]).map { max(0, $0) }
        return .success(SonioxAnahtari(anahtar: anahtar, sureSn: sure, kalanSn: kalan,
                                       donemBitisMs: pozitif(nesne["donem_bitis_ms"])))
    }

    // MARK: Yardımcılar

    private static func sayi(_ deger: Any?) -> Int? {
        if let n = deger as? NSNumber { return n.intValue }
        if let s = deger as? String { return Int(s) }
        return nil
    }

    private static func pozitif(_ deger: Any?) -> Int? {
        guard let n = sayi(deger), n > 0 else { return nil }
        return n
    }

    /// `Retry-After` başlığı: yalnız saniye biçimi okunur (tarih biçimi yok sayılır).
    private static func bekleme(_ baslik: String?) -> Int? {
        guard let baslik, let sn = Int(baslik.trimmingCharacters(in: .whitespaces)),
              sn >= 1, sn <= enUzunBekleme else { return nil }
        return sn
    }

    /// Yalnız küçük harf, rakam ve alt çizgi; en çok 32 karakter (Tanılama'ya yazılabilir).
    private static func temizKod(_ ham: String) -> String {
        var sonuc = ""
        for k in ham.lowercased() where k.isASCII && (k.isLetter || k.isNumber || k == "_") {
            if sonuc.count < 32 { sonuc.append(k) }
        }
        return sonuc.isEmpty ? "kod" : sonuc
    }
}

/// Kota ve yenilenme metinleri (Ayarlar'daki "Bu hafta kalan" satırı, kota doldu açıklaması).
enum KotaMetni {
    /// Kalan süre: "2 sa 14 dk", "3 sa", "45 dk", "1 dk'dan az", "0 dk".
    static func kalan(_ saniye: Int) -> String {
        let sn = max(0, saniye)
        let saat = sn / 3600
        let dakika = (sn % 3600) / 60
        if saat > 0 { return dakika > 0 ? "\(saat) sa \(dakika) dk" : "\(saat) sa" }
        if dakika > 0 { return "\(dakika) dk" }
        return sn > 0 ? "1 dk'dan az" : "0 dk"
    }

    /// VoiceOver için kısaltmasız: "2 saat 14 dakika".
    static func kalanSesli(_ saniye: Int) -> String {
        let sn = max(0, saniye)
        let saat = sn / 3600
        let dakika = (sn % 3600) / 60
        if saat > 0 { return dakika > 0 ? "\(saat) saat \(dakika) dakika" : "\(saat) saat" }
        if dakika > 0 { return "\(dakika) dakika" }
        return sn > 0 ? "1 dakikadan az" : "0 dakika"
    }

    /// Kotanın yenileneceği an, verilen saat dilimine göre gün ve saat, bulunma ekiyle: "4 Aralık Cuma 14:30'da".
    static func yenilenme(donemBitisMs: Int, saatDilimi: TimeZone) -> String {
        let an = Date(timeIntervalSince1970: TimeInterval(donemBitisMs) / 1000)
        var takvim = Calendar(identifier: .gregorian)
        takvim.timeZone = saatDilimi
        let bicim = DateFormatter()
        bicim.calendar = takvim
        bicim.timeZone = saatDilimi
        bicim.locale = Locale(identifier: "tr_TR")
        bicim.dateFormat = "d MMMM EEEE HH:mm"
        let parca = takvim.dateComponents([.hour, .minute], from: an)
        return "\(bicim.string(from: an))'\(bulunmaEki(saat: parca.hour ?? 0, dakika: parca.minute ?? 0))"
    }

    /// Saatin okunuşuna göre bulunma eki: 14:30 "otuz" → "da", 09:05 "beş" → "te", 20:00 "yirmi" → "de".
    /// Dakika sıfırsa saat, değilse dakika okunur; ek son okunan sözcüğe göre seçilir.
    static func bulunmaEki(saat: Int, dakika: Int) -> String {
        let okunan = dakika == 0 ? saat : dakika
        // bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
        let birler = ["", "de", "de", "te", "te", "te", "da", "de", "de", "da"]
        // sıfır, on, yirmi, otuz, kırk, elli
        let onlar = ["da", "da", "de", "da", "ta", "de"]
        let birlik = abs(okunan) % 10
        if birlik != 0 { return birler[birlik] }
        return onlar[min(abs(okunan) / 10, onlar.count - 1)]
    }
}
