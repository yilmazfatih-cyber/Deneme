# Yazılımda Türkçe'ye özgü tuzaklar

Her madde: **yanlış** (sık yazılan) → **doğru** (bu kütüphaneyle). Örnekler TypeScript; Python adları snake_case'tir.

## 1. Büyük/küçük harf: İ ve ı

```ts
'istanbul'.toUpperCase() // YANLIŞ: "ISTANBUL"
'ISPARTA'.toLowerCase() // YANLIŞ: "isparta" (ısparta olmalı)
'İ'.toLowerCase().length // YANLIŞ: 2 — "i" + U+0307 birleşik nokta; ekranda noktalı i gibi görünür ama iki karakterdir
upperTr('istanbul') // DOĞRU: "İSTANBUL"
lowerTr('ISPARTA') // DOĞRU: "ısparta"
```

Python'da `"istanbul".upper()` ve `"İ".lower()` aynı hataları yapar; `casefold()` da Türkçe'yi bilmez.
`toLocaleUpperCase('tr-TR')` doğrudur ama ortamın ICU verisine bağlıdır ve Python'da karşılığı yoktur.

## 2. Büyük/küçük harf duyarsız karşılaştırma ve arama

```ts
a.toLowerCase() === b.toLowerCase() // YANLIŞ: "ISPARTA" ile "ısparta" eşit çıkmaz
normalizeForSearch('ŞİŞLİ') === normalizeForSearch('sisli') // DOĞRU: true (harf, işaret ve İ/ı farkı yok)
```

Kullanıcı aramasında iki tarafı da aynı normalleştirmeden geçirin; veritabanında bu anahtarı ayrı bir sütunda tutun.

## 3. Sıralama

```ts
;['zil', 'çay', 'cam']
  .sort() // YANLIŞ: ["cam", "zil", "çay"] — ç, z'den sonraya düşer
  [('Irmak', 'İpek', 'ılık')].sort() // YANLIŞ: büyük harfler ve İ yanlış yerde
sortTr(['zil', 'çay', 'cam']) // DOĞRU: ["cam", "çay", "zil"]
  [('Sokak 10', 'Sokak 2')].sort(compareTr) // "Sokak 10" önce; { numeric: true } → "Sokak 2" önce
```

`localeCompare(b, 'tr')` çoğu ortamda doğrudur ama ICU'suz Node'da ve Python'da yoktur; SQL'de `ORDER BY` sütunun
harmanlamasına (collation) bağlıdır — `sortKeyTr` çıktısını bir sütunda saklayıp ona göre sıralayabilirsiniz.

## 4. Kesmeyle ek getirme (ünlü uyumu, ünsüz benzeşmesi, kaynaştırma)

```ts
;(`${il}'da` // YANLIŞ: "İzmir'da" (İzmir'de), "Zonguldak'da" (Zonguldak'ta)
`${ad}'in` // YANLIŞ: "Ayşe'in" (Ayşe'nin)
`${sayi}'de` // YANLIŞ: "3'de" (3'te), "40'de" (40'ta), "2026'de" (2026'da)
`TDK'nın`,
  `ABD'ya`) // YANLIŞ: kısaltma harf okunuşuyla: TDK'nin, ABD'ye
;("İstanbul Üniversitesi'ye") // YANLIŞ: belirtisiz tamlama "n" alır: Üniversitesi'ne
addSuffix('İzmir', 'locative') // DOĞRU: "İzmir'de"
addSuffix('3', 'locative') // DOĞRU: "3'te"
addSuffix('İstanbul Üniversitesi', 'dative') // DOĞRU: "İstanbul Üniversitesi'ne"
addSuffix('Ahmet', ['plural', 'dative']) // DOĞRU: "Ahmetlere" (çoğul ekinden sonra kesme yok)
```

## 5. Sayı yazımı

```ts
parseFloat('1.234,56') // YANLIŞ: 1.234 (binlik nokta ondalık sanılır)
Number('12,5')(1.005) // YANLIŞ: NaN
  .toFixed(2) // YANLIŞ: "1.00" (ikili gösterim); ayrıca nokta ondalık
parseNumberTr('1.234,56') // DOĞRU: 1234.56;  "1.23" → açık hata
formatNumberTr(1.005, { decimals: 2 }) // DOĞRU: "1,01"
numberToWords(1000) // DOĞRU: "bin" ("bir bin" değil); 1 000 000 → "bir milyon"
```

## 6. Para

```ts
0.1 + 0.2 // YANLIŞ: 0.30000000000000004 — parayı kayan noktayla hesaplamayın
Math.round(tutar * 1.2 * 100) /
  (100) // YANLIŞ: KDV'de kuruş kaybı/fazlası; toplam tutmaz
  [(33.33, 33.33, 33.33)] // YANLIŞ: 100 TL üçe bölününce 99,99 TL
allocate(money(10000), [1, 1, 1]) // DOĞRU: 3334, 3333, 3333 kuruş (toplam her zaman 10000)
removeVat(money(10000), 20) // DOĞRU: net 8333 + KDV 1667 = 10000
formatMoney(m) // DOĞRU: "₺1.234,56" ya da { style: 'code' } → "1.234,56 TL"
```

## 7. Tarih ve saat dilimi

```ts
new Date('2026-11-16') // YANLIŞ: UTC gece yarısı; Türkiye'de 03:00, ABD'de bir önceki gün
new Date().toISOString().slice(0, 10) // YANLIŞ: Türkiye'de 00:00–03:00 arası DÜNÜ verir
new Date('2026-11-16T10:00') // YANLIŞ: tarayıcının saat dilimiyle okunur; sunucuda başka an
toIsoDate(new Date()) // DOĞRU: Türkiye takvim günü (UTC+3, yaz saati yok)
formatDateTr('2026-11-16', 'uzun') // DOĞRU: "16 Kasım 2026 Pazartesi"
parseDateTr('16.11.26') // DOĞRU: açık hata — iki haneli yıl belirsiz
```

Python'da `date.today()` ve `datetime.now()` sunucu UTC'de çalışırken aynı hatayı yapar: `datetime.now(UTC)` +
`to_iso_date(...)` kullanın. Türkiye 2016'dan beri yaz saati uygulamaz; eski kayıtlarda (2016 öncesi) +2/+3 değişir.

## 8. Excel ve CSV

```ts
rows.map((r) => r.join(',')).join('\n')  // YANLIŞ: Türkçe Excel ";" bekler, "1,5" iki hücre olur, tırnak/satır sonu kaçmaz
'\u{feff}' eksik                          // YANLIŞ: BOM'suz UTF-8'i Excel ç ğ ş harflerini bozuk gösterir
'=HYPERLINK("http://kotu")'              // YANLIŞ: kullanıcı verisi formül olarak çalışır (CSV enjeksiyonu)
toExcelCsv(rows)                          // DOĞRU: ";", BOM, CRLF, ondalık virgül, = + - @ ile başlayan metne '
parseExcelCsv(metin)                      // DOĞRU: Excel TR'nin kaydettiği dosyayı okur
```

Excel 15 haneden uzun sayıları (kart numarası) bilimsel gösterime çevirip son haneleri kaybeder; bu tür alanları
metin olarak dışa aktarın ve kullanıcıyı uyarın (kütüphane bunu otomatik yapmaz).

## 9. Kimlik numaraları

```ts
;(tek * 7 - cift) % 10 // YANLIŞ: JS'de negatif sonuç verir (−9); bazı geçerli TCKN'ler reddedilir
validateTckn('19090909018') // DOĞRU: true (gerçek mod kullanılır)
Number(tckn) // YANLIŞ: başta 0 olan alanlar (posta kodu "06100") ve uzun numaralar bozulur; metin tutun
```

## 10. Plaka ve büyük harf

```ts
'34 abc 123'.toLocaleUpperCase('tr-TR') // YANLIŞ (plaka için): "i" → "İ" olur, plakada İ yoktur
normalizePlate('34 tir 34') // DOĞRU: "34 TIR 34" (i/ı → I, ASCII)
```

## 11. Kısa ad (slug) ve dosya adı

```ts
'İstanbul'.toLowerCase().replace(/[^a-z0-9]+/g, '-') // YANLIŞ: "i-stanbul" (birleşik nokta), "ç" düşer
slugify('İstanbul Çağrı Merkezi') // DOĞRU: "istanbul-cagri-merkezi"
```

## 12. Düzenli ifadeler

```ts
/^\w+$/.test('Çağrı')        // YANLIŞ: false — JS'de \w yalnız ASCII
/^[a-z]+$/i.test('ığdır')    // YANLIŞ: false
/^\p{L}+$/u.test('Çağrı')    // DOĞRU: true (u bayrağı + \p{L})
```

Python'da `str` desenlerinde `\w` Türkçe harfleri kapsar; iki dil farklı davranır, bu yüzden kütüphane harf
denetimini açık yazar (`isalpha()` ↔ `\p{L}`).

## 13. Unicode birleşimi (NFC/NFD)

macOS dosya adları ve bazı klavyeler "ş" harfini iki kod noktası (s + U+0327) olarak üretir; görünüş aynı, `===`
yanlış. Karşılaştırmadan önce `text.normalize('NFC')` (Python `unicodedata.normalize("NFC", …)`) uygulayın.
`kripto.hashPassword` parolayı bu yüzden NFC'ye çevirir; `turkce` ve `bulanik_arama` da içeride normalleştirir.
