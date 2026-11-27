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
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .accessibilityAddTraits(.isHeader)
            icerik
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }
}

/// Asıl cümle + çevirisi. VoiceOver önce çeviriyi, sonra asıl cümleyi kendi diliyle okur (B-4).
/// Çeviri yoksa (bulut motoru: konuşma zaten hedef dilde ya da çeviri gelmedi) asıl cümle tek başına durur (KR13).
struct SatirGorunumu: View {
    let satir: Satir
    var buyuk = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let etiket = satir.dilEtiketi {
                // KR12: kaynak dil otomatikken sunucunun tanıdığı dil.
                Text(etiket)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Renk.acikMavi)
                    .accessibilitySortPriority(0)
            }
            if satir.ceviri.isEmpty {
                Text(satir.asil)
                    .font(buyuk ? .title2.weight(.semibold) : .body.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)
                    .environment(\.locale, Locale(identifier: satir.kaynakDil))
                    .accessibilitySortPriority(1)
            } else {
                if !satir.asil.isEmpty {
                    Text(satir.asil)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .environment(\.locale, Locale(identifier: satir.kaynakDil))
                        .dynamicTypeSize(...DynamicTypeSize.accessibility3)   // çeviri baskın kalır (tasarim § 4.1.1)
                        .accessibilitySortPriority(0)
                }
                Text(satir.ceviri)
                    .font(buyuk ? .title2.weight(.semibold) : .body.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)   // çeviri her boyutta ölçeklenir, kesilmez
                    .environment(\.locale, Locale(identifier: satir.hedefDil))
                    .accessibilitySortPriority(1)
            }
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

extension View {
    /// C-8: kaydırılan alanın alt 20 pt'si solar; kenarda kesilen satır yarım görünmez.
    @MainActor
    func altSolma() -> some View {
        mask {
            VStack(spacing: 0) {
                Color.black
                LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                    .frame(height: 20)
            }
        }
    }
}

/// VoiceOver duyurusu (tasarim § 5.3). VoiceOver kapalıyken etkisizdir.
@MainActor
func duyur(_ metin: String) {
    UIAccessibility.post(notification: .announcement, argument: metin)
}
