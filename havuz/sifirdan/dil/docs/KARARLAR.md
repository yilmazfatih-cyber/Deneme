# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi.

## K01 — Çalışma zamanı bağımlılığı yok; yalnız standart kitaplık

Görev "sıfırdan" ve "dış bağımlılık yok" diyor. Geliştirme bağımlılıkları (pytest, hypothesis,
ruff, mypy) yalnız denetim için; paketler onları içe aktarmaz (`tests/test_kurallar.py`).
Standart kitaplıktan `re` yalnız yardımcı işlerde kullanıldı (Markdown blok tanıma, JSON değil);
regex motorunun kendisi `re` kullanmaz, onu yalnız testlerde başvuru olarak kullanır.

## K02 — Tek proje, dokuz paket; `sanal_makine` ön ucu `yorumlayici`'dan alır

Görev "aynı dil için" bayt kodu istiyor. Ön ucu (lexer, Pratt ayrıştırıcı, çözümleyici) ve değer
anlamını (`ops.py`, `values.py`, `natives.py`) kopyalamak ~1 300 satır tekrar ve iki arka ucun
zamanla ayrışması demekti. Paylaşılan anlam, farksal testi anlamlı kılar: fark yalnız denetim akışı,
kapsam ve derlemede çıkabilir. Bedeli: `sanal_makine` tek başına kopyalanamaz (README'de yazılı);
kural testi bu tek kardeş bağımlılığına izin verir, başkasına vermez.

## K03 — Dosya adları: `ast.py` yerine `nodes.py`, `builtins.py` yerine `natives.py`

Görev örnek olarak `ast.py` diyor; ama paket klasöründen bir betik doğrudan çalıştırılırsa
(`python yorumlayici/x.py`) yerel `ast.py` standart `ast` modülünü gölgeler ve `inspect` gibi
modüller kırılır. Küçük modelin düşebileceği bir tuzak olduğundan standart modül adları yasaklandı
(kural testiyle). Aynı nedenle `regex` ve `markdown` paket adları korunurken (görev bu adları verdi)
PyPI'deki aynı adlı paketlerle aynı ortama KURULMAMALIDIR (README Sınırlar).

## K04 — Tohum anlamı: Lox/Lua tarzı doğruluk, kesin `bool`, sözcüksel kapsam + çözümleyici

`0` ve `""` doğrudur (yalnız `yok`/`yanlış` yanlış) — Python'un "boş = yanlış" kuralı yeni
başlayanda hata gizler. `doğru == 1` yanlıştır (Python'da `True == 1`). Kapanım, adı yazıldığı yerde
bağlar: bu yüzden ayrı bir çözümleyici (jlox gibi) var; çözümleyici aynı zamanda tanımsız ad, çift
tanım, yanlış yerde `döndür`/`kır` hatalarını çalıştırmadan önce bulur (iki arka uç aynı hatayı
verir). `için` döngüsünde her tur yeni bağ (JS `let` gibi): döngüde kurulan kapanımlar şaşırtmaz.
Yeni satır deyim ayırıcıdır; `(`/`[` içinde ve ikili işleçten sonra yok sayılır (JavaScript'in
"otomatik noktalı virgül" tuzaklarından kaçınmak için kurallar dar tutuldu).

## K05 — Sanal makinede üst değerler: clox modeli (açık/kapalı), END_SCOPE ile kapatma

Seçenek "hücre (cell) değişkenleri" (CPython) idi; derleme öncesi ek bir yakalama analizi
gerektirir. clox modeli daha öğreticidir ve görev "üst değer yakalama" diyor. `kır`/`devam`
çıktıkları kapsamların yerellerini `END_SCOPE n` ile kapatır; bu komut yakalanmış yuvaları her
durumda kapattığı için "bu yerel yakalandı mı" bilgisine derleme anında gerek kalmaz.

## K06 — Regex: Pike VM + "boş tur koruması" (ENTER/BACK)

Saf Thompson/Pike VM, Python `re`'nin boş döngü turu davranışından (`(a*)*`, `(|a)*`) farklı
gruplar üretir. `re`'nin kuralı (bir tur hiç karakter tüketmeden biterse döngü yeniden denenmez,
çıkışa geçilir) ENTER/BACK komutlarıyla ve ziyaret anahtarına "bu ε-yolunda açılan döngüler"
eklenerek taklit edildi. Sonuç 30 000 rastgele desen/metin çiftinde `re` ile birebir aynıydı
(hypothesis, rastgele tohumla bir kez koşuldu; hızlı denetim 150 örnek koşar). Geri başvuru ve
ileri/geri bakış doğrusal zamanı bozacağı için bilerek yok ve açık hata verir.

## K07 — JSON: stdlib'den daha sıkı varsayılanlar

NaN/Infinity, taşan ondalık (`1e999` → inf), eşi olmayan vekil, dizgi olmayan anahtar varsayılan
olarak hatadır (RFC 8259 ve güvenli taraf). Farksal testte stdlib kancalarla (`parse_constant`,
`parse_float`) aynı sıkılığa getirildi; eşsiz vekil için bizde `allow_lone_surrogates=True`.
İki ayrıştırıcı (özyinelemeli + akış) ortak tarama modülünü kullanır ki hata iletileri ve
konumları birebir aynı olsun (testle korunur).

## K08 — Şablon: Python koduna değil kapanımlara derleme

Jinja şablonu Python kaynağına çevirip `compile/exec` eder. Burada `exec` kullanmamak (kural testi)
ve şablonun hiçbir koşulda Python kodu olarak çalışmaması için her düğüm doğrudan bir kapanıma
çevrildi. Çağrı sözdizimi yok, `_` ile başlayan adlar ve yöntemler yasak (kum havuzu). Tanımsız ad
varsayılan olarak hata (`strict=True`): yazım hatası sessizce boş çıktı üretmesin.

## K09 — Markdown: ham HTML her zaman kaçışlanır

CommonMark ham HTML'i geçirir; bu dizinin çıktısı kullanıcı içeriğinden üretilebileceği için güvenli
taraf seçildi. Bağlantılarda izin listesi (http, https, mailto, tel, ftp; görselde http/https).
Başvuru bağlantıları ve çıplak URL bağlantılama kapsam dışı bırakıldı (README "Sınırlar").
Resmî CommonMark test takımı çevrimdışı ortamda bulunmadığından uyum DOĞRULANMADI; yerine örnek
çıktı testleri ve rastgele girdide güvenlik özellik testi var.

## K10 — Hesap: shunting-yard (Pratt değil), `float`, yarım-yukarı yuvarlama

Yorumlayıcı zaten Pratt kullanıyor; öğretici çeşitlilik için burada shunting-yard (özyinelemesiz:
derin parantezde yığın taşmaz). `Decimal` yerine `float` + 12 anlamlı basamak gösterimi (işlevler
`math` ile çalışsın diye); `yuvarla` bankacı yuvarlaması yapmasın diye `Decimal` ile yarım-yukarı.
Türkçe kipte "1.5" belirsiz olduğu için hata (tahmin yürütmek yerine doğru yazımı öğretir).

## K11 — Fark: Myers'ın doğrusal bellekli sürümü (diff-match-patch `bisect` uyarlaması)

İz (trace) saklayan basit sürüm O(D²) bellek ister; büyük dosyada sorun. Orta yılan bölmesi
O(N+M) bellekle aynı en kısa sonucu verir; ızgara dışı köşegen sayaçları diff-match-patch'ten
alındı (ilk denemede eksikti ve yanlış eşleşmeye yol açabiliyordu). Basit ileri sürüm yalnız
`edit_distance` olarak, çapraz denetim için tutuldu. Üç yollu birleştirme bzr/merge3 mantığıdır.

## K12 — Test çerçevesi: assert yeniden yazımı (pytest gibi), exec yalnız orada

Başarısızlıkta değer göstermek için ya çerçeveye özel `esit(a, b)` işlevleri ya da assert yeniden
yazımı gerekiyordu. Yeniden yazım öğretici (pytest'in "sihri") ve kullanıcıya düz `assert`
bıraktığı için seçildi; bunun için `compile/exec` yalnız `rewrite.py`'de ve yalnız kullanıcının kendi
test dosyalarına uygulanır (kural testinde tek istisna). Zaman aşımı ana iş parçacığında SIGALRM ile
testi gerçekten keser; diğer durumlarda iş parçacığı beklenir (kesilemez; README'de yazılı).
Örnek test dosyaları paket olmadığı ve yanlarındaki modülü düz adla içe aktardığı için mypy
denetiminin dışında tutuldu (pytest onları çerçeve üzerinden koşturur).

## K13 — Hypothesis profilleri: belirlenimci, veritabanısız

`derandomize=True` (STANDARTLAR §6.8 "belirlenimci") ve `database=None` (klasöre `.hypothesis/`
yazılmasın). Hızlı denetimde 150, `--uzun`'da 2 000 örnek. Daha geniş rastgele taramalar elle
koşuldu (regex 30 000, JSON 4 × 4 000, Tohum 300 program + 2 000 ifade; bkz. ilgili README).

## K14 — Kilit dosyası: `requirements-dev.lock` (uv pip compile)

Kardeş temel `ml-temel` ile aynı yöntem: `uv pip compile pyproject.toml --extra dev --universal
--python-version 3.11 -o requirements-dev.lock`. Kurulum: kilitten bağımlılıklar + `-e . --no-deps`.

## K15 — Sabit katlama: çözümleyiciden sonra, konumları koruyarak

"İYİ OLUR" maddelerinden yalnız sabit katlama yapıldı (en küçük ve mevcut farksal test düzeneğine
doğrudan bağlanabilen). Hesap `ops.py` ile yapılır; hata verecek işlem katlanmaz. Katlanan sabit
işlecin konumunu alır (ilk denemede soldaki işlenenin konumunu alıyordu ve sözlük anahtarı hatası
farklı sütun gösteriyordu — farksal test yakaladı). `ve`/`veya` yalnız sonuç da sabitse katlanır:
`yok veya x` → `x` yapılsaydı, `x` adının konumu ve çözümleyici tablosu (ad düğümüne bağlı)
bozulabilirdi. Çözümleyiciden SONRA çalışır ki atılan daldaki tanımsız ad yine hata versin.
Doğrulama: 3 000 rastgele kaynakta katlamalı yorumlayıcı ve katlamalı sanal makine, katlamasız
yorumlayıcıyla aynı çıktı/hatayı verdi (elle bir kez); hızlı denetimde 60 tohum koşar.

## K16 — Görünmez karakterler kaçışla (STANDARTLAR §6.11)

Dosya yazma aracı `\uXXXX` dizilerini gerçek karaktere çevirebildiği için 8 yerde BOM, NBSP,
U+2028 ve birleşen işaretler kaynağa karakter olarak girmişti; `havuz/araclar/kacis.py` ile
kaçışa çevrildi ve bunu kalıcı korumak için `tests/test_kurallar.py`'ye bir kural testi eklendi
(.py, .md, .tohum, .beklenen, .toml, .json dosyalarını tarar).
