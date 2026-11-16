# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek elendi. Yeni karar en alta eklenir.

## K1 — Tek dosya, bağımlılıksız, birbirinden bağımsız modüller

**Karar:** Her modül tek dosyadır, hiçbir şey içe aktarmaz (TS: hiç `import` yok; Python: yalnız standart kütüphane).
Ortak yardımcılar (ör. Türkçe küçük harf) gereken modülde küçük bir kopya olarak durur (`ek`, `tarih`,
`bulanik_arama` kendi `lowerTr` kopyalarını taşır).
**Neden:** Kullanım biçimi kopyala-yapıştırdır; bir dosyayı kopyalayan zinciri de kopyalamak zorunda kalmamalı.
**Elenen:** Ortak `_ortak.ts` dosyası (kopyalarken unutulur), npm/PyPI paketi (sahip paket yönetmek istemiyor).
**Koruyan:** iki dildeki kural testleri.

## K2 — İki dil ve ortak vektörler

**Karar:** Türkçe modüllerin hepsi ve genel modüllerin çoğu `vektorler/<modul>.json` ile sınanır. Biçim:
`islevler.<camelCaseAd> = [{ girdi: [konumsal], secenek?: {…}, cikti | hata: true }]`. TS'de `secenek` son argüman
nesnesi, Python'da anahtar sözcük argümanlarıdır (adlar snake_case'e çevrilir). Python'un dataclass çıktıları testte
camelCase sözlüğe çevrilip karşılaştırılır.
**Neden:** İki gerçeklemenin sessizce ayrışmasını önlemenin en ucuz yolu; bir dile eklenen örnek öbürünü de sınar.
Bu yöntem yazım sırasında gerçek hatalar yakaladı (bkz. K18).
**Sınır:** Fonksiyon/sınıf alan API'ler (ör. `sema`'da şema kurmak) JSON'a doğrudan yazılamaz; `sema` testleri JSON
tanımından şema kuran küçük bir `build` işleviyle (iki dilde aynı kural) bunu aşar.

## K3 — `Intl` ve `locale` kullanılmaz

**Karar:** Büyük/küçük harf, sıralama, sayı/tarih biçimi kendi kodumuzla yapılır.
**Neden:** `Intl.Collator('tr')` ICU verisine bağlıdır (küçük Node derlemeleri ve bazı ortamlarda yoktur); Python'un
`locale` modülü işletim sistemine bağlıdır ve iş parçacığı güvenli değildir. İki dilin aynı sonucu vermesi gerekir.
**Denetim:** Testlerde `Intl` VARSA çapraz denetim yapılır (sıralama ve 2 ondalıklı sayı biçimi `Intl` ile aynı).

## K4 — Araç sürümleri

TypeScript `~6.0.3` (typescript-eslint 8.72 yalnız `<6.1` destekliyor; ortak brif), vitest 5.1.0, ESLint 10.15 +
typescript-eslint 8.72.2 (`recommendedTypeChecked`), Prettier 3.10.1 (depo ayarı: `semi: false, singleQuote: true,
printWidth: 120, trailingComma: "all"`). Kaynak `tsconfig` `types: []` ile derlenir: bir modül `Buffer`, `process`,
`node:fs` kullanırsa tip denetimi kırılır (tarayıcı + Node uyumu). Python: ≥ 3.11 (`datetime.UTC`, `asyncio`
gereksinimleri), ruff 0.17.5 (satır 100), mypy 2.4.1 `strict`, pytest 9.2.0. Sürümler kurulu paketlerden doğrulandı.

## K5 — Python kurulumu: yalnız araçlar, kilitli

**Karar:** Kütüphanenin çalışma zamanı bağımlılığı yoktur. Geliştirme araçları `requirements-dev.lock`'de sabittir
(`uv pip compile pyproject.toml --extra dev --python-version 3.11`). `pytest` `pythonpath = ["."]` ile paketi kurmadan
bulur; `pip install -e ".[dev]"` de çalışır (havuz araçları bunu kullanır).

## K6 — Para: tam sayı kuruş

**Karar:** `Money = { kurus: number (güvenli tam sayı), currency }`. Ara hesaplar TS'de BigInt, Python'da `int` ile;
oranlar (`0.1`, `"7.5"`) ondalık yazımlarından tam kesre çevrilir. Varsayılan yuvarlama `halfUp` (yarım kuruş sıfırdan
uzağa; VUK uygulaması), ayrıca `halfEven`, `down`, `up`. Paylaştırmada en büyük kalan yöntemi; eşit kalanda listede
öndeki pay. KDV ayırmada net yuvarlanır, KDV = brüt − net (toplam her zaman tutar).
**Elenen:** `number` lira (0.1 + 0.2 hatası), BigInt dışa açık tip (JSON'a yazılamıyor, küçük model için zor).
**Sınır:** 2^53 − 1 kuruş (~90 trilyon TL) üstü hata verir.

## K7 — Türkçe sayı ayrıştırmada belirsizlik

**Karar:** `parseNumberTr` Türkçe kuralı uygular: nokta yalnız üçlü binlik gruplarda, virgül ondalık. Bu kurala
uymayan her şey ("1.23", "1,234.56", "1 234") açık hata verir. "1.234" (= 1234) ve "1,234" (= 1,234) Türkçe'de
geçerlidir ama İngilizce kaynakta tersi anlama gelir: kaynağı belirsiz veri için `rejectAmbiguous: true` bu ikisini
de reddeder. **Neden:** Türk kullanıcısının yazdığı "1.234" doğal olarak bin iki yüz otuz dörttür; varsayılanı
reddetmek formları kullanılmaz kılardı.

## K8 — Tarih: takvim günü ile anı ayırmak

**Karar:** Takvim günleri `YYYY-MM-DD` metni (TS) / `date` (Python); anlar saat dilimli `Date`/ISO metni ya da aware
`datetime`. Saat dilimi yazılmamış saatli metin ve Python'da saat dilimsiz `datetime` **hata** verir (makinenin yerel
saatine göre başka gün çıkar). Türkiye sabit UTC+3 (2016'dan beri yaz saati yok); başka sabit fark `offsetMinutes`.
Takvim aritmetiği TS'de H. Hinnant'ın tam sayı algoritmalarıyla yapılır (`Date`'in yerel saat tuzaklarından uzak).
İş günü: `addBusinessDays` başlangıç gününü saymaz; `businessDaysBetween` ileri (başlangıç, bitiş], geri
[bitiş, başlangıç) sayar ki ikisi tam ters işlem olsun (bunu bir özellik testi yakaladı ve düzeltildi).
Sabit tatiller 2394 sayılı Kanun'a göre; 1 Mayıs 2009'dan, 15 Temmuz 2017'den beri; yarım günler iş günü sayılır.

## K9 — Ek getirme okunuşa dayanır

**Karar:** `ek` sözcüğün son ünlüsü ve son sesine göre çalışır; sayılarda son sözcüğün okunuşu hesaplanır, büyük
harfli kısaltmalar sözcük gibi okunabiliyorsa sözcük (NATO'ya), değilse son harfin adıyla (TDK'nin) okunur. Belirtisiz
tamlama adları ("… Üniversitesi'ne") bir sözcük listesinden, ince okunan adlar (Kemal'e) bir listeden tanınır;
listede olmayan için `pronunciation`, `front`, `compound` seçenekleri vardır.
**Sınır:** Ünsüz yumuşaması gerektiren cins adlar kapsam dışıdır (şartname). ASCII büyük `I` Türkçe kuralla `ı` okunur
(BIST → "bıst"); `İ` kastediliyorsa okunuş verilmelidir.

## K10 — VKN ve TCKN algoritmaları nasıl doğrulandı

TCKN tanımı (10. hane: (tek basamaklar × 7 − çift basamaklar) mod 10; 11. hane: ilk 10'un toplamı mod 10) ve VKN
algoritması tanımdan yazıldı. VKN için iki bağımsız MIT lisanslı npm paketinin (`tc-id` 2.1.1, `tckn-vkn-validator`
1.1.4) kaynak kodu **okunarak** (çalıştırılmadan) karşılaştırıldı: aynı algoritma. Resmî GİB belgesiyle
karşılaştırılamadı (doğrulanmadı). Not: ikinci paketin TCKN denetimi JS'de negatif sayının `%` sonucunu (−9) düzeltmiyor;
bu yüzden 7·tek − çift < 0 olan geçerli TCKN'leri reddediyor. Kütüphanede gerçek mod kullanılır ve bu durum
`vektorler/dogrulama.json`'da (`19090909018`) sınanır.

## K11 — Kripto: yalnız platform kriptosu

**Karar:** TS `crypto.subtle` (eşzamansız), Python `hashlib`/`hmac`/`secrets`. Parola: PBKDF2-HMAC-SHA256, 600 000 tur
(OWASP 2023 önerisi), Django biçimi `pbkdf2_sha256$tur$tuz$base64` (Django ile karşılıklı denenmedi), parola NFC'ye
normalleştirilir. İmzalı belirteç `v1.<base64url JSON>.<base64url HMAC>`; yük şifrelenmez. JSON iki dilde aynı yazılsın
diye belirteçte kesirli sayı kullanılmaz (Python `1.0`, JS `1` yazar).
**Elenen:** Argon2/scrypt (WebCrypto'da yok; bağımlılık gerektirir), JWT kütüphanesi (bağımlılık, alg karmaşası).
**Doğrulama:** SHA-256 ("abc", boş), HMAC (RFC 4231 #2), PBKDF2-SHA256(password, salt, 1) yayımlanmış değerleri iki
dilde aynı çıktı; belirteç ve parola özeti iki dilde birebir aynı (vektörde).

## K12 — CSV

**Karar:** Ayrıştırıcı durum makinesidir (iki dilde aynı), parça parça beslenebilir (CRLF ve tırnak parça sınırında
bölünse bile aynı sonuç; özellik testi). Varsayılan ayırıcı `auto` (ilk satırdan), `parseExcelCsv` sabit `;`.
Kapanmamış tırnak her zaman hata (sessiz veri kaybı yerine). Tırnak kullanım hataları varsayılan olarak Excel gibi
hoş görülür, `strict` ile hata. Yazarken `toExcelCsv`: `;`, BOM, CRLF, ondalık virgül, formül koruması (OWASP CSV
injection: `= + - @` ile başlayan METİN hücresine `'`). Python testi standart `csv` modülüyle karşılaştırır.

## K13 — Fark algoritması

Myers (en kısa düzenleme betiği; iki dilde aynı eşitlik seçimi), GNU birleşik fark biçimi (`@@ -l,s +l,s @@`, boş
aralıkta `-0,0`). En kısalık bağımsız LCS (dinamik programlama) ile özellik testinde doğrulanır.
**Elenen:** Python `difflib` (en kısa farkı garanti etmez, TS'de karşılığı yok).

## K14 — Zaman birimleri

TS milisaniye (`Date.now`, `setTimeout` ile uyumlu), Python saniye (`time.monotonic`, `asyncio.sleep` ile uyumlu).
`yeniden_dene`, `hiz_siniri`, `onbellek`, `kuyruk` bu farkı taşır; README "Sınırlar"da yazılıdır. `kripto` ve
`sayfalama` belirteçleri/imleçleri iki dilde aynı olsun diye Unix SANİYESİ kullanır.

## K15 — Yalnız TS'de olan modüller

`olay` (Python'da tipli olay yayıcıya pek gerek yok), `geri_al` (arayüz durumu), `zamanlama` (Python'da
`asyncio.wait_for`/`asyncio.timeout` var), `renk` (arayüz işi). Şartname bunları Python'da istemiyor.

## K16 — Python `csv` adı

Şartname dosya adını `csv` koyuyor; bu standart kütüphanedeki `csv` ile aynı. Paket içinde (`kutuphane.csv`) sorun
yok; düz klasöre kopyalanınca gölgeler. `kopyala.py` paketsiz kopyada dosyayı `csv_tr.py` yapar ve testin içe
aktarmasını buna göre yazar (kural testi kopyayı gerçekten çalıştırır).

## K17 — `sema` neden var, neden küçük

Havuz standardı Zod/Pydantic'tir; `sema` bunların kurulamadığı tek dosyalık betikler ve eklentiler içindir. Bilerek
küçük tutuldu (tarih, özyineleme, ayrık birleşim yok). İletiler Türkçedir ve iki dilde birebir aynıdır (vektörde).
Python'da `object_` adı `object` yerleşiğiyle çakışmasın diye alt çizgilidir; kural testi ad eşleştirirken sondaki
alt çizgiyi yok sayar.

## K18 — Yazım sırasında testlerin yakaladığı gerçek hatalar (ders olsun diye)

- `businessDaysBetween` geri yönde `addBusinessDays`'in tersi değildi (özellik testi).
- Sınırlı `levenshtein`, satır en küçüğü sınırı aşmadığında son değeri kırpmıyordu (iki dilde aynı test kırıldı).
- `crypto.getRandomValues` tek çağrıda 65 536 bayttan fazlasını vermiyor; büyük `shortId` istekleri parçalanıyor.
- asyncio kuyruğunda başlamadan iptal edilen görevin Future'ı sonsuza dek bekliyordu.
- Kontrast ayarında 8 bite yuvarlama oranı eşiğin altına düşürüyordu.

## Doğrulama kaydı

Ölçüm: temiz kurulum (`ts/node_modules` ve `py/.venv` silinip kilitten yeniden kurularak), bu makinede (4 çekirdek,
paylaşımlı, aynı anda başka işler de çalışırken). Sonuçlar son raporda ve aşağıda.

Tarih: 16 Kasım 2026. Ölçüm kabuktaki `date` farkıyla (duvar saati) alındı.

| Adım                                                               | Sonuç                                      | Süre    |
| ------------------------------------------------------------------ | ------------------------------------------ | ------- |
| `cd ts && npm ci`                                                  | 134 paket, kilitten                        | 1,8 sn  |
| `cd ts && npm run check` (tsc ×2 + ESLint + Prettier + vitest)     | 30 test dosyası, **1331 test geçti**       | 16,1 sn |
| `cd py && python scripts/kur.py` (uv önbelleği sıcak)              | `.venv` + `requirements-dev.lock`          | 0,1 sn  |
| `cd py && python scripts/check.py` (ruff + format + mypy + pytest) | **1275 test geçti** (mypy önbelleği soğuk) | 6,4 sn  |
| Aynı pytest takımı Python 3.11.18 ve 3.12.3 ile                    | 1275 / 1275 geçti (ikisinde de)            | ~3,4 sn |
| `python3 havuz/araclar/denetle.py kutuphane --kur` (depo kökü)     | "Hepsi yeşil"                              | 26,3 sn |
| `python3 havuz/araclar/durum.py`                                   | kutuphane: "standart ✓"                    | —       |

Kapsam: 29 TS modülü, 25 Python modülü, 19 vektör dosyasında 1103 ortak örnek. Kopyalanan modüllerin testleri hedef
klasörde ayrıca koşturuldu (TS: `tarih`, `kripto --uzantisiz` → 143 test; Python: `csv` → `csv_tr.py`, 47 test).
Denenmeyenler: Windows; tarayıcıda çalıştırma (modüller yalnız standart web API'si kullanır ve tip denetimi Node
tiplerini kapatarak bunu zorlar, ama gerçek tarayıcıda koşturulmadı); Django ile parola özeti alışverişi.
