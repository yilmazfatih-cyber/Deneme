# regex — doğrusal zamanlı düzenli ifade motoru

Desen ayrıştırıcı → Thompson NFA → **Pike VM** (eşzamanlı durum kümesi benzetimi). Geri izleme
yoktur: `(a+)+b` gibi "felaket" desenler bile metin uzunluğunda **doğrusal** zamanda çalışır.
Desteklenen alt kümede sonuçlar Python `re` ile **aynıdır** — yakalama grupları ve boş eşleşme
kuralları dahil; bunu hypothesis ile rastgele desen + metin üreten farksal test korur.

Destek: değişmezler, `.`, `[a-zç]`, `[^…]`, `\d \w \s \D \W \S` (Unicode: `\d` = isdecimal,
`\w` = isalnum ya da `_`, `\s` = isspace), `^ $ \A \Z \b \B`, `* + ? {m} {m,} {m,n} {,n}`
(açgözlü ve tembel `?`), `|`, `( )`, `(?: )`, `(?P<ad> )`, `\xhh \uhhhh \Uhhhhhhhh \n \t …`;
`search / match / fullmatch / findall / finditer / sub` (şablonda `\1`, `\g<1>`, `\g<ad>`,
işlev de verilebilir), `Match.group/groups/groupdict/span/start/end`.

## Çalıştır (dil/ klasöründen)

```bash
python -m regex ara '(\d+)-(\d+)' 'tel: 0212-555'
python -m regex hepsi '\w+' 'Çalışkan İşçi 3 ağaç_2'
python -m regex degistir '(?P<ad>\w+)' '<\g<ad>>' 'iyi gün'
python -m regex dok 'a(b|c)*'          # derlenmiş NFA programı
python -m regex olc                    # felaket desende re ↔ bu motor ölçümü
python -m pytest tests/regex -q
```

Python'dan: `import regex; regex.search(r"(\w+)@(\w+)", "ad@alan").groups()` → `('ad', 'alan')`.

## Nasıl çalışır

```
desen metni ──parser.py──► AST (nodes.py) ──compiler.py──► NFA programı ──pikevm.py──► eşleşme
"a(b|c)*"                  Concat(Char a,       0 SAVE 0          her konumda öncelik
                             Repeat(Group(       1 CHAR 'a'        sıralı iş parçacığı
                               Alt(b, c))))     2 SPLIT 3, 11     listesi; ε-geçişler
                                                3 ENTER 1         açık yığınla, aynı
                                                …                 durum bir kez
                                               10 BACK 2, 11
                                               11 SAVE 1
                                               12 MATCH
```

- **Pike VM:** her metin karakteri için iş parçacıkları (komut + yakalama konumları) öncelik
  sırasıyla ilerletilir. Aynı adımda aynı duruma ikinci kez gelen iş parçacığı atılır — iş, adım
  başına program boyuyla sınırlıdır: O(metin × desen). İlk (en öncelikli) MATCH'ten sonra gelen
  düşük öncelikli iş parçacıkları kesilir; böylece sonuç geri izleyen `re`'nin sonucuyla aynıdır.
- **Boş tur koruması (ENTER/BACK):** `re`, bir döngü turu hiç karakter tüketmeden biterse döngüyü
  yeniden denemez, çıkışa geçer. Bunu taklit etmek için döngü gövdesine girişte `ENTER`, gövde
  sonunda `BACK` vardır: tur aynı ε-yolunda başladıysa (boşsa) BACK çıkışa gider. Ziyaret anahtarı
  (komut, açık döngüler) çiftidir. Sonuç: `(a*)*`, `(|a)*`, `(a*?)*?b` gibi desenlerde gruplar bile
  `re` ile aynı (bkz. `test_empty_iteration_corner_cases`).
- **`{m,n}`** m zorunlu + (n−m) iç içe isteğe bağlı kopya olarak açılır; program 20 000 komutla
  sınırlıdır (dev sayılarla bellek saldırısı olmasın).
- **findall/sub:** boş eşleşmeden sonra aynı konumda başlayan boş eşleşme sayılmaz (`re` 3.7+ kuralı).

## Ölçüm (`python -m regex olc`, bu makinede tek ölçüm, `time.perf_counter`)

| n (`"a" * n`, desen `(a+)+b`) | `re` (sn) | bu motor (sn) |
| ----------------------------: | --------: | ------------: |
| 16                            | 0,0049    | 0,0001        |
| 20                            | 0,0798    | 0,0002        |
| 22                            | 0,3277    | 0,0003        |
| 10 000                        | (denenmedi — üstel) | 0,0715 |

`re` her +2 karakterde ~4 kat yavaşlar (üstel); bu motor doğrusaldır. Doğrusallık ayrıca adım
sayısıyla (zamandan bağımsız) test edilir: `test_catastrophic_pattern_is_linear`. Sıradan
desenlerde ise `re` (C ile yazılmış) bu motordan çok daha hızlıdır.

## Dosya haritası

| Dosya         | Görev                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `nodes.py`    | AST düğümleri, `CharClass`, `\d \w \s` tanımları, `RegexError`         |
| `parser.py`   | desen → AST; `re` ile aynı ayrıştırma kuralları ve Türkçe hata iletileri |
| `compiler.py` | AST → NFA programı (`Inst`), `{m,n}` açma, ENTER/BACK                  |
| `pikevm.py`   | eşzamanlı benzetim (`run`), çapalar, adım sayacı (`Stats`)             |
| `api.py`      | `Pattern`, `Match`, findall/finditer/sub, şablon çözümleme, önbellek   |
| `bench.py`    | felaket desen ölçümü                                                   |
| `__main__.py` | komut satırı (`ara`, `hepsi`, `degistir`, `dok`, `olc`)                |

## Sınırlar

- Desteklenmeyen (açık hata iletisiyle reddedilir): geri başvuru (`\1`, `(?P=ad)`), ileri/geri
  bakış, atomik grup, iyelik niceleyicisi (`*+`), satır içi bayraklar (`(?i)`), sekizlik kaçış,
  `\N{…}`. `re.IGNORECASE/MULTILINE/DOTALL` bayrakları ve `split` yok.
- `\B` boş metinde eşleşir (Python 3.14 davranışı); Python ≤ 3.13'te eşleşmez.
- `re`'nin uyardığı (`FutureWarning`) `[[`, `--`, `&&` gibi sınıf yazımları düz karakter sayılır.
- Saf Python: sıradan desenlerde `re`'den 30–180 kat yavaştır (1 087 karakterlik metinde
  `\w+@\w+`: `re` 24 µs, bu motor 4,3 ms; 20 tekrarın ortalaması, `time.perf_counter`).
  Üstünlüğü yalnız felaket desenlerdedir.
- Farksal test yalnız küçük alfabe (`abcç1 _\n`) ve kısa metinlerle (≤ 8) yapılır; daha uzun
  metinlerde fark çıkarsa `tests/regex/test_regex_farksal.py`'ye örnek olarak ekleyin.

## Buradan nereye (küçük modele alıştırmalar)

1. **`split(desen, metin)`** — `finditer` üstüne kurun; `re.split` ile farksal testi ekleyin.
2. **`IGNORECASE`** bayrağı — `Pattern(desen, buyuk_kucuk=False)`: CHAR/CLASS karşılaştırmasını
   Türkçe kurallı küçük harfe indirin (`i/İ`, `ı/I` tuzağına dikkat; `re` Türkçe kuralını bilmez).
3. **`MULTILINE`** — `^`/`$` satır başı/sonu: `assertion_holds`'a bayrak parametresi.
4. **Önek hızlandırma** — desen düz bir dizgiyle başlıyorsa `str.find` ile aday konumlara atlayın.
5. **DFA önbelleği** — gruplar istenmiyorsa (yalnız eşleşme var mı) durum kümelerini önbelleğe alıp
   ε-kapanışı tekrar hesaplamayın (RE2'nin yaptığı gibi).
6. **`\p{L}` gibi Unicode kategori sınıfları** — `unicodedata.category` ile `CharClass`'a yeni tür.
