import SwiftUI

/// Aranabilir dil listesi (S02 tur 2): bulut motorunun 60 dili bir açılır menüye sığmadığı için alttan açılan sayfa.
/// Çeviri ekranı kaynak dil için ("Otomatik" başta), Ayarlar çeviri dili için (Türkçe başta) kullanır.
/// Bir dile dokunmak seçer ve sayfayı kapatır.
struct DilSecimEkrani: View {
    let baslik: String
    let diller: [BulutDili]
    /// Listenin başında "Otomatik" satırı olsun mu (yalnız kaynak dil; KR12).
    let otomatik: Bool
    /// Seçili dilin kodu (ya da `otomatikDil`).
    @Binding var secili: String
    /// Seçimden sonra çağrılır (ör. son kullanılanlara eklemek için).
    let secildi: (String) -> Void

    @Environment(\.dismiss) private var kapat
    @State private var arama = ""
    @AccessibilityFocusState private var baslikOdakta: Bool

    init(baslik: String, diller: [BulutDili], otomatik: Bool = false, secili: Binding<String>,
         secildi: @escaping (String) -> Void = { _ in }) {
        self.baslik = baslik
        self.diller = diller
        self.otomatik = otomatik
        _secili = secili
        self.secildi = secildi
    }

    private var aranan: String {
        arama.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Ada göre süzer: büyük-küçük harf ve Türkçe işaretler (ç, ş, ö…) ayırt edilmez. Dil kodu da aranabilir.
    private var suzulen: [BulutDili] {
        let metin = aranan
        guard !metin.isEmpty else { return diller }
        let turkce = Locale(identifier: "tr_TR")
        return diller.filter { dil in
            dil.kod == metin.lowercased()
                || dil.ad.range(of: metin, options: [.caseInsensitive, .diacriticInsensitive], locale: turkce) != nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            baslikSatiri
            aramaAlani
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if otomatik && aranan.isEmpty {
                        satir("Otomatik", otomatikDil)
                        Divider().overlay(Renk.ayrac)
                    }
                    let bulunan = suzulen
                    ForEach(bulunan) { dil in
                        satir(dil.ad, dil.kod)
                        if dil.id != bulunan.last?.id {
                            Divider().overlay(Renk.ayrac)
                        }
                    }
                    if bulunan.isEmpty {
                        Text("Bu adla bir dil bulunamadı.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 4)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            .altSolma()
        }
        .onAppear { baslikOdakta = true }
    }

    private var baslikSatiri: some View {
        HStack {
            Text(baslik)
                .font(.largeTitle.weight(.bold))
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($baslikOdakta)
            Spacer(minLength: 8)
            Button {
                kapat()
            } label: {
                Text("Bitti")
                    .font(.subheadline.weight(.semibold))
                    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                    .foregroundStyle(Renk.maviMetin)
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .accessibilityHint("Dil listesini kapatır")
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    /// Arama alanı. Sistem yer tutucusu soluk kaldığı için boşken üstüne .secondary metin bindirilir (C-6).
    private var aramaAlani: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            ZStack(alignment: .leading) {
                TextField("", text: $arama)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .accessibilityLabel("Dil ara")
                    .accessibilityHint("Yazdıkça liste süzülür")
                if arama.isEmpty {
                    Text("Dil ara")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            if !arama.isEmpty {
                Button {
                    arama = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Aramayı temizle")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 52)
        .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.18), lineWidth: 1))
    }

    /// Bir dil satırı: en az 52 pt yüksek, tüm genişlikte dokunulur; ad kesilmez, gerekirse alt satıra iner.
    private func satir(_ ad: String, _ kod: String) -> some View {
        let seciliMi = secili == kod
        return Button {
            secili = kod
            secildi(kod)
            kapat()
        } label: {
            HStack(spacing: 12) {
                Text(ad)
                    .font(.body)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if seciliMi {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.bold))
                        .foregroundStyle(Renk.acikMavi)
                        .accessibilityHidden(true)
                }
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ad)
        .accessibilityAddTraits(seciliMi ? .isSelected : [])
    }
}
