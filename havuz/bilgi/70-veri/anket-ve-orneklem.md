---
baslik: Anket ve örneklem
ozet: Anketten oran tahmininde hata payı ve gereken yanıt sayısı, yanıt vermeme yanlılığı ve ağırlıklandırma, soru yazımı tuzakları, Likert ve NPS'yi doğru özetlemek; çalışan hesap ve benzetimlerle.
etiketler: [anket, orneklem, istatistik, nps, yanlilik, urun]
duzey: temel
guncellik: 2026-11
---

# Anket ve örneklem

> Bu notu ne zaman okumalı: kullanıcılara anket göndermeden önce; "kullanıcıların %70'i memnun" gibi bir cümleyi
> rapora yazmadan önce; iki dönemin NPS'ini ya da 1–5 puanlarını karşılaştırırken.

## Temel fikir

Anket bir örneklemdir: sonuç ancak yanıtlayanlar hedef kitleyi temsil ediyorsa genellenir. **Hata payı** (margin of
error, ± puan) yalnız şans hatasını ölçer; kimin yanıt verdiğinden doğan **yanıt vermeme yanlılığını** (non-response
bias) ölçmez. Ürün anketlerinde asıl büyük hata ikincisidir ve daha çok yanıt toplamak onu küçültmez.

Hata payı kabaca 1/√n'dir: 100 yanıtla ±10 puan, 400 yanıtla ±5 puan, 1.000 yanıtla ±3 puan (%95, oran %50
civarında). Yarıya indirmek dört kat yanıt ister. Kitle küçükse (800 kullanıcıdan 300'ü yanıtladı) **sonlu kitle
düzeltmesi** (finite population correction) hata payını küçültür.

Soru yazımı sonucu belirler. 1–5 (Likert) yanıtlar sıralıdır; ortalamaları değil dağılımları raporlanır. **NPS**
(net tavsiye skoru) = tavsiye edenlerin payı (9–10) − kötüleyenlerin payı (0–6); hata payı sanılandan büyüktür.

## Karar tablosu

| Amaç | Yöntem | Neden |
| --- | --- | --- |
| "Yüzde kaçı?" | Rastgele seçilmiş kişilere kapalı uçlu soru | Oran tahmini ancak temsilî örneklemle olur |
| "Neden?" | Görüşme ya da az sayıda açık uçlu soru | Nitel bilgi; oran vermez |
| Ürün içi tek soru | Belirli bir anda (ör. üçüncü görevden sonra), rastgele bir paya | Herkese her yerde sormak yorar ve seçer |
| Önce–sonra karşılaştırması | Aynı soru, aynı yer, aynı zamanlama | Soru ya da yer değişirse fark ölçülemez |
| Kitle küçük (yüzlerce kullanıcı) | Herkese sorun; sonlu kitle düzeltmesi | Örneklemeye gerek yok |
| Hassas konu (gelir, sağlık) | Gerekmedikçe sormayın; adsız ve isteğe bağlı | Dürüst yanıt ve KVKK |
| Davranış ölçülebiliyorsa | Ankete değil ölçüme bakın | İnsanlar davranışlarını yanlış hatırlar |

## Hata payı ve gereken yanıt sayısı

```python calistir
import math

Z = 1.96  # %95


def hata_payi(n: int, p: float = 0.5, kitle: int | None = None) -> float:
    hp = Z * math.sqrt(p * (1 - p) / n)
    if kitle:  # sonlu kitle düzeltmesi
        hp *= math.sqrt((kitle - n) / (kitle - 1))
    return hp


for n in (100, 400, 1000):
    print(f"n = {n:<5d} ± {100 * hata_payi(n):.1f} puan".replace(".", ","))
for hedef in (0.05, 0.03):
    print(f"± {100 * hedef:.0f} puan için gereken yanıt: {math.ceil(Z * Z * 0.25 / hedef ** 2)}")
print(f"800 kişilik kitlede 300 yanıt: ± {100 * hata_payi(300):.1f} → düzeltmeyle ± {100 * hata_payi(300, kitle=800):.1f} puan"
      .replace(".", ","))
```

```cikti
n = 100   ± 9,8 puan
n = 400   ± 4,9 puan
n = 1000  ± 3,1 puan
± 5 puan için gereken yanıt: 385
± 3 puan için gereken yanıt: 1068
800 kişilik kitlede 300 yanıt: ± 5,7 → düzeltmeyle ± 4,5 puan
```

Bu sayılar "yanıt verenler rastgele" varsayımıyla geçerlidir. Az yanıtlı alt gruplara (ör. 40 kişilik "tablet
kullanıcıları") bölünce hata payı ±15 puanı aşar; alt grup farklarını yorumlamadan önce n'ye bakın.

## Yanıt vermeme yanlılığı

Etkin kullanıcılar hem daha memnun hem anketi daha çok yanıtlıyor. Kitle on kat büyüyünce ne değişir?

```python calistir
import math
import random

r = random.Random(21)
for kitle_buyuklugu in (10_000, 100_000):
    kitle = []
    for _ in range(kitle_buyuklugu):
        etkinlik = r.random()  # 0: pasif … 1: çok etkin (ürün verisinden bilinir)
        memnun = r.random() < 0.3 + 0.5 * etkinlik
        yanitladi = r.random() < 0.02 + 0.18 * etkinlik
        kitle.append((min(int(etkinlik * 5), 4), memnun, yanitladi))  # (etkinlik dilimi, memnun, yanıtladı)
    gercek = sum(m for _, m, _ in kitle) / len(kitle)
    yanitlar = [(d, m) for d, m, y in kitle if y]
    ham = sum(m for _, m in yanitlar) / len(yanitlar)
    hp = 1.96 * math.sqrt(ham * (1 - ham) / len(yanitlar))
    agirlikli = 0.0  # her dilimin kitledeki payı × o dilimdeki yanıtlayanların memnun oranı
    for d in range(5):
        pay = sum(k[0] == d for k in kitle) / len(kitle)
        dilim = [m for dd, m in yanitlar if dd == d]
        agirlikli += pay * sum(dilim) / len(dilim)
    print(f"kitle {kitle_buyuklugu:>7}: gerçek %{100 * gercek:.1f} · anket (n={len(yanitlar)}) %{100 * ham:.1f} "
          f"± {100 * hp:.1f} · ağırlıklı %{100 * agirlikli:.1f}".replace(".", ","))
```

```cikti
kitle   10000: gerçek %55,4 · anket (n=1114) %62,1 ± 2,8 · ağırlıklı %56,9
kitle  100000: gerçek %55,1 · anket (n=10944) %61,7 ± 0,9 · ağırlıklı %55,4
```

Yanıt sayısı on katına çıkınca hata payı ±2,8'den ±0,9'a daraldı ama anket hâlâ 6–7 puan yanlış: dar aralık, yanlış
yer. **Ağırlıklandırma** (post-stratification) yanıtlayanları kitledeki paylarına göre yeniden tartar ve gerçeğe
yaklaşır; ama yalnız bildiğiniz bir değişkenle (burada ürün verisindeki etkinlik) işe yarar. Yanıt vermeyi
bilmediğiniz bir şey belirliyorsa hiçbir hesap düzeltemez: yanıt oranını yükseltin (kısa anket, doğru an) ve
yanıt oranını her sonucun yanına yazın.

## Soru yazımı tuzakları

| Tuzak | Kötü örnek | Daha iyisi |
| --- | --- | --- |
| Yönlendirici soru | "Yeni tasarımı ne kadar beğendiniz?" | "Yeni tasarımı nasıl buldunuz?" + dengeli ölçek |
| İki soru bir arada | "Uygulama hızlı ve kolay mı?" | İki ayrı soru |
| Varsayımlı soru | "Hangi özelliği en çok kullanıyorsunuz?" | "Hiçbirini kullanmıyorum" seçeneği ekleyin |
| Örtüşen ya da eksik seçenek | Yaş: 18–25, 25–35 | 18–24, 25–34 …; "Diğer" ve "Söylemek istemiyorum" |
| Gelecek davranış sorusu | "Bu özellik olsa para öder misiniz?" | Geçmiş davranışı sorun ya da gerçek bir ödeme denemesi yapın |
| Dengesiz ölçek | "İyi / Çok iyi / Mükemmel" | Simetrik ölçek, ortada nötr |
| Uzun anket | 30 soru | 5–7 soru; yarıda bırakma oranını izleyin |
| Teknik ya da yabancı terim | "Onboarding akışı" | Kullanıcının kendi sözcükleri ("ilk açılıştaki adımlar") |

Seçeneklerin sırası da yanıtı etkiler; sırası önemli olmayan seçenekleri karıştırarak gösterin.

## Likert ve NPS'yi özetlemek

```python calistir
import math
from collections import Counter

grup_a = [3] * 100  # herkes kararsız
grup_b = [1] * 50 + [5] * 50  # yarısı çok kötü, yarısı çok iyi
for ad, puan in (("A", grup_a), ("B", grup_b)):
    say = Counter(puan)
    dagilim = " ".join(f"{k}:%{100 * say[k] // len(puan)}" for k in range(1, 6))
    ust_iki = 100 * (say[4] + say[5]) / len(puan)
    print(f"grup {ad}: ortalama {sum(puan) / len(puan):.1f} · dağılım {dagilim} · 4–5 verenler %{ust_iki:.0f}"
          .replace(".", ","))


def nps(tavsiye: float, kotuleyen: float, n: int) -> str:
    deger = 100 * (tavsiye - kotuleyen)
    hp = 100 * 1.96 * math.sqrt((tavsiye + kotuleyen - (tavsiye - kotuleyen) ** 2) / n)
    return f"NPS {deger:+.0f} ± {hp:.0f}"


print("Ekim:", nps(0.45, 0.25, 200), "· Kasım:", nps(0.50, 0.22, 200))
```

```cikti
grup A: ortalama 3,0 · dağılım 1:%0 2:%0 3:%100 4:%0 5:%0 · 4–5 verenler %0
grup B: ortalama 3,0 · dağılım 1:%50 2:%0 3:%0 4:%0 5:%50 · 4–5 verenler %50
Ekim: NPS +20 ± 11 · Kasım: NPS +28 ± 11
```

Ortalaması aynı iki grup bambaşka durumdadır: Likert için her seçeneğin payını ya da "4–5 verenlerin payı"nı
raporlayın. NPS 20'den 28'e çıkmış görünüyor ama ±11 puanlık hata paylarıyla iki dönem ayırt edilemez; 200
yanıtla NPS'teki 10 puanlık oynama çoğu zaman gürültüdür.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Kullanıcıların %70'i memnun" (yanıt oranı %5) | Yanıtlayanlar kitleyi temsil etmiyor | "Yanıtlayanların %70'i (n, yanıt oranı)"; ağırlıklandırma |
| Hata payı küçük ama sonuç tekrar edilince tutmuyor | Yanlılık hata payına girmez | Yanıt oranını artırın; bilinen değişkenle ağırlıklandırın |
| Alt grup karşılaştırmasında büyük farklar | Alt grupta n çok küçük | Alt grubun hata payını hesaplayın |
| Ortalama puan aynı, şikâyetler arttı | Dağılım iki uca kaydı | Dağılımı ve "4–5 verenler"i raporlayın |
| NPS her ay ±10 oynuyor | Örneklem küçük; NPS'in hata payı büyük | Hata payını yazın; birkaç ayı birlikte değerlendirin |
| "Öderim" diyenler ödemedi | Gelecek davranışı sormak | Geçmiş davranış ya da gerçek ödeme denemesi |
| Anket yalnız destek ekranında | Sorunu olanlar örnekleme fazla girdi | Soruyu nötr bir anda ve rastgele bir paya gösterin |
| Önce–sonra farkı çıktı | Soru metni ya da yeri değişti | Aynı soru, aynı yer, aynı zamanlama |
| Açık uçlu yanıtlarda ad, telefon | Serbest metin kişisel veri taşır | Paylaşmadan önce tarayın ([gizlilik](gizlilik-ve-anonimlestirme.md)) |

## Denetim listesi

- [ ] Anketin sorusu yazıldı: oran mı (kapalı uçlu, temsilî örneklem) neden mi (görüşme, açık uçlu)?
- [ ] Gereken yanıt sayısı hedef hata payına göre hesaplandı.
- [ ] Kime, ne zaman, hangi kanalla sorulduğu yazıldı; rastgele bir paya gösteriliyor.
- [ ] Sorular yönlendirici, çift, varsayımlı değil; seçenekler örtüşmüyor ve "Hiçbiri / Diğer" var.
- [ ] Her sonucun yanında n, yanıt oranı ve hata payı var.
- [ ] Yanıtlayanlar bilinen değişkenlerde (etkinlik, plan, platform) kitleyle karşılaştırıldı; gerekirse
      ağırlıklandırıldı.
- [ ] Likert sonuçları dağılımla, NPS hata payıyla raporlandı.
- [ ] Açık uçlu yanıtlar kişisel veri için tarandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Anket sonucunu raporlarken her oranın yanına n, yanıt oranı ve %95 hata payını yaz.
  Yanıtlayanları etkinlik ve platforma göre kitleyle karşılaştır; farklıysa ağırlıklı sonucu da ver. Likert
  sorularında ortalama yerine dağılımı ve 4–5 verenlerin payını göster. Alt grupları n < 100 ise 'yorumlanamaz'
  diye işaretle."
- **Modelin tipik hatası:** yanıtlayanları kitle sanır ("kullanıcıların %70'i"); hata payını yanlılığın yerine
  koyar; Likert ortalamalarını virgülden sonra iki basamakla karşılaştırır; NPS'teki küçük oynamayı eğilim diye
  yorumlar; anket sorusunu yönlendirici yazar.
- **Çıktıda denetleyin:** "kullanıcıların" mı "yanıtlayanların" mı yazıyor; n ve yanıt oranı var mı; soru metinleri
  karar tablosundaki tuzaklara düşüyor mu.
- **Sorun:** "Bu anketi yanıtlamayanlar yanıtlayanlardan nasıl farklı olabilir?"

## İlgili

- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — Wilson aralığı, az veride oran
- [Korelasyon ve nedensellik](korelasyon-ve-nedensellik.md) — seçim ve hayatta kalan yanlılığı
- [Betimsel istatistik](betimsel-istatistik.md) — puan dağılımını özetlemek
- [Gizlilik ve anonimleştirme](gizlilik-ve-anonimlestirme.md) — adsız anket, küçük hücre
- [Kullanıcı görüşmesi](../95-urun/kullanici-gorusmesi.md) — "neden" sorusunun yöntemi
- [Geri bildirim ve destek](../95-urun/geri-bildirim-ve-destek.md) — ürün içi tek soruluk anket
- [Ölçüm ve öğrenme](../95-urun/olcum-ve-ogrenme.md) — anket ile ölçümü birlikte kullanmak
- [İstatistiksel kestirim](../92-matematik/istatistiksel-kestirim.md) — standart hata ve örneklem dağılımı
