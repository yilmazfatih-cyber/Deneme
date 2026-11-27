import Foundation

/// Bulut motorunun (Soniox) anahtarının geldiği TEK yer (S02 tur 3). `BulutAkisi` her yeni akışta, yeniden bağlanma
/// dahil, anahtarı buradan yeniden ister; başka hiçbir yer anahtarı okumaz.
///
/// Bugün: kullanıcının (geliştirici bölümünde) girdiği anahtar, yoksa yapıya gömülü anahtar (`Anahtarlik`).
/// Sonraki tur: mağaza yapısında anahtar bir sunucudan geçici anahtar olarak gelecek; sunucu çağrısı yalnız bu
/// işlevin içine konur, çağıranlar değişmez. Anahtar hiçbir kayda ve ekrana yazılmaz.
enum SonioxAnahtarKaynagi {
    /// Kullanılabilir anahtar yok.
    struct AnahtarYok: Error {}

    @MainActor
    static func anahtarAl() async throws -> String {
        let anahtar = Anahtarlik.gecerliSonioxAnahtari
        guard !anahtar.isEmpty else { throw AnahtarYok() }
        return anahtar
    }
}
