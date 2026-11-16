# http_istemci — soketten HTTP/1.1 istemcisi

`requests`/`httpx` içeride ne yapar? Bu klasör eşzamanlı (bloklayan) bir HTTP/1.1 istemcisidir: URL ayrıştırma
(Türkçe alan adları dahil), bağlantı havuzu, yönlendirme izleme, parçalı ve sıkıştırılmış (gzip/deflate)
yanıt, zaman aşımı, yeniden deneme, çerez kavanozu, akışla gövde okuma ve doğrulaması açık TLS.

## 5 dakikada çalıştırma

```bash
python -m http_sunucu sun --kapi 8450 &                 # yerel bir sunucu
python -m http_istemci getir http://127.0.0.1:8450/
```

```python
from http_istemci import Client, Retry, tls_context

with Client(timeout=5, retry=Retry(total=2)) as istemci:
    yanit = istemci.get("http://127.0.0.1:8450/api", headers={"Accept": "application/json"})
    print(yanit.status, yanit.json())
    buyuk = istemci.get("http://127.0.0.1:8450/dosya.iso", stream=True)
    for parca in buyuk.iter_bytes():  # bellek şişmeden
        ...
# Kendinden imzalı yerel sunucu: doğrulamayı kapatmak yerine sertifikasına güvenin
Client(ssl_context=tls_context("sertifika.pem"))
```

## Nasıl çalışır

```
request(yöntem, adres)
  parse_url ──▶ Url(şema, sunucu, kapı, yol, sorgu)          CR/LF, kullanıcı:parola@ → reddedilir
  ┌─ yeniden deneme döngüsü (yalnız GET/HEAD/PUT/DELETE/OPTIONS) ─────────────────────────┐
  │ havuz.get(köken) ── bayat mı? (select) ── evet → kapat, yenisini aç                    │
  │ istek yaz → başlığı oku (1xx atlanır) → Set-Cookie → kavanoz                           │
  │ bağlantı hatası / 502-503-504 → bekle (Retry-After ya da 0.2·2ⁿ sn) → tekrar           │
  └────────────────────────────────────────────────────────────────────────────────────────┘
  30x + Location → resolve_reference (RFC 3986) → https→http? engelle → köken değişti? Authorization at
  gövde: Content-Length | chunked | kapanana dek → gzip/deflate aç (boyut sınırlı) → bitti → havuza geri
```

## Dosya haritası

| Dosya           | Sorumluluk                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| `url.py`        | `parse_url`, `resolve_reference` (RFC 3986 §5.2), `remove_dot_segments`       |
| `connection.py` | TCP/TLS bağlantısı, yanıt başlığı okuma, bayat bağlantı denetimi, `tls_context` |
| `pool.py`       | `ConnectionPool`: köken başına boştaki bağlantılar                            |
| `response.py`   | `Response`: çerçeve kararı, chunked okuma, gzip/deflate açma, akış, metin/JSON |
| `cookies.py`    | `CookieJar` (RFC 6265 + `__Host-`/`__Secure-` önekleri)                       |
| `client.py`     | `Client`, `Retry`: yönlendirme, yeniden deneme, istek kurma                    |
| `errors.py`     | Hata sınıfları (hepsi `HttpClientError`)                                      |

## Saldırı yüzeyi ve alınan önlem

| Saldırı / risk                                      | Önlem                                                         | Testi (`tests/http_istemci/`)                  |
| --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Adrese `\r\n` ile başlık enjeksiyonu                 | CR/LF/NUL/sekme içeren adres reddedilir                       | `test_gecersiz_adresler`                       |
| `https://banka.com@kotu.site` aldatmacası, parola sızması | kullanıcı bilgili adres reddedilir                        | aynı                                           |
| Yönlendirmeyle kimlik bilgisi sızması               | köken değişince `Authorization`, `Cookie` atılır              | `test_baska_kokene_kimlik_bilgisi_tasinmaz`    |
| https → http indirgeme                               | varsayılan olarak `InsecureRedirectError`                     | `test_tls_dogrulamasi_ve_inis_engeli`          |
| Sonsuz yönlendirme döngüsü                          | `max_redirects`                                               | `test_yonlendirmeler`                          |
| Sıkıştırma bombası                                   | parça parça açma + `max_decompressed`                         | `test_sikistirma_bombasi_ve_govde_siniri`      |
| Dev gövde                                            | `max_body`                                                    | aynı                                           |
| Asılı kalan sunucu                                   | bağlanma ve okuma zaman aşımı                                 | `test_zaman_asimi`                             |
| Çelişen `Content-Length`, `+3`, bozuk chunked        | `ProtocolViolationError`                                      | `test_bozuk_yanitlar`                          |
| POST'un yanlışlıkla iki kez gönderilmesi             | yeniden deneme yalnız eş-güçlü yöntemlerde                    | `test_post_yeniden_denenmez`                   |
| Başka siteye çerez yazma, http'den Secure çerez     | alan eşleşmesi, Secure ve önek kuralları                      | `test_reddedilen_cerezler`                     |
| TLS ortadaki adam                                    | doğrulama hep açık; kendi sertifikanız `tls_context(cafile)`  | `test_tls_dogrulamasi_ve_inis_engeli`          |
| Rastgele/bozuk yanıt baytları                        | yalnız `HttpClientError` türleri fırlar                       | `test_rastgele_yanit_istemciyi_cokertmez`      |

## Sınırlar

- Eşzamanlıdır (bloklayan soketler); asyncio istemcisi yok. HTTP/2, vekil (proxy), `Expect: 100-continue`
  gönderme, istek gövdesini akışla gönderme yok.
- Çerez kavanozunda Kamu Sonek Listesi (PSL) **yok**: `co.uk`, `com.tr` gibi iki etiketli soneklere çerez yazma
  girişimi reddedilmez (yalnız tek etiketliler). Gerçek tarayıcı düzeyi koruma için PSL gerekir. `SameSite`
  öznitelikleri saklanmaz (istemci tarafında anlamı yoktur).
- Türkçe alan adları stdlib `idna` kodlayıcısıyla (IDNA 2003) çevrilir; IDNA 2008 farkları denenmedi.
- Havuzdaki bağlantı istek sırasında kapanırsa (yanıtın tek baytı gelmeden) istek **POST olsa bile** taze
  bağlantıyla bir kez yeniden gönderilir (tarayıcıların davranışı; sunucu isteği işlememiştir varsayımı).
- `Retry-After` yalnız saniye biçiminde okunur (HTTP tarihi biçimi yok sayılır), en çok 30 sn.

## Buradan nereye

- Ters vekil örneği kendi asyncio iletimini kullanır: `hiz_ve_vekil/forward.py`.
- Yeni bir içerik kodlaması (ör. `br`): `response.py` içindeki `_Decoder`'a dal + stdlib/başvuru ile test.
