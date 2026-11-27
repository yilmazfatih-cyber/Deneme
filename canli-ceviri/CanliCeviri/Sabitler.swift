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

/// Bulut motorunun (Soniox) dilleri: kaynak ve hedef seçimi (S02 KR12, KR13). Hepsi Soniox'un dil listesindedir.
/// `ses`: çeviri sesli okunacaksa Apple sesinin bölge kodu.
struct BulutDili: Identifiable, Hashable {
    let ad: String
    let kod: String
    let ses: String
    var id: String { kod }
}

let bulutDilleri = [
    BulutDili(ad: "Türkçe",     kod: "tr", ses: "tr-TR"),
    BulutDili(ad: "İngilizce",  kod: "en", ses: "en-US"),
    BulutDili(ad: "Almanca",    kod: "de", ses: "de-DE"),
    BulutDili(ad: "Fransızca",  kod: "fr", ses: "fr-FR"),
    BulutDili(ad: "İspanyolca", kod: "es", ses: "es-ES"),
    BulutDili(ad: "Arapça",     kod: "ar", ses: "ar-001"),
    BulutDili(ad: "Rusça",      kod: "ru", ses: "ru-RU"),
    BulutDili(ad: "İtalyanca",  kod: "it", ses: "it-IT"),
    BulutDili(ad: "Portekizce", kod: "pt", ses: "pt-BR"),
    BulutDili(ad: "Felemenkçe", kod: "nl", ses: "nl-NL"),
    BulutDili(ad: "Japonca",    kod: "ja", ses: "ja-JP"),
    BulutDili(ad: "Korece",     kod: "ko", ses: "ko-KR"),
    BulutDili(ad: "Çince",      kod: "zh", ses: "zh-CN"),
    BulutDili(ad: "Farsça",     kod: "fa", ses: "fa-IR"),
    BulutDili(ad: "Yunanca",    kod: "el", ses: "el-GR"),
    BulutDili(ad: "Ukraynaca",  kod: "uk", ses: "uk-UA"),
]

/// Bulut motorunda kaynak dil seçimindeki "Otomatik" değeri (`Kayit.bulutKaynak`).
let otomatikDil = "otomatik"

/// Dil kodunun ekrandaki adı; listede yoksa kodun kendisi (büyük harfle).
func dilAdi(_ kod: String) -> String {
    bulutDilleri.first { $0.kod == kod }?.ad ?? kod.uppercased()
}

/// "Türkçe" → "Türkçeye", "Almanca" → "Almancaya" (dil adları -ce/-ca ile biter).
func yonelme(_ ad: String) -> String {
    ad + (ad.hasSuffix("e") ? "ye" : "ya")
}

let duraklama   = 1.2   // bu kadar saniye sessizlik = cümle bitti
let alaniaAdres = "https://voice.patientdesk.ai/v1/audio/speech"
let alaniaModel = "alania-v2"
let yapiEtiketi = "S02 tur 1"   // Tanılama kopyasının başlığı; her düzeltme turunda artar (KR16)

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

// Bulut motoru (Soniox; docs/sprints/S02/brief.md "Soniox protokolü")
let sonioxAdres = "wss://stt-rt.soniox.com/transcribe-websocket"
let bulutPingAraligi: TimeInterval     = 5     // bu aralıkla ping; pong bu sürede gelmezse bağlantı kopmuş sayılır (KR5)
let bulutBaslamaSuresi: TimeInterval   = 10    // bağlantı + akışın başlaması (ilk pong) için en çok bekleme, sn
let bulutDenemeSiniri                  = 2     // kopmada en çok bu kadar yeni akış denenir (KR5)
let bulutDenemeArasi: TimeInterval     = 1     // yeni akış denemesinden önceki bekleme, sn (her denemede katlanır)
let bulutBitisSuresi: TimeInterval     = 1     // boş çerçeveden sonra bağlantının kapatılmasına dek bekleme, sn
let bulutSaatAraligi                   = 100   // bulut saatinin adımı, ms (bekleyen cümle, ping, pong denetimi)
let bulutCerceveBayt                   = 3200  // 100 ms ses: 16 kHz × 2 bayt × 0,1 sn (KR3)
let bulutOnBellekBayt                  = 32_000   // bağlantı kurulurken tutulan en çok ses (1 sn)

// Abonelik (S03)
#if DENEME
// Yandan yüklenen deneme yapısı (canli-ceviri-ipa.yml): uygulama içi satın alma çalışmaz, süre sınırı fiilen kapalı.
let gunlukUcretsizSure: TimeInterval   = 86_400   // 24 saat; bir günde dolmaz
#else
let gunlukUcretsizSure: TimeInterval   = 600   // abone olmayana günde bu kadar sn dinleme (yalnız "dinliyor" sayılır)
#endif
let sonDakikaEsigi: TimeInterval       = 60    // kalan süre bunun altına inince sarı not (KR3)
let abonelikUrunu = "canliceviri.sinirsiz.haftalik"   // App Store Connect'teki ürün kimliği

/// Abonelik ekranı ve Ayarlar'daki bağlantılar.
enum Adres {
    static let kosullar = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let gizlilik = URL(string: "https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/gizlilik.html")!
    static let destek   = URL(string: "https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/destek.html")!
    static let abonelikleriYonet = URL(string: "https://apps.apple.com/account/subscriptions")!
}

/// Telefonda saklanan ayarların adları (UserDefaults / @AppStorage).
enum Kayit {
    static let kaynakDil      = "kaynakDil"
    static let alaniaAnahtari = "alaniaAnahtar"
    static let alaniaSesi     = "alaniaSes"
    static let ucretsizGun    = "ucretsizGun"      // ücretsiz sürenin sayıldığı yerel gün (yyyy-aa-gg)
    static let ucretsizSaniye = "ucretsizSaniye"   // o gün kullanılan dinleme saniyesi
    static let motor          = "motor"            // "cihaz" | "bulut"; yoksa "cihaz" (S02)
    static let bulutKaynak    = "bulutKaynakDil"   // bulut motorunda kaynak dil; yoksa "otomatik" (KR12)
    static let hedefDil       = "hedefDil"         // bulut motorunda hedef dil; yoksa "tr" (KR13)
    static let sesliOku       = "sesliOku"         // çeviri sesli okunsun mu; yoksa hayır (KR11)
}

/// Çeviri motoru (S02). Bulut yalnız geçerli bir Soniox anahtarı varken seçilidir (K3).
enum Motor: String {
    case cihaz, bulut
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
