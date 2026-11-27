import Foundation
import Observation

/// Haftalık üyeliğin kalan çeviri kotası (S03). Değer yalnız geçici anahtar sunucusundan gelir (`kalan_sn`); her
/// anahtar alındığında güncellenir. Kotanın büyüklüğü koda yazılmaz. Ayarlar'daki "Bu hafta kalan" satırı ve Çeviri
/// ekranındaki sarı not bunu okur; bilinmiyorsa ikisi de görünmez.
///
/// Son değer telefonda saklanır (yalnız kalan saniye ve kotanın yenileneceği an; kişisel veri değil) ki uygulama
/// yeniden açılınca Ayarlar son bilineni gösterebilsin. Yenilenme anı geçince değer bilinmiyor sayılır.
@MainActor
@Observable
final class Kota {
    static let ortak = Kota()

    /// Çeviri ekranındaki sarı not (kalan `kotaUyariEsigi` saniyenin altındayken).
    static let azMetni = "Bu haftaki kotanızda \(kotaUyariEsigi / 60) dakikadan az kaldı."

    /// Sunucunun son bildirdiği kalan süre, sn; hiç bildirilmediyse nil.
    private var sonKalan: Int?
    /// O kotanın yenileneceği an; sunucu bildirmediyse nil.
    private var donemBitis: Date?

    private init() {
        let kayit = UserDefaults.standard
        let bitisMs = kayit.double(forKey: Kayit.kotaDonemBitis)
        guard kayit.object(forKey: Kayit.kotaKalan) != nil, bitisMs > 0 else { return }
        sonKalan = max(0, kayit.integer(forKey: Kayit.kotaKalan))
        donemBitis = Date(timeIntervalSince1970: bitisMs / 1000)
    }

    /// Bu üyelik döneminde kalan çeviri süresi, sn. Bilinmiyorsa ya da dönem bittiyse (kota yenilenmiştir) nil.
    /// Deneme (`DENEME`) yapısında kota yoktur: hep nil.
    var kalanSn: Int? {
        #if DENEME
        return nil
        #else
        guard let kalan = sonKalan else { return nil }
        if let bitis = donemBitis, bitis <= Date() { return nil }
        return kalan
        #endif
    }

    /// Kalan süre uyarı eşiğinin altında.
    var azKaldi: Bool {
        guard let kalan = kalanSn else { return false }
        return kalan < kotaUyariEsigi
    }

    /// Sunucudan gelen değerle günceller. `kalanSn` nil ise (sunucu bildirmedi) eldeki değer korunur.
    func guncelle(kalanSn yeni: Int?, donemBitisMs: Int?) {
        guard let yeni else { return }
        let kalan = max(0, yeni)
        let bitis = donemBitisMs.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
        if sonKalan != kalan { sonKalan = kalan }
        if donemBitis != bitis { donemBitis = bitis }
        let kayit = UserDefaults.standard
        if let donemBitisMs {
            kayit.set(kalan, forKey: Kayit.kotaKalan)
            kayit.set(Double(donemBitisMs), forKey: Kayit.kotaDonemBitis)
        } else {
            // Yenilenme anı bilinmeden saklanan değer bayatlayınca ayırt edilemez: yalnız bellekte tutulur.
            kayit.removeObject(forKey: Kayit.kotaKalan)
            kayit.removeObject(forKey: Kayit.kotaDonemBitis)
        }
    }
}

#if DEBUG
extension Kota {
    /// Simülatör ekran görüntüleri ve önizlemeler için: kalan süreyi elle verir (nil: bilinmiyor); saklanmaz.
    func ornekle(kalanSn: Int?) {
        sonKalan = kalanSn
        donemBitis = nil
    }
}
#endif
