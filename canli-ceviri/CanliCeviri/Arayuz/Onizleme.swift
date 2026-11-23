// Xcode önizlemeleri: bu dosyayı açıp Canvas'ı gösterin (Editor > Canvas, ⌥⌘↩).
// Mikrofon ve çeviri önizlemede çalışmaz; ekranlar örnek çevirilerle görünür.

#if DEBUG
import SwiftUI

extension Durum {
    /// Önizlemeler için örnek çeviriler.
    static var ornek: Durum {
        let durum = Durum()
        durum.hat.kulaklik = "AirPods Pro"   // bağlı görünsün; "İlk açılış" önizlemesi bağlı olmayan hâli gösterir
        durum.satirlar = [
            Satir(asil: "Good morning, how can I help you?",
                  ceviri: "Günaydın, size nasıl yardımcı olabilirim?"),
            Satir(asil: "The next train to the airport leaves at nine.",
                  ceviri: "Havalimanına giden bir sonraki tren dokuzda kalkıyor."),
            Satir(asil: "Please keep your ticket with you.",
                  ceviri: "Lütfen biletinizi yanınızda bulundurun."),
        ]
        return durum
    }
}

#Preview("Çeviri") { KokEkran(durum: Durum.ornek) }
#Preview("Geçmiş") { KokEkran(durum: Durum.ornek, sekme: .gecmis) }
#Preview("Ayarlar") { KokEkran(sekme: .ayarlar) }
#Preview("İlk açılış") { KokEkran() }
#endif
