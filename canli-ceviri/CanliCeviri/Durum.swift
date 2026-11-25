import AVFoundation
import SwiftUI
import Translation

/// Çevrilmiş bir cümle: konuşmacının söylediği ve Türkçesi.
struct Satir: Identifiable {
    let id = UUID()
    let asil: String
    let ceviri: String
    /// Asıl cümlenin dil kodu (VoiceOver'ın doğru dille okuması için).
    var kaynakDil = "en"
    let saat = Date()
}

/// Dinleme aşaması — ekranın tek kaynağı (KR3, şartname D-0).
enum Asama: Equatable {
    case duruyor
    case hazirlaniyor
    case dinliyor
    case kesintide(KesintiNedeni)

    /// CANLI rozeti ve "Dinliyorum…" yalnız bunda `true`.
    var canli: Bool { self == .dinliyor }

    /// "Duraklatıldı: <neden>"; kesintide değilse nil.
    var duraklatmaMetni: String? {
        if case .kesintide(let neden) = self { return "Duraklatıldı: \(neden.ekranMetni)" }
        return nil
    }
}

/// Ekrandaki sarı notların türü; her türden en çok bir not görünür.
enum NotTuru: Hashable {
    case sunucuTanima   // KR2: bu dilde tanıma Apple sunucusunda
    case alania         // KR10: Alania yerine Apple sesi
    case turkceSes      // S7: Türkçe Apple sesi yüklü değil
    case ceviri         // Ö-9: bir cümle çevrilemedi
    case okunmayanCeviri   // S4: telefon / arka plan kesintisinde gelen çeviri okunmadı
    case uzunKesinti       // K4: kesinti 10 sn'dir sürüyor; çıkış yolu söylenir
}

/// Ekranda sarı not (uyarı rengi, hata değil).
struct EkranNotu: Identifiable, Equatable {
    let tur: NotTuru
    let metin: String
    var id: NotTuru { tur }
}

/// Ekranların paylaştığı durum: aşama, çeviri oturumu, satırlar, hata ve notlar.
@MainActor
@Observable
final class Durum {
    var ayar: TranslationSession.Configuration?
    var asama: Asama = .duruyor
    var satirlar: [Satir] = []
    var hata: String?
    var notlar: [EkranNotu] = []
    let hat = Hat()

    @ObservationIgnored private var dil = diller[0]
    /// Oturum kimliği (şartname D-1): her Başlat ve Durdur artırır; eski işler yan etki yapmadan çıkar.
    @ObservationIgnored private var kimlik = 0
    @ObservationIgnored private var ceviriHatasi = 0

    /// Duruyor dışındaki her aşama (ana düğme "Durdur" yazar).
    var calisiyor: Bool { asama != .duruyor }

    init() {
        hat.bildir = { [weak self] bildirim in self?.hatBildirdi(bildirim) }
    }

    func dugmeyeBasildi(dil: Dil) {
        kimlik += 1   // hem Başlat hem Durdur eski işi geçersiz kılar (E1)
        #if DEBUG
        if hat.onizlemede {
            asama = calisiyor ? .duruyor : .dinliyor
            return
        }
        #endif
        if calisiyor {
            Tanilama.ortak.kaydet("durdur", "neden=düğme")
            hat.durdur()
            ayar = nil
            asama = .duruyor
            notlar = []
        } else {
            hata = nil
            notlar = []
            ceviriHatasi = 0
            self.dil = dil
            asama = .hazirlaniyor
            Tanilama.ortak.kaydet("başlat", "dil=\(dil.kod)")
            // Bu atama KokEkran'daki translationTask'i tetikler.
            ayar = .init(source: Locale.Language(identifier: dil.kod),
                         target: Locale.Language(identifier: "tr"))
        }
    }

    /// Çeviri oturumu açıkken çalışan ana döngü. Her `await`'ten sonra ve her `translate`'ten
    /// önce kimlik denetlenir: Durdur'dan sonra eski oturum ne mikrofon açar ne çeviri yapar (E1).
    func calistir(_ oturum: TranslationSession) async {
        let benim = kimlik
        await calistirIc(oturum, benim: benim)
        // Q-4: olağan çıkışların hepsi (hataylaBitir, Durdur) kimliği artırır. Oturum hâlâ geçerli ve çalışıyorsa
        // döngü sessizce bitmiştir (akış bitti ya da görev iptal edildi): ekran "Dinliyorum" kalmasın.
        if benim == kimlik, calisiyor {
            hataylaBitir("Çeviri durdu. Dinlemeyi yeniden başlatın.", neden: "hata çeviri döngüsü bitti")
        }
    }

    private func calistirIc(_ oturum: TranslationSession, benim: Int) async {
        let kayit = Tanilama.ortak
        let konusmaDili = dil.konusma
        let kaynakKod = dil.kod

        // G2: dil paketi (yoksa indirir ya da onay ister).
        let paketBasi = Date()
        do {
            try await oturum.prepareTranslation()
        } catch {
            guard gecerli(benim) else { return }
            kayit.kaydet("dil paketi", "hata \(hataKodu(error))", uyari: true)
            hataylaBitir("Dil paketi hazırlanamadı. İnternete bağlanıp yeniden deneyin.", neden: "hata dil paketi")
            return
        }
        guard gecerli(benim) else { return }
        kayit.kaydet("dil paketi", "hazır (\(gecenMs(paketBasi)) ms)")

        // G3: izinler.
        let izin = await Hat.izinler()
        guard gecerli(benim) else { return }
        kayit.kaydet("izin", "mikrofon=\(izin.mikrofon ? "verildi" : "reddedildi") "
                         + "konuşma=\(izin.konusma ? "verildi" : "reddedildi")",
                     uyari: !(izin.mikrofon && izin.konusma))
        guard izin.mikrofon && izin.konusma else {
            hataylaBitir("Mikrofon ve konuşma tanıma izni gerekli (Ayarlar'dan açabilirsiniz).", neden: "izin yok")
            return
        }

        // G5: mikrofon ve tanıma.
        let cumleler: AsyncThrowingStream<String, Error>
        do {
            cumleler = try hat.baslat(konusmaDili: konusmaDili)
        } catch {
            let (mesaj, kod) = Durum.turkce(error)
            hataylaBitir(mesaj, neden: "hata \(kod)")
            return
        }
        asama = .dinliyor

        // Her biten cümle buraya düşer: çevir, ekrana yaz, seslendir.
        // Mikrofon geri açılamazsa akış hatayla biter ve hata ekranda görünür.
        do {
            for try await cumle in cumleler {
                guard gecerli(benim) else { return }   // translate'ten ÖNCE
                let ceviriBasi = Date()
                do {
                    let sonuc = try await oturum.translate(cumle)
                    guard gecerli(benim) else { return }
                    kayit.kaydet("çeviri", "\(gecenMs(ceviriBasi)) ms")
                    ceviriHatasi = 0
                    notKaldir(.ceviri)
                    satirlar.append(Satir(asil: cumle, ceviri: sonuc.targetText, kaynakDil: kaynakKod))
                    hat.seslendir(sonuc.targetText)
                } catch {
                    // Ö-9: tek bir çeviri hatası dinlemeyi durdurmaz; art arda 3 hata durdurur.
                    guard gecerli(benim) else { return }
                    ceviriHatasi += 1
                    kayit.kaydet("çeviri", "hata \(hataKodu(error))", uyari: true)
                    notEkle(.ceviri, "Bir cümle çevrilemedi.")
                    if ceviriHatasi >= ceviriHataSiniri {
                        hataylaBitir("Çeviri art arda yapılamadı. Dinlemeyi yeniden başlatın.", neden: "hata çeviri")
                        return
                    }
                }
            }
        } catch {
            guard gecerli(benim) else { return }
            let (mesaj, kod) = Durum.turkce(error)
            hataylaBitir(mesaj, neden: "hata \(kod)")
        }
    }

    // MARK: Notlar

    func notEkle(_ tur: NotTuru, _ metin: String) {
        let yeni = EkranNotu(tur: tur, metin: metin)
        if let i = notlar.firstIndex(where: { $0.tur == tur }) {
            if notlar[i] != yeni { notlar[i] = yeni }
        } else {
            notlar.append(yeni)
        }
    }

    func notKaldir(_ tur: NotTuru) {
        guard notlar.contains(where: { $0.tur == tur }) else { return }
        notlar.removeAll { $0.tur == tur }
    }

    // MARK: İç işler

    private func gecerli(_ benim: Int) -> Bool {
        benim == kimlik && !Task.isCancelled
    }

    private func hatBildirdi(_ bildirim: HatBildirimi) {
        switch bildirim {
        case .kesintiBasladi(let neden):
            if calisiyor { asama = .kesintide(neden) }
        case .kesintiBitti:
            if calisiyor { asama = .dinliyor }
        case .not(let tur, let metin):
            if let metin { notEkle(tur, metin) } else { notKaldir(tur) }
        case .durdu(let h):
            // Ön-3: aşama hemen "duruyor" olur; kimlik artınca çeviri döngüsü akışın hatasını yeniden işlemez.
            guard calisiyor else { return }
            let (mesaj, kod) = Durum.turkce(h)
            hataylaBitir(mesaj, neden: "hata \(kod)")
        }
    }

    /// Kapatma sırası + ekranda Türkçe hata (G4, G13, G14).
    private func hataylaBitir(_ mesaj: String, neden: String) {
        kimlik += 1
        Tanilama.ortak.kaydet("durdur", "neden=\(neden)", uyari: true)
        hat.durdur()
        ayar = nil
        asama = .duruyor
        notlar = []
        hata = mesaj
    }

    /// Ö-11: sistem hatasını Türkçe, ne yapılacağını söyleyen metne çevirir; kod Tanılama içindir.
    private static func turkce(_ hata: Error) -> (mesaj: String, kod: String) {
        if let h = hata as? HatHatasi { return (h.mesaj, h.kod ?? "hat") }
        let n = hata as NSError
        let kod = "\(n.domain)/\(n.code)"
        // Ön-11, Z-1: ses kodları yalnız ses oturumu ve ses motoru alanlarında eşleşir.
        if SesHatasi.eslesir(hata, .insufficientPriority) {
            return ("Görüşme sürerken dinleme başlatılamaz. Görüşme bitince yeniden deneyin.", kod)
        }
        if SesHatasi.eslesir(hata, .cannotStartRecording) {
            return ("Mikrofon başka bir uygulamada. O uygulamayı kapatıp yeniden başlatın.", kod)
        }
        return ("Dinleme durdu (\(kod)). Yeniden başlatın.", kod)
    }
}
