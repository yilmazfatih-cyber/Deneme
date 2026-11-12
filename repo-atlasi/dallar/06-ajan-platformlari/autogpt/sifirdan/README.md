# Mini AutoGPT Platform — blok, graf, veri akışlı yürütücü, kimlik bilgisi, zamanlayıcı

Bu klasör, [AutoGPT dosyasında](../README.md) anlatılan çekirdek mekanizmayı **sıfırdan, özgün kodla** kurar:
tipli bloklar → graf JSON'u → doğrulama → iş kuyruklu veri akışı yürütücüsü → sqlite'ta düğüm yürütme kayıtları →
kimlik bilgisi soyutlaması → cron tetikleyici. Gerçek depodan kod kopyalanmadı (platform kodu PolyForm Shield
lisanslıdır); adlar kavramları eşleştirmek için benzer tutuldu.

## Gereksinimler

- Python 3.11+ (yalnızca standart kütüphane: `sqlite3`, `json`, `uuid`, `datetime`). Ağ, LLM, paket kurulumu yok.

## Çalıştırma

```bash
cd repo-atlasi/dallar/06-ajan-platformlari/autogpt/sifirdan
python3 calistir.py                                      # ornek_graf.json, tutarlar=[120, 40, 300]
python3 calistir.py ornek_graf.json '{"tutarlar": [5, 500, 100]}'
python3 calistir.py ornek_graf.json '{"tutarlar": ["abc", 5]}'   # hata yolu: bir öğe FAILED, diğeri devam eder
```

Beklenen çıktı (kısaltılmış):

```text
Graf: Sipariş tutarlarını eşiğe göre ayır  |  topolojik sıra: esik → giris → gez → kosul → …
Durum: COMPLETED
  çıkış buyukler: ['Büyük sipariş: 120 TL', 'Büyük sipariş: 300 TL']
  çıkış kucukler: ['Küçük sipariş: 40 TL']
```

## Test

```bash
python3 -m unittest discover -s . -t .      # 52 test, ağsız, ~0,2 sn
```

Önbellek dosyası bırakmamak için başına `PYTHONDONTWRITEBYTECODE=1` ekleyebilirsin; `.gitignore` zaten
`__pycache__/` ve `*.sqlite3` dosyalarını dışarıda tutar.

## Aşamalar

| Dosya                   | Ne öğretir                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asama1_blok.py`        | `Block`, `SchemaField`, `BlockSchemaOutput` (standart `error` pini), üreteçle çok çıkış, `run()` istisnalarını `BlockError` ailesine çeviren `execute`, alt sınıf taramasıyla kayıt, blok başına örnek test |
| `asama2_graf.py`        | `Graph` / `Node` / `Link` JSON modeli, başlangıç düğümleri, tüm hataları toplayan doğrulama, Kahn ile topolojik sıra, dinamik pin kökleri                                                                   |
| `asama3_yurutucu.py`    | `ExecutionStore` (sqlite), `upsert_execution_input`, veri akışı: fan-out, fan-in, dallanma, statik bağlantı, `_#_` / `_$_` pinleri, hata pini, düğüm hatasında grafın sürmesi                               |
| `asama4_kimlik.py`      | `APIKeyCredentials`, `Secret` (maskelenen değer), `CredentialsStore.resolver`, sahiplik ve sağlayıcı denetimi, kimlik isteyen `LLMCallBlock` + `FakeLLM`                                                    |
| `asama5_zamanlayici.py` | 5 alanlı cron ayrıştırıcı (hafta gününde 0 ve 7 Pazar), `next_after`, kalıcı zamanlama tablosu, "önce ilerlet, sonra çalıştır" `tick`                                                                       |
| `ornek_graf.json`       | Giriş → liste gezme → koşul (eşik statik) → iki metin dalı → iki çıkış                                                                                                                                      |

Okuma sırası: aşama 1'deki `ConditionBlock` ve `StepThroughItemsBlock` → aşama 3'teki `_enqueue_next_nodes` →
`tests/test_yurutucu.py` içindeki `test_dal_gelmeyen_dugum_eksik_kalir`.

## Mini ile gerçek depo eşlemesi

| Mini'deki parça                                    | Gerçek depodaki karşılığı (dosya yolu)                                                                                                                                        | Fark                                                                                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Block`, `BlockSchema`, `BlockSchemaOutput`        | `autogpt_platform/backend/backend/blocks/_base.py`                                                                                                                            | Gerçekte Pydantic modelleri + `jsonschema`; ayrıca maliyet, efekt, HITL, webhook alanları. `run()` / `execute()` asenkron üreteçtir (`async def` + `yield`)                                                    |
| `SchemaField`                                      | `autogpt_platform/backend/backend/data/model.py` (`def SchemaField(...)`)                                                                                                     | Gerçekte bir sınıf değil, Pydantic alanı döndüren bir fonksiyondur; pin tipi `value1: Any = SchemaField(...)` örneğindeki gibi tip ipucundan okunur. Mini'de tip, alanın `type` niteliğidir                    |
| `BlockError` ailesi, `Block.execute` hata çevirisi | `autogpt_platform/backend/backend/util/exceptions.py`, `autogpt_platform/backend/backend/blocks/_base.py` (`Block.execute`)                                                   | Aynı kural: `ValueError` → `BlockExecutionError`, diğerleri → `BlockUnknownError`; gerçekte `InsufficientBalanceError` da olduğu gibi geçer                                                                    |
| `load_all_blocks`, `validate_block_classes`        | `autogpt_platform/backend/backend/blocks/__init__.py`                                                                                                                         | Gerçek sürüm klasördeki tüm modülleri `importlib` ile içe aktarır ve sonucu önbelleğe alır                                                                                                                     |
| `run_block_self_test`                              | `autogpt_platform/backend/backend/util/test.py` (`execute_block_test`)                                                                                                        | Gerçekte `test_mock` ile dış çağrılar taklit edilir                                                                                                                                                            |
| `Graph`, `Node`, `Link`, `validate_graph`          | `autogpt_platform/backend/backend/data/graph.py` (`_validate_graph_structure`)                                                                                                | Gerçek doğrulama döngü aramaz ve bağlantıda yalnızca pin adının varlığına bakar; bağlantı **tip** denetimi ve döngü reddi mini'ye özgüdür (öğretim için)                                                       |
| `topological_order`                                | (karşılığı yok)                                                                                                                                                               | Gerçek yürütücü topolojik sıra kullanmaz; burada yalnızca doğrulama/görselleştirme için                                                                                                                        |
| `ExecutionStore.upsert_execution_input`            | `autogpt_platform/backend/backend/data/execution.py`                                                                                                                          | Gerçekte Prisma + PostgreSQL ve "bu girişi son 1 günde almamış" filtresi; çağrı Redis kilidiyle sarılır (kilit: `autogpt_platform/backend/backend/executor/manager.py` → `synchronized`)                       |
| `Executor.run` / `_enqueue_next_nodes`             | `autogpt_platform/backend/backend/executor/manager.py` (`ExecutionProcessor`, `_enqueue_next_nodes`)                                                                          | Gerçekte düğümler eşzamanlı koşar; ücretlendirme, moderasyon, iptal, REVIEW durumu vardır                                                                                                                      |
| Graf durumu (FAILED / COMPLETED)                   | `autogpt_platform/backend/backend/executor/manager.py` (`ExecutionProcessor._on_graph_execution`)                                                                             | Gerçekte sınıflandırılmamış düğüm hataları grafı başarısız saymaz (hata pini bilerek bağlanmış olabilir); mini sürüm her düğüm hatasında FAILED der                                                            |
| `merge_dynamic_pins`, `extract_output`             | `autogpt_platform/backend/backend/data/dynamic_fields.py`                                                                                                                     | Gerçekte `_@_` (nesne niteliği) ayracı ve güvenli ad denetimi de var                                                                                                                                           |
| `CredentialsStore`, `Secret`                       | `autogpt_platform/backend/backend/data/model.py`, `autogpt_platform/backend/backend/integrations/credentials_store.py`, `autogpt_platform/backend/backend/util/encryption.py` | Gerçekte Fernet ile şifreli, OAuth yenileme, kiralama (lease); mini sürüm düz metin tutar ve bunu açıkça söyler                                                                                                |
| `CronExpression`, `Scheduler.tick`                 | `autogpt_platform/backend/backend/executor/scheduler.py`                                                                                                                      | Gerçekte APScheduler + PostgreSQL iş deposu, ayrı süreç, saat dilimi, kaçırılan iş politikası. Unix hafta günü (0/7 = Pazar), APScheduler'ın 0 = Pazartesi düzenine `_normalize_cron_day_of_week` ile çevrilir |

## Bilinçli sadeleştirmeler

- Tek iş parçacığı, FIFO kuyruk: aynı girişle her çalıştırma aynı sırada ilerler (testler deterministik).
- Bloklar eşzamanlı (senkron) üreteçtir; gerçek `Block.run` / `Block.execute` `async def` + `yield` ile asenkron
  üreteçtir.
- Mini doğrulayıcı döngüleri ve tip uyuşmayan bağlantıları reddeder; gerçek platform ikisini de yapısal olarak
  yasaklamaz (yalnızca pin adlarını ve blok varlığını denetler).
- Kimlik bilgileri düz metin: Python standart kütüphanesinde AES/Fernet yok. Üretimde asla böyle saklama.
