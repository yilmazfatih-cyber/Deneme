# kabuk — mini Unix kabuğu

Terminale `ls *.txt | sort > liste && echo tamam` yazınca ne olur? Bu klasör bir kabuğun dört aşamasını
sıfırdan gerçekler: **sözcük ayrıştırma** (tırnak, kaçış), **ayrıştırma** (sözdizimi ağacı), **açılım**
(değişken, alan bölme, `~`, glob) ve **yürütme** (boru hatları, yönlendirmeler, `&&` `||` `;`, arka plan işleri,
`cd`/`export`/`exit`/`jobs` yerleşikleri, çıkış kodları). Alt süreçler `subprocess` ile, argüman listesiyle.

## 5 dakikada çalıştırma

```bash
python -m kabuk                                  # etkileşimli; çıkmak için exit ya da Ctrl+D
python -m kabuk -c 'X="a b"; printf "[%s]\n" $X "$X"'   # → [a] [b] [a b]
python -m kabuk betik.sh                         # dosyadaki satırları sırayla
```

```python
from kabuk import Shell

kabuk = Shell(cwd="/tmp/deneme")
kod = kabuk.run("cat *.log | grep HATA | wc -l > sayi.txt && echo bitti")
```

## Nasıl çalışır

```
"AD=x cat < a.txt | sort > b.txt && echo tamam &"
  tokenize ─▶ Word(AD=x) Word(cat) Op(<) Word(a.txt) Op(|) Word(sort) Op(>) Word(b.txt) Op(&&) … Op(&)
  parse    ─▶ Item(arka plan) ─ AndOr ─ Pipeline[ Command(cat, <a.txt, AD=x), Command(sort, >b.txt) ]
                                      └─ && Pipeline[ Command(echo tamam) ]
  açılım   ─▶ her sözcük: $AD/${AD:-v}/$? → tırnaksızsa boşlukta böl → glob (tırnaksız harf metninde)
  yürütme  ─▶ os.pipe() ── Popen(cat, stdin=a.txt, stdout=boru) ── Popen(sort, stdin=boru, stdout=b.txt)
              ebeveyn boru uçlarını KAPATIR (yoksa sort EOF görmez) → bekle → son komutun kodu → && → echo
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| `lexer.py`    | `tokenize`: sözcükler (tırnak/kaçış bilgisiyle `Part`) ve işleçler          |
| `parser.py`   | `parse`: `Item` → `AndOr` → `Pipeline` → `Command` (+ `Redirect`, atamalar) |
| `expand.py`   | `expand_word`: `~`, `$AD`, `${AD}`, `${AD:-v}`, `$?`, `$$`, alan bölme, glob |
| `executor.py` | `Shell`: boru hattı, yönlendirme, yerleşikler, işler, çıkış kodları        |
| `__main__.py` | Etkileşimli istem, `-c`, betik dosyası                                     |

## Saldırı yüzeyi ve alınan önlem

| Risk                                                | Önlem                                                         | Testi (`tests/kabuk/`)                   |
| --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Değişken içeriğiyle komut enjeksiyonu (`"; rm …"`)  | açılan değerler yeniden ayrıştırılmaz; `shell=True` yok        | `test_enjeksiyon_yapilamaz`              |
| Tırnaklı metnin glob/bölünme ile değişmesi          | parça bazında tırnak bilgisi; `glob.escape`                    | `test_glob_ve_tirnakli_glob`, `test_acilim` |
| Takılan boru hattı (açık kalan yazma ucu)           | ebeveyn her boru ucunu başlatmadan hemen sonra kapatır         | `test_boru_hatti`                        |
| Gizli dosyaların `*` ile seçilmesi                  | `glob` varsayılanı: nokta dosyaları dışarıda                  | `test_glob_ve_tirnakli_glob`             |
| Bozuk girdide çökme                                 | yalnız `ParseError` (kod 2, Türkçe ileti)                     | `test_rastgele_satir_cokertmez`, `test_sozdizimi_hatalari` |
| Kabuk kapanınca sahipsiz kalan işler                | `Shell.close()` arka plan süreçlerini sonlandırır              | `test_arka_plan_isleri`                  |

## Sınırlar

- Komut yerine koyma `$( … )`, alt kabuk `( … )`, `if/for/while`, işlevler, here-doc (`<<`), `!`, takma ad,
  `IFS` ayarı (alan bölme hep boşluk/sekme/satır sonu), aritmetik `$(( ))` **yok**.
- İş denetimi sınırlıdır: `fg`/`bg`, Ctrl+Z ile askıya alma ve süreç grupları yok; arka planda `&&` zinciri yalnız
  ilk boruyu çalıştırır (uyarı yazar).
- Boru hattındaki yerleşiğin çıktısı belleğe sığacak kadar küçük olmalıdır (64 KB'ı aşan çıktı takılabilir).
- Boru hattındaki `cd`/`export`/`exit` etkisizdir (bash'teki alt kabuk davranışına benzer şekilde).
- Yalnız Unix (Linux/macOS) için sınandı; Windows'ta yürütme testleri atlanır.

## Buradan nereye

- `$( … )`: lexer'da yeni bir `Part` türü → açılımda `Shell` ile alt yürütme → çıktıyı alanlara böl.
- Yeni yerleşik: `executor.py` içinde `_builtin_<ad>` + `BUILTINS` + test.
