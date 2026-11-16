# sanal_makine — Tohum için bayt kodu derleyici + yığın makinesi

Aynı Tohum dilini (bkz. [../yorumlayici/DIL.md](../yorumlayici/DIL.md)) bu kez ağaç yürüyerek değil,
önce **bayt koduna derleyip** yığın tabanlı bir sanal makinede çalıştırır: sabit havuzu, yerel
değişken yuvaları, çağrı çerçeveleri ve kapanımlar için **üst değer (upvalue) yakalama** (clox
tasarımı). Yorumlayıcı ile **birebir aynı** sonucu verir; bunu farksal testler korur: 14 örnek
program, anlam parçacıkları ve binlerce rastgele program/ifade iki arka uçta da koşturulup çıktı ve
hata iletileri (konum dahil) karşılaştırılır.

## Çalıştır (dil/ klasöründen)

```bash
python -m sanal_makine calistir yorumlayici/ornekler/kapanim_sayac.tohum
python -m sanal_makine dok yorumlayici/ornekler/kapanim_sayac.tohum     # bayt kodu dökümü
printf 'değişken gun = 60 * 60 * 24\nyazdır(gun * 7)\n' > /tmp/katla.tohum
python -m sanal_makine --katla dok /tmp/katla.tohum                     # sabit katlamadan sonra
python -m sanal_makine kod 'değişken x = 2
yazdır(x ** 10)'
python -m pytest tests/sanal_makine -q
```

Döküm örneği (`python -m sanal_makine dok` çıktısından):

```
== <betik> (0 parametre, 0 üst değer) ==
    0      2:1  CLOSURE           0         <işlev sayac_yap> üst değerler: []
    2      2:1  DEFINE_GLOBAL     1         sayac_yap
    4    10:14  GET_GLOBAL        1         sayac_yap
    6    10:24  CONST             2         0
    8    10:23  CALL              1
```

## Nasıl çalışır

```
kaynak ──(yorumlayici: lexer → parser → resolver)──► AST
                                                      │ compiler.py   (+ scope.py: yereller, döngüler)
                                                      ▼
                         FunctionProto: code[int] + positions[Pos] + constants + upvalues
                                                      │ vm.py
                                                      ▼
   değer yığını:  [ betik | yerel0 yerel1 … | çağrılan | arg0 arg1 … | geçiciler ]
                            ▲ base (çerçeve)            ▲ base (yeni çerçeve)
```

- **Yereller yuvada:** deyim sınırında yığında yalnız yereller bulunur. Kapsam bitince
  `END_SCOPE n` tepedeki n yereli atar; `kır`/`devam` da çıktığı kapsamların yerellerini böyle boşaltır.
- **Üst değerler:** `CLOSURE` komutu, işlevin yakaladığı her yerel yuva için bir `Upvalue` açar
  (aynı yuvayı yakalayan kapanımlar aynı nesneyi paylaşır). Yuva kapsamdan çıkarken (`END_SCOPE`,
  `RETURN`) üst değer "kapanır": değeri kopyalar ve artık yığını göstermez. `için` döngüsünde her
  tur ayrı kapsam olduğu için her turun kapanımı kendi değişkenini yakalar.
- **Ortak anlam:** işleçler, yerleşik işlevler ve hata iletileri `yorumlayici/ops.py`,
  `values.py`, `natives.py`'den gelir; derleyici değerlendirme sırasını ve hata konumlarını
  yorumlayıcıyla aynı tutar (`l[i] += f()`: önce hedef ve eski değer, sonra sağ taraf).

## Dosya haritası

| Dosya                | Görev                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `opcodes.py`         | `Op` komutları, işlenen sayıları (`OPERANDS`), `FunctionProto`        |
| `scope.py`           | derleme zamanı kayıtları: `Local`, `Loop`, `FunctionState` (üst değer çözümü) |
| `compiler.py`        | AST → bayt kodu; `compile_program()`                                  |
| `vm.py`              | `VM`, `Closure`, `Upvalue`, `Frame`; `run()`                          |
| `disasm.py`          | okunur bayt kodu dökümü                                               |
| `random_programs.py` | farksal test için tohumlu rastgele program ve ifade üreteci           |
| `__main__.py`        | komut satırı (`calistir`, `dok`, `kod`)                               |

## Sınırlar

- Ön ucu (sözcük çözümleyici, ayrıştırıcı, çözümleyici) ve değer anlamını `yorumlayici`
  paketinden alır: bu klasörü kopyalarken `yorumlayici/`'yı da kopyalayın.
- Hız: Python'da `match` ile komut dağıtımı, ağaç yürümekten belirgin hızlı değildir
  (`fib(20)` ~0,14 sn; yorumlayıcı ~0,13 sn; tek ölçüm, `time.perf_counter`). Amaç öğretmek ve
  farksal testtir, hız değil.
- Adım sınırı komut sayısıdır (yorumlayıcıda deyim sayısı); bu yüzden "adım sınırı" hatası iki
  arka uçta farklı noktada oluşabilir — farksal testler bu hatayı karşılaştırmaz.
- REPL yok (yorumlayıcının REPL'i kullanılır). Bayt kodu dosyaya kaydedilmez.
- Kod, gerçek bayt dizisi değil, tamsayı listesidir (işlenenler 255'i aşabilir).

## Buradan nereye (küçük modele alıştırmalar)

1. **Gözetleme deliği (peephole) iyileştirmesi:** sabit katlama AST'de yapılıyor
   (`--katla`, yorumlayici/optimize.py); bayt kodunda `JUMP` → `JUMP` zincirlerini kısaltın,
   `CONST; POP` çiftlerini silin. Farksal testler anlamın değişmediğini denetler.
2. **Gerçek bayt dizisi:** `code`'u `bytearray` yapın, işlenenleri 2 bayt yazın; `disasm.py`'yi uyarlayın.
3. **Bayt kodunu dosyaya kaydetme/yükleme** (`.tohumc`): sabit havuzu için küçük bir ikili biçim.
4. **Yığın izi:** çalışma hatasında `frames` listesinden "çağrı yığını" yazdırın (işlev adları + satırlar).
5. **Satır içi önbellek:** `GET_GLOBAL` için ad → değer önbelleği (genel atamada geçersiz kılınır).
6. **Yeni bir dil özelliği** (ör. dilim) eklerken: `random_programs.py`'ye onu üreten bir dal ekleyin;
   `tests/sanal_makine/test_sanal_makine_farksal.py` iki arka ucu kendiliğinden karşılaştırır.
