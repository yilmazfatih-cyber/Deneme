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

// Ses hattı süreleri ve eşikleri (docs/ses-hatti.md; kural kimlikleri parantez içinde)
let alaniaSuresi: TimeInterval         = 5     // Alania isteğinin toplam süresi, sn (S5, KR10)
let alaniaKesiciEsigi                  = 3     // art arda bu kadar Alania hatası = oturum boyunca Apple sesi (S6)
let bosBitisSiniri                     = 5     // art arda sonuçsuz biten tanıma görevi = dinleme durur (T3)
let bosBitisPenceresi: TimeInterval    = 2     // bundan kısa yaşayan sonuçsuz görev "boş bitiş" sayılır, sn (T3)
let tanimaBitisPenceresi: TimeInterval = 5     // aynı "tanıma bitti" bu süre içinde yinelenirse satır açılmaz, sn (G9)
let bekciAraligi: TimeInterval         = 1     // bekçinin denetim aralığı, sn (C6)
let bekciSiniri: TimeInterval          = 2     // bu kadar sn mikrofon tamponu gelmezse kesinti (K15)
let yenidenDenemeArasi: TimeInterval   = 0.5   // kesintiden dönüşte ikinci deneme, sn (C7)
let kesintiNotuSuresi: TimeInterval    = 10    // telefon kesintisi bu kadar sn sürerse çıkış yolu notu (K4)
let ceviriHataSiniri                   = 3     // art arda bu kadar çeviri hatası = dinleme durur (Ö-9)
let tanilamaSiniri                     = 300   // Tanılama kaydındaki en çok olay (brief K3)

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

    // Karşıtlık için (KR6, docs/tasarim.md § 1.1). Dolgu: üstüne beyaz yazı gelen yüzey; metin: koyu zeminde yazı/simge.
    static let maviDolgu    = Color(red: 0x2b / 255.0, green: 0x72 / 255.0, blue: 0xe5 / 255.0)   // #2b72e5
    static let kirmiziDolgu = Color(red: 0xde / 255.0, green: 0x35 / 255.0, blue: 0x30 / 255.0)   // #de3530
    static let maviMetin    = Color(red: 0x4a / 255.0, green: 0x8f / 255.0, blue: 0xf7 / 255.0)   // #4a8ff7
    static let acikKirmizi  = Color(red: 0xff / 255.0, green: 0x7a / 255.0, blue: 0x73 / 255.0)   // #ff7a73, hata metni
    static let ayrac        = Color.white.opacity(0.14)                                         // kart içi ayraç (B-21)
}
