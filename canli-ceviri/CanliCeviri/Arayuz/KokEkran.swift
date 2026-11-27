import SwiftUI
import Translation

enum Sekme: CaseIterable {
    case ceviri, gecmis, ayarlar

    var ad: String {
        switch self {
        case .ceviri:  "Çeviri"
        case .gecmis:  "Geçmiş"
        case .ayarlar: "Ayarlar"
        }
    }
    var simge: String {
        switch self {
        case .ceviri:  "waveform"
        case .gecmis:  "clock.fill"
        case .ayarlar: "gearshape.fill"
        }
    }
}

/// Arka plan, açık sekme, alttaki sekme çubuğu ve Tanılama sayfası. Çeviri oturumu ve VoiceOver duyuruları da burada.
struct KokEkran: View {
    /// Uygulama boyunca tek örnek; `CeviriApp` oluşturur (Ön-5).
    @Bindable var durum: Durum
    @State private var sekme: Sekme
    @State private var tanilamaAcik: Bool

    init(durum: Durum, sekme: Sekme = .ceviri, tanilamaAcik: Bool = false) {
        _durum = Bindable(durum)
        _sekme = State(initialValue: sekme)
        _tanilamaAcik = State(initialValue: tanilamaAcik)
    }

    var body: some View {
        ZStack {
            Renk.zemin
            RadialGradient(colors: [Renk.parilti, .clear],
                           center: .center, startRadius: 0, endRadius: 420)
        }
        .ignoresSafeArea()
        .overlay {
            switch sekme {
            case .ceviri:  CeviriEkrani(durum: durum)
            case .gecmis:  GecmisEkrani(durum: durum)
            case .ayarlar: AyarlarEkrani(durum: durum, tanilamaAcik: $tanilamaAcik)
            }
        }
        .safeAreaInset(edge: .bottom) {
            SekmeCubugu(secili: $sekme)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)   // C-4: @ScaledMetric sınırı yalnız çağrı yerinde görür
        }
        // Apple'ın çeviri oturumu yalnızca bu yolla alınabiliyor (cihaz motoru). Bulut motoru buna bağlı değildir:
        // `ayar` boş kalır, döngüyü `Durum` kendi başlatır (S02 KR4).
        // `ayar` dolunca çalışır; Durdur'dan sonra eski oturum Durum'daki kimlik denetimiyle durur.
        .translationTask(durum.ayar) { oturum in
            await durum.calistir(oturum)
        }
        // Fiyat ekranı ilk açılışta bir kez gösterilir (abonede, deneme yapısında ve önizlemede gösterilmez).
        .task {
            await durum.ilkAcilis()
        }
        .sheet(isPresented: $tanilamaAcik) {
            TanilamaEkrani(onizleme: durum.hat.onizlemede)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Renk.zemin)
                .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $durum.abonelikAcik) {
            AbonelikEkrani(abonelik: durum.abonelik)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Renk.zemin)
                .preferredColorScheme(.dark)
        }
        // Durum değişimleri VoiceOver'a duyurulur (B-5, tasarim § 5.3).
        .onChange(of: durum.asama) { eski, yeni in
            asamaDegisti(eski, yeni)
        }
        .onChange(of: durum.hata) { _, yeni in
            if let yeni { duyur(yeni) }
        }
        .onChange(of: durum.abonelikNotu) { _, yeni in
            if let yeni { duyur(yeni) }
        }
        // S03: haftalık kotada 10 dakikadan az kalınca bir kez duyurulur.
        .onChange(of: Kota.ortak.azKaldi) { _, az in
            if az { duyur(Kota.azMetni) }
        }
        // C-7: yalnız yeni eklenen ya da metni değişen sarı not duyurulur.
        .onChange(of: durum.notlar) { eski, yeni in
            for not in yeni where !eski.contains(not) {
                duyur(not.metin)
            }
        }
        .onChange(of: durum.hat.kulaklik) { eski, yeni in
            // KR11: sesli okuma kapalıyken kulaklık durumu duyurulmaz.
            guard Hat.sesliOku, (eski == nil) != (yeni == nil) else { return }
            duyur(yeni == nil ? "Kulaklık bağlantısı koptu" : "Kulaklık bağlandı")
        }
        .onChange(of: durum.satirlar.count) { eski, yeni in
            guard yeni > eski, let son = durum.satirlar.last else { return }
            duyur(son.ceviri.isEmpty ? son.asil : son.ceviri)
        }
    }

    private func asamaDegisti(_ eski: Asama, _ yeni: Asama) {
        switch yeni {
        case .dinliyor:
            if case .kesintide = eski {
                duyur("Dinleme sürüyor")
            } else {
                duyur("Dinleme başladı")
            }
        case .kesintide:
            if let metin = yeni.duraklatmaMetni { duyur(metin) }
        case .duruyor:
            if durum.hata == nil { duyur("Dinleme durdu") }
        case .hazirlaniyor:
            duyur("Hazırlanıyor")
        }
    }
}

/// Altta yüzen, kapsül biçimli sekme çubuğu.
struct SekmeCubugu: View {
    @Binding var secili: Sekme
    @ScaledMetric(relativeTo: .body) private var simgeBoyu: CGFloat = 21

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Sekme.allCases, id: \.self) { s in
                Button {
                    secili = s
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: s.simge)
                            .font(.system(size: min(simgeBoyu, 28), weight: .semibold))
                            .accessibilityHidden(true)
                        Text(s.ad).font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .foregroundStyle(secili == s ? Renk.maviMetin : Color.white)
                    .background(secili == s ? Renk.alan : Color.clear, in: Capsule())
                    .contentShape(Capsule())   // simgenin çevresine dokunmak da sekmeyi açsın
                }
                .accessibilityLabel(s.ad)
                .accessibilityAddTraits(secili == s ? .isSelected : [])
            }
        }
        .padding(6)
        .background(Renk.kart, in: Capsule())
        .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
        .padding(.horizontal, 28)
        .padding(.bottom, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sekmeler")
    }
}
