# http_sunucu — soketlerden HTTP/1.1 sunucusu

Bir web sunucusu içeride ne yapar? Bu klasör, `asyncio` akışları üzerinde baştan sona okunabilir bir HTTP/1.1
sunucusudur: istek ayrıştırma (sınırlarla), `Content-Length` ve parçalı (chunked) gövde, kalıcı bağlantı ve boru
hattı, `Expect: 100-continue`, durağan dosya sunumu (aralık, `ETag`, dizin dışına çıkma koruması), `HEAD`, hata
yanıtları, düzgün kapanış ve TLS. Bu temeldeki `web_catisi`, `websocket`, `hiz_ve_vekil`, `sunucu_olaylari` bunun
üstüne kuruludur.

## 5 dakikada çalıştırma

```bash
python -m http_sunucu sun --klasor . --kapi 8450      # bulunulan klasörü yayınlar
# tarayıcıda: http://127.0.0.1:8450/
```

Kendi işleyicinizle:

```python
import asyncio
from http_sunucu import HttpServer, Request, Response


async def merhaba(istek: Request) -> Response:
    govde = await istek.read()  # gövde gerekiyorsa (sınır: Limits.max_body)
    return Response.text(f"Merhaba! {istek.path} istendi.")


async def main() -> None:
    async with HttpServer(merhaba, port=8450):
        await asyncio.Event().wait()


asyncio.run(main())
```

## Nasıl çalışır

```
istemci                         HttpServer._serve (bağlantı başına bir görev)
  │  TCP bağlan                   │
  │ ─────────────────────────▶    │ ilk baytı bekle (ilk istekte head_timeout, sonra keepalive_timeout)
  │  GET /a HTTP/1.1\r\n          │ read_head: istek satırı + başlıklar (TAMAMI head_timeout içinde)
  │  Host: x\r\n\r\n              │   └─ parse_request_line / parse_header_line / body_framing (SIKI)
  │                               │ _build_request: Host denetimi, gövde çerçevesi, Expect
  │                               │ işleyici(istek) ──▶ Response   (hata → 500, ayrıntı sızmaz)
  │                               │ okunmamış gövde: küçükse at, büyükse bağlantıyı kapat
  │  HTTP/1.1 200 OK\r\n…   ◀──── │ _write_response: Content-Length ya da chunked, HEAD'de gövde yok
  │  (aynı bağlantıda sıradaki)   │ keep-alive? → başa dön : kapat
```

Parçalı gövde: `1a\r\n<26 bayt>\r\n … 0\r\n<son başlıklar>\r\n`. `Expect: 100-continue` gelirse
"100 Continue" yalnız işleyici gövdeyi okumak istediğinde yazılır; işleyici okumadan 401 dönerse gövde hiç
istenmez ve bağlantı kapatılır.

## Dosya haritası

| Dosya        | Sorumluluk                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| `parser.py`  | `Limits`, `HttpError`, satır okuma, istek satırı/başlık ayrıştırma, çerçeve kararı |
| `body.py`    | `BodyReader`: Content-Length / chunked gövde, son başlıklar, 413/408          |
| `headers.py` | `Headers`: büyük/küçük harfe duyarsız çok değerli liste; yanıt bölme koruması |
| `messages.py`| `Request`, `Response` (`text`, `html`, `json`, `error`, `redirect`, `upgrade`) |
| `server.py`  | `HttpServer`: bağlantı döngüsü, keep-alive, boru hattı, düzgün kapanış, TLS   |
| `static.py`  | `StaticFiles`: güvenli yol çözümleme, ETag/304, aralık, dizin yönlendirmesi  |
| `texts.py`   | Kullanıcıya görünen Türkçe hata metinleri (tek sözlük)                      |

## Saldırı yüzeyi ve alınan önlem

| Saldırı                                         | Önlem                                                         | Testi (`tests/http_sunucu/`)                       |
| ----------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| İstek kaçakçılığı: CL + TE birlikte             | 400 + bağlantı kapanır                                        | `test_istek_kacakciligi_denemeleri_reddedilir`     |
| İki farklı `Content-Length`                     | tek değer zorunlu                                             | aynı + `test_kacakcilik_cerceveleri_reddedilir`    |
| `TE: chunked, identity`, `xchunked`, `gzip`     | yalnız tam olarak `chunked`; diğerleri 400/501                | aynı                                               |
| `"+5"`, `"0x1e"`, `"1_0"`, `"٤"` gibi sayılar   | önce `[0-9]` / `[0-9a-f]` düzenli ifadesi, sonra `int`        | `test_int_neden_tek_basina_yetmez`, `test_bozuk_parcali_govde` |
| Çıplak LF / CR, katlanmış başlık, `Ad :` boşluğu | 400                                                          | `test_bozuk_basliklar_reddedilir`                  |
| Yavaş istemci (Slowloris)                       | başlıkların tamamı `head_timeout`, gövde `body_timeout` içinde | `test_yavas_istemci_408_alir`                      |
| Dev başlık / adres / gövde                      | `max_line` (414/431), `max_headers`, `max_body` (413)         | `test_sinirlar_414_431_413`, `test_satir_ve_baslik_sinirlari` |
| Bağlantı seli                                   | `max_connections` (503), boşta bağlantı zaman aşımı          | `test_baglanti_siniri_503`, `test_bosta_bekleyen_baglanti_kapanir` |
| Yanıt bölme (başlığa `\r\n` sokma)              | `Headers.add` denetim karakterini reddeder → 500              | `test_isleyici_hatasi_ayrinti_sizdirmaz`, `test_basliklar_yanit_bolmeyi_engeller` |
| Hata ayrıntısı sızması                          | işleyici hatası günlüğe; istemciye genel Türkçe metin         | `test_isleyici_hatasi_ayrinti_sizdirmaz`           |
| Yol geçişi (`..`, `%2e%2e`, `%5c`, NUL)         | parça parça çöz + reddet + `resolve()` + kök altı denetimi    | `test_yol_gecisi_ve_gizli_dosyalar_404`            |
| Kök dışını gösteren sembolik bağ                | `resolve()` sonrası `is_relative_to(kok)`                     | aynı (`/bag`)                                      |
| `.env` gibi gizli dosyalar                      | nokta ile başlayan parçalar varsayılan olarak 404             | aynı (`/.env`)                                     |
| İçerik türü koklama                             | `X-Content-Type-Options: nosniff`                             | `test_dosya_turu_ve_on_bellek_basliklari`          |

## Sınırlar

- HTTP/2, HTTP/3, sıkıştırma (gzip yanıt), çoklu bayt aralığı (`multipart/byteranges`) ve dizin listesi yok.
- İstemciye yanıt yazıldıktan sonra büyük ve okunmamış bir gövde varsa bağlantı kapatılır; istemci gövdeyi hâlâ
  gönderiyorsa yanıtı TCP sıfırlamasıyla kaybedebilir ("lingering close" yapılmaz).
- Hız sınırı burada yok (bkz. `hiz_ve_vekil`). `max_connections` tek süreç içindir.
- `Date` başlığı her yanıtta yeniden biçimlenir (önbelleklenmez); yüksek yükte ölçülmedi.
- Başarım ölçülmedi; amaç okunabilirliktir. Üretimde `uvicorn`/`hypercorn` arkasında bir ASGI uygulaması ya da
  nginx/Caddy önerilir.

## Buradan nereye

- Yönlendirme, oturum, şablon: `web_catisi/` bu sunucuyla çalışır (`web_catisi/adapters.py`).
- Bağlantıyı devralma (`Response.upgrade`): `websocket/server.py` örneğine bakın.
- Yeni bir sınır: `Limits`'e alan + ilgili yerde `HttpError` + `tests/http_sunucu/test_ayristirici.py`'ye test.
