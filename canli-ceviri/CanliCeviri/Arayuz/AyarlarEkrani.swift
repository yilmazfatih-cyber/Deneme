import SwiftUI

/// Ayarlar sekmesi (S02 tur 3: müşteriye sade): üyelik ve kalan haftalık kota (S03), çeviri dili, sesli okuma,
/// satın alımları geri yükleme, bağlantılar, gizlilik bildirimi ve sürüm satırı. Anahtarlar, motor seçimi ve
/// Tanılama kaydı burada değildir: sürüm satırına uzun basınca açılan Tanılama sayfasının "Geliştirici"
/// bölümündedir (`GelistiriciBolumu`).
struct AyarlarEkrani: View {
    let durum: Durum
    @Binding var tanilamaAcik: Bool
    /// Motor seçimi değişince ekran yenilensin diye okunur; karar `Anahtarlik.motor`'dadır.
    @AppStorage(Kayit.motor) private var motorKaydi = ""
    @AppStorage(Kayit.hedefDil) private var hedefKod = "tr"
    @AppStorage(Kayit.sesliOku) private var sesliOku = false
    /// Çeviri dili sayfası (aranabilir liste) açık mı.
    @State private var hedefAcik = false
    @ScaledMetric(relativeTo: .title3) private var simgeSutunu: CGFloat = 30

    /// Bulut motoru etkin mi (geçerli Soniox anahtarı var ya da anahtar sunucudan geliyor, ve geliştirici bölümünde
    /// cihaz seçilmemiş).
    private var bulutEtkin: Bool {
        if AyarlarEkrani.ornekBulut() { return true }
        return motorKaydi == Motor.cihaz.rawValue ? false : Anahtarlik.motor == .bulut
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ayarlar")
                    .font(.largeTitle.weight(.bold))
                    .accessibilityAddTraits(.isHeader)

                // 1. Abonelik
                VStack(alignment: .leading, spacing: 0) {
                    abonelikSatiri
                    if let kalan = gorunenKota {
                        Divider().overlay(Renk.ayrac)
                        kotaSatiri(kalan)
                    }
                    if durum.abonelik.abone {
                        Divider().overlay(Renk.ayrac)
                        baglantiSatiri("creditcard.fill", "Aboneliği yönet", Adres.abonelikleriYonet,
                                       ipucu: "Apple'ın abonelik sayfasını açar")
                    }
                }
                .kartIci()

                // 2. Çeviri dili, 3. Sesli okuma
                VStack(alignment: .leading, spacing: 0) {
                    hedefDilSatiri
                    Divider().overlay(Renk.ayrac)
                    sesliOkumaSatiri
                }
                .kartIci()

                // 4. Satın alımları geri yükle
                VStack(alignment: .leading, spacing: 0) {
                    geriYukleSatiri
                    if let ileti = durum.abonelik.ileti {
                        Text(ileti)
                            .font(.footnote)
                            .foregroundStyle(Renk.sari)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.bottom, 12)
                    }
                }
                .kartIci()

                // 5. Bağlantılar
                VStack(alignment: .leading, spacing: 0) {
                    baglantiSatiri("hand.raised.fill", "Gizlilik Politikası", Adres.gizlilik)
                    Divider().overlay(Renk.ayrac)
                    baglantiSatiri("doc.text.fill", "Kullanım Koşulları", Adres.kosullar)
                    Divider().overlay(Renk.ayrac)
                    baglantiSatiri("questionmark.circle.fill", "Destek", Adres.destek)
                }
                .kartIci()

                // 6. Gizlilik bildirimi (ilke 3): bulut motorunda ses telefondan çıkar; bu satır kalkamaz.
                if bulutEtkin {
                    Text("Konuşma, tanıma ve çeviri için Soniox'a gönderilir. Soniox sesi saklamadığını bildirir.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                }

                // 7. Sürüm
                surumSatiri
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
    }

    /// `-ekran ayarlar-bulut` ve `-ekran ayarlar-kota`: simülatörde anahtar yokken de bulut etkin görünür (yalnız DEBUG).
    @MainActor
    private static func ornekBulut() -> Bool {
        #if DEBUG
        if OrnekEkran.gosterilen == .ayarlarBulut || OrnekEkran.gosterilen == .ayarlarKota { return true }
        #endif
        return false
    }

    /// "Bu hafta kalan" satırında gösterilecek süre, sn (S03). Yalnız abonede ve sunucu bildirdiyse; bilinmiyorsa nil
    /// (satır görünmez).
    private var gorunenKota: Int? {
        guard durum.abonelik.abone else { return nil }
        return Kota.ortak.kalanSn
    }

    // MARK: Satırlar

    /// Abone değilse fiyat ekranını açar; aboneyse durumu söyler (altında "Aboneliği yönet" satırı çıkar).
    private var abonelikSatiri: some View {
        let abone = durum.abonelik.abone
        #if DENEME
        let baslik = "Abonelik"
        let durumMetni = "Deneme yapısı: abonelik gerekmez"
        #else
        let baslik = abone ? "Üyelik etkin" : "Üye ol"
        let durumMetni = abone ? "Haftalık üyelik" : "Çeviri için üyelik gerekir"
        #endif
        return Button {
            durum.abonelikAcik = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: abone ? "checkmark.seal.fill" : "person.badge.plus")
                    .font(.title3)
                    .foregroundStyle(Renk.acikMavi)
                    .frame(width: simgeSutunu)
                VStack(alignment: .leading, spacing: 2) {
                    Text(baslik)
                        .font(.subheadline.weight(.semibold))
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
        .accessibilityLabel(baslik)
        .accessibilityValue(durumMetni)
        .accessibilityHint("Abonelik sayfasını açar")
        .accessibilityAddTraits(.isButton)
    }

    /// Sunucunun bildirdiği kalan haftalık kota (S03): "Bu hafta kalan" ve süre ("2 sa 14 dk"). Yalnız bilgi verir;
    /// 10 dakikanın altında süre sarı yazılır (renk tek başına bilgi taşımaz: süre yazıyla da okunur).
    private func kotaSatiri(_ kalan: Int) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "hourglass")
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: simgeSutunu)
            Text("Bu hafta kalan")
                .font(.subheadline)
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            Text(KotaMetni.kalan(kalan))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(kalan < kotaUyariEsigi ? Renk.sari : Color.secondary)
                .multilineTextAlignment(.trailing)
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Bu hafta kalan çeviri süresi")
        .accessibilityValue(KotaMetni.kalanSesli(kalan))
    }

    /// Çeviri dili: bulut motorunda aranabilir dil sayfasını açar (Türkçe en üstte); cihaz motoru yalnız Türkçeye
    /// çevirdiği için orada satır yalnız bilgi verir.
    @ViewBuilder
    private var hedefDilSatiri: some View {
        if bulutEtkin {
            Button {
                hedefAcik = true
            } label: {
                hedefDilIcerigi(dilAdi(hedefKod), ok: true)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Çeviri dili")
            .accessibilityValue(dilAdi(hedefKod))
            .accessibilityHint("Dil listesini açar")
            .accessibilityAddTraits(.isButton)
        } else {
            hedefDilIcerigi(turkceDil.ad, ok: false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Çeviri dili")
                .accessibilityValue(turkceDil.ad)
        }
    }

    private func hedefDilIcerigi(_ ad: String, ok: Bool) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "character.bubble.fill")
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: simgeSutunu)
            Text("Çeviri dili")
                .font(.subheadline)
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            Text(ad)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ok ? Renk.maviMetin : Color.secondary)
                .multilineTextAlignment(.trailing)
            if ok {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// Yalnız aç/kapa: açıkken çeviri sesli okunur, kapalıyken yalnız ekrana yazılır (KR11).
    private var sesliOkumaSatiri: some View {
        HStack(spacing: 14) {
            Image(systemName: "speaker.wave.2.fill")
                .font(.title3)
                .foregroundStyle(Renk.acikMavi)
                .frame(width: simgeSutunu)
                .accessibilityHidden(true)
            Toggle("Çeviriyi sesli oku", isOn: $sesliOku)
                .font(.subheadline)
                .tint(Renk.maviDolgu)
                .accessibilityHint("Kapalıyken çeviri yalnız ekrana yazılır")
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
    }

    private var geriYukleSatiri: some View {
        Button {
            Task { await durum.abonelik.geriYukle() }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "arrow.clockwise")
                    .font(.title3)
                    .foregroundStyle(Renk.acikMavi)
                    .frame(width: simgeSutunu)
                Text("Satın alımları geri yükle")
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                if durum.abonelik.yukleniyor {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(durum.abonelik.yukleniyor)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Satın alımları geri yükle")
        .accessibilityHint("Daha önce alınan aboneliği bu telefona getirir")
        .accessibilityAddTraits(.isButton)
    }

    private func baglantiSatiri(_ simge: String, _ baslik: String, _ adres: URL,
                                ipucu: String = "Safari'de açar") -> some View {
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
        .accessibilityHint(ipucu)
        .accessibilityAddTraits(.isLink)
    }

    /// En altta sürüm ve yapı etiketi. Uzun basınca Tanılama sayfası açılır (müşteriye görünmeyen geliştirici yolu);
    /// VoiceOver'da aynı iş "Tanılama kaydını aç" eylemiyle yapılır.
    private var surumSatiri: some View {
        VStack(spacing: 2) {
            Text("Sürüm \(Tanilama.uygulamaSurumu)")
                .font(.footnote)
            Text(yapiEtiketi)
                .font(.caption2)
        }
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.8) {
            tanilamaAcik = true
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sürüm \(Tanilama.uygulamaSurumu), \(yapiEtiketi)")
        .accessibilityAction(named: "Tanılama kaydını aç") {
            tanilamaAcik = true
        }
    }
}

private extension View {
    /// Ayarlar kartı: satırların çevresindeki yuvarlak köşeli yüzey.
    @MainActor
    func kartIci() -> some View {
        padding(.horizontal, 18)
            .padding(.vertical, 6)
            .background(Renk.kart, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}
