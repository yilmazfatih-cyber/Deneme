---
baslik: Türkçe metin işleme
ozet: Sondan eklemeli Türkçenin metin işlemeye etkileri; belirteçleme, kök bulmanın zorluğu, arama için kırpma ve karakter n-gram karşılaştırması, durak sözcükler, normalleştirme ve dil modellerinde belirteç verimsizliği.
etiketler: [turkce, metin-isleme, arama, normallestirme, unicode, dil-modeli]
duzey: orta
guncellik: 2026-11
---

# Türkçe metin işleme

> Bu notu ne zaman okumalı: Türkçe metinde arama, süzme, sayma, sınıflandırma ya da öbekleme (chunking)
> yapacaksanız; "kitap" araması "kitabı"nı bulmuyorsa; metin birleştirme, karşılaştırma ya da tekilleştirme
> beklenmedik sonuç veriyorsa; bir dil modeline Türkçe metin verecekseniz.

## Temel fikir

Türkçe **sondan eklemelidir**: bir kökten yüzlerce yüzey biçimi doğar (ev, evi, evde, evlerimizden, evdekiler…).
Bunun dört sonucu vardır:

1. **Tam eşleşme işe yaramaz:** "kitap" araması "kitabı", "kitaplar" içeren metni bulmaz.
2. **Kök bulmak zordur:** ek atınca kök hep çıkmaz; yumuşama (kitap → kitabı), ünlü düşmesi (burun → burnu),
   gövde değişimi (git → gidiyor) ve eş yazımlı biçimler (alın: alın ↔ al-ın) vardır.
3. **Sözlük patlar:** sözcük düzeyinde sayım ya da sözlük, aynı sözcüğün yüzlerce biçimini ayrı sayar.
4. **Dil modellerinde belirteç (token) verimsizliği:** çoğunlukla İngilizceyle eğitilmiş belirteçleyiciler Türkçe
   sözcüğü daha çok parçaya böler; bu, maliyeti ve bağlam kullanımını artırır.

Ayrıca aynı görünen metin farklı baytlarla gelebilir: birleşik/ayrışık harf (NFC/NFD), dört çeşit kesme imi,
bölünmez boşluk, görünmez karakter. Her karşılaştırmadan önce **normalleştirin**.

## Karar tablosu

| İş                                         | Yaklaşım                                                              | Neden                                          |
| ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| Küçük listede arama (kişi, ürün, şehir)    | Katla + önek eşleşmesi (+ yumuşama payı) + yazım hatası için 3-gram    | Hızlı, bağımlılıksız, çekime ve hataya dayanıklı |
| Büyük belge kümesinde arama                | Tam metin motoru + Türkçe çözümleyici (küçültme, kesme imi, kök bulucu) | Dizinli ve sıralı sonuç                       |
| Birkaç bin kayıt, bulanık arama            | Havuzdaki [bulanık arama](../../kutuphane/py/kutuphane/bulanik_arama.py) | Hazır ve sınanmış                            |
| Anlama dayalı arama (eş anlamlı, soru)     | Gömme (embedding) + vektör araması; kısa sorguda yine sözcük araması   | Biçim farkını anlam katmanı karşılar          |
| Sınıflandırma, duygu çözümlemesi           | Alt-sözcük belirteçli model; durak sözcük ATMADAN                     | Olumsuzluk ("değil") anlamı taşır             |
| Tekilleştirme, karşılaştırma               | Normalleştir (NFC, kesme imi, boşluk) + Türkçe katlama                 | Aynı görünen metin farklı baytlarla gelir     |
| Gösterim ve saklama                        | Özgün metin                                                            | Katlama yalnız karşılaştırma anahtarıdır      |

## Belirteçleme (tokenization)

- Boşlukla bölmek noktalamayı sözcüğe yapıştırır ("gönderdi,"); `\w+` ile bölmek kesme imli sözcüğü ikiye ayırır
  ("Ankara", "ya") ve "1.234,56"yı parçalar.
- Arama dizini için iyi yol: kesme imli sözcüğün **hem tamamını hem kesmeden önceki kısmını** dizine koymak
  ("ankara'ya" ve "ankara").
- Cümle bölerken kısaltma noktası ("Dr.", "vb.", "A.Ş.") ve sayıdaki nokta ("1.234") cümle sonu değildir.

```python calistir
import re

TOKEN = re.compile(r"\d{1,3}(?:\.\d{3})*(?:,\d+)?|\w+(?:['’]\w+)?(?:-\w+)*|[^\w\s]")

text = "Ayşe Ankara’ya 1.234,56 TL'lik e-posta faturası gönderdi."
assert text.split()[1] == "Ankara’ya" and text.split()[-1] == "gönderdi."  # boşlukla: nokta yapışık
assert re.findall(r"\w+", text)[1:3] == ["Ankara", "ya"]  # \w+ ile: kesme imli sözcük bölündü
tokens = TOKEN.findall(text)
assert tokens == ["Ayşe", "Ankara’ya", "1.234,56", "TL'lik", "e-posta", "faturası", "gönderdi", "."]

index_terms = {part for t in tokens if t[0].isalnum() for part in {t, re.split(r"['’]", t)[0]}}
assert {"Ankara’ya", "Ankara", "TL'lik", "TL"} <= index_terms  # tam biçim ve kesmeden önceki kök
print("tamam")
```

```cikti
tamam
```

## Kök ve gövde bulmanın zorluğu

| Olgu                    | Örnek                              | Basit ek atıcının sonucu       |
| ----------------------- | ---------------------------------- | ------------------------------ |
| Ünsüz yumuşaması        | kitap → kitabı, ağaç → ağacı       | "kitab" (kök "kitap" değil)    |
| Ünlü düşmesi            | burun → burnu, oğul → oğlu         | "burn"                         |
| Gövde değişimi          | git → gidiyor, ye → yiyor          | "gid", "yi"                    |
| Eş yazım                | alın (alın / al-ın), yüz (yüz / yüz-) | Tek kök seçilemez           |
| Birleşik ve yabancı söz | kitapçı, bilgisayarlarımızdan      | Fazla ya da eksik kesme        |

Sonuç: kural tabanlı kök bulucu her zaman hata yapar. Arama için **tam kök gerekmez**: aranan sözcüğün başıyla
eşleşmek (önek) ve yumuşamaya pay bırakmak çoğu ihtiyacı karşılar. Gerçek biçimbilim çözümlemesi gerekiyorsa
olgun bir Türkçe biçimbilim kütüphanesi kullanın; kendiniz yazmayın.

## Arama için kırpma ve karakter n-gram: çalışan karşılaştırma

On iki kısa belge, iki tür sorgu: çekimli biçimler ("kitap" → kitabı, kitaplar) ve yazım hataları ("ankra").
Dört yöntem:

```python calistir
import re

FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")
SOFT = {"p": "b", "t": "d", "k": "g"}  # katlanmış yumuşama: kitap→kitabı, kanat→kanadı, ayak→ayağı; ç→c katlamayla çözülür
DOCS = {
    1: "Kitabı masaya bıraktım.", 2: "Kitaplar rafta.", 3: "Yeni bir kitap aldım.", 4: "Kitapçıya uğradım.",
    5: "Ağacın gölgesi.", 6: "Bahçedeki ağaçlar.", 7: "Gözlüğümü kaybettim.", 8: "Gözleri çok güzel.",
    9: "Ankara'ya gittik.", 10: "ANKARA'DA kar var.", 11: "Gözde bir mekân.", 12: "Ankaralılar sabırlıdır.",
}
INFLECTED = {"kitap": {1, 2, 3}, "ağaç": {5, 6}, "göz": {8}, "ankara": {9, 10, 12}}  # sorgu → istenen belgeler
TYPOS = {"ankra": {9, 10, 12}, "kitpalar": {2}}


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def words(text: str) -> list[str]:
    return [w.translate(FOLD) for w in re.findall(r"\w+", lower_tr(text))]


def grams(word: str) -> set[str]:
    padded = f"^{word}$"
    return {padded[i : i + 3] for i in range(len(padded) - 2)}


def exact(q: str, ws: list[str]) -> bool:
    return q in ws


def first5(q: str, ws: list[str]) -> bool:  # iki tarafı da ilk 5 harfe kırp
    return q[:5] in {w[:5] for w in ws}


def prefix_soft(q: str, ws: list[str]) -> bool:  # sözcük sorguyla başlıyor mu; son harfte yumuşama payı
    stems = {q, q[:-1] + SOFT.get(q[-1], q[-1])}
    return any(w.startswith(s) for w in ws for s in stems)


def trigram(q: str, ws: list[str]) -> bool:  # 3'lü harf öbeklerinin örtüşmesi (Jaccard ≥ 0,3)
    return any(len(grams(q) & grams(w)) / len(grams(q) | grams(w)) >= 0.3 for w in ws)


def score(method, queries: dict[str, set[int]]) -> str:
    found = extra = 0
    for query, wanted in queries.items():
        q = lower_tr(query).translate(FOLD)
        hits = {doc for doc, text in DOCS.items() if method(q, words(text))}
        found, extra = found + len(hits & wanted), extra + len(hits - wanted)
    return f"{found}/{sum(map(len, queries.values()))} bulundu, {extra} fazladan"


for name, method in [("tam eşleşme", exact), ("ilk 5 harf", first5), ("önek + yumuşama", prefix_soft), ("3-gram", trigram)]:
    print(f"{name:15} | çekimli: {score(method, INFLECTED):22} | yazım hatalı: {score(method, TYPOS)}")
```

```cikti
tam eşleşme     | çekimli: 3/9 bulundu, 0 fazladan | yazım hatalı: 0/4 bulundu, 0 fazladan
ilk 5 harf      | çekimli: 5/9 bulundu, 1 fazladan | yazım hatalı: 0/4 bulundu, 0 fazladan
önek + yumuşama | çekimli: 9/9 bulundu, 3 fazladan | yazım hatalı: 0/4 bulundu, 0 fazladan
3-gram          | çekimli: 8/9 bulundu, 2 fazladan | yazım hatalı: 3/4 bulundu, 0 fazladan
```

Okuma:

- **Tam eşleşme** Türkçede kullanılamaz.
- **İlk 5 harf kırpması** beş harften kısa köklerde ("ağaç", "göz") ve yumuşamada ("kitabı" → "kitab") kaçırır.
  Havuzdaki [ara.py](../araclar/ara.py) de bu kırpmayı kullanır; aynı sınır onun için geçerlidir.
- **Önek + yumuşama payı** çekimli biçimlerin hepsini bulur ama fazladan sonuç getirir (kitapçı, gözlük, gözde) ve
  yazım hatasına dayanıksızdır.
- **3-gram** hem çekime hem yazım hatasına makul dayanır; eşik ayarı belge kümesine göre sınanmalıdır.
- Pratik birleşim: önce önek + yumuşama ile ara, sonuç azsa 3-gram ile genişlet; sonuçları "tam eşleşme > önek >
  3-gram" sırasıyla diz. Fazladan sonuçlar sıralamanın altında kaldığı sürece kullanıcı için zararsızdır.

## Durak sözcükler

Durak sözcükler (ve, bir, bu, da, de, için…) arama dizininde yer kaplar; atmak dizini küçültür. Ama iki tuzak var:

- **"de/da" ayrı yazıldığında sözcüktür** ("Ben de geldim"), bitişikken ektir ("evde"). Boşlukla bölünmüş metinde
  ayrı olanı atmak sorun değildir; ekleri atmaya çalışmayın.
- **Olumsuzluk ve soru sözcükleri anlam taşır:** "değil", "yok", "hiç", "mi". Havuzdaki liste
  ([veri/tr/durak_sozcukler.csv](../../veri/tr/durak_sozcukler.csv)) bunları da içerir; arama için uygundur,
  **duygu çözümlemesi ve sınıflandırma için kullanılmaz:**

```python calistir
STOP = {"ve", "bir", "bu", "çok", "da", "de", "mi", "değil", "hiç", "yok"}  # havuzdaki listede bunlar da var


def content_words(text: str) -> list[str]:
    lowered = text.replace("İ", "i").replace("I", "ı").lower()
    return [w for w in lowered.replace(".", "").split() if w not in STOP]


assert content_words("Yemek çok güzel.") == ["yemek", "güzel"]
assert content_words("Yemek hiç güzel değil.") == ["yemek", "güzel"]  # olumsuz cümle olumluyla aynı oldu
print("olumsuzluk kayboldu")
```

```cikti
olumsuzluk kayboldu
```

## Normalleştirme

Karşılaştırma ve aramadan önce şu sırayla:

1. **Unicode NFC:** "ş" bir karakter (U+015F) ya da "s" + birleşik çengel (U+0327) olarak gelebilir; ikincisi
   macOS dosya adlarında ve bazı kopyala-yapıştırmalarda sık görülür. Göze aynı, bayta farklıdır.
2. **Kesme imi:** `'` (U+0027), `’` (U+2019), `‘`, `ʼ`, `´` aynı işi görür; birine indirin.
3. **Boşluk:** bölünmez boşluk (U+00A0), sıfır genişlikli boşluk (U+200B), yumuşak tire (U+00AD); düz boşluğa
   indirin ya da silin, ardışık boşlukları teke indirin.
4. **Türkçe kurallı küçültme** ([Türkçe büyük/küçük harf](buyuk-kucuk-harf.md)).
5. **Yalnız arama anahtarında:** işaretleri atın (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u) ve düzeltme işaretini kaldırın
   (kâr → kar). "kâr" (kazanç) ile "kar" (yağış) böylece birleşir; arama için kabul edilir, gösterim için edilmez.

```python calistir
import unicodedata

APOSTROPHES = "\N{RIGHT SINGLE QUOTATION MARK}\N{LEFT SINGLE QUOTATION MARK}\N{MODIFIER LETTER APOSTROPHE}\N{ACUTE ACCENT}"
INVISIBLE = {"\N{NO-BREAK SPACE}": " ", "\N{ZERO WIDTH SPACE}": "", "\N{SOFT HYPHEN}": ""}


def normalize(text: str) -> str:
    """Karşılaştırma öncesi: NFC, tek tür kesme imi, düz boşluk, görünmez karakter yok."""
    text = unicodedata.normalize("NFC", text)
    text = text.translate({ord(ch): "'" for ch in APOSTROPHES})
    for old, new in INVISIBLE.items():
        text = text.replace(old, new)
    return " ".join(text.split())


def search_key(text: str) -> str:
    """Yalnız arama için: Türkçe küçült, işaretleri ve düzeltme işaretini at."""
    lowered = normalize(text).replace("İ", "i").replace("I", "ı").lower()
    stripped = "".join(ch for ch in unicodedata.normalize("NFD", lowered) if not unicodedata.combining(ch))
    return stripped.replace("ı", "i")


decomposed = "s\N{COMBINING CEDILLA}eker"
assert decomposed != "şeker" and len(decomposed) == 6  # göze aynı, karşılaştırmada farklı
assert normalize(decomposed) == "şeker"
assert normalize("Ankara\N{RIGHT SINGLE QUOTATION MARK}ya") == "Ankara'ya"
assert normalize("1.234\N{NO-BREAK SPACE}TL") == "1.234 TL"
assert normalize("Ah\N{ZERO WIDTH SPACE}met  Yılmaz") == "Ahmet Yılmaz"
assert search_key("Kâr") == search_key("kar") == "kar"
assert search_key("IŞIK") == search_key("ışık") == "isik"
print("tamam")
```

```cikti
tamam
```

Katlanmış metni **kullanıcıya göstermeyin ve modele girdi olarak vermeyin**: ı → i ve ş → s dönüşümü bazı
sözcükleri başka, hatta kaba bir sözcüğe çevirir.

## Yazım denetimi yaklaşımı

- Düz sözcük listesi Türkçede yetmez: biçimler sonsuz sayıdadır; listede olmayan doğru biçim hata sayılır.
- Gerçek denetim için kök sözlüğü + ek dilbilgisi (biçimbilim çözümleyici) gerekir; bunu sıfırdan yazmak büyük
  iştir, olgun bir kütüphane kullanın.
- Daha mütevazı ve çoğu ürüne yeten yol: büyük bir metin derleminden sözcük sıklık listesi + katlanmış biçimde
  düzenleme uzaklığı (Damerau) ile "bunu mu demek istediniz?" önerisi.
- ASCII ile yazılmış metni ("cok guzel") Türkçe harflere çevirmek (deasciification) ayrı bir iştir; bağlam ister
  ("sik" hangi sözcük?). Kullanıcı girdisini kendiliğinden "düzeltmeyin"; öneri olarak sunun.

## Dil modelleriyle Türkçe

- **Belirteç verimsizliği:** belirteçleyiciler çoğunlukla İngilizce metinle eğitildiği için Türkçe sözcük daha çok
  parçaya bölünür. Sonuç: aynı içerik için daha çok belirteç, daha yüksek maliyet, daha çabuk dolan bağlam
  penceresi, daha yavaş üretim. Oran modele göre değişir; **kendi metninizle ölçün**: aynı anlamdaki Türkçe ve
  İngilizce metni modelin kendi belirteçleyicisinden geçirip `len(tokenizer.encode(metin))` değerlerini
  karşılaştırın. Bayt düzeyinde başlangıç bile eşit değildir:

```python calistir
en = "We could not save your changes because the connection was lost."
tr = "Bağlantı koptuğu için değişikliklerinizi kaydedemedik."
for name, text in [("İngilizce", en), ("Türkçe", tr)]:
    print(f"{name}: {len(text.split())} sözcük, {len(text)} karakter, {len(text.encode('utf-8'))} bayt")
assert len(tr.encode("utf-8")) > len(tr)  # ç, ğ, ı, ö, ş, ü, İ UTF-8'de ikişer bayttır
```

```cikti
İngilizce: 11 sözcük, 63 karakter, 63 bayt
Türkçe: 5 sözcük, 54 karakter, 60 bayt
```

  Türkçe aynı anlamı daha az ama daha uzun sözcükle taşır; sözcük başına maliyet ve "sözcük sayısı" sınırları bu
  yüzden yanıltıcıdır. Öbekleme (chunking) ve bütçeyi karakterle değil belirteçle yapın.
- **Modelin tipik Türkçe hataları:** özel ada yanlış ek ("İzmir'a"), "i"yi "I" diye büyütme, "sen/siz" karışması,
  çeviri kokan cümle, sayıdan sonra çoğul ("3 dosyalar"), karakter ya da sözcük saymada yanılma.
- Kendi küçük modelinizi eğitecekseniz Türkçe metin hazırlığı ve belirteçleyici eğitimi için havuzdaki
  [dil-modeli](../../dil-modeli/README.md) temeline bakın (Türkçe harf çevirme: `dil_modeli/text_tr.py`).

## Tuzaklar

| Belirti                                                   | Neden                                                | Çözüm                                                        |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| "kitap" araması "kitabı"nı bulmuyor                       | Tam eşleşme ya da 5 harf kırpması                    | Önek + yumuşama payı; 3-gram ile genişletme                  |
| "göz" araması "gözleri"ni bulmuyor                        | Kırpma uzunluğu kökten uzun                          | Kısa sorguda önek eşleşmesi                                  |
| Aynı görünen iki ad tekilleştirilemedi                    | NFC/NFD farkı ya da görünmez karakter                | Önce `normalize`; şüphede kod noktalarını yazdırın           |
| "Ankara’ya" ile "Ankara'ya" ayrı sayılıyor                | İki farklı kesme imi                                 | Kesme imini teke indirin                                     |
| Olumsuz yorumlar olumlu sınıflanıyor                      | Durak sözcük listesi "değil", "yok"u attı            | Sınıflandırmada durak sözcük atmayın                         |
| Model yanıtında anlamsız ya da kaba sözcük                | Modele ASCII'ye katlanmış metin verildi              | Modele ve kullanıcıya özgün metni verin                      |
| Bağlam penceresi beklenenden çabuk doldu                  | Türkçede belirteç/sözcük oranı yüksek                | Belirteçle ölçün; öbekleri belirteç sayısıyla kesin          |
| Cümle sayısı fazla çıkıyor                                | "Dr.", "vb.", "1.234" noktasında bölündü             | Kısaltma listesi ve sayı kalıbı                              |
| Yazım denetimi doğru sözcüğü hata sayıyor                 | Düz sözcük listesi biçimleri bilmiyor                | Sıklık listesi + öneri; kendiliğinden düzeltme yok           |

## Denetim listesi

- [ ] Karşılaştırma ve aramadan önce NFC, kesme imi, boşluk ve görünmez karakter normalleştirmesi yapılıyor.
- [ ] Arama anahtarı katlanmış; gösterim ve saklama özgün metinle.
- [ ] Arama çekimli biçimleri buluyor: "kitap" → kitabı, kitaplar; "göz" → gözleri; "ağaç" → ağacın.
- [ ] Yazım hatalı sorgu ("ankra") en az bir sonuç getiriyor ya da öneri sunuyor.
- [ ] Kesme imli sözcükler hem tam hem kök biçimiyle dizinde.
- [ ] Sınıflandırma ve duygu çözümlemesinde durak sözcük atılmıyor.
- [ ] Dil modeli bütçesi ve öbekleme belirteçle ölçülüyor.
- [ ] Testlerde NFD harf, `’`, bölünmez boşluk ve sıfır genişlikli boşluk içeren girdiler var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Türkçe arama yazıyorsun. Tam eşleşme kullanma. İki tarafı aynı normalleştirme ve katlamadan
  geçir; önek eşleşmesi ve son harfte yumuşama payı (p/b, t/d, k/g) kullan; sonuç azsa 3-gram benzerliğiyle
  genişlet. Gösterimde özgün metni kullan. Şu örneklerle test yaz: kitap→kitabı, göz→gözleri, ağaç→ağacın,
  Ankara’ya (tipografik kesme imiyle), ankra (yazım hatası)."
- **Modelin tipik hatası:** `str.lower()` ve tam eşleşme kullanır; İngilizce kök bulucuyu (Porter) Türkçeye uygular;
  durak sözcük listesini her işe uygular; NFC'yi atlar; katlanmış metni ekranda gösterir; sözcük sayısıyla bütçe
  hesaplar.
- **Çıktıda denetleyin:** arama işlevi yukarıdaki örnek listesini geçiyor mu; normalleştirme tek bir yerde mi;
  sınıflandırma hattında durak sözcük atılıyor mu.

## İlgili

- [Türkçe büyük/küçük harf](buyuk-kucuk-harf.md): katlama ve harmanlama.
- [Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md): kesme imli eklerin kuralları.
- [Hata sınıfları ve imzaları](../00-yontem/hata-siniflari.md): bozuk kodlama imzaları.
- Çalışan gerçeklemeler: [turkce.py](../../kutuphane/py/kutuphane/turkce.py) (arama anahtarı, sıralama, heceleme),
  [bulanik_arama.py](../../kutuphane/py/kutuphane/bulanik_arama.py) (Damerau, trigram),
  [metin.py](../../kutuphane/py/kutuphane/metin.py) (sözcük sayımı, kısaltma).
