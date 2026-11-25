import SwiftUI

/// Konuşmacının dili: ekranda görünen adı, çeviri kodu ve konuşma tanıma bölgesi.
struct Dil: Identifiable, Hashable {
    let ad: String        // ekranda görünen ad
    let kod: String       // çeviri için dil kodu
    let konusma: String   // konuşma tanıma için bölge kodu
    var id: String { kod }
}

let diller = [
    Dil(ad: "İngilizce",  kod: "en", konusma: "en-US"),
    Dil(ad: "Almanca",    kod: "de", konusma: "de-DE"),
    Dil(ad: "Fransızca",  kod: "fr", konusma: "fr-FR"),
    Dil(ad: "İspanyolca", kod: "es", konusma: "es-ES"),
    Dil(ad: "İtalyanca",  kod: "it", konusma: "it-IT"),
    Dil(ad: "Rusça",      kod: "ru", konusma: "ru-RU"),
    Dil(ad: "Arapça",     kod: "ar", konusma: "ar-SA"),
]

let duraklama   = 1.2   // bu kadar saniye sessizlik = cümle bitti
let alaniaAdres = "https://voice.patientdesk.ai/v1/audio/speech"
let alaniaModel = "alania-v2"

/// Telefonda saklanan ayarların adları (UserDefaults / @AppStorage).
enum Kayit {
    static let kaynakDil      = "kaynakDil"
    static let alaniaAnahtari = "alaniaAnahtar"
    static let alaniaSesi     = "alaniaSes"
}

/// Tema renkleri
enum Renk {
    static let zemin    = Color(red: 0.01, green: 0.015, blue: 0.09)
    static let parilti  = Color(red: 0.03, green: 0.10, blue: 0.27)
    static let kart     = Color(red: 0.075, green: 0.09, blue: 0.18)
    static let alan     = Color(red: 0.04, green: 0.05, blue: 0.12)
    static let mavi     = Color(red: 0.18, green: 0.48, blue: 0.96)
    static let koyuMavi = Color(red: 0.10, green: 0.28, blue: 0.70)
    static let acikMavi = Color(red: 0.38, green: 0.80, blue: 0.98)
    static let kirmizi  = Color(red: 0.92, green: 0.22, blue: 0.20)
    static let sari     = Color(red: 0.98, green: 0.76, blue: 0.24)   // uyarı (AirPods bağlı değil)
}
