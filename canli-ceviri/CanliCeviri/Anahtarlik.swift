import Foundation
import Security

/// Alania ve Soniox anahtarları Anahtar Zinciri'nde saklanır (S01 K5, S02 K5; şartname § 5.1). Anahtarı okuyan her
/// yer bunu kullanır. Okuyan ve yazan yerler (`Hat`, `Durum`, Ayarlar ekranı) ana aktörde olduğu için bellekteki
/// kopya da orada tutulur.
@MainActor
enum Anahtarlik {
    /// Anahtar Zinciri'ndeki bir öğenin yeri.
    private struct Kasa {
        let hizmet: String
        let hesap: String
    }

    private static let alania = Kasa(hizmet: (Bundle.main.bundleIdentifier ?? "CanliCeviri") + ".alania",
                                     hesap: "alaniaAnahtari")
    private static let soniox = Kasa(hizmet: (Bundle.main.bundleIdentifier ?? "CanliCeviri") + ".soniox",
                                     hesap: "sonioxAnahtari")

    /// Son okunan ya da yazılan değer (Ön-10c: her cümlede Anahtar Zinciri'ne gidilmez). nil: henüz okunmadı.
    private static var bellekte: String?
    private static var sonioxBellekte: String?

    /// Kayıtlı anahtar; yoksa boş dizge. Boş dizge atamak anahtarı siler. Baştaki ve sondaki boşluklar kırpılır.
    /// Eski kurulumda `UserDefaults`'ta kalan değer ilk okumada Anahtar Zinciri'ne taşınır (A2).
    static var alaniaAnahtari: String {
        get {
            if let onceki = bellekte { return onceki }
            eskisiniTasi()
            let (deger, durum) = oku(alania)
            // Kilitli cihaz gibi geçici bir okuma hatasında boş değer bellekte tutulmaz; sonraki okuma yeniden dener.
            if durum == errSecSuccess || durum == errSecItemNotFound { bellekte = deger ?? "" }
            return deger ?? ""
        }
        set {
            let temiz = kirp(newValue)
            if yaz(temiz, alania) {
                bellekte = temiz
                // Eski arayüzden kalan değer bir sonraki okumada bunu ezmesin.
                UserDefaults.standard.removeObject(forKey: Kayit.alaniaAnahtari)
            } else {
                bellekte = nil
            }
        }
    }

    /// Kullanıcının Ayarlar'da girdiği Soniox anahtarı; yoksa boş dizge. Kurallar Alania anahtarıyla aynıdır:
    /// boş dizge atamak siler, baştaki ve sondaki boşluklar kırpılır, değer hiçbir kayda yazılmaz.
    /// KR8: anahtar ilk kez kaydedilince motor "bulut" olur; silinince (gömülü anahtar da yoksa) "cihaz"a döner.
    /// Buranın yazdığı "cihaz" açık seçim değildir (`Kayit.cihazSecildi` yazılmaz): sonraki bir yapıda anahtar
    /// yeniden bulununca (gömülü ya da sunucudan) motor kendiliğinden buluta döner (S03 tur 2).
    static var sonioxAnahtari: String {
        get {
            if let onceki = sonioxBellekte { return onceki }
            let (deger, durum) = oku(soniox)
            if durum == errSecSuccess || durum == errSecItemNotFound { sonioxBellekte = deger ?? "" }
            return deger ?? ""
        }
        set {
            let onceki = sonioxAnahtari
            let temiz = kirp(newValue)
            guard yaz(temiz, soniox) else {
                sonioxBellekte = nil
                return
            }
            sonioxBellekte = temiz
            if temiz.isEmpty {
                // Anahtar sunucudan gelebiliyorsa (S03) bulut seçili kalır.
                if gomulu.isEmpty && !sunucudanAnahtar {
                    UserDefaults.standard.set(Motor.cihaz.rawValue, forKey: Kayit.motor)
                }
            } else if onceki.isEmpty {
                UserDefaults.standard.set(Motor.bulut.rawValue, forKey: Kayit.motor)
                UserDefaults.standard.removeObject(forKey: Kayit.cihazSecildi)
            }
        }
    }

    /// Yapıya gömülü Soniox anahtarı (yalnız TestFlight iş akışı doldurur; bkz. `Bulut/GomuluAnahtar.swift`).
    /// Ekranda, Tanılama'da ve panoda gösterilmez (KR14).
    private static var gomulu: String { kirp(gomuluSonioxAnahtari) }

    /// Yapıda gömülü Soniox anahtarı var mı (Ayarlar bunu yazıyla söyler; değeri göstermez).
    static var sonioxGomulu: Bool { !gomulu.isEmpty }

    /// Bulut motorunun kullanacağı anahtar: kullanıcının girdiği varsa o, yoksa yapıya gömülü olan (KR14).
    static var gecerliSonioxAnahtari: String {
        let kullanici = sonioxAnahtari
        return kullanici.isEmpty ? gomulu : kullanici
    }

    /// Anahtar geçici anahtar sunucusundan mı gelir (S03): mağaza yapısında (`DENEME` yok) yerel anahtar (kullanıcının
    /// girdiği ya da gömülü) yoksa ve sunucu adresi doluysa. Deneme yapısında sunucu kullanılmaz (iç test: gömülü
    /// anahtar). Mağaza yapısına uzun ömürlü anahtar gömülmez; anahtar yalnız sunucudan, geçici olarak gelir.
    static var sunucudanAnahtar: Bool {
        #if DENEME
        return false
        #else
        return gecerliSonioxAnahtari.isEmpty && !kirp(sunucuAdresi).isEmpty
        #endif
    }

    /// Seçili motor (K3, KR8, KR14; S03). Ne yerel anahtar ne sunucu varsa cihaz. Anahtar varsa ya da sunucudan
    /// geliyorsa bulut; cihaz yalnız Geliştirici bölümünde AÇIKÇA seçildiyse (`cihazSecildi`).
    static var motor: Motor {
        guard !gecerliSonioxAnahtari.isEmpty || sunucudanAnahtar else { return .cihaz }
        return cihazSecildi ? .cihaz : .bulut
    }

    /// Kullanıcı Geliştirici bölümünde cihaz motorunu açıkça seçti mi (S03 tur 2). `Kayit.motor`'daki "cihaz" tek
    /// başına yetmez: onu anahtar silinince otomatik geçiş kodu da yazar ve eski yapılardan kalmış olabilir; öyle bir
    /// değer, anahtarın sunucudan geldiği mağaza yapısında bulut motorunu (ve dil seçimini) kapatırdı.
    static var cihazSecildi: Bool {
        let varsayilanlar = UserDefaults.standard
        return varsayilanlar.bool(forKey: Kayit.cihazSecildi)
            && varsayilanlar.string(forKey: Kayit.motor) == Motor.cihaz.rawValue
    }

    /// Soniox anahtarının nereden geldiği; yalnız Tanılama içindir. Anahtarın kendisi asla yazılmaz (KR14).
    static var anahtarKaynagi: String {
        if !sonioxAnahtari.isEmpty { return "kullanıcı" }
        if sonioxGomulu { return "gömülü" }
        return sunucudanAnahtar ? "sunucu" : "yok"
    }

    /// Tanılama başlığı için tek satır: seçili motor, anahtar kaynağı, yapı türü ve (varsa) açık cihaz seçimi.
    static var tanilamaOzeti: String {
        #if DENEME
        let yapi = "deneme"
        #else
        let yapi = "mağaza"
        #endif
        return "Motor \(motor.rawValue) · anahtar \(anahtarKaynagi) · yapı \(yapi)"
            + (cihazSecildi ? " · cihaz açıkça seçildi" : "")
    }

    /// A2: `UserDefaults`'taki değer, boş da olsa, kazanır (orada yalnız eski arayüz yazmış olabilir, o da
    /// kullanıcının en son girdiğidir). Anahtar Zinciri'ne yazılamazsa eski değer silinmez (anahtar kaybolmasın).
    private static func eskisiniTasi() {
        let varsayilanlar = UserDefaults.standard
        guard let eski = varsayilanlar.string(forKey: Kayit.alaniaAnahtari) else { return }
        guard yaz(kirp(eski), alania) else { return }   // boşsa Anahtar Zinciri'ndeki öğe silinir
        varsayilanlar.removeObject(forKey: Kayit.alaniaAnahtari)
    }

    private static func kirp(_ deger: String) -> String {
        deger.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sorgu(_ kasa: Kasa) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: kasa.hizmet,
            kSecAttrAccount as String: kasa.hesap,
        ]
    }

    private static func oku(_ kasa: Kasa) -> (deger: String?, durum: OSStatus) {
        var istek = sorgu(kasa)
        istek[kSecReturnData as String] = true
        istek[kSecMatchLimit as String] = kSecMatchLimitOne
        var sonuc: CFTypeRef?
        let durum = SecItemCopyMatching(istek as CFDictionary, &sonuc)
        guard durum == errSecSuccess, let veri = sonuc as? Data else { return (nil, durum) }
        return (String(data: veri, encoding: .utf8), durum)
    }

    /// Yazar (boşsa siler). Başarısızsa Tanılama'ya yalnız durum kodu yazılır, anahtar asla (A3).
    private static func yaz(_ deger: String, _ kasa: Kasa) -> Bool {
        let durum = yazmaDurumu(deger, kasa)
        guard durum == errSecSuccess else {
            Tanilama.ortak.kaydet("anahtar", "kaydedilemedi \(durum)", uyari: true)
            return false
        }
        return true
    }

    private static func yazmaDurumu(_ deger: String, _ kasa: Kasa) -> OSStatus {
        let temel = sorgu(kasa)
        if deger.isEmpty {
            let durum = SecItemDelete(temel as CFDictionary)
            return durum == errSecItemNotFound ? errSecSuccess : durum
        }
        let veri = Data(deger.utf8)
        let guncelle: [String: Any] = [kSecValueData as String: veri]
        let durum = SecItemUpdate(temel as CFDictionary, guncelle as CFDictionary)
        guard durum == errSecItemNotFound else { return durum }
        var yeni = temel
        yeni[kSecValueData as String] = veri
        yeni[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(yeni as CFDictionary, nil)
    }
}
