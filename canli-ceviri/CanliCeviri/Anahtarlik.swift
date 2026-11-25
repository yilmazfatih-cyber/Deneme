import Foundation
import Security

/// Alania anahtarı Anahtar Zinciri'nde saklanır (brief K5). Anahtarı okuyan her yer bunu kullanır.
enum Anahtarlik {
    private static let hizmet = (Bundle.main.bundleIdentifier ?? "CanliCeviri") + ".alania"
    private static let hesap = "alaniaAnahtari"

    /// Kayıtlı anahtar; yoksa boş dizge. Boş dizge atamak anahtarı siler.
    /// Eski kurulumda `UserDefaults`'ta kalan değer okunurken Anahtar Zinciri'ne taşınır ve oradan silinir.
    static var alaniaAnahtari: String {
        get {
            eskisiniTasi()
            return oku() ?? ""
        }
        set {
            yaz(newValue)
        }
    }

    /// `UserDefaults`'taki eski değeri taşır; Anahtar Zinciri'ne yazılamazsa silmez (anahtar kaybolmasın).
    private static func eskisiniTasi() {
        let varsayilanlar = UserDefaults.standard
        guard let eski = varsayilanlar.string(forKey: Kayit.alaniaAnahtari) else { return }
        if !eski.isEmpty, oku() == nil {
            guard yaz(eski) else { return }
        }
        varsayilanlar.removeObject(forKey: Kayit.alaniaAnahtari)
    }

    private static func sorgu() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: hizmet,
            kSecAttrAccount as String: hesap,
        ]
    }

    private static func oku() -> String? {
        var istek = sorgu()
        istek[kSecReturnData as String] = true
        istek[kSecMatchLimit as String] = kSecMatchLimitOne
        var sonuc: CFTypeRef?
        let durum = SecItemCopyMatching(istek as CFDictionary, &sonuc)
        guard durum == errSecSuccess, let veri = sonuc as? Data else { return nil }
        return String(data: veri, encoding: .utf8)
    }

    @discardableResult
    private static func yaz(_ deger: String) -> Bool {
        let temel = sorgu()
        if deger.isEmpty {
            let durum = SecItemDelete(temel as CFDictionary)
            return durum == errSecSuccess || durum == errSecItemNotFound
        }
        let veri = Data(deger.utf8)
        let guncelle: [String: Any] = [kSecValueData as String: veri]
        let durum = SecItemUpdate(temel as CFDictionary, guncelle as CFDictionary)
        if durum == errSecSuccess { return true }
        guard durum == errSecItemNotFound else { return false }
        var yeni = temel
        yeni[kSecValueData as String] = veri
        yeni[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(yeni as CFDictionary, nil) == errSecSuccess
    }
}
