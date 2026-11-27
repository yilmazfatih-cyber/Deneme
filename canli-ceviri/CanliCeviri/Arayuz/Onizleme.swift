// Örnek durumlar: Xcode önizlemeleri ve simülatör ekran görüntüleri (`-ekran <ad>` başlatma argümanı) aynı
// durumları kullanır. Bu kipte mikrofon, çeviri ve gerçek ses yolu açılmaz (bkz. `Hat.onizlemeKipi`).
// Önizleme: bu dosyayı açıp Canvas'ı gösterin (Editor > Canvas, ⌥⌘↩).

#if DEBUG
import SwiftUI

/// Brief "Sözleşmeler" tablosundaki ekranlar (S03: abonelik, sinir-doldu; S02: ayarlar-bulut, ceviri-bulut);
/// ham değer `-ekran` argümanının değeridir.
enum OrnekEkran: String, CaseIterable {
    case ceviriBos = "ceviri-bos"
    case ceviri
    case dinliyor
    case kulakliksiz
    case gecmis
    case gecmisBos = "gecmis-bos"
    case ayarlar
    case tanilama
    case abonelik
    case sinirDoldu = "sinir-doldu"
    case ayarlarBulut = "ayarlar-bulut"   // S02: anahtar girilmiş, motor bulut
    case ceviriBulut = "ceviri-bulut"     // S02: bulut motoruyla dinliyor, canlı asıl metin ve akan çeviri

    /// En son örnek durumu üretilen ekran; `AyarlarEkrani` örnek Soniox anahtarını buna bakarak gösterir.
    @MainActor static var gosterilen: OrnekEkran?

    /// `-ekran <ad>` ile açıldıysa o ekran; yoksa nil.
    static var baslangic: OrnekEkran? {
        UserDefaults.standard.string(forKey: "ekran").flatMap { OrnekEkran(rawValue: $0) }
    }

    var sekme: Sekme {
        switch self {
        case .ceviriBos, .ceviri, .dinliyor, .kulakliksiz, .abonelik, .sinirDoldu, .ceviriBulut: .ceviri
        case .gecmis, .gecmisBos:                         .gecmis
        case .ayarlar, .tanilama, .ayarlarBulut:          .ayarlar
        }
    }

    var tanilamaAcik: Bool { self == .tanilama }

    /// Önizleme kipinde, örnek verilerle bir `Durum`.
    @MainActor
    func durum() -> Durum {
        let durum = Durum()
        OrnekEkran.gosterilen = self
        durum.hat.onizlemeKipi(kulaklik: self == .kulakliksiz ? nil : "AirPods Pro",
                               canliMetin: self == .dinliyor || self == .ceviriBulut ? "Excuse me, where is the" : "",
                               canliCeviri: self == .ceviriBulut ? "Affedersiniz, en yakın" : "")
        switch self {
        case .ceviri, .kulakliksiz, .gecmis:
            durum.satirlar = Satir.ornekler
        case .dinliyor:
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
        case .tanilama:
            Tanilama.ortak.ornekleDoldur()
        case .abonelik:
            durum.abonelik.ornekFiyat = "₺49,99"   // yalnız önizleme verisi; gerçek fiyat App Store'dan gelir
            durum.abonelikAcik = true
        case .sinirDoldu:
            durum.satirlar = Satir.ornekler
            durum.sinirMetni = Durum.sinirAciklamasi
        case .ceviriBulut:
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
            durum.bulutCalisiyor = true
        case .ceviriBos, .gecmisBos, .ayarlar, .ayarlarBulut:
            break
        }
        return durum
    }
}

extension Satir {
    /// Örnek çeviriler.
    static var ornekler: [Satir] {
        [
            Satir(asil: "Good morning, how can I help you?",
                  ceviri: "Günaydın, size nasıl yardımcı olabilirim?"),
            Satir(asil: "The next train to the airport leaves at nine.",
                  ceviri: "Havalimanına giden bir sonraki tren dokuzda kalkıyor."),
            Satir(asil: "Please keep your ticket with you.",
                  ceviri: "Lütfen biletinizi yanınızda bulundurun."),
        ]
    }
}

#Preview("Çeviri — boş") { KokEkran(durum: OrnekEkran.ceviriBos.durum()) }
#Preview("Çeviri") { KokEkran(durum: OrnekEkran.ceviri.durum()) }
#Preview("Dinliyor") { KokEkran(durum: OrnekEkran.dinliyor.durum()) }
#Preview("Kulaklıksız") { KokEkran(durum: OrnekEkran.kulakliksiz.durum()) }
#Preview("Geçmiş") { KokEkran(durum: OrnekEkran.gecmis.durum(), sekme: .gecmis) }
#Preview("Geçmiş — boş") { KokEkran(durum: OrnekEkran.gecmisBos.durum(), sekme: .gecmis) }
#Preview("Ayarlar") { KokEkran(durum: OrnekEkran.ayarlar.durum(), sekme: .ayarlar) }
#Preview("Abonelik") { KokEkran(durum: OrnekEkran.abonelik.durum()) }
#Preview("Süre doldu") { KokEkran(durum: OrnekEkran.sinirDoldu.durum()) }
#Preview("Ayarlar — bulut") { KokEkran(durum: OrnekEkran.ayarlarBulut.durum(), sekme: .ayarlar) }
#Preview("Çeviri — bulut") { KokEkran(durum: OrnekEkran.ceviriBulut.durum()) }
#Preview("Tanılama") { KokEkran(durum: OrnekEkran.tanilama.durum(), sekme: .ayarlar, tanilamaAcik: true) }
#endif
