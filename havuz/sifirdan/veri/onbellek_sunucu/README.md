# onbellek_sunucu — Redis uyumlu bellek içi önbellek sunucusu

Veritabanının önüne konan hızlı bellek: anahtar → değer, süreli anahtarlar, bellek dolunca en az
kullanılanı atma (LRU), anlık görüntüyle diske kaydetme. Ağ protokolü **RESP2**'dir (Redis'in
protokolü): gerçek `redis-cli` ve Redis istemci kitaplıkları doğrudan konuşabilir. Komut anlamı,
**gerçek redis-server'la farksal testle** karşılaştırılır. `asyncio`, yalnız standart kitaplık.

```bash
python -m onbellek_sunucu sun --kapi 8450 --bellek 64m --anlik onbellek.snap --kaydet 60
python -m onbellek_sunucu komut --kapi 8450 SET şehir İzmir EX 60
redis-cli -p 8450 GET şehir          # "İzmir"
```

```python
from onbellek_sunucu import CacheClient

with CacheClient("127.0.0.1", 8450) as c:
    c.set("şehir", "İzmir", ex=60)
    c.get("şehir")  # b'\xc4\xb0zmir'
    c.execute("INCRBY", "ziyaret", 5)  # 5
```

Komutlar: `PING ECHO GET SET [EX s|PX ms] [NX|XX] DEL EXISTS EXPIRE PERSIST TTL PTTL INCR DECR INCRBY
DECRBY KEYS DBSIZE FLUSHDB INFO SAVE QUIT`. Varsayılan kapı 8450 (havuz aralığı 8450–8469).

## Nasıl çalışır

```
 TCP ──► bağlantı başına tampon ──parse_request──► [ "SET", "şehir", "İzmir" ] ──► Store.execute
          (yarım gelen istek beklenir;                                            │
           birden çok istek sırayla işlenir)                                      ▼
 TCP ◄── encode(yanıt) ◄────────────────────────────────────────────── +OK / $5 İzmir / :42 / -ERR ...
```

- **Tek olay döngüsü:** bütün bağlantılar aynı `asyncio` döngüsünde; komutlar sırayla yürür, kilit
  gerekmez (Redis'in tek iş parçacıklı modeli). Ardışık (pipelined) istekler aynı pakette gelebilir.
- **LRU:** veri bir `OrderedDict`; her okuma/yazma anahtarı sona taşır. `maxmemory` aşılınca baştaki
  (en uzun süredir dokunulmayan) anahtarlar atılır. Bellek ≈ anahtar + değer + 64 bayt sayılır.
- **Süre dolumu, iki yoldan:** *tembel* — süresi geçmiş anahtara dokunulunca silinir; *etkin* — her
  100 ms süreli anahtarlardan 20 örnek alınır, geçmişler silinir, örneğin %25'ten fazlası geçmişse tur
  tekrarlanır (Redis'in algoritması). Böylece hiç okunmayan anahtarlar da bellekte kalmaz.
- **Anlık görüntü:** `SAVE`, `--kaydet` aralığı ve kapanışta bütün veri tek dosyaya atomik yazılır;
  açılışta yüklenir.

### RESP2 baytları

```
istek:   *3\r\n $3\r\nSET\r\n $6\r\nşehir\r\n $6\r\nİzmir\r\n   (uzunluklar BAYT; "şehir" UTF-8'de 6)
         ya da satır kipi (telnet):  SET anahtar değer\r\n
yanıt:   +OK\r\n   -ERR ileti\r\n   :42\r\n   $6\r\nİzmir\r\n   $-1\r\n (yok)   *2\r\n...(dizi)
```

### Anlık görüntü dosyası

```
"SFRCACHE1\n" | kayıt* | "SON" + kayıt_sayısı (8 bayt) | crc32 (önceki bütün baytlar, 4 bayt)
kayıt = anahtar_uz(4) anahtar değer_uz(4) değer bitiş_ms(8; 0 = süresiz)       (küçük sonlu)
yazma: dosya.tmp → fsync → rename (atomik) → klasör fsync
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| `store.py`    | `Store`: komutlar (`COMMANDS` tablosu + `_cmd_<ad>`), LRU, süre dolumu, INFO  |
| `resp.py`     | RESP2 çözücü (artımlı) ve kodlayıcı; istemci yanıt çözücüsü                   |
| `server.py`   | `CacheServer`: asyncio sunucu, arka plan görevleri, SAVE/QUIT                 |
| `snapshot.py` | anlık görüntü biçimi, atomik kaydetme, sağlama toplamlı yükleme              |
| `client.py`   | `CacheClient`: bloklayan küçük istemci                                        |
| `__main__.py` | `sun` ve `komut` alt komutları                                               |

## Güvenceler (testle kanıtlanan)

- **Gerçek Redis'le aynı yanıtlar:** rastgele komut dizileri (SET seçenekleri, sayaç kenar durumları:
  `01`, `-0`, `+5`, int64 sınırları ve taşma, EXPIRE ≤ 0, KEYS desenleri, yanlış argüman sayısı...) hem
  gerçek redis-server 7'ye hem bize gönderilir; yanıtlar aynı (hızlı: 6 × 150 komut, `--uzun`: 60 × 150).
  Hatalarda yalnız tür (`ERR`) karşılaştırılır (iletilerimiz Türkçe). redis-server yoksa atlanır.
- **Gerçek `redis-cli`** sunucumuzla konuşur (kuruluysa sınanır).
- **Protokol:** istek her noktadan bölünerek (bayt bayt dahil) gelse de aynı komutlar çıkar (Hypothesis);
  ardışık istekler; bozuk RESP'te açık hata ve bağlantı kapanışı.
- **Eşzamanlılık:** 5 istemci × 200 INCR → 1000 (kayıp yok).
- **Süre, LRU, kalıcılık:** sahte saatle TTL yuvarlaması (Redis gibi), tembel ve etkin silme, INCR'ın
  süreyi koruması / SET'in kaldırması, en son kullanılanın tahliyeden korunması, OOM, anlık görüntünün
  yeniden başlatmada geri gelmesi ve bozulmanın sağlama toplamıyla yakalanması.
- **Testin dişleri:** 7 bilerek bozulmuş sürüm (yanlış tahliye ucu, GET'in LRU'yu güncellememesi,
  tembel silme yok, `-0` kabulü, TTL yuvarlaması, yarım bulk dizgide beklememe, SET'in süreyi silmemesi)
  yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Son anlık görüntüden sonraki yazmalar çökmede kaybolur** (AOF/komut günlüğü yok). Bu bir önbellektir.
- **Yalnız dizgi türü:** liste, küme, karma (hash), sıralı küme, akış (stream), pub/sub, işlemler
  (MULTI/EXEC), Lua betikleri yok. `SET ... KEEPTTL/GET`, `EXPIRE NX/XX/GT/LT` seçenekleri yok.
- **Güvenlik:** kimlik doğrulama (AUTH) ve TLS yok; yalnız `127.0.0.1`'e bağlanır, internete açmayın.
- **Bellek ölçümü yaklaşıktır** (anahtar + değer + 64 bayt); gerçek Python bellek kullanımı daha fazladır.
- DBSIZE süresi geçmiş ama silinmemiş anahtarları saymaz (Redis sayar); etkin süre dolumu her turda
  süreli anahtarların listesini kurar (çok büyük veri için O(n)).
- Çoğaltma (replication) ve küme (cluster) yok.

## Buradan nereye

1. **AOF:** her değiştiren komutu RESP olarak bir günlüğe ekle, açılışta yeniden oynat (bkz.
   `anahtar_deger/wal.py`); `fsync` politikası seçeneği (her komut / saniyede bir).
2. **Yeni veri türleri:** `HSET/HGET` için değeri `dict` olan anahtarlar ve `WRONGTYPE` hatası.
3. **Yayın/abone (pub/sub):** `SUBSCRIBE`/`PUBLISH`; bağlantı başına abonelik kümesi.
4. **AUTH ve TLS:** ilk komutun parola denetimi; `asyncio.start_server(ssl=...)`.
5. **LFU tahliyesi:** sıklık sayacı + yaşlandırma (Redis'in `allkeys-lfu`'su).
6. **Çoğaltma:** ikinci bir sunucuya komut akışını yollamak (bkz. `raft` daha güçlü uzlaşma için).
