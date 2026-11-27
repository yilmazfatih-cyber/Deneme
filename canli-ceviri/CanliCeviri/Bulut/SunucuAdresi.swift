// Geçici anahtar sunucusunun (S03; `canli-ceviri/sunucu`, Cloudflare Worker) kök adresi.
// Biçim: `https://…` kök adresi, sonunda `/` yok (ör. "https://canli-ceviri-anahtar.<hesap>.workers.dev").
// Sunucu 27.11.2026'da yayımlandı ve adres dolduruldu. Adres gizli değildir (anahtar değil, yalnız adres).
//
// Boşken: mağaza yapısında (`DENEME` yok, gömülü anahtar yok) bulut motoru seçilemez, cihaz motoru çalışır.
// Doluyken: mağaza yapısında bulut motoru çalışır ve Soniox anahtarı yalnız bu sunucudan, geçici olarak gelir
// (bkz. `SonioxAnahtarKaynagi`, `Anahtarlik.sunucudanAnahtar`). Yalnız `https` kabul edilir.
let sunucuAdresi = "https://canli-ceviri-anahtar.fatihbilaly.workers.dev"
