# sunucu_olaylari — Sunucu Olayları (SSE), sıfırdan

Sunucudan tarayıcıya tek yönlü, canlı bildirim ("siparişiniz kargoda") için WebSocket'ten basit bir yol:
düz HTTP üzerinden açık kalan bir `text/event-stream` yanıtı. Bu klasör tel biçimini (WHATWG HTML §9.2), olayları
numaralayıp geçmiş tutan bir yayıncıyı ve **kopunca Last-Event-ID ile kaldığı yerden devam eden** bir istemciyi
gerçekler; `http_sunucu`'nun akış gövdesi üstünde çalışır.

## 5 dakikada çalıştırma

```bash
python -m sunucu_olaylari sun --kapi 8457      # her 2 saniyede "saat" olayı
curl -N http://127.0.0.1:8457/olaylar           # akışı izleyin (Ctrl+C)
```

Tarayıcıda: `const kaynak = new EventSource("/olaylar"); kaynak.addEventListener("saat", (o) => …)`.

## Nasıl çalışır

```
istemci  GET /olaylar  (Last-Event-ID: 41)            sunucu (sse_endpoint)
                                       ───────────▶   broker.subscribe("41") → geçmişte 42, 43 varsa kuyruğa
         ◀─── 200 text/event-stream (parçalı aktarım, bağlantı açık kalır)
         ◀─── event: hazir / retry: 2000 / data: bağlandı
         ◀─── id: 42 / data: …          (geçmişten)
         ◀─── : nabız                    (15 sn olay yoksa; ara vekiller bağlantıyı kesmesin)
   bağlantı koptu → retry kadar bekle → yeniden GET (Last-Event-ID: son alınan) → kaçırılanlar gelir
```

## Dosya haritası

| Dosya        | Sorumluluk                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| `events.py`  | `Event`, `format_event`, `comment`, `EventParser` (artımlı; CR/LF/CRLF, BOM, yorum) |
| `broker.py`  | `Broker` (numaralama, geçmiş, yavaş abone kesme), `sse_endpoint` (http_sunucu işleyicisi) |
| `client.py`  | `listen(url)`: asyncio, yeniden bağlanma, Last-Event-ID, `retry` uyumu       |

## Saldırı yüzeyi ve alınan önlem

| Risk                                                 | Önlem                                                     | Testi (`tests/sunucu_olaylari/test_sse.py`) |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| `event`/`id` alanına satır sonuyla sahte olay ekleme | CR/LF/NUL içeren alan reddedilir; veri satırlara bölünür   | `test_alan_enjeksiyonu_reddedilir`          |
| Yavaş abone yayıncıyı kilitler                       | abone başına sınırlı kuyruk; dolunca akış kapatılır        | (yayıncı tasarımı; `Broker.publish`)        |
| Sonsuz satır ile bellek tüketme (istemci)            | `max_line` (64 KB)                                        | ayrıştırıcı sınırı                          |
| Parça ortasında bölünmüş UTF-8 / CRLF                | artımlı çözücü, bekleyen CR izlenir                        | `test_parca_parca_besleme_gidis_donus`      |
| Kopma sonrası olay kaybı                             | geçmiş + Last-Event-ID                                    | `test_kopan_istemci_kaldigi_yerden_devam_eder` |

## Sınırlar

- Kimlik doğrulama yok (uç nokta herkese açık); gerekirse `web_catisi` oturum çerezini denetleyen bir sarmalayıcı.
- Geçmiş bellektedir (son 100 olay); süreç yeniden başlayınca numaralar sıfırlanır.
- İstemci yalnız `http://` (TLS yok) ve sabit gecikmeyle yeniden bağlanır (üstel geri çekilme yok).
- HTTP/1.1'de tarayıcı başına köken başına ~6 bağlantı sınırı vardır; çok sekmede dikkat.

## Buradan nereye

- Kanal/oda: `Broker`'ları kanal adına göre bir sözlükte tutun; uç noktada yoldan kanalı seçin.
- İki yönlü iletişim gerekiyorsa: `websocket/`.
