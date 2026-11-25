import StoreKit
import SwiftUI

/// Abonelik sayfası (alttan açılır): ne kazandırdığı, App Store'dan okunan fiyat, satın alma, geri yükleme,
/// koşullar ve gizlilik bağlantıları. Abone ise durum ve "Aboneliği yönet".
struct AbonelikEkrani: View {
    let abonelik: Abonelik
    @Environment(\.dismiss) private var kapat
    @Environment(\.purchase) private var satinAlma
    @ScaledMetric(relativeTo: .title3) private var simgeSutunu: CGFloat = 30

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Sınırsız çeviri")
                    .font(.largeTitle.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)

                if abonelik.abone {
                    etkinKarti
                } else {
                    maddeler
                    fiyatSatiri
                    if let ileti = abonelik.ileti {
                        UyariSatiri(metin: ileti, renk: Renk.sari)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    aboneOlDugmesi
                    ikincilDugme("Satın alımları geri yükle", ipucu: "Daha önce alınan aboneliği bu telefona getirir") {
                        Task { await abonelik.geriYukle() }
                    }
                    .disabled(abonelik.yukleniyor)
                    Text("Abonelik haftalık yenilenir. İstediğiniz zaman Ayarlar → Apple Kimliği → Abonelikler'den iptal edebilirsiniz.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 0) {
                    baglanti("Kullanım Koşulları", Adres.kosullar)
                    baglanti("Gizlilik Politikası", Adres.gizlilik)
                }

                ikincilDugme("Kapat", ipucu: "Abonelik sayfasını kapatır") { kapat() }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 20)
        }
        .task {
            if abonelik.fiyat == nil && !abonelik.yukleniyor { await abonelik.urunuYukle() }
        }
    }

    private var maddeler: some View {
        VStack(alignment: .leading, spacing: 14) {
            madde("infinity", "Sınırsız dinleme süresi")
            madde("gift.fill", "Her gün 10 dakika ücretsiz kullanım devam eder")
            madde("calendar", "İstediğiniz zaman iptal")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func madde(_ simge: String, _ metin: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: simge)
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: simgeSutunu)
                .accessibilityHidden(true)
            Text(metin)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Fiyat yalnız App Store'dan gelir; yoksa yükleniyor ya da yüklenemedi denir.
    @ViewBuilder
    private var fiyatSatiri: some View {
        if let fiyat = abonelik.fiyat {
            Text("\(fiyat) / hafta")
                .font(.title2.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Fiyat: haftada \(fiyat)")
        } else if abonelik.yukleniyor || !abonelik.urunYuklenemedi {
            HStack(spacing: 10) {
                ProgressView()
                Text("Fiyat yükleniyor…").font(.subheadline)
            }
            .foregroundStyle(.secondary)
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                UyariSatiri(metin: "Fiyat yüklenemedi. İnternet bağlantınızı denetleyip yeniden deneyin.", renk: Renk.sari)
                    .fixedSize(horizontal: false, vertical: true)
                ikincilDugme("Yeniden dene", ipucu: "Fiyatı App Store'dan yeniden yükler") {
                    Task { await abonelik.urunuYukle() }
                }
            }
        }
    }

    private var aboneOlDugmesi: some View {
        Button {
            Task { await abonelik.satinAl(ile: satinAlma) }
        } label: {
            HStack(spacing: 10) {
                if abonelik.yukleniyor { ProgressView().tint(.white) }
                Text("Abone ol")
            }
            .font(.title3.weight(.semibold))
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 62)
            .padding(.vertical, 2)
            .background(Renk.maviDolgu, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .disabled(abonelik.fiyat == nil || abonelik.yukleniyor)
        .opacity(abonelik.fiyat == nil ? 0.5 : 1)
        .accessibilityLabel("Abone ol")
        .accessibilityHint(aboneOlIpucu)
    }

    private var aboneOlIpucu: String {
        guard let fiyat = abonelik.fiyat else { return "Fiyat yüklenemedi" }
        return "Haftalık yenilenen abonelik, haftada \(fiyat)"
    }

    private var etkinKarti: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label {
                Text("Aboneliğiniz etkin.")
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Renk.acikMavi)
                    .accessibilityHidden(true)
            }
            .font(.title3.weight(.semibold))
            baglanti("Aboneliği yönet", Adres.abonelikleriYonet)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func ikincilDugme(_ baslik: String, ipucu: String, _ eylem: @escaping @MainActor () -> Void) -> some View {
        Button(action: eylem) {
            Text(baslik)
                .font(.body.weight(.semibold))
                .foregroundStyle(Renk.maviMetin)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(baslik)
        .accessibilityHint(ipucu)
    }

    private func baglanti(_ baslik: String, _ adres: URL) -> some View {
        Link(destination: adres) {
            HStack(spacing: 8) {
                Text(baslik)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.right")
                    .font(.footnote.weight(.bold))
                    .accessibilityHidden(true)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Renk.maviMetin)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(baslik)
        .accessibilityHint("Safari'de açar")
    }
}
