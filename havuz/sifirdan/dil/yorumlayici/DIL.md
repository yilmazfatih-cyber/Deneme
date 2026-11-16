# Tohum dili — tanım

Tohum, Türkçe anahtar sözcüklü, dinamik tipli, sözcüksel kapsamlı küçük bir dildir. İki
gerçeklemesi vardır ve ikisi **aynı sonucu** vermek zorundadır (farksal testlerle korunur):

- `yorumlayici/` — ağaç yürüyen yorumlayıcı (`python -m yorumlayici calistir dosya.tohum`)
- `sanal_makine/` — bayt kodu derleyici + yığın makinesi (`python -m sanal_makine calistir dosya.tohum`)

Dosya uzantısı `.tohum`, kodlama UTF-8.

## 1. Sözcük yapısı

- Kaynak önce **Unicode NFC** biçimine getirilir: `ğ` ister tek karakter, ister `g` + birleşik
  işaret olarak yazılsın aynı addır.
- `#` satır sonuna kadar yorumdur.
- **Yeni satır deyim ayırıcıdır** (ya da `;`). `(` ve `[` içinde yeni satırlar yok sayılır;
  ikili işleçten sonra satır bölünebilir (`a +` ↵ `b`).
- Adlar harf ya da `_` ile başlar, harf/rakam/`_` ile sürer; Türkçe harfler serbesttir.
- Sayılar: `42`, `1_000_000`, `3.14`, `2.5e-3`. Ondalık nokta ile yazılır. Ad rakamla başlayamaz.
- Dizgiler çift tırnaklıdır: `"merhaba"`. Kaçışlar: `\n \t \r \\ \" \0 \u{1F600}`.

### Anahtar sözcükler (her birinin ASCII karşılığı da geçerlidir)

| Türkçe     | ASCII      | Anlam                       |
| ---------- | ---------- | --------------------------- |
| `değişken` | `degisken` | değişken tanımı             |
| `işlev`    | `islev`    | işlev tanımı / adsız işlev  |
| `döndür`   | `dondur`   | işlevden değer döndürme     |
| `eğer`     | `eger`     | koşul                       |
| `değilse`  | `degilse`  | koşulun aksi                |
| `iken`     | `iken`     | koşullu döngü               |
| `için`     | `icin`     | dolaşma döngüsü             |
| `içinde`   | `icinde`   | `için x içinde liste`       |
| `doğru`    | `dogru`    | mantıksal doğru             |
| `yanlış`   | `yanlis`   | mantıksal yanlış            |
| `yok`      | `yok`      | değer yok (null)            |
| `ve`       | `ve`       | mantıksal ve (kısa devre)   |
| `veya`     | `veya`     | mantıksal veya (kısa devre) |
| `değil`    | `degil`    | mantıksal değil             |
| `kır`      | `kir`      | döngüden çık                |
| `devam`    | `devam`    | döngünün sonraki turu       |

## 2. Dilbilgisi (EBNF)

```ebnf
program      = { ayraç } { deyim son } EOF ;
son          = ayraç { ayraç } | (* "}" ya da EOF önünde *) ;   (* blokla biten deyimden sonra gerekmez *)
ayraç        = YENİ_SATIR | ";" ;
blok         = "{" { ayraç } { deyim son } "}" ;

deyim        = değişken_tanımı | işlev_tanımı | döndür | eğer | iken | için
             | "kır" | "devam" | atama_ya_da_ifade ;
değişken_tanımı = "değişken" AD [ "=" ifade ] ;
işlev_tanımı = "işlev" AD "(" [ AD { "," AD } ] ")" blok ;
döndür       = "döndür" [ ifade ] ;
eğer         = "eğer" ifade blok [ { YENİ_SATIR } "değilse" ( eğer | blok ) ] ;
iken         = "iken" ifade blok ;
için         = "için" AD "içinde" ifade blok ;
atama_ya_da_ifade = ifade [ ( "=" | "+=" | "-=" | "*=" | "/=" ) ifade ] ;   (* sol taraf: AD ya da dizin *)

ifade        = veya_ifadesi ;
veya_ifadesi = ve_ifadesi { "veya" ve_ifadesi } ;
ve_ifadesi   = değil_ifadesi { "ve" değil_ifadesi } ;
değil_ifadesi = "değil" değil_ifadesi | eşitlik ;
eşitlik      = karşılaştırma [ ( "==" | "!=" ) karşılaştırma ] ;        (* zincirlenemez *)
karşılaştırma = toplam [ ( "<" | "<=" | ">" | ">=" ) toplam ] ;     (* zincirlenemez *)
toplam       = çarpım { ( "+" | "-" ) çarpım } ;
çarpım       = tekli { ( "*" | "/" | "%" ) tekli } ;
tekli        = "-" tekli | kuvvet ;
kuvvet       = sonek [ "**" tekli ] ;                                    (* sağ birleşmeli *)
sonek        = birincil { "(" [ ifadeler ] ")" | "[" ifade "]" } ;
birincil     = SAYI | DİZGİ | "doğru" | "yanlış" | "yok" | AD | "(" ifade ")"
             | "[" [ ifadeler ] "]"
             | "{" [ ifade ":" ifade { "," ifade ":" ifade } [ "," ] ] "}"
             | "işlev" "(" [ AD { "," AD } ] ")" blok ;
ifadeler     = ifade { "," ifade } [ "," ] ;
```

Öncelik (sıkıdan gevşeğe): çağrı/dizin → `**` → tekli `-` → `* / %` → `+ -` →
`< <= > >=` → `== !=` → `değil` → `ve` → `veya`. Python'daki gibi `-2 ** 2` = `-4`,
`değil a == b` = `değil (a == b)`.

## 3. Anlam

**Değerler:** sayı (tamsayı ya da ondalık), dizgi, mantıksal, `yok`, liste, sözlük, işlev.
`tür(x)` bunlardan birinin adını verir: `"sayı"`, `"dizgi"`, `"mantıksal"`, `"yok"`, `"liste"`,
`"sözlük"`, `"işlev"`.

**Doğruluk:** yalnız `yok` ve `yanlış` yanlıştır; `0`, `""`, `[]` doğrudur.
`ve`/`veya` kısa devredir ve işlenenlerden birini döndürür (`yok veya 5` → `5`).

**Eşitlik:** farklı türler eşit değildir (`doğru == 1` → `yanlış`), sayılar hariç (`1 == 1.0`).
Listeler ve sözlükler içerikçe karşılaştırılır; işlevler kimlikçe.

**Aritmetik:** `+` sayıları toplar, dizgileri ve listeleri birleştirir (yeni değer üretir).
`/` iki tamsayı tam bölünüyorsa tamsayı (`6 / 3` → `2`), değilse ondalık (`7 / 2` → `3.5`).
`%` Python kuralıyla (sonucun işareti bölenin işaretidir). Sıfıra bölme hatadır. Ondalık sonuç
sonsuz olursa "sayı taşması" hatası verilir. Tamsayılar keyfi büyüklüktedir (en fazla ~3900 basamak).
Sıralama karşılaştırması yalnız sayı–sayı ya da dizgi–dizgi arasında yapılır (dizgiler kod
noktasına göre: `"ç" > "z"`).

**Dizinleme:** listeler ve dizgiler 0'dan başlar; negatif dizin sondan sayar (`l[-1]`).
Sözlük anahtarları dizgi ya da sayıdır. Dizgiler değiştirilemez; listeler ve sözlükler
değiştirilebilir ve **başvuru** ile taşınır.

**Kapsam:** sözcükseldir. Her blok (`{ … }`), her döngü turu ve her işlev çağrısı yeni bir kapsam
açar. Aynı kapsamda bir ad iki kez tanımlanamaz (genel kapsam hariç). Tanımlanmamış ada atama
yapılamaz. Ad, **yazıldığı yerdeki** tanıma bağlanır (çözümleyici, çalıştırmadan önce yapar).
Üst düzey adlar önceden bilinir: üst düzey işlevler birbirini tanım sırasından bağımsız çağırabilir,
ama bir genel değişken tanımı çalışmadan önce okunursa çalışma hatası olur.

**Kapanımlar:** işlev, tanımlandığı kapsamdaki değişkenleri **değişken olarak** yakalar (değerin
kopyasını değil): kapanım değişkeni değiştirirse herkes yeni değeri görür. `için` döngüsünde döngü
değişkeni her turda yeni bir bağdır; bu yüzden döngüde kurulan kapanımlar o turun değerini saklar.

**`için`** listeyi (döngü başında alınmış kopyasını), dizgiyi (harf harf) ya da sözlüğü
(anahtarlarını) dolaşır.

## 4. Yerleşik işlevler

| İşlev (ASCII)                                 | Ne yapar                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| `yazdır(…)` (`yazdir`)                        | değerleri boşlukla ayırıp yazar, satır sonu ekler          |
| `uzunluk(x)`                                  | dizgi/liste/sözlük uzunluğu                                |
| `ekle(liste, x)`                              | listenin sonuna ekler                                      |
| `çıkar(liste)` (`cikar`)                      | son öğeyi çıkarıp döndürür                                 |
| `metin(x)`                                    | değerin yazılışı (dizgi)                                   |
| `sayı(x)` (`sayi`)                            | dizgiyi sayıya çevirir (`sayı("3.5")`)                     |
| `tür(x)` (`tur`)                              | tür adı                                                    |
| `aralık(son)` / `aralık(baş, son[, adım])`    | tamsayı listesi (`aralik`)                                 |
| `anahtarlar(sözlük)`                          | anahtar listesi (ekleme sırasıyla)                         |
| `içerir(kap, x)` (`icerir`)                   | listede öğe / dizgide alt dizgi / sözlükte anahtar var mı  |
| `mutlak(x)`, `taban(x)`, `karekök(x)`         | mutlak değer, aşağı yuvarlama (tamsayı), karekök (ondalık) |
| `sırala(liste)` (`sirala`)                    | sıralı YENİ liste (yalnız sayılar ya da yalnız dizgiler)   |
| `birleştir(liste[, ayraç])` (`birlestir`)     | dizgileri birleştirir                                      |
| `parçala(dizgi[, ayraç])` (`parcala`)         | dizgiyi böler (ayraçsız: boşluklardan)                     |
| `büyük_harf(s)`, `küçük_harf(s)`              | Türkçe kurallı büyük/küçük harf (`i` → `İ`, `I` → `ı`)     |
| `dolaş(x)` (`dolas`)                          | `için`'in dolaşacağı öğelerin listesi                      |

## 5. Güvenlik sınırları

| Sınır                    | Varsayılan                         | Aşılınca                      |
| ------------------------ | ---------------------------------- | ----------------------------- |
| Adım (sonsuz döngü)      | yorumlayıcı 5 000 000 deyim; sanal makine 50 000 000 komut | `Sınır aşıldı` |
| Çağrı derinliği          | 200                                | `Sınır aşıldı`                |
| İç içe ifade/blok        | 100                                | `Sözdizimi hatası`            |
| Dizgi/liste boyu         | 1 000 000                          | `Sınır aşıldı`                |
| Tamsayı büyüklüğü        | ~3900 basamak                      | `Sınır aşıldı`                |

## 6. Hata iletileri

Her hata türünü, konumu, ne beklenip ne bulunduğunu ve çoğu zaman bir ipucunu söyler:

```
Sözdizimi hatası (satır 1, sütun 13): ifadeden sonra ')' bekleniyordu, '{' bulundu
   1 | eğer (1 < 2 { }
     |             ^
İpucu: '(' 1:6 konumunda açılmıştı.
```

Türler: `Sözdizimi hatası` (ayrıştırma), `Kapsam hatası` (çalıştırmadan önce: tanımsız ad, çift
tanım, yanlış yerde `döndür`/`kır`), `Çalışma hatası`, `Sınır aşıldı`.

## 7. Örnek

```
işlev sayac_yap() {
    değişken n = 0
    döndür işlev() { n += 1; döndür n }
}
değişken say = sayac_yap()
say()
yazdır(say())          # 2

için i içinde aralık(3) {
    eğer i == 1 { devam }
    yazdır(i)            # 0 ve 2
}
```

Daha fazlası: `yorumlayici/ornekler/` (her `.tohum` dosyasının beklenen çıktısı yanındaki
`.beklenen` dosyasındadır).
