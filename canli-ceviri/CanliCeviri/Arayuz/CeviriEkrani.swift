import SwiftUI

/// Çeviri sekmesi: konuşulan dil ve çeviri dili düğmeleri, o an söylenen cümle, son çeviriler ve Başlat/Durdur
/// düğmesi.
struct CeviriEkrani: View {
    let durum: Durum
    @AppStorage(Kayit.kaynakDil) private var kaynakKod = "en"
    /// Bulut motorunda kaynak dil; varsayılan "Otomatik" (KR12).
    @AppStorage(Kayit.bulutKaynak) private var bulutKaynak = otomatikDil
    @AppStorage(Kayit.hedefDil) private var hedefKod = "tr"
    @AppStorage(Kayit.motor) private var motorKaydi = ""
    @AppStorage(Kayit.cihazSecildi) private var cihazSecildi = false
    @AppStorage(Kayit.sesliOku) private var sesliOku = false
    /// Bulut motorunda son seçilen kaynak diller (virgülle ayrılmış kodlar); dil şeridinin kısa listesi için.
    @AppStorage(Kayit.sonKaynaklar) private var sonKaynaklar = ""
    /// Bulut motorunun tüm dillerini gösteren aranabilir sayfa açık mı.
    @State private var tumDillerAcik = false
    /// Çeviri dili sayfası (aranabilir liste) açık mı; Ayarlar'daki "Çeviri dili" satırıyla aynı ayar.
    @State private var hedefAcik = false

    private var dil: Dil { diller.first { $0.kod == kaynakKod } ?? diller[0] }

    /// Dinlerken o dinlemenin motoru; duruyorken seçili motor (ne anahtar ne sunucu varsa cihaz; karar
    /// `Anahtarlik`'tadır). `motorKaydi` ve `cihazSecildi` seçim değişince ekran yenilensin diye okunur.
    private var bulutMotoru: Bool {
        if durum.calisiyor { return durum.bulutCalisiyor }
        if CeviriEkrani.ornekBulut() { return true }
        if motorKaydi == Motor.cihaz.rawValue && cihazSecildi { return false }
        return Anahtarlik.motor == .bulut
    }

    /// `-ekran ceviri-diller-buyuk-yazi`: simülatörde anahtar yokken de bulut motorunun dil düğmeleri görünür
    /// (yalnız DEBUG).
    @MainActor
    private static func ornekBulut() -> Bool {
        #if DEBUG
        if OrnekEkran.gosterilen == .ceviriDiller { return true }
        #endif
        return false
    }

    /// Kaynak dilin ekrandaki adı: bulut motorunda "Otomatik" olabilir; cihaz motorunda tek bir dildir.
    private var kaynakAd: String {
        guard bulutMotoru else { return dil.ad }
        return bulutDilleri.first { $0.kod == bulutKaynak }?.ad ?? "Otomatik"
    }

    /// Çeviri dili: cihaz motorunda Türkçe, bulut motorunda seçilen dil (KR13).
    private var hedefAd: String {
        bulutMotoru ? dilAdi(hedefKod) : turkceDil.ad
    }

    /// Çeviri dili yalnız bulut motorunda ve dinleme dururken değiştirilebilir.
    private var hedefSecilebilir: Bool {
        bulutMotoru && !durum.calisiyor
    }

    private var hedefIpucu: String {
        if !bulutMotoru { return "Çeviri yalnız Türkçeye yapılır" }
        return durum.calisiyor ? "Değiştirmek için dinlemeyi durdurun" : "Dil listesini açar"
    }

    /// Kaynak dil menüsünün kısa listesi (bulut motoru): seçili dil, son kullanılanlar, sonra sık kullanılan birkaç dil;
    /// en çok beş tane. Öteki diller "Tüm diller…" sayfasındadır (60 dil bir menüye sığmaz).
    private var kisaListe: [BulutDili] {
        var adaylar = [bulutKaynak]
        adaylar += sonKaynaklar.split(separator: ",").map { String($0) }
        adaylar += ["en", "de", "fr", "es", "ar", "ru"]
        var secilenler: [BulutDili] = []
        for kod in adaylar {
            guard secilenler.count < 5, !secilenler.contains(where: { $0.kod == kod }),
                  let dil = bulutDilleri.first(where: { $0.kod == kod }) else { continue }
            secilenler.append(dil)
        }
        return secilenler
    }

    /// Kaynak dili seçer ve son kullanılanların başına yazar (en çok dört dil tutulur).
    private func kaynagiSec(_ kod: String) {
        bulutKaynak = kod
        guard kod != otomatikDil else { return }
        let oncekiler = sonKaynaklar.split(separator: ",").map { String($0) }.filter { $0 != kod }
        sonKaynaklar = ([kod] + oncekiler).prefix(4).joined(separator: ",")
    }

    /// Menü satırı: seçili olanın yanında onay işareti.
    @ViewBuilder
    private func menuSatiri(_ ad: String, secili: Bool) -> some View {
        if secili {
            Label(ad, systemImage: "checkmark")
        } else {
            Text(ad)
        }
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
        .onAppear {
            durum.hat.yoluYenile()   // KR11: sesli okuma ayarı değişmiş olabilir
            #if DEBUG
            // `-ekran dil-secimi`: dil sayfası açık başlar (yalnız simülatör görüntüsü ve önizleme).
            if OrnekEkran.gosterilen == .dilSecimi { tumDillerAcik = true }
            #endif
        }
        .sheet(isPresented: $tumDillerAcik) {
            DilSecimEkrani(baslik: "Konuşulan dil", diller: bulutDilleri, otomatik: true, secili: $bulutKaynak,
                           secildi: { kod in kaynagiSec(kod) })
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Renk.zemin)
                .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $hedefAcik) {
            DilSecimEkrani(baslik: "Çeviri dili", diller: hedefDilleri, secili: $hedefKod)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Renk.zemin)
                .preferredColorScheme(.dark)
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

    // MARK: Dil düğmeleri

    /// İki ayrı düğme (S03 tur 2): solda konuşulan dil, ortada ok, sağda çeviri dili. Yan yana sığmıyorsa (büyük
    /// yazı, uzun dil adı) alt alta geçer; metin kesilmez. Dinamik Yazı en çok xxxLarge (tasarim § 4.1.1: sınırsız
    /// ölçeklenen yalnız çeviri metnidir). İkincil görünümlüdür; ekranın tek birincil eylemi Başlat/Durdur kalır.
    /// Dinlerken ikisi de devre dışıdır: süren akışın dili değişmez (KR7).
    private var dilSeridi: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                kaynakDugmesi(yanYana: true)
                Image(systemName: "arrow.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                hedefDugmesi(yanYana: true)
            }
            VStack(spacing: 8) {
                kaynakDugmesi(yanYana: false)
                hedefDugmesi(yanYana: false)
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    /// Konuşulan dil. Bulut motoru: "Otomatik", kısa liste ve tüm dilleri açan aranabilir sayfa; cihaz motoru: 7 dil.
    private func kaynakDugmesi(yanYana: Bool) -> some View {
        let secilebilir = !durum.calisiyor
        return Menu {
            if bulutMotoru {
                // KR12: bulut motoru dili kendiliğinden tanıyabilir; cihaz motorunda "Otomatik" yoktur.
                // 60 dil menüye sığmaz: "Otomatik", kısa liste ve tümünü açan aranabilir sayfa.
                Button {
                    kaynagiSec(otomatikDil)
                } label: {
                    menuSatiri("Otomatik", secili: !bulutDilleri.contains(where: { $0.kod == bulutKaynak }))
                }
                ForEach(kisaListe) { secenek in
                    Button {
                        kaynagiSec(secenek.kod)
                    } label: {
                        menuSatiri(secenek.ad, secili: secenek.kod == bulutKaynak)
                    }
                }
                Divider()
                Button {
                    tumDillerAcik = true
                } label: {
                    Label("Tüm diller…", systemImage: "list.bullet")
                }
            } else {
                Picker("Konuşulan dil", selection: $kaynakKod) {
                    ForEach(diller) { Text($0.ad).tag($0.kod) }
                }
            }
        } label: {
            dilDugmesi(kaynak: true, yanYana: yanYana, secilebilir: secilebilir)
        }
        .disabled(!secilebilir)
        .accessibilityLabel("Konuşulan dil")
        .accessibilityValue(kaynakAd)
        .accessibilityHint(secilebilir ? "Dil listesini açar" : "Değiştirmek için dinlemeyi durdurun")
    }

    /// Çeviri dili: bulut motorunda aranabilir dil sayfasını açar (Ayarlar'daki satırla aynı ayar). Cihaz motoru
    /// yalnız Türkçeye çevirir; orada düğme "Türkçe" yazar ve devre dışıdır.
    private func hedefDugmesi(yanYana: Bool) -> some View {
        Button {
            hedefAcik = true
        } label: {
            dilDugmesi(kaynak: false, yanYana: yanYana, secilebilir: hedefSecilebilir)
        }
        .buttonStyle(DilDugmesiBicemi())
        .disabled(!hedefSecilebilir)
        .accessibilityLabel("Çeviri dili")
        .accessibilityValue(hedefAd)
        .accessibilityHint(hedefIpucu)
    }

    /// Düğmenin görünümü: küçük üst etiket, dilin adı ve (seçilebiliyorsa) aşağı ok; en az 56 pt yüksek.
    /// Yan yana düzende iki düğmenin yazı alanı eşit genişliktedir (ötekinin yazısı görünmez kopya olarak
    /// ölçüye girer): `ViewThatFits` yan yana düzeni yalnız iki yazı da kesilmeden sığıyorsa seçer.
    private func dilDugmesi(kaynak: Bool, yanYana: Bool, secilebilir: Bool) -> some View {
        HStack(spacing: 8) {
            ZStack(alignment: .leading) {
                if yanYana {
                    dilYazilari(kaynak: !kaynak, tekSatir: true)
                        .hidden()
                }
                dilYazilari(kaynak: kaynak, tekSatir: yanYana)
            }
            Spacer(minLength: 0)
            if secilebilir {
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Renk.acikMavi)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Renk.ayrac, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// Düğmenin yazıları: "Konuşulan dil" / "Çeviri dili" etiketi ve altında dilin adı. Tek satırda kesilmez
    /// (sığmazsa düzen alt alta geçer); alt alta düzende gerekirse alt satıra iner.
    private func dilYazilari(kaynak: Bool, tekSatir: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(kaynak ? "Konuşulan dil" : "Çeviri dili")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Text(kaynak ? kaynakAd : hedefAd)
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
        }
        .lineLimit(tekSatir ? 1 : nil)
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: tekSatir, vertical: true)
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
                Text(bosDurumMetni)
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

    /// Hiç çeviri yokken "Şu An" kartındaki metin. Abonelik yoksa bunu dürüstçe söyler (yalnız ücretli; S02 tur 3):
    /// alttaki düğme o durumda fiyat ekranını açar. KR11: sesli okuma kapalıyken kulaklık gerekmez.
    private var bosDurumMetni: String {
        if durum.abonelikGerekli && durum.abonelik.durumOkundu {
            return "Çeviri için abonelik gerekir. Aşağıdaki düğme abonelik sayfasını açar."
        }
        if sesliOku {
            return "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur."
        }
        return "Aşağıdaki düğmeye dokunun. Çeviri ekrana yazılır."
    }

    private var anaDugmeIpucu: String {
        if durum.calisiyor { return "Dinlemeyi ve okumayı durdurur" }
        if durum.abonelikGerekli && durum.abonelik.durumOkundu { return "Abonelik gerekir; abonelik sayfasını açar" }
        return "Karşınızdakini dinlemeye ve çevirmeye başlar"
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

    /// Haftalık kotada 10 dakikadan az kaldı (S03): tek sarı not. Kalan süre yalnız sunucu bildirdiyse bilinir.
    /// Ekranda hata varken (ör. "kotanız doldu") ve abonelik yokken gösterilmez.
    private var kotaAz: Bool {
        durum.hata == nil && !durum.abonelikGerekli && Kota.ortak.azKaldi
    }

    /// Hata (açık kırmızı), sarı notlar, ses yolu uyarısı ve kulaklık durumu.
    @ViewBuilder
    private var durumSatirlari: some View {
        if let hata = durum.hata {
            UyariSatiri(metin: hata, renk: Renk.acikKirmizi)
        }
        if let not = durum.abonelikNotu, durum.abonelikGerekli {
            UyariSatiri(metin: not, renk: Renk.sari)
        }
        ForEach(durum.notlar) { not in
            UyariSatiri(metin: not.metin, renk: Renk.sari)
        }
        if kotaAz {
            UyariSatiri(metin: Kota.azMetni, renk: Renk.sari)
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
        .accessibilityHint(anaDugmeIpucu)
        .accessibilityAddTraits(calisiyor ? [] : .startsMediaSession)
        .sensoryFeedback(.impact, trigger: calisiyor)
    }
}

/// Dil düğmesinin biçemi: basılıyken hafifçe solar; devre dışıyken solmaz (tasarim C-5: devre dışı olduğu okun
/// yokluğundan ve VoiceOver'ın "soluk" demesinden anlaşılır, solgunluk bilgi taşımaz).
private struct DilDugmesiBicemi: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}
