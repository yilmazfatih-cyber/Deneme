// CeviriApp.swift — Canlı Çeviri (koyu lacivert tema)
//
// Akış:  iPhone mikrofonu -> konuşma tanıma (Apple) -> çeviri (Apple)
//        -> Türkçe seslendirme (Alania-2, anahtar yoksa Apple sesi) -> AirPods
//
// Dosyalar:
//   Sabitler.swift              diller, süreler, Alania adresi, renkler
//   Durum.swift                 ekranların paylaştığı durum (aşama, notlar) ve çeviri döngüsü
//   Hat.swift                   mikrofon, cümle ayırma, seslendirme, kesintiler
//   Tanilama.swift              cihazda tutulan olay kaydı (içerik ve cihaz adı yazılmaz)
//   Anahtarlik.swift            Alania anahtarı (Anahtar Zinciri)
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
        _durum = State(initialValue: Durum())
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
