# Mimari: on sistem, ortak kalıplar

Sistemler birbirine bağlı değildir ama aynı birkaç fikri tekrar tekrar kullanır. Bunları bilmek, bir
sistemden ötekine geçmeyi kolaylaştırır.

## Sistemler arası ilişki (kavramsal; kod bağı yok)

```
                    ┌──────────────┐   tablolar kalıcı olsun → btree üstüne    ┌──────────┐
   SQL metni ─────► │   mini_sql   │ ───────────────────────────────────────► │  btree   │
                    └──────┬───────┘                                           └──────────┘
                           │ işlem (BEGIN/COMMIT) gerekirse                     sayfalı dizin
                           ▼
                    ┌──────────────┐   onaylanan yazma kümesi → write_batch    ┌──────────────┐
                    │    islem     │ ───────────────────────────────────────► │ anahtar_deger│
                    └──────────────┘                                           └──────────────┘
                                                                                WAL + SSTable
   çoğaltma: raft (uzlaşma, güçlü tutarlılık)  ↔  crdt (uzlaşmasız, sonunda tutarlılık)
   servisler: onbellek_sunucu (bellek, RESP), is_kuyrugu (SQLite, en az bir kez), arama_motoru (ters dizin)
   mini_git: içerik adresli nesne deposu (anahtar = içeriğin özeti) — anahtar_deger'in "değişmez dosya" fikri
```

Oklar "buradan nereye" bağlantılarıdır; her biri ilgili README'de ayrıntılı yazar.

## Ortak kalıplar

| Kalıp | Nerede | Fikir |
| --- | --- | --- |
| Önce günlük, sonra uygula | `anahtar_deger/wal.py`, `raft` günlüğü, `onbellek_sunucu` AOF (öneri) | değişikliği önce sona ekle (+fsync), sonra durumu değiştir; çökmede günlükten yeniden kur |
| Yeni dosyayı yaz, sonra atomik değiştir | SSTable + MANIFEST, B+ ağacı başlığı, anlık görüntü, git ref'leri | `dosya.tmp` → fsync → `rename` → klasör fsync; okuyucu ya eskiyi ya yeniyi görür |
| Sağlama toplamı | WAL kaydı, SSTable bloğu/alt bilgisi, MANIFEST, B+ başlığı, önbellek görüntüsü, git (SHA-1) | yarım ya da bozuk veriyi sessizce kullanma |
| Sıra numarası / damga | Lamport (`crdt`), dönem (`raft`), onay zamanı (`islem`), sürüm vektörü (`crdt/causal.py`) | olayları sıralamanın ve "bunu gördüm mü?" sorusunun yanıtı |
| Yinelenen isteği ayıklama | `raft/kv.py` (istemci, sıra), `is_kuyrugu` (idempotentlik anahtarı), `crdt/causal.py` | en az bir kez teslim + ayıklama = tam bir kez etki |
| Belirlenimci benzetim | `anahtar_deger/sim_fs.py`, `raft/sim.py`, `islem/scheduler.py` | saat, ağ, disk ve iç içe geçme tohumlu; aynı tohum = aynı geçmiş = yeniden üretilebilir hata |
| Farksal test | `mini_sql` ↔ sqlite3, `mini_git` ↔ git, `onbellek_sunucu` ↔ redis-server | aynı rastgele girdiyi başvuruya ve bize ver, çıktıları karşılaştır |
| Model testi | `anahtar_deger`, `btree` ↔ `dict`; `crdt` ↔ işlem günlüğü; `islem` ↔ seri yeniden oynatma | basit, açıkça doğru bir modelle karşılaştır |
| Testin dişleri | her sistem | bilerek bozulmuş sürümü (monkeypatch) yakalayan test: denetleyici gerçekten denetliyor mu? |

## Test düzeni

- `tests/<sistem>/`: her sistemin testleri; yardımcı üreteçler aynı klasörde (`sqlgen.py`, `chaos.py`,
  `anomalies.py`, `kinds.py`, `harness.py`).
- `tests/conftest.py`: Hypothesis profilleri (`hizli` 40 örnek, `uzun` 400 örnek; `SIFIRDAN_UZUN=1`).
- `tests/yardimci.py`: `seed_count(hızlı, uzun)` — tohum döngülerinin boyu.
- `@pytest.mark.uzun`: yalnız `scripts/check.py --uzun` ile koşar.
- `tests/test_kurallar.py`: temelin kuralları.
