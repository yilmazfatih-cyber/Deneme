---
baslik: Model kartı ve sorumlu kullanım
ozet: Doldurulmuş örnekli model kartı şablonu, sınırların ve uygun olmayan kullanımın bildirimi, alt gruplarda başarım denetimi, insan gözetimi düzeyleri ve kişisel veri için pratik kurallar.
etiketler: [makine-ogrenmesi, model-karti, sorumlu-yz, adalet, kvkk, insan-gozetimi]
duzey: orta
guncellik: 2026-11
---

# Model kartı ve sorumlu kullanım

> Bu notu ne zaman okumalı: bir model başkalarının kullanımına açılmadan önce; model insanlar hakkında karar
> veriyor ya da öneriyorsa; "model herkes için aynı derecede iyi mi?" sorusu sorulduğunda.

## Temel fikir

Model kartı (model card), bir modelin **ne için yapıldığını, neyle eğitildiğini, ne kadar iyi olduğunu ve nerede
kullanılmaması gerektiğini** tek sayfada anlatan belgedir. Kodu okumayan biri (yönetici, denetçi, modeli kullanacak
ekip) kararını bu sayfayla verir.

Sorumlu kullanımın dört pratik sorusu:

1. **Kimler için iyi, kimler için değil?** Genel ölçüt iyi olsa da bir alt grupta başarım çökebilir.
2. **Hata olunca ne olur?** Kim etkilenir, geri alınabilir mi, itiraz yolu var mı?
3. **İnsan nerede?** Model karar mı veriyor, öneri mi?
4. **Hangi kişisel veri, hangi amaçla?** Gerekmeyen veri toplanmıyor ve saklanmıyor mu?

## Alt grupta başarım denetimi

Genel duyarlılık iyi görünüyor; bölgelere ayırınca:

```python calistir
import math
import random

random.seed(45)
groups = {  # bölge: (satır, pozitif oranı, modelin gerçek duyarlılığı, yanlış alarm oranı)
    "Marmara": (3000, 0.20, 0.80, 0.05),
    "İç Anadolu": (1500, 0.20, 0.78, 0.05),
    "Doğu Anadolu": (300, 0.25, 0.55, 0.04),
    "Yurt dışı": (40, 0.20, 0.80, 0.10),
}


def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 1.0
    p, d = k / n, 1 + z * z / n
    center, half = (p + z * z / (2 * n)) / d, z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return center - half, center + half


total_tp = total_pos = 0
print(f"{'bölge':13s} satır pozitif  duyarlılık (%95 GA)   yanlış alarm")
for name, (n, rate, tpr, fpr) in groups.items():
    tp = pos = fp = neg = 0
    for _ in range(n):
        y = random.random() < rate
        flagged = random.random() < (tpr if y else fpr)
        pos, tp, neg, fp = pos + y, tp + (y and flagged), neg + (not y), fp + ((not y) and flagged)
    low, high = wilson(tp, pos)
    total_tp, total_pos = total_tp + tp, total_pos + pos
    print(f"{name:13s} {n:5d} {pos:7d}  {tp / pos:.2f} ({low:.2f}–{high:.2f})     {fp / neg:.3f}")
print(f"{'GENEL':13s} {'':5s} {total_pos:7d}  {total_tp / total_pos:.2f}")
```

```cikti
bölge         satır pozitif  duyarlılık (%95 GA)   yanlış alarm
Marmara        3000     595  0.80 (0.77–0.83)     0.053
İç Anadolu     1500     310  0.76 (0.71–0.81)     0.045
Doğu Anadolu    300      76  0.63 (0.52–0.73)     0.022
Yurt dışı        40       9  0.56 (0.27–0.81)     0.097
GENEL                   990  0.77
```

Okuma:

- Genel duyarlılık %77; "Doğu Anadolu" bölgesinde gerçek vakaların üçte birinden fazlası kaçıyor ve aralık
  Marmara'nınkiyle örtüşmüyor. Genel ölçüt bunu gizler.
- "Yurt dışı" grubunda yalnız 9 pozitif var: aralık %27–%81, hiçbir yargıya varılamaz. Küçük grubu "sorunsuz"
  saymayın; "ölçülemedi" diye yazın.
- Ne yapılır: o grubun verisini artırmak, gruba özgü eşik ya da kalibrasyon, modelin o grupta kullanılmaması ya da
  insan incelemesine yönlendirilmesi. Karar ve gerekçesi karta yazılır.

Hassas özelliği (cinsiyet, yaş, köken) modelden çıkarmak yanlılığı gidermez: posta kodu, okul, ad gibi **vekil**
sütunlar aynı bilgiyi taşır. Denetim için hassas özellik, modelde kullanılmasa bile **ölçümde** gerekebilir; bunun
hukuki dayanağını önceden netleştirin.

## Model kartı şablonu

```markdown
# Model kartı: <ad> (<sürüm>)

## Özet
Ne tahmin eder, kim kullanır, hangi kararı destekler (tek paragraf).

## Amaç ve kullanım
- Amaçlanan kullanım: …
- Kullanıcılar: …
- Karar düzeyi: otomatik / insan onaylı / yalnız bilgi

## Kapsam dışı kullanım
Bu model şunlar için KULLANILMAMALIDIR: …

## Eğitim verisi
Kaynak, tarih aralığı, satır sayısı, hedef tanımı, ayrım yöntemi, bilinen yanlılıklar; veri kartına bağlantı.

## Değerlendirme
Sınama kümesi (tarih, büyüklük), ana ölçüt + %95 güven aralığı, taban çizgisi, kalibrasyon, seçilen eşik ve gerekçesi.

## Alt grup başarımı
Grup başına satır, pozitif, ana ölçüt (aralıkla); ölçülemeyen gruplar.

## Sınırlar ve riskler
Bilinen hata türleri, dağılım dışı durumlar, sızıntı denetimi sonucu.

## İnsan gözetimi
Kim inceler, hangi durumda insana gider, itiraz yolu.

## Kişisel veri
Hangi kişisel veriler, hangi amaçla; saklama süresi; maskeleme.

## Bakım
Sahibi, izlenen ölçütler, yeniden eğitim tetikleyicileri, geri alma yolu, son güncelleme.
```

### Doldurulmuş örnek (sentetik veriyle)

Aşağıdaki ölçümler havuzdaki çalışan örnekten alınmıştır: `ml-temel/ornekler/03_musteri_kaybi.py` (tohumlu
**sentetik** müşteri verisi; gerçek kişi ya da şirket değildir).

```markdown
# Model kartı: musteri-kaybi (0.1, örnek)

## Özet
Abonelerin ayrılma olasılığını tahmin eder; elde tutma ekibi, en riskli müşterilere teklif sunmak için kullanır.

## Amaç ve kullanım
- Amaçlanan kullanım: aylık elde tutma listesinin sıralanması.
- Kullanıcılar: elde tutma ekibi.
- Karar düzeyi: insan onaylı — liste temsilciye öneri olarak gider; teklif kararı temsilcinindir.

## Kapsam dışı kullanım
Fiyatlandırma, kredi, hizmet kısıtlama ya da bir müşteriyi olumsuz etkileyecek herhangi bir karar.

## Eğitim verisi
3.000 sentetik müşteri, kayıp oranı %25,1. Sınama kümesi en başta katmanlı ayrıldı. Ön işleme + model tek hat;
çapraz doğrulamada her katta yeniden uyduruldu. Müşteri numarası özellik olarak kullanılmadı (sızıntı gösterimi:
bütün veride hedef kodlamayla ROC-AUC 1,000; kat içinde 0,500).

## Değerlendirme
Gradyan artırma. Çapraz doğrulama ROC-AUC 0,766 ± 0,023.
Sınama: ROC-AUC 0,787 (%95 GA 0,752–0,822); Brier 0,1530; ECE 0,0436.
İzotonik kalibrasyon sonrası: ROC-AUC 0,799 (%95 GA 0,764–0,834); Brier 0,1488; ECE 0,0364.

## Alt grup başarımı
Sentetik veride bölge/yaş sütunu yok; ÖLÇÜLEMEDİ. Gerçek veride ilk iş olarak eklenmeli.

## Sınırlar ve riskler
Sentetik veri: gerçek davranışı temsil ettiği doğrulanmadı. Kampanya dönemlerinde oran kayması beklenir.

## İnsan gözetimi
Liste temsilciye öneri olarak gider; temsilci "yanlış öneri" işaretleyebilir; işaretler aylık incelenir.

## Kişisel veri
Ad, iletişim bilgisi modele girmez; müşteri numarası yalnız birleştirme için, takma adla tutulur.

## Bakım
Sahibi: elde tutma analitiği. Aylık: girdi kayması, ortalama tahmin, gerçekleşen kayıpla ROC-AUC ve kalibrasyon.
Yeniden eğitim: üç ayda bir ya da ROC-AUC 0,72'nin altına inerse. Önceki sürüm geri alınmaya hazır.
```

## Kart denetleyicisi

Küçük modele kart yazdırdıktan sonra boş bölüm ve yer tutucu kalmadığını bir betikle denetleyin:

```python calistir
import re

REQUIRED = ["Amaç ve kullanım", "Kapsam dışı kullanım", "Eğitim verisi", "Değerlendirme", "Alt grup başarımı",
            "Sınırlar ve riskler", "İnsan gözetimi", "Kişisel veri", "Bakım"]


def check_card(text: str) -> list[str]:
    problems = []
    headings = re.findall(r"^## (.+?)\s*$", text, flags=re.M)
    problems += [f"eksik bölüm: {name}" for name in REQUIRED if name not in headings]
    sections = re.split(r"^## ", text, flags=re.M)[1:]
    problems += [f"boş bölüm: {s.splitlines()[0]}" for s in sections if not "".join(s.splitlines()[1:]).strip()]
    if re.search(r"DOLDURUN|…|TODO", text):
        problems.append("yer tutucu kalmış")
    if not re.search(r"%95 GA", text):
        problems.append("ölçütlerde güven aralığı yok")
    return problems


draft = """# Model kartı: deneme
## Amaç ve kullanım
Elde tutma listesini sıralar.
## Eğitim verisi
DOLDURUN
## Değerlendirme
ROC-AUC 0,79
## Bakım
"""
for problem in check_card(draft):
    print("-", problem)
```

```cikti
- eksik bölüm: Kapsam dışı kullanım
- eksik bölüm: Alt grup başarımı
- eksik bölüm: Sınırlar ve riskler
- eksik bölüm: İnsan gözetimi
- eksik bölüm: Kişisel veri
- boş bölüm: Bakım
- yer tutucu kalmış
- ölçütlerde güven aralığı yok
```

## İnsan gözetimi düzeyleri

| Düzey | Ne zaman | Örnek | Şart |
| --- | --- | --- | --- |
| Otomatik karar | Hata ucuz, geri alınabilir, kişiyi olumsuz etkilemiyor | Ürün önerisi, e-posta sıralama | İzleme ve geri alma |
| İnsan onaylı | Hata orta düzeyde; model hacmi azaltıyor | Destek talebini yönlendirme, elde tutma listesi | Onaylayanın modeli "kör" onaylamadığını ölçün (itiraz oranı) |
| Yalnız bilgi, kararı insan verir | Hata pahalı ya da kişinin hakkını etkiliyor | Kredi, işe alım, sağlık önceliği | Gerekçe gösterimi, itiraz yolu, düzenli alt grup denetimi |
| Kullanılmaz | Veri ya da ölçüm güvenilir değil; amaç meşru değil | — | Kartta "kapsam dışı" olarak yazın |

"Belirsiz" kararları insana gönderen bir güven eşiği ([metin sınıflandırma](metin-siniflandirma.md)) gözetimi
ölçeklenebilir kılar.

## Kişisel veri

> Hukuki danışmanlık değildir; güncel mevzuatı ve kurum içi kuralları doğrulayın.

- **En aza indirme:** modele gerçekten katkı vermeyen kişisel sütunu toplamayın; doğum tarihi yerine yaş aralığı
  çoğu zaman yeter.
- **Amaçla sınırlılık:** bir amaçla toplanan veriyi başka bir modelde kullanmadan önce dayanağını denetleyin.
- **Özel nitelikli veri** (sağlık, biyometrik, din, etnik köken, ceza mahkûmiyeti vb.) çok daha sıkı kurallara
  bağlıdır; mümkünse hiç kullanmayın.
- **Takma ad anonimlik değildir:** anahtar elinizdeyse veri hâlâ kişiseldir.
- **Otomatik karar:** KVKK, yalnız otomatik sistemlerle yapılan analiz sonucunda kişinin aleyhine çıkan sonuca
  itiraz hakkı tanır (md. 11; güncel metinden doğrulayın). Kişiyi olumsuz etkileyen kararlarda insan gözetimi ve
  itiraz yolu bu yüzden de gereklidir.
- **Günlükler ve eğitim verisi:** canlı girdiler kaydediliyorsa maskeleyin ve saklama süresi koyun.
- **Dış hizmet:** veriyi bir bulut ya da yapay zekâ API'sine göndermek aktarım sayılabilir; önce denetleyin.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Kart var ama kimse okumuyor | Uzun, teknik, sayısız | Tek sayfa; ilk paragraf kararı verdirsin |
| Genel ölçüt iyi, bir bölgeden şikâyet geliyor | Alt grup başarımı ölçülmemiş | Grup başına ölçüt + aralık |
| Küçük grup "sorunsuz" raporlandı | Birkaç örnekle aralık çok geniş | "Ölçülemedi" yazın; veri toplayın |
| Hassas sütun çıkarıldı, yanlılık sürüyor | Vekil sütunlar (posta kodu, ad) | Ölçümde grup bilgisini kullanın; vekilleri inceleyin |
| İnsan onayı var ama her öneri onaylanıyor | Otomasyon yanlılığı; onay kör | İtiraz/değiştirme oranını izleyin; rastgele denetim |
| Model amacının dışında kullanılmaya başlandı | Kapsam dışı kullanım yazılmamış | Kartta açıkça "kullanılmamalıdır" bölümü |
| Kart model güncellenince eskidi | Kart elle, ayrı tutuluyor | Kartı eğitim hattında ölçümlerden otomatik üretin |

## Denetim listesi

- [ ] Kartta bütün bölümler dolu; yer tutucu yok (denetleyici betik yeşil).
- [ ] Ölçütler taban çizgisi ve %95 güven aralığıyla verildi.
- [ ] Önemli alt gruplarda başarım ölçüldü; ölçülemeyen gruplar yazıldı.
- [ ] Kapsam dışı kullanımlar açıkça listelendi.
- [ ] İnsan gözetimi düzeyi, itiraz yolu ve sahibi belirlendi.
- [ ] Kullanılan kişisel veriler, amacı ve saklama süresi yazıldı; gereksizler çıkarıldı.
- [ ] Kart, eğitim hattının ürettiği ölçümlerle aynı (elle kopyalanmış eski sayı yok).
- [ ] Bakım bölümünde izleme ve yeniden eğitim tetikleyicileri var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Model kartını şu bölümlerle yaz: Amaç ve kullanım, Kapsam dışı kullanım, Eğitim verisi,
  Değerlendirme, Alt grup başarımı, Sınırlar ve riskler, İnsan gözetimi, Kişisel veri, Bakım. Sayıları yalnız
  `metrikler.json` dosyasından al; uydurma. Bilmediğin yere 'DOLDURUN' yaz."
- **Modelin tipik hatası:** Ölçüt uydurur ya da yuvarlayıp güzelleştirir; alt grup bölümünü genel ifadeyle geçiştirir;
  "kapsam dışı" bölümünü boş bırakır; sentetik veriyle ölçüldüğünü yazmaz.
- **Çıktıda denetleyin:** denetleyici betiği çalıştırın; karttaki her sayıyı kaynak dosyayla karşılaştırın; "DOLDURUN"
  kalan yerleri sahibiyle doldurun.

## İlgili

- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — güven aralığı · [Kalibrasyon](kalibrasyon-ve-olasilik.md) —
  grup bazında kalibrasyon · [MLOps](mlops.md) — bakım ve izleme · [Problem çerçeveleme](problem-cerceveleme.md)
- Otomatik model kartı (hassas sütun işaretlemeli): [`ml_temel/tablo/model_card.py`](../../ml-temel/ml_temel/tablo/model_card.py)
- Örnek kart: [`dil-modeli/ornek-model/MODEL_KARTI.md`](../../dil-modeli/ornek-model/MODEL_KARTI.md);
  veri kartı şablonları: [`ince_ayar/data/veri_karti_sablonu.md`](../../ince-ayar/ince_ayar/data/veri_karti_sablonu.md),
  [`veri/docs/VERI_KARTI_SABLONU.md`](../../veri/docs/VERI_KARTI_SABLONU.md)
- KVKK pratik denetim listesi ve maskeleme araçları: [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md)
- Uçtan uca ölçümlerin kaynağı: [`ml-temel/ornekler/03_musteri_kaybi.py`](../../ml-temel/ornekler/03_musteri_kaybi.py)
