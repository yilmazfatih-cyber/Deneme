// CeviriApp.swift — Canlı Çeviri (koyu lacivert tema)
//
// Akış (cihaz motoru):  iPhone mikrofonu -> konuşma tanıma (Apple) -> çeviri (Apple) -> ekran
// Akış (bulut motoru):  iPhone mikrofonu -> Soniox (tanıma ve çeviri tek akışta) -> ekran
// İsteğe bağlı sesli okuma: Alania-2 (anahtar yoksa ya da hedef dil Türkçe değilse Apple sesi) -> AirPods
//
// Dosyalar:
//   Sabitler.swift              diller, süreler, Alania adresi, renkler
//   Durum.swift                 ekranların paylaştığı durum (aşama, notlar) ve çeviri döngüsü
//   Hat.swift                   mikrofon, cümle ayırma, seslendirme, kesintiler
//   Tanilama.swift              cihazda tutulan olay kaydı (içerik ve cihaz adı yazılmaz)
//   Anahtarlik.swift            Alania ve Soniox anahtarları (Anahtar Zinciri), seçili motor
//   Bulut/SonioxCozucu.swift    Soniox yanıtlarını cümlelere ayıran saf mantık (yalnız Foundation; testi tests/ios)
//   Bulut/BulutAkisi.swift      Soniox WebSocket akışı ve ses dönüşümü (16 kHz, tek kanal, 16 bit)
//   Bulut/GomuluAnahtar.swift   yapıya gömülü Soniox anahtarı (depoda hep boş; yalnız TestFlight iş akışı doldurur)
//   Abonelik.swift              haftalık abonelik (StoreKit 2) ve günlük ücretsiz süre
//   Arayuz/KokEkran.swift       arka plan, sekme çubuğu, çeviri oturumu, duyurular
//   Arayuz/*Ekrani.swift        Çeviri, Geçmiş, Ayarlar ve Tanılama ekranları
//   Arayuz/Bilesenler.swift     kart, satır ve uyarı satırı
//   Arayuz/Onizleme.swift       örnek durumlar: Xcode önizlemeleri ve `-ekran <ad>` (yalnız DEBUG)

import SwiftUI

@main
struct CeviriApp: App {
    /// Uygulama boyunca tek `Durum` (ve tek `Hat`, tek ses motoru).
    @State private var durum: Durum
    private let ilkSekme: Sekme
    private let tanilamaAcik: Bool

    init() {
        #if DEBUG
        // Simülatör ekran görüntüleri: `-ekran <ad>` ile örnek durum; mikrofon, çeviri ve gerçek ses yolu açılmaz.
        if let ornek = OrnekEkran.baslangic {
            _durum = State(initialValue: ornek.durum())
            ilkSekme = ornek.sekme
            tanilamaAcik = ornek.tanilamaAcik
            return
        }
        #endif
        let yeni = Durum()
        yeni.abonelik.basla()   // işlem güncellemeleri açılıştan itibaren dinlenir (S03)
        _durum = State(initialValue: yeni)
        ilkSekme = .ceviri
        tanilamaAcik = false
    }

    var body: some Scene {
        WindowGroup {
            KokEkran(durum: durum, sekme: ilkSekme, tanilamaAcik: tanilamaAcik)
                .preferredColorScheme(.dark)
        }
    }
}
