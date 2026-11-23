// CeviriApp.swift — Canlı Çeviri (koyu lacivert tema)
//
// Akış:  iPhone mikrofonu -> konuşma tanıma (Apple) -> çeviri (Apple)
//        -> Türkçe seslendirme (Alania-2, anahtar yoksa Apple sesi) -> AirPods
//
// Dosyalar:
//   Sabitler.swift          diller, süreler, Alania adresi, renkler
//   Durum.swift             ekranların paylaştığı durum ve çeviri döngüsü
//   Hat.swift               mikrofon, cümle ayırma, seslendirme
//   Arayuz/KokEkran.swift   arka plan, sekme çubuğu, çeviri oturumu
//   Arayuz/*Ekrani.swift    Çeviri, Geçmiş ve Ayarlar sekmeleri
//   Arayuz/Bilesenler.swift kart ve satır görünümü
//   Arayuz/Onizleme.swift   Xcode önizlemeleri (örnek çevirilerle)

import SwiftUI

@main
struct CeviriApp: App {
    var body: some Scene {
        WindowGroup {
            KokEkran()
                .preferredColorScheme(.dark)
        }
    }
}
