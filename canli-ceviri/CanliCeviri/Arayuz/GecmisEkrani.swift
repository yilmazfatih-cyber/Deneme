import SwiftUI

/// Geçmiş sekmesi: bu oturumda çevrilen tüm cümleler, en yenisi üstte.
struct GecmisEkrani: View {
    let durum: Durum

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Geçmiş").font(.largeTitle.weight(.bold))
                    Spacer()
                    if !durum.satirlar.isEmpty {
                        Button("Temizle") { durum.satirlar.removeAll() }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Renk.mavi)
                    }
                }

                if durum.satirlar.isEmpty {
                    VStack(spacing: 14) {
                        Image(systemName: "text.bubble")
                            .font(.system(size: 54))
                            .foregroundStyle(Renk.acikMavi)
                        Text("Henüz çeviri yok")
                            .font(.title3.weight(.semibold))
                        Text("Çevrilen cümleler burada listelenir.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 120)
                } else {
                    ForEach(durum.satirlar.reversed()) { satir in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(satir.saat, style: .time)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Renk.acikMavi)
                            SatirGorunumu(satir: satir)
                        }
                        .padding(18)
                        .background(Renk.kart,
                                    in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
    }
}
