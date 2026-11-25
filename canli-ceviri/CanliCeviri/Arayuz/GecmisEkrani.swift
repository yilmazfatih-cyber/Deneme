import SwiftUI

/// Geçmiş sekmesi: bu oturumda çevrilen tüm cümleler, en yenisi üstte.
struct GecmisEkrani: View {
    let durum: Durum
    @State private var silmeSor = false
    @ScaledMetric(relativeTo: .largeTitle) private var bosSimge: CGFloat = 54

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Geçmiş")
                        .font(.largeTitle.weight(.bold))
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    if !durum.satirlar.isEmpty {
                        Button {
                            silmeSor = true
                        } label: {
                            Text("Temizle")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Renk.maviMetin)
                                .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Geçmişi temizle")
                        .accessibilityHint("Bu oturumdaki tüm çevirileri siler")
                    }
                }
                .frame(minHeight: 44)

                if durum.satirlar.isEmpty {
                    VStack(spacing: 14) {
                        Image(systemName: "text.bubble")
                            .font(.system(size: bosSimge))
                            .foregroundStyle(Renk.acikMavi)
                            .accessibilityHidden(true)
                        Text("Henüz çeviri yok")
                            .font(.title3.weight(.semibold))
                        Text("Çevrilen cümleler burada listelenir.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 120)
                    .accessibilityElement(children: .combine)
                } else {
                    ForEach(durum.satirlar.reversed()) { satir in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(satir.saat, style: .time)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Renk.acikMavi)
                                .accessibilitySortPriority(2)
                            SatirGorunumu(satir: satir)
                        }
                        .padding(18)
                        .background(Renk.kart,
                                    in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .accessibilityElement(children: .contain)
                    }
                }

                Text("Geçmiş uygulama kapanınca silinir.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
        .confirmationDialog("Geçmiş silinsin mi?", isPresented: $silmeSor, titleVisibility: .visible) {
            Button("Geçmişi sil", role: .destructive) { durum.satirlar.removeAll() }
            Button("Vazgeç", role: .cancel) {}
        }
    }
}
