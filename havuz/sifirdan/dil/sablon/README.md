# sablon — HTML şablon motoru (varsayılan kaçışlı, kapanımlara derlenen)

Jinja benzeri küçük bir şablon dili: `{{ ifade | süzgeç }}`, `{% if %}/{% elif %}/{% else %}`,
`{% for x in liste %}` (`loop.index`, `loop.first`, `loop.last`, `loop.length`, `{% else %}`,
`for k, v in d | items`), `{% include "parca.html" %}`, `{% set x = … %}`, `{# yorum #}`,
boşluk denetimi (`{%-`, `-%}`, `{{-`, `-}}`).

**Güvenlik varsayılandır:** `{{ … }}` çıktısı HTML kaçışlıdır (`& < > " '`); güvenilir HTML yalnız
`Markup(...)` ya da `| safe` ile geçer; `Markup + metin` metni kaçışlar; `| tojson` `<script>`
içinde güvenlidir; `| safe_url` `javascript:`/`data:` bağlantılarını `#` yapar; şablon `_` ile
başlayan adlara ve yöntemlere erişemez (çağrı sözdizimi yoktur); `FileLoader` kök klasörün
dışına çıkamaz; `include` döngüsü sınırlıdır. Hepsinin testi `tests/sablon/test_sablon_xss.py`.

## Çalıştır (dil/ klasöründen)

```bash
printf '<h1>{{ baslik | upper }}</h1>\n{%% for u in urunler %%}<p>{{ loop.index }}. {{ u.ad }}: {{ u.fiyat | sayi(2) }} TL</p>\n{%% endfor %%}' > /tmp/sayfa.html
printf '{"baslik": "iyi günler", "urunler": [{"ad": "<çay>", "fiyat": 1234.5}]}' > /tmp/veri.json
python -m sablon isle /tmp/sayfa.html --veri /tmp/veri.json
python -m pytest tests/sablon -q
```

Çıktı: `<h1>İYİ GÜNLER</h1>` ve `<p>1. &lt;çay&gt;: 1.234,50 TL</p>` (Türkçe büyük harf ve sayı biçimi).

Python'dan:

```python
from sablon import Environment, FileLoader, DictLoader, render, Markup

render("Merhaba {{ ad }}", ad="<b>Ali</b>")  # 'Merhaba &lt;b&gt;Ali&lt;/b&gt;'
env = Environment(FileLoader("sablonlar"))  # strict=True: tanımsız ad hata verir
html = env.get_template("sayfa.html").render(baslik="Köprü", urunler=[...])
```

## Nasıl çalışır

```
şablon metni
   │ lexer.py     metin / {{ ifade }} / {% etiket %} parçaları (+ satır/sütun, boşluk denetimi)
   ▼
parçalar
   │ compiler.py  etiket yapısı (if/for/include/set) → Renderer kapanımları: render(ctx, out)
   │ expr.py      ifade → belirteçler → öncelikli ayrıştırma → Expr kapanımları: değer = f(ctx)
   │ runtime.py   kapanım üreticileri + güvenli öznitelik/dizin erişimi
   ▼
kapanım ağacı (bir kez derlenir, Environment önbellekte tutar)
   │ environment.py  Context (kapsam yığını), include, yükleyiciler
   │ markup.py       Markup + escape; Undefined; TemplateError
   │ filters.py      süzgeç kaydı (FILTERS)
   ▼
HTML metni
```

"Python koduna derleme" yerine **kapanımlara derleme** seçildi: `exec`/`eval` hiç kullanılmaz
(bunu `tests/test_kurallar.py` denetler), şablon kaynağı hiçbir zaman Python kodu olarak çalışmaz.

## Süzgeçler

`escape`/`e`, `safe`, `upper`, `lower`, `title`, `capitalize` (dördü de Türkçe kurallı: `i → İ`),
`trim`, `length`, `default(yedek, boolean=false)`, `join(ayraç)`, `first`, `last`,
`replace(eski, yeni)`, `sort`, `reverse`, `items`, `tojson`, `safe_url`, `urlencode`,
`sayi(basamak)` (Türkçe: `1.234,50`), `truncate(uzunluk)`.

## Dosya haritası

| Dosya            | Görev                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `markup.py`      | `Markup`, `escape`, `TemplateError`, `RenderProblem`, `Undefined`  |
| `lexer.py`       | şablonu parçalara bölme, boşluk denetimi, konumlar                 |
| `expr.py`        | ifade belirteçleme + öncelikli ayrıştırma                          |
| `runtime.py`     | kapanım üreticileri, öznitelik/dizin erişimi (kum havuzu)          |
| `filters.py`     | süzgeç kaydı ve uygulamaları                                       |
| `compiler.py`    | etiketler → `Renderer` kapanımları, blok hataları                  |
| `environment.py` | `Environment`, `Template`, `Context`, `DictLoader`, `FileLoader`   |
| `__main__.py`    | komut satırı (`isle`)                                              |

## Sınırlar

- Yok: kalıtım (`{% extends %}`/`{% block %}`), makrolar, satır içi `a if b else c`, işlev ve
  yöntem çağrısı, `{% raw %}`, `is` testleri, `range()`. (Bilinçli: şablon kod çalıştıramaz.)
- Kaçış yalnız HTML metin ve tırnaklı öznitelik bağlamı içindir. Tırnaksız öznitelik, `<style>`,
  `on…=` olay öznitelikleri ve `<script>` içinde düz değer yazmak güvenli DEĞİLDİR (`<script>`
  için `| tojson` kullanın; bağlantılar için `| safe_url`).
- `None` boş metin olarak yazılır (Jinja `None` yazar).
- Çıktı boyu ve döngü sayısı sınırlanmaz: dev veriyle dev çıktı üretilebilir (veri uygulamadan gelir).

## Buradan nereye (küçük modele alıştırmalar)

1. **`{% extends "taban.html" %}` + `{% block icerik %}`** — compiler.py'ye iki etiket; taban şablonun
   blok tablosunu alt şablonunkilerle değiştirerek işleyin.
2. **Makro:** `{% macro kart(baslik) %}…{% endmacro %}` ve `{{ kart("x") }}` — bunun için ifade
   diline yalnız makrolar için çağrı sözdizimi eklemek gerekir (güvenlik testlerini koruyun).
3. **Yeni süzgeç `tarih(biçim)`** — `datetime` değerini "16 Kasım 2026" gibi Türkçe yazsın
   (ay adları bir sözlükte); `FILTERS`'a bir satır + test.
4. **Satır içi koşul** `a if b else c` — expr.py'de `or_expr`'in üstüne bir düzey.
5. **Önbelleği diske yazma** yok; bunun yerine şablon değişince (dosya zamanı) önbelleği geçersiz
   kılan `FileLoader` seçeneği.
6. **Çıktı sınırı:** `Environment(max_output=…)` — `out` listesine eklerken toplam boyu sayın.
