import SwiftUI

/// Başlıklı, yuvarlak köşeli kart.
struct Kart<Icerik: View>: View {
    let baslik: String
    let icerik: Icerik

    init(_ baslik: String, @ViewBuilder icerik: () -> Icerik) {
        self.baslik = baslik
        self.icerik = icerik()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(baslik).font(.title2.weight(.semibold))
            icerik
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }
}

/// Asıl cümle + Türkçesi
struct SatirGorunumu: View {
    let satir: Satir
    var buyuk = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(satir.asil)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(satir.ceviri)
                .font(buyuk ? .title2.weight(.semibold) : .body.weight(.medium))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
