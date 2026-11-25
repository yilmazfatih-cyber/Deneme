import SwiftUI
import UIKit

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
            Text(baslik)
                .font(.title2.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            icerik
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }
}

/// Asıl cümle + Türkçesi. VoiceOver önce çeviriyi (Türkçe), sonra asıl cümleyi kendi diliyle okur (B-4).
struct SatirGorunumu: View {
    let satir: Satir
    var buyuk = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(satir.asil)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .environment(\.locale, Locale(identifier: satir.kaynakDil))
                .accessibilitySortPriority(0)
            Text(satir.ceviri)
                .font(buyuk ? .title2.weight(.semibold) : .body.weight(.medium))
                .accessibilitySortPriority(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

/// Simge + metin biçiminde uyarı satırı (sarı not, hata). Renk tek başına bilgi taşımaz: simge ve metin var.
struct UyariSatiri: View {
    let metin: String
    let renk: Color

    var body: some View {
        Label {
            Text(metin)
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill").accessibilityHidden(true)
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(renk)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }
}

/// VoiceOver duyurusu (tasarim § 5.3). VoiceOver kapalıyken etkisizdir.
@MainActor
func duyur(_ metin: String) {
    UIAccessibility.post(notification: .announcement, argument: metin)
}
