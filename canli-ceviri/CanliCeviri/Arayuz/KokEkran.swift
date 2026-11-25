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

/// Arka plan, açık sekme ve alttaki sekme çubuğu. Çeviri oturumu da burada açılır.
struct KokEkran: View {
    @State private var durum: Durum
    @State private var sekme: Sekme

    /// Parametreler önizlemeler içindir; uygulama `KokEkran()` ile açılır.
    init(durum: Durum? = nil, sekme: Sekme = .ceviri) {
        _durum = State(initialValue: durum ?? Durum())
        _sekme = State(initialValue: sekme)
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
            case .ayarlar: AyarlarEkrani()
            }
        }
        .safeAreaInset(edge: .bottom) {
            SekmeCubugu(secili: $sekme)
        }
        // Apple'ın çeviri oturumu yalnızca bu yolla alınabiliyor.
        // `ayar` dolunca çalışır, nil olunca iptal edilir.
        .translationTask(durum.ayar) { oturum in
            await durum.calistir(oturum)
        }
    }
}

/// Altta yüzen, kapsül biçimli sekme çubuğu.
struct SekmeCubugu: View {
    @Binding var secili: Sekme

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Sekme.allCases, id: \.self) { s in
                Button {
                    secili = s
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: s.simge).font(.system(size: 21, weight: .semibold))
                        Text(s.ad).font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .foregroundStyle(secili == s ? Renk.mavi : Color.white)
                    .background(secili == s ? Renk.alan : Color.clear, in: Capsule())
                    .contentShape(Capsule())   // simgenin çevresine dokunmak da sekmeyi açsın
                }
                .accessibilityAddTraits(secili == s ? .isSelected : [])
            }
        }
        .padding(6)
        .background(Renk.kart, in: Capsule())
        .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
        .padding(.horizontal, 28)
        .padding(.bottom, 4)
    }
}
