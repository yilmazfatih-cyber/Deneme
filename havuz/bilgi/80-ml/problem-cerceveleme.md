---
baslik: Makine öğrenmesi problemini çerçeveleme
ozet: ML gerekli mi kararı, hedefin ve tahmin biriminin tanımı, taban çizgisi, başarı ölçütünü işe bağlama ve yanlış hedef seçme tuzakları.
etiketler: [makine-ogrenmesi, cerceveleme, taban-cizgisi, hedef-tanimi, olcut]
duzey: temel
guncellik: 2026-11
---

# Makine öğrenmesi problemini çerçeveleme

> Bu notu ne zaman okumalı: "Bunu yapay zekâyla tahmin edelim" fikri geldiğinde, veri toplamadan ve model
> seçmeden önce; ya da ölçümde iyi görünen bir model işte hiçbir şeyi değiştirmediğinde.

## Temel fikir

Makine öğrenmesi (machine learning, ML) bir karar aracıdır. Çıktısı bir eylemi değiştirmiyorsa model
gereksizdir. Çerçeveleme, soruyu şu tek cümleye indirmektir:

> "Her **[birim]** için, **[tahmin anında]** elde olan bilgiyle, **[ufuk]** içinde **[hedef olay]** olacak mı /
> ne kadar olacak? Bu tahmine göre **[kim]**, **[hangi eylemi]** yapacak?"

Bu cümlenin her boşluğu dolmadan veri toplanmaz, model seçilmez. Projelerin çoğu modelde değil bu cümlede
batar: yanlış birim, geç tahmin anı, vekil hedef, eylemsiz çıktı.

Hep ilk iş **taban çizgisidir** (baseline): veriye bakmadan ya da tek bir kuralla yapılan tahmin. Model tabanı
anlamlı bir farkla geçmiyorsa iş ya biter ya da hedef değişir.

## Karar tablosu: kural mı, istatistik mi, ML mi?

| Durum | Seçim | Neden |
| --- | --- | --- |
| Karar birkaç cümlelik kuralla yazılabiliyor (yaş ≥ 18, tutar > limit) | Kural (kod) | Veri gerekmez, açıklanır, hatası bulunur |
| Soru "ne oldu, neden, fark var mı?" | İstatistik ve analiz (SQL, güven aralığı, A/B testi) | Tahmin değil açıklama isteniyor |
| Çok değişkenli örüntü, bol etiketli örnek, sık karar (günde yüzlerce) | ML | Kural yazılamaz, örnekten öğrenilir, kazanç her gün tekrarlanır |
| Karar yılda birkaç kez veriliyor | Analiz + insan | Model kurma ve bakım maliyeti kazancı aşar |
| Etiket yok, olay sayısı birkaç on | Önce kayıt başlat; kural + insan | Öğrenecek ve ölçecek sinyal yok |
| Hata pahalı, gerekçe zorunlu (kredi, sağlık, işe alım) | Basit, yorumlanabilir model + insan onayı | Hesap verebilirlik; model kartı notuna bakın |
| Metin ya da görüntü anlama, etiket az | Hazır model ya da dil modeli (`85-llm` kümesi), sonra ince ayar | Sıfırdan eğitmek için veri yetmez |
| Kural var ama istisnası çok | Önce kural, kalan belirsiz vakalara ML | Kural güvenilir kısmı taşır, model yükü küçülür |

Kural: **önce kural ve taban çizgisi.** ML'ye geçişin gerekçesi "kuralı şu kadar geçiyor" diye sayıyla yazılır.

## Çerçeveleme adımları

1. **Kararı ve eylemi yazın.** Çıktıyı kim, ne zaman, nasıl kullanacak? "Riskli müşteriyi ara" bir eylemdir;
   "kayıp olasılığını görelim" eylem değildir.
2. **Birimi seçin** (unit of prediction): bir satır neyi temsil eder? Müşteri, müşteri-ay, sipariş, oturum,
   mağaza-gün. Hedef ve özellikler aynı birimde olmalı. Aynı müşterinin birçok satırı varsa ayrım gruplu
   yapılır ([ayrım notu](ayrim-ve-capraz-dogrulama.md)).
3. **Tahmin anını ve ufku sabitleyin.** "Her ayın 1'inde, sonraki 30 gün içinde iptal edecek mi?" Özellikler
   yalnız tahmin anından **önceki** bilgiden üretilir. Bu tek cümle sızıntının yarısını baştan önler.
4. **Hedefi tam tanımlayın.** Ölçülebilir, zamanında oluşan, eyleme yakın olsun. "İptal" ne demek: iptal
   düğmesi mi, ödemenin kesilmesi mi, 60 gün hareketsizlik mi? Tanımı yazıya dökün; kodla aynı olsun.
5. **Taban çizgisini kurun.** Çoğunluk sınıfı, geçen dönemin değeri, tek bir kural, bugünkü insan süreci.
   Hepsini modelle **aynı ölçütle, aynı satırlarda** ölçün.
6. **Başarıyı işe bağlayın.** Hata türlerinin maliyetini yazın (kaçırılan vaka, boşa alarm). Kapasite sınırı
   varsa ölçüt onu izlesin: "günde 200 kişiyi arayabiliyoruz" → ilk 200'deki kesinlik (precision@200).
7. **Veriyi ve etiketi denetleyin.** Geçmiş sonuçlar kayıtlı mı, kaç olay (pozitif) var, etiketi kim hangi
   kuralla koydu? (Aşağıdaki tablo.)
8. **Kabul eşiğini önceden yazın.** "Tabanı en az şu kadar geçmezse kullanmayız." Sonradan yazılan eşik
   sonuca uydurulur.

### Veri var mı, etiket var mı?

| Durum | Ne yapılır |
| --- | --- |
| Geçmiş sonuçlar kayıtlı (iptal, ödeme, iade) | Denetimli öğrenme; etiketin tanımını ve tarihini doğrulayın |
| Etiket yok ama insan koyabilir | Etiket kılavuzu yazın, 200–500 örnek etiketletin, iki kişinin uyuşmasını ölçün |
| Etiket ancak aylar sonra oluşuyor | Ufku kısaltın ya da erken bir ara hedef seçin; ara hedefin asıl hedefle ilişkisini ölçün |
| Etiket yalnız müdahale edilenlerde var (onaylanan krediler) | Seçilim yanlılığı: reddedilenlerin sonucu yok; sınırı yazın, küçük bir keşif grubu düşünün |
| Hiç veri yok | Kural + kayıt başlatın; ML'yi veri biriktikten sonra düşünün |

## Örnekler

### Doğruluk yüksek, iş kötü

Ayda 10.000 abonenin %5'i ayrılıyor. Arama 20 TL; aranan "ayrılacak" müşterinin %30'u kalıyor; kalan müşteri
600 TL getiriyor. Hangi model daha iyi?

```python calistir
N, POSITIVES = 10_000, 500
CALL_COST, SAVE_RATE, VALUE = 20, 0.30, 600


def evaluate(tp: int, fp: int) -> tuple[float, float]:
    tn = N - POSITIVES - fp
    accuracy = (tp + tn) / N
    profit = tp * SAVE_RATE * VALUE - (tp + fp) * CALL_COST
    return accuracy, profit


models = {  # (yakalanan ayrılan, boşa aranan)
    "taban: kimseyi arama": (0, 0),
    "A: temkinli, az arar": (100, 50),
    "B: geniş ağ, çok arar": (400, 1500),
}
results = {name: evaluate(*counts) for name, counts in models.items()}
for name, (accuracy, profit) in results.items():
    money = f"{profit:,.0f}".replace(",", ".")  # Türkçe binlik ayırıcı
    print(f"{name:22s} doğruluk {accuracy:.3f}   kâr {money:>6} TL")
best_accuracy = max(results, key=lambda n: results[n][0])
best_profit = max(results, key=lambda n: results[n][1])
assert best_accuracy != best_profit
```

```cikti
taban: kimseyi arama   doğruluk 0.950   kâr      0 TL
A: temkinli, az arar   doğruluk 0.955   kâr 15.000 TL
B: geniş ağ, çok arar  doğruluk 0.840   kâr 34.000 TL
```

Doğruluğu en düşük model en çok kazandırıyor; "hiçbir şey yapma" tabanı da %95 doğruluk alıyor. Ölçütü işin
maliyetinden türetin. Doğruluğu yalnız sınıflar dengeli ve hata maliyetleri eşitse kullanın
([değerlendirme ölçütleri](degerlendirme-olcutleri.md)).

### Yanlış hedef: tık için eniyilemek

Bir vitrin "tıklanacak ürünü" öne çıkarmak için kurulursa tık tuzağı ürünler kazanır. Asıl hedef satışsa:

```python calistir
import random

random.seed(7)
items = []
for _ in range(200):
    bait = random.random() < 0.2  # dikkat çekici ama az satan ürünler
    ctr = random.uniform(0.08, 0.15) if bait else random.uniform(0.02, 0.08)
    conversion = random.uniform(0.005, 0.02) if bait else random.uniform(0.03, 0.10)
    items.append((ctr, conversion))

IMPRESSIONS = 10_000  # vitrin yeri başına gösterim


def clicks(top):
    return sum(ctr * IMPRESSIONS for ctr, _ in top)


def sales(top):
    return sum(ctr * conv * IMPRESSIONS for ctr, conv in top)


by_click = sorted(items, key=lambda i: i[0], reverse=True)[:20]
by_sale = sorted(items, key=lambda i: i[0] * i[1], reverse=True)[:20]
print(f"tıka göre ilk 20:   {clicks(by_click):6.0f} tık, {sales(by_click):4.0f} satış")
print(f"satışa göre ilk 20: {clicks(by_sale):6.0f} tık, {sales(by_sale):4.0f} satış")
assert clicks(by_click) > clicks(by_sale) and sales(by_sale) > sales(by_click)
```

```cikti
tıka göre ilk 20:    25459 tık,  320 satış
satışa göre ilk 20:  14641 tık, 1314 satış
```

Model kusursuz olsa bile yanlış hedefi kusursuzca eniyiler. Vekil hedef (proxy) kullanmak zorundaysanız vekil
ile asıl hedef arasındaki ilişkiyi ayrıca ölçün ve canlıda ikisini birlikte izleyin.

### Kaç olay gerekir?

Etiketli olay sayısı yalnız eğitimi değil **ölçümü** de sınırlar. %70 duyarlılık (recall) ölçüldüğünde gerçek
değerin %95 güven aralığı (Wilson aralığı):

```python calistir
import math


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    p = successes / n
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return center - half, center + half


for n in (50, 200, 1000):
    low, high = wilson(round(0.7 * n), n)
    print(f"{n} pozitif, %70 yakalandı → gerçek değer %{low * 100:.0f} – %{high * 100:.0f}")
```

```cikti
50 pozitif, %70 yakalandı → gerçek değer %56 – %81
200 pozitif, %70 yakalandı → gerçek değer %63 – %76
1000 pozitif, %70 yakalandı → gerçek değer %67 – %73
```

50 olayla "%70 yakalıyor" demek "%56 ile %81 arasında bir yerde" demektir. İki modeli 3–5 puanlık farkla ayırt
etmek için yüzlerce pozitif gerekir. Olay azsa önce veri biriktirin ya da ufku genişletin.

### Yanlış hedef örnekleri

| Seçilen hedef | Ne oldu | Daha doğru hedef |
| --- | --- | --- |
| "Tıklanır mı?" (öneri, haber) | Tık tuzağı başlıklar öne çıktı, memnuniyet düştü | Satın alma, okuma süresi, geri dönüş |
| "İptal eder mi?", tahmin iptal başvurusu anında | Model isabetli ama müdahale için geç | 30 gün önceden; ikna edilebilir müşteri (etki, uplift) |
| "Geç öder mi?", yalnız onaylanan kredilerden | Reddedilenlerin sonucu yok; model yalnız onaylıları tanıyor | Sınırı yazın; küçük keşif grubu; reddedilenleri ayrı değerlendirin |
| "Talep çözüldü mü?" = temsilci kapattı mı | Hızlı kapatma ödüllendirildi, sorun çözülmedi | 7 gün içinde aynı konuda yeni talep açılmadı mı |
| Harcamayı ihtiyacın vekili saymak | Erişimi az olan grubun ihtiyacı düşük göründü | İhtiyacın doğrudan ölçüsü; alt grup denetimi |
| Sahtecilik modeli kendi engellediği işlemlerden öğreniyor | Engellenen işlemin etiketi oluşmuyor; model kendi körlüğünü öğreniyor | Küçük rastgele denetim örneklemi; geri besleme döngüsünü izleyin |

### Problem tanım kartı

Model kodundan önce bu kart doldurulur. Boş alan, cevaplanmamış soru demektir.

```text
Karar ve eylem  : Ayrılma riski en yüksek 200 aboneyi temsilci arar, indirim önerir.
Birim           : abone × ay (her ayın 1'inde bir satır)
Tahmin anı      : ayın 1'i 00:00; yalnız bu andan önceki kullanım, fatura ve destek kayıtları
Ufuk            : sonraki 30 gün
Hedef (tanım)   : 30 gün içinde abonelik sona erdi (iptal ya da 15 gün ödeme yok) → 1, değilse 0
Taban çizgisi   : (a) "son 30 günde hiç giriş yok" kuralı, (b) rastgele 200 kişi
İş ölçütü       : aranan 200 kişide kurtarılan gelir − arama maliyeti
Çevrimdışı ölçüt: ilk 200'de kesinlik (precision@200), PR-AUC; olasılıklar için Brier
Kabul eşiği     : precision@200 kuraldan en az 10 puan yüksek; güven aralığının alt ucu kuralı geçiyor
Veri / etiket   : 24 ay geçmiş, ayda ~500 iptal; etiket faturalama sisteminden
Bilinen riskler : indirim alan müşterilerin sonraki etiketleri müdahaleden etkilenir; kampanya ayları farklı
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Doğruluk %95, iş tarafı "işe yaramıyor" diyor | Sınıflar dengesiz; "hep hayır" tabanı da %95 | Tabanla karşılaştırın; ölçütü maliyetten türetin |
| Çevrimdışı ölçüt mükemmel, canlıda kötü | Tahmin anından sonra oluşan bilgi özelliklerde (sızıntı) ya da birim/ufuk canlıdakinden farklı | Tahmin anını yazın; her özelliğin zaman damgasını denetleyin |
| Model isabetli ama kimse kullanmıyor | Çıktı bir eyleme bağlı değil ya da eylem için geç geliyor | Kararı ve eylemin sahibini baştan yazın; ufku öne çekin |
| Vekil hedef iyileşiyor, asıl iş sonucu kötüleşiyor | Tık ile satış gibi vekil ve asıl hedef çelişiyor | İlişkiyi ölçün; mümkünse asıl hedefle eğitin |
| Hedef sayısı ekipten ekibe değişiyor | Tanım yazılı değil, her sorgu kendi tanımını kuruyor | Tanımı tek bir sorgu ya da fonksiyonda toplayın ve sürümleyin |
| Yeni modelin işe etkisi ölçülemiyor | Kabul eşiği ve karşılaştırma grubu önceden yok | Eşiği önceden yazın; kontrol gruplu deneme (A/B) yapın |
| "Model öğrenmiyor" | Hedef bu özelliklerden tahmin edilemiyor ya da etiket gürültülü | Taban + basit modelle sinyal var mı bakın; etiket kalitesini ölçün |
| Az veriyle "%3 iyileşme" raporu | Ölçüm belirsizliği farktan büyük | Güven aralığını yazın; olay sayısını artırın |
| Model kendi kararlarının sonuçlarından öğreniyor | Müdahale etiketi değiştiriyor (geri besleme) | Müdahalesiz küçük bir kontrol grubu tutun |

## Denetim listesi

- [ ] Tek cümlelik problem tanımı yazıldı: birim, tahmin anı, ufuk, hedef, eylem, eylemin sahibi.
- [ ] Hedefin yazılı tanımı ile kodu aynı; kenar durumları (iptal sonrası geri dönüş, iade) yazılı.
- [ ] Her özelliğin tahmin anında var olduğu tek tek doğrulandı.
- [ ] En az iki taban çizgisi (çoğunluk/önceki değer ve basit bir kural) modelle aynı ölçütle ölçüldü.
- [ ] Hata maliyetleri ya da kapasite sınırı yazıldı; ölçüt bunlardan türetildi.
- [ ] Kabul eşiği model eğitilmeden önce yazıldı.
- [ ] Pozitif olay sayısı ve ölçümün güven aralığı hesaplandı.
- [ ] Vekil hedef kullanılıyorsa asıl hedefle ilişkisi ölçüldü.
- [ ] Etiketin kim tarafından, hangi kuralla, ne zaman konduğu biliniyor.
- [ ] Modelin kendi eyleminin gelecekteki etiketi nasıl etkileyeceği yazıldı (kontrol grubu planı).

## Küçük modele yaptırırken

- **İsteme yazın:** "Kod yazmadan önce problem tanım kartını doldur: karar ve eylem, birim, tahmin anı, ufuk,
  hedef tanımı, taban çizgisi, iş ölçütü, kabul eşiği. Bilmediğin alana tahmin değil SORU yaz."
- **Modelin tipik hatası:** Doğrudan model koduna atlar; tablodaki ilk uygun sütunu hedef sayar; ölçüt olarak
  doğruluğu seçer; taban çizgisini atlar; "tahmin anı" kavramını hiç kurmaz.
- **Çıktıda denetleyin:** tahmin anı yazılmış mı; her özellik için "tahmin anında var mı?" sorusu yanıtlanmış mı;
  sonuç tablosunda taban satırı var mı; ölçüt maliyetten ya da kapasiteden türetilmiş mi.
- **Sorun:** "Bu modelin çıktısıyla yarın kim, neyi farklı yapacak?" Yanıt yoksa iş model işi değildir.
- **Hazır araç:** `ml_temel egit` raporu taban çizgisini ve sızıntı uyarılarını kendisi yazar; küçük modele önce
  onu çalıştırtıp raporun "Uyarılar" bölümünü okutun.

## İlgili

- [Veri ve etiket kalitesi](veri-ve-etiket.md) — etiket gürültüsü, dengesizlik, örnekleme yanlılığı
- [Veri sızıntısı](veri-sizintisi.md) — "tahmin anı" kuralının çalışan gösterimleri
- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — maliyetle eşik seçimi, güven aralığı
- [Öneri sistemleri](oneri-sistemleri.md) — vekil hedef ve geri besleme döngüsü
- [Model kartı ve sorumlu kullanım](model-karti-ve-sorumluluk.md)
- Taban modeller: [`ml_temel/klasik/dummy.py`](../../ml-temel/ml_temel/klasik/dummy.py)
- CSV'den taban + model + uyarılı rapor: [`ml-temel/README.md`](../../ml-temel/README.md) (`python -m ml_temel egit`)
- Ürün tarafı: [Fikir doğrulama](../95-urun/fikir-dogrulama.md), [Ürün ölçütleri](../70-veri/urun-olcutleri.md),
  [A/B testi](../70-veri/ab-testi.md)
