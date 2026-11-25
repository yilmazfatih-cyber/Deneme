import SwiftUI
import Translation

/// Çevrilmiş bir cümle: konuşmacının söylediği ve Türkçesi.
struct Satir: Identifiable {
    let id = UUID()
    let asil: String
    let ceviri: String
    let saat = Date()
}

/// Ekranların paylaştığı durum: çeviri oturumu, satırlar, hata.
@MainActor
@Observable
final class Durum {
    var ayar: TranslationSession.Configuration?
    var satirlar: [Satir] = []
    var hata: String?
    let hat = Hat()

    @ObservationIgnored private var dil = diller[0]
    var calisiyor: Bool { ayar != nil }

    func dugmeyeBasildi(dil: Dil) {
        if calisiyor {
            hat.durdur()
            ayar = nil
        } else {
            hata = nil
            self.dil = dil
            // Bu atama KokEkran'daki translationTask'i tetikler.
            ayar = .init(source: Locale.Language(identifier: dil.kod),
                         target: Locale.Language(identifier: "tr"))
        }
    }

    /// Çeviri oturumu açıkken çalışan ana döngü.
    func calistir(_ oturum: TranslationSession) async {
        do {
            try await oturum.prepareTranslation()   // dil paketi yoksa indirir
            guard await Hat.izinAl() else {
                hata = "Mikrofon ve konuşma tanıma izni gerekli (Ayarlar'dan açabilirsiniz)."
                ayar = nil
                return
            }
            // İndirme ya da izin beklenirken Durdur'a basıldıysa mikrofonu hiç açma.
            try Task.checkCancellation()
            let cumleler = try hat.baslat(konusmaDili: dil.konusma)

            // Her biten cümle buraya düşer: çevir, ekrana yaz, seslendir.
            // Mikrofon geri açılamazsa akış hatayla biter ve hata ekranda görünür.
            for try await cumle in cumleler {
                let sonuc = try await oturum.translate(cumle)
                try Task.checkCancellation()        // bu arada durdurulduysa okuma
                satirlar.append(Satir(asil: cumle, ceviri: sonuc.targetText))
                hat.seslendir(sonuc.targetText)
            }
        } catch {
            // Durdur'a basıldıysa görev iptal edilmiştir; gösterilecek bir hata yok.
            guard !(error is CancellationError), !Task.isCancelled else { return }
            hata = error.localizedDescription
            hat.durdur()
            ayar = nil
        }
    }
}
