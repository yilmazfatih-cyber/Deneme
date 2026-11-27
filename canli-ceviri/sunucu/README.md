# Canlı Çeviri — geçici anahtar sunucusu

Uzun ömürlü Soniox anahtarını uygulamadan çıkarıp sunucuda tutan küçük bir Cloudflare Worker. Uygulama dinlerken
buradan **kısa ömürlü, tek kullanımlık, süre sınırlı** Soniox geçici anahtarları ister. Sunucu önce App Store'un
imzaladığı abonelik işlemini doğrular, sonra abonelik dönemi başına kullanım kotası uygular.

> Bu sunucu gerçek Cloudflare, Apple ve Soniox ile **henüz hiç denenmedi**; yalnız yerelde, sahte Soniox ve testte
> üretilen sertifikalarla sınandı. İlk yayından sonra gerçek bir abonelikle uçtan uca denenmelidir.

## Uç nokta sözleşmesi

Tek uç nokta vardır. İstemci (iOS uygulaması) yalnız bu bölüme bakarak yazılabilir.

### İstek

| Öğe     | Değer                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------- |
| Yöntem  | `POST`                                                                                            |
| Yol     | `/v1/oturum` (sonda `/` yok; sorgu parametresi yok)                                               |
| Başlık  | `Content-Type: application/json` (önerilir; denetlenmez). Kimlik başlığı yoktur: kanıt gövdededir |
| Gövde   | UTF-8 JSON nesnesi, en çok 16 384 bayt: `{ "islem": "<StoreKit 2 imzalı işlem (JWS)>" }`          |
| `islem` | Boş olmayan metin. Abonelik ürününün **en güncel** işleminin `jwsRepresentation` değeri           |

`islem`, `Transaction.currentEntitlements` içinden her istekte yeniden okunur. Abonelik yenilendikçe **yeni dönemin
işlemi** gönderilmelidir: kullanım kotası yeni işlemle yenilenir (aşağıda "Sınırlar"). Başka alan gönderilirse
yok sayılır.

### Başarı yanıtı — `200`

```json
{ "anahtar": "<Soniox geçici anahtarı>", "sure_sn": 120, "kalan_sn": 9480, "donem_bitis_ms": 1796299200000 }
```

| Alan             | Tür                          | Anlamı                                                                                                                                                     |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anahtar`        | metin                        | Soniox geçici anahtarı. 60 saniye içinde **bir kez** Soniox WebSocket akışı açmak için kullanılır; saklanmaz, yeniden kullanılamaz                         |
| `sure_sn`        | tam sayı, 30–`OTURUM_SANIYE` | Bu anahtarla açılan akışın en uzun süresi (dilim). Dolunca Soniox akışı `temp_api_key_session_expired` (403) ile kapatır. Son dilimde kalan bütçe kadardır |
| `kalan_sn`       | tam sayı, ≥ 0                | Bu dilim düşüldükten **sonra** dönemde kalan bütçe. 30'dan küçükse sıradaki istek `sinir_doldu` alır                                                       |
| `donem_bitis_ms` | tam sayı, epoch milisaniye   | Bütçenin sıfırlanacağı an. Production: abonelik döneminin bitişi (işlemin `expiresDate` değeri). Sandbox (TestFlight): bir sonraki UTC gece yarısı         |

### Hata yanıtları

Gövde her zaman `{"hata": "<kod>", "ileti": "<kısa Türkçe>"}` biçimindedir. **İstemci hata türünü HTTP durumundan
değil `hata` alanından ayırmalıdır:** aynı durum birden çok kodu taşır (429: `sinir_doldu` ve `cok_sik`) ve aynı kod
birden çok durumla gelir. `ileti` kullanıcıya gösterilmek için değildir ve değişebilir. Ek alan yalnız
`sinir_doldu` yanıtında vardır (`donem_bitis_ms`); başka hiçbir hata yanıtı ek bilgi taşımaz.

| HTTP | `hata`           | Ek                                             | Anlamı                                                                           | İstemci ne yapar                                                                          |
| ---- | ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 400  | `gecersiz_istek` | —                                              | Gövde JSON nesnesi değil ya da `islem` yok, boş ya da metin değil                | Yeniden denemez (istemci hatası)                                                          |
| 413  | `gecersiz_istek` | —                                              | Gövde 16 384 baytı aşıyor                                                        | Yeniden denemez                                                                           |
| 404  | `gecersiz_istek` | —                                              | Yol `/v1/oturum` değil                                                           | Yeniden denemez                                                                           |
| 405  | `gecersiz_istek` | Başlık `Allow: POST`                           | Yöntem `POST` değil                                                              | Yeniden denemez                                                                           |
| 401  | `imza_gecersiz`  | —                                              | İşlem App Store imzalı değil ya da bozuk                                         | Yeniden denemez                                                                           |
| 403  | `abonelik_yok`   | —                                              | Süresi dolmuş, iade edilmiş, yanlış ürün/paket ya da izinsiz ortam               | Güncel işlemi alıp **bir kez** dener; yine olmazsa abonelik ekranını gösterir             |
| 429  | `sinir_doldu`    | Gövdede `donem_bitis_ms`; başlık `Retry-After` | Bu dönemin kullanım kotası bitti (kalan 30 saniyeden az)                         | Kullanıcıya "kotanız `donem_bitis_ms` tarihinde yenilenir" der; o ana dek yeniden denemez |
| 429  | `cok_sik`        | Başlık `Retry-After` (saniye)                  | Abonelik dakikada 6 isteği aştı ya da bu IP'den dakikada 20 geçersiz istek geldi | `Retry-After` saniye sonra dener                                                          |
| 500  | `sunucu_hatasi`  | —                                              | Sunucu yapılandırması eksik ya da iç hata                                        | Kısa süre sonra **bir kez** daha dener                                                    |
| 502  | `sunucu_hatasi`  | —                                              | Soniox anahtar vermedi (bütçe **düşmez**)                                        | Kısa süre sonra **bir kez** daha dener                                                    |

- `sinir_doldu` gövdesi: `{"hata": "sinir_doldu", "ileti": "…", "donem_bitis_ms": 1796299200000}`. `donem_bitis_ms`
  başarı yanıtındakiyle aynı anlamdadır; `Retry-After` o ana kalan saniyedir (en az 1). Production'da bütçe o an
  kendiliğinden değil, **yenilenen dönemin işlemi** gönderilince yenilenir: istemci o tarihte güncel işlemi alıp
  dener; abonelik yenilenmediyse `abonelik_yok` alır.
- `donem_bitis_ms`, Production'da bu abonelik için sunucunun gördüğü **en büyük** `expiresDate` değeridir. Olağan
  durumda gönderilen işleminkiyle aynıdır; istemci eski dönemin işlemini gönderdiyse daha ileri bir tarih döner.
- Denetim sırası: yol (404) → yöntem (405) → yapılandırma (500) → IP sınırı (429) → gövde boyutu (413) → gövde
  biçimi (400) → imza (401) → abonelik (403) → istek hızı (429 `cok_sik`) → kota (429 `sinir_doldu`) → Soniox (502).
- 400, 413, 401 ve 403 yanıtları IP başına sayılır; dakikada 20'yi aşan IP, bir dakika dolana dek geçerli
  isteklerinde de `cok_sik` alır. İstemci bu yanıtları döngüyle yeniden denememelidir.
- Bütün yanıtlar `Content-Type: application/json; charset=utf-8` ve `Cache-Control: no-store` taşır. CORS başlığı
  yoktur (istemci tarayıcı değil).
- Yanıtlar doğrulamanın hangi adımda düştüğünü söylemez. Cloudflare'in kendi hata sayfaları (örn. 1102) JSON
  değildir; istemci JSON olmayan 5xx yanıtını `sunucu_hatasi` gibi ele almalıdır.

### İstemci akışı (dilimler)

- **Başlat:** anahtar iste → 60 saniye içinde Soniox akışını aç. Akış en çok `sure_sn` saniye sürer.
- **Kesintisiz dinleme (devir):** dilimin bitmesine az kala (örn. son 15 saniye) yeni anahtar iste, yeni akışı aç,
  eskisini kapat. Sunucu önceki dilimin bitmesini **beklemez**; yeni anahtar hemen verilir.
- **Dur-başlat:** durdurup yeniden başlatan kullanıcı beklemeden yeni anahtar alır.
- **Her anahtar bir dilim harcar:** `sure_sn`, anahtar verildiği anda bütçeden **tamamıyla** düşülür; akış erken
  kapatılsa ya da anahtar hiç kullanılmasa da iade edilmez. Önden ya da yedek anahtar istemeyin.
- **Hız:** abonelik başına dakikada en çok 6 istek (reddedilenler sayılmaz).
- **Kota göstergesi:** `kalan_sn` ve `donem_bitis_ms` her başarı yanıtında günceldir; `sure_sn` < `OTURUM_SANIYE`
  ise bu son dilimdir.

## Sınırlar (abonelik = `originalTransactionId`)

Bütçe **günlük değildir**: abonelik dönemi başınadır ve her yenilemede sıfırlanır.

- **Dönem bütçesi (Production):** `DONEM_SANIYE` (9600 sn = 160 dakika). Dönem, işlemin `expiresDate` değeridir:
  aynı abonelik daha büyük bir `expiresDate` ile (yenilenen dönemin işlemiyle) geldiğinde sayaç sıfırlanır. Eski
  dönemin kalan bütçesi devretmez. Daha **küçük** `expiresDate` ile gelen istek bütçeyi sıfırlayamaz: süresi
  dolmamış iki işlem varsa en büyük `expiresDate` değerinin sayacı geçerlidir ve ikisi de ondan düşer.
- **Bütçe hesabı:** bütçe = haftalık fiyat / 10 / saatlik kullanım maliyeti (fiyat, kullanım maliyetinin 10 katı
  olsun diye): 4,99 $ / 10 / 0,18 $ ≈ 2,8 saat → 160 dakika. Fiyat ya da maliyet değişirse `DONEM_SANIYE` yeniden
  hesaplanır.
- **Sandbox (TestFlight, App Review):** Sandbox'ta haftalık abonelik birkaç dakikada bir yenilenir; dönem kuralı
  bütçeyi fiilen sınırsız yapardı. Bu yüzden `environment == Sandbox` işlemlerinde bütçe **UTC gününe** göredir:
  `SANDBOX_GUNLUK_SANIYE` (1800). `expiresDate` değişse de yenilenmez; UTC gece yarısında yenilenir.
- **Dilim:** her anahtar `OTURUM_SANIYE` (120) ya da kalan bütçe kadar sürer, hangisi küçükse; kalan 30 saniyeden
  azsa anahtar verilmez (`sinir_doldu`). Süre **verildiği anda tamamıyla** düşülür; istemcinin "erken bitirdim"
  beyanına güvenilmez, iade yoktur.
- **Eşzamanlılık penceresi yoktur:** önceki dilim bitmeden yeni anahtar verilir. Maliyet zaten bütçeyle sınırlıdır.
- **İstek hızı:** abonelik başına dakikada 6 istek. Geçersiz isteklerde IP başına dakikada 20.
- Soniox hata verirse ayrılan süre geri alınır ve `502` döner.

Sayaçlar Durable Object'te tutulur (güçlü tutarlılık: aynı aboneliğe aynı anda gelen istekler sırayla işlenir, bütçe
yarışta fazladan harcanamaz). Her abonelik için **tek kayıt** durur: yalnız geçerli dönemin sayacı; yeni dönem
görülünce eskisinin üzerine yazılır. Production ve Sandbox sayaçları ayrıdır.
Abonelik kimliği hiçbir yere yazılmaz; sayaç adı, kayıtlar ve Soniox'a giden `client_reference_id` onun tuzlu
(HMAC-SHA-256) özetidir. Kayıtlarda yalnız sonuç kodu, ortam ve bu özetin ilk 24 karakteri bulunur.

## Yapılandırma

`wrangler.toml` → `[vars]` (gizli değildir):

| Değişken                | Varsayılan | Anlamı                                                                   |
| ----------------------- | ---------- | ------------------------------------------------------------------------ |
| `PAKET_KIMLIGI`         | (zorunlu)  | Uygulamanın paket kimliği; işlemin `bundleId` değeri bununla aynı olmalı |
| `URUN_KIMLIGI`          | (zorunlu)  | Abonelik ürünü (`canliceviri.haftalik`); işlemin `productId` değeri      |
| `DONEM_SANIYE`          | 9600       | Production: abonelik dönemi başına bütçe (sn). 0–604800                  |
| `SANDBOX_GUNLUK_SANIYE` | 1800       | Sandbox: UTC günü başına bütçe (sn). 0–86400                             |
| `OTURUM_SANIYE`         | 120        | Tek anahtarın (dilimin) en uzun süresi (sn). 30–18000                    |
| `SANDBOX_IZINLI`        | kapalı     | `"true"` değilse Sandbox işlemleri `abonelik_yok` alır                   |

Sayısal bir değer bozuksa ya da aralık dışındaysa sunucu `sunucu_hatasi` (500) verir. Eski `GUNLUK_SANIYE`
değişkeni kaldırıldı; okunmaz.

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
  dolana dek uygulama dışından da anahtar isteyebilir. Zarar o aboneliğin dönem bütçesiyle sınırlıdır; işlem
  paylaşılırsa bütçe de paylaşılır. Eşzamanlılık penceresi olmadığı için aynı işlemle birden çok akış aynı anda
  açılabilir; bu, bütçeyi daha hızlı tüketir (en çok dakikada 6 dilim) ama aşamaz.
- **Sandbox işlemleri ücretsizdir.** TestFlight kullanıcıları ve App Review Sandbox'ta ödeme yapmadan abone olur; bu
  yüzden `SANDBOX_IZINLI` açıkken her test kullanıcısı günde `SANDBOX_GUNLUK_SANIYE` kadar ücretsiz kullanır.
  Kapatılırsa TestFlight'ta ve App Review'da bulut motoru çalışmaz.
- **Bütçe en kötü duruma göre düşülür.** On saniye dinleyip duran kullanıcıdan da `sure_sn` (bir dilim) düşülür;
  her dur-başlat ve her devir yeni bir dilim harcar. `OTURUM_SANIYE` kısaltılırsa israf azalır, devir sıklaşır.
- **Dönem, işlemin `expiresDate` değeridir.** Ücretsiz deneme ya da tanıtım dönemi de ayrı bir dönemdir ve tam
  bütçe alır. Apple yenilemeyi dönem bitmeden (son 24 saat içinde) yapabilir; yeni dönemin işlemi gelir gelmez yeni
  bütçe açılır ve eski dönemin kalanı silinir (devretmez).
- **Biten aboneliğin son kaydı silinmez.** Her abonelik için tek, küçük bir sayaç kaydı tutulur; abonelik bir daha
  yenilenmezse bu kayıt Durable Object depolamasında kalır (süreli temizlik yok).
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
