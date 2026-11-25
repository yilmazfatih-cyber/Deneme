import SwiftUI
import UIKit

/// Tanılama sayfası (tasarim § 4.4): olay kaydı, Kopyala (birincil) ve Temizle.
/// Ayarlar'daki "Tanılama kaydı" satırından alttan açılan sayfa olarak gösterilir.
struct TanilamaEkrani: View {
    @Environment(\.dismiss) private var kapat
    @Environment(\.dynamicTypeSize) private var yaziBoyu
    @ScaledMetric(relativeTo: .largeTitle) private var bosSimge: CGFloat = 54
    @State private var kopyalandi = false
    @State private var kopyaSayaci = 0
    @State private var silmeSor = false
    @AccessibilityFocusState private var baslikOdakta: Bool

    private var kayit: Tanilama { Tanilama.ortak }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            baslikSatiri
            Text("Kayıt yalnızca bu telefonda, uygulama açıkken tutulur; konuşma ve çeviri metni içermez.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 20)
                .padding(.top, 8)

            ScrollView {
                if kayit.olaylar.isEmpty {
                    bosDurum
                } else {
                    liste
                }
            }
            .altSolma()

            altBlok
        }
        .onAppear { baslikOdakta = true }
        .task(id: kopyaSayaci) {
            guard kopyaSayaci > 0 else { return }
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            kopyalandi = false
        }
        .confirmationDialog("Kayıt silinsin mi?", isPresented: $silmeSor, titleVisibility: .visible) {
            Button("Kaydı sil", role: .destructive) {
                kayit.temizle()
                duyur("Kayıt temizlendi")
            }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Kayıttaki \(kayit.olaylar.count) olay silinir.")
        }
    }

    private var baslikSatiri: some View {
        HStack {
            Text("Tanılama")
                .font(.largeTitle.weight(.bold))
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($baslikOdakta)
            Spacer()
            Button {
                kapat()
            } label: {
                Text("Bitti")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Renk.maviMetin)
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .accessibilityHint("Tanılama ekranını kapatır")
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private var bosDurum: some View {
        VStack(spacing: 14) {
            Image(systemName: "list.bullet.clipboard")
                .font(.system(size: min(bosSimge, 96)))
                .foregroundStyle(Renk.acikMavi)
                .accessibilityHidden(true)
            Text("Henüz olay yok")
                .font(.title3.weight(.semibold))
            Text("Dinlemeyi başlattığınızda olaylar burada görünür.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 120)
        .padding(.horizontal, 20)
        .accessibilityElement(children: .combine)
    }

    /// En yeni üstte (ekran "ne oldu" için); kopya eskiden yeniye.
    private var liste: some View {
        let olaylar = Array(kayit.olaylar.reversed())
        return VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                ForEach(Array(olaylar.enumerated()), id: \.element.id) { sira, olay in
                    if sira > 0 {
                        Divider().overlay(Renk.ayrac)
                    }
                    satir(olay)
                }
            }
            .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            if olaylar.count >= tanilamaSiniri {
                Text("Son \(tanilamaSiniri) olay gösteriliyor.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 16)
    }

    private func satir(_ olay: TanilamaOlayi) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if yaziBoyu.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    olayAdi(olay)
                    saat(olay)
                }
            } else {
                HStack(alignment: .firstTextBaseline) {
                    olayAdi(olay)
                    Spacer(minLength: 8)
                    saat(olay)
                }
            }
            if !olay.ayrinti.isEmpty {
                Text(olay.ayrinti)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(olay.uyari ? "Uyarı: " : "")\(olay.ad), saat "
                + Tanilama.saat(olay.zaman).replacingOccurrences(of: ":", with: " ")
        )
        .accessibilityValue(olay.ayrinti)
    }

    private func olayAdi(_ olay: TanilamaOlayi) -> some View {
        HStack(spacing: 6) {
            if olay.uyari {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Renk.sari)
            }
            Text(olay.ad)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
        }
    }

    private func saat(_ olay: TanilamaOlayi) -> some View {
        Text(Tanilama.saat(olay.zaman))
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
    }

    private var altBlok: some View {
        VStack(spacing: 8) {
            Button {
                UIPasteboard.general.string = kayit.metin
                kopyalandi = true
                kopyaSayaci += 1
                duyur("Kayıt panoya kopyalandı")
            } label: {
                Label(kopyalandi ? "Kopyalandı" : "Kopyala",
                      systemImage: kopyalandi ? "checkmark" : "doc.on.doc")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 62)
                    .padding(.vertical, 2)
                    .background(Renk.maviDolgu, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .accessibilityLabel(kopyalandi ? "Kopyalandı" : "Kopyala")
            .accessibilityHint("Olay kaydını panoya düz metin olarak kopyalar")
            .sensoryFeedback(.success, trigger: kopyaSayaci)

            Button {
                silmeSor = true
            } label: {
                Label("Temizle", systemImage: "trash")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(kayit.olaylar.isEmpty ? AnyShapeStyle(.secondary) : AnyShapeStyle(Renk.maviMetin))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .disabled(kayit.olaylar.isEmpty)
            .accessibilityLabel("Kaydı temizle")
            .accessibilityHint("Tanılama olaylarını siler")
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }
}
