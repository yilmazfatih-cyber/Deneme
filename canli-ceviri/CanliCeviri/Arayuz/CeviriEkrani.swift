import SwiftUI

/// Çeviri sekmesi: kaynak dil, o an söylenen cümle, son çeviriler ve Başlat/Durdur düğmesi.
struct CeviriEkrani: View {
    let durum: Durum
    @AppStorage(Kayit.kaynakDil) private var kaynakKod = "en"
    /// Bulut motorunda kaynak dil; varsayılan "Otomatik" (KR12).
    @AppStorage(Kayit.bulutKaynak) private var bulutKaynak = otomatikDil
    @AppStorage(Kayit.hedefDil) private var hedefKod = "tr"
    @AppStorage(Kayit.motor) private var motorKaydi = ""
    @AppStorage(Kayit.sesliOku) private var sesliOku = false
    @Environment(\.dynamicTypeSize) private var yaziBoyu

    private var dil: Dil { diller.first { $0.kod == kaynakKod } ?? diller[0] }

    /// Dinlerken o dinlemenin motoru; duruyorken seçili motor (anahtar yoksa cihaz; karar `Anahtarlik`'tadır).
    private var bulutMotoru: Bool {
        if durum.calisiyor { return durum.bulutCalisiyor }
        return motorKaydi == Motor.cihaz.rawValue ? false : Anahtarlik.motor == .bulut
    }

    /// Kaynak dilin ekrandaki adı: bulut motorunda "Otomatik" olabilir; cihaz motorunda tek bir dildir.
    private var kaynakAd: String {
        guard bulutMotoru else { return dil.ad }
        return bulutDilleri.first { $0.kod == bulutKaynak }?.ad ?? "Otomatik"
    }

    /// Çeviri dili: cihaz motorunda Türkçe, bulut motorunda Ayarlar'da seçilen dil (KR13).
    private var hedefAd: String {
        bulutMotoru ? dilAdi(hedefKod) : "Türkçe"
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    baslik
                    dilSeridi
                    canliKart
                    if durum.satirlar.count > 1 { oncekilerKarti }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 20)
            }
            .altSolma()
            altBlok
        }
        .onAppear { durum.hat.yoluYenile() }   // KR11: sesli okuma ayarı değişmiş olabilir
    }

    // MARK: Başlık

    /// Her boyutta tek satır; Dinamik Yazı en çok xxxLarge (tasarim § 4.1.1).
    private var baslik: some View {
        HStack(spacing: 10) {
            baslikMetni
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 8)
            if durum.asama.canli { canliRozeti }
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private var baslikMetni: some View {
        HStack(spacing: 10) {
            Image(systemName: "waveform")
                .font(.title.weight(.bold))
                .foregroundStyle(Renk.acikMavi)
                .accessibilityHidden(true)
            Text("Canlı Çeviri")
                .font(.largeTitle.weight(.bold))
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// Yalnız aşama "dinliyor" iken görünür (KR3).
    private var canliRozeti: some View {
        Label("CANLI", systemImage: "dot.radiowaves.left.and.right")
            .font(.footnote.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Renk.maviDolgu, in: Capsule())
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Dinleme açık")
    }

    // MARK: Dil şeridi

    /// Duruyorken tam şerit; diğer aşamalarda ve büyük yazıda tek satırlık, 56 yüksekliğinde kompakt şerit (KR7).
    /// Yalnız dinlerken devre dışıdır; büyük yazıda kompakt şerit dokunulabilir kalır (tasarim § 4.1.1).
    private var dilSeridi: some View {
        let kompakt = durum.calisiyor || yaziBoyu >= .xxxLarge
        return Menu {
            if bulutMotoru {
                // KR12: bulut motoru dili kendiliğinden tanıyabilir; cihaz motorunda "Otomatik" yoktur.
                Picker("Kaynak dil", selection: $bulutKaynak) {
                    Text("Otomatik").tag(otomatikDil)
                    ForEach(bulutDilleri) { Text($0.ad).tag($0.kod) }
                }
            } else {
                Picker("Kaynak dil", selection: $kaynakKod) {
                    ForEach(diller) { Text($0.ad).tag($0.kod) }
                }
            }
        } label: {
            HStack(spacing: 12) {
                if kompakt {
                    Text("\(kaynakAd) → \(hedefAd)")
                        .font(.body.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(kaynakAd) → \(hedefAd)")
                            .font(.title2.weight(.semibold))
                        Text("Kaynak dili değiştirmek için dokunun")
                            .font(.subheadline)
                    }
                    .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                if !durum.calisiyor {
                    Image(systemName: "chevron.right")
                        .font(.title3.weight(.bold))
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, kompakt ? 8 : 20)
            .frame(minHeight: kompakt ? 56 : nil)
            .background(
                LinearGradient(colors: [Renk.maviDolgu, Renk.koyuMavi],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 24, style: .continuous)
            )
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        }
        .disabled(durum.calisiyor)
        .accessibilityLabel("Kaynak dil")
        .accessibilityValue("\(kaynakAd), \(yonelme(hedefAd)) çevrilir")
        .accessibilityHint(durum.calisiyor ? "Dili değiştirmek için önce dinlemeyi durdurun" : "Dil listesini açar")
    }

    // MARK: Şu An

    /// O an söylenen cümle ve en son çeviri.
    private var canliKart: some View {
        Kart("Şu An") {
            asamaSatiri
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)

            // Bulut motoru: çeviri cümle bitmeden akar (S02). Cihaz motorunda `canliCeviri` hep boştur.
            if durum.asama.canli, !durum.hat.canliCeviri.isEmpty {
                Text(durum.hat.canliCeviri)
                    .font(.title3.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .environment(\.locale, Locale(identifier: hedefKod))
                    .accessibilityLabel("Çeviri: \(durum.hat.canliCeviri)")
                if !durum.satirlar.isEmpty {
                    Divider().overlay(Renk.ayrac)
                }
            }

            if let son = durum.satirlar.last {
                SatirGorunumu(satir: son, buyuk: true)
            } else if durum.asama == .duruyor {
                // KR11: sesli okuma kapalıyken kulaklık gerekmez.
                Text(sesliOku ? "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur."
                              : "Aşağıdaki düğmeye dokunun. Çeviri ekrana yazılır.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Aşamaya göre tek satır: "Hazırlanıyor…", "Dinliyorum…" ya da canlı metin, "Duraklatıldı: …" (KR3).
    @ViewBuilder
    private var asamaSatiri: some View {
        switch durum.asama {
        case .duruyor:
            EmptyView()
        case .hazirlaniyor:
            Label("Hazırlanıyor…", systemImage: "hourglass")
                .font(.subheadline)
                .foregroundStyle(Renk.acikMavi)
        case .dinliyor:
            if durum.hat.canliMetin.isEmpty {
                Label("Dinliyorum…", systemImage: "ear")
                    .font(.subheadline)
                    .foregroundStyle(Renk.acikMavi)
                    .accessibilityLabel("Dinliyorum")
            } else {
                Text(durum.hat.canliMetin)
                    .font(.subheadline)
                    .italic()
                    .foregroundStyle(Renk.acikMavi)
                    .environment(\.locale, Locale(identifier: dil.kod))
                    .accessibilityLabel("Duyulan: \(durum.hat.canliMetin)")
            }
        case .kesintide:
            Label(durum.asama.duraklatmaMetni ?? "Duraklatıldı", systemImage: "pause.circle.fill")
                .font(.subheadline)
                .foregroundStyle(Renk.sari)
        }
    }

    /// Sondan önceki birkaç çeviri.
    private var oncekilerKarti: some View {
        Kart("Öncekiler") {
            let onceki = durum.satirlar.dropLast().suffix(3).reversed()
            ForEach(Array(onceki)) { satir in
                SatirGorunumu(satir: satir)
                if satir.id != onceki.last?.id {
                    Divider().overlay(Renk.ayrac)
                }
            }
        }
    }

    // MARK: Alt blok

    private var altBlok: some View {
        VStack(spacing: 10) {
            // C-3: durum satırları her boyutta altta sabit kalır (ilke 5: hata kaydırmayla bulunmaz).
            Group { durumSatirlari }
                .lineLimit(3)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            anaDugme
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// Hata (açık kırmızı), sarı notlar, ses yolu uyarısı ve kulaklık durumu.
    @ViewBuilder
    private var durumSatirlari: some View {
        if let hata = durum.hata {
            UyariSatiri(metin: hata, renk: Renk.acikKirmizi)
        }
        if let sinir = durum.sinirMetni, !durum.abonelik.abone {
            UyariSatiri(metin: sinir, renk: Renk.sari)
        }
        ForEach(durum.notlar) { not in
            UyariSatiri(metin: not.metin, renk: Renk.sari)
        }
        if let uyari = durum.hat.yolUyarisi {
            UyariSatiri(metin: uyari, renk: Renk.sari)
        }
        if durum.bulutCalisiyor {
            bulutBildirimi
        }
        // KR11: kulaklık durumu yalnız sesli okuma açıkken gösterilir; kapalıyken kulaklık yokluğu uyarı değildir.
        if sesliOku {
            kulaklikDurumu
        }
    }

    /// S02 K5: bulut motoruyla dinlerken sesin Soniox'a gittiği ekranda yazar (uyarı değil, bilgi).
    private var bulutBildirimi: some View {
        Label("Ses, tanıma ve çeviri için Soniox'a gönderiliyor.", systemImage: "cloud.fill")
            .font(.footnote.weight(.medium))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Ses, tanıma ve çeviri için Soniox'a gönderiliyor")
    }

    // Uygulama AirPods için: çevirinin okunacağı kulaklık düğmenin hemen üstünde görünür.
    private var kulaklikDurumu: some View {
        let ad = durum.hat.kulaklik
        let metin: String = ad.map { "\($0) bağlı" } ?? "AirPods bağlı değil. Çeviriyi duymak için AirPods'u takın."
        return Label(metin, systemImage: ad == nil ? "exclamationmark.triangle.fill" : "airpods")
            .font(.footnote.weight(.medium))
            .foregroundStyle(ad == nil ? Renk.sari : Renk.acikMavi)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ad.map { "Kulaklık: \($0) bağlı" }
                                ?? "Kulaklık bağlı değil. Çeviriyi duymak için AirPods'u takın")
    }

    private var anaDugme: some View {
        let calisiyor = durum.calisiyor
        return Button {
            durum.dugmeyeBasildi(dil: dil)
        } label: {
            Label(calisiyor ? "Durdur" : "Dinlemeyi Başlat",
                  systemImage: calisiyor ? "stop.fill" : "mic.fill")
                .font(.title3.weight(.semibold))
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 62)
                .padding(.vertical, 2)
                .background(calisiyor ? Renk.kirmiziDolgu : Renk.maviDolgu,
                            in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .accessibilityLabel(calisiyor ? "Durdur" : "Dinlemeyi başlat")
        .accessibilityHint(calisiyor ? "Dinlemeyi ve okumayı durdurur"
                                     : "Karşınızdakini dinlemeye ve çevirmeye başlar")
        .accessibilityAddTraits(calisiyor ? [] : .startsMediaSession)
        .sensoryFeedback(.impact, trigger: calisiyor)
    }
}
