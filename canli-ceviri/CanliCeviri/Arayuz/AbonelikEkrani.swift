import StoreKit
import SwiftUI

/// Fiyat ekranı (alttan açılır; S02 tur 3): uygulamanın yaptıkları, tek paket (haftalık; fiyat App Store'dan okunur),
/// satın alma, yenileme ve iptal bilgisi, geri yükleme, koşullar ve gizlilik bağlantıları, sağ üstte Kapat.
/// Bunlar App Review'un abonelik ekranı şartlarıdır; hiçbiri kaldırılmaz. Fiyat koda yazılmaz.
/// Abone ise durum ve "Aboneliği yönet" gösterilir.
struct AbonelikEkrani: View {
    let abonelik: Abonelik
    @Environment(\.dismiss) private var kapat
    @Environment(\.purchase) private var satinAlma
    @ScaledMetric(relativeTo: .title3) private var simgeSutunu: CGFloat = 30

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer(minLength: 0)
                kapatDugmesi
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)

            // Kaydırılabilir: en büyük Dinamik Yazı'da da hiçbir metin kesilmez.
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
                        paketKarti
                        if let ileti = abonelik.ileti {
                            UyariSatiri(metin: ileti, renk: Renk.sari)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        aboneOlDugmesi
                        Text("Haftalık yenilenir. İstediğiniz zaman iptal edebilirsiniz.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        ikincilDugme("Satın alımları geri yükle", ipucu: "Daha önce alınan aboneliği bu telefona getirir") {
                            Task { await abonelik.geriYukle() }
                        }
                        .disabled(abonelik.yukleniyor)
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        baglanti("Kullanım Koşulları", Adres.kosullar)
                        baglanti("Gizlilik Politikası", Adres.gizlilik)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 20)
            }
        }
        .task {
            if abonelik.fiyat == nil && !abonelik.yukleniyor { await abonelik.urunuYukle() }
        }
    }

    /// Sağ üstte, en az 44 pt.
    private var kapatDugmesi: some View {
        Button {
            kapat()
        } label: {
            Text("Kapat")
                .font(.subheadline.weight(.semibold))
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .foregroundStyle(Renk.maviMetin)
                .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Kapat")
        .accessibilityHint("Abonelik sayfasını kapatır")
    }

    /// Bulut motoru etkin mi: yarar satırları uygulamanın o yapıda gerçekten yaptığını yazar.
    @MainActor
    private static func bulutEtkin() -> Bool {
        #if DEBUG
        // `-ekran abonelik`: simülatörde anahtar yokken de müşteri yapısındaki (bulut) metinler görünür.
        if OrnekEkran.gosterilen == .abonelik { return true }
        #endif
        return Anahtarlik.motor == .bulut
    }

    /// Uygulamanın yaptıkları: kısa, abartısız. Dil sayıları listelerden gelir.
    private var maddeler: some View {
        let bulut = AbonelikEkrani.bulutEtkin()
        return VStack(alignment: .leading, spacing: 14) {
            madde("infinity", "Sınırsız çeviri süresi")
            if bulut {
                madde("globe", "\(bulutDilleri.count) dilden istediğiniz dile")
                madde("ear", "Dili kendiliğinden tanır")
            } else {
                madde("globe", "\(diller.count) dilden Türkçeye")
            }
            madde("nosign", "Reklam yok")
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

    /// Tek paket: haftalık. Fiyat yalnız App Store'dan gelir.
    private var paketKarti: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Haftalık")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            fiyatSatiri
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Renk.maviMetin, lineWidth: 2))
    }

    /// Ürün yüklenene dek ilerleme göstergesi; yüklenemezse açıklama ve "Yeniden dene".
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
                Text("Fiyat şu an yüklenemedi.")
                    .font(.subheadline)
                    .foregroundStyle(Renk.sari)
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
            baglanti("Aboneliği yönet", Adres.abonelikleriYonet, ipucu: "Apple'ın abonelik sayfasını açar")
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

    private func baglanti(_ baslik: String, _ adres: URL, ipucu: String = "Safari'de açar") -> some View {
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
        .accessibilityHint(ipucu)
    }
}
