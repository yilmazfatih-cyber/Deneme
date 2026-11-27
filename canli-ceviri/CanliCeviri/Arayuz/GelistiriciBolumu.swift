import SwiftUI

/// Tanılama sayfasının altındaki "Geliştirici" bölümü (S02 tur 3). Müşterinin Ayarlar'da görmediği her şey buradadır:
/// çeviri motoru seçimi, Soniox anahtarı (ve "gömülü" yazısı), veri kullanımı notu, Alania-2 anahtarı ve okuma sesi.
/// Buraya yalnız Ayarlar'daki sürüm satırına uzun basarak (ya da VoiceOver eylemiyle) ulaşılır.
/// Anahtarlar Anahtar Zinciri'nde durur; alanlar yalnız ekrandaki kopyalarıdır. Gömülü anahtar hiçbir yerde gösterilmez.
struct GelistiriciBolumu: View {
    /// Önizleme kipinde (simülatör görüntüsü) Anahtar Zinciri'ne yazılmaz.
    let onizleme: Bool
    @State private var okundu = false
    @State private var alaniaAnahtar = ""
    /// Q-8: son okunan ya da yazılan değer; alan buna eşitse Anahtar Zinciri'ne yeniden yazılmaz.
    @State private var sonAlania = ""
    @State private var sonioxAnahtar = ""
    @State private var sonSoniox = ""
    @AppStorage(Kayit.alaniaSesi) private var ses = "alania2-f1"
    /// Motor seçimi; boşsa henüz seçim yapılmamıştır (anahtar varsa bulut, yoksa cihaz; KR8, KR14).
    @AppStorage(Kayit.motor) private var motorKaydi = ""

    init(onizleme: Bool) {
        self.onizleme = onizleme
    }

    /// Alana anahtar girilmiş mi (boşluklar sayılmaz).
    private var anahtarGirildi: Bool {
        !sonioxAnahtar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Anahtar geçici anahtar sunucusundan mı gelecek (S03): mağaza yapısı, sunucu adresi dolu, alana anahtar girilmemiş.
    private var sunucudan: Bool {
        !anahtarGirildi && Anahtarlik.sunucudanAnahtar
    }

    /// Bulut motoru yalnız Soniox anahtarı varken ya da anahtar sunucudan gelirken seçilebilir (K3; S03).
    private var bulutKullanilabilir: Bool {
        anahtarGirildi || Anahtarlik.sonioxGomulu || sunucudan
    }

    /// `Anahtarlik.motor` ile aynı kural; ekrandaki alan ve seçim değişince yenilenir.
    private var motor: Motor {
        guard bulutKullanilabilir else { return .cihaz }
        if motorKaydi.isEmpty { return .bulut }
        return Motor(rawValue: motorKaydi) ?? .cihaz
    }

    private var motorSecimi: Binding<Motor> {
        Binding(get: { motor }, set: { motorKaydi = $0.rawValue })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Geliştirici")
                .font(.title2.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Text("Bu bölüm geliştirme ve deneme içindir; müşteri ayarlarında görünmez.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            bolumBasligi("Çeviri motoru")
            motorKarti
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            bolumBasligi("Alania-2 API anahtarı")
            alaniaKarti
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            bolumBasligi("Okuma sesi (Alania)")
            Picker("Okuma sesi", selection: $ses) {
                Text("Kadın").tag("alania2-f1")
                Text("Erkek").tag("alania2-oncel")
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityLabel("Okuma sesi")
            .padding(18)
            .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            guard !okundu else { return }
            let alania = Anahtarlik.alaniaAnahtari
            sonAlania = alania
            alaniaAnahtar = alania
            let soniox = GelistiriciBolumu.ilkSonioxAnahtari()
            sonSoniox = soniox
            sonioxAnahtar = soniox
            okundu = true
        }
        .onChange(of: alaniaAnahtar) {
            guard okundu, alaniaAnahtar != sonAlania, !onizleme else { return }
            Anahtarlik.alaniaAnahtari = alaniaAnahtar
            sonAlania = alaniaAnahtar
        }
        .onChange(of: sonioxAnahtar) {
            guard okundu, sonioxAnahtar != sonSoniox, !onizleme else { return }
            // KR8: ilk kez kaydedilince motor bulut olur, silinince cihaza döner (`Anahtarlik` uygular).
            Anahtarlik.sonioxAnahtari = sonioxAnahtar
            sonSoniox = sonioxAnahtar
        }
    }

    /// Alanın ilk değeri: kullanıcının Anahtar Zinciri'ndeki anahtarı (gömülü anahtar alana konmaz).
    @MainActor
    private static func ilkSonioxAnahtari() -> String {
        #if DEBUG
        // `-ekran tanilama-gelistirici`: anahtar girilmiş görünür; Anahtar Zinciri'ne yazılmaz.
        if OrnekEkran.gosterilen == .tanilamaGelistirici { return "ornek-anahtar" }
        #endif
        return Anahtarlik.sonioxAnahtari
    }

    /// Motor seçimi, Soniox anahtarı ve veri kullanımı notu (K3, K5, KR14).
    private var motorKarti: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Çeviri motoru", selection: motorSecimi) {
                Text("Cihazda (Apple)").tag(Motor.cihaz)
                Text("Bulut (Soniox)").tag(Motor.bulut)
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .disabled(!bulutKullanilabilir)
            .accessibilityLabel("Çeviri motoru")
            .accessibilityHint(bulutKullanilabilir ? "" : "Bulut motoru için önce Soniox anahtarını girin")

            if !bulutKullanilabilir {
                Text("Bulut motoru için Soniox anahtarını girin. Cihaz motoru yalnız Türkçeye çevirir.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if Anahtarlik.sonioxGomulu {
                // KR14: anahtarın kendisi ekranda gösterilmez.
                Label("Soniox anahtarı bu yapıya gömülü", systemImage: "checkmark.seal.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Renk.acikMavi)
            } else if sunucudan {
                // S03: mağaza yapısında anahtar telefonda durmaz; her akış için sunucudan geçici anahtar alınır.
                Label("Anahtar üyelikle sunucudan alınır", systemImage: "checkmark.seal.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Renk.acikMavi)
            }
            anahtarAlani($sonioxAnahtar, etiket: "Soniox API anahtarı",
                         yerTutucu: Anahtarlik.sonioxGomulu ? "Kendi anahtarınız (isteğe bağlı)" : "Soniox API anahtarı",
                         ipucu: Anahtarlik.sonioxGomulu ? "Kendi anahtarınızı girerseniz o kullanılır"
                                                        : "Bulut motoru bu anahtarla çalışır")
            Text("Bulut motorunda karşınızdakinin sesi tanıma ve çeviri için Soniox'a gönderilir. Saatte yaklaşık 115 MB veri kullanır. Anahtar yalnızca bu telefonda, güvenli biçimde saklanır.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var alaniaKarti: some View {
        VStack(alignment: .leading, spacing: 12) {
            anahtarAlani($alaniaAnahtar, etiket: "Alania-2 API anahtarı", yerTutucu: "pd_live_…",
                         ipucu: "Boş bırakırsanız çeviri Apple'ın sesiyle okunur")
            Text("Yalnız sesli okuma açıkken ve çeviri dili Türkçe iken kullanılır. Boş bırakırsanız çeviri Apple'ın sesiyle okunur. Anahtar girerseniz Türkçe çeviri metni seslendirmek için Alania'ya gönderilir; söylenen asıl cümle gönderilmez. Anahtar yalnızca bu telefonda, güvenli biçimde saklanır.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Gizli metin alanı. Sistem yer tutucusu soluk kaldığı için boşken üstüne .secondary metin bindirilir (C-6).
    private func anahtarAlani(_ deger: Binding<String>, etiket: String, yerTutucu: String, ipucu: String) -> some View {
        ZStack(alignment: .leading) {
            SecureField("", text: deger)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(14)
                .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.18), lineWidth: 1))
                .accessibilityLabel(etiket)
                .accessibilityValue(deger.wrappedValue.isEmpty ? "Boş" : "Girildi")
                .accessibilityHint(ipucu)
            if deger.wrappedValue.isEmpty {
                Text(yerTutucu)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(14)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
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
}
