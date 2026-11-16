# Sıfırdan: veri ve dağıtık sistemler

Veritabanları, arama motorları, git, Raft gibi sistemler "içeride nasıl çalışır?" — bu klasör on üç
tanesini **baştan, yalnız Python standart kitaplığıyla** yazar. Her biri iki işe yarar:

1. **Okunur başvuru:** tek klasör, 250–1.200 satır (SQL motoru ~2.900), bayt bayt çizilmiş dosya
   biçimleri, "neden böyle" açıklamaları.
2. **Sağlam çekirdek:** üstüne özellik eklenebilecek kadar test edilmiş. Testlerin çoğu **gerçek bir
   başvuruyla karşılaştırma** (sqlite3, gerçek git, gerçek Redis) ya da **hata enjeksiyonu** (her adımda
   çökme, ağ bölünmesi, süreç öldürme) içerir; her sistemde bilerek bozulmuş sürümlerin testlerce
   yakalandığı da denendi.

`havuz/sifirdan/` dizisinin **veri** koludur (kardeşleri: `dil`, `ag`, `arayuz`). Kardeş klasörlere
bağımlılık yoktur; bu klasör tek başına kopyalanabilir.

## 5 dakikada çalıştırma

```bash
cd havuz/sifirdan/veri
uv venv .venv
uv pip install --python .venv/bin/python -r requirements-dev.lock   # kilitten, sabit sürümler
uv pip install --python .venv/bin/python -e . --no-deps
.venv/bin/python scripts/check.py           # ruff + biçim + mypy + pytest (hızlı, ~20 sn, ağsız)
.venv/bin/python scripts/check.py --uzun    # binlerce tohumlu uzun senaryolar dahil (~2,5 dk)
.venv/bin/python scripts/check.py --sistem raft   # yalnız bir sistemin testleri
```

(`uv` yoksa: `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.lock && .venv/bin/pip
install -e . --no-deps`.)

## Mini sistemler

| Sistem | Ne yapar | Nasıl kanıtlandı | Kaynak satırı |
| --- | --- | --- | ---: |
| [`anahtar_deger`](anahtar_deger/) | LSM deposu: WAL (CRC'li), bellek tablosu, SSTable (seyrek dizin + Bloom), silme işareti, birleştirme, aralık taraması | dosya sisteminin **her adımında** süreç ölümü ve güç kesintisi: onaylı yazma kaybolmaz, yarım kayıt atılır; `dict` modeliyle özellik testi | 1.185 |
| [`btree`](btree/) | Sayfalı dosyada B+ ağacı: bölünme, ödünç alma, birleşme, yaprak zinciri, LRU sayfa önbelleği, boş sayfa listesi | sıralı modelle özellik testi (5 kat derinlik), değişmez doğrulayıcı (denge, doluluk, sızıntı) | 732 |
| [`mini_sql`](mini_sql/) | SQL motoru: ayrıştırıcı → plan → volcano yürütücü; JOIN, GROUP BY/HAVING, NULL mantığı, dizin + planlayıcı, EXPLAIN | **sqlite3 ile farksal test** (rastgele şema/veri/sorgu/DML; ~270 bin sorgu denendi) | 2.862 |
| [`islem`](islem/) | İşlemler: MVCC (READ COMMITTED / SNAPSHOT / SERIALIZABLE) ve katı 2PL + kilitlenme algılama | anomali tablosu (yazma çarpıklığı dahil) ve seri yeniden oynatmayla serileştirilebilirlik | 660 |
| [`arama_motoru`](arama_motoru/) | Ters dizin: Türkçe çözümleme, BM25, ifade/yakınlık, alan ağırlığı, tamamlama, "bunu mu demek istediniz", özet | elle hesaplanmış BM25, kaba kuvvet ifade araması | 745 |
| [`crdt`](crdt/) | G/PN-Counter, LWW-Register/Map, OR-Set, RGA metin; durum ve işlem tabanlı + nedensel teslim | yasalar (değişmeli/birleşmeli/yinelemesiz), sırasız+yinelenen teslimde yakınsama | 502 |
| [`mini_git`](mini_git/) | Sürüm denetimi: içerik adresli nesneler, index, dallar, Myers farkı, üç yollu birleştirme | **gerçek git'le aynı sha**, `git fsck`, `git merge-file` ile farksal birleştirme | 1.159 |
| [`raft`](raft/) | Raft uzlaşması, belirlenimci benzetim (sanal saat/ağ), üstünde anahtar-değer servisi | kaos altında 4 güvenlik özelliği; 4 klasik Raft hatası yakalanıyor | 590 |
| [`is_kuyrugu`](is_kuyrugu/) | SQLite iş kuyruğu: kira, geri çekilme, ölü mektup, idempotentlik, cron, öncelik | gerçek iş parçacıkları ve **gerçek süreç öldürme** | 575 |
| [`onbellek_sunucu`](onbellek_sunucu/) | Redis uyumlu (RESP2) önbellek sunucusu: TTL, LRU, anlık görüntü | **gerçek redis-server ile farksal test**, `redis-cli` uyumu | 797 |
| [`akis`](akis/) *(isteğe bağlı)* | Olay zamanlı akış işleme: atlayan/kayan pencere, filigran, izinli gecikme, geç olaylar | her varış sırasında toplu (batch) hesapla aynı sonuç; sınırlı karışıklıkta düzeltmesiz | 246 |
| [`tutarli_karma`](tutarli_karma/) *(isteğe bağlı)* | Tutarlı karma halkası (sanal düğüm, ağırlık), rendezvous, jump hash; parçalama + yeniden dengeleme | en az taşıma ve denge ölçümü, jump hash başvuru vektörleri, üyelik değişirken veri kaybı yok | 242 |
| [`sutun_deposu`](sutun_deposu/) *(isteğe bağlı)* | Sütun tabanlı analitik depo: sözlük + RLE kodlama, bayt maskeli vektörel süzme, kümeleme; satır tabanlıyla ölçüm | **satır tabanlı başvuruyla farksal test** (türleriyle aynı sonuç); 200 bin satırda ~26 kat az bellek | 492 |

Satır sayıları paket klasöründeki `.py` dosyalarının toplamıdır (`cat <sistem>/*.py | wc -l`, 16 Kasım 2026).

## Hemen dene

```bash
P=$PWD/.venv/bin/python                                    # bu klasörden
$P -m mini_sql                                             # SQL kabuğu (.tablolar, .cikis)
$P -m anahtar_deger depo yaz şehir İzmir && $P -m anahtar_deger depo tara
$P -m btree agac.db --sayfa 128 doldur 300 && $P -m btree agac.db --sayfa 128 ciz
$P -m is_kuyrugu isler.db ekle eposta '{"kime": "ayse@ornek.tr"}' --anahtar k1
$P -m onbellek_sunucu sun --kapi 8450                      # başka terminalde: redis-cli -p 8450 PING
$P -m sutun_deposu olc --satir 100000                      # sütun/satır tabanlı bellek ve süre
mkdir -p /tmp/deneme && cd /tmp/deneme && echo merhaba > a.txt && $P -m mini_git init \
  && $P -m mini_git add . && $P -m mini_git commit -m "İlk" && $P -m mini_git log
```

Her sistemin README'si: ne yapar, nasıl çalışır (çizimlerle), bayt düzenleri, dosya haritası,
**sağladığı ve sağlamadığı** güvenceler ve "buradan nereye" (eklenebilecek 5–6 özellik).

## Ortak ilkeler

- **Bağımlılık yok:** çalışma zamanında yalnız standart kitaplık (testlerde pytest + Hypothesis).
- **Belirlenimci:** rastgelelik tohumlu; saat ve rastgele kaynak parametreyle verilir; testlerde gerçek
  `sleep` yok (Raft ve çökme testleri sanal zamanda, kuyruk testleri sahte saatle).
- **Başvuruyla karşılaştır:** mümkün olan her yerde gerçek gerçeklemeyle farksal test (sqlite3, git,
  redis-server); olmayan yerde kaba kuvvet ya da model.
- **Testin dişleri:** her sistem için "bilerek bozulmuş sürüm" denendi; çoğu kalıcı test olarak duruyor
  (örn. `test_checker_catches_*`). Ayrıntı: her README'nin "Güvenceler" bölümü.
- Kurallar `tests/test_kurallar.py` ile korunur (başlık yorumu, dosya boyu, bağımlılık, görünmez
  karakter, README bölümleri).

## Sınırlar

- **Öğretim ve çekirdek düzeyi:** saf Python; başarım üretim sistemlerinin çok altındadır (her README'de
  ayrıntı). Güvenlik (kimlik doğrulama, TLS, yetkilendirme) bu sistemlerin konusu değildir.
- **Kalıcılık iddiaları sınırlıdır ve README'lerde açıkça yazar:** `anahtar_deger` ve `is_kuyrugu`
  fsync'lidir; `btree` çökme güvenli DEĞİLDİR; `onbellek_sunucu` son anlık görüntüden sonrasını kaybeder;
  `mini_sql`, `islem`, `crdt`, `raft` bellek içidir (Raft'ın "diski" benzetimdir).
- **Farksal testler yalnız desteklenen alt kümede geçerlidir:** ör. mini_sql karşılaştırmada tür
  yakınlığı yapmaz; testler bu yüzden tür tutarlı sorgu üretir. Rastgele testler bir kanıt değildir.
- **Dış araçlara bağlı testler** (gerçek git, redis-server, redis-cli) yoksa atlanır; bu makinede
  (git 2.43, Redis 7.0.15) koştu.
- **Denenen ortam:** yalnız Linux. Hızlı denetim Python 3.11.18, 3.12.3 ve 3.13.18'de yeşil; uzun denetim
  3.13'te koştu. Windows ve macOS denenmedi (`fsync`, dosya adı ve süreç öldürme testleri POSIX varsayar).
- İsteğe bağlı üç sistem (`akis`, `tutarli_karma`, `sutun_deposu`) zorunlu ondan sonra eklendi; daha
  küçüktürler ama aynı kurallarla test edilirler (bkz. `docs/KARARLAR.md` K14).

Model için talimatlar: [`AGENTS.md`](AGENTS.md) · Kararlar: [`docs/KARARLAR.md`](docs/KARARLAR.md) ·
Mimari ve ortak kalıplar: [`docs/MIMARI.md`](docs/MIMARI.md)
