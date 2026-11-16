# raft — uzlaşma (consensus), belirlenimci benzetimle

Beş sunucu, bazıları çökse ve ağ bölünse bile **aynı komutları aynı sırayla** nasıl uygular? Raft:
bir lider seçilir; komutlar liderin günlüğüne eklenir, çoğunluğa çoğaltılınca **taahhüt** edilir ve her
sunucunun durum makinesine sırayla uygulanır. Bu klasör Raft'ı (Ongaro & Ousterhout, 2014) baştan yazar,
gerçek ağ ve saat yerine **sanal saat + sanal ağla** koşturur ve güvenlik özelliklerini her olayda
denetler. Üstünde çoğaltılmış küçük bir anahtar-değer servisi vardır. Yalnız standart kitaplık.

```python
from raft import Cluster, Network

cluster = Cluster(size=5, seed=1, network=Network(drop=0.05, duplicate=0.05))
cluster.run(1000)  # 1 saniye SANAL zaman (gerçekte milisaniyeler)
cluster.submit(("set", "şehir", "İzmir", "istemci-1", 1))  # (tür, anahtar, değer, istemci, sıra)
cluster.run(300)
cluster.machines[3].data  # {'şehir': 'İzmir'} — her kopyada
cluster.crash(cluster.leader())  # lider çöktü
cluster.partition({0, 1}, {2, 3, 4})  # ağ ikiye bölündü
cluster.run(1500)
cluster.heal()
cluster.restart(0)  # yalnız diskteki durumla geri gelir
```

## Nasıl çalışır

```
 istemci ──► LİDER: günlüğe ekle ──AppendEntries──► izleyiciler: prev tutuyorsa ekle, "tamam" de
                 │                                              │
                 └── çoğunluk "tamam" dedi ve girdi BU dönemden ──► taahhüt ──► herkes sırayla uygular
 lider sessiz kalırsa: izleyicinin seçim zamanlayıcısı (150–300 ms, rastgele) dolar → aday olur,
 dönemi artırır, RequestVote ister; çoğunluğun oyunu alan lider olur ve boş bir girdi ekler.
```

| Kural (Şekil 2)               | Nerede                    | Neden                                                    |
| ----------------------------- | ------------------------- | -------------------------------------------------------- |
| Daha büyük dönem gören izleyici olur | `RaftNode.receive`  | eski lider kendini bilsin                                |
| Dönem başına en çok bir oy; `votedFor` diske | `_on_request_vote` | iki lider olmasın (yeniden başlasa bile)       |
| Aday günlüğü en az bizimki kadar güncel olmalı | `_log_up_to_date` | taahhüt edilmiş girdiyi taşımayan lider olamaz |
| `prev_index/prev_term` tutmazsa ret | `_on_append`        | günlükler aynı önekten büyür (günlük eşleşmesi)          |
| Yalnız ÇATIŞAN girdiden sonrası silinir | `_on_append`    | gecikmiş/yinelenen eski ileti doğru girdileri silmesin   |
| Lider yalnız kendi dönemindeki girdiyi sayarak taahhüt eder | `_advance_commit` | "Şekil 8": eski dönem girdisi çoğunlukta olsa da ezilebilir |
| Lider olunca boş girdi        | `_become_leader`          | önceki dönemlerin girdileri hemen taahhüt edilebilsin     |
| Ret yanıtında çatışan dönemin ilk dizini | `_on_append` → `_on_append_reply` | lider bir turda bütün dönemi atlar (hızlı yakalama) |

**Kalıcı durum** (`messages.Storage`): `current_term`, `voted_for`, `log`. Benzetimde `Storage` nesnesi
"disktir": çökmede kalır, uçucu durum (commit_index, lider tabloları, durum makinesi) gider; yeniden
başlayan düğüm durum makinesini günlükten yeniden kurar. Kalıcı alanlar yanıt gönderilmeden ÖNCE
güncellenir.

**Belirlenimci benzetim** (`sim.py`): olay kuyruğu (zaman, sıra) ile sıralı; ağ her ileti için tohumlu
rastgele gecikme, kayıp ve yineleme uygular; bölünmede gruplar arası ileti düşer. Aynı tohum → aynı
geçmiş; `sleep` yok.

**Anahtar-değer servisi** (`kv.py`): komutlar `(tür, anahtar, değer, istemci, sıra)`. İstemci yanıt
alamazsa AYNI sıra numarasıyla yeniden dener; durum makinesi istemci başına son sırayı tutar →
günlükte iki kez bulunan komut bir kez uygulanır (tam bir kez etki).

## Denetlenen güvenlik özellikleri

Benzetim her olayda (günlük eşleşmesi her 20 teslimde ve her `run` sonunda) denetler; bozulursa
`SafetyViolationError` fırlar:

1. **Seçim güvenliği:** bir dönemde en çok bir lider.
2. **Durum makinesi güvenliği:** aynı dizinde her düğüm aynı girdiyi uygular.
3. **Taahhüt kaybolmaz (lider bütünlüğü):** taahhüt edilmiş her girdi, sonra seçilen her liderin
   günlüğünde aynı dizinde vardır.
4. **Günlük eşleşmesi:** iki günlükte aynı dizin ve dönemdeki girdiler, öncekilerle birlikte aynıdır.

## Dosya haritası

| Dosya         | Sorumluluk                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| `node.py`     | `RaftNode`: seçim, çoğaltma, taahhüt, uygulama; `Timing`                    |
| `messages.py` | iletiler ve `Storage` (kalıcı durum)                                        |
| `sim.py`      | `Cluster`: sanal saat, ağ, çökme/yeniden başlama, bölünme, güvenlik denetimleri |
| `kv.py`       | `KVStateMachine`: çoğaltılmış anahtar-değer, yinelenen istek ayıklama        |

## Güvenceler (testle kanıtlanan)

- **Senaryolar:** sağlıklı kümede tek lider ve çoğaltma; lider çökünce daha büyük dönemde yeni lider,
  eski lider dönünce izleyici olur ve yakalar; azınlıkta kalan lider taahhüt EDEMEZ, bölünme bitince
  onun taahhüt edilmemiş girdileri silinir; bütün küme kapanıp açılınca veri ve dönemler korunur; tek
  düğümlü küme.
- **Kaos (ılımlı, 5 düğüm):** %5 kayıp, %5 yineleme, 2–60 ms gecikme, rastgele çökme/kalkma/bölünme +
  3 istemci; sonra iyileşme: her kopya aynı veriye varır ve onaylanan her istek tam bir kez uygulanmıştır
  (hızlı: 10 tohum; `--uzun`: 200 tohum).
- **Kaos (sert, 3 düğüm):** sık "çök ve hemen kalk", %20 kayıp, kısa seçim zaman aşımına karşı uzun
  gecikme (seçim fırtınası, tohum başına ~13 lider): hiçbir güvenlik ihlali yok (hızlı: 40, `--uzun`:
  1000 tohum).
- **Denetimin dişleri:** bilerek bozulmuş sürümler yakalanır: `votedFor`'u yok sayan oy (iki lider),
  diske yazılmayan `votedFor`, prev'den sonrasını koşulsuz silen izleyici ve (uzun denetimde) Şekil 8'in
  güvensiz taahhüt kuralı. Geliştirme sırasında ılımlı kaosun bu hataları neredeyse hiç yakalamadığı
  ölçüldü (Şekil 8: 0/200, oy kalıcılığı: 0/200); "sert" ayar bu yüzden eklendi.

## Sağlamadıkları (dürüst sınırlar)

- **Gerçek ağ ve disk yok:** düğümler bir benzetimde koşar; TCP, serileştirme, gerçek `fsync` yoktur.
  Olay işlenirken yarıda çökme modellenmez (her olay atomik varsayılır).
- **Anlık görüntü (snapshot) ve günlük sıkıştırma yok:** günlük sonsuza dek büyür; yeniden başlayan
  düğüm her şeyi baştan uygular.
- **Üyelik değişikliği yok:** küme boyu sabittir.
- **Okumalar doğrusallaştırılabilir değil:** `machines[i].data` yerel kopyayı okur (bayat olabilir).
- **Canlılık garanti değil:** seçim zaman aşımı ağ gecikmesine göre kısaysa (sert ayar) küme uzun süre
  lidersiz kalabilir; testler orada yalnız güvenliği ölçer. Ön oylama (pre-vote) ve lider devri yok.
- Rastgele kaos bir kanıt değildir: belirli, çok nadir bir iç içe geçmeyi kaçırmış olabilir.

## Buradan nereye

1. **Anlık görüntü:** `Storage`'a `snapshot_index/term/state`; InstallSnapshot iletisi; günlüğü kırp.
2. **Doğrusallaştırılabilir okuma:** "read index" (liderin çoğunluktan kalp atışı onayı) ya da okuma
   komutunu günlükten geçirmek.
3. **Ön oylama (pre-vote) ve CheckQuorum:** ağdan kopup dönen düğümün dönemi gereksiz şişirmesini önler.
4. **Üyelik değişikliği:** tek sunuculu ekleme/çıkarma (dissertation §4.1).
5. **Gerçek dağıtım:** `send` geri çağrısını asyncio TCP ile, `Storage`'ı fsync'li bir WAL ile
   değiştirmek (bkz. `anahtar_deger/wal.py`).
6. **Daha akıllı kaos:** kapsama yönlendirmeli arama (ör. liderlik değişiminden hemen sonra çökme
   olasılığını artırmak) ile nadir hataları daha hızlı bulmak.
