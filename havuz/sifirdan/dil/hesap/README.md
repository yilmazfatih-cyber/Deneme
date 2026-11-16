# hesap — güvenli ifade değerlendirici (birimli, Türkçe sayı biçimli)

`eval` kullanmadan aritmetik ifade hesaplar: `+ - * / % ^` (üs sağ birleşmeli), tekli `-`,
sonek `!` (faktöriyel), parantez, işlevler (`karekök`, `kök(x, n)`, `yuvarla`, `max`, `sin` …),
sabitler (`pi`, `e`), değişkenler (`x = 5`) ve son sonuç (`son`). Birimler: uzunluk (mm, cm,
m, km, inç, ft, yd, mil), ağırlık (mg, g, kg, ton, lb, oz), sıcaklık (°C, °F, K); dönüşüm
`kaç`, `->` ya da `to` ile: `5 km + 300 m kaç m` → `5300 m`. **Türkçe sayı biçimi** seçeneği:
`1.234,5` okunur ve yazılır, bağımsız değişkenler `;` ile ayrılır.

## Çalıştır (dil/ klasöründen)

```bash
python -m hesap "2 + 3 * 4"
python -m hesap "5 km + 300 m kaç m"
python -m hesap "100 °F kaç °C"
python -m hesap --tr "1.234,5 * 2"
python -m hesap --tr "max(1,5; 2,25)"
python -m hesap                         # etkileşimli: x = 5 km  ↵  x kaç m  ↵  :çık
python -m pytest tests/hesap -q
```

Python'dan: `Calculator(turkish=True).calculate("2,5 km kaç m")` → `Quantity(2500.0, m)`;
`calc.format(...)` → `"2.500 m"`.

## Nasıl çalışır

```
"2 + 3 km * 2 kaç m"
   │ lexer.py       sayı(2) işleç(+) sayı(3) ad(km) işleç(*) sayı(2) dönüştür(kaç) ad(m)
   ▼                (Türkçe kipte 1.234,5 → 1234.5; nokta yalnız üçlü binlik grubu)
belirteçler
   │ shunting.py    Dijkstra'nın manevra sahası: işleç yığını + öncelik → RPN
   ▼                değerden sonra gelen ad = birim (sonek, en sıkı bağ); "kaç" en gevşek
RPN: 2  3 km  2 *  +  →m
   │ evaluate.py    yığın makinesi: Quantity(değer, birim) üzerinde işlem; taşma/aralık denetimi
   ▼                units.py: boyut uyumu, dönüşüm (sıcaklıkta kaymalı ölçek)
sonuç → numfmt.py ile 12 anlamlı basamak ("0.1 + 0.2" → 0.3) ya da Türkçe biçim
```

Hata iletileri sütun + şapka + öneri verir: `2(3)` → "'(' öncesinde işleç eksik — 2*(3+4) yazın";
`5 km + 3 kg` → "uzunluk (km) ile ağırlık (kg) toplanamaz"; Türkçe kipte `1.5` → "nokta binlik
ayırıcıdır; ondalık için 1,5".

## Dosya haritası

| Dosya          | Görev                                                        |
| -------------- | ------------------------------------------------------------ |
| `errors.py`    | `CalcError` (sütun, ipucu, şapkalı gösterim)                 |
| `numfmt.py`    | sayı okuma (uluslararası/Türkçe) ve biçimleme                |
| `lexer.py`     | belirteçler, uzunluk sınırı                                  |
| `shunting.py`  | RPN'e çevirme, işlev çağrısı bağımsız değişken sayımı        |
| `units.py`     | birim tablosu, `Quantity`, toplama/çarpma/bölme kuralları    |
| `functions.py` | işlev ve sabit tabloları, `yuvarla` (yarım yukarı)           |
| `evaluate.py`  | `Calculator`, `calculate`; RPN yığın makinesi                |
| `__main__.py`  | komut satırı ve etkileşimli kip                              |

## Sınırlar

- Sayılar Python `float`'tır (IEEE 754): `0.1 + 0.2` iç değeri 0,30000000000000004'tür, yalnız
  gösterim 12 basamağa yuvarlanır. Kesin ondalık (`Decimal`) ya da kesir kipi yok.
- Birim çarpımı/bölümü yok (alan, hacim, hız: `km/sa` desteklenmez); sıcaklıkla aritmetik yok.
- Örtük çarpma yok (`2x`, `2(3)`); trigonometri radyandır.
- `yuvarla` sayının ondalık yazımına göre yuvarlar (`yuvarla(2.675; 2)` → 2,68), ikili değerine göre değil.

## Buradan nereye (küçük modele alıştırmalar)

1. **Yeni birim:** `UNITS`'e `"mil_deniz": Unit("deniz mili", LENGTH, 1852.0)` + test.
2. **Hacim boyutu:** litre, ml, m³ (yeni boyut "hacim"); `DIMENSIONS` ve testler.
3. **Yüzde işleci:** `200 + %10` → 220 (lexer'da `%` önekini ayırt edin; kalan işleciyle karışmasın).
4. **Para birimi biçimi:** `format_number(x, turkish=True)` üstüne `₺1.234,50` biçimleyici.
5. **Kesin ondalık kipi:** `Calculator(decimal=True)` — `float` yerine `Decimal` (işlevler sınırlı).
6. **Derece kipi:** `sin(90)` derece olarak (`Calculator(derece=True)`).
