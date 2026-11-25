import SwiftUI

/// Ayarlar sekmesi: Alania-2 anahtarı, ses seçimi, kısa açıklama ve Tanılama kaydı.
struct AyarlarEkrani: View {
    @Binding var tanilamaAcik: Bool
    /// Anahtar Anahtar Zinciri'nde durur (K5); bu alan yalnız ekrandaki kopyasıdır.
    @State private var anahtar = ""
    @State private var anahtarOkundu = false
    @AppStorage(Kayit.alaniaSesi) private var ses = "alania2-f1"
    @ScaledMetric(relativeTo: .title3) private var simgeSutunu: CGFloat = 30

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ayarlar")
                    .font(.largeTitle.weight(.bold))
                    .accessibilityAddTraits(.isHeader)

                bolumBasligi("Alania-2 API anahtarı")
                VStack(alignment: .leading, spacing: 12) {
                    SecureField("pd_live_…", text: $anahtar)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.18), lineWidth: 1))
                        .accessibilityLabel("Alania-2 API anahtarı")
                        .accessibilityValue(anahtar.isEmpty ? "Boş" : "Girildi")
                        .accessibilityHint("Boş bırakırsanız çeviri Apple'ın Türkçe sesiyle okunur")
                    Text("Boş bırakırsanız çeviri Apple'ın Türkçe sesiyle okunur. Anahtar yalnızca bu telefonda, güvenli biçimde saklanır.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Ses")
                Picker("Okuma sesi", selection: $ses) {
                    Text("Kadın").tag("alania2-f1")
                    Text("Erkek").tag("alania2-oncel")
                }
                .pickerStyle(.segmented)
                .controlSize(.large)
                .accessibilityLabel("Okuma sesi")
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Nasıl çalışır")
                VStack(alignment: .leading, spacing: 14) {
                    bilgiSatiri("mic.fill", "iPhone mikrofonu karşınızdakini dinler")
                    bilgiSatiri("character.bubble.fill", "Konuşma cihazda Türkçeye çevrilir")
                    bilgiSatiri("airpods", "Çeviri AirPods'tan okunur")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Tanılama")
                tanilamaSatiri
                    .padding(.horizontal, 18)
                    .padding(.vertical, 6)
                    .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
        .onAppear {
            guard !anahtarOkundu else { return }
            anahtar = Anahtarlik.alaniaAnahtari
            anahtarOkundu = true
        }
        .onChange(of: anahtar) {
            guard anahtarOkundu else { return }
            Anahtarlik.alaniaAnahtari = anahtar
        }
    }

    /// Başlık metni küçük harfle yazılır, büyük harfle gösterilir (VoiceOver harf harf okumasın, B-21).
    private func bolumBasligi(_ metin: String) -> some View {
        Text(metin)
            .textCase(.uppercase)
            .environment(\.locale, Locale(identifier: "tr_TR"))
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.top, 10)
            .accessibilityAddTraits(.isHeader)
    }

    private func bilgiSatiri(_ simge: String, _ metin: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: simge)
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: simgeSutunu)
                .accessibilityHidden(true)
            Text(metin).font(.subheadline)
        }
    }

    private var tanilamaSatiri: some View {
        let sayi = Tanilama.ortak.olaylar.count
        return Button {
            tanilamaAcik = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "waveform.path.ecg")
                    .font(.title3)
                    .foregroundStyle(Renk.acikMavi)
                    .frame(width: simgeSutunu)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tanılama kaydı")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                    Text(sayi == 0 ? "Henüz olay yok" : "\(sayi) olay · yalnız bu telefonda")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Tanılama kaydı")
        .accessibilityValue(sayi == 0 ? "Henüz olay yok" : "\(sayi) olay")
        .accessibilityHint("Sorun bildirmek için olay kaydını açar")
        .accessibilityAddTraits(.isButton)
    }
}
