# json_ayristirici — RFC 8259 JSON ayrıştırıcı, yazıcı ve akış ayrıştırıcısı

- **`loads`** — özyinelemeli iniş ayrıştırıcı; RFC 8259'a sıkı uyar (baştaki sıfır, `+1`, `.5`,
  `NaN`, `Infinity`, yorum, tek tırnak, sondaki virgül, kaçışsız denetim karakteri hatadır);
  `\uXXXX` vekil çiftlerini birleştirir; hata iletisi **satır + sütun + ne beklendi + ne bulundu +
  ipucu** verir ("`]` öncesinde sondaki virgül — Son öğeden sonraki virgülü silin").
- **`dumps`** — yazıcı; çıktısı stdlib `json.dumps` ile birebir aynıdır (`indent`, `sort_keys`,
  `ensure_ascii`, `separators`, `default`), ama daha güvenlidir: NaN/Infinity, dizgi olmayan
  anahtar ve döngüsel yapı hatadır (hata yolu gösterir: `$['a'][0]`).
- **`iter_events` / `EventParser`** — akışla (olay tabanlı) ayrıştırma: dosya parça parça okunur,
  bellek yalnız açık yapılar kadar tutulur; belirteç parça sınırında bölünse de doğru çalışır.
  Hatalar `loads` ile **aynı ileti ve konumda** verilir.
- **Güvenlik sınırları:** iç içe derinlik (varsayılan 400; akışta özyineleme hiç yok), sayı
  uzunluğu (1000 karakter), taşan ondalık (`1e999`) hatadır.

## Çalıştır (dil/ klasöründen)

```bash
printf '{"ad": "Ayşe", "notlar": [90, 85.5],}' > /tmp/ornek.json
python -m json_ayristirici dogrula /tmp/ornek.json         # hata: sondaki virgül, satır/sütun + ^
printf '{"b": 1, "a": [true, null]}' > /tmp/iyi.json
python -m json_ayristirici bicimle /tmp/iyi.json --sirali
python -m json_ayristirici olaylar /tmp/iyi.json --parca 4  # 4 karakterlik parçalarla akış
python -m pytest tests/json_ayristirici -q
```

Python'dan:

```python
from json_ayristirici import loads, dumps, iter_events, build, Options
loads('{"ad": "Ayşe"}')                       # {'ad': 'Ayşe'}
dumps({"ç": [1, None]}, ensure_ascii=False)   # '{"ç": [1, null]}'
with open("buyuk.json", encoding="utf-8") as f:
    for olay in iter_events(iter(lambda: f.read(65536), "")):
        ...                                   # Event(kind=EventKind.KEY, value='ad') …
loads('"\\ud800"', Options(allow_lone_surrogates=True))   # stdlib gibi eşsiz vekili kabul et
```

## Nasıl çalışır

```
                    ┌──────────── scanner.py (ORTAK) ────────────┐
                    │ scan_string · scan_number · scan_literal    │
                    │ hata iletileri: after_item, trailing_comma… │
                    └──────┬───────────────────────────┬──────────┘
metin ──► parser.py: Parser.value → array / object (özyineleme, 2 çerçeve/düzey) ──► Python değeri
parçalar ──► stream.py: EventParser (açık yığın + durum makinesi; belirteç yarımsa `Incomplete`,
             sonraki parçayı bekler) ──► Event akışı ──► build() ──► Python değeri
Python değeri ──► writer.py: Writer.write (kaçış, girinti, döngü/derinlik denetimi) ──► metin
```

## Dosya haritası

| Dosya         | Görev                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| `scanner.py`  | dizgi/sayı/sabit tarama, `Incomplete`, `ScanError`, ortak hata iletileri |
| `parser.py`   | `loads`, `loads_bytes`, `Options`, `JsonError` (satır/sütun, `render`)  |
| `stream.py`   | `EventParser`, `iter_events`, `Event`, `EventKind`, `build`              |
| `writer.py`   | `dumps`, `JsonWriteError`                                               |
| `__main__.py` | komut satırı (`dogrula`, `bicimle`, `olaylar`)                           |

## Testler

- Örnek testleri: RFC kuralları, 26 hatalı girdinin satır/sütun ve ipucu, derinlik/uzunluk sınırları.
- **Farksal (hypothesis):** rastgele değer → `json.dumps` → bizim `loads` = stdlib `json.loads`;
  bozulmuş metinlerde ikisi de aynı kararı (kabul/ret) verir; akış ayrıştırıcısı rastgele parça
  bölmelerinde özyinelemeli ayrıştırıcıyla aynı değeri ya da aynı hatayı verir; `dumps` = stdlib.

## Sınırlar

- stdlib'den bilinçli farklar: `NaN`/`Infinity` ve taşan ondalık kabul edilmez; eşi olmayan vekil
  varsayılan olarak hatadır (`Options(allow_lone_surrogates=True)` ile stdlib gibi); `dumps`
  dizgi olmayan anahtarı dizgiye çevirmez, hata verir.
- Ondalık sayılar Python `float`'tır (IEEE 754): `0.1` tam değildir; `Decimal` seçeneği yok.
- Akışta çok uzun tek bir dizgi çok küçük parçalarla gelirse, dizgi her parçada baştan taranır
  (en kötü durumda karesel zaman). Büyük parçalar (≥ 4 KB) kullanın.
- `Options.max_depth` 400'ün çok üstüne çıkarılırsa özyinelemeli `loads` Python yığın sınırına
  takılabilir; derin belgeler için `iter_events` + `build` kullanın (özyinelemesizdir).
- JSON Pointer, JSON Schema, JSON5/JSONC (yorumlu JSON) yok.

## Buradan nereye (küçük modele alıştırmalar)

1. **JSONC kipi:** `Options(allow_comments=True)` — `skip_ws` içinde `//` ve `/* */` atlama
   (iki ayrıştırıcıda da; akışta yorum parça sınırında bölünebilir!).
2. **Yol bilgili olaylar:** `Event`'e `path` alanı (`$.kullanicilar[3].ad`) ekleyin.
3. **`Decimal` seçeneği:** `Options(decimal=True)` → `scan_number` ondalıkları `Decimal` döndürsün.
4. **Satır satır JSON (JSONL):** her satırı ayrı belge olarak okuyan `iter_jsonl(dosya)`.
5. **Şema doğrulama (küçük alt küme):** `{"type": "object", "required": [...]}` denetleyen bir modül.
6. **Akışta seçici çıkarma:** yalnız `$.urunler[*].fiyat` değerlerini üreten bir süzgeç.
