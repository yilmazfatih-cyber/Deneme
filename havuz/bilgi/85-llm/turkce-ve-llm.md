---
baslik: Türkçe ve dil modelleri
ozet: Türkçe'ye özgü model tuzakları tek sayfada; belirteç verimsizliğini ölçme yöntemi, ek ve büyük harf denetçisi, çeviri kokan çıktı, değerlendirmede Türkçe normalleştirme, istem dilini ölçerek seçme.
etiketler: [llm, turkce, belirtec, degerlendirme, istem, normallestirme]
duzey: orta
guncellik: 2026-11
---

# Türkçe ve dil modelleri

> Bu notu ne zaman okumalı: Türkçe metin üreten ya da işleyen bir model özelliği kurarken; model seçerken
> maliyeti hesaplarken; model çıktısını puanlayan bir değerlendirme yazarken; "istemi Türkçe mi yazayım İngilizce
> mi?" sorusunda.

## Temel fikir

Türkçe işte dil modeli beş yerde tökezler; her birinin ayrıntılı notu vardır, burada ölçme ve denetleme yolu
toplanır:

1. **Belirteç:** aynı içerik çoğu modelde daha çok belirteç tutar → daha pahalı, daha yavaş, bağlama daha az sığar
   ([nasıl çalışır](llm-nasil-calisir.md)). Oran belirteçleyiciye göre 0,6 ile 2 kat arasında değişir: **ölçülür**.
2. **Biçim:** özel ada yanlış ek ("İzmir'a"), İngilizce kuralla büyütme ("ISTANBUL"), sayıdan sonra çoğul
   ("3 paketler"), sen/siz karışması ([ekler](../97-turkce/ekler-ve-unlu-uyumu.md),
   [büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)). Kodla denetlenir.
3. **Üslup:** çeviri kokan, sohbet botu kalıplı metin ("Harika soru!", "sahip olmak"). İstemde örnekle önlenir,
   denetçiyle aranır.
4. **Değerlendirme:** "İstanbul." ile "istanbul"u, "Ankara’da" ile "Ankara"yı eşleştiremeyen puanlayıcı modeli
   haksız yere düşük, "KIR" ile "kir"i eşleştiren puanlayıcı haksız yere yüksek ölçer.
5. **İstem dili:** Türkçe talimat mı, İngilizce mi? Görev kümesinde ölçmeden karar verilmez.

## Karar tablosu

| Durum | Ne yapılır | Ayrıntı |
| --- | --- | --- |
| Maliyet ya da bağlam bütçesi hesaplanacak | Aday belirteçleyicilerle kendi metninizde TR/EN oranı ve karakter/belirteç | Aşağıda yöntem |
| Ölçemiyorsunuz, kaba bütçe lazım | 2,6 karakter = 1 belirteç (bilerek fazla sayar) | `yz/yz/metin.py`, [nasıl çalışır](llm-nasil-calisir.md) |
| Model kullanıcıya Türkçe metin yazıyor | Çıktı denetçisi (ek uyumu, büyük harf, çoğul, kalıp) + insan örneklemi | Aşağıda denetçi |
| Metne değişken (ad, şehir) girecek | Eksiz kalıp: "Alıcı: {ad}" | [Ekler ve ünlü uyumu](../97-turkce/ekler-ve-unlu-uyumu.md) |
| Kısa yanıt (ad, şehir, sınıf) puanlanacak | NFC + tek tür kesme + Türkçe küçültme; özel adda ek toleransı | Aşağıda normalleştirme |
| Serbest metin puanlanacak | Beklenen olgular + dayanaksız denetimi; karakter n-gram yalnız yüzey ölçüsü | [Değerlendirme](degerlendirme.md) |
| İstem dili seçilecek | İki dilde aynı görev kümesi, eşli karşılaştırma | Aşağıda protokol |
| Sınıflandırma / arama için model | Türkçe ya da çok dilli belirteçleyicisi olan kodlayıcı | [Metin sınıflandırma](../80-ml/metin-siniflandirma.md) |

## 1. Belirteç verimsizliğini ölçmek

Yöntem: aynı anlamda **eş cümle çiftleri** (kendi alanınızdan 20–50 çift) her aday belirteçleyiciden geçirilir;
cümle başına TR/EN oranının ortancası ve aralığı, Türkçe karakter/belirteç değeri yazılır. Ölçüm işlevi
belirteçleyiciden bağımsızdır; aşağıda bir "İngilizce ağırlıklı" oyuncak bayt düzeyi BPE ile çalıştırılıyor:

```python calistir
import random
import re
import statistics
from collections import Counter

PAIRS = [  # aynı anlamda İngilizce ve Türkçe cümle çiftleri (kendi alanınızdan 20–50 çift seçin)
    ("Your order has been shipped.", "Siparişiniz kargoya verildi."),
    ("We could not save your changes because the connection was lost.",
     "Bağlantı koptuğu için değişikliklerinizi kaydedemedik."),
    ("Please enter your phone number.", "Telefon numaranızı yazın."),
    ("Your payment was received and your invoice is ready.", "Ödemeniz alındı, faturanız hazır."),
    ("You can return the product within 14 days.", "Ürünü 14 gün içinde iade edebilirsiniz."),
]


def measure(count_tokens, pairs=PAIRS):
    """Belirteçleyiciden bağımsız ölçüm: cümle başına TR/EN oranı ve Türkçe karakter/belirteç."""
    ratios = [count_tokens(tr) / count_tokens(en) for en, tr in pairs]
    chars_per_token = sum(len(tr) for _, tr in pairs) / sum(count_tokens(tr) for _, tr in pairs)
    return statistics.median(ratios), min(ratios), max(ratios), chars_per_token


def merge(seq, pair, new):
    out, i = [], 0
    while i < len(seq):
        if i + 1 < len(seq) and (seq[i], seq[i + 1]) == pair:
            out.append(new)
            i += 2
        else:
            out.append(seq[i])
            i += 1
    return out


def train_bpe(text, rounds):  # bayt düzeyi BPE: en sık komşu bayt çiftini birleştir, yinele
    seq, merges = list(text.encode("utf-8")), []
    for new in range(256, 256 + rounds):
        pair = Counter(zip(seq, seq[1:])).most_common(1)[0][0]
        merges.append((pair, new))
        seq = merge(seq, pair, new)
    return merges


# Oyuncak "İngilizce ağırlıklı" belirteçleyici: sözlüğü yalnız İngilizce sözcüklerden öğreniyor
words = re.findall(r"[a-z]+", " ".join(en for en, _ in PAIRS).lower()) + "the of and to a in is it for on".split()
rng = random.Random(0)
merges = train_bpe(" ".join(rng.choice(words) for _ in range(1500)), rounds=200)


def count_tokens(text):
    seq = list(text.encode("utf-8"))
    for pair, new in merges:
        seq = merge(seq, pair, new)
    return len(seq)


median, low, high, cpt = measure(count_tokens)
print(f"TR/EN belirteç oranı: ortanca {median:.2f} (aralık {low:.2f}–{high:.2f}); Türkçe {cpt:.2f} karakter/belirteç")
assert median > 2
```

```cikti
TR/EN belirteç oranı: ortanca 2.79 (aralık 2.09–4.58); Türkçe 0.99 karakter/belirteç
```

Oyuncak abartılıdır ama mekanizma gerçektir: sözlük İngilizceden öğrenilince Türkçe sözcük birleşme bulamaz ve
iki baytlık `ç ğ ı ö ş ü` harfleri ayrı parçalara düşer. Gerçek belirteçleyicide aynı `measure` işlevine
`lambda t: len(tok(t, add_special_tokens=False)["input_ids"])` verilir (`tok = AutoTokenizer.from_pretrained(ad)`).
Aynı yöntemle 8 eş cümlede ölçüm (23 Kasım 2026; Hugging Face önbelleğindeki belirteçleyiciler, transformers
AutoTokenizer, özel belirteçsiz):

| Belirteçleyici | TR/EN ortanca (aralık) | Türkçe karakter/belirteç |
| --- | --- | --- |
| SmolLM2-135M-Instruct (İngilizce ağırlıklı) | 2,08 (1,42–2,33) | 1,88 |
| Qwen3-1.7B (çok dilli) | 1,52 (1,08–2,00) | 2,49 |
| multilingual-e5-base (XLM-R tabanlı gömme modeli) | 1,04 (0,75–1,29) | 3,82 |
| bert-base-turkish-128k-cased (Türkçe sözlüklü kodlayıcı) | 0,62 (0,50–0,70) | 5,35 |

Okuma: (1) Oran belirteçleyicinin eğitim verisine bağlıdır; Türkçe sözlüklü bir belirteçleyicide Türkçe İngilizceden
**ucuz** çıkabilir. (2) Cümleden cümleye aralık geniştir (1,08–2,00): tek paragraflık ölçümle bütçe yapmayın; ortanca
ile tahmin edin, en kötü değerle sınır koyun. (3) Bu oran doğrudan maliyet, gecikme ve bağlam bütçesi çarpanıdır;
parçalama (chunking) ve kesme sınırlarını karakterle değil belirteçle yapın ([maliyet ve gecikme](maliyet-ve-gecikme.md)).

## 2. Ek, harf ve kalıp hatalarını yakalamak

Model çıktısı kullanıcıya gidecekse ucuz bir denetçi en sık kusurları işaretler. Denetçi **uyarır, düzeltmez**:
kısaltmalar okunuşa göre ek alır ("TDK'ye"), bazı adlar kalın yazılıp ince ek alır ("Kemal'e"); liste hiçbir zaman
tam değildir.

```python calistir
import re

BACK, FRONT, ROUND = set("aıou"), set("eiöü"), set("oöuü")
PALATAL_L = {"kemal", "celal", "hilal", "bilal", "cemal"}  # kalın yazılıp ince ek alan adlar (liste eksiktir)
TERMS = ["İstanbul", "İzmir", "Iğdır", "Giriş", "Bilgi"]  # projenin sözlüğünden; büyük yazılışları denetlenir
LOWER, UPPER = "a-zçğıöşü", "A-ZÇĞİIÖŞÜ"


def lower_tr(text):
    return text.replace("İ", "i").replace("I", "ı").lower()


def upper_tr(text):
    return text.replace("i", "İ").replace("ı", "I").upper()


def suffix_problem(noun, suffix):
    vowels = [ch for ch in lower_tr(noun) if ch in BACK | FRONT]
    first = next((ch for ch in suffix if ch in BACK | FRONT), None)
    if not vowels or first is None or noun.isupper():  # kısaltma okunuşa bağlıdır: atla
        return False
    last = "e" if lower_tr(noun) in PALATAL_L else vowels[-1]
    if (last in BACK) != (first in BACK):
        return True
    return first in "ıiuü" and (last in ROUND) != (first in ROUND)  # dar ünlüde yuvarlaklık da uyar


def check(text):
    found = [f"ek uyumu: {noun}'{suffix}"
             for noun, suffix in re.findall(rf"\b([{UPPER}][{LOWER}]+)['’]([{LOWER}]+)", text)
             if suffix_problem(noun, suffix)]
    found += [f"sayıdan sonra çoğul: {m}" for m in re.findall(rf"\b\d+ [{LOWER}]+(?:ler|lar)\b", text)]
    found += [f"İngilizce kuralla büyütülmüş: {lower_tr(t).upper()}" for t in TERMS
              if lower_tr(t).upper() != upper_tr(t) and lower_tr(t).upper() in text]
    found += [f"sohbet kalıbı: {m}" for m in
              re.findall(r"Harika (?:bir )?soru|Umarım (?:bu )?yardımcı olur|Size nasıl yardımcı olabilirim", text)]
    low = lower_tr(text)
    if re.search(r"\b(sen|seni|sana|senin)\b", low) and re.search(r"\b(siz|sizi|size|sizin)\b", low):
        found.append("sen/siz karışık")
    return found


bad = ("Harika soru! Siparişiniz İzmir'a gönderildi, 3 paketler yarın ISTANBUL deposundan çıkacak. "
       "Sana kargo kodunu size e-postayla ilettik. Umarım bu yardımcı olur.")
good = ("Siparişiniz İzmir'e gönderildi; 3 paket yarın İSTANBUL deposundan çıkacak. Kargo kodunu e-postanıza "
        "gönderdik. Kemal'e, Ordu'nun, Ankara'ya ve TDK'ye biçimleri denetimden geçer.")
for finding in check(bad):
    print(finding)
assert check(good) == []
```

```cikti
ek uyumu: İzmir'a
sayıdan sonra çoğul: 3 paketler
İngilizce kuralla büyütülmüş: ISTANBUL
sohbet kalıbı: Harika soru
sohbet kalıbı: Umarım bu yardımcı olur
sen/siz karışık
```

Kullanım: denetçiyi değerlendirme koşusunda her çıktıya uygulayın ve bulgu oranını (bulgulu çıktı / bütün çıktı)
istem ya da model karşılaştırmasında ikinci ölçüt yapın. Arayüz sözlüğü için ayrı bir denetçi:
[arayüz dili](../97-turkce/arayuz-dili.md). En güvenli önlem yine eksiz kalıptır: model `{ad}'a` üretemiyorsa
denetçi de gerekmez.

## 3. Çeviri kokan ve sohbet botu kalıplı çıktı

Modeller Türkçeyi çoğunlukla İngilizce metinden öğrendikleri kalıplarla kurar. Arayüz metnindeki çeviri hataları
[arayüz dili](../97-turkce/arayuz-dili.md) notunda; model çıktısına özgü olanlar:

| Kalıp | Neden kokar | Doğrusu |
| --- | --- | --- |
| "Harika soru!", "Elbette!", "Kesinlikle!" | İngilizce sohbet nezaketinin çevirisi | Doğrudan yanıt |
| "Umarım bu yardımcı olur." | "Hope this helps" | Kapanış cümlesi yok ya da sonraki adım |
| "Bu ürün harika özelliklere sahip." | "has" → "sahip olmak" | "Bu ürünün … özelliği var." |
| "Rapor ekip tarafından hazırlandı." (gereksiz edilgen) | İngilizce edilgen | "Raporu ekip hazırladı." |
| "… olarak hizmet eder", "… rol oynar" | "serves as", "plays a role" | "… işini görür", doğrudan fiil |
| "Bir şekilde", "Bu, … anlamına gelir" | "somehow", "This means" | Çoğu zaman silinir |
| Her paragraf "Özetle," ile biter | İngilizce yazı şablonu | Gerekmiyorsa özet yok |
| Uzun, virgüllü, tek cümlelik paragraflar | İngilizce cümle yapısı | Kısa cümle; yüklem sonda |

İstemde yasak listesi yerine **olumlu talimat ve örnek** işe yarar: "Kısa, yetişkin tonda, siz hitabıyla yaz.
Cümleye doğrudan bilgiyle başla. Örnek yanıt: …" Örnek yanıtı bir insan yazar; model örneğin üslubunu kopyalar
([istem mühendisliği](istem-muhendisligi.md)).

## 4. Değerlendirmede Türkçe normalleştirme

Kısa yanıtlı görevde puanlayıcının anahtarı: NFC, tek tür kesme imi, **Türkçe kurallı** küçültme, uçtaki noktalama
ve tırnak. Özel ad soran görevde kesmeden sonraki ek de atılır. Serbest metinde yüzey benzerliği anlamı ölçmez:

```python calistir
import re
import unicodedata
from collections import Counter

APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "´": "'"})


def lower_tr(text):
    return text.replace("İ", "i").replace("I", "ı").lower()


def normalize(text):  # değerlendirme anahtarı: NFC, tek tür kesme, Türkçe küçültme, uçtaki noktalama
    text = lower_tr(unicodedata.normalize("NFC", text).translate(APOSTROPHES))
    return " ".join(re.sub(r"^[\s\"“”«»]+|[\s.!?…\"“”«»]+$", "", text).split())


def root(text):  # yalnız kısa yanıtlı (özel ad) sorularda: kesmeden sonraki eki at
    return normalize(text).split("'")[0]


cases = [  # (modelin yanıtı, beklenen, gerçekte doğru mu)
    ("İstanbul.", "İstanbul", True), ("ISPARTA", "Isparta", True), ("Ankara’da", "Ankara", True),
    ("“Kızılay”", "Kızılay", True), ("KIR", "kir", False), ("Çorum'dur", "Çorum", True),  # kır ≠ kir
]
for name, key in (("düz lower()", lambda s: s.strip().lower()), ("Türkçe normalleştirme", normalize),
                  ("+ özel ad eki", root)):
    right = sum((key(pred) == key(gold)) == truth for pred, gold, truth in cases)
    print(f"{name:22s} doğru karar {right}/{len(cases)}")


def chrf(hyp, ref, max_n=4):  # karakter n-gram F puanı (chrF benzeri; n = 1..4, eşit ağırlık)
    scores = []
    for n in range(1, max_n + 1):
        h = Counter(hyp[i:i + n] for i in range(len(hyp) - n + 1))
        r = Counter(ref[i:i + n] for i in range(len(ref) - n + 1))
        overlap = sum((h & r).values())
        p, rec = overlap / max(1, sum(h.values())), overlap / max(1, sum(r.values()))
        scores.append(0 if overlap == 0 else 2 * p * rec / (p + rec))
    return sum(scores) / max_n


def word_f1(hyp, ref):
    overlap = sum((Counter(hyp.split()) & Counter(ref.split())).values())
    return 0 if overlap == 0 else 2 * overlap / (len(hyp.split()) + len(ref.split()))


ref = "evlerimizden erken çıktık"
for hyp in ("evlerimizde erken çıktık", "evimizden erkenden çıktık", "evlerimizden erken çıkmadık", "eve geç girdik"):
    print(f"{hyp:28s} sözcük F1 {word_f1(hyp, ref):.2f}   karakter n-gram F {chrf(hyp, ref):.2f}")
```

```cikti
düz lower()            doğru karar 1/6
Türkçe normalleştirme  doğru karar 4/6
+ özel ad eki          doğru karar 6/6
evlerimizde erken çıktık     sözcük F1 0.67   karakter n-gram F 0.91
evimizden erkenden çıktık    sözcük F1 0.33   karakter n-gram F 0.82
evlerimizden erken çıkmadık  sözcük F1 0.67   karakter n-gram F 0.87
eve geç girdik               sözcük F1 0.00   karakter n-gram F 0.17
```

Okuma:

- Düz `lower()` hem doğru yanıtları kaçırıyor ("İstanbul." küçülünce "i" + birleşen nokta U+0307 olur) hem "KIR"ı "kir"le
  eşleştiriyor. Türkçe kurallı anahtar ikisini de düzeltir; ek toleransı yalnız özel ad soran görevde açılır.
- Normalleştirmeyi abartmayın: ı→i, ş→s katlaması **arama** anahtarıdır; puanlamada "kır" ile "kir"i birleştirir.
- Sözcük düzeyi ölçüler Türkçede tek ek farkını bütün sözcüğün kaybı sayar; karakter n-gram puanı kısmi hak verir.
  Ama olumsuz cümle ("çıkmadık") 0,87 alıyor: **yüzey benzerliği anlamı ölçmez.** Anlam için beklenen olgu denetimi
  ya da ölçütlü hakem ([değerlendirme](degerlendirme.md)).

## 5. İstem dili: ölçerek seçmek

Küçük modeller İngilizce talimatı bazen daha iyi izler; Türkçe talimat ise çıktının dilini ve üslubunu daha iyi
sabitler. Hangisinin sizin işinizde iyi olduğu tahminle bilinmez. Protokol:

1. Aynı görev kümesi (20–50 gerçek Türkçe girdi), iki istem: talimat Türkçe / talimat İngilizce. İkisinde de çıktı
   dili açıkça yazılır ("Yanıtı Türkçe yaz." / "Answer in Turkish.") ve örnek yanıtlar Türkçedir.
2. Aynı ayarlar: sıcaklık 0, aynı çıktı sınırı, aynı model sürümü.
3. Dört ölçüt: görev puanı; Türkçe denetçi bulgu oranı (yukarıda); Türkçe olmayan ya da karışık dilli çıktı oranı
   (kaba sezgi: [`ince_ayar/synth/langid.py`](../../ince-ayar/ince_ayar/synth/langid.py)); istem + çıktı belirteç sayısı.
4. Görev puanını **eşli** karşılaştırın; yalnız ayrışan örnekler bilgi taşır ([değerlendirme](degerlendirme.md)).
5. Karar sırası: görev puanı ayırt edilebiliyorsa iyi olanı; edilemiyorsa bulgu oranı düşük olanı; o da eşitse
   ucuz olanı. Kararı ve sayıları istemin yanına yazın; model değişince yeniden ölçün.

Havuzdaki şablonlar her istemi iki dilde tutar: `yz/yz/istem/sablonlar.py`; gerçek küçük model denemesinin bulguları:
[küçük modeller için istem](kucuk-modeller-icin-istem.md).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Fatura beklenenin iki katı | Türkçe metin İngilizce ağırlıklı belirteçleyicide parçalanıyor | Kendi metninizde oran ölçün; model seçimine katın |
| Uzun belge bağlama sığmadı, kesik yanıt | Bütçe karakterle ya da İngilizce oranla hesaplandı | Belirteçle hesap; en kötü oranla sınır |
| Çıktıda "İzmir'a", "Kemal'a" | Model ek uyumunu yazımdan tahmin ediyor | Eksiz kalıp; denetçi; okunuş alanı |
| Başlıklarda "ISTANBUL", "BILGI" | Modelin ya da kodun büyütmesi İngilizce kurallı | `upper_tr`; terim sözlüğüyle denetim |
| Değerlendirme %60, gözle bakınca çoğu doğru | Puanlayıcı Türkçe normalleştirmesiz | NFC + kesme + Türkçe küçültme; özel adda ek toleransı |
| İki model arasında anlamsız büyük fark | Biri "Ankara’da" (kıvrık kesme) yazıyor | Kesme imlerini teke indirin |
| Çıktı yer yer İngilizce, karışık | Talimat İngilizce, çıktı dili yazılmamış | Çıktı dilini açıkça yazın; dil denetimi |
| Metin doğru ama "çeviri gibi" | Sohbet kalıpları, edilgen, "sahip olmak" | Olumlu talimat + insan yazımı örnek |
| Normalleştirilmiş metin kullanıcıya gösterildi | Katlanmış anahtar görüntüye sızdı | Anahtar yalnız karşılaştırmada; özgün metin gösterilir |

## Denetim listesi

- [ ] Aday modellerin belirteçleyicisiyle kendi metninizde TR/EN oranı ve karakter/belirteç ölçüldü; tarihli yazıldı.
- [ ] Bağlam ve maliyet bütçesi belirteçle, en kötü oran düşünülerek hesaplandı.
- [ ] Kullanıcıya giden çıktıda denetçi çalışıyor; bulgu oranı izleniyor.
- [ ] Değişken içeren metinler eksiz kalıpla kuruluyor.
- [ ] Puanlayıcı NFC, kesme imi ve Türkçe kurallı küçültme uyguluyor; katlama yalnız arama anahtarında.
- [ ] Serbest metin yüzey benzerliğiyle değil olgu denetimiyle puanlanıyor.
- [ ] İstem dili iki dilde eşli karşılaştırmayla seçildi; karar ve sayılar kayıtlı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yanıtı Türkçe, siz hitabıyla, kısa cümlelerle yaz. Özel ada ek getirme; 'Alıcı: Ayşe' gibi eksiz
  yaz. Sayıdan sonra adı tekil yaz (3 paket). Büyük harfle yazacaksan Türkçe kuralla yaz (İSTANBUL). 'Harika soru',
  'Umarım yardımcı olur' gibi giriş ve kapanış cümleleri yazma." + insan yazımı bir örnek yanıt.
- **Modelin tipik hatası:** ek uyumunu yazımdan seçer ("İzmir'a"); sayıdan sonra çoğul yapar; değerlendirme kodunda
  `.lower()` kullanır; maliyeti sözcük ya da karakterle hesaplar; Türkçe ve İngilizce istemi farklı görev
  kümelerinde dener.
- **Çıktıda denetleyin:** denetçi bulguları; puanlayıcıda `lower()` ve `upper()` araması; bütçe hesabının belirteçle
  yapıldığı; istem karşılaştırmasının aynı örneklerde ve eşli olduğu.
- **Sorun:** "Bu sayı (maliyet, puan) Türkçe metinle mi ölçüldü, yoksa İngilizce varsayımla mı?"

## İlgili

- [Dil modeli nasıl çalışır](llm-nasil-calisir.md) — belirteç ölçüm tablosu (16 Kasım 2026) ve pratik sonuçları
- [Türkçe metin işleme](../97-turkce/turkce-metin-isleme.md) — normalleştirme, belirteçleme, modelin tipik hataları
- [Ekler ve ünlü uyumu](../97-turkce/ekler-ve-unlu-uyumu.md) · [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)
  · [Arayüz dili](../97-turkce/arayuz-dili.md)
- [Değerlendirme](degerlendirme.md) — puanlayıcılar, eşli karşılaştırma · [Maliyet ve gecikme](maliyet-ve-gecikme.md)
- [Küçük modeller için istem](kucuk-modeller-icin-istem.md) · [İstem şablonları](istem-sablonlari.md)
- Havuz: Türkçe metin yardımcıları [`kutuphane`](../../kutuphane/README.md); belirteçleyici eğitimi
  [`dil-modeli/docs/EGITIM_REHBERI.md`](../../dil-modeli/docs/EGITIM_REHBERI.md)
