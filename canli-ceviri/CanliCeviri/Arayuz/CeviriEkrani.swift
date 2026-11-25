import SwiftUI

/// Çeviri sekmesi: kaynak dil, o an söylenen cümle, son çeviriler ve Başlat/Durdur düğmesi.
struct CeviriEkrani: View {
    let durum: Durum
    @AppStorage(Kayit.kaynakDil) private var kaynakKod = "en"

    private var dil: Dil { diller.first { $0.kod == kaynakKod } ?? diller[0] }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    baslik
                    dilSeridi
                    canliKart
                    if durum.satirlar.count > 1 { oncekilerKarti }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 20)
            }
            altDugme
        }
    }

    private var baslik: some View {
        HStack(spacing: 10) {
            Image(systemName: "waveform")
                .font(.title.weight(.bold))
                .foregroundStyle(Renk.acikMavi)
            Text("Canlı Çeviri")
                .font(.largeTitle.weight(.bold))
            Spacer()
            if durum.calisiyor {
                Label("CANLI", systemImage: "dot.radiowaves.left.and.right")
                    .font(.footnote.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Renk.mavi, in: Capsule())
            }
        }
    }

    // Kaynak dil seçimi
    private var dilSeridi: some View {
        Menu {
            Picker("Kaynak dil", selection: $kaynakKod) {
                ForEach(diller) { Text($0.ad).tag($0.kod) }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(dil.ad) → Türkçe")
                        .font(.title2.weight(.semibold))
                    Text(durum.calisiyor ? "Dili değiştirmek için önce durdurun"
                                         : "Kaynak dili değiştirmek için dokunun")
                        .font(.subheadline)
                        .opacity(0.85)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.title3.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(20)
            .background(
                LinearGradient(colors: [Renk.mavi, Renk.koyuMavi],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 24, style: .continuous)
            )
        }
        .disabled(durum.calisiyor)
    }

    // O an söylenen cümle ve en son çeviri
    private var canliKart: some View {
        Kart("Şu An") {
            if !durum.hat.canliMetin.isEmpty {
                Text(durum.hat.canliMetin)
                    .font(.subheadline)
                    .italic()
                    .foregroundStyle(Renk.acikMavi)
            } else if durum.calisiyor {
                Label("Dinliyorum…", systemImage: "ear")
                    .font(.subheadline)
                    .foregroundStyle(Renk.acikMavi)
            }

            if let son = durum.satirlar.last {
                SatirGorunumu(satir: son, buyuk: true)
            } else if !durum.calisiyor {
                Text("AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // Sondan önceki birkaç çeviri
    private var oncekilerKarti: some View {
        Kart("Öncekiler") {
            let onceki = durum.satirlar.dropLast().suffix(3).reversed()
            ForEach(Array(onceki)) { satir in
                SatirGorunumu(satir: satir)
                if satir.id != onceki.last?.id {
                    Divider().overlay(Color.white.opacity(0.1))
                }
            }
        }
    }

    // Uygulama AirPods için: çevirinin okunacağı kulaklık düğmenin hemen üstünde görünür.
    private var kulaklikDurumu: some View {
        let ad = durum.hat.kulaklik
        let metin: String = ad.map { "\($0) bağlı" } ?? "AirPods bağlı değil. Çeviriyi duymak için AirPods'u takın."
        return Label(metin, systemImage: ad == nil ? "exclamationmark.triangle.fill" : "airpods")
            .font(.footnote.weight(.medium))
            .foregroundStyle(ad == nil ? Renk.sari : Renk.acikMavi)
            .multilineTextAlignment(.center)
    }

    private var altDugme: some View {
        VStack(spacing: 10) {
            if let hata = durum.hata {
                Text(hata)
                    .font(.footnote)
                    .foregroundStyle(Renk.kirmizi)
                    .multilineTextAlignment(.center)
            }
            kulaklikDurumu
            Button {
                durum.dugmeyeBasildi(dil: dil)
            } label: {
                Label(durum.calisiyor ? "Durdur" : "Dinlemeyi Başlat",
                      systemImage: durum.calisiyor ? "stop.fill" : "mic.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 62)
                    .background(durum.calisiyor ? Renk.kirmizi : Renk.mavi,
                                in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .sensoryFeedback(.impact, trigger: durum.calisiyor)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}
