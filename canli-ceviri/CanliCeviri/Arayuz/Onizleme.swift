// Örnek durumlar: Xcode önizlemeleri ve simülatör ekran görüntüleri (`-ekran <ad>` başlatma argümanı) aynı
// durumları kullanır. Bu kipte mikrofon, çeviri ve gerçek ses yolu açılmaz (bkz. `Hat.onizlemeKipi`).
// Önizleme: bu dosyayı açıp Canvas'ı gösterin (Editor > Canvas, ⌥⌘↩).

#if DEBUG
import SwiftUI

/// Brief "Sözleşmeler" tablosundaki ekranlar (S03: abonelik, ayarlar-kota, ceviri-kota-az; S02: ayarlar-bulut,
/// ceviri-bulut, abonelik-bitti…);
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
    case abonelikBitti = "abonelik-bitti"   // S02 tur 3: abonelik oturum ortasında bitti (eski `sinir-doldu` yerine)
    case ayarlarBulut = "ayarlar-bulut"   // S02: anahtar girilmiş, motor bulut
    case ceviriBulut = "ceviri-bulut"     // S02: bulut motoruyla dinliyor, canlı asıl metin ve akan çeviri
    case dilSecimi = "dil-secimi"         // S02 tur 2: Çeviri ekranında aranabilir kaynak dil sayfası açık
    case tanilamaGelistirici = "tanilama-gelistirici"   // S02 tur 3: Tanılama sayfasında Geliştirici bölümü
    case ayarlarKota = "ayarlar-kota"       // S03: abone, Ayarlar'da "Bu hafta kalan" satırı görünür
    case ceviriKotaAz = "ceviri-kota-az"    // S03: bulut motoruyla dinliyor, kotada 10 dakikadan az kaldı (sarı not)
    /// S03 tur 2: duruyor, bulut motoru; iki dil düğmesi seçilebilir. Görüntüsü en büyük Dinamik Yazı'da alınır.
    case ceviriDiller = "ceviri-diller-buyuk-yazi"

    /// En son örnek durumu üretilen ekran; `AyarlarEkrani` örnek Soniox anahtarını buna bakarak gösterir.
    @MainActor static var gosterilen: OrnekEkran?

    /// `-ekran <ad>` ile açıldıysa o ekran; yoksa nil.
    static var baslangic: OrnekEkran? {
        UserDefaults.standard.string(forKey: "ekran").flatMap { OrnekEkran(rawValue: $0) }
    }

    var sekme: Sekme {
        switch self {
        case .ceviriBos, .ceviri, .dinliyor, .kulakliksiz, .abonelik, .abonelikBitti, .ceviriBulut, .dilSecimi,
             .ceviriKotaAz, .ceviriDiller:
            .ceviri
        case .gecmis, .gecmisBos:
            .gecmis
        case .ayarlar, .tanilama, .ayarlarBulut, .tanilamaGelistirici, .ayarlarKota:
            .ayarlar
        }
    }

    var tanilamaAcik: Bool { self == .tanilama || self == .tanilamaGelistirici }

    /// Önizleme kipinde, örnek verilerle bir `Durum`.
    @MainActor
    func durum() -> Durum {
        let durum = Durum()
        OrnekEkran.gosterilen = self
        let bulutDinliyor = self == .ceviriBulut || self == .ceviriKotaAz
        durum.hat.onizlemeKipi(kulaklik: self == .kulakliksiz ? nil : "AirPods Pro",
                               canliMetin: self == .dinliyor || bulutDinliyor ? "Excuse me, where is the" : "",
                               canliCeviri: bulutDinliyor ? "Affedersiniz, en yakın" : "")
        // Kalan kota yalnız kota ekranlarında bilinir; ötekilerde satır ve not görünmez.
        Kota.ortak.ornekle(kalanSn: nil)
        switch self {
        case .ceviri, .kulakliksiz, .gecmis, .ceviriDiller:
            durum.satirlar = Satir.ornekler
        case .dinliyor:
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
        case .tanilama:
            Tanilama.ortak.ornekleDoldur()
        case .abonelik:
            durum.abonelik.ornekFiyat = "$4.99"   // yalnız önizleme verisi; gerçek fiyat App Store'dan gelir
            durum.abonelikAcik = true
        case .abonelikBitti:
            durum.satirlar = Satir.ornekler
            durum.abonelikNotu = Durum.abonelikBittiMetni
        case .tanilamaGelistirici:
            // Geliştirici bölümü görüntüye sığsın diye kayıtta yalnız birkaç olay bulunur.
            Tanilama.ortak.temizle()
            Tanilama.ortak.kaydet("başlat", "dil=otomatik motor=bulut hedef=tr")
            Tanilama.ortak.kaydet("bulut", "akış başladı 412 ms")
        case .ceviriBulut:
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
            durum.bulutCalisiyor = true
        case .ayarlarKota:
            durum.abonelik.ornekAbone()
            Kota.ortak.ornekle(kalanSn: 2 * 3600 + 14 * 60)   // "2 sa 14 dk"; yalnız önizleme verisi
        case .ceviriKotaAz:
            durum.abonelik.ornekAbone()
            Kota.ortak.ornekle(kalanSn: 8 * 60)   // eşiğin (10 dk) altında: sarı not görünür
            durum.satirlar = Satir.ornekler
            durum.asama = .dinliyor
            durum.bulutCalisiyor = true
        case .ceviriBos, .gecmisBos, .ayarlar, .ayarlarBulut, .dilSecimi:
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
#Preview("Abonelik bitti") { KokEkran(durum: OrnekEkran.abonelikBitti.durum()) }
#Preview("Tanılama — geliştirici") {
    KokEkran(durum: OrnekEkran.tanilamaGelistirici.durum(), sekme: .ayarlar, tanilamaAcik: true)
}
#Preview("Ayarlar — bulut") { KokEkran(durum: OrnekEkran.ayarlarBulut.durum(), sekme: .ayarlar) }
#Preview("Ayarlar — kota") { KokEkran(durum: OrnekEkran.ayarlarKota.durum(), sekme: .ayarlar) }
#Preview("Çeviri — kota az") { KokEkran(durum: OrnekEkran.ceviriKotaAz.durum()) }
#Preview("Çeviri — bulut") { KokEkran(durum: OrnekEkran.ceviriBulut.durum()) }
#Preview("Çeviri — diller, büyük yazı") {
    KokEkran(durum: OrnekEkran.ceviriDiller.durum())
        .dynamicTypeSize(.accessibility5)
}
#Preview("Dil seçimi") {
    DilSecimEkrani(baslik: "Konuşulan dil", diller: bulutDilleri, otomatik: true, secili: .constant(otomatikDil))
        .background(Renk.zemin)
        .preferredColorScheme(.dark)
}
#Preview("Tanılama") { KokEkran(durum: OrnekEkran.tanilama.durum(), sekme: .ayarlar, tanilamaAcik: true) }
#endif
