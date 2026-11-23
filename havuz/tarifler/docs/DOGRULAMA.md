# Doğrulama kayıtları

Her kayıt gerçek bir koşudan alındı; yeni koşu en üste eklenir. Komutlar `havuz/tarifler/` klasöründen
çalıştırıldı. "DENENMEDİ" yazan adım geçmiş sayılmaz: o ortamda yapılamadı ve nedeni yanında yazılıdır.

## 2026-11-23 — ortak araçla uzun denetim ve düzeltme sonrası yeniden doğrulama

**1. `python3 havuz/araclar/denetle.py tarifler --uzun`** (depo kökünden; `havuz.json → denetle` ve
`uzunDenetim`, tarifler'in `.venv`'i etkin). `PLAYWRIGHT_CHROMIUM_EXECUTABLE` verilmedi, varsayılan
`/opt/pw-browsers/chromium` kullanıldı. 10:26:58–10:33:48 UTC arası koştu. Sonuç **Hepsi yeşil (1 temel)**, 410,7 sn.
Tarif süreleri: belgeye-soru-uygulamasi 86,3 sn · csvden-tahmin-servisi 52,4 sn · kendi-modelinle-sohbet 42,0 sn
· site-iletisim-formu-api 119,5 sn · tek-sunucuda-yayin 93,1 sn. DENENMEDİ adımları aşağıdaki tam koşudakilerle
aynı. Süreler makinenin o anki yüküne göre ilk koşudan ±%30 farklı.

Bulgu: etkin `.venv` yüzünden `uv sync` (veri, dil-modeli) şu uyarıyı bastı:
`VIRTUAL_ENV=…/tarifler/.venv does not match the project environment path .venv and will be ignored`. Uyarı
zararsızdı (kurulum doğru yere gitti) ama yanıltıcıydı. Düzeltme: `tarifcik/kurulum.py → python_kur` kurulum
komutlarına `VIRTUAL_ENV`'i geçirmiyor.

**2. Düzeltmeden sonra**, `python_kur` kullanan üç tarif etkin bir `.venv` altında yeniden doğrulandı (`VIRTUAL_ENV`
ve `PATH` tarifler'in `.venv`'ine ayarlı). Üçü de geçti ve uyarı çıkmadı: csvden-tahmin-servisi 46,9 sn ·
kendi-modelinle-sohbet 41,0 sn · belgeye-soru-uygulamasi 79,7 sn. Öteki iki tarif yalnız `npm ci` kullanıyor; bu
değişiklik onlara dokunmuyor. Hızlı denetim (`scripts/check.py`) yeniden yeşil.

## 2026-11-23 — tam koşu: `tarif.py dogrula --hepsi`

**Sonuç: 5/5 tarif geçti** (çıkış kodu 0). Başlangıç 10:14:26, bitiş 10:22:31 UTC: toplam **8 dk 5 sn**.
Her tarif kendi geçici klasöründe kuruldu, doğrulandı ve silindi; koşudan sonra çalışan süreç kalmadı (`ps`).

**Ortam:** Linux 6.18 (sanal makine; systemd PID 1 değil), 4 çekirdek (paylaşımlı), 15 GB bellek; Python 3.13.18,
Node 22.23.4, npm 10.9.9, uv 0.11.32; Chromium: Google Chrome for Testing 153.0.8010.12
(`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`). npm ve uv önbellekleri doluydu (paketler aynı
makinede daha önce indirilmişti); bu yüzden kurulum adımları kısa. Önbellek boşken süre ölçülmedi.

**Havuz:** depo `728cd15`; kullanılan temellerin (`uygulama`, `site`, `yz`, `dil-modeli`, `ml-temel`, `veri`,
`araclar`) son değişikliği `9600e4d`, kayıtsız değişiklikleri yok. Bütün yamalar bu hâle uygulandı.

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium python3 tarif.py dogrula --hepsi \
  --calisma <scratchpad>/tarifler/calisma --json <scratchpad>/tarifler/hepsi.json
```

| Tarif | Sonuç | Süre (kur + doğrula) | Temellerin kendi denetimi | Uçtan uca | DENENMEDİ |
| --- | --- | --- | --- | --- | --- |
| belgeye-soru-uygulamasi | GEÇTİ | 87 sn (9 + 77) | `uygulama` `npm run check`: ortak 115, API 200, web 128, betik 5 test + tip, lint, biçim; web derlemesi | gerçek yz (sahte sağlayıcı, anahtarlı) + gerçek API; Playwright 6/6 (390 ve 360, axe); yz kapalıyken 500 | yok |
| csvden-tahmin-servisi | GEÇTİ | 50 sn (2 + 48) | `ml-temel` 480 test (8 yavaş test seçilmedi); `veri` 320 test (2 atlandı); ikisinde ruff + mypy | hat baştan sona; servis: örnek istek, 401, 400 | yok |
| kendi-modelinle-sohbet | GEÇTİ | 40 sn (3 + 37) | `yz` 415 test (6 atlandı) + ruff + mypy | gerçek `dil_modeli sun`; 4 sözleşme denetimi; yz `modeller`, `sohbet`, `degerlendir`, `cikar`; `baglanti/dene.py` | yok |
| site-iletisim-formu-api | GEÇTİ | 158 sn (15 + 143) | `uygulama`: 115 / 202 / 124 / 5 test; `site`: astro check, lint, biçim, 315 test, site denetimi | Playwright 3/3 (JS açık, JS kapalı, bal küpü); posta kutusu; CORS; 403; 429 | yok |
| tek-sunucuda-yayin | GEÇTİ | 132 sn (22 + 110) | `uygulama`: 115 / 195 / 124 / 5 test (yedek saklama + geri yükleme testleri dahil) | üretim kipi, çalışırken yedek, SIGTERM, geri yükleme tatbikatı, `saglik.sh`, `site-yayinla.sh` ×2, `systemd-analyze verify`, `bash -n` | shellcheck, `caddy validate`, birimlerin systemd ile çalışması, `guncelle.sh` uçtan uca |

Test sayıları koşunun çıktısından alındı. `uygulama`'nın API test sayısı tarife göre değişir, çünkü her tarif
kendi testlerini ekler: Sor ucu, iletişim ucu ya da yedek/geri yükleme testleri.

### Koşuda ölçülen değerler (README'lerdeki "beklenen" satırlarıyla karşılaştırıldı, tutuyor)

- **belgeye-soru-uygulamasi:** `/api/sor` yanıtı `Belgelere göre: Ürünü teslimden sonraki 14 gün içinde iade
  edebilirsiniz. [1]`, kaynak 1 (`iade.md`); yz kapalıyken `500` ve "Yapay zekâ hizmetine şu an ulaşılamıyor…".
- **csvden-tahmin-servisi:** `churn: 3000 temiz, 3115 kirli satır, 3345 bozulma`; `2687 değer düzeltildi, 41
  birebir yineleme atıldı`; hazırlıkta 3074 satır, atılan sızıntı sütunu `gercek_olasilik`; en iyi model doğrusal;
  sınama ROC-AUC **0,730**. Örnek istekte olasılıklar 0,010212 (düşük risk) ve 0,968026 (yüksek risk).
- **kendi-modelinle-sohbet:** SSE akışında 9 parça + `usage` + `[DONE]`; `tools` → 400; `response_format` → 200
  ama çıktı JSON değil (sunucu alanı yok sayıyor). `degerlendir` (5 örnek): doğruluk %0, biçim geçerliliği %0,
  bağlantı hatası 0, gecikme p50 0,03 sn / p95 0,04 sn. `cikar`: istem katmanı 3 turda JSON üretemedi, alan
  katmanı "BAŞARILI" dedi ama değerler anlamsız. Bu, beklenen ve README'de yorumlanan sonuçtur: örnek model
  talimat için ince ayar görmemiştir.
- **site-iletisim-formu-api:** posta kutusunda yalnız iki gerçek ileti var (JS açık ve JS kapalı), bal küpü iletisi
  yok. Yabancı köken 403 aldı. IP bütçesinin kalan 2 iletisi geçti, sonraki istek `429` ve `Retry-After` aldı.
- **tek-sunucuda-yayin:** yedekten sonra eklenen kullanıcı B, geri yüklemeden sonra yok; kullanıcı A giriş yapabiliyor.
  SIGTERM ile çıkış kodu 0. `site-yayinla.sh` ikinci sürümde `current` bağlantısını yeni sürüme çevirdi.

### Adım adım (koşunun JSON çıktısından)

**belgeye-soru-uygulamasi**: kur 9 sn (`npm ci` 8,0 sn; yz ortamı 1,0 sn). Doğrulama adımları:

| Adım | Sonuç | Süre |
| --- | --- | --- |
| uygulama: npm run check | GEÇTİ | 64,9 sn |
| uygulama: web derlemesi | GEÇTİ | 2,8 sn |
| yz: örnek belgeleri dizinle | GEÇTİ | 0,7 sn |
| yz sunucusu: başlat (sahte sağlayıcı, anahtarlı) | GEÇTİ | 1,1 sn |
| API: başlat ve /api/health | GEÇTİ | 0,5 sn |
| yz: anahtarsız istek 401, anahtarlı istek yanıt verir | GEÇTİ | 0,0 sn |
| API: oturumsuz 401; kayıt (belirteç kipi) → soru → yanıt + kaynak | GEÇTİ | 0,2 sn |
| Playwright: e2e/sor (telefon 390 + 360, axe) | GEÇTİ | 6,7 sn |
| yz kapalıyken API anlaşılır hata döndürür (500, suçlamayan ileti) | GEÇTİ | 0,2 sn |

**csvden-tahmin-servisi**: kur 2 sn. Doğrulama adımları:

| Adım | Sonuç | Süre |
| --- | --- | --- |
| ml-temel: python scripts/check.py | GEÇTİ | 23,7 sn |
| veri: python scripts/check.py | GEÇTİ | 17,1 sn |
| hat: üret → profil → temizle → hazırla → eğit | GEÇTİ | 6,7 sn |
| hat çıktıları: sızıntı sütunu yok, rapor ve ölçüt makul | GEÇTİ | 0,0 sn |
| servis: başlat ve /saglik | GEÇTİ | 0,5 sn |
| servis: curl ile örnek istek (düşük < yüksek risk) | GEÇTİ | 0,0 sn |
| servis: anahtarsız 401, hatalı girdi 400 (alan yoluyla) | GEÇTİ | 0,0 sn |

**kendi-modelinle-sohbet**: kur 3 sn. Doğrulama adımları:

| Adım | Sonuç | Süre |
| --- | --- | --- |
| yz: python scripts/check.py | GEÇTİ | 24,9 sn |
| dil-modeli sunucusu: başlat | GEÇTİ | 4,0 sn |
| sözleşme: /v1/models ve akışsız sohbet (kullanım bilgisiyle) | GEÇTİ | 0,1 sn |
| sözleşme: akış (SSE) parçaları, kullanım ve [DONE] | GEÇTİ | 0,0 sn |
| sözleşme: araç çağrısı 400 ile reddedilir (yz metin kipine geçer) | GEÇTİ | 0,0 sn |
| sözleşme: response_format sessizce yok sayılır (bilgi) | GEÇTİ | 0,0 sn |
| yz modeller | GEÇTİ | 0,3 sn |
| yz sohbet -m (akışlı) | GEÇTİ | 0,4 sn |
| yz degerlendir (5 örnek) | GEÇTİ | 0,4 sn |
| değerlendirme özeti: 5 örnek, sıfır bağlantı hatası | GEÇTİ | 0,0 sn |
| yz cikar: biçim geçerli ama anlamsız (dürüst sonuç kaydı) | GEÇTİ | 3,3 sn |
| baglanti/dene.py (tek komut) | GEÇTİ | 3,4 sn |

**site-iletisim-formu-api**: kur 15 sn (iki `npm ci`). Doğrulama adımları:

| Adım | Sonuç | Süre |
| --- | --- | --- |
| uygulama: npm run check | GEÇTİ | 81,0 sn |
| site: npm run check | GEÇTİ | 49,1 sn |
| API: başlat ve /api/health | GEÇTİ | 0,5 sn |
| site: PUBLIC_FORM_ENDPOINT ile derle | GEÇTİ | 5,9 sn |
| site: statik sunucu | GEÇTİ | 0,5 sn |
| Playwright: JS açık/kapalı gönderim, bal küpü | GEÇTİ | 4,7 sn |
| posta kutusu: iki gerçek ileti var, bot iletisi yok | GEÇTİ | 0,0 sn |
| CORS ön isteği: site kökenine izin, yabancı kökene başlık yok | GEÇTİ | 0,0 sn |
| yabancı kökenden gönderim 403; JSON bal küpü 200 ama e-posta yok | GEÇTİ | 1,0 sn |
| IP hız sınırı: 2 ileti daha geçer, sonraki 429 + Retry-After | GEÇTİ | 0,0 sn |

**tek-sunucuda-yayin**: kur 22 sn (iki `npm ci`). Doğrulama adımları:

| Adım | Sonuç | Süre |
| --- | --- | --- |
| uygulama: npm run check | GEÇTİ | 85,5 sn |
| uygulama: web derlemesi | GEÇTİ | 3,5 sn |
| üretim kipi: ortam dosyasıyla başlar, /api/health | GEÇTİ | 0,5 sn |
| web aynı kökenden: CSP, HSTS, /assets önbelleği; kullanıcı A | GEÇTİ | 0,2 sn |
| yedek: sunucu çalışırken (--klasor --sakla 14) | GEÇTİ | 0,3 sn |
| yedekten sonra veri değişir (kullanıcı B) | GEÇTİ | 0,2 sn |
| saglik.sh: sağlıklıyken 0; yanıt yoksa yeniden başlatma komutu çalışır | GEÇTİ | 0,1 sn |
| SIGTERM ile düzgün kapanış (çıkış kodu 0, 'kapandı') | GEÇTİ | 0,0 sn |
| geri yükleme: npm run restore karşılığı (--onayla) | GEÇTİ | 0,3 sn |
| geri yükleme tatbikatı: A giriş yapar, B yok (veri yedekteki hâlde) | GEÇTİ | 1,0 sn |
| site-yayinla.sh (1. sürüm) | GEÇTİ | 14,1 sn |
| site-yayinla.sh (2. sürüm) | GEÇTİ | 3,9 sn |
| site: current en yeni sürümü gösterir, sayfalar yerinde | GEÇTİ | 0,0 sn |
| bash -n saglik.sh / site-yayinla.sh / guncelle.sh | GEÇTİ | 0,0 sn |
| shellcheck | DENENMEDİ (ortamda shellcheck yok) | |
| systemd-analyze verify (5 birim; node yolu bu makineninkiyle) | GEÇTİ | 0,1 sn |
| caddy validate | DENENMEDİ (ortamda Caddy yok; Caddyfile hiç doğrulanmadı) | |
| systemd birimlerini gerçekten çalıştırma | DENENMEDİ (ortamda systemd PID 1 değil) | |
| guncelle.sh uçtan uca | DENENMEDİ (systemd ve uzak git deposu yok; yalnız `bash -n`) | |

`systemd-analyze verify` bu ortamda gerçekten denetliyor. Ayrı bir denemede bozuk bir birim (göreli
`ExecStart`) çıkış kodu 1 verdi. Bilinmeyen anahtar ya da geçersiz değer ise çıkış kodu 0 ile stderr'e uyarı
yazıyor. Doğrulama stderr'de herhangi bir satır görürse adımı KALDI sayar.

## 2026-11-23 — hızlı denetim, temiz durumdan

```bash
rm -rf .venv .mypy_cache .ruff_cache .pytest_cache havuz_tarifler.egg-info   # + __pycache__ klasörleri
python3 ../araclar/denetle.py tarifler --kur      # depo kökünden: python3 havuz/araclar/denetle.py tarifler --kur
```

Sonuç: **Hepsi yeşil (1 temel)**, 6,2 sn: `requirements-dev.lock`'tan kurulum, ruff, ruff biçim, mypy (çekirdek +
her tarif ayrı) ve pytest (**36 test geçti**). `python3 ../araclar/durum.py`: `tarifler … standart ✓`.
`python3 ../araclar/kacis.py --denetle havuz/tarifler`: görünmez karakter yok.

## Geliştirme sırasında yakalanan ve düzeltilen hatalar

Her tarif yazılırken çalışma kopyasında en az bir kez baştan sona koşuldu. Aşağıdaki hataları bu koşular
yakaladı; hepsi düzeltildi ve yukarıdaki tam koşu temiz.

- `tek-sunucuda-yayin`: yedek adındaki tarih `Date.UTC` ile çözülürken taşan bir değer (ör. 13. ay) sessizce
  ileri kayıyordu (13. ay → ertesi yılın ocak ayı). Artık tarihin bileşenleri denetleniyor ve geçersiz ad
  reddediliyor (`backupRestore.test.ts`).
  `verifyBackup` bozuk dosyada `try` dışında hata fırlatıyordu. Testteki sahte sunucu `spawnSync` yüzünden
  hiç yanıt veremiyordu.
- `tarif.py yakala`: `.sh` dosyalarının çalıştırma izni kayboluyordu. İkili dosyada (png) çöküyordu; artık
  bayt karşılaştırması yapılıyor, UTF-8 olmayan dosya açık bir iletiyle reddediliyor.
- `kendi-modelinle-sohbet`: ayar dosyasındaki bir yorum `yapili_kip: kapali`'nın şema katmanını atladığını
  söylüyordu. Gözlem bunun yanlış olduğunu gösterdi ve yorum düzeltildi.
- `csvden-tahmin-servisi`: `temizle --yineleme-sutunlari musteri_id` 3115 satırı 1 satıra indirdi. Bulanık
  eşleme kimlikleri birbirine benzer buluyor. Hat bu seçeneği kullanmıyor; README "Sık sorunlar"da anlatılıyor.

## Bu koşuda denenmeyenler (bütün tarifler)

- Windows ve macOS (süreç grupları ve `bash` betikleri POSIX varsayar).
- Boş npm/uv önbelleğiyle kurulum süresi.
- Gerçek dış hizmetler: e-posta sağlayıcısı (yalnız `console` + `mail_outbox`), gerçek ya da bulut dil modeli
  (yalnız yz'nin sahte sağlayıcısı ve dil-modeli'nin örnek modeli), alan adı + HTTPS, systemd'li sunucu, Caddy.
- İki tarifi aynı projede birleştirmek (ör. Sor sayfası + iletişim formu): ortak dosyalarda yamalar çakışabilir.
- Chromium dışındaki tarayıcılar; `site-iletisim-formu-api`'de 360×800 (hız sınırı bütçesi yüzünden tek proje).
- `yz sun` (sohbet arayüzü + vekil) ile `kendi-modelinle-sohbet`; büyük model ve GPU.
