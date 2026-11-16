# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi.

## K01 — Çalışma zamanında yalnız standart kitaplık

Şartname gereği. Ayrıca her sistem "içeride nasıl çalışır" başvurusu olduğu için hazır bir kitaplığa
(sortedcontainers, numpy, redis-py...) yaslanmak amacı bozar. Geliştirme araçları (`pytest`, `hypothesis`,
`ruff`, `mypy`) yalnız `dev` ekstrasındadır. Korunur: `tests/test_kurallar.py`.

## K02 — Tek proje, sistem başına bir paket

`havuz/sifirdan/veri` tek bir `pyproject.toml`'dur; her mini sistem kök klasörde bir pakettir
(`anahtar_deger/`, `btree/`...), testleri `tests/<ad>/`'dadır. Paketler birbirini içe aktarmaz (kopyalanınca
tek başına çalışsın). Elenen: her sisteme ayrı `pyproject` → on üç kat kurulum ve denetim.

## K03 — Hata enjeksiyonu için dosya sistemi soyutlaması (`anahtar_deger`)

Çökme testi gerçek süreç öldürmeyle yapılsaydı her adımı yakalamak olanaksızdı. `FileSystem` arayüzü ve
bellek içi `SimFS`, her değiştiren işlemi bir "adım" sayar; k. adımda çökme ve güç kesintisi (fsync
edilmemiş baytlar ile klasör fsync'i edilmemiş ad değişikliklerinin rastgele alt kümesi) benzetilir.
İlk model "klasör fsync'i her şeyi birden kalıcı kılar" diyordu; bu, flush'taki eksik klasör fsync'ini
kaçırdı (bozuk sürüm testi geçti). Model kötümserleştirildi: bekleyen klasör işlemlerinin herhangi bir alt
kümesi kalıcı olabilir (yeniden adlandırma atomik kalır).

## K04 — SQL anlamı: SQLite'a birebir uy

Farksal test için hedef davranış tek olmalıydı; sqlite3 standart kitaplıkta var. Tamsayı bölme, `%`,
metin→sayı, LIKE'ın yalnız ASCII duyarsızlığı, REAL'in metin biçimi, `sum`'ın Kahan-Babuška-Neumaier
toplaması SQLite ile ölçülerek gerçeklendi. Bilinçli fark: karşılaştırmada tür yakınlığı yok (yalnız
INSERT/UPDATE'te); GROUP BY'da çıplak sütun hatadır. Üreteç bu yüzden tür tutarlı sorgu üretir.

## K05 — Volcano modeli Python üreteçleriyle

Her işlecin `rows()` üreteci "next" çağrısıdır; `LIMIT 3` alt işleçten fazla satır çekmez (testli).
Elenen: vektörel (toplu) yürütme — daha hızlı ama okunurluğu düşük; sütun deposu için bırakıldı.

## K06 — 2PL beklemez, zamanlayıcı bekletir (`islem`)

Gerçek iş parçacığıyla bekleyen kilitler testleri zamanlamaya bağımlı kılardı. Kilit yöneticisi
`WouldBlock` döndürür; belirlenimci zamanlayıcı programları (üreteç) istenen sırayla yürütür. Böylece her
anomali tam bir iç içe geçmeyle kurulur. MVCC deposu ise gerçekten iş parçacığı güvenlidir (testli).

## K07 — SERIALIZABLE = anlık görüntü + geriye doğrulama

Okunan anahtar ve taranan aralıklar onayda doğrulanır (iyimser eşzamanlılık). SSI'den daha çok iptal
eder ama doğruluğu basit gerekçelidir: onay sırası seri sıradır (seri yeniden oynatma testi).

## K08 — RGA ağaç sırasıyla

RGA metni "ref'e göre ağaç, kardeşler büyükten küçüğe" önce-kök gezilerek dizilir. Böylece durum
birleşimi (düğüm kümesi birleşimi) ile işlem uygulaması aynı sırayı verir. Elenen: sırayı dizi olarak
tutup ekleme noktası aramak — hızlı ama iki yolun aynılığını kanıtlamak zorlaşır.

## K09 — mini_git nesneleri git'le aynı, index değil

Nesne biçimi (blob/tree/commit, SHA-1, zlib, tree sırası) git'le bayt bayt aynıdır; gerçek git'le sha
karşılaştırması ve `git fsck` testlidir. Index ise okunur metindir (`MINIGIT-INDEX 1`); git'in ikili
DIRC biçimi öğretim için gereksiz karmaşık. Depo klasörü `.minigit` (gerçek `.git` ile karışmasın).
Komut adları şartnamedeki gibi git'in İngilizce adlarıdır (`init/add/commit...`), açıklamalar Türkçedir.

## K10 — Raft: benzetimde iki kaos ayarı

Ilımlı kaos (5 düğüm) toparlanma ve "tam bir kez" denetimi için; ama klasik hataları (Şekil 8, kalıcı
olmayan oy, kör günlük kesme) neredeyse hiç yakalamadığı ÖLÇÜLDÜ (0/200). Bu yüzden "sert" ayar eklendi
(3 düğüm, sık çök-kalk, seçim fırtınası); hatalar orada yakalanır. Ret yanıtında çatışan dönemin ilk
dizini döner (makalenin önerdiği hızlı geri çekilme); bu olmadan sert ayarda yakalama çok yavaştı.

## K11 — İş kuyruğu: `BEGIN IMMEDIATE` + kira jetonu

SQLite'ta aynı işi iki işçinin almasını önlemenin en basit doğru yolu yazma kilidini baştan almaktır.
Ertelenmiş `BEGIN` ile yarış testte yakalanır. Kira jetonu, kirası düşmüş işçinin başkasının işini
onaylamasını engeller. Elenen: `UPDATE ... RETURNING` tek başına (seçim + "zehirli iş" kararı Python'da
gerektiği için işlem içinde iki adım).

## K12 — Önbellek: RESP2 ve Türkçe hata iletileri

RESP2 seçildi ki gerçek `redis-cli` konuşabilsin ve gerçek redis-server'la farksal test yapılabilsin
(makinede kurulu). Hata iletileri STANDARTLAR §3 gereği Türkçedir; hata TÜRÜ (`ERR`, `OOM`) Redis'le
aynıdır, farksal test yalnız türü karşılaştırır.

## K13 — Kilit dosyası `requirements-dev.lock`

`uv pip compile pyproject.toml --extra dev --universal --python-version 3.11` ile üretilir; kardeş
`sifirdan/dil` ile aynı yöntem. Çalışma zamanı bağımlılığı olmadığı için kilit yalnız geliştirme
araçlarını sabitler.

## K14 — İsteğe bağlı üç sistem de eklendi, zorunlu ondan sonra

`sutun_deposu`, `akis`, `tutarli_karma` "iyi olur" listesindeydi. Önce zorunlu on sistemin testleri
derinleştirildi (farksal testler, bozuk sürüm denemeleri); sonra üçü, her biri kendi içinde tam
(README, farksal ya da kaba kuvvet testi, bozuk sürüm denemesi) olarak eklendi. Hiçbiri yarım değildir.

`sutun_deposu`'nda saf Python'da "vektörel" çalışma şöyle seçildi: koşul sütunun tamamına uygulanıp
satır başına 0/1 baytlık maske üretir; maskeler `int.from_bytes` ile büyük tamsayıya çevrilip tek `&`
ile VE'lenir; seçim `itertools.compress` ile yapılır. NumPy gibi bir bağımlılık eklenmedi (K01).
Kodlama seçimi bilerek basit tutuldu: çalışma sayısı × 4 < satır sayısı ise RLE, metin varsa sözlük,
yoksa düz (`array('q')`/`array('d')`); sözlük kodu en küçük yeten genişlikte (1/2/4 bayt). Doğruluk
ölçütü, aynı anlamı satır satır uygulayan `RowTable`'la türleriyle birebir aynı sonuçtur. Yeni sistem
tarifi: `AGENTS.md` → "Yeni mini sistem".
