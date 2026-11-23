---
baslik: Sentetik veri ve damıtma
ozet: Öğretmen modelle veri üretiminde lisans, çeşitlilik, süzgeç sırası, yinelenme ve değerlendirme sızıntısı; çıktıyla ve olasılıkla damıtma, ne zaman işe yaradığı; havuzdaki üretim hattına bağlı, çalışan örneklerle.
etiketler: [llm, sentetik-veri, damitma, ince-ayar, lisans, veri-kalitesi]
duzey: ileri
guncellik: 2026-11
---

# Sentetik veri ve damıtma

> Bu notu ne zaman okumalı: büyük bir modelle (öğretmen) küçük bir model (öğrenci) için eğitim verisi üretmeden
> önce; "büyük modelin işini küçük modele yaptıralım" kararında; üretilen veriyle eğitilen model değerlendirmede
> şüpheli derecede iyi çıktığında.

## Temel fikir

Sentetik veri, öğretmen modelin çıktısıdır; öğretmenin **bilgisini, hatasını, üslubunu ve lisansını** taşır. Üç
kural bütün işi belirler:

1. **Lisans önce:** üretilen verinin nasıl kullanılabileceğini öğretmenin lisansı ya da kullanım şartları belirler.
   Ticari kullanıma kapalı öğretmenin verisiyle ticari ürün eğitilmez.
2. **Çeşitlilik nicelikten önce:** aynı isteğin bin kez çalıştırılması bin örnek değil, bir örneğin bin
   yazılışıdır. Çeşitliliği tohum tasarımı (konu × durum × kişi ızgarası) sağlar, sıcaklık değil.
3. **Değerlendirme kümesi insan yazımıdır ve öğretmene hiç gösterilmez.** Üretilen veri değerlendirme örneklerine
   benziyorsa ölçüm şişer.

Damıtma (distillation) öğrenciye öğretmeni taklit ettirmektir: ya öğretmenin **çıktı metinleriyle** (sıradan ince
ayar; her öğretmen olur) ya da öğretmenin **olasılık dağılımlarıyla** (aynı belirteçleyiciyi paylaşan açık bir
öğretmen gerekir). Öğrenci öğretmeni geçmez; kazanç maliyet, hız ve yerelde çalışabilmektir.

## Karar tablosu

| Durum | Yol | Neden |
| --- | --- | --- |
| Gerçek veri var (anonimleştirilebilir) | Önce gerçek veri; sentetik yalnız eksik dilimleri doldurur | Gerçek dağılım en iyi öğretmendir |
| Gerçek veri yok, görev dar ve tanımlı (sınıflandırma, çıkarım) | Tohum ızgarası + öğretmen + süzgeç + insan örneklemi | En verimli kullanım |
| Büyük modelin işini ucuza yapmak (aynı görev, çok çağrı) | Çıktıyla damıtma: öğretmen yanıtlarıyla öğrenciye ince ayar | Öğretmen çıktısı hazır etiket |
| Aynı ailede büyük/küçük açık model var, aynı belirteçleyici | Olasılıkla damıtma (logit eşleme) | Yumuşak hedef daha çok bilgi taşır |
| Öğretmen kapalı API | Yalnız çıktıyla damıtma; şartlar çıktıyla model eğitmeyi kısıtlayabilir | Logit yok; hukuki koşul |
| Öğretmen lisansı ticari olmayan | Üretmeyin (ürün ticariyse) | Veri öğretmenin lisansını taşır |
| Değerlendirme kümesi de üretilecek | Yapmayın; en az 50–100 insan yazımı örnek | Öğretmenin hatasını ölçemezsiniz |
| Öğrenci kendi çıktısıyla tekrar tekrar eğitilecek | Her turda gerçek veri karıştırın; çeşitliliği ölçün | Kendi çıktısıyla beslenen model daralır |

## Lisans ve kayıt

Hukuki danışmanlık değildir; lisans metninin kendisini okuyun ([model seçimi → lisans türleri](model-secimi.md)).

| Öğretmen | Üretilen veri | Havuzdaki hattın davranışı |
| --- | --- | --- |
| Serbest lisans (Apache-2.0, MIT gibi) | Ticari kullanım çoğu zaman serbest; bildirim koşulları korunur | Sürer |
| Üreticinin koşullu lisansı | Çıktıyla başka model eğitme, ad/atıf, kullanıcı eşiği gibi koşullar olabilir | Uyarır: "lisans metnini okuyun" |
| Ticari olmayan (CC BY-NC gibi) | Ticari üründe kullanılamaz | **Durur**; yalnız açık onayla (ticari olmayan kullanım) sürer |
| Kapalı API | Sağlayıcının güncel kullanım şartları belirler (doğrulanmadı; metni okuyun) | Kapsam dışı |

Her satırın yanında **kaynak kaydı** tutulur: öğretmen kimliği ve lisansı, istem sürümü ve özeti, tohum kimliği,
sıcaklık, tarih. Havuzdaki hat bunu kendiliğinden yazar
([`synth/pipeline.py`](../../ince-ayar/ince_ayar/synth/pipeline.py), lisans denetimi
[`synth/license.py`](../../ince-ayar/ince_ayar/synth/license.py)). Kayıt olmadan, bir yıl sonra "bu veriyi ticari
modelde kullanabilir miyiz?" sorusu yanıtlanamaz.

## Çeşitlilik: tasarla ve ölç

Tohum dosyası çeşitliliğin kaynağıdır: konu listesi × durum (olağan, sınır, hatalı girdi, kızgın müşteri) × kişi ×
uzunluk. Sıcaklığı yükseltmek aynı fikrin farklı sözcüklerle yazılmasını sağlar, yeni fikir getirmez. Ölçün:

```python calistir
from itertools import combinations

FOLD = str.maketrans("çğıöşüâî", "cgiosuai")


def key(text):  # karşılaştırma anahtarı: Türkçe küçült, işaretleri at
    return text.replace("İ", "i").replace("I", "ı").lower().translate(FOLD)


def shingles(text, n=4):
    t = key(text)
    return {t[i:i + n] for i in range(len(t) - n + 1)}


def jaccard(a, b):
    return len(a & b) / len(a | b)


def report(name, rows):
    words = [key(r).split() for r in rows]
    bigrams = [tuple(w[i:i + 2]) for w in words for i in range(len(w) - 1)]
    pairs = list(combinations([shingles(r) for r in rows], 2))
    near = sum(jaccard(a, b) >= 0.5 for a, b in pairs)
    print(f"{name:26s} ayrık ikili oranı {len(set(bigrams)) / len(bigrams):.2f}, "
          f"ortalama benzerlik {sum(jaccard(a, b) for a, b in pairs) / len(pairs):.2f}, yakın çift {near}/{len(pairs)}")
    return near


tek_tohum = ["Kargom ne zaman gelir?", "Kargom ne zaman gelecek?", "Siparişim ne zaman gelir?",
             "Kargom ne zaman elime geçer?", "Paketim ne zaman gelir?", "Kargom hangi gün gelir?"]
izgara = ["İade ettiğim ürünün parası kartıma ne zaman geçer?", "Faturamı şirket adına kesebilir misiniz?",
          "Kurye adreste kimseyi bulamazsa ne oluyor?", "Hasarlı gelen kutuyu teslim almadan geri verebilir miyim?",
          "Taksit sayısını sipariş verdikten sonra değiştirebilir miyim?", "Hesabımı silersem siparişlerim ne olur?"]
assert report("tek tohum, sıcaklık düşük", tek_tohum) > report("konu × durum ızgarası", izgara)
```

```cikti
tek tohum, sıcaklık düşük  ayrık ikili oranı 0.58, ortalama benzerlik 0.34, yakın çift 4/15
konu × durum ızgarası      ayrık ikili oranı 1.00, ortalama benzerlik 0.03, yakın çift 0/15
```

Üç sayı izlenir: **ayrık n-gram oranı** (düşükse aynı kalıplar dönüyor), **yakın kopya oranı** (yüksekse veri
şişirilmiş), **konu kapsaması** (tohum ızgarasının her hücresinden kaç kabul edilmiş örnek var). Uzunluk dağılımı
da bakılır: öğretmenler aynı uzunlukta yanıt üretmeye eğilimlidir; öğrenci de her soruya aynı uzunlukta yanıt verir.

## Süzgeçler ve değerlendirme sızıntısı

Sıra: biçim → uzunluk → ret yanıtı → dil → **değerlendirme kümesiyle benzerlik** → kabul edilenlerle yinelenme →
(isteğe bağlı) kural ya da hakem kalitesi → insan örneklemi. Her ret bir nedenle sayılır; ret nedeni dağılımı istemi
düzeltmenin en hızlı yoludur:

```python calistir
import re
from collections import Counter

FOLD = str.maketrans("çğıöşüâî", "cgiosuai")
REFUSAL = re.compile(r"yapay zek[aâ] (dil )?modeli olarak|yardımcı olamam|as an ai", re.I)
ENGLISH = {"the", "and", "you", "your", "is", "are", "to", "of"}


def key(text):
    return " ".join(text.replace("İ", "i").replace("I", "ı").lower().translate(FOLD).split())


def shingles(text, n=5):
    t = key(text)
    return {t[i:i + n] for i in range(max(1, len(t) - n + 1))}


def similar(a, b, limit=0.6):
    sa, sb = shingles(a), shingles(b)
    return len(sa & sb) / len(sa | sb) >= limit


EVAL = ["İade ettiğim ürünün parası ne zaman hesabıma geçer?"]  # insan yazımı değerlendirme kümesi


def reason(row, accepted):
    question, answer = row
    if len(answer.split()) < 4:
        return "uzunluk"
    if REFUSAL.search(answer):
        return "ret_yaniti"
    words = re.findall(r"[a-zçğıöşü]+", answer.lower())
    if sum(w in ENGLISH for w in words) > 0.2 * len(words):
        return "dil"
    if any(similar(question, e) for e in EVAL):
        return "degerlendirme_sizintisi"
    if any(similar(question, q) for q, _ in accepted):
        return "yineleme"
    return None


candidates = [
    ("Kargom kaç günde gelir?", "Siparişler genellikle 2–4 iş gününde teslim edilir."),
    ("Kargom kaç günde gelir ki?", "Siparişler genelde 2–4 iş gününde teslim edilir."),
    ("İade ettiğim ürünün parası hesabıma ne zaman geçer?", "İade onaylandıktan sonra bankanıza göre birkaç iş günü sürer."),
    ("Faturamı nasıl indiririm?", "Tamam."),
    ("Şifremi unuttum.", "Bir yapay zeka modeli olarak hesabınıza erişemem."),
    ("Adresimi değiştirebilir miyim?", "You can change your address in the account settings."),
    ("Siparişimi iptal edebilir miyim?", "Kargoya verilmeden önce Siparişlerim sayfasından iptal edebilirsiniz."),
]
accepted, rejected = [], Counter()
for row in candidates:
    why = reason(row, accepted)
    if why:
        rejected[why] += 1
    else:
        accepted.append(row)
print(f"kabul {len(accepted)}/{len(candidates)}; ret nedenleri: {dict(rejected)}")
assert rejected["degerlendirme_sizintisi"] == 1 and len(accepted) == 2
```

```cikti
kabul 2/7; ret nedenleri: {'yineleme': 1, 'degerlendirme_sizintisi': 1, 'uzunluk': 1, 'ret_yaniti': 1, 'dil': 1}
```

Değerlendirme sızıntısı üç yoldan gelir: değerlendirme örneği tohum ya da az-örnek istemine konmuştur; öğretmen
herkese açık bir sınav kümesini ezberlemiştir; üretim, değerlendirmeyle aynı belgelerden yapılmıştır. Önlem: üretim
başlamadan değerlendirme kümesi dondurulur, her aday ona benzerlikle taranır (havuzda `[suzgec] mevcut_veri` ayarı;
gerçek hat yakın kopyayı MinHash + gerçek Jaccard ile bulur:
[`data/neardup.py`](../../ince-ayar/ince_ayar/data/neardup.py)) ve aynı kaynak belgeden gelenler aynı gruba konur.

İnsan örneklemi atlanmaz: kabul edilenlerden rastgele 50 satır okunur ve hata türleri sayılır (olgu hatası, üslup,
konu dışı). Olgu hatası oranı %5'i geçiyorsa daha çok üretmek değil istemi ya da öğretmeni değiştirmek gerekir;
öğrenci öğretmenin hatasını da öğrenir.

## Damıtma: çıktıyla ve olasılıkla

| Biçim | Ne öğretilir | Gereken | Not |
| --- | --- | --- | --- |
| Çıktıyla (sequence-level) | Öğretmenin yanıt metinleri, sıradan ince ayar verisi gibi | Yalnız öğretmen çıktısı | Her öğretmenle olur; havuzda `sohbet uret` + `sohbet egit` |
| Olasılıkla (logit eşleme) | Her konumda öğretmenin bütün olasılık dağılımı | Açık öğretmen, **aynı belirteçleyici**, iki model birden bellekte | Daha çok bilgi; havuz örneği `tasks/chat/distill.py` |
| Üretimli (on-policy) | Öğrencinin kendi ürettiği metinde öğretmen dağılımı | Daha karmaşık eğitim döngüsü | Havuzda denenmedi |

Olasılıkla damıtmanın fazladan taşıdığı bilgi: öğretmen yalnız doğru yanıtı değil, **hangi yanlışın doğruya
yakın** olduğunu da söyler. Sıcaklık (T) bu yakınlıkları görünür kılar; kayıp `T² · KL(öğretmen_T ‖ öğrenci_T)`'dir:

```python calistir
import math


def softmax(logits, t=1.0):
    top = max(logits)
    exps = [math.exp((z - top) / t) for z in logits]
    return [e / sum(exps) for e in exps]


def distill_loss(teacher, student, t):  # T² · KL(öğretmen_T ‖ öğrenci_T)
    p, q = softmax(teacher, t), softmax(student, t)
    return t * t * sum(pi * math.log(pi / qi) for pi, qi in zip(p, q))


LABELS = ["iade", "kargo", "bilgi", "diger"]
teacher = [4.0, 3.2, 0.5, -1.0]  # "iade" ama "kargo"ya yakın: sınır durumu
for t in (1, 4):
    print(f"T={t}: öğretmen " + ", ".join(f"{a} {p:.2f}" for a, p in zip(LABELS, softmax(teacher, t))))
students = {"A (kargo yakınlığını da öğrenmiş)": [3.0, 2.4, 0.3, -0.8], "B (yalnız doğru etiketi)": [3.0, -1.0, 0.3, 0.2]}
for name, logits in students.items():
    top = LABELS[logits.index(max(logits))]
    print(f"öğrenci {name}: tahmin {top}, damıtma kaybı T=4 → {distill_loss(teacher, logits, 4):.2f}")
```

```cikti
T=1: öğretmen iade 0.67, kargo 0.30, bilgi 0.02, diger 0.00
T=4: öğretmen iade 0.40, kargo 0.32, bilgi 0.17, diger 0.11
öğrenci A (kargo yakınlığını da öğrenmiş): tahmin iade, damıtma kaybı T=4 → 0.09
öğrenci B (yalnız doğru etiketi): tahmin iade, damıtma kaybı T=4 → 1.66
```

İki öğrenci de "iade" diyor; doğru etiketle eğitim ikisini aynı sayar. Damıtma kaybı B'yi cezalandırır, çünkü B
öğretmenin "bu ileti kargo konusuna da yakın" bilgisini kaybetmiş. Bu bilgi her belirteç konumunda vardır; sözlükler
aynı değilse konumlar eşlenemez, bu yüzden havuzdaki örnek önce sözlük eşitliğini denetler
([`tasks/chat/distill.py`](../../ince-ayar/ince_ayar/tasks/chat/distill.py), katalogdaki eş: Qwen3-1.7B → Qwen3-0.6B).

## Havuzdaki hat: adımlar

1. Öğretmeni katalogdan seçin (`gorev` içinde `ogretmen`, `ticari: evet`) ve yerelde çalıştırın
   ([`ince-ayar/AGENTS.md`](../../ince-ayar/AGENTS.md) tarif 7).
2. Tohum dosyasını ızgara olarak hazırlayın (`ornekler/tohumlar.jsonl` biçimi); değerlendirme kümesini
   `[suzgec] mevcut_veri` ile verin ([`yapilandirma/uret/talimat.toml`](../../ince-ayar/yapilandirma/uret/talimat.toml)).
3. `python -m ince_ayar sohbet uret --ayar … --kuru` (istemi görün) → `--sinir 2` (iki tohumla deneme) → tam koşu;
   yarıda kalırsa `--devam`.
4. `*.reddedilen.jsonl`'daki ret nedenlerini sayın; en büyük nedeni istemde düzeltin; istemi yeni sürüm adıyla kaydedin.
5. Çeşitlilik ölçülerini ve 50 satırlık insan okumasını kayda geçirin; sonra `grup` alanıyla sızıntısız ayırıp eğitin.
6. Öğrenciyi **insan yazımı** değerlendirme kümesinde öğretmenle yan yana ölçün ([değerlendirme](degerlendirme.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Öğrenci değerlendirmede öğretmenden iyi | Değerlendirme kümesi sızmış ya da öğretmen hatası ölçülemiyor | Değerlendirme insan yazımı; benzerlik taraması |
| Binlerce örnek üretildi, öğrenci her soruya aynı kalıpla yanıt veriyor | Tek tohum, düşük çeşitlilik | Konu × durum ızgarası; ayrık n-gram ve yakın kopya ölçümü |
| Verinin ticari kullanılıp kullanılamayacağı bilinmiyor | Kaynak kaydı yok | Satır başına öğretmen, lisans, istem sürümü, tarih |
| Öğrencinin yanıtlarında "Bir yapay zekâ modeli olarak…" | Ret ve kaçamak yanıtlar süzülmedi | Ret süzgeci; ret nedenlerini sayın |
| Öğrenci kendinden emin yanlış bilgi veriyor | Öğretmenin olgu hataları veriye girdi | İnsan örneklemiyle olgu hatası oranı; istem ya da öğretmen değişikliği |
| Olasılıkla damıtma başlamadan hata | Öğretmen ve öğrenci sözlükleri farklı | Aynı aileden eş seçin ya da çıktıyla damıtın |
| Her turda öğrencinin kendi çıktısıyla eğitim, çeşitlilik eriyor | Kendini besleyen döngü | Her turda gerçek veri karıştırın; çeşitlilik ölçün |
| Uzun yanıtlar kırpılıp eğitimde yarım kaldı | Azami uzunluk kısa | Uzun örneği atın, kırpmayın (havuz kuralı) |

## Denetim listesi

- [ ] Öğretmenin lisansı/şartları okundu; ticari kullanım durumu yazıldı; hat lisans denetiminden geçti.
- [ ] Değerlendirme kümesi insan yazımı, üretimden önce donduruldu ve öğretmene gösterilmedi.
- [ ] Tohumlar konu × durum ızgarası; her hücrede kabul edilmiş örnek sayısı raporlandı.
- [ ] Ayrık n-gram oranı, yakın kopya oranı ve uzunluk dağılımı ölçüldü.
- [ ] Ret nedenleri sayıldı; değerlendirme kümesine benzeyen adaylar atıldı.
- [ ] Kabul edilenlerden rastgele 50 satır insan tarafından okundu; olgu hatası oranı yazıldı.
- [ ] Her satırda kaynak kaydı (öğretmen, lisans, istem sürümü ve özeti, tohum, tarih) var.
- [ ] Öğrenci, öğretmenle aynı insan yazımı değerlendirme kümesinde karşılaştırıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sentetik veriyi `python -m ince_ayar sohbet uret` hattıyla üret; elle örnek uydurma. Tohum
  dosyasını konu × durum ızgarası olarak kur. Değerlendirme kümesini `mevcut_veri`ye ver. Koşudan sonra ret
  nedenlerini, ayrık n-gram oranını ve yakın kopya oranını tablo olarak yaz; 50 rastgele satırı bana göster."
- **Modelin tipik hatası:** eğitim verisini kendisi yazmaya başlar (hem kalite hem lisans sorunu); değerlendirme
  örneklerini az-örnek isteme koyar; sıcaklığı yükseltip çeşitlilik sağladığını sanar; lisansı model kartının
  etiketinden okuyup koşulları atlar; öğrenciyi öğretmenin ürettiği değerlendirme kümesinde ölçer.
- **Çıktıda denetleyin:** satırlarda kaynak kaydı var mı; değerlendirme kümesiyle benzerlik taraması yapılmış mı;
  ret nedeni dağılımı; insan okuması notları.
- **Sorun:** "Bu verinin hatasını kim ölçtü? Değerlendirme kümesi öğretmenin hiç görmediği bir yerden mi geliyor?"

## İlgili

- [İnce ayar kararı](ince-ayar-karari.md) — ince ayar ne çözer, veri miktarı, LoRA
- [Model seçimi](model-secimi.md) — lisans türleri ve kayıt · [Değerlendirme](degerlendirme.md) — görev kümesi
- [Dil modeliyle veri etiketleme](llm-ile-veri-etiketleme.md) — öğretmeni etiketçi olarak kullanmak
- [Veri sızıntısı](../80-ml/veri-sizintisi.md) · [Etiketleme ve aktif öğrenme](../80-ml/etiketleme-ve-aktif-ogrenme.md)
- Havuz: üretim hattı [`synth/`](../../ince-ayar/ince_ayar/synth/pipeline.py) (süzgeçler:
  [`filters.py`](../../ince-ayar/ince_ayar/synth/filters.py)), damıtma örneği
  [`distill.py`](../../ince-ayar/ince_ayar/tasks/chat/distill.py), ne zaman ince ayar:
  [`NE_ZAMAN_INCE_AYAR.md`](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md)
