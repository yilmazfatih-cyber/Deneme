import Foundation
import Observation
import UIKit

/// Tanılama kaydındaki bir olay. Konuşma ya da çeviri metni, cihaz ya da kulaklık adı içermez.
struct TanilamaOlayi: Identifiable {
    let id: UUID
    let zaman: Date
    let ad: String
    /// Ekranda ve kopyada görünen ayrıntı (tekrar varsa sonunda "×n").
    let ayrinti: String
    /// Uyarı olayı (hata kodu, izin reddi, kesinti, Alania hatası…): ekranda sarı simgeyle gösterilir.
    let uyari: Bool
    fileprivate let temel: String
    fileprivate let tekrar: Int
    fileprivate let sonZaman: Date
}

/// Cihazda, bellekte tutulan olay kaydı (brief K3). Uygulama kapanınca silinir, hiçbir yere gönderilmez.
@MainActor
@Observable
final class Tanilama {
    static let ortak = Tanilama()

    /// En eskisi başta, yenisi sonda; en çok `tanilamaSiniri` olay.
    private(set) var olaylar: [TanilamaOlayi] = []
    /// Sınır aşıldığı için en eski olaylar atıldı mı (kopya başlığında söylenir).
    @ObservationIgnored private var eskiAtildi = false

    /// Olay ekler. `ayrinti` asla konuşma ya da çeviri metni, cihaz ya da kulaklık adı içermemeli.
    /// `tekrarPenceresi` > 0 ise aynı olay aynı ayrıntıyla bu süre içinde yinelenince yeni satır açılmaz,
    /// son satırın sayacı artar (şartname G9).
    func kaydet(_ ad: String, _ ayrinti: String = "", uyari: Bool = false, tekrarPenceresi: TimeInterval = 0) {
        let simdi = Date()
        if tekrarPenceresi > 0, let son = olaylar.last, son.ad == ad, son.temel == ayrinti,
           simdi.timeIntervalSince(son.sonZaman) < tekrarPenceresi {
            let n = son.tekrar + 1
            olaylar[olaylar.count - 1] = TanilamaOlayi(id: son.id, zaman: son.zaman, ad: ad,
                                                       ayrinti: "\(ayrinti) ×\(n)", uyari: son.uyari || uyari,
                                                       temel: ayrinti, tekrar: n, sonZaman: simdi)
            return
        }
        ekle(ad, ayrinti, uyari: uyari, zaman: simdi)
    }

    func temizle() {
        olaylar.removeAll()
        eskiAtildi = false
    }

    /// Panoya gidecek düz metin: başta sürüm, iOS ve cihaz modeli; olaylar eskiden yeniye,
    /// her satır `SS:DD:SS.mmm  olay  ayrıntı`.
    var metin: String {
        var satirlar = [
            "Canlı Çeviri \(Tanilama.uygulamaSurumu) · \(yapiEtiketi)",
            "iOS \(UIDevice.current.systemVersion)",
            "Cihaz \(Tanilama.cihazModeli)",
            "Saat dilimi \(Tanilama.saatDilimi)",
            "Sıra: eskiden yeniye · \(olaylar.count) olay (en çok \(tanilamaSiniri)"
                + (eskiAtildi ? "; eski olaylar atıldı)" : ")"),
            "",
        ]
        for o in olaylar {
            let saat = Tanilama.saat(o.zaman, milisaniye: true)
            satirlar.append(o.ayrinti.isEmpty ? "\(saat)  \(o.ad)" : "\(saat)  \(o.ad)  \(o.ayrinti)")
        }
        return satirlar.joined(separator: "\n")
    }

    /// `SS:DD:SS` (ekran) ya da `SS:DD:SS.mmm` (kopya).
    static func saat(_ zaman: Date, milisaniye: Bool = false) -> String {
        (milisaniye ? uzunBicim : kisaBicim).string(from: zaman)
    }

    /// Ör. "1.0 (1)".
    static var uygulamaSurumu: String {
        let bilgi = Bundle.main.infoDictionary
        let surum = bilgi?["CFBundleShortVersionString"] as? String ?? "?"
        let yapi = bilgi?["CFBundleVersion"] as? String ?? "?"
        return "\(surum) (\(yapi))"
    }

    /// Ör. "UTC+03:00": satırlardaki saatin hangi dilimde olduğu (yer adı yazılmaz).
    static var saatDilimi: String {
        let dakika = TimeZone.current.secondsFromGMT() / 60
        let mutlak = abs(dakika)
        return "UTC\(dakika < 0 ? "-" : "+")\(ikiHane(mutlak / 60)):\(ikiHane(mutlak % 60))"
    }

    private nonisolated static func ikiHane(_ sayi: Int) -> String {
        sayi < 10 ? "0\(sayi)" : "\(sayi)"
    }

    /// Donanım modeli (ör. "iPhone17,1"); cihazın kullanıcı verdiği adı değil.
    static var cihazModeli: String {
        if let model = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return "\(model) (simülatör)"
        }
        var bilgi = utsname()
        _ = uname(&bilgi)
        return withUnsafeBytes(of: &bilgi.machine) { ham in
            String(decoding: ham.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    private static let kisaBicim = Tanilama.bicim("HH:mm:ss")
    private static let uzunBicim = Tanilama.bicim("HH:mm:ss.SSS")

    private nonisolated static func bicim(_ kalip: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = kalip
        return f
    }

    private func ekle(_ ad: String, _ ayrinti: String, uyari: Bool, zaman: Date) {
        olaylar.append(TanilamaOlayi(id: UUID(), zaman: zaman, ad: ad, ayrinti: ayrinti, uyari: uyari,
                                     temel: ayrinti, tekrar: 1, sonZaman: zaman))
        if olaylar.count > tanilamaSiniri {
            olaylar.removeFirst(olaylar.count - tanilamaSiniri)
            eskiAtildi = true
        }
    }
}

/// Hatanın alan/kod biçimi (ör. "NSOSStatusErrorDomain/561017449"); Tanılama içindir.
func hataKodu(_ hata: Error) -> String {
    let n = hata as NSError
    return "\(n.domain)/\(n.code)"
}

/// Verilen andan bu yana geçen milisaniye.
func gecenMs(_ bas: Date) -> Int {
    Int(Date().timeIntervalSince(bas) * 1000)
}

#if DEBUG
extension Tanilama {
    /// Simülatör ekran görüntüsü (`tanilama`) ve önizlemeler için örnek olaylar.
    func ornekleDoldur() {
        olaylar.removeAll()
        let ornekler: [(String, String, Bool)] = [
            ("başlat", "dil=en", false),
            ("dil paketi", "hazır (84 ms)", false),
            ("izin", "mikrofon=verildi konuşma=verildi", false),
            ("ses yolu", "çıkış=bluetooth giriş=dahili", false),
            ("tanıma açıldı", "en-US cihazda", false),
            ("mikrofon", "48000 Hz, 1 kanal", false),
            ("cümle", "kelime=7", false),
            ("çeviri", "182 ms", false),
            ("ses", "alania 640 ms", false),
            ("cümle", "kelime=4", false),
            ("çeviri", "121 ms", false),
            ("ses", "alania hatası zaman aşımı", true),
            ("ses", "apple", false),
            ("uygulama", "arka planda", false),
            ("kesinti", "başladı neden=arka plan", true),
            ("uygulama", "etkin oldu", false),
            ("kesinti", "bitti", false),
            ("motor", "yeniden başlatıldı", false),
            ("durdur", "neden=düğme", false),
        ]
        let simdi = Date()
        for (i, o) in ornekler.enumerated() {
            ekle(o.0, o.1, uyari: o.2, zaman: simdi.addingTimeInterval(Double(i - ornekler.count) * 2.4))
        }
    }
}
#endif
