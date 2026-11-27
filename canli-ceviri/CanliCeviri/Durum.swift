import AVFoundation
import SwiftUI
import Translation

/// Çevrilmiş bir cümle: konuşmacının söylediği ve çevirisi.
struct Satir: Identifiable {
    let id = UUID()
    let asil: String
    /// Boş olabilir (bulut motoru): konuşma zaten hedef dildeyse ya da çeviri gelmediyse asıl metin tek başına durur.
    let ceviri: String
    /// Asıl cümlenin dil kodu (VoiceOver'ın doğru dille okuması için).
    var kaynakDil = "en"
    /// Çevirinin dil kodu: cihaz motorunda Türkçe, bulut motorunda seçilen hedef dil (KR13).
    var hedefDil = "tr"
    /// Bulut motorunda kaynak dil "Otomatik" iken sunucunun tanıdığı dilin adı (KR12); yoksa nil.
    var dilEtiketi: String?
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
    case sonDakika         // S03 KR3: günlük ücretsiz sürenin son dakikası
    case bulutKopma        // S02 KR5: bulut bağlantısı koptu; o sırada söylenenler çevrilmedi
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
    let abonelik = Abonelik()
    /// Günlük ücretsiz süre doldu: Çeviri ekranında açıklama (KR2); abone olunca ya da yeni başlatmada kalkar.
    var sinirMetni: String?
    /// Abonelik sayfası açık mı (Çeviri ekranı ve Ayarlar açar).
    var abonelikAcik = false
    /// Bu dinleme bulut motoruyla (Soniox) çalışıyor: Çeviri ekranı sesin Soniox'a gittiğini söyler (S02 K5).
    var bulutCalisiyor = false

    @ObservationIgnored private var dil = diller[0]
    /// Oturum kimliği (şartname D-1): her Başlat ve Durdur artırır; eski işler yan etki yapmadan çıkar.
    @ObservationIgnored private var kimlik = 0
    @ObservationIgnored private var ceviriHatasi = 0
    /// Ücretsiz süre sayacı: saniyede bir bakar, yalnız "dinliyor" aşamasında sayar.
    @ObservationIgnored private var sayacGorevi: Task<Void, Never>?
    @ObservationIgnored private var sonTik = Date()
    /// Süre dolunca çalan çeviri bitene kadar bekleyip hattı kapatan görev (KR2).
    @ObservationIgnored private var kapanisGorevi: Task<Void, Never>?
    /// Bulut motorunun döngüsü (S02); cihaz motorunda nil.
    @ObservationIgnored private var bulutGorevi: Task<Void, Never>?
    /// Bulut motorunda seçilen kaynak dil; nil = otomatik (KR12).
    @ObservationIgnored private var bulutKaynak: String?
    @ObservationIgnored private var bulutHedef = turkceDil

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
            sayaciDurdur()
            hat.durdur()
            bulutuBirak()
            ayar = nil
            asama = .duruyor
            notlar = []
        } else {
            kapanisiBitir()
            if !abonelik.abone && GunlukSure.doldu() {
                Tanilama.ortak.kaydet("sınır", "günlük süre doldu")
                sinirMetni = Durum.sinirAciklamasi
                abonelikAcik = true
                return
            }
            sinirMetni = nil
            hata = nil
            notlar = []
            ceviriHatasi = 0
            self.dil = dil
            asama = .hazirlaniyor
            if Anahtarlik.motor == .bulut {
                bulutuBaslat()   // Apple çeviri oturumu gerekmez (S02 KR4)
            } else {
                Tanilama.ortak.kaydet("başlat", "dil=\(dil.kod)")
                // Bu atama KokEkran'daki translationTask'i tetikler.
                ayar = .init(source: Locale.Language(identifier: dil.kod),
                             target: Locale.Language(identifier: "tr"))
            }
        }
    }

    // MARK: Bulut motoru (S02)

    /// Kaynak ve hedef dili ayarlardan okur, bulut döngüsünü başlatır. `.translationTask`'e bağlı değildir.
    private func bulutuBaslat() {
        let varsayilanlar = UserDefaults.standard
        let secilen = varsayilanlar.string(forKey: Kayit.bulutKaynak) ?? otomatikDil
        // Listede olmayan değer ("otomatik" dahil) dilin kendiliğinden tanınması demektir (KR12).
        let kaynak = bulutDilleri.first { $0.kod == secilen }?.kod
        let hedefKod = varsayilanlar.string(forKey: Kayit.hedefDil) ?? "tr"
        let hedef = bulutDilleri.first { $0.kod == hedefKod } ?? turkceDil
        bulutKaynak = kaynak
        bulutHedef = hedef
        bulutCalisiyor = true
        Tanilama.ortak.kaydet("başlat", "dil=\(kaynak ?? otomatikDil) motor=bulut hedef=\(hedef.kod)")
        let benim = kimlik
        bulutGorevi = Task { [weak self] in
            guard let self else { return }
            await self.calistirBulut(kaynak: kaynak, hedef: hedef, benim: benim)
        }
    }

    /// Bulut motorunun döngüsü: yalnız mikrofon izni ister (KR4), hattı bulut akışıyla başlatır ve dinlemenin
    /// bitişini bekler. Kapanan cümleler `hatBildirdi` üzerinden gelir.
    private func calistirBulut(kaynak: String?, hedef: BulutDili, benim: Int) async {
        let kayit = Tanilama.ortak
        let mikrofon = await Hat.mikrofonIzni()
        guard gecerli(benim) else { return }
        kayit.kaydet("izin", "mikrofon=\(mikrofon ? "verildi" : "reddedildi")", uyari: !mikrofon)
        guard mikrofon else {
            hataylaBitir("Mikrofon izni gerekli (Ayarlar'dan açabilirsiniz).", neden: "izin yok")
            return
        }
        // Anahtar yalnız Anahtar Zinciri'nden (ya da yapıdan) okunur ve yalnız bağlantı isteğine verilir (K5).
        let anahtar = Anahtarlik.gecerliSonioxAnahtari
        guard !anahtar.isEmpty else {
            hataylaBitir("Soniox anahtarı okunamadı. Ayarlar'dan anahtarı yeniden girin ya da cihaz motoruna geçin.",
                         neden: "hata bulut anahtar yok")
            return
        }
        let bitis: AsyncThrowingStream<String, Error>
        do {
            bitis = try hat.baslatBulut(kaynak: kaynak, hedef: hedef, anahtar: anahtar)
        } catch {
            let (mesaj, kod) = Durum.turkce(error)
            hataylaBitir(mesaj, neden: "hata \(kod)")
            return
        }
        // Aşama "hazırlanıyor" kalır; akış başlayınca `Hat` bildirir ve "dinliyor" olur (K6).
        sayaciBaslat()
        do {
            for try await _ in bitis {}
        } catch {
            guard gecerli(benim) else { return }
            let (mesaj, kod) = Durum.turkce(error)
            hataylaBitir(mesaj, neden: "hata \(kod)")
            return
        }
        if benim == kimlik, calisiyor {
            hataylaBitir("Çeviri durdu. Dinlemeyi yeniden başlatın.", neden: "hata bulut akışı bitti")
        }
    }

    /// Bulut motorunda kapanan cümle: ekrana yazılır; sesli okuma açıksa sıraya girer (KR2, KR11).
    private func bulutCumlesiGeldi(_ cumle: SonioxCumle) {
        let kayit = Tanilama.ortak
        let kaynakKod = cumle.dil ?? bulutKaynak ?? "und"
        // KR12: kaynak dil otomatikse satır, sunucunun tanıdığı dilin adını taşır.
        let etiket: String? = bulutKaynak == nil ? cumle.dil.map { dilAdi($0) } : nil
        if cumle.ceviri.isEmpty {
            // KR13: çeviri gelmediyse (ör. konuşma zaten hedef dilde) asıl metin tek başına gösterilir.
            guard !cumle.asil.isEmpty else { return }
            kayit.kaydet("çeviri", cumle.ceviriBeklendi ? "bulut gelmedi" : "bulut yok (konuşma hedef dilde)",
                         uyari: cumle.ceviriBeklendi)
            satirlar.append(Satir(asil: cumle.asil, ceviri: "", kaynakDil: kaynakKod, hedefDil: bulutHedef.kod,
                                  dilEtiketi: etiket))
            return
        }
        kayit.kaydet("çeviri", "bulut \(cumle.beklemeMs) ms")
        satirlar.append(Satir(asil: cumle.asil, ceviri: cumle.ceviri, kaynakDil: kaynakKod, hedefDil: bulutHedef.kod,
                              dilEtiketi: etiket))
        if Hat.sesliOku { hat.seslendir(cumle.ceviri) }
    }

    /// Bulut döngüsünü bırakır (Durdur, hata, süre sınırı). Cihaz motorunda etkisizdir.
    private func bulutuBirak() {
        bulutGorevi?.cancel()
        bulutGorevi = nil
        if bulutCalisiyor { bulutCalisiyor = false }
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
        sayaciBaslat()

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
                    if Hat.sesliOku { hat.seslendir(sonuc.targetText) }   // KR11: sesli okuma isteğe bağlı
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

    // MARK: Günlük ücretsiz süre (S03)

    static let sinirAciklamasi =
        "Bugünkü 10 dakikalık ücretsiz süre doldu. Yarın yeniden kullanabilir ya da abone olabilirsiniz."

    private func sayaciBaslat() {
        sayacGorevi?.cancel()
        sonTik = Date()
        sayacGorevi = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, !Task.isCancelled else { return }
                self.sureyiSay()
            }
        }
    }

    private func sayaciDurdur() {
        sayacGorevi?.cancel()
        sayacGorevi = nil
    }

    /// Son tikten bu yana geçen süreyi, aşama "dinliyor" ise ve abone değilse bugünün toplamına ekler.
    private func sureyiSay() {
        let simdi = Date()
        let gecen = min(max(simdi.timeIntervalSince(sonTik), 0), 2)
        sonTik = simdi
        guard asama == .dinliyor else { return }
        guard !abonelik.abone else {
            notKaldir(.sonDakika)
            return
        }
        let kalan = gunlukUcretsizSure - GunlukSure.ekle(gecen, simdi)
        if kalan <= 0 {
            sureDoldu()
        } else if kalan <= sonDakikaEsigi {
            notEkle(.sonDakika, "Bugünkü ücretsiz sürenin son dakikası.")
        }
    }

    /// KR2: yeni cümle alınmaz, çalan çeviri bitirilir, sonra mikrofon kapanır; ekran ne olduğunu söyler.
    private func sureDoldu() {
        kimlik += 1   // çeviri döngüsü yeni cümle çevirmez
        sayaciDurdur()
        Tanilama.ortak.kaydet("sınır", "günlük süre doldu")
        Tanilama.ortak.kaydet("durdur", "neden=günlük süre")
        ayar = nil
        asama = .duruyor
        notlar = []
        // Bulut motorunda ses buluta gitmeyi hemen keser; çalan çeviri yine bitirilir.
        hat.bulutuKapat()
        bulutuBirak()
        sinirMetni = Durum.sinirAciklamasi
        abonelikAcik = true
        kapanisGorevi = Task { [weak self] in
            // Sigorta: en çok 20 sn beklenir (Alania süresi + okuma).
            for _ in 0..<80 {
                guard let self, !Task.isCancelled else { return }
                if !self.hat.sesSuruyor { break }
                try? await Task.sleep(for: .milliseconds(250))
            }
            guard let self, !Task.isCancelled else { return }
            self.hat.durdur()
            self.kapanisGorevi = nil
        }
    }

    /// Bekleyen kapanış varsa hattı hemen kapatır (yeni Başlat'tan önce).
    private func kapanisiBitir() {
        guard let gorev = kapanisGorevi else { return }
        gorev.cancel()
        kapanisGorevi = nil
        hat.durdur()
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
        case .bulutCumlesi(let cumle):
            guard calisiyor, bulutCalisiyor else { return }
            bulutCumlesiGeldi(cumle)
        }
    }

    /// Kapatma sırası + ekranda Türkçe hata (G4, G13, G14).
    private func hataylaBitir(_ mesaj: String, neden: String) {
        kimlik += 1
        Tanilama.ortak.kaydet("durdur", "neden=\(neden)", uyari: true)
        sayaciDurdur()
        kapanisiBitir()
        hat.durdur()
        bulutuBirak()
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
