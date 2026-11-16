# Mimari

## Parçalar ve bağımlılıklar

```
                    ┌──────────────┐
                    │ http_sunucu  │  asyncio akışları: ayrıştırıcı, gövde, sunucu döngüsü, durağan dosya
                    └──────┬───────┘
          ┌────────────────┼──────────────────┬────────────────────┐
          ▼                ▼                  ▼                    ▼
   ┌────────────┐   ┌─────────────┐   ┌──────────────┐    ┌──────────────┐
   │ websocket  │   │ web_catisi  │   │ hiz_ve_vekil │    │ http_istemci │  (Headers + satır ayrıştırıcı)
   │ (upgrade)  │   │ (bağdaştırıcı)│  │ (işleyici)   │    │ (eşzamanlı)  │
   └────────────┘   └──────┬──────┘   └──────────────┘    └──────────────┘
                           ▼ yalnız ornek/
                      ┌─────────┐
                      │   orm   │      bağımsızlar: kripto_egitim · dns · kabuk · eposta
                      └─────────┘
```

## Bir HTTP isteğinin yolu (not defteri örneği)

```
tarayıcı ──TCP──▶ HttpServer._serve
                    read_head (sınırlar, sıkı kurallar) → _build_request (Host, çerçeve, Expect)
                    işleyici = web_catisi.adapters.http_handler(app)
                        gövdeyi oku (≤ max_body) → web_catisi.Request → asyncio.to_thread(app.handle)
                            güvenlik başlıkları → hata sınırı → oturum (çerez imzası) → CSRF → yönlendirici
                            → işleyici → orm (parametreli SQL) → render (kaçışlı HTML) → Response
                    _write_response (Content-Length/chunked, keep-alive kararı)
```

## WebSocket bağlantı devri

`websocket_endpoint` el sıkışmayı doğrular ve `Response(101, upgrade=devral)` döndürür; `HttpServer` 101'i yazar
ve okuyucu/yazıcıyı `devral`a verir. Bağlantı bundan sonra HTTP döngüsüne dönmez.

## Ters vekil

`ReverseProxy` bir `http_sunucu` işleyicisidir: hız sınırı → başlık temizliği → strateji (aday: sağlıklı ∧ devre
uygun) → `forward` (asyncio, akış) → yeniden deneme (güvenli yöntem, bütçe) → akışla yanıt. Sağlık denetimi ayrı
bir görevdir ve yalnız `Backend.healthy` bayrağını değiştirir.

## Test altyapısı

`tests/destek.py::BackgroundLoop` ayrı iş parçacığında bir asyncio döngüsü çalıştırır; sunucular orada, engelleyen
istemciler (stdlib `http.client`, `smtplib`, ham soket, `http_istemci`) ana iş parçacığında koşar. Oturum sonu
fikstürü dinleyen soket, iş parçacığı ve alt süreç kalmadığını doğrular.
