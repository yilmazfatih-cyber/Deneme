import SwiftUI

/// Ayarlar sekmesi: Alania-2 anahtarı, ses seçimi ve kısa açıklama.
struct AyarlarEkrani: View {
    @AppStorage(Kayit.alaniaAnahtari) private var anahtar = ""
    @AppStorage(Kayit.alaniaSesi) private var ses = "alania2-f1"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ayarlar").font(.largeTitle.weight(.bold))

                bolumBasligi("ALANIA-2 API ANAHTARI")
                VStack(alignment: .leading, spacing: 12) {
                    SecureField("pd_live_…", text: $anahtar)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
                    Text("Boş bırakırsanız çeviri Apple'ın Türkçe sesiyle okunur. Anahtar yalnızca bu telefonda saklanır.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("SES")
                Picker("Ses", selection: $ses) {
                    Text("Kadın").tag("alania2-f1")
                    Text("Erkek").tag("alania2-oncel")
                }
                .pickerStyle(.segmented)
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("NASIL ÇALIŞIR")
                VStack(alignment: .leading, spacing: 14) {
                    bilgiSatiri("mic.fill", "iPhone mikrofonu karşınızdakini dinler")
                    bilgiSatiri("character.bubble.fill", "Konuşma cihazda Türkçeye çevrilir")
                    bilgiSatiri("airpods", "Çeviri AirPods'tan okunur")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
    }

    private func bolumBasligi(_ metin: String) -> some View {
        Text(metin)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.top, 10)
    }

    private func bilgiSatiri(_ simge: String, _ metin: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: simge)
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: 30)
            Text(metin).font(.subheadline)
        }
    }
}
