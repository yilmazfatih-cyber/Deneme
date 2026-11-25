import SwiftUI

/// Çeviri sekmesi: kaynak dil, o an söylenen cümle, son çeviriler ve Başlat/Durdur düğmesi.
struct CeviriEkrani: View {
    let durum: Durum
    @AppStorage(Kayit.kaynakDil) private var kaynakKod = "en"
    @Environment(\.dynamicTypeSize) private var yaziBoyu

    private var dil: Dil { diller.first { $0.kod == kaynakKod } ?? diller[0] }

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
            Picker("Kaynak dil", selection: $kaynakKod) {
                ForEach(diller) { Text($0.ad).tag($0.kod) }
            }
        } label: {
            HStack(spacing: 12) {
                if kompakt {
                    Text("\(dil.ad) → Türkçe")
                        .font(.body.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(dil.ad) → Türkçe")
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
        .accessibilityValue("\(dil.ad), Türkçeye çevrilir")
        .accessibilityHint(durum.calisiyor ? "Dili değiştirmek için önce dinlemeyi durdurun" : "Dil listesini açar")
    }

    // MARK: Şu An

    /// O an söylenen cümle ve en son çeviri.
    private var canliKart: some View {
        Kart("Şu An") {
            asamaSatiri
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)

            if let son = durum.satirlar.last {
                SatirGorunumu(satir: son, buyuk: true)
            } else if durum.asama == .duruyor {
                Text("AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur.")
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
        ForEach(durum.notlar) { not in
            UyariSatiri(metin: not.metin, renk: Renk.sari)
        }
        if let uyari = durum.hat.yolUyarisi {
            UyariSatiri(metin: uyari, renk: Renk.sari)
        }
        kulaklikDurumu
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
