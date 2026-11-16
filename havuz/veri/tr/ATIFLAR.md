# Atıflar — `tr/` başvuru verileri

Bu klasördeki tabloların çoğu elle derlenmiş olgusal veridir ve bağımsız kaynaklarla karşılaştırılmıştır
(her tablonun yanındaki `.meta.json` dosyasına bakın). İki tablo doğrudan üçüncü taraf kaynaktan alınmış
içerik taşır; lisansları gereği bildirimleri aşağıdadır.

## `ilceler.json` / `ilceler.csv` — turkiye-api (MIT)

İl–ilçe ad listesi `ubeydeozdmr/turkiye-api` deposunun `datasets/2025/districts.json` dosyasından
2026-11-16'da alınmıştır (yalnız il ve ilçe adları; nüfus, alan ve kimlik alanları alınmadı).

```
MIT License

Copyright (c) 2022-2026 Ubeyde Emir Özdemir

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## `banka_kodlari.json` / `banka_kodlari.csv` — schwifty (MIT)

Banka unvanlarının yazımı `schwifty` 2026.11.2 paketinin `bank_registry/manual_tr.json` kaydıyla aynıdır
(12 banka). schwifty MIT lisansıyla dağıtılır: "The MIT License (MIT) — Copyright (c) 2021 Martin Domke";
izin metni yukarıdaki MIT metniyle aynıdır (<https://pypi.org/project/schwifty/>).

## Yalnız karşılaştırma için kullanılan kaynaklar (içerikleri bu depoda yok)

| Kaynak | Lisans | Ne için |
| --- | --- | --- |
| turkey-neighbourhoods 4.0.3 (npm) | MIT | il, ilçe, posta kodu kuralı |
| Memleketim: Türkiye 81 il 973 ilçe (Hugging Face) | MIT | il, bölge, alan kodu, ilçe |
| turkey-location-data 1.1.1 (npm) | Apache-2.0 | il, ilçe |
| enisbt/turkey-cities | MIT | il, ilçe |
| pycountry 26.2.16 | LGPL-2.1 | ISO 3166-2 il kodları, ISO 4217 sayısal kodlar |
| phonenumbers 9.0.43 | Apache-2.0 | telefon alan kodları |
| Unicode CLDR (babel 2.18.0) | Unicode License / BSD-3-Clause | ay, gün ve para birimi adları |
| holidays 0.108 | MIT | sabit tarihli resmî tatiller |
| datasets/currency-codes | ODC-PDDL-1.0 (derleme) | ISO 4217 kodları |
| spaCy `lang/tr/stop_words.py`, stopwords-iso/stopwords-tr | MIT | durak sözcükler |
