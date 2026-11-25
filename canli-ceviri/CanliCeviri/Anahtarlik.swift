import Foundation
import Security

/// Alania anahtarı Anahtar Zinciri'nde saklanır (brief K5, şartname § 5.1). Anahtarı okuyan her yer bunu kullanır.
/// Okuyan ve yazan yerler (`Hat`, Ayarlar ekranı) ana aktörde olduğu için bellekteki kopya da orada tutulur.
@MainActor
enum Anahtarlik {
    private static let hizmet = (Bundle.main.bundleIdentifier ?? "CanliCeviri") + ".alania"
    private static let hesap = "alaniaAnahtari"

    /// Son okunan ya da yazılan değer (Ön-10c: her cümlede Anahtar Zinciri'ne gidilmez). nil: henüz okunmadı.
    private static var bellekte: String?

    /// Kayıtlı anahtar; yoksa boş dizge. Boş dizge atamak anahtarı siler. Baştaki ve sondaki boşluklar kırpılır.
    /// Eski kurulumda `UserDefaults`'ta kalan değer ilk okumada Anahtar Zinciri'ne taşınır (A2).
    static var alaniaAnahtari: String {
        get {
            if let onceki = bellekte { return onceki }
            eskisiniTasi()
            let (deger, durum) = oku()
            // Kilitli cihaz gibi geçici bir okuma hatasında boş değer bellekte tutulmaz; sonraki okuma yeniden dener.
            if durum == errSecSuccess || durum == errSecItemNotFound { bellekte = deger ?? "" }
            return deger ?? ""
        }
        set {
            let temiz = kirp(newValue)
            if yaz(temiz) {
                bellekte = temiz
                // Eski arayüzden kalan değer bir sonraki okumada bunu ezmesin.
                UserDefaults.standard.removeObject(forKey: Kayit.alaniaAnahtari)
            } else {
                bellekte = nil
            }
        }
    }

    /// A2: `UserDefaults`'taki değer, boş da olsa, kazanır (orada yalnız eski arayüz yazmış olabilir, o da
    /// kullanıcının en son girdiğidir). Anahtar Zinciri'ne yazılamazsa eski değer silinmez (anahtar kaybolmasın).
    private static func eskisiniTasi() {
        let varsayilanlar = UserDefaults.standard
        guard let eski = varsayilanlar.string(forKey: Kayit.alaniaAnahtari) else { return }
        guard yaz(kirp(eski)) else { return }   // boşsa Anahtar Zinciri'ndeki öğe silinir
        varsayilanlar.removeObject(forKey: Kayit.alaniaAnahtari)
    }

    private static func kirp(_ deger: String) -> String {
        deger.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sorgu() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: hizmet,
            kSecAttrAccount as String: hesap,
        ]
    }

    private static func oku() -> (deger: String?, durum: OSStatus) {
        var istek = sorgu()
        istek[kSecReturnData as String] = true
        istek[kSecMatchLimit as String] = kSecMatchLimitOne
        var sonuc: CFTypeRef?
        let durum = SecItemCopyMatching(istek as CFDictionary, &sonuc)
        guard durum == errSecSuccess, let veri = sonuc as? Data else { return (nil, durum) }
        return (String(data: veri, encoding: .utf8), durum)
    }

    /// Yazar (boşsa siler). Başarısızsa Tanılama'ya yalnız durum kodu yazılır, anahtar asla (A3).
    private static func yaz(_ deger: String) -> Bool {
        let durum = yazmaDurumu(deger)
        guard durum == errSecSuccess else {
            Tanilama.ortak.kaydet("anahtar", "kaydedilemedi \(durum)", uyari: true)
            return false
        }
        return true
    }

    private static func yazmaDurumu(_ deger: String) -> OSStatus {
        let temel = sorgu()
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
