---
baslik: Metin sınıflandırma
ozet: Kuraldan TF-IDF + doğrusal modele, gömme + doğrusal modele ve ince ayara uzanan yol haritası; her adıma geçiş ölçütü, Türkçe belirteçleme, etiket tasarımı, hata analizi ve "emin değilim" sınıfı.
etiketler: [makine-ogrenmesi, metin, siniflandirma, turkce, tf-idf, guven-esigi]
duzey: orta
guncellik: 2026-11
---

# Metin sınıflandırma

> Bu notu ne zaman okumalı: destek talebi, yorum, e-posta gibi metinleri türe/konuya/önceliğe ayıran bir sistem
> kurarken; hangi yöntemle başlanacağına ve ne zaman bir sonrakine geçileceğine karar verirken.

## Temel fikir

Metin sınıflandırmada en pahalı hata, gereğinden ağır yöntemle başlamaktır. Basamaklar ucuzdan pahalıya
dizilir; bir sonrakine yalnız **ölçülmüş bir gerekçeyle** geçilir:

1. **Kural / anahtar sözcük** → 2. **TF-IDF + doğrusal model** → 3. **Gömme + doğrusal model** →
4. **İnce ayarlı kodlayıcı**. Yanında: etiket yokken **dil modeliyle sıfır atış** (`85-llm` kümesi).

Her basamakta aynı değerlendirme kümesi, aynı ölçüt (çoğu zaman makro F1) ve aynı "emin değilim" kuralı kullanılır.
Türkçe'de iki kural baştan uygulanır: **Türkçe kurallı küçük harf** ve **eklere dayanıklı belirteçleme**.

## Yol haritası ve geçiş ölçütleri

| Basamak | Ne zaman yeterli | Bir sonrakine geçiş ölçütü | Maliyet |
| --- | --- | --- | --- |
| Kural / anahtar sözcük | Az sınıf, net sözcükler ("iade", "fatura"), etiket yok | Kural kapsaması düşük ya da bakım yükü büyüyor; hata analizinde eş anlamlı/bağlam hataları | Sıfır eğitim; açıklanır |
| TF-IDF + lojistik / Naive Bayes | Sınıf başına ~50–100+ örnek | Öğrenme eğrisi düzleşti ve hatalar anlamsal (aynı anlam, farklı sözcük) | Saniyelik eğitim, CPU, milisaniyelik tahmin |
| Gömme + doğrusal model | Anlamsal benzerlik gerekiyor, etiket az | Daha yüksek başarı gerekiyor ve binlerce etiket var | Gömme modeli çalıştırmak gerekir |
| İnce ayarlı kodlayıcı | Binlerce etiket, yüksek başarı hedefi | — | GPU ile eğitim; ONNX ile CPU'da hızlı tahmin |
| Dil modeliyle sıfır/az atış | Etiket yok, sınıflar sık değişiyor, hacim düşük | Hacim arttı, maliyet/gecikme sorun | Çağrı başına maliyet ve gecikme |

Her geçişte soru aynıdır: **"Hata analizinde gördüğüm hata türünü bir sonraki basamak çözer mi?"** Sorun etiket
tutarsızlığıysa hiçbir basamak çözmez ([veri ve etiket](veri-ve-etiket.md)).

## Türkçe belirteçleme

Türkçe sondan eklemelidir: "fatura", "faturamı", "faturanın", "faturası" kelime düzeyinde dört ayrı belirteçtir.
Karakter n-gramları (sözcük sınırlarıyla) bu biçimleri birbirine yaklaştırır:

```python calistir
import re


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def words(text):
    return set(re.findall(r"\w+", lower_tr(text)))


def char_ngrams(text, n=3):
    grams = set()
    for word in re.findall(r"\w+", lower_tr(text)):
        padded = f" {word} "
        grams |= {padded[i:i + n] for i in range(len(padded) - n + 1)}
    return grams


jaccard = lambda a, b: len(a & b) / len(a | b)
pairs = [("faturamı ödeyemedim", "fatura ödemesi"), ("İADE talebim", "iade talebi"), ("kargom gelmedi", "KARGO GELMEDİ")]
for a, b in pairs:
    print(f"{a:20s} ~ {b:15s} kelime {jaccard(words(a), words(b)):.2f}   karakter-3 {jaccard(char_ngrams(a), char_ngrams(b)):.2f}")
assert "İADE".lower() != "iade" and lower_tr("İADE") == "iade"  # düz lower() Türkçe'de yanlış
```

```cikti
faturamı ödeyemedim  ~ fatura ödemesi  kelime 0.00   karakter-3 0.35
İADE talebim         ~ iade talebi     kelime 0.33   karakter-3 0.75
kargom gelmedi       ~ KARGO GELMEDİ   kelime 0.33   karakter-3 0.79
```

| Türkçe sorunu | Belirti | Çözüm |
| --- | --- | --- |
| Büyük/küçük harf: "İADE".lower() ≠ "iade" | Aynı sözcük iki belirteç | Türkçe kurallı küçültme ([not](../97-turkce/buyuk-kucuk-harf.md)) |
| Ekler | Seyrek, dağınık sözcük sayıları | Karakter n-gram (`char_wb`, 2–5) ya da sözcük kırpma (ilk 5 harf) |
| Kesme işareti: "İstanbul'da" | Özel adın ekli hâli ayrı belirteç | Kesmeden sonrasını atın ya da karakter n-gram |
| ASCII yazım: "cok guzel", "iade istiyorum" yerine "ıade" | Klavyeye göre aynı sözcük farklı yazılıyor | Katlama (ç→c, ı→i …) ile ikinci bir belirteç kümesi |
| Yazım hataları, kısaltmalar ("tşk", "slm") | Sözlük dışı belirteçler | Karakter n-gram; gerekirse kısaltma sözlüğü |
| Olumsuzluk: "beğenmedim", "iyi değil" | Durak sözcük listesi "değil"i atar, anlam tersine döner | Duygu/şikâyet işlerinde olumsuzluk sözcüklerini atmayın; ek "-me/-ma" karakter n-gramla yakalanır |

## Küçük bir sınıflandırıcı ve "emin değilim" sınıfı

Karakter 3-gramlı çok terimli Naive Bayes; en yüksek olasılık eşiğin altındaysa karar **belirsiz** olur ve insana
gider. (Aşağıdaki birkaç satır yalnız gösterim için yazılmış örnek veridir.)

```python calistir
import math
import re
from collections import Counter

TRAIN = {
    "kargo": ["kargom hâlâ gelmedi", "kargo takip numarası çalışmıyor", "paket yanlış adrese gitti", "teslimat gecikti"],
    "iade": ["ürünü iade etmek istiyorum", "iade talebim onaylanmadı", "para iadem yatmadı", "ürün kusurlu iade"],
    "fatura": ["faturamı göremiyorum", "fatura adresi yanlış", "faturada fazla ücret var", "e-fatura gelmedi"],
}
lower_tr = lambda t: t.replace("İ", "i").replace("I", "ı").lower()


def grams(text):
    out = []
    for word in re.findall(r"\w+", lower_tr(text)):
        padded = f" {word} "
        out += [padded[i:i + 3] for i in range(len(padded) - 2)]
    return out


counts = {label: Counter(g for text in texts for g in grams(text)) for label, texts in TRAIN.items()}
vocab = set().union(*counts.values())


def probabilities(text):
    logs = {}
    for label, c in counts.items():
        total = sum(c.values())
        logs[label] = sum(math.log((c[g] + 1) / (total + len(vocab))) for g in grams(text) if g in vocab)
    top = max(logs.values())
    exps = {label: math.exp(v - top) for label, v in logs.items()}
    return {label: e / sum(exps.values()) for label, e in exps.items()}


THRESHOLD = 0.8
for text in ("Kargom nerede, teslimat çok gecikti", "İADE ettiğim ürünün parası", "faturamda hata var", "merhaba iyi günler"):
    probs = probabilities(text)
    label = max(probs, key=probs.get)
    decision = label if probs[label] >= THRESHOLD else "belirsiz → insana"
    print(f"{text:36s} {label:6s} {probs[label]:.2f}  karar: {decision}")
```

```cikti
Kargom nerede, teslimat çok gecikti  kargo  1.00  karar: kargo
İADE ettiğim ürünün parası           iade   1.00  karar: iade
faturamda hata var                   fatura 1.00  karar: fatura
merhaba iyi günler                   kargo  0.33  karar: belirsiz → insana
```

"İADE" büyük harfle yazılmış olsa da doğru sınıfa gidiyor; konu dışı ileti "belirsiz" oluyor. Naive Bayes
olasılıkları aşırı emin olmaya yatkındır; eşik değeri doğrulama kümesinde seçilmeli, gerekirse olasılıklar kalibre
edilmelidir ([kalibrasyon](kalibrasyon-ve-olasilik.md)).

## Güven eşiği: kapsama ↔ doğruluk

Eşik yükseldikçe model daha az iletiye karar verir (kapsama düşer) ama verdiği kararlar daha isabetli olur. Eşik,
**hedef doğruluk** ya da **insanın işleyebileceği hacim** üzerinden doğrulama kümesinde seçilir:

```python calistir
import random

random.seed(35)
predictions = []
for _ in range(3000):
    confidence = 0.34 + 0.66 * random.random() ** 0.35  # 3 sınıflı modelin en yüksek olasılığı; 1'e yığılır
    predictions.append((confidence, random.random() < confidence))  # kalibre: güven ≈ doğru olma olasılığı
TARGET = 0.95
chosen = None
for threshold in (0.5, 0.6, 0.7, 0.8, 0.9):
    answered = [ok for conf, ok in predictions if conf >= threshold]
    accuracy = sum(answered) / len(answered)
    coverage = len(answered) / len(predictions)
    print(f"eşik {threshold:.1f}: kapsama %{coverage * 100:.0f}, yanıtlananlarda doğruluk %{accuracy * 100:.1f}")
    if chosen is None and accuracy >= TARGET:
        chosen = threshold
print(f"%{TARGET * 100:.0f} doğruluk için en düşük eşik: {chosen}")
```

```cikti
eşik 0.5: kapsama %98, yanıtlananlarda doğruluk %83.4
eşik 0.6: kapsama %93, yanıtlananlarda doğruluk %84.8
eşik 0.7: kapsama %82, yanıtlananlarda doğruluk %87.4
eşik 0.8: kapsama %64, yanıtlananlarda doğruluk %91.6
eşik 0.9: kapsama %38, yanıtlananlarda doğruluk %95.1
%95 doğruluk için en düşük eşik: 0.9
```

Kuralı işin diliyle yazın: "Model iletilerin yaklaşık %X'ini %95 doğrulukla otomatik yönlendirir; kalanı temsilci
kuyruğuna düşer." (Bu benzetimde X = 38: hedef doğruluk yükseldikçe insana kalan iş büyür.) Eşik doğrulamada seçilir, sınamada bir kez raporlanır.

## Etiket tasarımı

- **Tek etiket mi, çok etiket mi?** Bir ileti hem "iade" hem "kargo" olabiliyorsa çok etiketli kurgu (her sınıf ayrı
  evet/hayır) gerekir; tek etiket zorlanırsa etiketçiler tutarsızlaşır.
- **"Diğer" sınıfı** ve **"emin değilim"** ayrı şeylerdir: "diğer" bilinen ama listede olmayan konular için bir
  etikettir; "emin değilim" modelin kararıdır.
- **Sınıf sayısı:** az örnekli sınıfları birleştirin; sonra veri birikince ayırın. Karışan sınıf çiftleri (karışıklık
  matrisinde) çoğu zaman tanım sorunudur.
- **Hiyerarşi:** "ödeme > iade > kısmi iade" gibi; önce üst düzeyde iyi çalışın.
- **Kılavuz:** her sınıfa tanım + 3 örnek + sınır durumları; iki kişinin uyuşmasını ölçün.

## Hata analizi

1. Doğrulama hatalarından 50–100 tanesini rastgele seçin; her birine kısa bir not yazın.
2. Notları türlere ayırın: etiket yanlış, sınıf tanımı belirsiz, eş anlamlı sözcük, yazım hatası/ASCII, iki konu
   birden, bağlam gerekiyor, konu dışı.
3. Her türün payını sayın; en büyük ve düzeltilebilir türe çare seçin (etiket temizliği, katlama, karakter n-gram,
   sınıf birleştirme, gömme, ince ayar).
4. Modelin çok emin olduğu ama etiketle çeliştiği örnekler çoğu zaman **etiket hatasıdır**.

Ayrıntılı yöntem: [hata analizi](hata-analizi.md).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "İADE" ile "iade" farklı sınıflanıyor | Düz `lower()` | Türkçe kurallı küçültme |
| Doğruluk yüksek, az sınıflar hiç tutturulmuyor | Dengesizlik; ölçüt doğruluk | Makro F1; sınıf ağırlığı; az sınıfa veri |
| "Beğenmedim" olumlu sınıflandı | Durak sözcük ya da kök kırpma olumsuzluğu sildi | Olumsuzluk sözcüklerini koruyun; karakter n-gram |
| Eğitimde iyi, canlıda kötü | Canlı metin farklı (ASCII, kısaltma, emoji) | Canlıdan örnek ekleyin; katlama |
| Aynı ileti hem eğitimde hem sınamada | Yinelenen/şablon iletiler | Yakın yineleme taramasıyla gruplu ayrım |
| Yeni bir konu çıktı, model eskilerden birine zorla atıyor | "Diğer" sınıfı ve güven eşiği yok | Eşik + "belirsiz" kuyruğu; yeni konuyu izleyin |
| İnce ayar TF-IDF'i geçemedi | Az veri ya da etiket gürültüsü | Önce etiket kalitesi ve öğrenme eğrisi |
| Sözlük boyutu yüzbinler, bellek doldu | Karakter n-gram aralığı geniş, sınırsız sözlük | `max_features`, en az belge sıklığı, karma (hashing) vektörleyici |

## Denetim listesi

- [ ] Küçültme Türkçe kurallı; "İADE", "iade", "İade'yi" aynı belirtece iniyor (test).
- [ ] Kelime ve karakter n-gram belirteçlemesi aynı katlarla karşılaştırıldı.
- [ ] Ölçüt makro F1; sınıf başına kesinlik/duyarlılık ve karışıklık matrisi raporlandı.
- [ ] Güven eşiği doğrulamada hedef doğruluk ya da kapsama ile seçildi; "belirsiz" kuyruğu tanımlı.
- [ ] Yinelenen ve şablon iletiler ayrımda aynı tarafta.
- [ ] Olumsuzluk sözcükleri durak listesinden çıkarıldı.
- [ ] Bir sonraki basamağa geçiş hata analizine dayanan yazılı bir gerekçeyle yapıldı.
- [ ] Canlı metinden (ASCII yazım, kısaltma) örnekler değerlendirme kümesinde var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce TF-IDF + LogisticRegression kur; iki belirteçleme dene: kelime (1–2 gram) ve
  `char_wb` (2–5 gram). Küçültme için projedeki `lower_tr` yardımcısını kullan. Katmanlı 5 katlı CV ile makro F1
  karşılaştır. Güven eşiğini doğrulamada %95 doğruluk hedefiyle seç ve kapsamayı raporla."
- **Modelin tipik hatası:** Doğrudan büyük bir transformer'a ince ayar önerir; `str.lower()` kullanır; İngilizce
  durak sözcük listesi ya da İngilizce kök bulucu uygular; doğruluğu tek ölçüt sayar; eşiği 0,5'te bırakır.
- **Çıktıda denetleyin:** `.lower()` çağrıları; vektörleyicinin `Pipeline` içinde olması; makro F1 ve sınıf başına
  rapor; "belirsiz" oranı; hata örneklerinden bir tablo.

## İlgili

- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) · [Kalibrasyon](kalibrasyon-ve-olasilik.md) ·
  [Gömmeler ve benzerlik](gommeler-ve-benzerlik.md) · [Hata analizi](hata-analizi.md)
- TF-IDF + lojistik, kelime ↔ karakter n-gram karşılaştırması: [`ml-temel/ornekler/04_turkce_metin.py`](../../ml-temel/ornekler/04_turkce_metin.py);
  Türkçe belirteçleme: [`ml_temel/onisleme/text.py`](../../ml-temel/ml_temel/onisleme/text.py), vektörleyiciler:
  [`vectorizers.py`](../../ml-temel/ml_temel/onisleme/vectorizers.py)
- İnce ayarlı sınıflandırıcı, eşik ve güven eşiğiyle kapsama: [`ince_ayar/tasks/classification/thresholds.py`](../../ince-ayar/ince_ayar/tasks/classification/thresholds.py),
  [`evaluate.py`](../../ince-ayar/ince_ayar/tasks/classification/evaluate.py); ne zaman ince ayar:
  [`ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md`](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md)
- Türkçe durak sözcükler (olumsuzluk notuyla): [`veri/tr/durak_sozcukler.meta.json`](../../veri/tr/durak_sozcukler.meta.json)
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md); dil modeliyle sınıflandırma:
  [İstem mühendisliği](../85-llm/istem-muhendisligi.md), [Yapılı çıktı](../85-llm/yapili-cikti.md)
