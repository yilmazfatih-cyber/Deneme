import Foundation
import Observation
import StoreKit
import SwiftUI

/// Haftalık abonelik (StoreKit 2, KR1): ürün, abonelik durumu, satın alma ve geri yükleme.
/// Durum cihazdaki doğrulamayla belirlenir; sunucu yok. Tanılama'ya fiyat, işlem kimliği ya da Apple Kimliği yazılmaz.
@MainActor
@Observable
final class Abonelik {
    /// Doğrulanmış, süresi geçmemiş ve geri alınmamış bir abonelik var.
    private(set) var abone = false
    /// App Store'dan okunan ürün; yüklenemediyse nil.
    private(set) var urun: Product?
    /// Ürün yükleme, satın alma ya da geri yükleme sürüyor.
    private(set) var yukleniyor = false
    /// Ürün yükleme denendi ve başarısız oldu (ekran "Fiyat yüklenemedi" der).
    private(set) var urunYuklenemedi = false
    /// Satın alma ya da geri yükleme sonrası ekranda gösterilecek kısa not.
    var ileti: String?

    /// Yalnız DEBUG örnek ekranları (`Onizleme.swift`) doldurur; gerçek akışta hep nil.
    @ObservationIgnored var ornekFiyat: String?

    @ObservationIgnored private var dinleyici: Task<Void, Never>?
    @ObservationIgnored private var bildirilenDurum: Bool?

    /// Ekranda gösterilecek fiyat (App Store'un biçimiyle); kodda sabit fiyat yoktur.
    var fiyat: String? {
        urun?.displayPrice ?? ornekFiyat
    }

    /// Uygulama açılışında bir kez çağrılır: işlem güncellemelerini dinler, ürünü ve durumu yükler.
    func basla() {
        guard dinleyici == nil else { return }
        dinleyici = Task { [weak self] in
            for await sonuc in StoreKit.Transaction.updates {
                guard let self else { return }
                await self.islemGeldi(sonuc)
            }
        }
        Task {
            await durumuGuncelle()
            await urunuYukle()
        }
    }

    func urunuYukle() async {
        yukleniyor = true
        defer { yukleniyor = false }
        do {
            let urunler = try await Product.products(for: [abonelikUrunu])
            if let bulunan = urunler.first(where: { $0.id == abonelikUrunu }) {
                urun = bulunan
                urunYuklenemedi = false
                Tanilama.ortak.kaydet("abonelik", "ürün yüklendi")
            } else {
                urunYuklenemedi = urun == nil
                Tanilama.ortak.kaydet("abonelik", "ürün yüklenemedi bulunamadı", uyari: true)
            }
        } catch {
            urunYuklenemedi = urun == nil
            Tanilama.ortak.kaydet("abonelik", "ürün yüklenemedi \(hataKodu(error))", uyari: true)
        }
    }

    /// Satın alma. `satinAlma` SwiftUI ortamındaki `purchase` eylemidir (onay sayfası doğru pencerede açılır).
    func satinAl(ile satinAlma: PurchaseAction) async {
        guard let urun, !yukleniyor else { return }
        yukleniyor = true
        defer { yukleniyor = false }
        ileti = nil
        let sonuc: Product.PurchaseResult
        do {
            sonuc = try await satinAlma(urun)
        } catch {
            ileti = "Satın alma tamamlanamadı. İnternet bağlantınızı denetleyip yeniden deneyin."
            return
        }
        if case .success(let dogrulama) = sonuc {
            guard case .verified(let islem) = dogrulama else {
                // Doğrulanmamış işlem abone saydırmaz.
                ileti = "Satın alma doğrulanamadı. Biraz sonra \"Satın alımları geri yükle\"ye dokunun."
                return
            }
            await islem.finish()
            Tanilama.ortak.kaydet("abonelik", "satın alındı")
            await durumuGuncelle()
        } else if case .userCancelled = sonuc {
            Tanilama.ortak.kaydet("abonelik", "iptal edildi")
        } else if case .pending = sonuc {
            Tanilama.ortak.kaydet("abonelik", "beklemede")
            ileti = "Satın alma onay bekliyor. Onaylanınca abonelik kendiliğinden açılır."
        }
    }

    func geriYukle() async {
        guard !yukleniyor else { return }
        yukleniyor = true
        defer { yukleniyor = false }
        ileti = nil
        do {
            try await AppStore.sync()
        } catch {
            ileti = "Geri yükleme yapılamadı. İnternet bağlantınızı denetleyip yeniden deneyin."
            return
        }
        Tanilama.ortak.kaydet("abonelik", "geri yüklendi")
        await durumuGuncelle()
        if !abone { ileti = "Bu Apple Kimliği'nde etkin abonelik bulunamadı." }
    }

    /// Etkin hakları baştan okur. Süresi geçmiş, geri alınmış, yükseltilmiş ya da doğrulanmamış işlem sayılmaz.
    func durumuGuncelle() async {
        var etkin = false
        let simdi = Date()
        for await sonuc in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let islem) = sonuc, islem.productID == abonelikUrunu else { continue }
            if islem.revocationDate != nil || islem.isUpgraded { continue }
            if let bitis = islem.expirationDate, bitis <= simdi { continue }
            etkin = true
        }
        abone = etkin
        if bildirilenDurum != etkin {
            bildirilenDurum = etkin
            Tanilama.ortak.kaydet("abonelik", etkin ? "durum=abone" : "durum=ücretsiz")
        }
    }

    /// Uygulama dışında (başka cihaz, yenileme, iptal, geri ödeme, onaylanan bekleyen alım) gelen işlem.
    private func islemGeldi(_ sonuc: VerificationResult<StoreKit.Transaction>) async {
        if case .verified(let islem) = sonuc {
            await islem.finish()
        }
        await durumuGuncelle()
    }
}

/// Abone olmayanın günlük ücretsiz dinleme süresi: yerel takvim günü + o gün kullanılan saniye, telefonda tutulur.
enum GunlukSure {
    /// Bugün kullanılan saniye (gün değiştiyse 0).
    static func kullanilan(_ an: Date = Date()) -> TimeInterval {
        let kayit = UserDefaults.standard
        guard kayit.string(forKey: Kayit.ucretsizGun) == gunAnahtari(an) else { return 0 }
        return kayit.double(forKey: Kayit.ucretsizSaniye)
    }

    /// Süre ekler; bugünün toplamını döndürür.
    @discardableResult
    static func ekle(_ saniye: TimeInterval, _ an: Date = Date()) -> TimeInterval {
        let toplam = kullanilan(an) + max(0, saniye)
        let kayit = UserDefaults.standard
        kayit.set(gunAnahtari(an), forKey: Kayit.ucretsizGun)
        kayit.set(toplam, forKey: Kayit.ucretsizSaniye)
        return toplam
    }

    static func doldu(_ an: Date = Date()) -> Bool {
        kullanilan(an) >= gunlukUcretsizSure
    }

    /// Ör. "2026-11-25" (cihazın takvimi ve saat dilimiyle).
    private static func gunAnahtari(_ an: Date) -> String {
        let g = Calendar.current.dateComponents([.year, .month, .day], from: an)
        return "\(g.year ?? 0)-\(g.month ?? 0)-\(g.day ?? 0)"
    }
}
