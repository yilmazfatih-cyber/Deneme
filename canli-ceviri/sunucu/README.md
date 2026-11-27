# Canlı Çeviri — geçici anahtar sunucusu

Uzun ömürlü Soniox anahtarını uygulamadan çıkarıp sunucuda tutan küçük bir Cloudflare Worker. Uygulama her dinleme
oturumu için buradan **kısa ömürlü, tek kullanımlık, süre sınırlı** bir Soniox geçici anahtarı ister. Sunucu önce
App Store'un imzaladığı abonelik işlemini doğrular, sonra abone başına kullanım sınırı uygular.

> Bu sunucu gerçek Cloudflare, Apple ve Soniox ile **henüz hiç denenmedi**; yalnız yerelde, sahte Soniox ve testte
> üretilen sertifikalarla sınandı. İlk yayından sonra gerçek bir abonelikle uçtan uca denenmelidir.

## Uç nokta sözleşmesi

`POST /v1/oturum` — gövde JSON, en çok 16 KB:

```json
{ "islem": "<StoreKit 2 imzalı işlem (JWS)>" }
```

`islem`: abonelik ürününün **en güncel** işleminin `jwsRepresentation` değeri (`Transaction.currentEntitlements`
içinden; abonelik yenilendikçe yeni işlem gönderilmelidir). Başarıda `200`:

```json
{ "anahtar": "<Soniox geçici anahtarı>", "sure_sn": 600, "kalan_sn": 6600 }
```

- `anahtar`: 60 saniye içinde **bir kez** Soniox WebSocket akışı açmak için kullanılır; saklanmaz.
- `sure_sn`: bu akışın en uzun süresi. Dolunca Soniox akışı `temp_api_key_session_expired` (403) ile kapatır.
- `kalan_sn`: bugün (UTC) kalan bütçe. `sure_sn` verildiği anda bütçeden **tamamıyla** düşülmüştür.

Kesintisiz dinleme için istemci, oturumun **son 30 saniyesinde** yeni anahtar isteyip yeni akışı açar (devir).
Pencere bitmeden daha erken gelen istek `429 cok_sik` alır.

Hata yanıtı her zaman `{"hata": "<kod>", "ileti": "<kısa Türkçe>"}` biçimindedir:

| HTTP                | `hata`           | Anlamı                                                             | İstemci ne yapar                                  |
| ------------------- | ---------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| 400, 413            | `gecersiz_istek` | Gövde JSON değil, `islem` yok ya da gövde 16 KB'ı aşıyor           | Yeniden denemez (istemci hatası)                  |
| 404, 405            | `gecersiz_istek` | Başka yol ya da `POST` dışı yöntem                                 | Yeniden denemez                                   |
| 401                 | `imza_gecersiz`  | İşlem App Store imzalı değil ya da bozuk                           | Yeniden denemez                                   |
| 403                 | `abonelik_yok`   | Süresi dolmuş, iade edilmiş, yanlış ürün/paket ya da izinsiz ortam | Güncel işlemi alıp bir kez dener; abonelik ekranı |
| 429 + `Retry-After` | `sinir_doldu`    | Günlük bütçe bitti (`Retry-After`: UTC gece yarısına kalan saniye) | Kullanıcıya söyler; yarın                         |
| 429 + `Retry-After` | `cok_sik`        | Oturum penceresi sürüyor, dakikada 6 istek aşıldı ya da IP sınırı  | `Retry-After` saniye sonra dener                  |
| 500, 502            | `sunucu_hatasi`  | Yapılandırma eksik ya da Soniox anahtar vermedi (bütçe düşmez)     | Kısa süre sonra bir kez daha dener                |

Yanıtlar doğrulamanın hangi adımda düştüğünü söylemez. Cloudflare'in kendi hata sayfaları (örn. 1102) JSON değildir;
istemci JSON olmayan 5xx yanıtını `sunucu_hatasi` gibi ele almalıdır. CORS başlığı yoktur (istemci tarayıcı değil).

## Sınırlar (abonelik = `originalTransactionId`)

- **Günlük bütçe:** `GUNLUK_SANIYE` (7200); Sandbox işlemleri için `SANDBOX_GUNLUK_SANIYE` (1800). Gün UTC'ye göre döner.
- **Oturum:** `OTURUM_SANIYE` (600) ya da kalan bütçe, hangisi küçükse; kalan 30 saniyeden azsa anahtar verilmez.
  Süre **verildiği anda tamamıyla** düşülür; istemcinin "erken bitirdim" beyanına güvenilmez, iade yoktur.
- **Eşzamanlılık:** önceki oturumun penceresi (verilme anı + süre) bitmeden yeni anahtar yalnız son 30 saniyede verilir.
- **İstek hızı:** abonelik başına dakikada 6 istek. Geçersiz isteklerde IP başına dakikada 20.
- Soniox hata verirse ayrılan süre geri alınır ve `502` döner.

Sayaçlar Durable Object'te tutulur (güçlü tutarlılık: aynı anda gelen iki istekten yalnız biri anahtar alır).
Abonelik kimliği hiçbir yere yazılmaz; sayaç adı, kayıtlar ve Soniox'a giden `client_reference_id` onun tuzlu
(HMAC-SHA-256) özetidir. Kayıtlarda yalnız sonuç kodu, ortam ve bu özetin ilk 24 karakteri bulunur.

## Yapılandırma

`wrangler.toml` → `[vars]` (gizli değildir): `PAKET_KIMLIGI`, `URUN_KIMLIGI`, `GUNLUK_SANIYE`,
`SANDBOX_GUNLUK_SANIYE`, `OTURUM_SANIYE`, `SANDBOX_IZINLI`.

Gizli değerler (depoya **yazılmaz**; yalnız `wrangler secret put`):

- `SONIOX_API_KEY`: uzun ömürlü Soniox anahtarı. "Temporary API keys" ve konuşma tanıma izinleri olmalıdır.
- `OZET_TUZU`: rastgele, en az 16 karakter (`openssl rand -hex 32`). Yoksa sunucu `sunucu_hatasi` verir; başka
  değerden türetilmez. Değiştirilirse bütün sayaçlar sıfırlanır.

Güven kökü yapılandırılamaz: "Apple Root CA - G3" `src/kok.ts` içinde sabittir
(SHA-256 `63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79`).

## Yerelde test

```sh
cd canli-ceviri/sunucu
npm ci
npm test            # vitest; Workers çalışma zamanında (workerd), sahte Soniox, testte üretilen sertifika zinciri
npx tsc --noEmit
npm run kok         # sabit kökün parmak izi; `npm run kok -- AppleRootCA-G3.cer` Apple'dan indirilen dosyayla karşılaştırır
```

Elle denemek için: `npx wrangler dev --var SONIOX_API_KEY:deneme --var OZET_TUZU:yerel-deneme-tuzu-0123456789`
(gerçek anahtar gerekmez; gerçek abonelik işlemi olmadan yalnız hata yolları denenebilir).

## Yayın

1. Cloudflare hesabında Workers & Pages bir kez açılıp `workers.dev` alt alan adı seçilir.
2. GitHub'da gizli değerler girilir: `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" şablonu), `CLOUDFLARE_ACCOUNT_ID`,
   `SONIOX_API_KEY`, `SUNUCU_OZET_TUZU`.
3. Actions → "Canlı Çeviri (anahtar sunucusu)" → Run workflow → varsayılan dal, `yayinla` işaretli. İş akışı testleri
   koşar, sabit kökü Apple'daki kopyayla karşılaştırır, `wrangler deploy` yapar, gizli değerleri Worker'a verir,
   sunucuyu yoklar ve Worker adresini iş özetine yazar.

Elle yayın: `npx wrangler deploy`, sonra `npx wrangler secret put SONIOX_API_KEY` ve `npx wrangler secret put OZET_TUZU`.
Kayıtlar: `npx wrangler tail`.

## Bilinen sınırlar

- **App Attest yok.** İmzalı işlem bir "taşıyıcı" kanıttır: kendi geçerli işlemini uygulamadan çıkaran biri, süresi
  dolana dek uygulama dışından da anahtar isteyebilir. Zarar o aboneliğin günlük bütçesiyle sınırlıdır; işlem
  paylaşılırsa bütçe de paylaşılır.
- **Sandbox işlemleri ücretsizdir.** TestFlight kullanıcıları ve App Review Sandbox'ta ödeme yapmadan abone olur; bu
  yüzden `SANDBOX_IZINLI` açıkken her test kullanıcısı günde `SANDBOX_GUNLUK_SANIYE` kadar ücretsiz kullanır.
  Kapatılırsa TestFlight'ta ve App Review'da bulut motoru çalışmaz.
- **Bütçe en kötü duruma göre düşülür.** Bir dakika dinleyip duran kullanıcıdan da `sure_sn` kadar düşülür ve pencere
  bitmeden (son 30 saniye hariç) yeniden anahtar verilmez: dur-başlat yapan kullanıcı `Retry-After` kadar bekler.
  `OTURUM_SANIYE` kısaltılırsa bu bekleme ve israf azalır, devir sıklaşır.
- **İade ve iptal gecikmeli görülür.** İstemcinin elindeki eski işlemde `revocationDate` bulunmaz; iade edilen abonelik
  işlemin `expiresDate` değerine (haftalık ürün için en çok bir hafta) dek geçerli sayılır. App Store Server API ya da
  sunucu bildirimleri kullanılmaz. Ödeme ek süresi (billing grace period) tanınmaz.
- **Sertifika iptal sorgusu (OCSP) yok;** zincir yalnız imza, tarih, kök ve Apple uzantılarıyla doğrulanır.
- **IP sınırı basittir:** sayaç bellekte tutulur (nesne boşalınca sıfırlanır) ve aynı IP'yi paylaşan (NAT) kullanıcılar
  birbirinin geçersiz isteklerinden bir dakikalığına etkilenebilir.
- **Ücretsiz plan:** günde 100.000 istek ve istek başına 10 ms işlemci süresi vardır. Kota dolarsa sunucu yanıt vermez
  (bulut motoru durur) ama Soniox bakiyesi korunur. Bir çalışma örneğinin ilk isteğinde sertifika zinciri ayrıştırılır;
  bu istek 10 ms'yi aşabilir (sonrakiler önbellekten gelir).
- Soniox uç noktası `api.soniox.com` olarak sabittir (bölgesel veri yerleşimi kullanılıyorsa değişmelidir).
