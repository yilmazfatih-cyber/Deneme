//
//  CeviriApp.swift
//  Çeviri — karşınızdaki konuşur, Türkçesi kulaklığınızdan gelir.
//
//  NE YAPAR
//  • iPhone'un mikrofonu konuşmayı dinler: İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça.
//  • Apple'ın telefondaki çeviri motoru her cümleyi Türkçeye çevirir.
//  • Türkçesi AirPods'tan (ya da takılı kulaklıktan) sesli okunur ve ekranda görünür.
//
//  KURULUM — hazır proje (önerilen)
//  1. Ceviri.xcodeproj dosyasını Xcode ile açın.
//  2. Soldan "Ceviri" projesini, sonra TARGETS altında "Ceviri"yi seçin.
//     Signing & Capabilities › Team: kendi Apple hesabınızı seçin.
//  3. iPhone'u bağlayın, üstteki cihaz listesinden seçin, ▶︎ düğmesine basın.
//
//  KURULUM — elle (yeni proje açarak)
//  1. Xcode › File › New › Project › iOS › App. Interface: SwiftUI, Language: Swift.
//  2. Xcode'un oluşturduğu "…App.swift" ve "ContentView.swift" dosyalarını silin.
//  3. Bu dosyayı projeye sürükleyin ("Copy items if needed" işaretli olsun).
//  4. Hedef › Info sekmesinde iki satır ekleyin (ikisinin de değeri kısa bir açıklama olsun):
//       Privacy - Microphone Usage Description          (NSMicrophoneUsageDescription)
//       Privacy - Speech Recognition Usage Description  (NSSpeechRecognitionUsageDescription)
//  5. Hedef › General › Minimum Deployments: iOS 18.0 ya da üstü.
//  6. İsteğe bağlı: telefon kilitliyken de çalışsın istiyorsanız
//     Signing & Capabilities › + Capability › Background Modes › "Audio, AirPlay, and Picture in Picture".
//  7. Gerçek iPhone'da çalıştırın. Çeviri, simülatörde çalışmaz.
//
//  SES
//  • Ayarlar'da Alania-2 anahtarı boşsa Apple'ın Türkçe sesi kullanılır; anahtar gerekmez.
//  • Anahtar girilirse çeviri metni seslendirme için PatientDesk AI sunucusuna gönderilir.
//
//  DENETİM
//  • ceviri/denetim/calistir.sh — Xcode'suz denetim: çekirdek testleri ve farklı Swift kiplerinde tip denetimi.
//

import AVFoundation
import Combine
import Foundation
import Security
import Speech
import SwiftUI
import Translation
import UIKit

// MARK: - Uygulama girişi

@main
struct CeviriApp: App {
    @StateObject private var motor = CeviriMotoru()

    var body: some Scene {
        WindowGroup {
            AnaGorunum()
                .environmentObject(motor)
        }
    }
}

// MARK: - Diller ve kayıtlar

/// Dinlenebilen diller. Hedef dil her zaman Türkçedir.
struct Dil: Identifiable, Hashable, Sendable {
    /// Konuşma tanıma kodu, ör. "en-US".
    let kod: String
    let ad: String

    var id: String { kod }
    var dilKodu: String { String(kod.prefix(2)) }
    var bolgeKodu: String { String(kod.suffix(2)) }

    static let tumu: [Dil] = [
        Dil(kod: "en-US", ad: "İngilizce"),
        Dil(kod: "de-DE", ad: "Almanca"),
        Dil(kod: "fr-FR", ad: "Fransızca"),
        Dil(kod: "es-ES", ad: "İspanyolca"),
        Dil(kod: "it-IT", ad: "İtalyanca"),
        Dil(kod: "ru-RU", ad: "Rusça"),
        Dil(kod: "ar-SA", ad: "Arapça"),
    ]

    static func bul(_ kod: String?) -> Dil {
        tumu.first { $0.kod == kod } ?? tumu[0]
    }
}

enum SesCinsiyeti: String, CaseIterable, Hashable, Sendable {
    case kadin
    case erkek

    var ad: String { self == .kadin ? "Kadın" : "Erkek" }

    /// Alania-2'nin hazır seslerinden karşılığı.
    var alaniaSesi: String { self == .kadin ? "alania2-f1" : "alania2-oncel" }
}

/// Çevrilmiş (ya da çevrilmeyi bekleyen) bir cümle.
struct Cumle: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var asil: String
    var ceviri: String?
    var saat = Date()
    var basarisiz = false
}

enum Durum: Equatable, Sendable {
    case bosta
    case hazirlaniyor
    case dinliyor
}

/// Ekranın üstünde gösterilen kısa uyarı.
struct Uyari: Equatable {
    var metin: String
    var ayarlarDugmesi: Bool

    init(_ metin: String, ayarlarDugmesi: Bool = false) {
        self.metin = metin
        self.ayarlarDugmesi = ayarlarDugmesi
    }
}

/// Çeviri oturumuna verilen iş.
enum CeviriIsi: Sendable {
    case hazirla(sira: Int)
    case cevir(kimlik: UUID, metin: String)
}

// MARK: - Çekirdek mantık
// Bu bölüm yalnızca Foundation kullanır; denetim/calistir.sh onu ayrıca sınar.
// >>> CEKIRDEK

/// Konuşma tanıyıcının büyüyen ara sonuçlarını, çevrilmeye hazır parçalara böler.
///
/// Tanıyıcı her seferinde o ana kadar duyduğu metnin tamamını verir ve son kelimeleri
/// sonradan düzeltebilir. Bu yüzden:
/// - bir cümle, ardından en az `korumaPayi` kelime geldiğinde bitmiş sayılır;
/// - noktalama gelmezse `enCokKelime` kelimede, varsa son virgülden kesilir;
/// - duraklamada (`kapat`) elde kalan her şey gönderilir;
/// - tanıyıcı metni baştan başlatırsa bu fark edilir ve yeni söz sıfırdan sayılır.
struct Parcalayici {
    var enCokKelime = 22
    var korumaPayi = 2

    private(set) var kelimeler: [String] = []
    /// `kelimeler` içinde çeviriye gönderilmiş kelime sayısı.
    private(set) var islenen = 0
    private var yeniSozOlabilir = false

    /// Henüz çeviriye gönderilmemiş, ekranda canlı gösterilecek kısım.
    var canli: String {
        kelimeler.dropFirst(islenen).joined(separator: " ")
    }

    /// Tanıyıcıdan yeni ara sonuç geldi. Çevrilmeye hazır parçaları döndürür.
    mutating func guncelle(_ metin: String) -> [String] {
        let yeni = metin.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        var hazir: [String] = []

        if yeni.isEmpty {
            if let kalan = kuyruk() { hazir.append(kalan) }
            kelimeler = []
            islenen = 0
            yeniSozOlabilir = false
            return hazir
        }

        // Tanıyıcı yeni bir söze baştan başladıysa ilk kelimeler değişir ve eski sözle pek ortak kelime kalmaz.
        // Yalnızca biçim düzeltmesiyse ("twenty five" → "25") kelimelerin çoğu yerinde durur.
        let yeniSoz = !Self.ayniBaslangic(kelimeler, yeni)
            && !Self.duzeltmeGibi(kelimeler, yeni)
            && (yeniSozOlabilir || yeni.count < kelimeler.count)
        if yeniSoz {
            // Eldeki kuyruğu kapat, yeni sözü baştan say.
            if let kalan = kuyruk() { hazir.append(kalan) }
            islenen = 0
        } else {
            // Aynı söz: çevrilmiş kısmın yeni metinde nerede bittiğini bul; ne tekrar ne eksik olsun.
            islenen = Self.hizala(kelimeler, islenen, yeni)
        }
        yeniSozOlabilir = false
        kelimeler = yeni

        hazir.append(contentsOf: bitenCumleler())
        hazir.append(contentsOf: uzunlukSiniri())
        return hazir
    }

    /// Duraklama oldu ya da tanıyıcı sözün bittiğini bildirdi: kalan her şeyi döndürür.
    mutating func kapat() -> String? {
        let kalan = kuyruk()
        islenen = kelimeler.count
        yeniSozOlabilir = true
        return kalan
    }

    /// Yeni bir tanıma görevi başladı; metin sıfırdan gelecek.
    mutating func sifirla() {
        kelimeler = []
        islenen = 0
        yeniSozOlabilir = false
    }

    private func kuyruk() -> String? {
        guard islenen < kelimeler.count else { return nil }
        let metin = kelimeler[islenen...].joined(separator: " ")
        return Self.anlamli(metin) ? metin : nil
    }

    private mutating func bitenCumleler() -> [String] {
        var hazir: [String] = []
        var sira = islenen
        while sira + korumaPayi < kelimeler.count {
            if Self.cumleSonu(kelimeler[sira]) {
                let parca = kelimeler[islenen...sira].joined(separator: " ")
                if Self.anlamli(parca) { hazir.append(parca) }
                islenen = sira + 1
            }
            sira += 1
        }
        return hazir
    }

    private mutating func uzunlukSiniri() -> [String] {
        var hazir: [String] = []
        while kelimeler.count - islenen > enCokKelime {
            // Son `korumaPayi` kelime hâlâ değişebilir; onlara dokunma.
            let ust = kelimeler.count - korumaPayi
            var son = ust - 1
            var aday = ust - 1
            while aday >= islenen + 5 {
                if Self.araNoktalama(kelimeler[aday]) {
                    son = aday
                    break
                }
                aday -= 1
            }
            let parca = kelimeler[islenen...son].joined(separator: " ")
            if Self.anlamli(parca) { hazir.append(parca) }
            islenen = son + 1
        }
        return hazir
    }

    // MARK: Yardımcılar

    private static let kisaltmalar: Set<String> = [
        "mr", "mrs", "ms", "dr", "prof", "st", "vs", "no", "nr", "ca",
        "hr", "fr", "sr", "sra", "mme", "mlle", "sig",
    ]
    private static let kapanislar = CharacterSet(charactersIn: "\"'”’»)]")

    /// Kelime bir cümleyi bitiriyor mu? ("Dr.", "U.S.", "3." gibi kısaltmaları saymaz.)
    static func cumleSonu(_ kelime: String) -> Bool {
        let yalinKelime = kelime.trimmingCharacters(in: kapanislar)
        guard let son = yalinKelime.last else { return false }
        if "?!…؟".contains(son) { return true }
        guard son == "." else { return false }
        if yalinKelime.hasSuffix("...") { return true }
        let govde = yalinKelime.dropLast().lowercased()
        if govde.isEmpty || govde.contains(".") { return false }
        if govde.count == 1 { return false }
        if govde.count <= 2 && govde.allSatisfy({ $0.isNumber }) { return false }
        return !kisaltmalar.contains(govde)
    }

    static func araNoktalama(_ kelime: String) -> Bool {
        guard let son = kelime.last else { return false }
        return ",;:،—–".contains(son)
    }

    /// İki ara sonuç aynı sözün devamı mı? İlk iki kelimeye bakar.
    static func ayniBaslangic(_ eski: [String], _ yeni: [String]) -> Bool {
        let adet = min(2, eski.count, yeni.count)
        guard adet > 0 else { return true }
        for sira in 0..<adet where yalin(eski[sira]) != yalin(yeni[sira]) {
            return false
        }
        return true
    }

    /// Yeni ara sonuç eskisinin düzeltilmiş hâli mi? Kelimelerin çoğu ortak ve boyları yakınsa öyledir.
    static func duzeltmeGibi(_ eski: [String], _ yeni: [String]) -> Bool {
        guard !eski.isEmpty, !yeni.isEmpty else { return false }
        let eskiKume = Set(eski.map { yalin($0) })
        let ortak = yeni.filter { eskiKume.contains(yalin($0)) }.count
        return ortak > 0 && ortak * 2 >= yeni.count && yeni.count * 2 >= eski.count
    }

    /// Çevrilmiş ilk `islenen` kelimenin, düzeltilmiş yeni metinde nerede bittiğini bulur.
    static func hizala(_ eski: [String], _ islenen: Int, _ yeni: [String]) -> Int {
        guard islenen > 0, islenen <= eski.count else { return min(islenen, yeni.count) }
        if islenen <= yeni.count && eski[..<islenen].elementsEqual(yeni[..<islenen]) {
            return islenen
        }
        // Son çevrilen kelimeyi beklenen yerin yakınında ara; en yakın eşleşmeyi al.
        let hedef = islenen - 1
        let son = eski[hedef]
        let alt = max(0, hedef - 4)
        let ust = min(yeni.count - 1, hedef + 4)
        if alt <= ust {
            var bulunan: Int?
            for sira in alt...ust where yeni[sira] == son {
                if let onceki = bulunan, abs(onceki - hedef) <= abs(sira - hedef) { continue }
                bulunan = sira
            }
            if let bulunan { return bulunan + 1 }
        }
        return min(islenen, yeni.count)
    }

    static func yalin(_ kelime: String) -> String {
        String(kelime.lowercased().filter { $0.isLetter || $0.isNumber })
    }

    static func anlamli(_ metin: String) -> Bool {
        metin.contains { $0.isLetter || $0.isNumber }
    }
}

/// WAV ses verisi için küçük onarım.
enum DalgaDosyasi {
    /// Akış biçiminde üretilen WAV dosyalarında uzunluk alanları bilinmez (0xFFFFFFFF ya da 0) yazılır
    /// ve oynatıcı böyle bir dosyayı açamayabilir. Bu alanları gerçek boyutla doldurur.
    /// WAV olmayan ya da başlığı sağlam olan veriye dokunmaz.
    static func duzelt(_ veri: Data) -> Data {
        var baytlar = [UInt8](veri)
        guard baytlar.count >= 44,
              Array(baytlar[0..<4]) == Array("RIFF".utf8),
              Array(baytlar[8..<12]) == Array("WAVE".utf8)
        else { return veri }

        var degisti = false
        let dosyaBoyu = oku32(baytlar, 4)
        if dosyaBoyu == 0xFFFF_FFFF || dosyaBoyu == 0 || Int(dosyaBoyu) > baytlar.count - 8 {
            yaz32(&baytlar, 4, UInt32(baytlar.count - 8))
            degisti = true
        }

        var konum = 12
        while konum + 8 <= baytlar.count {
            let boy = oku32(baytlar, konum + 4)
            if Array(baytlar[konum..<konum + 4]) == Array("data".utf8) {
                let gercek = baytlar.count - (konum + 8)
                if boy == 0xFFFF_FFFF || boy == 0 || Int(boy) > gercek {
                    yaz32(&baytlar, konum + 4, UInt32(gercek))
                    degisti = true
                }
                break
            }
            guard boy != 0xFFFF_FFFF else { break }
            // Parçalar çift bayta hizalanır.
            konum += 8 + Int(boy) + Int(boy & 1)
        }
        return degisti ? Data(baytlar) : veri
    }

    private static func oku32(_ baytlar: [UInt8], _ konum: Int) -> UInt32 {
        UInt32(baytlar[konum])
            | UInt32(baytlar[konum + 1]) << 8
            | UInt32(baytlar[konum + 2]) << 16
            | UInt32(baytlar[konum + 3]) << 24
    }

    private static func yaz32(_ baytlar: inout [UInt8], _ konum: Int, _ deger: UInt32) {
        baytlar[konum] = UInt8(deger & 0xFF)
        baytlar[konum + 1] = UInt8((deger >> 8) & 0xFF)
        baytlar[konum + 2] = UInt8((deger >> 16) & 0xFF)
        baytlar[konum + 3] = UInt8((deger >> 24) & 0xFF)
    }
}

// <<< CEKIRDEK

// MARK: - Alania-2 (isteğe bağlı ses)

/// PatientDesk AI'ın Türkçe ses modeli. İstek biçimi OpenAI'ın konuşma uç noktasıyla aynıdır:
/// JSON gönderilir, yanıtın gövdesi sesin kendisidir.
enum Alania {
    /// Yanıtın gövdesini ve HTTP durum kodunu döndürür; ağ hatasında fırlatır.
    nonisolated static func sentezle(
        _ metin: String, ses: String, anahtar: String
    ) async throws -> (veri: Data, durumKodu: Int) {
        guard let adres = URL(string: "https://voice.patientdesk.ai/v1/audio/speech") else {
            throw URLError(.badURL)
        }
        var istek = URLRequest(url: adres)
        istek.httpMethod = "POST"
        // Canlı çeviride uzun beklemenin anlamı yok; gecikirse Apple sesi devreye girer.
        istek.timeoutInterval = 8
        istek.setValue("Bearer \(anahtar)", forHTTPHeaderField: "Authorization")
        istek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let govde: [String: String] = [
            "model": "alania-v2",
            "input": metin,
            "voice": ses,
            "response_format": "wav",
        ]
        istek.httpBody = try JSONSerialization.data(withJSONObject: govde)

        let (veri, yanit) = try await URLSession.shared.data(for: istek)
        let durumKodu = (yanit as? HTTPURLResponse)?.statusCode ?? 0
        return (veri, durumKodu)
    }
}

// MARK: - Anahtarlık

/// Alania-2 anahtarını telefonun anahtarlığında (Keychain) saklar.
enum Anahtarlik {
    private static func temelSorgu() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "ceviri.alania2",
            kSecAttrAccount as String: "anahtar",
        ]
    }

    static func oku() -> String {
        var sorgu = temelSorgu()
        sorgu[kSecReturnData as String] = true
        sorgu[kSecMatchLimit as String] = kSecMatchLimitOne
        var sonuc: AnyObject?
        guard SecItemCopyMatching(sorgu as CFDictionary, &sonuc) == errSecSuccess,
              let veri = sonuc as? Data,
              let metin = String(data: veri, encoding: .utf8)
        else { return "" }
        return metin
    }

    static func yaz(_ deger: String) {
        _ = SecItemDelete(temelSorgu() as CFDictionary)
        guard !deger.isEmpty else { return }
        var kayit = temelSorgu()
        kayit[kSecValueData as String] = Data(deger.utf8)
        kayit[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        _ = SecItemAdd(kayit as CFDictionary, nil)
    }
}

// MARK: - Geçmiş deposu

enum GecmisDeposu {
    private static func dosya() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("gecmis.json")
    }

    static func yukle() -> [Cumle] {
        guard let adres = dosya(),
              let veri = try? Data(contentsOf: adres),
              let liste = try? JSONDecoder().decode([Cumle].self, from: veri)
        else { return [] }
        return liste.filter { $0.ceviri != nil }
    }

    static func kaydet(_ liste: [Cumle]) {
        guard let adres = dosya() else { return }
        let tamamlar = liste.filter { $0.ceviri != nil }
        guard let veri = try? JSONEncoder().encode(tamamlar) else { return }
        try? veri.write(to: adres, options: .atomic)
    }
}

// MARK: - Ses köprüsü

/// Mikrofon tamponlarını konuşma tanıma isteğine taşır ve ses düzeyini ölçer.
/// Ses iş parçacığında çalışır; bu yüzden hiçbir üyesi ana aktöre bağlı değildir.
final class SesKoprusu: @unchecked Sendable {
    private let kilit = NSLock()
    nonisolated(unsafe) private var istek: SFSpeechAudioBufferRecognitionRequest?
    nonisolated(unsafe) private var kisik = false
    nonisolated(unsafe) private var sonDuzey: Float = 0

    nonisolated init() {}

    nonisolated func istekAyarla(_ yeni: SFSpeechAudioBufferRecognitionRequest?) {
        kilit.lock()
        istek = yeni
        kilit.unlock()
    }

    /// Kısıkken mikrofon sesi tanıyıcıya verilmez (hoparlörden çalarken yankı olmasın diye).
    nonisolated func kis(_ deger: Bool) {
        kilit.lock()
        kisik = deger
        kilit.unlock()
    }

    /// 0…1 arasında ses düzeyi.
    nonisolated var duzey: Float {
        kilit.lock()
        defer { kilit.unlock() }
        return kisik ? 0 : sonDuzey
    }

    nonisolated func dinle(_ dugum: AVAudioInputNode, bicim: AVAudioFormat) {
        dugum.installTap(onBus: 0, bufferSize: 2048, format: bicim) { [self] tampon, _ in
            self.tamponGeldi(tampon)
        }
    }

    nonisolated private func tamponGeldi(_ tampon: AVAudioPCMBuffer) {
        var yeniDuzey: Float = 0
        let adet = Int(tampon.frameLength)
        if adet > 0, let kanal = tampon.floatChannelData?[0] {
            var toplam: Float = 0
            var sayi = 0
            var sira = 0
            while sira < adet {
                let ornek = kanal[sira]
                toplam += ornek * ornek
                sayi += 1
                sira += 4
            }
            let kok = (toplam / Float(sayi)).squareRoot()
            // -50 dB sessizlik, -10 dB yüksek ses sayılır.
            let desibel = 20 * log10(max(kok, 0.000_01))
            yeniDuzey = min(max((desibel + 50) / 40, 0), 1)
        }

        kilit.lock()
        sonDuzey = yeniDuzey
        let hedef = kisik ? nil : istek
        kilit.unlock()
        hedef?.append(tampon)
    }
}

/// Seslendirme bittiğinde haber verir. Sistem bu yöntemleri herhangi bir iş parçacığından çağırabilir.
final class SesTemsilcisi: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate, @unchecked Sendable {
    private let bitti: @Sendable (ObjectIdentifier) -> Void

    nonisolated init(bitti: @escaping @Sendable (ObjectIdentifier) -> Void) {
        self.bitti = bitti
        super.init()
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        bitti(ObjectIdentifier(utterance))
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        bitti(ObjectIdentifier(utterance))
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        bitti(ObjectIdentifier(player))
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?) {
        bitti(ObjectIdentifier(player))
    }
}

// MARK: - Sistem çağrıları

/// Sistemin geri çağrıları başka iş parçacıklarında gelebilir. Bu yüzden o kapanışlar burada,
/// ana aktöre bağlı olmayan işlevlerin içinde kurulur.
enum Sistem {
    nonisolated static func mikrofonIzni() async -> Bool {
        await withCheckedContinuation { (devam: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { izin in
                devam.resume(returning: izin)
            }
        }
    }

    nonisolated static func konusmaIzni() async -> Bool {
        await withCheckedContinuation { (devam: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { durum in
                devam.resume(returning: durum == .authorized)
            }
        }
    }

    /// Tanıma görevini başlatır. `bildir` her ara sonuçta, herhangi bir iş parçacığında çağrılır.
    nonisolated static func tanimaGorevi(
        _ taniyici: SFSpeechRecognizer,
        _ istek: SFSpeechAudioBufferRecognitionRequest,
        bildir: @escaping @Sendable (_ metin: String?, _ sozBitti: Bool, _ gorevBitti: Bool, _ hata: Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        taniyici.recognitionTask(with: istek) { sonuc, hata in
            bildir(
                sonuc?.bestTranscription.formattedString,
                sonuc?.speechRecognitionMetadata != nil,
                sonuc?.isFinal ?? false,
                hata != nil
            )
        }
    }

    /// Çeviri motorunun tanıdığı dil kodlarını bulur ve bu çiftin desteklenip desteklenmediğini söyler.
    nonisolated static func ceviriDilleri(
        dil: String, bolge: String
    ) async -> (kaynak: Locale.Language, hedef: Locale.Language, destekli: Bool) {
        // LanguageAvailability, Sendable olmayan bir sınıf; her ayarda derlensin diye ayrı bir görevde kullanılır.
        await Task.detached {
            let denetim = LanguageAvailability()
            let desteklenenler = await denetim.supportedLanguages

            func bul(_ dil: String, _ bolge: String) -> Locale.Language {
                desteklenenler.first { $0.languageCode?.identifier == dil && $0.region?.identifier == bolge }
                    ?? desteklenenler.first { $0.languageCode?.identifier == dil }
                    ?? Locale.Language(identifier: dil)
            }

            let kaynak = bul(dil, bolge)
            let hedef = bul("tr", "TR")
            switch await denetim.status(from: kaynak, to: hedef) {
            case .installed, .supported:
                return (kaynak: kaynak, hedef: hedef, destekli: true)
            case .unsupported:
                return (kaynak: kaynak, hedef: hedef, destekli: false)
            @unknown default:
                return (kaynak: kaynak, hedef: hedef, destekli: true)
            }
        }.value
    }

    /// Telefonda yüklü en iyi Türkçe ses. İstenen cinsiyette ses yoksa eldeki Türkçe sesi verir.
    nonisolated static func turkceSes(erkek: Bool) -> AVSpeechSynthesisVoice? {
        let sesler = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("tr") }
            .sorted { $0.quality.rawValue > $1.quality.rawValue }
        let istenen: AVSpeechSynthesisVoiceGender = erkek ? .male : .female
        return sesler.first { $0.gender == istenen }
            ?? sesler.first
            ?? AVSpeechSynthesisVoice(language: "tr-TR")
    }

    nonisolated static func erkekSesVar() -> Bool {
        AVSpeechSynthesisVoice.speechVoices().contains { $0.language.hasPrefix("tr") && $0.gender == .male }
    }
}

// MARK: - Ses düzeyi

/// Ses düzeyi saniyede birçok kez değişir; yalnızca çubukları yeniden çizdirmek için ayrı tutulur.
@MainActor
final class DuzeyOlcer: ObservableObject {
    @Published var deger: Double = 0
}

// MARK: - Çeviri motoru

/// Dinleme → yazıya dökme → çeviri → seslendirme zincirini yönetir.
@MainActor
final class CeviriMotoru: ObservableObject {

    // MARK: Ekranın izlediği durum

    @Published private(set) var durum: Durum = .bosta
    /// O an söylenen, henüz çevrilmemiş sözler.
    @Published private(set) var canliMetin = ""
    @Published private(set) var sonAsil = ""
    @Published private(set) var sonCeviri = ""
    @Published private(set) var oncekiCeviri = ""
    /// Çevrilmeyi bekleyen cümle sayısı.
    @Published private(set) var cevrilen = 0
    @Published private(set) var mesgul = false
    @Published private(set) var gecmis: [Cumle] = []
    @Published var uyari: Uyari? = nil
    @Published private(set) var kulaklikBagli = false
    @Published private(set) var cikisAdi = ""
    @Published private(set) var seslendiriyor = false
    @Published private(set) var sesNotu: String? = nil
    @Published private(set) var erkekSesVar = true
    /// SwiftUI'nin `.translationTask` değiştiricisine verilen ayar. Her değişimde yeni bir çeviri oturumu açılır.
    @Published var ceviriAyari: TranslationSession.Configuration? = nil

    // MARK: Ayarlar (kalıcı)

    @Published var kaynak: Dil {
        didSet {
            guard kaynak != oldValue else { return }
            UserDefaults.standard.set(kaynak.kod, forKey: Kayit.kaynak)
            ceviriOturumunuBirak()
        }
    }
    @Published var cinsiyet: SesCinsiyeti {
        didSet { UserDefaults.standard.set(cinsiyet.rawValue, forKey: Kayit.cinsiyet) }
    }
    @Published var sesliOku: Bool {
        didSet {
            UserDefaults.standard.set(sesliOku, forKey: Kayit.sesliOku)
            if !sesliOku { sesiSustur() }
        }
    }
    @Published var kulaklikMikrofonu: Bool {
        didSet { UserDefaults.standard.set(kulaklikMikrofonu, forKey: Kayit.kulaklikMikrofonu) }
    }
    /// Açıksa telefon kilitlenince (uygulama arka plana geçince) dinleme sürer.
    @Published var kilitliDevam: Bool {
        didSet { UserDefaults.standard.set(kilitliDevam, forKey: Kayit.kilitliDevam) }
    }
    @Published var alaniaAnahtari: String {
        didSet {
            guard alaniaAnahtari != oldValue else { return }
            Anahtarlik.yaz(alaniaAnahtari.trimmingCharacters(in: .whitespacesAndNewlines))
            alaniaKapali = false
            alaniaHatasi = 0
            sesNotu = nil
        }
    }

    let duzey = DuzeyOlcer()

    /// Arka planda ses izni (Info.plist › UIBackgroundModes › audio) var mı? Yoksa kilitliyken sürdürülemez.
    let kilitliDevamOlur: Bool = {
        let kipler = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        return kipler.contains("audio")
    }()

    var dilDegisebilir: Bool { durum == .bosta && !mesgul }
    var alaniaEtkin: Bool { !alaniaAnahtari.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private enum Kayit {
        static let kaynak = "kaynakDil"
        static let cinsiyet = "sesCinsiyeti"
        static let sesliOku = "sesliOku"
        static let kulaklikMikrofonu = "kulaklikMikrofonu"
        static let kilitliDevam = "kilitliDevam"
    }

    // MARK: Dinleme

    private let kopru = SesKoprusu()
    private var sesMotoru: AVAudioEngine?
    private var taniyici: SFSpeechRecognizer?
    private var istek: SFSpeechAudioBufferRecognitionRequest?
    private var gorev: SFSpeechRecognitionTask?
    /// Her yeni tanıma görevinde artar; eski görevlerin geç gelen sonuçları bununla ayıklanır.
    private var gorevSayaci = 0
    private var gorevBaslangici = Date()
    private var gorevdeMetinGeldi = false
    private var cihazdaTanima = false
    private var ardArdaHata = 0
    private var parcalayici = Parcalayici()
    private var duraklamaGorevi: Task<Void, Never>?
    private var sinirGorevi: Task<Void, Never>?
    private var yenidenGorevi: Task<Void, Never>?
    private var duzeyGorevi: Task<Void, Never>?
    private var hazirlikSirasi = 0
    private var oturumAcik = false
    private var gozlemciler: [any NSObjectProtocol] = []

    // MARK: Çeviri

    private var ceviriSirasi: [CeviriIsi] = []
    private var hazirlikBekliyor: Int?
    private var isciCalisiyor = false
    private var isciIsUzerinde = false
    private var isciKusagi = 0
    private var isciTemasi = 0
    private var ardArdaCeviriHatasi = 0

    // MARK: Seslendirme

    private struct SesIsi {
        let metin: String
        /// Susturulunca artan sayaç; eski kuşaktan kalan sesler çalınmaz.
        let kusak: Int
        let hazirlik: Task<(veri: Data, durumKodu: Int), any Error>?
    }

    private let sentezleyici = AVSpeechSynthesizer()
    private var calici: AVAudioPlayer?
    private var sesSirasi: [SesIsi] = []
    private var sesKusagi = 0
    private var sesDongusuCalisiyor = false
    private var sesDevami: CheckedContinuation<Bool, Never>?
    private var beklenenNesne: ObjectIdentifier?
    private var sesSayaci = 0
    private var alaniaKapali = false
    private var alaniaHatasi = 0
    private var sesOnbellegi: [SesCinsiyeti: AVSpeechSynthesisVoice] = [:]
    private lazy var temsilci = SesTemsilcisi { [weak self] nesne in
        guard let motor = self else { return }
        Task { @MainActor in motor.sesBitti(nesne) }
    }

    // MARK: Kurulum

    init() {
        let kayit = UserDefaults.standard
        kaynak = Dil.bul(kayit.string(forKey: Kayit.kaynak))
        cinsiyet = SesCinsiyeti(rawValue: kayit.string(forKey: Kayit.cinsiyet) ?? "") ?? .kadin
        sesliOku = (kayit.object(forKey: Kayit.sesliOku) as? Bool) ?? true
        kulaklikMikrofonu = kayit.bool(forKey: Kayit.kulaklikMikrofonu)
        kilitliDevam = kayit.bool(forKey: Kayit.kilitliDevam)
        alaniaAnahtari = Anahtarlik.oku()
        gecmis = GecmisDeposu.yukle()
        erkekSesVar = Sistem.erkekSesVar()
        sentezleyici.delegate = temsilci
        rotayiOku()

        // Bildirimler ana kuyrukta (queue: .main) gelir; bu yüzden doğrudan ana aktörde işlenir.
        let merkez = NotificationCenter.default
        gozlemciler.append(
            merkez.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) {
                [weak self] _ in
                MainActor.assumeIsolated { self?.rotayiOku() }
            })
        gozlemciler.append(
            merkez.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) {
                [weak self] bildirim in
                let tur = bildirim.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                MainActor.assumeIsolated { self?.kesinti(tur) }
            })
        gozlemciler.append(
            merkez.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) {
                [weak self] _ in
                MainActor.assumeIsolated { self?.sesDonanimiDegisti() }
            })

        #if targetEnvironment(simulator)
        uyari = Uyari("Simülatörde çeviri çalışmaz. Gerçek iPhone’da deneyin.")
        #endif
    }

    // MARK: Başlat / durdur

    func dugmeyeBasildi() {
        switch durum {
        case .bosta:
            // Durum hemen değişir; düğmeye üst üste basmak iki başlatma yapmaz.
            uyari = nil
            durum = .hazirlaniyor
            hazirlikSirasi += 1
            let sira = hazirlikSirasi
            Task { await hazirla(sira) }
        case .hazirlaniyor:
            vazgec()
        case .dinliyor:
            durdur()
        }
    }

    private func hazirla(_ sira: Int) async {
        guard sira == hazirlikSirasi, durum == .hazirlaniyor else { return }

        // Elle kurulumda izin satırları unutulduysa sistem uygulamayı kapatır; önce bunu denetle.
        let eksik = ["NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription"]
            .filter { Bundle.main.object(forInfoDictionaryKey: $0) == nil }
        guard eksik.isEmpty else {
            hazirlikBitmedi(sira, Uyari("Kurulum eksik. Xcode’da hedefin Info sekmesine şunu ekleyin: " + eksik.joined(separator: ", ")))
            return
        }

        guard await Sistem.mikrofonIzni() else {
            hazirlikBitmedi(sira, Uyari("Mikrofon izni gerekli.", ayarlarDugmesi: true))
            return
        }
        guard await Sistem.konusmaIzni() else {
            hazirlikBitmedi(sira, Uyari("Konuşma tanıma izni gerekli.", ayarlarDugmesi: true))
            return
        }
        guard sira == hazirlikSirasi, durum == .hazirlaniyor else { return }

        guard let yeniTaniyici = SFSpeechRecognizer(locale: Locale(identifier: kaynak.kod)), yeniTaniyici.isAvailable else {
            hazirlikBitmedi(sira, Uyari("\(kaynak.ad) konuşma tanıma şu an kullanılamıyor. İnternet bağlantınızı denetleyin."))
            return
        }
        taniyici = yeniTaniyici

        let diller = await Sistem.ceviriDilleri(dil: kaynak.dilKodu, bolge: kaynak.bolgeKodu)
        guard sira == hazirlikSirasi, durum == .hazirlaniyor else { return }
        guard diller.destekli else {
            hazirlikBitmedi(sira, Uyari("\(kaynak.ad) dilinden Türkçeye çeviri bu telefonda desteklenmiyor."))
            return
        }

        // Çeviri dilleri telefonda yoksa sistem indirme penceresini açar. Devamı `hazirlikSonucu` içinde.
        hazirlikBekliyor = sira
        mesgulGuncelle()
        if ceviriAyari == nil {
            isciCalisiyor = true
            ceviriAyari = TranslationSession.Configuration(source: diller.kaynak, target: diller.hedef)
            isciyiGozle()
        } else {
            isciyiUyandir()
        }
    }

    private func hazirlikBitmedi(_ sira: Int, _ yeniUyari: Uyari?) {
        guard sira == hazirlikSirasi, durum == .hazirlaniyor else { return }
        durum = .bosta
        if let yeniUyari { uyari = yeniUyari }
    }

    private func vazgec() {
        hazirlikSirasi += 1
        hazirlikBekliyor = nil
        durum = .bosta
        mesgulGuncelle()
    }

    func durdur() {
        guard durum == .dinliyor else { return }
        if let kalan = parcalayici.kapat() { parcaHazir(kalan) }
        dinlemeyiKapat()
        durum = .bosta
        canliMetin = ""
        oturumuBirak()
    }

    func arkaPlanaGecildi() {
        // Kilitliyken sürdürme açıksa dinleme ve seslendirme devam eder.
        if durum == .dinliyor && kilitliDevam && kilitliDevamOlur { return }
        switch durum {
        case .dinliyor: durdur()
        case .hazirlaniyor: vazgec()
        case .bosta: break
        }
        sesiSustur()
    }

    /// Uygulama yeniden öne geldi: bu arada yüklenen sesleri ve kulaklık durumunu yeniden oku.
    func onePlanaGelindi() {
        erkekSesVar = Sistem.erkekSesVar()
        sesOnbellegi.removeAll()
        rotayiOku()
    }

    func ayarlariAc() {
        guard let adres = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(adres)
    }

    // MARK: Mikrofon ve konuşma tanıma

    private func dinlemeyiAc() throws {
        let oturum = AVAudioSession.sharedInstance()
        // iPhone mikrofonu + kulaklıktan yüksek kaliteli çıkış (A2DP). Kulaklık mikrofonu seçilirse
        // hem giriş hem çıkış kulaklığa geçer (arama kalitesinde).
        var secenekler: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
        secenekler.insert(kulaklikMikrofonu ? .allowBluetooth : .allowBluetoothA2DP)
        try oturum.setCategory(.playAndRecord, mode: .default, options: secenekler)
        try oturum.setActive(true)
        oturumAcik = true
        rotayiOku()

        try motoruKur()

        ardArdaHata = 0
        ardArdaCeviriHatasi = 0
        canliMetin = ""
        sonAsil = ""
        sonCeviri = ""
        oncekiCeviri = ""
        durum = .dinliyor
        UIApplication.shared.isIdleTimerDisabled = true
        tanimayiBaslat()
        duzeyiIzle()
    }

    /// Yeni bir ses motoru kurar. Her seferinde yenisi kurulur ki giriş biçimi güncel donanımla uyuşsun.
    private func motoruKur() throws {
        let yeniMotor = AVAudioEngine()
        let giris = yeniMotor.inputNode
        let bicim = giris.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0 else {
            throw CocoaError(.featureUnsupported)
        }
        kopru.dinle(giris, bicim: bicim)
        yeniMotor.prepare()
        do {
            try yeniMotor.start()
        } catch {
            giris.removeTap(onBus: 0)
            throw error
        }
        sesMotoru = yeniMotor
    }

    private func motoruBirak() {
        if let eski = sesMotoru {
            eski.inputNode.removeTap(onBus: 0)
            eski.stop()
        }
        sesMotoru = nil
    }

    private func dinlemeyiKapat() {
        duraklamaGorevi?.cancel()
        sinirGorevi?.cancel()
        yenidenGorevi?.cancel()
        duzeyGorevi?.cancel()
        gorevSayaci += 1
        kopru.istekAyarla(nil)
        kopru.kis(false)
        istek?.endAudio()
        istek = nil
        gorev?.cancel()
        gorev = nil
        motoruBirak()
        duzey.deger = 0
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func tanimayiBaslat() {
        guard let taniyici else { return }
        let yeniIstek = SFSpeechAudioBufferRecognitionRequest()
        yeniIstek.shouldReportPartialResults = true
        yeniIstek.taskHint = .dictation
        yeniIstek.addsPunctuation = true
        cihazdaTanima = taniyici.supportsOnDeviceRecognition
        if cihazdaTanima { yeniIstek.requiresOnDeviceRecognition = true }

        gorevSayaci += 1
        let kimlik = gorevSayaci
        gorevBaslangici = Date()
        gorevdeMetinGeldi = false
        parcalayici.sifirla()
        istek = yeniIstek
        kopru.istekAyarla(yeniIstek)
        // Sonuçlar sırayla ana kuyruğa aktarılır (sıra önemli: her ara sonuç bir öncekinin devamıdır).
        gorev = Sistem.tanimaGorevi(taniyici, yeniIstek) { [weak self] metin, sozBitti, gorevBitti, hata in
            guard let motor = self else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    motor.tanimaOlayi(kimlik, metin: metin, sozBitti: sozBitti, gorevBitti: gorevBitti, hata: hata)
                }
            }
        }

        // Sunucuda tanıma bir dakikayla sınırlıdır; sınıra varmadan görevi tazele.
        sinirGorevi?.cancel()
        if !cihazdaTanima {
            sinirGorevi = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 55_000_000_000)
                guard !Task.isCancelled, let self else { return }
                guard kimlik == self.gorevSayaci, self.durum == .dinliyor else { return }
                if let kalan = self.parcalayici.kapat() { self.parcaHazir(kalan) }
                self.canliMetin = ""
                self.tanimayiTazele()
            }
        }
    }

    /// Yeni görevi başlatır, sonra eskisini kapatır; arada ses kaybolmaz.
    private func tanimayiTazele() {
        let eskiIstek = istek
        let eskiGorev = gorev
        tanimayiBaslat()
        eskiIstek?.endAudio()
        eskiGorev?.cancel()
    }

    private func tanimaOlayi(_ kimlik: Int, metin: String?, sozBitti: Bool, gorevBitti: Bool, hata: Bool) {
        guard kimlik == gorevSayaci, durum == .dinliyor else { return }

        if let metin {
            if !metin.isEmpty {
                gorevdeMetinGeldi = true
                ardArdaHata = 0
            }
            for parca in parcalayici.guncelle(metin) { parcaHazir(parca) }
            canliMetin = parcalayici.canli
            duraklamayiBekle()
        }

        if sozBitti || gorevBitti || hata {
            if let kalan = parcalayici.kapat() { parcaHazir(kalan) }
            canliMetin = ""
        }

        if gorevBitti || hata {
            gorevSonlandi(hata: hata)
        }
    }

    /// Konuşan bir süre susarsa eldeki sözü çeviriye gönderir.
    private func duraklamayiBekle() {
        duraklamaGorevi?.cancel()
        let kimlik = gorevSayaci
        duraklamaGorevi = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_100_000_000)
            guard !Task.isCancelled, let self else { return }
            guard kimlik == self.gorevSayaci, self.durum == .dinliyor else { return }
            if let kalan = self.parcalayici.kapat() { self.parcaHazir(kalan) }
            self.canliMetin = ""
            // Uzayan görevi sessizlikte tazele; metin birikmesin.
            if Date().timeIntervalSince(self.gorevBaslangici) > 40 { self.tanimayiTazele() }
        }
    }

    /// Tanıma görevi kendiliğinden bitti (süre doldu, sessizlik, hata). Dinleme sürüyorsa yenisini başlatır.
    private func gorevSonlandi(hata: Bool) {
        duraklamaGorevi?.cancel()
        let omur = Date().timeIntervalSince(gorevBaslangici)
        if hata && !gorevdeMetinGeldi && omur < 1 {
            ardArdaHata += 1
        } else {
            ardArdaHata = 0
        }

        guard ardArdaHata < 8 else {
            durdur()
            uyari = Uyari("Konuşma tanıma başlatılamadı. İnternet bağlantısını ve iPhone ayarlarında Dikte’nin açık olduğunu denetleyin.")
            return
        }

        if ardArdaHata == 0 {
            tanimayiBaslat()
            return
        }
        // Hemen hata veren görevi aralıklarla yeniden dene.
        gorevSayaci += 1
        let kimlik = gorevSayaci
        let bekleme = UInt64(ardArdaHata) * 300_000_000
        yenidenGorevi?.cancel()
        yenidenGorevi = Task { [weak self] in
            try? await Task.sleep(nanoseconds: bekleme)
            guard !Task.isCancelled, let self else { return }
            guard kimlik == self.gorevSayaci, self.durum == .dinliyor else { return }
            self.tanimayiBaslat()
        }
    }

    private func duzeyiIzle() {
        duzeyGorevi?.cancel()
        duzeyGorevi = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 70_000_000)
                guard let self, self.durum == .dinliyor else { return }
                self.duzey.deger = Double(self.kopru.duzey)
            }
        }
    }

    // MARK: Ses yolu

    private func rotayiOku() {
        let dahili: [AVAudioSession.Port] = [.builtInSpeaker, .builtInReceiver]
        let cikislar = AVAudioSession.sharedInstance().currentRoute.outputs
        let kulaklik = cikislar.first { !dahili.contains($0.portType) }
        let bagli = kulaklik != nil
        let ad = kulaklik?.portName ?? ""
        if kulaklikBagli != bagli { kulaklikBagli = bagli }
        if cikisAdi != ad { cikisAdi = ad }
    }

    private func kesinti(_ ham: UInt?) {
        guard let ham, AVAudioSession.InterruptionType(rawValue: ham) == .began else { return }
        sesiSustur()
        if durum == .dinliyor {
            durdur()
            uyari = Uyari("Dinleme kesildi. Yeniden başlatabilirsiniz.")
        }
    }

    /// Kulaklık takılıp çıkınca ses donanımı değişir ve ses motoru kendini durdurur; yeniden kur.
    private func sesDonanimiDegisti() {
        guard durum == .dinliyor, let eski = sesMotoru, !eski.isRunning else { return }
        motoruBirak()
        do {
            try motoruKur()
            tanimayiTazele()
        } catch {
            durdur()
            uyari = Uyari("Mikrofon yeniden açılamadı. Dinlemeyi yeniden başlatın.")
        }
    }

    /// Sıradaki ses çalınmadan önce ses oturumunu hazırlar.
    private func calmayaHazirlan() {
        // Kulaklık yokken ses hoparlörden çıkar; mikrofon onu duyup yeniden çevirmesin.
        if durum == .dinliyor && !kulaklikBagli { kopru.kis(true) }
        guard !oturumAcik else { return }
        let oturum = AVAudioSession.sharedInstance()
        try? oturum.setCategory(.playback, mode: .spokenAudio, options: [])
        try? oturum.setActive(true)
        oturumAcik = true
        rotayiOku()
    }

    /// Dinleme ve seslendirme bittiyse ses oturumunu bırakır; duraklatılan müzik geri gelir.
    private func oturumuBirak() {
        guard oturumAcik, durum == .bosta, !sesDongusuCalisiyor else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        oturumAcik = false
    }

    // MARK: Çeviri

    /// Bir söz parçası çeviriye hazır.
    private func parcaHazir(_ metin: String) {
        let cumle = Cumle(asil: metin)
        gecmis.append(cumle)
        if gecmis.count > 300 { gecmis.removeFirst(gecmis.count - 300) }
        sonAsil = metin
        ceviriSirasi.append(.cevir(kimlik: cumle.id, metin: metin))
        mesgulGuncelle()
        isciyiUyandir()
    }

    private func mesgulGuncelle() {
        let bekleyen = ceviriSirasi.count + ((isciIsUzerinde && hazirlikBekliyor == nil && durum != .hazirlaniyor) ? 1 : 0)
        if cevrilen != bekleyen { cevrilen = bekleyen }
        let yeniMesgul = isciIsUzerinde || !ceviriSirasi.isEmpty || hazirlikBekliyor != nil
        if mesgul != yeniMesgul { mesgul = yeniMesgul }
    }

    /// Bekleyen iş varsa ve çalışan bir çeviri oturumu yoksa SwiftUI'den yenisini ister.
    private func isciyiUyandir() {
        guard !isciCalisiyor, ceviriAyari != nil else { return }
        isciCalisiyor = true
        ceviriAyari?.invalidate()
        isciyiGozle()
    }

    /// Oturum birkaç saniye içinde hiç başlamazsa yeniden ister; yine olmazsa kullanıcıya söyler.
    private func isciyiGozle(deneme: Int = 0) {
        let temas = isciTemasi
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard let self, self.isciCalisiyor, self.isciTemasi == temas else { return }
            if deneme < 2 {
                self.ceviriAyari?.invalidate()
                self.isciyiGozle(deneme: deneme + 1)
            } else {
                self.isciCalisiyor = false
                self.ceviriBaslamadi()
            }
        }
    }

    private func ceviriBaslamadi() {
        for isi in ceviriSirasi {
            if case .cevir(let kimlik, _) = isi, let sira = gecmis.firstIndex(where: { $0.id == kimlik }) {
                gecmis[sira].basarisiz = true
            }
        }
        ceviriSirasi.removeAll()
        hazirlikBekliyor = nil
        isciIsUzerinde = false
        mesgulGuncelle()
        if durum == .dinliyor { durdur() }
        durum = .bosta
        uyari = Uyari("Çeviri başlatılamadı. Uygulamayı kapatıp yeniden açın.")
    }

    /// Dil değişti: eldeki çeviri oturumu artık geçersiz. (Yalnızca boştayken çağrılır.)
    private func ceviriOturumunuBirak() {
        isciKusagi += 1
        isciCalisiyor = false
        isciIsUzerinde = false
        hazirlikBekliyor = nil
        ceviriAyari = nil
        mesgulGuncelle()
    }

    /// SwiftUI'nin `.translationTask` ile verdiği oturumu kullanan iş.
    ///
    /// Ana aktörün dışında kurulur. Oturum yalnızca bu kapanışın içinde ve yalnızca kendi kuşağı
    /// geçerliyken kullanılır; sıra boşalınca kapanış biter. Böylece süresi geçmiş bir oturuma
    /// hiçbir zaman dokunulmaz.
    nonisolated func ceviriIsleyicisi() -> (TranslationSession) async -> Void {
        return { [weak self] oturum in
            // Oturum Sendable değil; burada yalnızca bu kapanışın içinde ve sırayla kullanılır.
            // Bu satır, Xcode 26'nın yeni proje ayarlarıyla Swift 6 kipinde de derlenmesini sağlar.
            nonisolated(unsafe) let oturum = oturum
            guard let kusak = await self?.isciBasladi() else { return }
            while let isi = await self?.siradakiIs(kusak) {
                switch isi {
                case .hazirla(let sira):
                    do {
                        try await oturum.prepareTranslation()
                        await self?.hazirlikSonucu(sira, basarili: true, iptal: false)
                    } catch {
                        if Task.isCancelled {
                            await self?.isciIptalEdildi(kusak, yarimKalan: isi)
                            return
                        }
                        let iptal = (error as? CocoaError)?.code == .userCancelled
                        await self?.hazirlikSonucu(sira, basarili: false, iptal: iptal)
                    }
                case .cevir(let kimlik, let metin):
                    do {
                        let yanit = try await oturum.translate(metin)
                        await self?.ceviriSonucu(kimlik, ceviri: yanit.targetText)
                    } catch {
                        if Task.isCancelled {
                            await self?.isciIptalEdildi(kusak, yarimKalan: isi)
                            return
                        }
                        await self?.ceviriSonucu(kimlik, ceviri: nil)
                    }
                }
                if Task.isCancelled {
                    await self?.isciIptalEdildi(kusak, yarimKalan: nil)
                    return
                }
            }
        }
    }

    /// SwiftUI çeviri görevini iptal etti (beklenmez, ama olursa): yarım kalan işi sıraya geri koy,
    /// kalan işler için yeni bir oturum iste. Bu oturuma bir daha dokunulmaz.
    func isciIptalEdildi(_ kusak: Int, yarimKalan: CeviriIsi?) {
        guard kusak == isciKusagi else { return }
        isciKusagi += 1
        isciCalisiyor = false
        isciIsUzerinde = false
        switch yarimKalan {
        case .hazirla(let sira)?:
            if hazirlikBekliyor == nil { hazirlikBekliyor = sira }
        case .cevir?:
            if let yarimKalan { ceviriSirasi.insert(yarimKalan, at: 0) }
        case nil:
            break
        }
        mesgulGuncelle()
        if !ceviriSirasi.isEmpty || hazirlikBekliyor != nil { isciyiUyandir() }
    }

    func isciBasladi() -> Int {
        isciKusagi += 1
        isciTemasi += 1
        isciCalisiyor = true
        return isciKusagi
    }

    func siradakiIs(_ kusak: Int) -> CeviriIsi? {
        guard kusak == isciKusagi else { return nil }
        isciTemasi += 1
        if let sira = hazirlikBekliyor {
            hazirlikBekliyor = nil
            isciIsUzerinde = true
            mesgulGuncelle()
            return .hazirla(sira: sira)
        }
        if !ceviriSirasi.isEmpty {
            let isi = ceviriSirasi.removeFirst()
            isciIsUzerinde = true
            mesgulGuncelle()
            return isi
        }
        isciCalisiyor = false
        isciIsUzerinde = false
        mesgulGuncelle()
        return nil
    }

    func hazirlikSonucu(_ sira: Int, basarili: Bool, iptal: Bool) {
        isciIsUzerinde = false
        mesgulGuncelle()
        guard sira == hazirlikSirasi, durum == .hazirlaniyor else { return }
        guard basarili else {
            durum = .bosta
            uyari = Uyari(
                iptal
                    ? "Çeviri için dil dosyalarının bir kez indirilmesi gerekiyor."
                    : "Çeviri dili hazırlanamadı. İnternet bağlantınızı denetleyip yeniden deneyin."
            )
            return
        }
        do {
            try dinlemeyiAc()
        } catch {
            dinlemeyiKapat()
            durum = .bosta
            oturumuBirak()
            uyari = Uyari("Mikrofon açılamadı. Başka bir uygulama kullanıyor olabilir.")
        }
    }

    func ceviriSonucu(_ kimlik: UUID, ceviri: String?) {
        isciIsUzerinde = false
        mesgulGuncelle()
        guard let sira = gecmis.firstIndex(where: { $0.id == kimlik }) else { return }

        let temiz = ceviri?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !temiz.isEmpty else {
            gecmis[sira].basarisiz = true
            ardArdaCeviriHatasi += 1
            if ardArdaCeviriHatasi == 3 {
                uyari = Uyari("Cümleler çevrilemiyor. Dinlemeyi durdurup yeniden başlatın.")
            }
            return
        }

        ardArdaCeviriHatasi = 0
        gecmis[sira].ceviri = temiz
        if !sonCeviri.isEmpty { oncekiCeviri = sonCeviri }
        sonCeviri = temiz
        GecmisDeposu.kaydet(gecmis)
        if sesliOku { seslendir(temiz) }
    }

    func gecmisiTemizle() {
        gecmis.removeAll { $0.ceviri != nil || $0.basarisiz }
        GecmisDeposu.kaydet(gecmis)
        if durum == .bosta {
            sonAsil = ""
            sonCeviri = ""
            oncekiCeviri = ""
        }
    }

    // MARK: Seslendirme

    func sesiDene() {
        seslendir("Merhaba. Çeviriler bu sesle okunacak.")
    }

    /// Metni sıraya koyar; sesler sırayla, üst üste binmeden çalınır.
    func seslendir(_ metin: String) {
        let temiz = metin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !temiz.isEmpty else { return }

        var hazirlik: Task<(veri: Data, durumKodu: Int), any Error>?
        let anahtar = alaniaAnahtari.trimmingCharacters(in: .whitespacesAndNewlines)
        if !anahtar.isEmpty && !alaniaKapali {
            // Ses, sırası gelmeden önce indirilmeye başlar.
            let ses = cinsiyet.alaniaSesi
            hazirlik = Task { try await Alania.sentezle(temiz, ses: ses, anahtar: anahtar) }
        }
        sesSirasi.append(SesIsi(metin: temiz, kusak: sesKusagi, hazirlik: hazirlik))

        // Konuşan çok hızlıysa eski cümleleri atla; yazıları ekranda ve geçmişte durur.
        if sesSirasi.count > 4 {
            let fazla = sesSirasi.count - 2
            for isi in sesSirasi.prefix(fazla) { isi.hazirlik?.cancel() }
            sesSirasi.removeFirst(fazla)
        }

        guard !sesDongusuCalisiyor else { return }
        sesDongusuCalisiyor = true
        Task { await sesDongusu() }
    }

    private func sesDongusu() async {
        while !sesSirasi.isEmpty {
            let isi = sesSirasi.removeFirst()
            if !seslendiriyor { seslendiriyor = true }
            calmayaHazirlan()
            // Sıra biriktiyse biraz hızlan.
            let hiz: Float = sesSirasi.count >= 2 ? 1.3 : (sesSirasi.count == 1 ? 1.15 : 1.0)

            var calindi = false
            if let hazirlik = isi.hazirlik {
                let sonuc = await hazirlik.result
                // Beklerken susturulduysa bu sesi atla.
                guard isi.kusak == sesKusagi else { continue }
                switch sonuc {
                case .success(let yanit) where (200..<300).contains(yanit.durumKodu) && yanit.veri.count > 44:
                    calindi = await veriyiCal(yanit.veri, hiz: hiz)
                    if calindi {
                        alaniaHatasi = 0
                        if sesNotu != nil { sesNotu = nil }
                    } else {
                        alaniaSorunu(durumKodu: -1)
                    }
                case .success(let yanit):
                    alaniaSorunu(durumKodu: yanit.durumKodu)
                case .failure:
                    alaniaSorunu(durumKodu: 0)
                }
            }
            guard isi.kusak == sesKusagi else { continue }
            if !calindi { await appleIleKonus(isi.metin, hiz: hiz) }
        }

        seslendiriyor = false
        sesDongusuCalisiyor = false
        mikrofonuGeriAc()
        oturumuBirak()
    }

    /// Alania-2 yanıt vermediğinde Apple sesine dönülür ve nedeni Ayarlar'da gösterilir.
    private func alaniaSorunu(durumKodu: Int) {
        alaniaHatasi += 1
        switch durumKodu {
        case 401, 403:
            alaniaKapali = true
            sesNotu = "Alania-2 anahtarı kabul edilmedi. Apple sesi kullanılıyor."
        case 402, 429:
            alaniaKapali = true
            sesNotu = "Alania-2 kullanım sınırı doldu. Apple sesi kullanılıyor."
        case 0:
            sesNotu = "Alania-2’ye ulaşılamadı. Apple sesi kullanılıyor."
        case -1:
            sesNotu = "Alania-2’nin gönderdiği ses açılamadı. Apple sesi kullanılıyor."
        default:
            sesNotu = "Alania-2 hata verdi (\(durumKodu)). Apple sesi kullanılıyor."
        }
        // Üst üste hata olursa bu oturumda bir daha deneme; her cümle gecikmesin.
        if alaniaHatasi >= 3 { alaniaKapali = true }
    }

    private func veriyiCal(_ veri: Data, hiz: Float) async -> Bool {
        guard let yeniCalici = try? AVAudioPlayer(data: DalgaDosyasi.duzelt(veri)) else { return false }
        yeniCalici.delegate = temsilci
        if hiz != 1 {
            yeniCalici.enableRate = true
            yeniCalici.rate = hiz
        }
        yeniCalici.prepareToPlay()
        calici = yeniCalici
        let enCok = max(yeniCalici.duration, 0.5) / Double(hiz) + 2
        let basladi = await sesiBekle(ObjectIdentifier(yeniCalici), enCok: enCok) {
            yeniCalici.play()
        }
        calici = nil
        return basladi
    }

    private func appleIleKonus(_ metin: String, hiz: Float) async {
        let soz = AVSpeechUtterance(string: metin)
        soz.voice = turkceSes()
        soz.rate = min(AVSpeechUtteranceDefaultSpeechRate * hiz, AVSpeechUtteranceMaximumSpeechRate)
        let enCok = Double(metin.count) * 0.12 + 4
        _ = await sesiBekle(ObjectIdentifier(soz), enCok: enCok) {
            sentezleyici.speak(soz)
            return true
        }
    }

    private func turkceSes() -> AVSpeechSynthesisVoice? {
        if let ses = sesOnbellegi[cinsiyet] { return ses }
        let ses = Sistem.turkceSes(erkek: cinsiyet == .erkek)
        if let ses { sesOnbellegi[cinsiyet] = ses }
        return ses
    }

    /// Sesi başlatır ve bitene kadar bekler. Bitiş bildirimi hiç gelmezse `enCok` saniye sonra devam eder.
    private func sesiBekle(_ nesne: ObjectIdentifier, enCok: Double, baslat: () -> Bool) async -> Bool {
        sesSayaci += 1
        let sira = sesSayaci
        beklenenNesne = nesne
        return await withCheckedContinuation { (devam: CheckedContinuation<Bool, Never>) in
            sesDevami = devam
            guard baslat() else {
                sesiBitir(sira, sonuc: false)
                return
            }
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(max(enCok, 1) * 1_000_000_000))
                self?.sesiBitir(sira, sonuc: true)
            }
        }
    }

    private func sesiBitir(_ sira: Int, sonuc: Bool) {
        guard sira == sesSayaci, let devam = sesDevami else { return }
        sesDevami = nil
        beklenenNesne = nil
        devam.resume(returning: sonuc)
    }

    /// Temsilciden gelir: çalma ya da konuşma bitti.
    private func sesBitti(_ nesne: ObjectIdentifier) {
        guard nesne == beklenenNesne else { return }
        sesiBitir(sesSayaci, sonuc: true)
    }

    private func sesiSustur() {
        sesKusagi += 1
        for isi in sesSirasi { isi.hazirlik?.cancel() }
        sesSirasi.removeAll()
        sentezleyici.stopSpeaking(at: .immediate)
        calici?.stop()
        sesiBitir(sesSayaci, sonuc: true)
    }

    /// Hoparlörden çalma bitince mikrofonu kısa bir aradan sonra yeniden açar.
    private func mikrofonuGeriAc() {
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard let self, !self.seslendiriyor else { return }
            self.kopru.kis(false)
        }
    }
}

// MARK: - Görünüm: renkler ve ortak parçalar

@MainActor
enum Renk {
    static let zeminUst = Color(red: 0.04, green: 0.07, blue: 0.20)
    static let zeminAlt = Color(red: 0.01, green: 0.02, blue: 0.07)
    static let mavi = Color(red: 0.16, green: 0.47, blue: 1.0)
    static let acikMavi = Color(red: 0.45, green: 0.72, blue: 1.0)
    static let kirmizi = Color(red: 1.0, green: 0.27, blue: 0.23)
    static let sari = Color(red: 1.0, green: 0.78, blue: 0.25)
    static let yesil = Color(red: 0.25, green: 0.86, blue: 0.52)
    static let kart = Color.white.opacity(0.06)
    static let cizgi = Color.white.opacity(0.09)
    static let soluk = Color.white.opacity(0.62)
}

/// Koyu lacivert zemin ve ortasında hafif mavi parıltı.
struct Arkaplan: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Renk.zeminUst, Renk.zeminAlt], startPoint: .top, endPoint: .bottom)
            RadialGradient(
                colors: [Renk.mavi.opacity(0.36), Renk.mavi.opacity(0)],
                center: UnitPoint(x: 0.5, y: 0.34),
                startRadius: 10,
                endRadius: 380
            )
        }
        .ignoresSafeArea()
    }
}

extension View {
    /// Yuvarlak köşeli koyu kart.
    func kart(kose: CGFloat = 26) -> some View {
        self
            .background(Renk.kart, in: RoundedRectangle(cornerRadius: kose, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: kose, style: .continuous)
                    .strokeBorder(Renk.cizgi, lineWidth: 1)
            }
    }

    func buyukBaslik() -> some View {
        self
            .font(.system(.largeTitle, design: .rounded, weight: .bold))
            .foregroundStyle(.white)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Geniş, parlak ana düğme.
struct AnaDugmeStili: ButtonStyle {
    let renk: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .background(renk, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: renk.opacity(0.45), radius: 18, y: 8)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Küçük, kapsül biçimli ikincil düğme.
struct KapsulDugmeStili: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Color.white.opacity(configuration.isPressed ? 0.2 : 0.1), in: Capsule())
    }
}

/// İki ya da üç seçenekli seçim şeridi.
struct Secici<Deger: Hashable>: View {
    let secenekler: [Deger]
    let ad: (Deger) -> String
    @Binding var secili: Deger

    var body: some View {
        HStack(spacing: 4) {
            ForEach(secenekler, id: \.self) { secenek in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { secili = secenek }
                } label: {
                    Text(ad(secenek))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(secili == secenek ? Color.white : Renk.soluk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            secili == secenek ? Renk.mavi : Color.clear,
                            in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(secili == secenek ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
    }
}

/// Mikrofonun duyduğu sesle oynayan çubuklar.
struct SesCubuklari: View {
    @ObservedObject var olcer: DuzeyOlcer
    private let oranlar: [Double] = [0.45, 0.8, 1, 0.7, 0.4]

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(0..<oranlar.count, id: \.self) { sira in
                Capsule()
                    .fill(Renk.acikMavi)
                    .frame(width: 4, height: 5 + 21 * olcer.deger * oranlar[sira])
            }
        }
        .frame(height: 28)
        .animation(.easeOut(duration: 0.12), value: olcer.deger)
        .accessibilityHidden(true)
    }
}

// MARK: - Görünüm: ana çerçeve ve sekmeler

enum Sekme: String, CaseIterable, Identifiable {
    case ceviri
    case gecmis
    case ayarlar

    var id: String { rawValue }

    var ad: String {
        switch self {
        case .ceviri: return "Çeviri"
        case .gecmis: return "Geçmiş"
        case .ayarlar: return "Ayarlar"
        }
    }

    var simge: String {
        switch self {
        case .ceviri: return "waveform"
        case .gecmis: return "clock.fill"
        case .ayarlar: return "gearshape.fill"
        }
    }
}

struct AnaGorunum: View {
    @EnvironmentObject private var motor: CeviriMotoru
    @Environment(\.scenePhase) private var sahne
    @State private var sekme: Sekme = .ceviri

    var body: some View {
        ZStack {
            Arkaplan()
            switch sekme {
            case .ceviri: CeviriEkrani()
            case .gecmis: GecmisEkrani()
            case .ayarlar: AyarlarEkrani()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SekmeCubugu(secili: $sekme)
        }
        // Çeviri oturumunu SwiftUI verir; değiştirici her sekmede yaşasın diye en dışta durur.
        .translationTask(motor.ceviriAyari, action: motor.ceviriIsleyicisi())
        .onChange(of: sahne) { _, yeni in
            switch yeni {
            case .background: motor.arkaPlanaGecildi()
            case .active: motor.onePlanaGelindi()
            default: break
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// Altta yüzen, kapsül biçimli sekme çubuğu.
struct SekmeCubugu: View {
    @Binding var secili: Sekme
    @Namespace private var alan

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Sekme.allCases) { sekme in
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { secili = sekme }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: sekme.simge)
                            .font(.body.weight(.semibold))
                        if secili == sekme {
                            Text(sekme.ad)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                        }
                    }
                    .foregroundStyle(secili == sekme ? Color.white : Renk.soluk)
                    .padding(.horizontal, 18)
                    .frame(height: 48)
                    .background {
                        if secili == sekme {
                            Capsule()
                                .fill(Renk.mavi)
                                .matchedGeometryEffect(id: "secim", in: alan)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(sekme.ad)
                .accessibilityAddTraits(secili == sekme ? .isSelected : [])
            }
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay {
            Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.4), radius: 20, y: 10)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }
}

// MARK: - Görünüm: Çeviri

struct CeviriEkrani: View {
    @EnvironmentObject private var motor: CeviriMotoru

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Canlı Çeviri").buyukBaslik()
                CikisSatiri()
            }
            DilSeridi()
            if let uyari = motor.uyari {
                UyariKarti(uyari: uyari)
            }
            SuAnKarti()
            AnaDugme()
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .animation(.easeInOut(duration: 0.25), value: motor.uyari)
    }
}

/// Sesin nereden çıkacağını söyler.
struct CikisSatiri: View {
    @EnvironmentObject private var motor: CeviriMotoru

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: motor.kulaklikBagli ? "headphones" : "speaker.wave.2.fill")
            Text(motor.kulaklikBagli ? "\(motor.cikisAdi) bağlı" : "Kulaklık bağlı değil · ses telefondan çıkar")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(motor.kulaklikBagli ? Renk.yesil : Renk.sari)
        .accessibilityElement(children: .combine)
    }
}

/// Mavi şerit: konuşulan dil → Türkçe.
struct DilSeridi: View {
    @EnvironmentObject private var motor: CeviriMotoru

    var body: some View {
        HStack(spacing: 10) {
            Menu {
                Picker("Konuşulan dil", selection: $motor.kaynak) {
                    ForEach(Dil.tumu) { dil in
                        Text(dil.ad).tag(dil)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(motor.kaynak.ad)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.heavy))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .disabled(!motor.dilDegisebilir)
            .accessibilityLabel("Konuşulan dil: \(motor.kaynak.ad)")

            Image(systemName: "arrow.right")
                .font(.headline.weight(.bold))
                .accessibilityHidden(true)

            Text("Türkçe")
                .frame(maxWidth: .infinity, minHeight: 48)
                .accessibilityLabel("Çevrilen dil: Türkçe")
        }
        .font(.headline)
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .background(
            LinearGradient(colors: [Renk.mavi, Renk.mavi.opacity(0.75)], startPoint: .leading, endPoint: .trailing),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
    }
}

struct UyariKarti: View {
    @EnvironmentObject private var motor: CeviriMotoru
    let uyari: Uyari

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Renk.sari)
                .padding(.top, 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text(uyari.metin)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if uyari.ayarlarDugmesi {
                    Button("Ayarları Aç") { motor.ayarlariAc() }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Renk.acikMavi)
                        .frame(minHeight: 44)
                }
            }
            Spacer(minLength: 0)
            Button {
                motor.uyari = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Renk.soluk)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Uyarıyı kapat")
        }
        .padding(.leading, 14)
        .padding(.vertical, 6)
        .background(Renk.sari.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Renk.sari.opacity(0.35), lineWidth: 1)
        }
        .transition(.opacity)
    }
}

/// "Şu An" kartı: o an söylenen söz ve son çeviri.
struct SuAnKarti: View {
    @EnvironmentObject private var motor: CeviriMotoru

    private var asil: String { motor.canliMetin.isEmpty ? motor.sonAsil : motor.canliMetin }
    private var bos: Bool { asil.isEmpty && motor.sonCeviri.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("ŞU AN")
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                    .foregroundStyle(Renk.soluk)
                Spacer()
                if motor.durum == .dinliyor {
                    SesCubuklari(olcer: motor.duzey)
                }
            }

            if bos {
                bosDurum
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if !asil.isEmpty {
                            Text(asil)
                                .font(.body)
                                .foregroundStyle(Renk.soluk)
                        }
                        if !motor.oncekiCeviri.isEmpty {
                            Text(motor.oncekiCeviri)
                                .font(.title3)
                                .foregroundStyle(Color.white.opacity(0.45))
                        }
                        if !motor.sonCeviri.isEmpty {
                            Text(motor.sonCeviri)
                                .font(.system(.title, design: .rounded, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        if motor.cevrilen > 0 {
                            HStack(spacing: 8) {
                                ProgressView().tint(Renk.acikMavi)
                                Text("Çevriliyor…")
                                    .font(.subheadline)
                                    .foregroundStyle(Renk.soluk)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .defaultScrollAnchor(.bottom)
                .scrollIndicators(.hidden)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .kart()
    }

    private var bosDurum: some View {
        VStack(spacing: 14) {
            Image(systemName: motor.durum == .dinliyor ? "ear.fill" : "waveform")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Renk.acikMavi)
                .accessibilityHidden(true)
            Text(motor.durum == .dinliyor ? "Dinliyorum…" : "Hazır")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
            Text(
                motor.durum == .dinliyor
                    ? "Telefonu konuşana doğru tutun. Türkçesi kulaklığınıza gelir."
                    : "Başlat’a dokunun, karşınızdaki konuşsun. Türkçesi kulaklığınıza gelir."
            )
            .font(.subheadline)
            .foregroundStyle(Renk.soluk)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct AnaDugme: View {
    @EnvironmentObject private var motor: CeviriMotoru

    private var baslik: String {
        switch motor.durum {
        case .bosta: return "Dinlemeyi Başlat"
        case .hazirlaniyor: return "Hazırlanıyor…"
        case .dinliyor: return "Durdur"
        }
    }

    var body: some View {
        Button {
            motor.dugmeyeBasildi()
        } label: {
            HStack(spacing: 10) {
                switch motor.durum {
                case .bosta: Image(systemName: "mic.fill")
                case .hazirlaniyor: ProgressView().tint(.white)
                case .dinliyor: Image(systemName: "stop.fill")
                }
                Text(baslik)
            }
            .font(.title3.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 60)
        }
        .buttonStyle(AnaDugmeStili(renk: motor.durum == .dinliyor ? Renk.kirmizi : Renk.mavi))
        .sensoryFeedback(.impact, trigger: motor.durum)
        .accessibilityHint(motor.durum == .hazirlaniyor ? "Vazgeçmek için dokunun" : "")
    }
}

// MARK: - Görünüm: Geçmiş

struct GecmisEkrani: View {
    @EnvironmentObject private var motor: CeviriMotoru
    @State private var silmeSorusu = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Text("Geçmiş").buyukBaslik()
                Spacer()
                if !motor.gecmis.isEmpty {
                    Button("Temizle") { silmeSorusu = true }
                        .buttonStyle(KapsulDugmeStili())
                }
            }

            if motor.gecmis.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "clock")
                        .font(.system(size: 40, weight: .semibold))
                        .foregroundStyle(Renk.acikMavi)
                        .accessibilityHidden(true)
                    Text("Henüz çeviri yok")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Çevrilen cümleler saatleriyle burada birikir.")
                        .font(.subheadline)
                        .foregroundStyle(Renk.soluk)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(motor.gecmis.reversed()) { cumle in
                            GecmisKarti(cumle: cumle)
                        }
                    }
                    .padding(.bottom, 8)
                }
                .scrollIndicators(.hidden)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .confirmationDialog("Geçmiş silinsin mi?", isPresented: $silmeSorusu, titleVisibility: .visible) {
            Button("Tümünü Sil", role: .destructive) { motor.gecmisiTemizle() }
            Button("Vazgeç", role: .cancel) {}
        }
    }
}

struct GecmisKarti: View {
    @EnvironmentObject private var motor: CeviriMotoru
    let cumle: Cumle

    private var saat: String {
        if Calendar.current.isDateInToday(cumle.saat) {
            return cumle.saat.formatted(date: .omitted, time: .shortened)
        }
        return cumle.saat.formatted(date: .abbreviated, time: .shortened)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                Text(saat)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Renk.acikMavi)
                Text(cumle.asil)
                    .font(.subheadline)
                    .foregroundStyle(Renk.soluk)
                if let ceviri = cumle.ceviri {
                    Text(ceviri)
                        .font(.system(.title3, design: .rounded, weight: .semibold))
                        .foregroundStyle(.white)
                } else if cumle.basarisiz {
                    Text("Çevrilemedi")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Renk.sari)
                } else {
                    Text("Çevriliyor…")
                        .font(.subheadline)
                        .foregroundStyle(Renk.soluk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let ceviri = cumle.ceviri {
                Button {
                    motor.seslendir(ceviri)
                } label: {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Renk.acikMavi)
                        .frame(width: 44, height: 44)
                        .background(Color.white.opacity(0.08), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Çeviriyi yeniden dinle")
            }
        }
        .padding(16)
        .kart(kose: 22)
    }
}

// MARK: - Görünüm: Ayarlar

struct AyarlarEkrani: View {
    @EnvironmentObject private var motor: CeviriMotoru

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ayarlar").buyukBaslik()

                AyarKarti(baslik: "Ses", simge: "person.wave.2.fill") {
                    Secici(secenekler: SesCinsiyeti.allCases, ad: { $0.ad }, secili: $motor.cinsiyet)
                    Toggle("Çeviriyi sesli oku", isOn: $motor.sesliOku)
                        .tint(Renk.mavi)
                        .foregroundStyle(.white)
                        .frame(minHeight: 44)
                    Button {
                        motor.sesiDene()
                    } label: {
                        Label("Sesi Dene", systemImage: "play.fill")
                    }
                    .buttonStyle(KapsulDugmeStili())
                    if motor.cinsiyet == .erkek && !motor.erkekSesVar && !motor.alaniaEtkin {
                        Aciklama("Telefonda Türkçe erkek ses bulunamadı; kadın ses kullanılır. iPhone Ayarları › Erişilebilirlik › Seslendirilen İçerik › Sesler › Türkçe bölümünden ses indirebilir ya da Alania-2 anahtarı girebilirsiniz.")
                    }
                }

                AyarKarti(baslik: "Alania-2 anahtarı", simge: "key.fill") {
                    SecureField("pd_live_…", text: $motor.alaniaAnahtari)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 48)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .accessibilityLabel("Alania-2 anahtarı")
                    if let not = motor.sesNotu {
                        Text(not)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Renk.sari)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Aciklama(
                        motor.alaniaEtkin
                            ? "Çeviriler Alania-2 sesiyle okunur. Çeviri metni seslendirme için PatientDesk AI sunucusuna gönderilir."
                            : "Boş bırakırsanız Apple’ın Türkçe sesi kullanılır; anahtar gerekmez."
                    )
                }

                AyarKarti(baslik: "Mikrofon", simge: "mic.fill") {
                    Secici(
                        secenekler: [false, true],
                        ad: { $0 ? "Kulaklık" : "iPhone" },
                        secili: $motor.kulaklikMikrofonu
                    )
                    .disabled(motor.durum != .bosta)
                    Aciklama("iPhone mikrofonu karşınızdakini daha iyi duyar. Kulaklık mikrofonu seçilirse ses arama kalitesine düşer.")
                }

                AyarKarti(baslik: "Kilit ekranı", simge: "lock.fill") {
                    Toggle("Telefon kilitliyken sürdür", isOn: $motor.kilitliDevam)
                        .tint(Renk.mavi)
                        .foregroundStyle(.white)
                        .frame(minHeight: 44)
                        .disabled(!motor.kilitliDevamOlur)
                    Aciklama(
                        motor.kilitliDevamOlur
                            ? "Açıksa telefonu kilitleyip cebinize koyduğunuzda da dinler ve çevirir; pil daha çabuk biter. Kapalıysa uygulamadan çıkınca dinleme durur."
                            : "Bu seçenek için Xcode’da Signing & Capabilities › Background Modes › Audio açılmalı."
                    )
                }

                Aciklama("Konuşma tanıma ve çeviri Apple’ın sistemleriyle yapılır; dil destekliyorsa telefonun içinde kalır. Uygulama öne açıkken çalışır ve dinlerken ekranı açık tutar.")
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }
}

struct AyarKarti<Icerik: View>: View {
    let baslik: String
    let simge: String
    let icerik: Icerik

    init(baslik: String, simge: String, @ViewBuilder icerik: () -> Icerik) {
        self.baslik = baslik
        self.simge = simge
        self.icerik = icerik()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(baslik, systemImage: simge)
                .font(.headline)
                .foregroundStyle(.white)
            icerik
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .kart(kose: 24)
    }
}

/// Küçük, soluk açıklama yazısı.
struct Aciklama: View {
    let metin: String

    init(_ metin: String) {
        self.metin = metin
    }

    var body: some View {
        Text(metin)
            .font(.footnote)
            .foregroundStyle(Renk.soluk)
            .fixedSize(horizontal: false, vertical: true)
    }
}
