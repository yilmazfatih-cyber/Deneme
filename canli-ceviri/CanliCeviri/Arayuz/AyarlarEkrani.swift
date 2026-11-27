import SwiftUI

/// Ayarlar sekmesi: abonelik, çeviri motoru (Soniox anahtarı, çeviri dili), sesli okuma (Alania-2 anahtarı, ses),
/// kısa açıklama, Tanılama kaydı ve bağlantılar.
struct AyarlarEkrani: View {
    let durum: Durum
    @Binding var tanilamaAcik: Bool
    /// Anahtar Anahtar Zinciri'nde durur (K5); bu alan yalnız ekrandaki kopyasıdır.
    @State private var anahtar = ""
    @State private var anahtarOkundu = false
    /// Q-8: son okunan ya da yazılan değer; alan buna eşitse Anahtar Zinciri'ne yeniden yazılmaz.
    @State private var sonAnahtar = ""
    /// Soniox anahtarının ekrandaki kopyası (Alania alanıyla aynı kalıp; S02 K5). Gömülü anahtar burada görünmez.
    @State private var sonioxAnahtar = ""
    @State private var sonSoniox = ""
    @AppStorage(Kayit.alaniaSesi) private var ses = "alania2-f1"
    /// Kullanıcının motor seçimi; boşsa henüz seçim yapılmamıştır (anahtar varsa bulut, yoksa cihaz; KR8, KR14).
    @AppStorage(Kayit.motor) private var motorKaydi = ""
    @AppStorage(Kayit.hedefDil) private var hedefKod = "tr"
    @AppStorage(Kayit.sesliOku) private var sesliOku = false
    /// Çeviri dili sayfası (aranabilir liste) açık mı.
    @State private var hedefAcik = false
    @ScaledMetric(relativeTo: .title3) private var simgeSutunu: CGFloat = 30

    /// Bulut motoru yalnız Soniox anahtarı varken seçilebilir (K3).
    private var bulutKullanilabilir: Bool {
        !sonioxAnahtar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || Anahtarlik.sonioxGomulu
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
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ayarlar")
                    .font(.largeTitle.weight(.bold))
                    .accessibilityAddTraits(.isHeader)

                bolumBasligi("Abonelik")
                abonelikSatiri
                    .padding(.horizontal, 18)
                    .padding(.vertical, 6)
                    .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Çeviri motoru")
                motorKarti
                    .padding(18)
                    .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Sesli okuma")
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Çeviriyi sesli oku", isOn: $sesliOku)
                        .font(.subheadline)
                        .tint(Renk.maviDolgu)
                        .frame(minHeight: 44)
                        .accessibilityHint("Kapalıyken çeviri yalnız ekrana yazılır")
                    Text("Kapalıyken çeviri yalnız ekrana yazılır. Açıkken çeviri AirPods'tan okunur.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                // KR11: Alania anahtarı ve ses seçimi yalnız sesli okuma açıkken görünür.
                if sesliOku {
                    bolumBasligi("Alania-2 API anahtarı")
                    VStack(alignment: .leading, spacing: 12) {
                        // C-6: sistem yer tutucusu soluk kalıyor; boşken üstüne .secondary metin bindirilir.
                        ZStack(alignment: .leading) {
                            SecureField("", text: $anahtar)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .padding(14)
                                .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.18), lineWidth: 1))
                                .accessibilityLabel("Alania-2 API anahtarı")
                                .accessibilityValue(anahtar.isEmpty ? "Boş" : "Girildi")
                                .accessibilityHint("Boş bırakırsanız çeviri Apple'ın sesiyle okunur")
                            if anahtar.isEmpty {
                                Text("pd_live_…")
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .padding(14)
                                    .allowsHitTesting(false)
                                    .accessibilityHidden(true)
                            }
                        }
                        Text("Boş bırakırsanız çeviri Apple'ın sesiyle okunur. Anahtar girerseniz Türkçe çeviri metni seslendirmek için Alania'ya gönderilir; söylenen asıl cümle gönderilmez. Anahtar yalnızca bu telefonda, güvenli biçimde saklanır.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if motor == .bulut && hedefKod != "tr" {
                            Text("Alania yalnız Türkçe okur; çeviri dili \(dilAdi(hedefKod)) iken Apple sesi kullanılır.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
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
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .accessibilityLabel("Okuma sesi")
                    .padding(18)
                    .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                }

                bolumBasligi("Nasıl çalışır")
                VStack(alignment: .leading, spacing: 14) {
                    bilgiSatiri("mic.fill", "iPhone mikrofonu karşınızdakini dinler")
                    bilgiSatiri("character.bubble.fill",
                                motor == .bulut ? "Konuşma Soniox'ta \(yonelme(dilAdi(hedefKod))) çevrilir"
                                                : "Konuşma cihazda Türkçeye çevrilir")
                    if sesliOku {
                        bilgiSatiri("airpods", "Çeviri AirPods'tan okunur")
                    } else {
                        bilgiSatiri("text.bubble.fill", "Çeviri ekrana yazılır")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Tanılama")
                tanilamaSatiri
                    .padding(.horizontal, 18)
                    .padding(.vertical, 6)
                    .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                bolumBasligi("Bilgi")
                VStack(alignment: .leading, spacing: 0) {
                    baglantiSatiri("hand.raised.fill", "Gizlilik Politikası", Adres.gizlilik)
                    Divider().overlay(Renk.ayrac)
                    baglantiSatiri("questionmark.circle.fill", "Destek", Adres.destek)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 6)
                .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
        }
        .altSolma()
        .sheet(isPresented: $hedefAcik) {
            DilSecimEkrani(baslik: "Çeviri dili", diller: hedefDilleri, secili: $hedefKod)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Renk.zemin)
                .preferredColorScheme(.dark)
        }
        .onAppear {
            guard !anahtarOkundu else { return }
            let okunan = Anahtarlik.alaniaAnahtari
            sonAnahtar = okunan
            anahtar = okunan
            let soniox = AyarlarEkrani.ilkSonioxAnahtari()
            sonSoniox = soniox
            sonioxAnahtar = soniox
            anahtarOkundu = true
        }
        .onChange(of: anahtar) {
            guard anahtarOkundu, anahtar != sonAnahtar else { return }
            Anahtarlik.alaniaAnahtari = anahtar
            sonAnahtar = anahtar
        }
        .onChange(of: sonioxAnahtar) {
            guard anahtarOkundu, sonioxAnahtar != sonSoniox, !durum.hat.onizlemede else { return }
            // KR8: ilk kez kaydedilince motor bulut olur, silinince cihaza döner (`Anahtarlik` uygular).
            Anahtarlik.sonioxAnahtari = sonioxAnahtar
            sonSoniox = sonioxAnahtar
        }
    }

    // MARK: Çeviri motoru (S02)

    /// Alanın ilk değeri: kullanıcının Anahtar Zinciri'ndeki anahtarı (gömülü anahtar alana konmaz).
    @MainActor
    private static func ilkSonioxAnahtari() -> String {
        #if DEBUG
        // `-ekran ayarlar-bulut`: anahtar girilmiş görünür; Anahtar Zinciri'ne yazılmaz.
        if OrnekEkran.gosterilen == .ayarlarBulut { return "ornek-anahtar" }
        #endif
        return Anahtarlik.sonioxAnahtari
    }

    /// Motor seçimi, çeviri dili, Soniox anahtarı ve sesin Soniox'a gittiği bildirimi (K3, K5, KR13, KR14).
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

            if motor == .bulut {
                // KR13: 60 dil menüye sığmaz; satır aranabilir dil sayfasını açar (Türkçe en üstte).
                Button {
                    hedefAcik = true
                } label: {
                    HStack(spacing: 12) {
                        Text("Çeviri dili")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                        Spacer(minLength: 8)
                        Text(dilAdi(hedefKod))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Renk.maviMetin)
                            .multilineTextAlignment(.trailing)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Çeviri dili")
                .accessibilityValue(dilAdi(hedefKod))
                .accessibilityHint("Dil listesini açar")
                .accessibilityAddTraits(.isButton)
            } else {
                Text(bulutKullanilabilir ? "Cihaz motoru yalnız Türkçeye çevirir."
                                         : "Bulut motoru için Soniox anahtarını girin. Cihaz motoru yalnız Türkçeye çevirir.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if Anahtarlik.sonioxGomulu {
                // KR14: anahtarın kendisi ekranda gösterilmez.
                Label("Soniox anahtarı bu yapıya gömülü", systemImage: "checkmark.seal.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Renk.acikMavi)
            }
            // C-6: sistem yer tutucusu soluk kalıyor; boşken üstüne .secondary metin bindirilir.
            ZStack(alignment: .leading) {
                SecureField("", text: $sonioxAnahtar)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(Renk.alan, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.18), lineWidth: 1))
                    .accessibilityLabel("Soniox API anahtarı")
                    .accessibilityValue(sonioxAnahtar.isEmpty ? "Boş" : "Girildi")
                    .accessibilityHint(Anahtarlik.sonioxGomulu ? "Kendi anahtarınızı girerseniz o kullanılır"
                                                               : "Bulut motoru bu anahtarla çalışır")
                if sonioxAnahtar.isEmpty {
                    Text(Anahtarlik.sonioxGomulu ? "Kendi anahtarınız (isteğe bağlı)" : "Soniox API anahtarı")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(14)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            Text("Bulut motorunda karşınızdakinin sesi tanıma ve çeviri için Soniox'a gönderilir. Saatte yaklaşık 115 MB veri kullanır. Anahtar yalnızca bu telefonda, güvenli biçimde saklanır.")
                .font(.footnote)
                .foregroundStyle(.secondary)
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

    private var abonelikSatiri: some View {
        let abone = durum.abonelik.abone
        #if DENEME
        let durumMetni = "Deneme yapısı: süre sınırı yok"
        #else
        let durumMetni = abone ? "Sınırsız: etkin" : "Ücretsiz: günde 10 dakika"
        #endif
        return Button {
            durum.abonelikAcik = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: abone ? "checkmark.seal.fill" : "infinity")
                    .font(.title3)
                    .foregroundStyle(Renk.acikMavi)
                    .frame(width: simgeSutunu)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Abonelik")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                    Text(durumMetni)
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
        .accessibilityLabel("Abonelik")
        .accessibilityValue(durumMetni)
        .accessibilityHint("Abonelik sayfasını açar")
        .accessibilityAddTraits(.isButton)
    }

    private func baglantiSatiri(_ simge: String, _ baslik: String, _ adres: URL) -> some View {
        Link(destination: adres) {
            HStack(spacing: 14) {
                Image(systemName: simge)
                    .font(.title3)
                    .foregroundStyle(Renk.acikMavi)
                    .frame(width: simgeSutunu)
                Text(baslik)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(baslik)
        .accessibilityHint("Safari'de açar")
        .accessibilityAddTraits(.isLink)
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
