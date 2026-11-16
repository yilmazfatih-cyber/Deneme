# Kütüphane — tek dosyalık, bağımlılıksız, testli yardımcı modüller

Sık gereken ve sık **yanlış** yazılan yardımcıların (Türkçe büyük/küçük harf, kesmeyle ek getirme, kuruş yuvarlama,
CSV kaçışları, IBAN sağlaması, geri çekilmeli yeniden deneme…) bir kez doğru yazılmış ve testle kanıtlanmış hâli.
TypeScript (tarayıcı + Node) ve Python (3.11+) olarak iki dilde. Her modül **tek dosyadır**, dış bağımlılığı yoktur,
başka modüle bağlı değildir; projenize **dosya dosya kopyalanır**.

## 5 dakikada çalıştırma

```bash
# TypeScript yarısı (Node 22.12+)
cd ts && npm ci && npm run check          # tip + lint + biçim + testler

# Python yarısı (Python 3.11+)
cd py && python scripts/kur.py            # .venv kurar (ilk sefer, internet gerekir)
python scripts/check.py                   # ruff + mypy + pytest (internetsiz)
```

İkisi de yeşilse her şey yolunda. Hata çıkarsa iletinin tamamını bir modele yapıştırın; iletiler ne yapılacağını söyler.

## Nasıl kullanılır

Bir modülü projenize kopyalayın (modül + testi + ortak vektör dosyası birlikte gelir):

```bash
node ts/kopyala.mjs turkce ../projem/src/lib                 # turkce.ts, turkce.test.ts, vektorler/turkce.json
node ts/kopyala.mjs para ../projem/src/lib --uzantisiz       # testte import yolu ".ts" uzantısız
python py/kopyala.py turkce ../projem/araclar                # turkce.py, test_turkce.py, vektorler/turkce.json
python py/kopyala.py para ../projem/uygulama/araclar --paket uygulama.araclar
```

Sonra kendi kodunuzda: `import { upperTr } from './lib/turkce.ts'` ya da `from araclar.turkce import upper_tr`.
Kopyaladığınız dosyayı değiştirmeyin; iyileştirme gerekiyorsa burada yapıp yeniden kopyalayın (AGENTS.md → tarifler).

## Modül dizini

TS/Py sütunu modülün o dilde olup olmadığını gösterir (bu tablo bir kural testiyle denetlenir). İşlev adları TS'de
camelCase, Python'da snake_case'tir (`upperTr` ↔ `upper_tr`).

### Türkçe'ye özgü (iki dilde, ortak vektörlerle)

| Modül       | Ne yapar                                                                                                                         | TS  | Py  | Örnek                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | --- | -------------------------------------------------------------------------------------------------------- |
| `turkce`    | `tr` kurallı büyük/küçük/başlık harfi, ASCII'ye indirgeme, arama anahtarı, slug, Türk alfabesiyle sıralama, heceleme, ünlü uyumu | ✓   | ✓   | `upperTr('istanbul') // 'İSTANBUL'`<br>`sortTr(['zil', 'çay', 'cam']) // cam, çay, zil`                  |
| `ek`        | Özel ada, sayıya, kısaltmaya kesmeyle ek: Ankara'ya, 3'te, %20'si, TDK'nin, Üniversitesi'ne                                      | ✓   | ✓   | `addSuffix('2026', 'locative') // "2026'da"`<br>`addSuffix('Ayşe', 'genitive')`                          |
| `sayi_yazi` | Sayıyı yazıya, sıra sayısı, tutarın yazıyla yazılışı (çek/fatura), Türkçe sayı biçimi ayrıştırma/biçimleme                       | ✓   | ✓   | `amountToWords(123450) // "yalnız bin iki yüz otuz dört lira elli kuruş"`<br>`parseNumberTr('1.234,56')` |
| `para`      | Kuruş temelli para: ₺ biçimleme, ayrıştırma, en büyük kalanla paylaştırma, KDV dahil/hariç                                       | ✓   | ✓   | `formatMoney(parseMoney('1.234,56 TL')) // "₺1.234,56"`<br>`allocate(money(10000), [1, 1, 1])`           |
| `tarih`     | "16 Kasım 2026 Pazartesi", ayrıştırma, göreli zaman, iş günü + resmî tatiller, yaş, ISO hafta (Türkiye UTC+3)                    | ✓   | ✓   | `formatDateTr('2026-11-16', 'uzun')`<br>`addBusinessDays('2026-10-27', 2) // 2026-10-30`                 |
| `dogrulama` | TCKN, VKN, IBAN, TR telefon → E.164, plaka, posta kodu, Luhn, e-posta, URL; sınama için uydurma üreteçler                        | ✓   | ✓   | `validateTckn('10000000146') // true`<br>`normalizePhoneTr('0532 123 45 67')`                            |
| `maske`     | Kişisel veriyi gösterimde maskeleme: `123******01`, `a***@ornek.com`, `TR** **** … 1326`                                         | ✓   | ✓   | `maskEmail('ali@ornek.com') // "a***@ornek.com"`<br>`maskIban(iban)`                                     |

### Genel

| Modül            | Ne yapar                                                                                        | TS  | Py  | Örnek                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------------------ |
| `sonuc`          | Result tipi (ok/err), dönüştürme, zincirleme, `tryCatch`                                        | ✓   | ✓   | `const r = tryCatch(() => JSON.parse(t))`<br>`if (r.ok) kullan(r.value)`                               |
| `yeniden_dene`   | Üstel geri çekilme + titreme, iptal, süre sınırı, Retry-After, hangi hatada yeniden denenir     | ✓   | ✓   | `await retry((n, signal) => fetch(url, { signal }), { retries: 4 })`<br>`isRetryableHttpStatus(503)`   |
| `hiz_siniri`     | Jeton kovası ve kayan pencere (anahtar başına); saat dışarıdan                                  | ✓   | ✓   | `new SlidingWindowLimiter({ limit: 5, windowMs: 60_000 })`<br>`limiter.tryAcquire(ip)`                 |
| `onbellek`       | LRU + TTL önbellek; eşzamanlı yüklemeyi teke indirme                                            | ✓   | ✓   | `new LruCache({ maxSize: 500, ttlMs: 60_000 })`<br>`await cache.getOrSetAsync(k, yukle)`               |
| `kuyruk`         | Eşzamanlılığı sınırlı görev kuyruğu (öncelikli), `mapLimit`                                     | ✓   | ✓   | `new TaskQueue({ concurrency: 3 }).add(is)`<br>`await mapLimit(dosyalar, 4, oku)`                      |
| `olay`           | Tipli olay yayıcı, `waitFor` (zaman aşımı/iptal)                                                | ✓   | —   | `const e = new Emitter<Olaylar>()`<br>`e.on('kaydedildi', (y) => …)`                                   |
| `durum_makinesi` | Sonlu durum makinesi: tek tanım, koşullu geçiş, açık hata, Mermaid çıktısı                      | ✓   | ✓   | `const m = createMachine({ initial, states })`<br>`m.transition('taslak', 'GONDER')`                   |
| `geri_al`        | Geri al / yinele yığını, ardışık değişiklik birleştirme                                         | ✓   | —   | `const g = new UndoStack(durum)`<br>`g.push(yeni); g.undo()`                                           |
| `bulanik_arama`  | Türkçe normalleştirmeli bulanık arama: Levenshtein, Damerau, trigram, puanlama                  | ✓   | ✓   | `fuzzySearch('kadikoy', ilceler)`<br>`damerauLevenshtein('ankra', 'ankara') // 1`                      |
| `csv`            | RFC 4180 CSV okuma/yazma, Türkçe Excel (`;`, ondalık virgül, BOM), formül koruması, akış        | ✓   | ✓   | `parseCsv(metin) // ayırıcı kendiliğinden`<br>`toExcelCsv(satirlar)`                                   |
| `kimlik`         | UUIDv7 (sıralı), kısa rastgele kimlik, okunaklı kod (Crockford + sağlama)                       | ✓   | ✓   | `uuidv7()`<br>`readableCode(8, { check: true }) // "7K3M-9QPX-X"`                                      |
| `kripto`         | SHA-256, HMAC, sabit zamanlı karşılaştırma, imzalı belirteç, parola özeti (PBKDF2)              | ✓   | ✓   | `await signToken({ sub: '42' }, gizli, { expiresInSeconds: 3600 })`<br>`await verifyPassword(p, ozet)` |
| `sayfalama`      | İmleç kodlama/çözme, imleçli liste sayfalama, güvenli SQL keyset koşulu, sayfa numarası hesabı  | ✓   | ✓   | `encodeCursor({ id: 42 })`<br>`keysetWhere(['created_at', 'id'], degerler)`                            |
| `fark`           | Myers dizi farkı, satır farkı, birleşik fark (unified diff), nesne ve anahtarlı liste farkı     | ✓   | ✓   | `unifiedDiff(eski, yeni)`<br>`diffObjects(once, sonra)`                                                |
| `derin`          | Derin eşitlik, kopya, birleştirme (prototip kirletme korumalı), yol ile okuma/yazma             | ✓   | ✓   | `deepEqual(a, b)`<br>`deepMerge(varsayilan, ayar)`                                                     |
| `zamanlama`      | İptal edilebilir `sleep`, `withTimeout`, `debounce`, `throttle`                                 | ✓   | —   | `await withTimeout((s) => fetch(u, { signal: s }), 5000)`<br>`debounce(ara, 300)`                      |
| `istatistik`     | Ortalama, ortanca, çeyreklik, standart sapma, histogram, regresyon, hareketli ortalama, z-puanı | ✓   | ✓   | `quantile(veri, 0.9)`<br>`linearRegression(xs, ys)`                                                    |
| `metin`          | Kısaltma, sarma, sözcük sayımı, okuma süresi, şablon doldurma, HTML kaçışı                      | ✓   | ✓   | `truncate(baslik, 40)`<br>`fillTemplate('Merhaba {ad}', { ad: 'Ayşe' })`                               |
| `renk`           | hex/RGB/HSL/OKLCH, WCAG kontrast, okunur metin rengi seçimi, kontrasta göre ayarlama            | ✓   | —   | `contrastRatio('#777', '#fff') // 4.48`<br>`bestTextColor('#1e3a8a')`                                  |
| `cografya`       | Haversine uzaklık, yön, varış noktası, sınır kutusu, en yakın noktalar                          | ✓   | ✓   | `haversineDistance(istanbul, ankara)`<br>`boundingBox(merkez, 5000)`                                   |
| `cron`           | Cron ifadesi ayrıştırma, sonraki çalışma zamanı (Türkiye saati), eşleşme                        | ✓   | ✓   | `nextRun('0 9 * * 1-5', simdi)`<br>`parseCron('@daily')`                                               |
| `sema`           | Bağımlılıksız küçük şema doğrulayıcı (Zod/Pydantic kurulamayan yerler için), Türkçe iletiler    | ✓   | ✓   | `object({ ad: string().min(2) }).safeParse(govde)`<br>`number({ coerce: true }).default(8080)`         |

Her modülün başında ne yaptığı, örnekleri, sınırları ve nasıl genişletileceği yazılıdır: önce o başlığı okuyun.

## Ortak vektörler

`vektorler/<modul>.json` iki dilin AYNI girdiye AYNI çıktıyı verdiğini kanıtlar: hem TS hem Python testi bu
dosyayı okur. Bir dile vektör eklemek öbür dili de sınar. Yedi Türkçe modülün hepsinde ve genel modüllerin çoğunda
vektör vardır (kriptoda standart SHA-256/HMAC/PBKDF2 sınama değerleri de dahil).

## Klasör yapısı

```
kutuphane/
├─ ts/         src/<modul>.ts · test/<modul>.test.ts · kopyala.mjs · package.json (TypeScript ~6.0, vitest, ESLint, Prettier)
├─ py/         kutuphane/<modul>.py · tests/test_<modul>.py · kopyala.py · scripts/check.py · scripts/kur.py
├─ vektorler/  diller arası ortak sınama vektörleri (JSON)
├─ docs/       KARARLAR.md · TURKCE_TUZAKLARI.md
├─ AGENTS.md   model için tarifler      ├─ havuz.json   makine için komutlar
```

## Sınırlar

- **Doğrulanmadı / dış kaynakla karşılaştırılamadı:** VKN algoritması yaygın yayımlanmış tanımdan yazıldı ve iki
  bağımsız açık kaynak paketin kaynak koduyla aynı olduğu okunarak görüldü; resmî GİB belgesiyle karşılaştırılmadı.
  IBAN ülke uzunlukları tablosu ve il alan kodları ezberden yazıldı (TR ve tanınmış örnek IBAN'lar mod-97 ile
  sınandı). Parola özeti biçimi Django'nunkiyle aynı olacak biçimde yazıldı ama Django ile karşılıklı denenmedi.
  Resmî tatil kuralları (1 Mayıs 2009'dan, 15 Temmuz 2017'den beri) bilgiyle yazıldı; 1981 öncesi doğrulanmadı.
- **Kapsam dışı (bilerek):** ünsüz yumuşaması gerektiren cins adlara ek getirme (kitap → kitabı); dinî bayram
  tarihlerinin hesaplanması (liste olarak verilir); yaz saati olan saat dilimleri (cron ve tarih sabit fark kullanır);
  döviz çevirimi; Excel `.xlsx`; WCAG 3/APCA; Argon2/scrypt (platform kriptosunda yok); şemada tarih/özyineleme.
- `olay`, `geri_al`, `zamanlama`, `renk` yalnız TypeScript'tedir (Python'da standart kütüphane karşılıkları yeterli
  ya da arayüz işi). `yeniden_dene`, `kuyruk`, `hiz_siniri`, `onbellek` Python'da süreyi **saniye**, TS'de
  **milisaniye** alır.
- Python `csv` modülü standart kütüphanedeki `csv` ile aynı adı taşır; pakete koymadan kopyalarsanız `kopyala.py`
  onu `csv_tr.py` olarak yazar.
- Uzunluklar ve kesmeler kod noktası üzerinden hesaplanır; birleşik emojiler (ZWJ dizileri) birden çok karakter sayılır.
- Bellek içi yapılar (`hiz_siniri`, `onbellek`, `kuyruk`) tek süreç içindir; birden çok sunucuda ortak depo gerekir.

## Ölçümler

Temiz kurulumdan sonra bu makinede (4 çekirdek, paylaşımlı) ölçülen süreler ve test sayıları `docs/KARARLAR.md`
sonundaki "Doğrulama kaydı"ndadır.
