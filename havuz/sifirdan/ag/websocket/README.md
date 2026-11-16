# websocket — RFC 6455, sunucu ve istemci

Tarayıcıyla sunucu arasında açık kalan, iki yönlü ileti kanalı. Bu klasör el sıkışmadan çerçeve bitlerine,
parçalı iletilerden kapanış kodlarına kadar WebSocket'i sıfırdan gerçekler; `http_sunucu` üstünde çalışır
(aynı kapıda hem sayfa hem WebSocket). Bir yayın odası ve tarayıcıda çalışan bir sohbet örneği içerir.

## 5 dakikada çalıştırma

```bash
python -m websocket sun --kapi 8451            # tarayıcıda http://127.0.0.1:8451/ — iki sekmede açın
python -m websocket gonder ws://127.0.0.1:8451/oda "merhaba"
```

Kod içinden:

```python
from http_sunucu import HttpServer, Request
from websocket import WebSocket, connect, websocket_endpoint

async def yanki(ws: WebSocket, istek: Request) -> None:
    async for ileti in ws:          # str (metin) ya da bytes (ikili)
        await ws.send(ileti)

sunucu = HttpServer(websocket_endpoint(yanki), port=8451)   # await sunucu.start()
ws = await connect("ws://127.0.0.1:8451/")                   # istemci
```

## Nasıl çalışır

```
tarayıcı                                   sunucu (http_sunucu + websocket_endpoint)
  GET /oda  Upgrade: websocket   ───────▶   check_request: sürüm 13, 16 baytlık anahtar, Origin
            Sec-WebSocket-Key: K
  ◀─────── 101 Switching Protocols          Sec-WebSocket-Accept = b64(SHA1(K + GUID))
           (artık HTTP yok; bağlantı WebSocket'e devredildi: Response.upgrade)
  [FIN=0 TEXT "Mer"] [FIN=1 CONT "haba"] ─▶ çerçeveleri birleştir, UTF-8'i artımlı doğrula → "Merhaba"
  ◀─────── [TEXT "Merhaba"]  (maskesiz)
  [PING "x"] ───────────────────────────▶  otomatik [PONG "x"]
  [CLOSE 1000 "güle güle"] ─────────────▶  aynı kodla [CLOSE 1000] yankıla → TCP'yi kapat
```

İstemci → sunucu çerçeveleri **maskelidir** (4 baytlık rastgele anahtarla XOR), sunucu → istemci maskesiz.
Denetim çerçeveleri (ping/pong/kapat) en çok 125 bayttır ve parçalı bir iletinin arasına girebilir.

## Dosya haritası

| Dosya             | Sorumluluk                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `handshake.py`    | Accept anahtarı, istek/yanıt doğrulama, Origin politikası, alt protokol          |
| `frames.py`       | Çerçeve kodla/çöz (soketsiz çekirdek `parse_frame` + `read_frame`), kapanış yükü |
| `connection.py`   | `WebSocket`: ileti birleştirme, ping/pong, kapanış el sıkışması, sınırlar       |
| `server.py`       | `websocket_endpoint` (http_sunucu işleyicisine çevirir), `PathRouter`, `serve`  |
| `client.py`       | `connect("ws://…")`                                                             |
| `room.py`         | `Room`: yayın; üye başına sınırlı kuyruk, yavaş üyeyi çıkarma                   |
| `ornek_sohbet.py`, `sohbet.html` | Tek kapıda sohbet sayfası + `/oda`                               |

## Saldırı yüzeyi ve alınan önlem

| Saldırı / hata                                   | Önlem                                                   | Testi (`tests/websocket/`)                     |
| ------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| Siteler arası WebSocket ele geçirme (CSWSH)      | `Origin` varsayılan olarak aynı köken; liste verilebilir | `test_el_sikisma_reddi`, `test_el_sikisma_http_uzerinden_reddedilir` |
| Maskesiz istemci çerçevesi (önbellek zehirleme)  | 1002 ile kapat                                          | `test_ham_ihlaller_dogru_kodla_kapatilir`      |
| Geçersiz UTF-8 (parça ortasında bile)            | artımlı çözücü → 1007                                   | aynı + `test_parcalara_bolunmus_gecerli_harf`  |
| Dev ileti / dev çerçeve (bellek tüketme)         | `max_message` → 1009 (çerçeve başlığında, okumadan önce) | aynı, `test_protokol_ihlalleri`               |
| Bölünmüş/uzun denetim çerçevesi, RSV, bilinmeyen kod | 1002                                                | `test_protokol_ihlalleri`                      |
| En kısa biçimde yazılmamış uzunluk, 64 bit üst bit | 1002                                                  | aynı                                           |
| Geçersiz kapanış kodu (1005, 1006, 999…)         | 1002                                                    | `test_kapanis_yuku`                            |
| Yavaş tüketici odayı kilitler                    | üye başına sınırlı kuyruk; dolunca 1008 ile çıkar       | `test_yavas_uye_odayi_yavaslatmaz`             |
| İletiyle HTML enjeksiyonu (XSS)                  | sayfa `textContent` kullanır; sıkı CSP                  | `test_oda_yayini_ve_ornek_sohbet`              |
| Rastgele/bozuk bayt                              | çözücü yalnız `ProtocolError` fırlatır                  | `test_rastgele_bayt_cozucuyu_cokertmez`        |

Gerçek tarayıcı: `tests/websocket/test_tarayici.py` başsız Chromium'u başlatır; sayfa Türkçe metin gönderir,
sunucunun iletisini geri yollar; doğrulama sunucu tarafında yapılır (`python scripts/check.py --uzun`).

## Sınırlar

- Uzantı yok: `permessage-deflate` (sıkıştırma) anlaşılmaz; RSV bitleri açık çerçeve 1002 alır.
- İstemci, kapanış el sıkışmasından sonra TCP'yi sunucunun kapatmasını beklemeden kendisi kapatır.
- `ping()` geleceği yalnız başka bir görev `recv()` çağırırken tamamlanır; bağlantı kapanırsa iptal edilir.
- Okuma tek görevden yapılmalıdır (aynı bağlantıda iki eşzamanlı `recv()` desteklenmez).
- Autobahn test takımıyla sınanmadı (ağ ve Docker gerektirir); kurallar RFC 6455 metninden testlere çevrildi.

## Buradan nereye

- Kimlik doğrulama: el sıkışmadan önce `web_catisi` oturum çerezini doğrulayan bir sarmalayıcı yazın
  (`websocket_endpoint`'i saran bir `async def`), Origin listesini açıkça verin.
- Kalp atışı: arka planda periyodik `ping()` + süre aşımında `close(1011)`.
- Sunucu olayları tek yönlü yeterse daha basit seçenek: `sunucu_olaylari/` (SSE).
