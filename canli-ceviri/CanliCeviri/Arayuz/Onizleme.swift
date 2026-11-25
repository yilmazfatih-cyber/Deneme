// Örnek durumlar: Xcode önizlemeleri ve simülatör ekran görüntüleri (`-ekran <ad>` başlatma argümanı) aynı
// durumları kullanır. Bu kipte mikrofon, çeviri ve gerçek ses yolu açılmaz (bkz. `Hat.onizlemeKipi`).
// Önizleme: bu dosyayı açıp Canvas'ı gösterin (Editor > Canvas, ⌥⌘↩).

#if DEBUG
import SwiftUI

/// Brief "Sözleşmeler" tablosundaki sekiz ekran; ham değer `-ekran` argümanının değeridir.
enum OrnekEkran: String, CaseIterable {
    case ceviriBos = "ceviri-bos"
    case ceviri
    case dinliyor
    case kulakliksiz
    case gecmis
    case gecmisBos = "gecmis-bos"
    case ayarlar
    case tanilama

    /// `-ekran <ad>` ile açıldıysa o ekran; yoksa nil.
    static var baslangic: OrnekEkran? {
        UserDefaults.standard.string(forKey: "ekran").flatMap { OrnekEkran(rawValue: $0) }
    }

    var sekme: Sekme {
        switch self {
        case .ceviriBos, .ceviri, .dinliyor, .kulakliksiz: .ceviri
        case .gecmis, .gecmisBos:                         .gecmis
        case .ayarlar, .tanilama:                         .ayarlar
        }
    }

    var tanilamaAcik: Bool { self == .tanilama }

    /// Önizleme kipinde, örnek verilerle bir `Durum`.
    @MainActor
    func durum() -> Durum {
        let durum = Durum()
        durum.hat.onizlemeKipi(kulaklik: self == .kulakliksiz ? nil : "AirPods Pro",
                               canliMetin: self == .dinliyor ? "Excuse me, where is the" : "")
        switch self {
        case .ceviri, .kulakliksiz, .gecmis:
            durum.satirlar = Satir.ornekler
        case .dinliyor:
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
        case .tanilama:
            Tanilama.ortak.ornekleDoldur()
        case .ceviriBos, .gecmisBos, .ayarlar:
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
#Preview("Tanılama") { KokEkran(durum: OrnekEkran.tanilama.durum(), sekme: .ayarlar, tanilamaAcik: true) }
#endif
