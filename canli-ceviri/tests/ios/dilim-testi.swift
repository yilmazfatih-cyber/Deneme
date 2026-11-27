import Foundation

// Dilim devrinin ve geçici anahtar sunucusu sözleşmesinin saf mantık testi (S03). `cozucu-testi.swift` ile birlikte
// derlenir (o dosyadaki `denetle`, `yanit`, `a`, `c`, `son` yardımcılarını kullanır) ve `CozucuTesti.main` çağırır:
//   swiftc -swift-version 5 -parse-as-library canli-ceviri/CanliCeviri/Bulut/SonioxCozucu.swift \
//     canli-ceviri/CanliCeviri/Bulut/DilimPlani.swift canli-ceviri/CanliCeviri/Bulut/AnahtarSunucusu.swift \
//     canli-ceviri/tests/ios/cozucu-testi.swift canli-ceviri/tests/ios/dilim-testi.swift -o cozucu-testi
// Sunucu yanıtları `canli-ceviri/sunucu` sözleşmesindeki biçimdedir; gerçek sunucu bu testte çağrılmaz (ilke 8).

enum DilimTesti {
    static func hepsi() {
        zamanlama()
        devir()
        yenilemeHatalari()
        kisaDilim()
        cumleArasi()
        adresVeGovde()
        yanitCozme()
        hataMetinleri()
        kotaMetinleri()
    }

    private static func karar(_ plan: DilimPlani, _ gecen: TimeInterval, _ yenileme: DilimPlani.Yenileme,
                              cumleArasi: Bool = false, akisKapandi: Bool = false) -> DilimPlani.Karar {
        plan.karar(gecen: gecen, yenileme: yenileme, cumleArasi: cumleArasi, akisKapandi: akisKapandi)
    }

    /// Yeni anahtar dilimin bitimine 25 sn kala istenir.
    static func zamanlama() {
        let plan = DilimPlani(sureSn: 120)
        let anlar: [TimeInterval] = [plan.yenilemeAni, plan.sonDevirAni, plan.sonAn]
        denetle(anlar == [95, 115, 123], "120 sn'lik dilimin anları")
        denetle(karar(plan, 0, .istenmedi, cumleArasi: true) == .bekle
                    && karar(plan, 94.9, .istenmedi, cumleArasi: true) == .bekle,
                "yenileme anından önce beklenir (cümle arası olsa da)")
        denetle(karar(plan, 95, .istenmedi) == .anahtarIste && karar(plan, 110, .istenmedi) == .anahtarIste,
                "sure_sn − 25'te yeni anahtar istenir")
        denetle(karar(plan, 96, .isteniyor, cumleArasi: true) == .bekle && karar(plan, 119, .isteniyor) == .bekle,
                "anahtar istenirken ve bağlanırken beklenir")
    }

    /// Yeni akış hazırsa cümle arasında, en geç dilimin bitimine 5 sn kala devredilir.
    static func devir() {
        let plan = DilimPlani(sureSn: 120)
        denetle(karar(plan, 100, .hazir) == .bekle, "yeni akış hazır ama cümle sürüyor: beklenir")
        denetle(karar(plan, 100, .hazir, cumleArasi: true) == .devret, "cümle arasında devredilir")
        denetle(karar(plan, 114.9, .hazir) == .bekle && karar(plan, 115, .hazir) == .devret,
                "cümle bitmese de en geç 5 sn kala devredilir")
        denetle(karar(plan, 100, .hazir, akisKapandi: true) == .devret, "eski akış kapandıysa hazır akışa hemen devredilir")
        denetle(karar(plan, 121, .isteniyor, akisKapandi: true) == .bekle,
                "dilim bitti, yeni akış yolda: hata değil, devir beklenir")
        denetle(karar(plan, 60, .istenmedi, akisKapandi: true) == .anahtarIste,
                "dilim beklenenden erken bittiyse yeni anahtar hemen istenir")
    }

    /// Yeni anahtar alınamazsa eski akış süresi dolana dek sürer, sonra durulur.
    static func yenilemeHatalari() {
        let plan = DilimPlani(sureSn: 120)
        denetle(karar(plan, 100, .kesinHata, cumleArasi: true) == .bekle && karar(plan, 122.9, .kesinHata) == .bekle,
                "kota dolduysa eski akış süresi dolana dek sürer")
        denetle(karar(plan, 119, .kesinHata, akisKapandi: true) == .dur && karar(plan, 123, .kesinHata) == .dur,
                "eski akış kapanınca (ya da süre geçince) durulur")
        denetle(karar(plan, 103, .geciciHata(an: 100)) == .bekle
                    && karar(plan, 106, .geciciHata(an: 100)) == .anahtarIste,
                "geçici hatadan 6 sn sonra yeniden denenir")
        denetle(karar(plan, 110, .geciciHata(an: 108), akisKapandi: true) == .dur
                    && karar(plan, 123, .geciciHata(an: 122)) == .dur,
                "geçici hata sürerken dilim biterse durulur")
        let bir = DilimPlani.Yenileme.geciciHata(an: 1)
        let iki = DilimPlani.Yenileme.geciciHata(an: 2)
        denetle(bir != iki && bir == DilimPlani.Yenileme.geciciHata(an: 1), "geçici hatanın anı karşılaştırmaya girer")
    }

    /// Çok kısa dilimde (kotanın son parçası) anlar sıralı kalır.
    static func kisaDilim() {
        let otuz = DilimPlani(sureSn: 30)
        let otuzAnlar: [TimeInterval] = [otuz.yenilemeAni, otuz.sonDevirAni, otuz.sonAn]
        denetle(otuzAnlar == [15, 25, 33], "30 sn'lik dilimin anları")
        let on = DilimPlani(sureSn: 10)
        let onAnlar: [TimeInterval] = [on.yenilemeAni, on.sonDevirAni]
        denetle(onAnlar == [5, 5], "10 sn'lik dilim: yenileme dilimin yarısından önce istenmez")
        let sureler: [Int] = [DilimPlani(sureSn: 0).sureSn, DilimPlani(sureSn: -5).sureSn]
        denetle(sureler == [1, 1], "geçersiz süre 1 sn sayılır")
        var hizli = DilimPlani(sureSn: 120)
        hizli.yenilemePayi = 40
        hizli.sonDevirPayi = 10
        let hizliAnlar: [TimeInterval] = [hizli.yenilemeAni, hizli.sonDevirAni]
        denetle(hizliAnlar == [80, 110], "paylar değiştirilebilir")
    }

    /// Devir için "cümle arası": açık asıl metin yok; çevirisi bekleyen kapanmış cümle engel değil.
    static func cumleArasi() {
        var cozucu = SonioxCozucu()
        denetle(cozucu.cumleArasinda, "boş çözücü cümle arasındadır")
        _ = cozucu.isle(yanit([a("Hel", kesin: false)]), simdi: 0)
        denetle(!cozucu.cumleArasinda, "kesin olmayan asıl metin: cümle içinde")
        _ = cozucu.isle(yanit([a("Hello"), c("Merhaba")]), simdi: 0.1)
        denetle(!cozucu.cumleArasinda, "kesin asıl metin: cümle içinde")
        _ = cozucu.isle(yanit([son]), simdi: 0.2)
        denetle(cozucu.cumleArasinda, "<end>'den sonra cümle arası (çevirisi beklense de)")
        _ = cozucu.isle(yanit([a(" Next", kesin: false)]), simdi: 0.3)
        denetle(!cozucu.cumleArasinda, "sonraki cümle başlayınca cümle içinde")

        // S03: geçici anahtarın süresi dolunca gelen hata "dilim bitti" sınıfıdır, geçersiz anahtar değil.
        var ikinci = SonioxCozucu()
        let bitis = "{\"error_code\":403,\"error_type\":\"temp_api_key_session_expired\",\"error_message\":\"x\"}"
        let olaylar = ikinci.isle(bitis, simdi: 0)
        let beklenen: [SonioxOlayi] = [
            .hata(SonioxHatasi(kod: 403, tur: "temp_api_key_session_expired", sinif: .dilimBitti)),
        ]
        denetle(olaylar == beklenen, "temp_api_key_session_expired dilim bitti sınıfıdır")
        denetle(!SonioxHataSinifi.dilimBitti.yenidenDenenir, "dilim bitti yeniden deneme hatası değildir")
    }

    private static func veri(_ metin: String) -> Data {
        Data(metin.utf8)
    }

    private static func coz(_ durum: Int, _ govde: String, retryAfter: String? = nil)
        -> Result<SonioxAnahtari, AnahtarHatasi> {
        AnahtarSunucusu.yanitiCoz(durum: durum, govde: veri(govde), retryAfter: retryAfter)
    }

    /// Uç nokta adresi (yalnız https) ve istek gövdesi.
    static func adresVeGovde() {
        denetle(AnahtarSunucusu.adres(kok: "") == nil && AnahtarSunucusu.adres(kok: "   ") == nil,
                "boş sunucu adresi kullanılmaz")
        denetle(AnahtarSunucusu.adres(kok: "http://ornek.workers.dev") == nil
                    && AnahtarSunucusu.adres(kok: "ornek.workers.dev") == nil,
                "https olmayan adres kullanılmaz")
        let beklenen = "https://ornek.workers.dev/v1/oturum"
        denetle(AnahtarSunucusu.adres(kok: "https://ornek.workers.dev")?.absoluteString == beklenen
                    && AnahtarSunucusu.adres(kok: " https://ornek.workers.dev/ ")?.absoluteString == beklenen,
                "kök adrese /v1/oturum eklenir (sondaki / ve boşluk atılır)")

        let govde = AnahtarSunucusu.istekGovdesi(islem: "a.b.c") ?? Data()
        let nesne = (try? JSONSerialization.jsonObject(with: govde)) as? [String: Any]
        denetle(nesne?.count == 1 && nesne?["islem"] as? String == "a.b.c", "istek gövdesinde yalnız islem alanı var")
        denetle(AnahtarSunucusu.istekGovdesi(islem: "") == nil, "boş işlemle istek kurulmaz")
    }

    /// Yanıt beklenen hataya mı çözülüyor (karşılaştırma tek tek yapılır: derleyicinin tür çıkarımı yorulmasın).
    private static func hataMi(_ durum: Int, _ govde: String, _ beklenen: AnahtarHatasi,
                               retryAfter: String? = nil) -> Bool {
        guard case .failure(let gelen) = coz(durum, govde, retryAfter: retryAfter) else { return false }
        if gelen != beklenen { print("    beklenen: \(beklenen) gelen: \(gelen)") }
        return gelen == beklenen
    }

    private static func anahtarMi(_ durum: Int, _ govde: String, _ beklenen: SonioxAnahtari) -> Bool {
        guard case .success(let gelen) = coz(durum, govde) else { return false }
        return gelen == beklenen
    }

    /// Sunucu yanıtı: başarı alanları; hata türü HTTP durumundan değil `hata` alanından ayrılır.
    static func yanitCozme() {
        let tam = "{\"anahtar\":\"temp:abc\",\"sure_sn\":120,\"kalan_sn\":9480,\"donem_bitis_ms\":1796383800000}"
        denetle(anahtarMi(200, tam, SonioxAnahtari(anahtar: "temp:abc", sureSn: 120, kalanSn: 9480,
                                                   donemBitisMs: 1_796_383_800_000)),
                "200 yanıtı: anahtar, süre, kalan kota, dönem bitişi")
        denetle(anahtarMi(200, "{\"anahtar\":\"k\",\"sure_sn\":45}", SonioxAnahtari(anahtar: "k", sureSn: 45)),
                "kota alanları yoksa bilinmiyor sayılır")
        denetle(anahtarMi(200, "{\"anahtar\":\"k\",\"sure_sn\":120,\"kalan_sn\":-3}",
                          SonioxAnahtari(anahtar: "k", sureSn: 120, kalanSn: 0)),
                "eksi kalan kota sıfır sayılır")
        let yerel = SonioxAnahtari(anahtar: "yerel")
        denetle(yerel.sureSn == nil && yerel.kalanSn == nil && yerel.donemBitisMs == nil,
                "yerel anahtarda dilim ve kota yok")

        denetle(hataMi(403, "{\"hata\":\"abonelik_yok\",\"ileti\":\"x\"}", .abonelikYok), "abonelik_yok")
        denetle(hataMi(401, "{\"hata\":\"imza_gecersiz\",\"ileti\":\"x\"}", .imzaGecersiz), "imza_gecersiz")
        denetle(hataMi(400, "{\"hata\":\"gecersiz_istek\",\"ileti\":\"x\"}", .gecersizIstek), "gecersiz_istek")
        denetle(hataMi(429, "{\"hata\":\"sinir_doldu\",\"ileti\":\"x\",\"donem_bitis_ms\":1796383800000}",
                       .sinirDoldu(donemBitisMs: 1_796_383_800_000), retryAfter: "3600"),
                "sinir_doldu dönem bitişini taşır")
        denetle(hataMi(429, "{\"hata\":\"sinir_doldu\",\"ileti\":\"x\"}", .sinirDoldu(donemBitisMs: nil)),
                "sinir_doldu: dönem bitişi yoksa nil")
        let cokSik = "{\"hata\":\"cok_sik\",\"ileti\":\"x\"}"
        denetle(hataMi(429, cokSik, .cokSik(beklemeSn: 40), retryAfter: "40"), "cok_sik: Retry-After saniyesi alınır")
        denetle(hataMi(429, cokSik, .cokSik(beklemeSn: nil)), "cok_sik: Retry-After yoksa bekleme bilinmez")
        denetle(hataMi(429, cokSik, .cokSik(beklemeSn: nil), retryAfter: "99999"), "cok_sik: çok uzun bekleme yazılmaz")
        denetle(hataMi(429, cokSik, .cokSik(beklemeSn: nil), retryAfter: "Fri, 04 Dec 2026 11:30:00 GMT"),
                "cok_sik: tarih biçimli Retry-After yok sayılır")
        denetle(hataMi(502, "{\"hata\":\"sunucu_hatasi\",\"ileti\":\"x\"}", .ulasilamadi(kod: "sunucu_hatasi")),
                "sunucu_hatasi ulaşılamadı sayılır")
        denetle(hataMi(200, "{\"hata\":\"sinir_doldu\"}", .sinirDoldu(donemBitisMs: nil)),
                "hata türü HTTP durumundan değil hata alanından ayrılır (200)")
        denetle(hataMi(500, "{\"hata\":\"abonelik_yok\"}", .abonelikYok),
                "hata türü HTTP durumundan değil hata alanından ayrılır (500)")
        denetle(hataMi(418, "{\"hata\":\"Yeni Kod! <x>\"}", .ulasilamadi(kod: "bilinmeyen_yenikodx")),
                "tanınmayan hata kodu temizlenir, ulaşılamadı sayılır")
        denetle(hataMi(502, "<html>error code: 1102</html>", .ulasilamadi(kod: "http_502_bozuk_yanit")),
                "JSON olmayan yanıt ulaşılamadı sayılır")
        denetle(hataMi(200, "", .ulasilamadi(kod: "http_200_bozuk_yanit")), "boş yanıt ulaşılamadı sayılır")
        denetle(hataMi(200, "[1]", .ulasilamadi(kod: "http_200_bozuk_yanit")), "nesne olmayan JSON ulaşılamadı sayılır")
        denetle(hataMi(200, "{\"anahtar\":\"\",\"sure_sn\":120}", .ulasilamadi(kod: "http_200_eksik_yanit")),
                "boş anahtar kabul edilmez")
        denetle(hataMi(200, "{\"anahtar\":\"k\"}", .ulasilamadi(kod: "http_200_eksik_yanit")),
                "süresi olmayan yanıt kabul edilmez")
        denetle(hataMi(200, "{\"anahtar\":\"k\",\"sure_sn\":0}", .ulasilamadi(kod: "http_200_eksik_yanit")),
                "sıfır süre kabul edilmez")
        denetle(hataMi(201, "{\"anahtar\":\"k\",\"sure_sn\":120}", .ulasilamadi(kod: "http_201_eksik_yanit")),
                "200 dışındaki durumda anahtar kabul edilmez")
    }

    /// Hataların ekrandaki Türkçe açıklaması ve dilim yenilemede yeniden deneme kuralı.
    static func hataMetinleri() {
        let istanbul = TimeZone(secondsFromGMT: 3 * 3600) ?? .current
        // 4 Aralık 2026 Cuma 11:30 UTC = 14:30 (UTC+3)
        let doldu = AnahtarHatasi.sinirDoldu(donemBitisMs: 1_796_383_800_000).ekranMetni(saatDilimi: istanbul)
        let dolduTamam = doldu.hasPrefix("Bu haftaki çeviri kotanız doldu. 4 Aralık")
            && doldu.hasSuffix("14:30'da yenilenir.")
        denetle(dolduTamam, "kota doldu: yenilenme günü ve saati yerel saatle")
        if !dolduTamam { print("    gelen: \(doldu)") }
        denetle(AnahtarHatasi.sinirDoldu(donemBitisMs: nil).ekranMetni(saatDilimi: istanbul)
                    == "Bu haftaki çeviri kotanız doldu. Üyelik döneminiz yenilenince sürer.",
                "kota doldu: yenilenme anı bilinmiyorsa tarih yazılmaz")
        let cokSik = AnahtarHatasi.cokSik(beklemeSn: nil).ekranMetni()
        denetle(cokSik == "Çok sık denendi. Biraz sonra yeniden deneyin.", "çok sık metni")
        let cokSikSureli = AnahtarHatasi.cokSik(beklemeSn: 40).ekranMetni()
        denetle(cokSikSureli == "Çok sık denendi. 40 saniye sonra yeniden deneyin.",
                "çok sık: bekleme biliniyorsa saniyesi yazılır")
        denetle(AnahtarHatasi.imzaGecersiz.ekranMetni()
                    == "Üyelik doğrulanamadı. Ayarlar'dan satın alımları geri yükleyin.",
                "imza geçersiz metni")
        denetle(AnahtarHatasi.ulasilamadi(kod: "ag x/1").ekranMetni()
                    == "Sunucuya ulaşılamadı. İnternet bağlantınızı denetleyip yeniden deneyin.",
                "ulaşılamadı metni (kod ekrana yazılmaz)")
        let hepsi: [AnahtarHatasi] = [.anahtarYok, .abonelikYok, .sinirDoldu(donemBitisMs: nil), .cokSik(beklemeSn: nil),
                                      .imzaGecersiz, .gecersizIstek, .ulasilamadi(kod: "sunucu_hatasi")]
        denetle(hepsi.allSatisfy { !$0.ekranMetni(saatDilimi: istanbul).isEmpty && !$0.tanilamaKodu.isEmpty },
                "her anahtar hatasının ekran metni ve Tanılama kodu var")
        let denenenler: [AnahtarHatasi] = [.cokSik(beklemeSn: nil), .ulasilamadi(kod: "sunucu_hatasi")]
        denetle(hepsi.filter { $0.yenidenDenenir } == denenenler,
                "dilim yenilemede yalnız ağ/sunucu hatası ve çok sık yeniden denenir")
        let fiyatAcanlar: [AnahtarHatasi] = [.abonelikYok]
        denetle(hepsi.filter { $0.fiyatEkrani } == fiyatAcanlar, "fiyat ekranını yalnız abonelik_yok açar")
        let kodlar: [String] = hepsi.map { $0.tanilamaKodu }
        denetle(kodlar == ["anahtar_yok", "abonelik_yok", "sinir_doldu", "cok_sik", "imza_gecersiz", "gecersiz_istek",
                           "sunucu_hatasi"],
                "Tanılama kodları (anahtar, işlem ve ileti içermez)")
    }

    /// "Bu hafta kalan" metni ve yenilenme anının bulunma eki.
    static func kotaMetinleri() {
        let sureler: [(Int, String, String)] = [
            (8040, "2 sa 14 dk", "2 saat 14 dakika"), (7200, "2 sa", "2 saat"), (3600, "1 sa", "1 saat"),
            (599, "9 dk", "9 dakika"), (120, "2 dk", "2 dakika"), (59, "1 dk'dan az", "1 dakikadan az"),
            (0, "0 dk", "0 dakika"), (-5, "0 dk", "0 dakika"),
        ]
        var sureTamam = true
        for (saniye, kisa, sesli) in sureler {
            let gelenKisa = KotaMetni.kalan(saniye)
            let gelenSesli = KotaMetni.kalanSesli(saniye)
            if gelenKisa != kisa || gelenSesli != sesli {
                sureTamam = false
                print("    yanlış süre: \(saniye) → \(gelenKisa) / \(gelenSesli)")
            }
        }
        denetle(sureTamam, "kalan süre metni (ekran ve VoiceOver)")
        let ekler: [(Int, Int, String)] = [
            (14, 30, "da"), (9, 5, "te"), (20, 0, "de"), (0, 0, "da"), (13, 0, "te"), (14, 40, "ta"), (14, 50, "de"),
            (6, 0, "da"), (10, 0, "da"), (8, 1, "de"), (8, 2, "de"), (8, 4, "te"), (8, 7, "de"), (8, 8, "de"),
            (8, 9, "da"), (8, 16, "da"), (23, 59, "da"), (3, 0, "te"), (8, 20, "de"), (8, 10, "da"),
        ]
        var hepsi = true
        for (saat, dakika, ek) in ekler where KotaMetni.bulunmaEki(saat: saat, dakika: dakika) != ek {
            hepsi = false
            print("    yanlış ek: \(saat):\(dakika) beklenen \(ek)")
        }
        denetle(hepsi, "saatin bulunma eki okunuşa göre seçilir")

        let istanbul = TimeZone(secondsFromGMT: 3 * 3600) ?? .current
        // 3 Aralık 2026 Perşembe 21:05 UTC = 4 Aralık Cuma 00:05 (UTC+3): gün yerel saate göre yazılır.
        let geceYarisi = KotaMetni.yenilenme(donemBitisMs: 1_796_331_900_000, saatDilimi: istanbul)
        let geceTamam = geceYarisi.hasPrefix("4 Aralık") && geceYarisi.hasSuffix("00:05'te")
        denetle(geceTamam, "yenilenme anı yerel güne göre")
        if !geceTamam { print("    gelen: \(geceYarisi)") }
    }
}
