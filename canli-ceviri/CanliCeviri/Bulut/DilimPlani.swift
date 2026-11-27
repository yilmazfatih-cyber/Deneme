import Foundation

// Dilim zamanlaması (S03). Sunucudan gelen geçici anahtarla açılan Soniox akışı ("dilim") `sure_sn` saniye sonra
// kapanır. Dinleme kesilmesin diye dilim bitmeden yeni anahtar istenir, ikinci bir akış açılır ve uygun ilk anda
// mikrofon sesi ona devredilir. Bu dosya yalnız kararı verir: ne zaman yeni anahtar istenir, ne zaman devredilir,
// ne zaman durulur. Ağ, ses ve arayüz türü yoktur; zaman dışarıdan verilir (dilimin başından bu yana geçen saniye),
// bu yüzden `tests/ios/dilim-testi.swift` ile Mac'te `swiftc` ile derlenip sınanır. Kararı `BulutAkisi` uygular.

struct DilimPlani: Equatable {
    /// Yeni akışın hazırlığı ne durumda.
    enum Yenileme: Equatable {
        /// Yeni anahtar henüz istenmedi.
        case istenmedi
        /// Yeni anahtar isteniyor ya da yeni bağlantı kuruluyor.
        case isteniyor
        /// Yeni akış hazır: bağlandı ve başlangıç iletisi gönderildi.
        case hazir
        /// Yeni anahtar ya da yeni akış geçici bir nedenle alınamadı (ağ, sunucu hatası, çok sık istek).
        /// `an`: hatanın anı (dilimin başından saniye); yeniden deneme buna göre aralanır.
        case geciciHata(an: TimeInterval)
        /// Yeniden denemenin anlamı yok (kota doldu, üyelik yok, imza geçersiz).
        case kesinHata
    }

    enum Karar: Equatable {
        case bekle
        /// Yeni anahtar iste ve ikinci akışı aç.
        case anahtarIste
        /// Mikrofon sesini yeni akışa yönlendir, eskisini bitir.
        case devret
        /// Dilim bitti ve yeni akış yok: dinleme ilgili açıklamayla durur.
        case dur
    }

    /// Dilimin süresi, sn (sunucunun `sure_sn` değeri; koda sabit yazılmaz).
    let sureSn: Int
    /// Dilimin bitimine bu kadar sn kala yeni anahtar istenir.
    var yenilemePayi: TimeInterval = 25
    /// Yeni akış hazırsa en geç dilimin bitimine bu kadar sn kala devredilir (cümle arası beklenmez).
    var sonDevirPayi: TimeInterval = 5
    /// Geçici hatadan sonra yeni anahtar bu kadar sn sonra yeniden istenir.
    var denemeArasi: TimeInterval = 6
    /// Sunucu akışı kendisi kapatmazsa dilimin bitiminden bu kadar sn sonra durulur.
    var bitisPayi: TimeInterval = 3

    init(sureSn: Int) {
        self.sureSn = max(sureSn, 1)
    }

    private var sure: TimeInterval { TimeInterval(sureSn) }

    /// Yeni anahtarın isteneceği an (dilimin başından sn). Çok kısa dilimde dilimin yarısından önce istenmez.
    var yenilemeAni: TimeInterval { max(sure - yenilemePayi, sure / 2) }

    /// Yeni akış hazırsa devrin en geç yapılacağı an.
    var sonDevirAni: TimeInterval { max(sure - sonDevirPayi, yenilemeAni) }

    /// Yeni akış yoksa dinlemenin en geç duracağı an.
    var sonAn: TimeInterval { sure + bitisPayi }

    /// - Parameters:
    ///   - gecen: dilimin başından (anahtarın alındığı andan) bu yana geçen süre, sn.
    ///   - yenileme: yeni akışın hazırlık durumu.
    ///   - cumleArasi: eski akışta açık cümle yok (konuşmacı cümle arasında); devir için en uygun an.
    ///   - akisKapandi: eski akış kapandı (sunucu `temp_api_key_session_expired` ile dilimi bitirdi ya da devir
    ///     hazırlanırken bağlantı koptu).
    func karar(gecen: TimeInterval, yenileme: Yenileme, cumleArasi: Bool, akisKapandi: Bool) -> Karar {
        switch yenileme {
        case .istenmedi:
            return (akisKapandi || gecen >= yenilemeAni) ? .anahtarIste : .bekle
        case .isteniyor:
            // Eski akış kapandıysa da beklenir: devir bekleniyor. İstek ve bağlantı kendi süre sınırlarıyla biter.
            return .bekle
        case .hazir:
            return (akisKapandi || cumleArasi || gecen >= sonDevirAni) ? .devret : .bekle
        case .geciciHata(let an):
            if akisKapandi || gecen >= sonAn { return .dur }
            return (gecen - an >= denemeArasi) ? .anahtarIste : .bekle
        case .kesinHata:
            // Eski akış süresi dolana dek sürer; sonra dinleme durur.
            return (akisKapandi || gecen >= sonAn) ? .dur : .bekle
        }
    }
}
