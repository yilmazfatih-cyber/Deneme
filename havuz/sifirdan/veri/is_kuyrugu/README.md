# is_kuyrugu — SQLite üstünde kalıcı iş kuyruğu

"E-posta gönder", "raporu hazırla" gibi işleri **sonra ve güvenle** yapmak için: işler bir SQLite
dosyasında bekler; işçiler alır, işler, onaylar. İşçi çökse, makine kapansa da iş kaybolmaz (en az
bir kez teslim). Görünürlük zaman aşımı, üstel geri çekilmeli yeniden deneme, ölü mektup, idempotentlik
anahtarı, gecikmeli / öncelikli / cron'la yinelenen işler. Yalnız standart kitaplık (`sqlite3`).

```python
from is_kuyrugu import JobQueue, Worker

q = JobQueue("isler.db", visibility_timeout=30, max_attempts=5)
q.enqueue("eposta", {"kime": "ayse@ornek.tr"}, priority=5, idempotency_key="hosgeldin-42")
q.enqueue("eposta", {"kime": "can@ornek.tr"}, delay=3600)  # 1 saat sonra
q.schedule("gunluk-rapor", "30 8 * * 1-5", "rapor", {})  # hafta içi 08:30 (UTC)


def gonder(job):  # istisna fırlatırsa: geri çekilmeyle yeniden denenir
    ...


Worker(q, "isci-1", "eposta", gonder).drain()
```

Komut satırı: `python -m is_kuyrugu isler.db ekle eposta '{"kime": "x"}' --oncelik 5 --anahtar k1`,
`... durum eposta`, `... olu eposta`, `... yeniden 17`, `... zamanla rapor "*/15 * * * *" rapor '{}'`,
`... tetikle`.

## Nasıl çalışır

```
 enqueue ──► [bekliyor] ──reserve (kira: visible_at = şimdi + 30 sn, attempts += 1)──► [isleniyor]
                 ▲                                                                   │   │   │
                 │  fail(): attempts < max → visible_at = şimdi + 2·2^(attempts-1)   │   │   │ ack()
                 └──────────────────────────────────────────────────────────────────┘   │   ▼
                    kira doldu (işçi çöktü/yavaş): yeniden alınabilir ◄─────────────────┘ [tamam]
                    fail() ya da kira dolumu ve attempts ≥ max ──────────────────────► [olu] (ölü mektup)
```

- **Tek sütun, iki anlam:** `visible_at` bekleyen iş için "çalışma zamanı", işlenen iş için "kira
  bitişi"dir. `reserve` ikisini aynı sorguyla tarar: `status IN ('bekliyor','isleniyor') AND
  visible_at <= şimdi`, sıra: öncelik büyük → en eski → küçük kimlik.
- **Aynı işi iki işçi almaz:** `reserve`, `BEGIN IMMEDIATE` ile veritabanı yazma kilidini alır; seçim ve
  güncelleme tek işlemdedir. SQLite WAL kipinde okuyucular beklemez.
- **Kira jetonu:** her alma yeni bir jeton üretir. `ack`/`fail`/`extend` jetonu denetler; kirası düşmüş
  eski işçinin onayı `LeaseLostError` alır (başkasının aldığı işi kapatamaz).
- **En az bir kez:** işçi işi yapıp onaylamadan ölürse iş yeniden verilir → iş İKİ KEZ çalışabilir.
  Yan etkisi olan işleyici `job.idempotency_key` ile "bunu zaten yaptım mı?" bakmalıdır.
- **İdempotentlik anahtarı:** `UNIQUE` sütun; aynı anahtarla ikinci `enqueue` yeni iş açmaz.
- **Cron:** `schedules` tablosu; `tick()` zamanı gelen dilimi `cron:<ad>:<zaman>` anahtarıyla sıraya
  koyar, sonra `next_run`'ı ilerletir. Zamanlayıcı ikisinin arasında ölse ya da iki zamanlayıcı aynı
  anda çalışsa bile dilim başına TEK iş açılır. Kapalıyken kaçırılan dilimler için tek bir yakalama işi
  açılır (hepsi değil).

### Tablo

```sql
jobs(id, queue, payload JSON, status, priority, visible_at, attempts, max_attempts,
     idempotency_key UNIQUE, lease_token, worker, last_error, created_at, finished_at)
schedules(name PRIMARY KEY, cron, queue, payload, next_run)
```

Kalıcılık: `journal_mode=WAL`, `synchronous=FULL` → `enqueue`/`ack` döndüğünde değişiklik diske yazılmıştır.

## Dosya haritası

| Dosya         | Sorumluluk                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `queue.py`    | `JobQueue`: şema, enqueue, reserve, ack, fail, extend, ölü mektup, cron tetikleme |
| `worker.py`   | `Worker`: al → işle → onayla / hata kaydet döngüsü                               |
| `cron.py`     | `Cron`: 5 alanlı ifade ayrıştırıcı, `next_after`, Vixie gün kuralı                |
| `__main__.py` | komut satırı                                                                     |

## Güvenceler (testle kanıtlanan)

- **Eşzamanlılık:** 4 gerçek iş parçacığı (her biri kendi bağlantısıyla) aynı anda 300 işi alır: her
  iş tam bir kez alınır.
- **Gerçek süreç çökmesi:** (1) işi alıp onaylamadan `os._exit` eden süreç → kira dolunca iş başka işçiye
  geçer; (2) alma işleminin ortasında (COMMIT'ten önce) ölen süreç → hiçbir şey olmamış sayılır.
- **Kira, geri çekilme, ölü mektup:** bekleme süreleri 2, 4, 8 sn; deneme hakkı bitince ölü mektup;
  defalarca kirası düşen "zehirli" iş de ölü mektuba gider; yeniden sıraya koyma.
- **Cron:** bilinen örnekler (artık yıl, Vixie "13'ü ya da Cuma", 7 = Pazar) ve rastgele ifadelerde
  atlamalı `next_after` ile dakika dakika arama aynı sonucu verir; zamanlayıcı çökse de dilim başına tek iş.
- **Testin dişleri:** 6 bilerek bozulmuş sürüm (ertelenmiş BEGIN, jeton denetimsiz ack, geri çekilmesiz
  fail, anahtarsız cron dilimi, süresi dolan kirayı geri almama, Vixie kuralı yerine VE) yakalandı.
- Saat dışarıdan verilir (`clock=`); testlerde gerçek bekleme yoktur.

## Sağlamadıkları (dürüst sınırlar)

- **Tam bir kez değil, en az bir kez:** yinelenen çalıştırmadan işleyicinin idempotentliği korur.
- **Tek makine:** SQLite dosyası paylaşılır; ağ dosya sistemi (NFS) üstünde kilitler güvenilmezdir.
  Çok yüksek hızda (saniyede binlerce iş) yazma kilidi darboğaz olur.
- **Cron UTC'dir;** saat dilimi ve yaz saati yok. Kaçırılan dilimlerin hepsi değil, biri çalışır.
- **Saatler arası sapma:** kira süresi süreçlerin saatine güvenir; saatleri çok farklı makineler aynı
  dosyayı kullanmamalıdır.
- Sonuç saklama (iş çıktısı), iş bağımlılıkları (A bitince B), oran sınırlama yok.

## Buradan nereye

1. **Kalp atışı:** uzun işler için ayrı iş parçacığında `extend(job)` çağıran yardımcı.
2. **Sonuç ve ilerleme:** `jobs`'a `result` ve `progress` sütunları (şema sürümünü artırıp göç yazın).
3. **İş zincirleri:** `depends_on` sütunu; ancak bağımlı iş `tamam` olunca görünür olsun.
4. **Saat dilimli cron:** `zoneinfo` ile; yaz saati geçişi testleri.
5. **Kuyruk başına eşzamanlılık sınırı:** aynı anda en çok N `isleniyor` iş.
6. **Ölçümler:** bekleme süresi, deneme sayısı dağılımı, ölü mektup oranı için `stats` genişletmesi.
