import Foundation

// Bulut motorunun saf mantık testi (S02 K2). XCTest ve simülatör gerektirmez; Mac koşucusunda şöyle çalışır:
//   swiftc -swift-version 5 -parse-as-library canli-ceviri/CanliCeviri/Bulut/SonioxCozucu.swift \
//     canli-ceviri/tests/ios/cozucu-testi.swift -o cozucu-testi && ./cozucu-testi
// Örnek yanıtlar Soniox belgelerindeki biçimdedir; gerçek akış bu sprintte gözlenmedi (ilke 8).

final class Sayac {
    var gecen = 0
    var kalan = 0
}

let sayac = Sayac()

func denetle(_ kosul: Bool, _ ad: String) {
    if kosul {
        sayac.gecen += 1
        print("GEÇTİ  \(ad)")
    } else {
        sayac.kalan += 1
        print("KALDI  \(ad)")
    }
}

func esit(_ gelen: [SonioxOlayi], _ beklenen: [SonioxOlayi], _ ad: String) {
    if gelen == beklenen {
        denetle(true, ad)
    } else {
        denetle(false, ad)
        print("    beklenen: \(beklenen)")
        print("    gelen:    \(gelen)")
    }
}

/// Asıl belirteç (`translation_status: original`).
func a(_ metin: String, kesin: Bool = true, dil: String = "en") -> [String: Any] {
    ["text": metin, "is_final": kesin, "translation_status": "original", "language": dil,
     "start_ms": 0, "end_ms": 100, "confidence": 0.9]
}

/// Çeviri belirteci (zaman damgası yok).
func c(_ metin: String, kesin: Bool = true) -> [String: Any] {
    ["text": metin, "is_final": kesin, "translation_status": "translation", "language": "tr",
     "source_language": "en", "confidence": 0.9]
}

/// Çevrilmeyen belirteç (`translation_status: none`).
func h(_ metin: String, dil: String) -> [String: Any] {
    ["text": metin, "is_final": true, "translation_status": "none", "language": dil]
}

let son: [String: Any] = ["text": "<end>", "is_final": true]

func yanit(_ belirtecler: [[String: Any]], ek: [String: Any] = [:]) -> String {
    var nesne: [String: Any] = ["tokens": belirtecler, "final_audio_proc_ms": 0, "total_audio_proc_ms": 0]
    for (ad, deger) in ek { nesne[ad] = deger }
    guard let veri = try? JSONSerialization.data(withJSONObject: nesne),
          let metin = String(data: veri, encoding: .utf8) else { return "" }
    return metin
}

func cumle(_ asil: String, _ ceviri: String, dil: String? = "en", beklendi: Bool = true, ms: Int = 0) -> SonioxOlayi {
    .cumle(SonioxCumle(asil: asil, ceviri: ceviri, dil: dil, ceviriBeklendi: beklendi, beklemeMs: ms))
}

func canli(_ asil: String, _ ceviri: String) -> SonioxOlayi {
    .canli(asil: asil, ceviri: ceviri)
}

@main
struct CozucuTesti {
    static func main() {
        ayirma()
        yenilenme()
        endIleKapanis()
        ceviriEnddenSonra()
        sessizlikleKapanis()
        ceviriGelmedi()
        hedefDildeKonusma()
        bosCumle()
        birlesme()
        sonrakiAsil()
        hataYaniti()
        hataSiniflari()
        finishedYaniti()
        bozukJson()
        pongVeDenetim()
        uzunCumle()
        enCokBekleme()
        kopus()
        baslangic()
        noktalama()

        print("")
        print("Çözücü testi: \(sayac.gecen) geçti, \(sayac.kalan) kaldı")
        exit(sayac.kalan == 0 ? 0 : 1)
    }

    /// K2: asıl ve çeviri belirteçlerinin ayrılması.
    static func ayirma() {
        var cozucu = SonioxCozucu()
        let olaylar = cozucu.isle(yanit([a("Hello"), a(" world"), c("Merhaba"), c(" dünya")]), simdi: 0)
        esit(olaylar, [canli("Hello world", "Merhaba dünya")], "asıl ve çeviri belirteçleri ayrılır")
    }

    /// K2: kesin olmayan belirteçler her yanıtta yenilenir, birikmez.
    static func yenilenme() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("Hel", kesin: false)]), simdi: 0), [canli("Hel", "")], "kesin olmayan belirteç görünür")
        esit(cozucu.isle(yanit([a("Hello"), a(" wor", kesin: false)]), simdi: 0.1), [canli("Hello wor", "")],
             "kesin olmayan belirteç yenilenir")
        esit(cozucu.isle(yanit([a(" world"), c("Mer", kesin: false)]), simdi: 0.2), [canli("Hello world", "Mer")],
             "kesinleşen belirteç bir kez eklenir")
        esit(cozucu.isle(yanit([c("Merhaba dünya")]), simdi: 0.3), [canli("Hello world", "Merhaba dünya")],
             "kesin olmayan çeviri yenilenir")
        esit(cozucu.isle(yanit([]), simdi: 0.4), [], "değişiklik yoksa olay yok")
    }

    /// K2: `<end>` ile cümle kapanışı (çeviri `<end>`'den önce tamam).
    static func endIleKapanis() {
        var cozucu = SonioxCozucu()
        let olaylar = cozucu.isle(yanit([a("Good"), a(" morning."), c("Günaydın."), son]), simdi: 5)
        esit(olaylar, [cumle("Good morning.", "Günaydın.")], "<end> cümleyi kapatır")
        if case .cumle(let kapanan)? = olaylar.first {
            denetle(kapanan.kelime == 2, "kelime sayısı")
        } else {
            denetle(false, "kelime sayısı")
        }
        // `<end>` belirtecinin translation_status değeri ne olursa olsun tanınır.
        var ikinci = SonioxCozucu()
        let sonCeviri: [String: Any] = ["text": "<end>", "is_final": true, "translation_status": "translation"]
        esit(ikinci.isle(yanit([a("Yes."), c("Evet."), sonCeviri]), simdi: 0), [cumle("Yes.", "Evet.")],
             "<end> çeviri durumuyla da tanınır")
    }

    /// K2: çeviri `<end>`'den sonra gelir.
    static func ceviriEnddenSonra() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("How are you?"), son]), simdi: 10), [canli("How are you?", "")],
             "<end> geldi, çeviri bekleniyor")
        esit(cozucu.isle(yanit([c("Nasılsın?")]), simdi: 10.25),
             [cumle("How are you?", "Nasılsın?", ms: 250), canli("", "")], "çeviri <end>'den sonra gelir")
    }

    static func sessizlikleKapanis() {
        var cozucu = SonioxCozucu()
        _ = cozucu.isle(yanit([a("OK"), son]), simdi: 0)
        esit(cozucu.isle(yanit([c("Tamam")]), simdi: 0.125), [canli("OK", "Tamam")], "noktalamasız çeviri bekler")
        esit(cozucu.zamanGecti(simdi: 0.25), [], "kısa bekleme dolmadı")
        esit(cozucu.zamanGecti(simdi: 0.625), [cumle("OK", "Tamam", ms: 625), canli("", "")],
             "sessizlik bekleyen cümleyi kapatır")
    }

    static func ceviriGelmedi() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("Hmm"), son]), simdi: 0), [canli("Hmm", "")], "çevirisiz cümle bekler")
        esit(cozucu.zamanGecti(simdi: 1), [], "uzun bekleme dolmadı")
        esit(cozucu.zamanGecti(simdi: 1.75), [cumle("Hmm", "", ms: 1750), canli("", "")],
             "çeviri gelmezse asıl metin tek başına çıkar")
    }

    /// KR13: konuşma hedef dildeyse çeviri gelmez; asıl metin beklemeden çıkar.
    static func hedefDildeKonusma() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([h("Merhaba", dil: "tr"), h(" nasılsın?", dil: "tr"), son]), simdi: 0),
             [cumle("Merhaba nasılsın?", "", dil: "tr", beklendi: false)], "hedef dildeki konuşma çevirisiz çıkar")
    }

    /// K2: boş cümle.
    static func bosCumle() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([son]), simdi: 0), [], "boş cümle olay üretmez")
        esit(cozucu.isle(yanit([son, son]), simdi: 1), [], "art arda <end> olay üretmez")
        esit(cozucu.isle(yanit([a("  "), son]), simdi: 2), [], "yalnız boşluk olan cümle olay üretmez")
        esit(cozucu.zamanGecti(simdi: 10), [], "boş cümle beklemez")
    }

    /// Bekleyen cümlenin çevirisi gelmeden sonraki cümle başlarsa iki cümle birleşir.
    static func birlesme() {
        var cozucu = SonioxCozucu()
        _ = cozucu.isle(yanit([a("First."), son]), simdi: 0)
        esit(cozucu.isle(yanit([a(" Second.")]), simdi: 0.5), [canli("First. Second.", "")], "çevirisi gelmeyen cümle birleşir")
        esit(cozucu.isle(yanit([c("Birinci. İkinci."), son]), simdi: 0.75),
             [cumle("First. Second.", "Birinci. İkinci."), canli("", "")], "birleşen cümle çevirisiyle kapanır")
    }

    /// Bekleyen cümlenin çevirisi varsa sonraki cümlenin kesin asıl belirteci onu kapatır.
    static func sonrakiAsil() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("Yes"), c("Evet"), son]), simdi: 0), [canli("Yes", "Evet")], "noktalamasız çeviri bekler (2)")
        esit(cozucu.isle(yanit([a(" Next")]), simdi: 0.125), [cumle("Yes", "Evet", ms: 125), canli("Next", "")],
             "sonraki asıl belirteç bekleyeni kapatır")
    }

    /// K2: hata yanıtı.
    static func hataYaniti() {
        var cozucu = SonioxCozucu()
        let ileti = yanit([], ek: ["error_code": 401, "error_type": "unauthenticated",
                                   "error_message": "Incorrect API key provided.", "request_id": "x"])
        esit(cozucu.isle(ileti, simdi: 0),
             [.hata(SonioxHatasi(kod: 401, tur: "unauthenticated", sinif: .gecersizAnahtar))], "hata yanıtı")

        var ikinci = SonioxCozucu()
        _ = ikinci.isle(yanit([a("Half"), c("Yarım")]), simdi: 0)
        let hizmet = "{\"error_code\":503,\"error_type\":\"service_unavailable\",\"error_message\":\"x\"}"
        esit(ikinci.isle(hizmet, simdi: 1),
             [canli("", ""), .hata(SonioxHatasi(kod: 503, tur: "service_unavailable", sinif: .gecici))],
             "hata yarım cümleyi atar")

        var ucuncu = SonioxCozucu()
        let garip = "{\"error_code\":\"429\",\"error_type\":\"Yeni Tür! <x>\"}"
        esit(ucuncu.isle(garip, simdi: 0), [.hata(SonioxHatasi(kod: 429, tur: "yenitrx", sinif: .kota))],
             "tanınmayan hata türü temizlenir, koda göre sınıflanır")
    }

    /// K6: her hata türü doğru sınıfa düşer.
    static func hataSiniflari() {
        let beklenen: [(String, Int, SonioxHataSinifi)] = [
            ("unauthenticated", 401, .gecersizAnahtar),
            ("permission_denied", 403, .izinYok),
            ("organization_balance_exhausted", 402, .bakiye),
            ("organization_monthly_budget_exhausted", 402, .bakiye),
            ("project_monthly_budget_exhausted", 402, .bakiye),
            ("limit_exceeded", 429, .kota),
            ("max_concurrent_connections_reached", 429, .kota),
            ("max_duration_reached", 413, .sureSiniri),
            ("invalid_request", 400, .gecersizIstek),
            ("model_not_available", 400, .gecersizIstek),
            ("request_timeout", 408, .gecici),
            ("service_unavailable", 503, .gecici),
            ("internal_error", 500, .gecici),
            ("bilinmiyor", 402, .bakiye),
            ("bilinmiyor", 0, .diger),
        ]
        var hepsi = true
        for (tur, kod, sinif) in beklenen where SonioxCozucu.sinif(tur: tur, kod: kod) != sinif {
            hepsi = false
            print("    yanlış sınıf: \(tur) \(kod)")
        }
        denetle(hepsi, "hata türleri sınıflanır")
        denetle(SonioxHataSinifi.gecici.yenidenDenenir && !SonioxHataSinifi.gecersizAnahtar.yenidenDenenir
                    && !SonioxHataSinifi.bakiye.yenidenDenenir && !SonioxHataSinifi.sureSiniri.yenidenDenenir,
                "yalnız geçici hatalar yeniden denenir")
        let siniflar: [SonioxHataSinifi] = [.gecersizAnahtar, .izinYok, .bakiye, .kota, .sureSiniri, .gecersizIstek,
                                            .gecici, .diger]
        denetle(siniflar.allSatisfy { !$0.ekranMetni.isEmpty }, "her hata sınıfının ekran metni var")
    }

    /// K2: `finished` yanıtı.
    static func finishedYaniti() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("Bye"), c("Hoşça kal")]), simdi: 0), [canli("Bye", "Hoşça kal")], "yarım cümle canlı görünür")
        esit(cozucu.isle(yanit([], ek: ["finished": true]), simdi: 1),
             [cumle("Bye", "Hoşça kal"), canli("", ""), .bitti], "finished yarım cümleyi kapatır ve akışı bitirir")

        var ikinci = SonioxCozucu()
        esit(ikinci.isle(yanit([], ek: ["finished": true]), simdi: 0), [.bitti], "boş finished")
    }

    /// K2: bozuk JSON.
    static func bozukJson() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle("{bozuk", simdi: 0), [.bozuk], "bozuk JSON")
        esit(cozucu.isle("", simdi: 0), [.bozuk], "boş çerçeve")
        esit(cozucu.isle("[1,2]", simdi: 0), [.bozuk], "nesne olmayan JSON")
        esit(cozucu.isle("{\"tokens\":\"x\"}", simdi: 0), [], "belirteç listesi yanlış türde")
        esit(cozucu.isle("{\"tokens\":[{\"text\":5},{\"is_final\":true}]}", simdi: 0), [], "metinsiz belirteç atlanır")
        // Bozuk çerçeve durumu bozmaz.
        esit(cozucu.isle(yanit([a("Fine."), c("İyi."), son]), simdi: 1), [cumle("Fine.", "İyi.")], "bozuk çerçeveden sonra akış sürer")
    }

    static func pongVeDenetim() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle("{\"type\":\"pong\",\"id\":7}", simdi: 0), [.pong(7)], "pong")
        esit(cozucu.isle("{\"type\":\"pong\"}", simdi: 0), [.pong(nil)], "kimliksiz pong")
        esit(cozucu.isle("{\"type\":\"reconnect\",\"reconnect_token\":\"x\"}", simdi: 0), [], "tanınmayan denetim iletisi")
        denetle(SonioxCozucu.pingIletisi(3) == "{\"type\":\"ping\",\"id\":3}", "ping iletisi")
    }

    /// `<end>` gelmeden uzun süren konuşma, çeviri cümle sonuna gelince kapanır.
    static func uzunCumle() {
        var cozucu = SonioxCozucu()
        esit(cozucu.isle(yanit([a("One."), c("Bir.")]), simdi: 0), [canli("One.", "Bir.")], "kısa cümle <end> bekler")
        esit(cozucu.isle(yanit([a(" Two"), c(" İki")]), simdi: 7), [canli("One. Two", "Bir. İki")],
             "uzun cümle noktalama bekler")
        esit(cozucu.isle(yanit([a("."), c(".")]), simdi: 8), [cumle("One. Two.", "Bir. İki."), canli("", "")],
             "uzun cümle noktalamada kapanır")
        esit(cozucu.isle(yanit([son]), simdi: 9), [], "sonradan gelen <end> boş cümledir")
    }

    static func enCokBekleme() {
        var cozucu = SonioxCozucu()
        _ = cozucu.isle(yanit([a("Wait"), son]), simdi: 0)
        esit(cozucu.isle(yanit([c("Bek", kesin: false)]), simdi: 0.5), [canli("Wait", "Bek")], "kesinleşmemiş çeviri akar")
        esit(cozucu.zamanGecti(simdi: 2), [], "kesinleşmemiş çeviri varken beklenir")
        esit(cozucu.zamanGecti(simdi: 4.5), [cumle("Wait", "Bek", ms: 4500), canli("", "")],
             "en çok bekleme dolunca kesinleşmemiş çeviri kullanılır")
    }

    /// KR5: bağlantı koparsa bekleyen cümle çıkar, yarım cümle atılır.
    static func kopus() {
        var cozucu = SonioxCozucu()
        _ = cozucu.isle(yanit([a("Done"), c("Bitti"), son, a(" Half", kesin: false)]), simdi: 0)
        esit(cozucu.kapat(simdi: 0.25), [cumle("Done", "Bitti", ms: 250), canli("", "")], "kopuşta bekleyen cümle çıkar")
        esit(cozucu.kapat(simdi: 1), [], "ikinci kapatma olay üretmez")

        var ikinci = SonioxCozucu()
        _ = ikinci.isle(yanit([a("Half"), c("Yarım")]), simdi: 0)
        esit(ikinci.kapat(simdi: 1), [canli("", "")], "kopuşta yarım cümle atılır")
    }

    /// K4: başlangıç iletisinin alanları; `api_key` yok.
    static func baslangic() {
        func coz(_ metin: String) -> [String: Any] {
            guard let veri = metin.data(using: .utf8),
                  let nesne = try? JSONSerialization.jsonObject(with: veri) else { return [:] }
            return (nesne as? [String: Any]) ?? [:]
        }
        let belirli = coz(SonioxCozucu.baslangicIletisi(kaynak: "en", hedef: "tr"))
        let ceviri = belirli["translation"] as? [String: Any]
        denetle(belirli["model"] as? String == "stt-rt-v6" && belirli["audio_format"] as? String == "pcm_s16le"
                    && belirli["sample_rate"] as? Int == 16000 && belirli["num_channels"] as? Int == 1
                    && belirli["enable_endpoint_detection"] as? Bool == true
                    && (belirli["language_hints"] as? [String]) == ["en"]
                    && ceviri?["type"] as? String == "one_way" && ceviri?["target_language"] as? String == "tr",
                "başlangıç iletisinin alanları")
        denetle(belirli["api_key"] == nil && belirli["enable_language_identification"] == nil,
                "başlangıç iletisinde api_key yok")

        let otomatik = coz(SonioxCozucu.baslangicIletisi(kaynak: nil, hedef: "de"))
        let hedef = (otomatik["translation"] as? [String: Any])?["target_language"] as? String
        denetle(otomatik["language_hints"] == nil && otomatik["enable_language_identification"] as? Bool == true
                    && hedef == "de" && otomatik["api_key"] == nil,
                "otomatik dilde ipucu yok, dil tanıma açık")
    }

    static func noktalama() {
        denetle(SonioxCozucu.cumleSonu("Tamam.") && SonioxCozucu.cumleSonu("Öyle mi?\" ")
                    && SonioxCozucu.cumleSonu("これは。") && !SonioxCozucu.cumleSonu("Tamam,")
                    && !SonioxCozucu.cumleSonu("") && !SonioxCozucu.cumleSonu("\""),
                "cümle sonu noktalaması")
    }
}
