# sifirdan/veri — model talimatları

## Bu temel ne yapar

On üç bağımsız mini sistem (her biri bir Python paketi, yalnız standart kitaplık): LSM deposu
(`anahtar_deger`), B+ ağacı (`btree`), SQL motoru (`mini_sql`), işlemler (`islem`), arama motoru
(`arama_motoru`), CRDT'ler (`crdt`), sürüm denetimi (`mini_git`), Raft (`raft`), iş kuyruğu
(`is_kuyrugu`), önbellek sunucusu (`onbellek_sunucu`) ve isteğe bağlı üç sistem: akış işleme
(`akis`), tutarlı karma (`tutarli_karma`), sütun deposu (`sutun_deposu`). Her paketin README'si nasıl
çalıştığını, dosya biçimlerini ve sınırlarını anlatır. Önce ilgili paketin README'sini oku.

## Komutlar

Hepsi bu klasörden (`havuz/sifirdan/veri`) çalışır.

| Komut | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -r requirements-dev.lock && uv pip install --python .venv/bin/python -e . --no-deps` | kurulum |
| `.venv/bin/python scripts/check.py` | **denetim**: ruff + biçim + mypy + pytest (hızlı, ağsız) |
| `.venv/bin/python scripts/check.py --duzelt` | önce ruff'ın düzeltebildiklerini düzeltir |
| `.venv/bin/python scripts/check.py --sistem <ad>` | yalnız bir sistemin testleri (lint/tip yine hepsi) |
| `.venv/bin/python scripts/check.py --uzun` | uzun rastgele senaryolar (`@pytest.mark.uzun`) dahil |
| `.venv/bin/python -m pytest tests/<ad> -x -q` | tek sistemi hızlıca dene |
| `uv pip compile pyproject.toml --extra dev --universal --python-version 3.11 -o requirements-dev.lock` | kilidi yeniler (yalnız bağımlılık değişince) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| LSM yazma/okuma/kurtarma | `anahtar_deger/store.py`; WAL biçimi `wal.py`; SSTable `sstable.py`; çökme testi `tests/anahtar_deger/test_crash.py` |
| B+ ağacı bölünme/birleşme | `btree/tree.py`; değişmezler `btree/invariants.py` |
| SQL söz dizimi | `mini_sql/parser.py` (deyim), `parse_expr.py` (ifade), `syntax.py` (AST) |
| SQL anlamı (NULL, tür, aritmetik) | `mini_sql/values.py`; işlevler `functions.py` (`YENİ ... BURAYA`) |
| SQL planı / yürütme | `mini_sql/planner.py`, `access.py` (dizin), `operators.py` |
| İşlem yalıtımı | `islem/mvcc.py`; kilitler `locks.py`; 2PL `two_phase.py`; zamanlayıcı `scheduler.py` |
| Arama puanı / sorgu dili | `arama_motoru/search.py`, `query.py`; Türkçe çözümleme `text.py` |
| Yeni CRDT türü | `crdt/` + `tests/crdt/kinds.py`'ye bir `Kind` satırı |
| Git komutu | `mini_git/commands.py` / `switch.py`; nesne biçimi `objects.py` |
| Raft kuralı | `raft/node.py`; benzetim ve güvenlik denetimi `raft/sim.py`; kaos `tests/raft/chaos.py` |
| Kuyruk davranışı / cron | `is_kuyrugu/queue.py`, `cron.py` |
| Önbellek komutu | `onbellek_sunucu/store.py` (`COMMANDS` + `_cmd_<ad>`); protokol `resp.py` |
| Parçalama / karma halkası | `tutarli_karma/ring.py`; taşıma `rebalance.py` |
| Akış penceresi / filigran | `akis/engine.py`; pencereler `windows.py`; kümelemeler `aggregates.py` |
| Sütun kodlaması / analitik sorgu | `sutun_deposu/encoding.py` (`encode` seçim kuralı); sorgu `table.py` |
| Temel kuralları | `tests/test_kurallar.py` (`SYSTEMS` listesi) |

## Değişmez kurallar

1. Paketler yalnız standart kitaplığı ve kendi içini (`from .x import`) içe aktarır; kardeş pakete ya da
   üçüncü taraf pakete bağlanmaz. → `test_packages_import_only_stdlib_and_themselves`
2. Her kaynak dosya Türkçe başlık yorumuyla ve `Genişletme:` satırıyla açılır; ~300 satırı (en çok 340)
   aşmaz. → `test_source_file_rules`
3. Kaynakta görünmez/birleşen karakter yok (STANDARTLAR §6.11); gerekiyorsa kaçış dizisi.
   → `test_source_file_rules`, `python3 ../../araclar/kacis.py .`
4. Her sistemin README'sinde "Nasıl çalışır, Dosya haritası, Güvenceler, Sağlamadıkları, Buradan nereye"
   bölümleri vardır; kök README tablosunda listelenir. → `test_system_readme_has_required_sections`
5. Testlerde gerçek `sleep` ve sabit kapı yok; saat/rastgelelik enjekte edilir, kapı `0` istenir.
   → inceleme (sunucu testleri `port=0` kullanır)
6. Uzun süren rastgele senaryolar `@pytest.mark.uzun` ile işaretlenir; hızlı denetim ~2 dakikayı aşmaz.
7. Farksal testler (sqlite3, git, redis) **gevşetilmez**: fark çıkarsa önce gerçek davranışı ölç (başvuruyu
   doğrudan çalıştır), sonra ya kodu düzelt ya da üreteci desteklenen alt kümeye çek ve README'ye yaz.
8. Bir güvenlik iddiası (çökme, Raft, serileştirme) değiştirilince ilgili "dişler" testi (`test_checker_*`)
   hâlâ yakalıyor olmalı.
9. Türkçe büyük/küçük harf için `lower_tr`/`upper_tr` (arama_motoru/text.py, mini_sql/functions.py);
   SQL'in `lower/upper`'ı SQLite gibi yalnız ASCII'dir — bu bilinçlidir.

## Tarifler

**Yeni SQL işlevi** (`mini_sql`): `functions.py` → `SCALAR_FUNCTIONS`'a `"ad": (en_az, en_çok, işlev)`;
işlev `list[Value] -> Value`, NULL gelirse çoğunlukla `None` döndürür. `tests/mini_sql/test_values.py`'deki
`EXPRESSIONS`'a sqlite3'te de olan bir örnek ekle (yoksa ayrı bir test). Doğrulama: `scripts/check.py --sistem mini_sql`.

**Yeni önbellek komutu** (`onbellek_sunucu`): `store.py` → `COMMANDS`'a `"ad": (en_az, en_çok)` ve
`_cmd_ad(self, args) -> Reply` yöntemi. Redis'te de varsa `tests/onbellek_sunucu/test_redis_diff.py`
→ `random_command`'a bir seçenek ekle (gerçek Redis'le karşılaştırılır).

**Yeni CRDT türü**: `crdt/<tür>.py` → `apply(op)`, `merge(other)`, `value()`, `state()` yöntemleri; yerel
işlem yöntemleri işlemi uygulayıp döndürür. `crdt/__init__.py`'ye ekle; `tests/crdt/kinds.py` → `KINDS`'a
`Kind(ad, sınıf, rastgele_işlem, beklenen_değer_ya_da_None)`. Yasalar ve yakınsama testleri kendiliğinden koşar.

**Yeni git komutu**: iş mantığı `mini_git/commands.py`'de veri döndüren bir işlev; `__main__.py` →
`_parser`'a alt komut ve `_run`'da dal; `tests/mini_git/test_workflow.py`'ye test. Çalışma ağacını
değiştiriyorsa `switch._require_clean` ile başla.

**Raft'a özellik** (ör. anlık görüntü): `raft/messages.py` (ileti/Storage alanı) → `raft/node.py` →
benzetimde güvenlik denetimleri hâlâ geçmeli (`scripts/check.py --sistem raft`, sonra `--uzun`). Yeni bir
hata türü için `tests/raft/chaos.py` → `_chaos_step`'e olasılık dalı.

**Yeni cron kısaltması** (`@hourly` gibi): `is_kuyrugu/cron.py` → `_ALIASES`; `test_cron.py`'deki
`test_known_next_times`'a bir satır.

**Yeni mini sistem**: kök klasörde `<ad>/` paketi (her dosyada başlık + `Genişletme:`), `<ad>/README.md`
(bir kardeşinkini örnek al: zorunlu bölümler), `tests/<ad>/__init__.py` + `test_*.py`;
`tests/test_kurallar.py` → `SYSTEMS`'e ad; kök `README.md` tablosuna satır. Sonra
`uv pip install --python .venv/bin/python -e . --no-deps` (yoksa klasör dışından `python -m <ad>` bulunmaz).

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `E501 Line too long` docstring'de | ruff biçimleyici yorum/docstring sarmaz | satırı elle böl (≤ 100) |
| Farksal SQL testi REAL toplamında son bitte ayrışıyor | toplama sırası; SQLite Kahan-Babuška-Neumaier kullanır | `values`/`functions.Sum`'a dokunma; üreteçte kümeleme argümanı tam değerli kalsın (`exact=True`) |
| Özellik testi hep geçiyor ama hata kaçıyor | Hypothesis listeleri çoğu zaman kısa | tohum + uzun dizi üreten sürüm ekle (bkz. `test_matches_model_on_deep_trees`) |
| Raft kaos testi hatayı yakalamıyor | ılımlı kaos nadir iç içe geçmeleri üretmez | `HARSH` ayarını ve `_first_violation` kalıbını kullan |
| `ResourceWarning: unclosed` → test hatası | `filterwarnings = error`; bağlantı/dosya kapatılmadı | `with`/`finally` ile kapat |
| `python -m <yeni_paket>` bulunamıyor (klasör dışında) | düzenlenebilir kurulum eski paket listesini tutuyor | `uv pip install ... -e . --no-deps` yeniden |
| redis/git testleri "skipped" | araç kurulu değil | normal; kuruluysa koşar |
| mini_git'te gerçek git `index file corrupt` | `.minigit/index` bilerek git biçiminde değil | git'i yalnız nesne komutlarıyla kullan (`--git-dir`) |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil (ruff, biçim, mypy, pytest)
- [ ] Değişen sistem için `--uzun` da yeşil (rastgele senaryolar)
- [ ] Yeni davranışın testi var; mümkünse başvuruyla (sqlite3/git/redis/kaba kuvvet) karşılaştırmalı
- [ ] İlgili README'nin "Güvenceler" ve "Sağlamadıkları" bölümleri güncel; doğrulanmayan iddia yok
- [ ] `python3 ../../araclar/kacis.py --denetle .` temiz; `python3 ../../araclar/durum.py`'de satır "standart ✓"
