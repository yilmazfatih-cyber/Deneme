import Foundation

/// Anahtar sunucusu istekleri: çerez ve önbellek tutmayan oturum; bağlantı yoksa beklemeden hata verir. Toplam süre
/// sınırı (bağlantı + yanıt + gövde) `sunucuSuresi`.
private let sunucuOturumu: URLSession = {
    let ayar = URLSessionConfiguration.ephemeral
    ayar.waitsForConnectivity = false
    ayar.timeoutIntervalForRequest = sunucuSuresi
    ayar.timeoutIntervalForResource = sunucuSuresi
    return URLSession(configuration: ayar)
}()

/// Bulut motorunun (Soniox) anahtarının geldiği TEK yer (S02 tur 3). `BulutAkisi` her yeni akışta, yeniden bağlanma
/// ve dilim devri dahil, anahtarı buradan yeniden ister; başka hiçbir yer anahtarı okumaz.
///
/// 1. Kullanıcının (geliştirici bölümünde) girdiği anahtar, yoksa yapıya gömülü anahtar (`Anahtarlik`; deneme yapısı).
///    Bu anahtarlarda süre sınırı ve kota bilgisi yoktur.
/// 2. Yerel anahtar yoksa ve mağaza yapısında sunucu adresi doluysa (S03; `Anahtarlik.sunucudanAnahtar`): geçerli
///    aboneliğin App Store imzalı işlemi geçici anahtar sunucusuna gönderilir; sunucu tek kullanımlık, süre sınırlı
///    bir Soniox anahtarı ve kalan kotayı döndürür. Mağaza yapısında uygulamanın içinde uzun ömürlü anahtar yoktur.
///
/// Anahtar, imzalı işlem ve işlem kimliği hiçbir kayda, ekrana ve panoya yazılmaz. Tanılama'ya yalnız şunlar yazılır:
/// `sunucu  istek`, `sunucu  anahtar alındı <ms> ms süre=<sn> kalan=<sn>`, `sunucu  hata <kod>`.
enum SonioxAnahtarKaynagi {
    /// Alınamazsa `AnahtarHatasi` fırlatır.
    @MainActor
    static func anahtarAl() async throws -> SonioxAnahtari {
        let yerel = Anahtarlik.gecerliSonioxAnahtari
        if !yerel.isEmpty { return SonioxAnahtari(anahtar: yerel) }
        guard Anahtarlik.sunucudanAnahtar else { throw AnahtarHatasi.anahtarYok }
        return try await sunucudanAl()
    }

    /// Geçici anahtarı sunucudan ister; kalan kotayı `Kota`'ya yazar.
    @MainActor
    private static func sunucudanAl() async throws -> SonioxAnahtari {
        let kayit = Tanilama.ortak
        guard let adres = AnahtarSunucusu.adres(kok: sunucuAdresi) else {
            kayit.kaydet("sunucu", "hata adres_gecersiz", uyari: true)
            throw AnahtarHatasi.ulasilamadi(kod: "adres_gecersiz")
        }
        // İmzalı işlem yalnız istek gövdesinde, yalnız bu sunucuya gider.
        guard let islem = await Abonelik.imzaliIslem(),
              let govde = AnahtarSunucusu.istekGovdesi(islem: islem) else {
            kayit.kaydet("sunucu", "hata islem_yok", uyari: true)
            throw AnahtarHatasi.abonelikYok
        }
        kayit.kaydet("sunucu", "istek")
        let bas = Date()
        switch await gonder(govde, adres) {
        case .success(let anahtar):
            let kalan = anahtar.kalanSn.map { "\($0)" } ?? "?"
            kayit.kaydet("sunucu", "anahtar alındı \(gecenMs(bas)) ms süre=\(anahtar.sureSn ?? 0) kalan=\(kalan)")
            Kota.ortak.guncelle(kalanSn: anahtar.kalanSn, donemBitisMs: anahtar.donemBitisMs)
            return anahtar
        case .failure(let hata):
            kayit.kaydet("sunucu", "hata \(hata.tanilamaKodu)", uyari: true)
            if case .sinirDoldu(let donemBitisMs) = hata {
                Kota.ortak.guncelle(kalanSn: 0, donemBitisMs: donemBitisMs)
            }
            throw hata
        }
    }

    /// İsteği gönderir ve yanıtı çözer (ana aktör dışında). Ağ hatasında yalnız alan/kod alınır (ilke 3).
    private static func gonder(_ govde: Data, _ adres: URL) async -> Result<SonioxAnahtari, AnahtarHatasi> {
        var istek = URLRequest(url: adres)
        istek.httpMethod = "POST"
        istek.timeoutInterval = sunucuSuresi
        istek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        istek.httpBody = govde
        do {
            let (veri, yanit) = try await sunucuOturumu.data(for: istek)
            let http = yanit as? HTTPURLResponse
            return AnahtarSunucusu.yanitiCoz(durum: http?.statusCode ?? 0, govde: veri,
                                             retryAfter: http?.value(forHTTPHeaderField: "Retry-After"))
        } catch {
            let n = error as NSError
            return .failure(.ulasilamadi(kod: "ag \(n.domain)/\(n.code)"))
        }
    }
}
