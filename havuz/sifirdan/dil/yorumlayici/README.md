# yorumlayici — Tohum dili, ağaç yürüyen yorumlayıcı

Türkçe anahtar sözcüklü, küçük ama gerçek bir programlama dili: sayılar (keyfi büyük tamsayılar),
Unicode dizgiler, mantıksal değerler, `yok`; değişkenler, `eğer/değilse`, `iken`, `için … içinde`,
`kır/devam`; işlevler, **kapanımlar**, özyineleme; listeler, sözlükler, dizinleme; 19 yerleşik işlev;
satır/sütun + şapka + ipucu gösteren Türkçe hata iletileri; REPL. Her anahtar sözcüğün ASCII
karşılığı da geçerlidir (`eğer`/`eger`). Dilin tam tanımı (EBNF + anlam + yerleşikler): [DIL.md](DIL.md).

## Çalıştır (dil/ klasöründen)

```bash
python -m yorumlayici                                              # REPL (:çık ile çıkılır)
python -m yorumlayici calistir yorumlayici/ornekler/fibonacci.tohum
python -m yorumlayici kod 'yazdır(büyük_harf("istanbul"), 2 ** 100)'
python -m yorumlayici agac yorumlayici/ornekler/merhaba.tohum      # soyut sözdizim ağacı
python -m pytest tests/yorumlayici -q
```

Python'dan: `from yorumlayici import run; run('yazdır(1 + 2)')` → `'3\n'`.

## Nasıl çalışır

```
kaynak metin (.tohum)
   │  lexer.py     Unicode NFC → belirteçler; Türkçe/ASCII anahtar sözcükler; satır/sütun
   ▼
belirteçler
   │  parser.py    deyimler (yeni satır ya da ; ayırır, bloklar { } içinde)
   │  pratt.py     ifadeler: Pratt ayrıştırma (bağlama gücü tablosu: INFIX)
   ▼
AST (nodes.py)          ← `agac` komutu bunu S-ifadesi olarak döker
   │  resolver.py  her adı kapsamına bağlar (kaç ortam yukarıda?); durağan hatalar
   ▼
AST + derinlik tablosu
   │  optimize.py  (isteğe bağlı) sabit katlama: 60 * 60 * 24 → 86400
   │  interp.py    ağaç yürüyen yorumlayıcı: ortam zinciri, kapanımlar, adım/derinlik sınırı
   │  ops.py · values.py · natives.py   ORTAK anlam (sanal_makine de bunları kullanır)
   ▼
çıktı  ya da  TohumError (errors.py: tür + konum + şapka + ipucu)
```

Neden ayrı bir çözümleyici (resolver)? Kapanımın, adı **yazıldığı yerdeki** tanıma bağlaması için.
Çözümleyici olmasaydı `işlev iç() { döndür y }` daha sonra tanımlanan yerel `y`'yi görürdü
(testi: `test_names_bind_where_written_not_where_called`).

## Dosya haritası

| Dosya          | Görev                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| `errors.py`    | `TohumError`, `Pos`, hata türleri, çok satırlı gösterim (`render`)    |
| `tokens.py`    | belirteç türleri, anahtar sözcük tablosu (Türkçe + ASCII), işleçler   |
| `lexer.py`     | sözcük çözümleyici (sayılar, dizgiler, kaçışlar, yorumlar)             |
| `nodes.py`     | AST düğümleri + `dump` (S-ifadesi)                                     |
| `pratt.py`     | belirteç imleci + ifade ayrıştırıcı (öncelik tablosu)                  |
| `parser.py`    | deyim ayrıştırıcı, `parse()`                                           |
| `resolver.py`  | ad çözümleme, durağan hatalar, "bunu mu demek istediniz?" önerisi     |
| `values.py`    | tür adları, doğruluk, eşitlik, gösterim (döngülü listeye dayanıklı)   |
| `ops.py`       | işleçlerin anlamı, dizinleme, dolaşma, boyut sınırları, ortak iletiler |
| `natives.py`   | yerleşik işlevler tablosu (`TABLE`)                                    |
| `text_tr.py`   | Türkçe büyük/küçük harf (`upper_tr`, `lower_tr`)                       |
| `interp.py`    | `Interpreter`, `Limits`, `run()`                                       |
| `optimize.py`  | sabit katlama (`Interpreter(optimize=True)`; anlamı değiştirmez)       |
| `__main__.py`  | komut satırı ve REPL                                                   |
| `DIL.md`       | dil tanımı (EBNF, anlam, yerleşikler, sınırlar)                        |
| `ornekler/`    | 14 örnek program + beklenen çıktıları (`.beklenen`)                    |

## Güvenlik sınırları

Kötü niyetli ya da hatalı program makineyi kilitleyemez: adım sınırı (sonsuz döngü), çağrı
derinliği (sonsuz özyineleme), iç içe ifade/blok sınırı (ayrıştırıcı yığını), dizgi/liste boyu,
tamsayı büyüklüğü (~3900 basamak; `2 ** 100000` reddedilir), iç içe yapı gösterim derinliği.
Hepsinin testi `tests/yorumlayici/test_yorumlayici_eval.py` içindedir.

## Sınırlar

- Yok: hata yakalama (`dene/yakala`), modül/içe aktarma, sınıflar, dilim (`l[1:3]`), dizgi
  biçimlendirme, dosya/ağ erişimi, kullanıcı girdisi okuma (`oku()`).
- Dizgiler kod noktasına göre sıralanır/karşılaştırılır (Türkçe alfabe sırası değil: `"ç" > "z"`).
- Yerleşik işlevler kullanıcı işlevini geri çağıramaz (`eşle(liste, f)` yok; döngüyle yazılır).
- Hız: `fib(20)` (21 891 çağrı) bu makinede ~0,13 sn (`time.perf_counter` ile, tek ölçüm);
  büyük hesaplar için tasarlanmadı.
- Yorumlayıcı, derin Tohum özyinelemesi için Python yığın sınırını çalışma süresince geçici olarak
  yükseltir (`recursion_room`); iş parçacığı güvenli değildir.
- REPL'de satır düzenleme yalnız `input()`'un sağladığı kadardır.

## Buradan nereye (küçük modele alıştırmalar)

1. **`yuvarla(x, basamak)` yerleşiği** — `natives.py` `TABLE`'a bir satır + işlev; DIL.md tablosu;
   `tests/yorumlayici/test_yorumlayici_yerlesik.py`'ye iki satır. Doğrula: `python -m pytest tests/yorumlayici -q`.
2. **Dilim `l[1:3]`** — `nodes.py`'ye `Slice` düğümü, `pratt.py` dizin dalında `:` kontrolü,
   `ops.py`'ye `slice_get`, `interp.py` + `sanal_makine/compiler.py` + `vm.py` (yeni komut).
   Farksal test (`tests/sanal_makine`) iki arka ucun aynı davrandığını denetler.
3. **`dene { … } yakala hata { … }`** — tokens (iki anahtar sözcük), parser, resolver (yeni kapsam),
   interp (`TohumError` yakala, iletiyi dizgi olarak bağla).
4. **Dizgi biçimlendirme** `biçimle("Merhaba {}", ad)` yerleşiği (yalnız natives.py).
5. **Ölü kod atma** — `optimize.py`'ye: `eğer yanlış { … }` bloğunu ve `döndür`'den sonraki
   deyimleri silen bir dal (çözümleyiciden sonra çalışmalı; farksal test anlamı denetler).
6. **Türkçe alfabe sıralaması** — `sırala` için `ç`'yi `c`'den hemen sonraya koyan bir anahtar işlevi.
