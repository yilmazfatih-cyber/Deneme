# fark — Myers farkı, birleşik fark, yama, sözcük farkı, üç yollu birleştirme

- **Myers O(ND) algoritması**, doğrusal bellekli "orta yılan" sürümüyle: her zaman **en kısa**
  düzenleme betiğini (en az silme + ekleme) bulur. (stdlib `difflib` bulmaz; o bir sezgiseldir.)
- **Birleşik fark** (`diff -u`, `git diff` biçimi): bağlam satırları, `@@ -a,b +c,d @@` başlıkları,
  satır sonu olmayan son satır için `\ No newline at end of file`.
- **Yama uygulama**: parça bağlamını doğrular, satırlar kaydıysa en yakın konumda bulur (kayma),
  tersine uygulayabilir (`reverse=True`), tutmazsa nerede/ne beklenip ne bulunduğunu söyler.
  Çıktımız GNU `patch` ile de uygulanır (test edildi).
- **Sözcük farkı**: `Bugün [-hava-]{+gökyüzü+} çok güzel` ya da `<del>/<ins>` HTML (kaçışlı).
- **Üç yollu birleştirme (diff3)**: çakışmasız değişiklikler kendiliğinden birleşir; çakışmalar
  `<<<<<<< bizim / ======= / >>>>>>> onların` (isteğe bağlı `||||||| ortak`) ile işaretlenir.

## Çalıştır (dil/ klasöründen)

```bash
printf 'bir\niki\nüç\n' > /tmp/eski.txt
printf 'bir\nİKİ\nüç\ndört\n' > /tmp/yeni.txt
python -m fark karsilastir /tmp/eski.txt /tmp/yeni.txt > /tmp/yama.diff     # çıkış kodu 1: fark var
python -m fark uygula /tmp/eski.txt /tmp/yama.diff                          # yeni.txt içeriğini yazar
python -m fark uygula /tmp/yeni.txt /tmp/yama.diff --ters                   # eski.txt'ye döner
python -m fark kelime /tmp/eski.txt /tmp/yeni.txt
printf 'bir\nİki\nüç\n' > /tmp/onlarin.txt
python -m fark birlestir /tmp/eski.txt /tmp/yeni.txt /tmp/onlarin.txt --diff3   # 1 çakışma
python -m pytest tests/fark -q
```

## Nasıl çalışır

```
a, b (satır listeleri)
  │ myers.py      ortak baş/son kırp → orta yılanı bul (ileri + geri arama, köşegen dizileri)
  │               → iki yarıyı özyinelemeyle çöz → eşleşen (i, j) çiftleri (LCS)
  ▼
opcodes: equal / replace / delete / insert   (difflib ile aynı biçim)
  ├─► unified.py   bağlamlı gruplar (difflib.get_grouped_opcodes kuralı) → "--- +++ @@" satırları
  │                    └─► patch.py   ayrıştır (Hunk) → konum bul (başlık + kayma) → uygula / ters uygula
  ├─► words.py     belirteçler (\w+ | boşluk | noktalama) üstünde aynı algoritma
  └─► merge3.py    ata↔bizim ve ata↔onların eşleşen blokları → ikisinde de değişmeyen "eş" bölgeler
                   → aradaki bölgeler: yalnız biz / yalnız onlar / aynı / çakışma
```

Düzenleme grafiğinde `x` = a'da, `y` = b'de konum; sağa adım silme, aşağı adım ekleme, çapraz adım
eşleşmedir. `D` adımlık en uzak noktalar `k = x − y` köşegenleri için bir dizide tutulur; ileri ve
geri aramalar aynı köşegende üst üste gelince (orta yılan) en kısa yolun bir noktası bulunmuş olur.

## Testler (farksal)

- Kaba kuvvet LCS (dinamik programlama) ile: eşleşme sayısı ve D her zaman en iyisine eşit
  (hypothesis, küçük alfabeli rastgele diziler).
- `difflib` ile: bizim D ≤ difflib'in D'si; tek bölgeli değişikliklerde birleşik fark çıktısı
  `difflib.unified_diff` ile **birebir aynı**.
- Gidiş-dönüş: `apply(eski, fark(eski, yeni)) == yeni` ve ters yönü (son satırda satır sonu
  olsun olmasın). Birleştirme özdeşlikleri: `merge(ata, ata, x) == x` vb.
- GNU `patch` kuruluysa çıktımızın onunla uygulandığı sınanır.

## Dosya haritası

| Dosya         | Görev                                                              |
| ------------- | ------------------------------------------------------------------ |
| `myers.py`    | `matches`, `opcodes`, `matching_blocks`, `edit_distance`           |
| `unified.py`  | `unified_diff`, `diff_text`, parça gruplama                        |
| `patch.py`    | `parse_patch`, `apply_patch`, `PatchError`, `Hunk`, `FilePatch`    |
| `words.py`    | `word_diff`, `word_diff_html`, `word_segments`                     |
| `merge3.py`   | `merge`, `MergeResult`, eş bölge bulma                             |
| `__main__.py` | komut satırı (`karsilastir`, `uygula`, `kelime`, `birlestir`)      |

## Sınırlar

- Satırlar tam eşitlikle karşılaştırılır (boşluk/büyük-küçük harf yok sayma seçeneği yok).
- Yama uygulamada "fuzz" (bağlamın bir kısmı tutmasa da uygulama) yok; yalnız kayma var.
  İkili (binary) dosya, yeniden adlandırma, `git diff` uzantı başlıkları (mod, yeniden adlandırma)
  yorumlanmaz.
- Çok büyük ve tamamen farklı iki dosyada (D büyük) süre O((N+M)·D)'dir: 100 000 satırlık iki
  ilgisiz dosya uzun sürer. "Sabır" (patience) sezgiseli yok.
- Birleştirme satır düzeyindedir; aynı satırın farklı yerlerini değiştiren iki taraf çakışır.

## Buradan nereye (küçük modele alıştırmalar)

1. **Boşluk yok sayma:** `opcodes(a, b, ignore_whitespace=True)` — karşılaştırmayı
   `satır.split()` anahtarıyla yapın, çıktıda özgün satırları kullanın.
2. **Patience diff:** yalnız bir kez geçen satırları çapa alıp aradaki bölgelere Myers uygulayın.
3. **Renkli çıktı:** `karsilastir --renk` ile `-` kırmızı, `+` yeşil (ANSI kodları).
4. **Yan yana HTML farkı:** `word_diff_html` ile iki sütunlu tablo.
5. **Fuzz:** yama tutmadığında bağlamın ilk/son satırlarını yok sayarak yeniden deneyin.
6. **Çakışma çözücü:** `merge(..., strategy="bizim")` gibi otomatik seçim.
