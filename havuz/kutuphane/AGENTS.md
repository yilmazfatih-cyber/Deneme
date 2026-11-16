# Kütüphane — model talimatları

## Bu temel ne yapar

Tek dosyalık, bağımlılıksız, testli yardımcı modüller: 29 TypeScript modülü (`ts/src/`) ve bunların 25'inin Python eşi
(`py/kutuphane/`). Modüller projelere **dosya dosya kopyalanır**; birbirini içe aktarmaz. Türkçe'ye özgü yedi modül
(`turkce`, `ek`, `sayi_yazi`, `para`, `tarih`, `dogrulama`, `maske`) ve genel modüllerin çoğu iki dilde aynı
`vektorler/<modul>.json` dosyasıyla sınanır: iki dil aynı girdiye aynı çıktıyı verir.

## Komutlar

| Komut (klasör)                                        | Ne yapar                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm ci` (ts/)                                        | TS araçlarını kilit dosyasından kurar                                     |
| `npm run check` (ts/)                                 | tip denetimi + ESLint + Prettier denetimi + vitest (kural testleri dahil) |
| `npm run format` (ts/)                                | TS, belgeler ve vektörlerin biçimini düzeltir                             |
| `npx vitest run test/para.test.ts` (ts/)              | tek modülün testi                                                         |
| `python scripts/kur.py` (py/)                         | `.venv` kurar, araçları `requirements-dev.lock`'den yükler                |
| `python scripts/check.py` (py/)                       | ruff + ruff format --check + mypy (strict) + pytest                       |
| `python scripts/check.py --duzelt` (py/)              | önce biçimi ve düzeltilebilir lint hatalarını düzeltir                    |
| `.venv/bin/python -m pytest tests/test_para.py` (py/) | tek modülün testi                                                         |
| `node kopyala.mjs <modul> <hedef>` (ts/)              | modül + test + vektörü başka projeye kopyalar                             |
| `python kopyala.py <modul> <hedef> [--paket p]` (py/) | aynısı, Python                                                            |

## Harita

| Değiştireceğin şey                        | Bakacağın yer                                                      |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Bir modülün davranışı                     | `ts/src/<modul>.ts` ve `py/kutuphane/<modul>.py` (ikisi birlikte!) |
| Modülün testi                             | `ts/test/<modul>.test.ts`, `py/tests/test_<modul>.py`              |
| İki dilin ortak beklenen çıktıları        | `vektorler/<modul>.json`                                           |
| Kütüphane kuralları (bağımsızlık, adlar…) | `ts/test/kurallar.test.ts`, `py/tests/test_kurallar.py`            |
| Modül dizini (kullanıcıya)                | `README.md` tablosu (kural testi denetler)                         |
| Kararların gerekçesi                      | `docs/KARARLAR.md`                                                 |
| Türkçe'ye özgü hatalar ve doğruları       | `docs/TURKCE_TUZAKLARI.md`                                         |
| Kopyalama aracı                           | `ts/kopyala.mjs`, `py/kopyala.py`                                  |

## Değişmez kurallar

1. **Modül tek dosyadır ve hiçbir şeyi içe aktarmaz** (TS: hiç `import` yok; Python: yalnız standart kütüphane).
   → `kurallar.test.ts` "başka modül ya da paket içe aktarmaz", `test_kurallar.py::test_only_stdlib_imports`.
2. **Her modülün testi vardır**; başlık yorumunda `Kullanım`, `Sınırlar`, `Genişletme:` bölümleri bulunur.
   → "testi var ve başlığı tam", `test_has_test_and_full_header`.
3. **İki dilde olan modülün dışa açtığı adlar eşleşir** (`upperTr` ↔ `upper_tr`; sınıf ve hata adları aynı).
   Bilinçli farklar `LANGUAGE_DIFFERENCES` listesindedir. → "dışa açılan adlar iki dilde eşleşir".
4. **Python, TS'nin `TS_ONLY_MODULES` (olay, geri_al, renk, zamanlama) dışındaki her modülünü içerir.**
   → "modül listeleri", `test_module_lists_match`.
5. **README dizininde her modül doğru TS/Py işaretiyle listelidir.** → `test_readme_lists_every_module`.
6. **Büyük/küçük harf çevirisi gerekçesiz yapılmaz**: Türkçe metinde `upperTr`/`lowerTr`; ASCII'ye özgü yerde
   satır sonuna `// harf: neden` (Python `# harf: neden`). → "toUpperCase/toLowerCase yalnız gerekçeli satırlarda".
7. **Kaynakta, testte, vektörde görünmez karakter yok** (BOM, birleşik nokta, NBSP…): kaçışla yazılır
   (`'\u{307}'`, `"\u0307"`, `"\N{COMBINING DOT ABOVE}"`). → "görünmez karakter yok".
8. **Her vektör dosyası iki dilde bir modüle ve teste bağlıdır**; Türkçe modüllerin hepsinde vektör vardır.
   → "vektör dosyaları…", `test_vector_files_are_linked`.
9. **Saat ve rastgelelik parametreyle verilir** (`now`, `random`, `randomBytes`) ki testler belirlenimci olsun.
10. **Para hesabında kayan nokta yok**: kuruş tam sayıdır; oranlar ondalık yazımlarından tam kesre çevrilir.
11. **Denetim yeşil değilse iş bitmemiştir.** Testi atlamak/gevşetmek çözüm değildir.

## Tarifler

### 1. Modülü başka projeye kopyala

1. `cd ts && node kopyala.mjs turkce ../../projem/src/lib` (uzantısız import isteyen projede `--uzantisiz`).
2. `cd py && python kopyala.py turkce ../../projem/araclar --paket araclar` (paket yoksa `--paket`'i atlayın).
3. Hedef projede testi koşun: `npx vitest run src/lib/turkce.test.ts` ya da `pytest araclar/test_turkce.py`.
4. Kopyayı değiştirmeyin; düzeltme gerekiyorsa burada yapıp yeniden kopyalayın (`--uzerine-yaz`).

### 2. Var olan modüle işlev ekle (iki dilde)

1. `ts/src/<modul>.ts`'e işlevi yazın (Türkçe JSDoc, İngilizce ad: `formatFoo`).
2. `py/kutuphane/<modul>.py`'ye aynı işlevi `format_foo` adıyla yazın ve `__all__`'a ekleyin.
3. `vektorler/<modul>.json` → `islevler.formatFoo` altına örnekler: `{ "girdi": [...], "secenek": {...}, "cikti": ... }`
   ya da hata bekleniyorsa `"hata": true`. `secenek` TS'de son argüman nesnesi, Python'da anahtar sözcük argümanlarıdır.
4. Özellik testi gerekiyorsa iki test dosyasına da ekleyin (tohumlu rastgele, başka gerçeklemeyle karşılaştırma).
5. Doğrulama: `cd ts && npm run check` ve `cd py && python scripts/check.py`.

### 3. Yeni modül ekle (iki dilde, vektörle)

1. En yakın modülü örnek alın (ör. düz işlevler için `maske`, sınıf için `hiz_siniri`).
2. `ts/src/<yeni>.ts`: başlık yorumu (ne yapar · Kullanım 3–6 satır · Sınırlar · `Genişletme:`), içe aktarma YOK.
3. `ts/test/<yeni>.test.ts`: `loadVectors('<yeni>')` kalıbını başka bir testten kopyalayın.
4. `py/kutuphane/<yeni>.py` (+ `__all__`) ve `py/tests/test_<yeni>.py` (aynı kalıp).
5. `vektorler/<yeni>.json`: `{ "modul": "<yeni>", "aciklama": "…", "islevler": { … } }`.
6. `README.md` tablosuna satır: `| \`<yeni>\` | ne yapar | ✓ | ✓ | 2 satır örnek |`.
7. Yalnız TS'de olacaksa iki kural testindeki `TS_ONLY_MODULES`'e ekleyin ve README'de Py sütununa `—` yazın.
8. Doğrulama: iki denetim komutu; kural testleri neyin eksik olduğunu söyler.

### 4. `ek` modülüne yeni ek türü ya da tamlama sözcüğü ekle

1. Ek türü: `TEMPLATES` / `_TEMPLATES`'e `[ünsüzden sonra, ünlüden sonra, iyelikten sonra]` şablonu (A = e/a,
   I = i/ı/u/ü, D = d/t), `SuffixKind` tipine ad.
2. Tamlama başı ("… Müdürlüğü"): `HEAD_WORDS` / `_HEAD_WORDS` listesine küçük harfle.
3. `vektorler/ek.json`'a örnek; iki denetim.

### 5. Yeni sabit resmî tatil ekle

`tarih` → `FIXED_HOLIDAYS` / `_FIXED_HOLIDAYS`: `[ay, gün, 'Ad', ilk yıl]`. `vektorler/tarih.json`'da
`fixedHolidaysTr` çıktısını güncelleyin. Dinî bayramlar EKLENMEZ (her yıl değişir): `holidays` seçeneğiyle verilir.

### 6. Yeni IBAN ülkesi / il alan kodu

`dogrulama` → `IBAN_LENGTHS` / `AREA_CODES` (iki dilde). Vektöre geçerli bir örnek (mod-97'yi tutan) ekleyin.

### 7. Hata iletisini değiştir

İleti metinleri iki dilde AYNIDIR ve vektörlerde (`sema.json` gibi) karşılaştırılır: iki dosyayı birlikte değiştirin.

## Sık yapılan hatalar

| Belirti                                                     | Neden                                                 | Çözüm                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Kural testi: "Python'da olup TS'de olmayan: …"              | Bir dile işlev eklendi, öbürüne eklenmedi             | Eşini yazın ya da `LANGUAGE_DIFFERENCES`'e gerekçesiyle ekleyin  |
| Kural testi: "görünmez karakter"                            | Kaynağa birleşik nokta/NBSP/BOM yapıştırıldı          | `\u{307}` (TS), `\u0307` / `\N{...}` (Python), JSON'da `\u0307`  |
| Kural testi: "gerekçesiz büyük/küçük harf çevirme"          | `toUpperCase()` Türkçe metinde `i → I` yapar          | `upperTr` kullanın ya da ASCII ise `// harf: neden`              |
| Vektör testi yalnız bir dilde kırılıyor                     | İki gerçekleme ayrıştı (yuvarlama, sıra, ileti metni) | Kırılan dildeki kodu öbürüne uydurun; vektörü değiştirmeyin      |
| Python testi "vektorler/x.json bulunamadı"                  | Test kopyalandı ama vektör kopyalanmadı               | `kopyala.py` kullanın (vektörü `vektorler/` altına koyar)        |
| `import csv` Python'da yanlış modülü getiriyor              | Kütüphanenin `csv.py`'si düz klasöre kopyalandı       | `kopyala.py` onu `csv_tr.py` yapar; ya da pakete koyun           |
| TS'de "allowImportingTsExtensions" hatası (kopyalanan test) | Hedef proje `.ts` uzantılı importa izin vermiyor      | `node kopyala.mjs … --uzantisiz`                                 |
| `tarih`: saatli metin "okunamadı"                           | Saat dilimi yazılmamış (`2026-11-16T10:00`)           | `…T10:00:00+03:00` ya da `Z` yazın; yalnız gün için `YYYY-MM-DD` |
| `para`: "Kuruş tam sayı olmalı"                             | `money(12.5)` gibi TL verildi                         | `money(1250)` ya da `fromDecimal(12.5)` / `parseMoney('12,50')`  |

## Bitti tanımı

- [ ] Değişiklik iki dilde yapıldı (yalnız TS modülü değilse) ve vektöre örnek eklendi
- [ ] Başlık yorumu güncel (Kullanım, Sınırlar, Genişletme:)
- [ ] `cd ts && npm run check` yeşil
- [ ] `cd py && python scripts/check.py` yeşil
- [ ] README tablosu ve gerekiyorsa `docs/KARARLAR.md` güncel
