---
baslik: A/B testi
ozet: Deney tasarımı, örneklem büyüklüğü hesabı, rastgeleleştirme birimi, erken bakma ve çoklu karşılaştırma tuzakları (çalışan benzetimlerle), yenilik etkisi ve sonuç raporu şablonu.
etiketler: [ab-testi, deney, istatistik, urun, orneklem, anlamlilik]
duzey: orta
guncellik: 2026-11
---

# A/B testi

> Bu notu ne zaman okumalı: bir değişikliğin etkisini ölçmek için deney kurmadan önce; deney sürerken "sonuca bir
> bakalım mı?" denildiğinde; bir deney raporunu onaylamadan önce; trafik azken "A/B testi yapalım mı?" kararında.

## Temel fikir

A/B testinde kullanıcılar **rastgele** iki gruba ayrılır ve yalnız bir şey değiştirilir. Rastgele atama mevsimi,
kampanyayı, kullanıcı türünü iki gruba eşit dağıtır; geriye kalan farkı, şansı hesaba katarak, değişikliğe
bağlayabilirsiniz. Nedensel sonuç veren en güçlü yol budur ([korelasyon ve nedensellik](korelasyon-ve-nedensellik.md)).

Deney başlamadan üç şey yazılır: **hipotez**, **tek bir birincil ölçüt** ve **örneklem büyüklüğü** (dolayısıyla
süre). Sonra beklenir ve birincil ölçüte bir kez bakılır. Bunlardan biri sonradan değişirse p değeri anlamını yitirir.

Küçük etkiyi görmek çok veri ister: gereken örneklem, aranan farkın karesiyle ters orantılıdır. Yarı büyüklükte bir
etki için dört kat kullanıcı gerekir. Az trafikli üründe bu, deneyin aylar sürmesi demektir.

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Haftada binlerce dönüşüm, geri alınabilir değişiklik | A/B testi, kullanıcı düzeyinde | Ölçülebilir; risk küçük |
| Haftada onlarca dönüşüm | Küçük ayarları test etmeyin; büyük değişiklik, nitel araştırma, dikkatli öncesi–sonrası | Gereken örneklem aylar sürer |
| Giriş öncesi sayfa (tanıtım, kayıt) | Cihaz/çerez düzeyinde atama | Kullanıcı kimliği yok |
| Giriş sonrası ürün | Kullanıcı kimliğiyle atama | Aynı kişi iki cihazda iki sürüm görmesin |
| Gruplar birbirini etkiler (pazar yeri, paylaşım, stok) | Küme (şehir, ekip) ya da zaman dilimli dönüşümlü atama | Bir grubun davranışı ötekinin sonucunu değiştirir |
| Yüksek risk (ödeme akışı, fiyat) | Önce %5–10 trafikle, koruma ölçütleriyle | Zarar sınırlı kalsın |
| Fiyat ayrımcılığı, sağlık, hukuki risk | Deneyden önce etik ve hukuki değerlendirme | Teknik olarak mümkün olan her deney yapılmaz |

## Deney planı şablonu

```markdown
**Deney:** kayit_formu_kisa · **Plan tarihi:** 2026-10-01 (başlangıçtan önce)
**Hipotez:** Kayıt formunu 5 alandan 2 alana indirirsek kayıt tamamlama oranı artar; çünkü telefonda uzun form
yarıda bırakılıyor (oturum kayıtları: formu açanların %40'ı 3. alanda çıkıyor).
**Birincil ölçüt:** kayıt tamamlama oranı = kayıt tamamlayan / formu gören (kullanıcı düzeyinde, 24 saat içinde)
**Koruma ölçütleri:** 7. gün tutma, ilk hafta destek talebi, form hata oranı, sayfa yükleme süresi (p90)
**Atama:** anonim_id, deney adıyla tuzlanmış özet, %50/%50 · **Kitle:** yeni ziyaretçiler, mobil + masaüstü
**Taban oran ve en küçük anlamlı etki (MDE):** %10 → %11 (mutlak +1 puan, göreli +%10)
**α / güç:** 0,05 iki yönlü / 0,80 → grup başına 14.751 kullanıcı
**Süre:** günde 2.000 yeni ziyaretçi → 15 gün → 3 tam hafta (21 gün)
**Karar kuralı:** birincil ölçüt anlamlı ve hiçbir koruma ölçütünde anlamlı bozulma yoksa yayınla
**Erken durdurma:** yalnız koruma ölçütü ağır bozulursa (form hata oranı iki katı)
```

## Örneklem büyüklüğü

İki oran için grup başına kullanıcı sayısı (normal yaklaşım):

```python calistir
import math
from statistics import NormalDist


def grup_basina(p1: float, p2: float, alfa: float = 0.05, guc: float = 0.80) -> int:
    z_a, z_b = NormalDist().inv_cdf(1 - alfa / 2), NormalDist().inv_cdf(guc)
    p_ort = (p1 + p2) / 2
    pay = (z_a * math.sqrt(2 * p_ort * (1 - p_ort)) + z_b * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return math.ceil(pay / (p2 - p1) ** 2)


def tr(sayi: float) -> str:  # Türkçe yazım: binlik nokta, ondalık virgül
    return f"{sayi:,}".replace(",", " ").replace(".", ",").replace(" ", ".")


for p2 in (0.12, 0.11, 0.105):
    n = grup_basina(0.10, p2)
    print(f"%10 → %{tr(round(100 * p2, 1))}: grup başına {tr(n)}; günde 2.000 kişiyle {math.ceil(2 * n / 2000)} gün, "
          f"günde 50 kişiyle {math.ceil(2 * n / 50)} gün")
assert grup_basina(0.10, 0.11) == 14751
```

```cikti
%10 → %12,0: grup başına 3.841; günde 2.000 kişiyle 4 gün, günde 50 kişiyle 154 gün
%10 → %11,0: grup başına 14.751; günde 2.000 kişiyle 15 gün, günde 50 kişiyle 591 gün
%10 → %10,5: grup başına 57.763; günde 2.000 kişiyle 58 gün, günde 50 kişiyle 2311 gün
```

Okuma: taban %10 iken +1 puanı görmek için iki grupta toplam ~29.500 kullanıcı gerekir. Günde 50 yeni kullanıcısı
olan bir ürün +2 puanlık etkiyi bile 154 günde görür: orada küçük ayarları A/B testiyle ölçmeye çalışmak zaman
kaybıdır. Süreyi her zaman **tam haftalara** yuvarlayın; hafta içi ile hafta sonu kullanıcıları farklıdır.

MDE'yi yazarken mutlak mı göreli mi olduğunu açıkça söyleyin: "%10 artış" hem %10 → %11 hem %10 → %20 diye
okunabilir; gereken örneklem 25 kat farklıdır.

## Rastgeleleştirme birimi ve atama

- **Atama birimi = analiz birimi.** Kullanıcıyla atayıp sayfa görüntüleme düzeyinde analiz ederseniz aynı
  kişinin satırları bağımsız sayılır, güven aralığı olduğundan dar çıkar. Ölçütü önce kullanıcı başına toplayın.
- **Atama kalıcı ve deneyler arası bağımsız olmalı.** `kullanici_id % 2` her deneyde aynı kişileri B'ye koyar.
  Deney adıyla tuzlanmış özet kullanın:

```python calistir
import hashlib


def grup(deney: str, kullanici: str) -> str:
    ozet = hashlib.sha256(f"{deney}:{kullanici}".encode()).digest()
    return "B" if int.from_bytes(ozet[:8], "big") % 100 < 50 else "A"


kullanicilar = [f"k{i}" for i in range(20000)]
form = [grup("kayit_formu", k) for k in kullanicilar]
fiyat = [grup("fiyat_sayfasi", k) for k in kullanicilar]
b_payi = form.count("B") / len(form)
ortak = sum(f == "B" and g == "B" for f, g in zip(form, fiyat)) / form.count("B")
print(f"tuzlanmış özet: B payı %{100 * b_payi:.0f}; form deneyinde B olanların fiyat deneyinde de B olma oranı %{100 * ortak:.0f}")
mod = [int(k[1:]) % 2 for k in kullanicilar]
print(f"id % 2: iki deneyde de aynı bölme → ortak oran %{100 * sum(mod) / sum(mod):.0f}")
assert 0.48 < b_payi < 0.52 and 0.47 < ortak < 0.53
```

```cikti
tuzlanmış özet: B payı %50; form deneyinde B olanların fiyat deneyinde de B olma oranı %50
id % 2: iki deneyde de aynı bölme → ortak oran %100
```

- **Örneklem oranı uyumsuzluğu (SRM, sample ratio mismatch):** %50/%50 atanan grupların büyüklüğü şansın
  açıklayamayacağı kadar farklıysa deney bozuktur (yönlendirmede kayıp, bot, önbellek, atama hatası); sonuca
  bakılmaz, neden bulunur. İlk günden denetleyin:

```python calistir
import math


def srm_p(n_a: int, n_b: int, oran_a: float = 0.5) -> float:
    toplam = n_a + n_b
    beklenen_a, beklenen_b = toplam * oran_a, toplam * (1 - oran_a)
    ki_kare = (n_a - beklenen_a) ** 2 / beklenen_a + (n_b - beklenen_b) ** 2 / beklenen_b
    return math.erfc(math.sqrt(ki_kare / 2))  # 1 serbestlik dereceli ki-kare testinin p değeri


for n_a, n_b in ((50_210, 49_790), (50_800, 49_200)):
    p = srm_p(n_a, n_b)
    durum = "SRM: deney bozuk, nedeni bul" if p < 0.001 else "sorun yok"
    print(f"A {n_a} · B {n_b}: p = {p:.2g} → {durum}".replace(".", ","))
```

```cikti
A 50210 · B 49790: p = 0,18 → sorun yok
A 50800 · B 49200: p = 4,2e-07 → SRM: deney bozuk, nedeni bul
```

%50,8'e %49,2 küçük görünür; 100 bin kullanıcıda şansla olmaz.

## Erken bakma tuzağı

Deney sürerken her gün p değerine bakıp ilk p < 0,05'te "kazandı" demek yanlış pozitif oranını katlar. Benzetim:
iki grup **aynı** (gerçek fark yok), 10 gün, her gün grup başına 100 yeni kullanıcı.

```python calistir
import random
from statistics import NormalDist

r = random.Random(42)
Z = NormalDist()


def p_degeri(d1: int, d2: int, n: int) -> float:
    """İki oranın farkı için z testi (iki grup eşit, n'er kişi)."""
    p = (d1 + d2) / (2 * n)
    se = (2 * p * (1 - p) / n) ** 0.5
    return 2 * (1 - Z.cdf(abs(d1 - d2) / n / se)) if se else 1.0


DENEY, GUN, GUNLUK, ORAN = 2000, 10, 100, 0.10  # A/A: iki grupta da oran %10
son = her_gun = her_gun_siki = 0
for _ in range(DENEY):
    a = b = n = 0
    gunluk_p = []
    for _ in range(GUN):
        n += GUNLUK
        a += sum(r.random() < ORAN for _ in range(GUNLUK))
        b += sum(r.random() < ORAN for _ in range(GUNLUK))
        gunluk_p.append(p_degeri(a, b, n))
    son += gunluk_p[-1] < 0.05
    her_gun += min(gunluk_p) < 0.05
    her_gun_siki += min(gunluk_p) < 0.0106
for ad, sayi in (("yalnız sonda bir kez bakıp p < 0,05", son), ("her gün bakıp ilk p < 0,05'te durunca", her_gun),
                 ("her gün bakıp eşik p < 0,0106 (10 bakış)", her_gun_siki)):
    print(f"{ad:42s} → %{100 * sayi / DENEY:.1f} yanlış 'kazanan'".replace(".", ","))
assert her_gun > 2.5 * son
```

```cikti
yalnız sonda bir kez bakıp p < 0,05        → %5,5 yanlış 'kazanan'
her gün bakıp ilk p < 0,05'te durunca      → %19,9 yanlış 'kazanan'
her gün bakıp eşik p < 0,0106 (10 bakış)   → %5,3 yanlış 'kazanan'
```

On bakış, yanlış alarm oranını %5'ten %20'ye çıkarır. Üç dürüst yol: (1) örneklemi önceden hesaplayın, sonda bir
kez bakın; (2) ara bakış şartsa sayısını önceden sabitleyin ve her bakışta daha sıkı eşik kullanın (10 eşit
aralıklı bakışta her bakış için p < 0,0106 toplamı ≈ %5'te tutar; bu benzetimle doğrulandı); (3) sıralı test
(sequential testing) için yapılmış bir yöntem kullanın. Ara bakışlar koruma ölçütleri için serbesttir: zarar
varsa durdurmak, "kazandı" demekten farklıdır.

## Çoklu karşılaştırma

Yirmi ölçüte ya da yirmi segmente bakarsanız, hiçbir etki olmasa bile en az birinin "anlamlı" çıkma olasılığı
1 − 0,95²⁰ ≈ %64'tür. Birincil ölçüt tektir; ötekiler için Holm düzeltmesi:

```python calistir
def holm(p_degerleri: dict[str, float], alfa: float = 0.05) -> list[str]:
    sirali = sorted(p_degerleri.items(), key=lambda kv: kv[1])
    anlamli = []
    for sira, (ad, p) in enumerate(sirali):
        if p > alfa / (len(sirali) - sira):
            break
        anlamli.append(ad)
    return anlamli


olcutler = {"kayıt": 0.004, "7. gün tutma": 0.03, "ilk görev": 0.04, "paylaşım": 0.20, "destek talebi": 0.60}
print("düzeltmesiz p < 0,05:", [ad for ad, p in olcutler.items() if p < 0.05])
print("Holm düzeltmeli     :", holm(olcutler))
print(f"20 bağımsız ölçütte en az bir yanlış 'anlamlı': %{100 * (1 - 0.95 ** 20):.0f}")
```

```cikti
düzeltmesiz p < 0,05: ['kayıt', '7. gün tutma', 'ilk görev']
Holm düzeltmeli     : ['kayıt']
20 bağımsız ölçütte en az bir yanlış 'anlamlı': %64
```

Segment sonuçları ("mobilde çok iyi") **keşif** bulgusudur; ayrı bir deneyle doğrulanmadan karar verdirmez.

## Kazananın laneti ve yenilik etkisi

- **Kazananın laneti:** gücü düşük bir deneyde yalnız şansın büyüttüğü sonuçlar anlamlı çıkar; anlamlı çıkan
  etkinin ölçülen büyüklüğü gerçeğinden büyüktür. Yayından sonra etki "küçüldüyse" nedeni çoğu zaman budur. Önlem:
  yeterli örneklem; büyük kararlarda doğrulama deneyi ya da küçük bir kalıcı karşılaştırma grubu (holdout).
- **Yenilik etkisi:** yeni düzen merak yüzünden ilk günlerde tıklanır, sonra söner. **Değişim direnci:** alışkın
  kullanıcı ilk günler yeni düzeni sevmez, sonra alışır. İkisini de görmek için günlük etkiyi çizin, en az iki tam
  hafta sürdürün ve yeni kullanıcılarla eski kullanıcıları ayrı inceleyin.

## Sonuç raporu

```python calistir
import math
from statistics import NormalDist


def tr(x: float, basamak: int = 1) -> str:
    return f"{x:.{basamak}f}".replace(".", ",")


n_a, d_a, n_b, d_b = 14_902, 1_505, 14_877, 1_636
p_a, p_b = d_a / n_a, d_b / n_b
fark = p_b - p_a
se = math.sqrt(p_a * (1 - p_a) / n_a + p_b * (1 - p_b) / n_b)
alt, ust = fark - 1.96 * se, fark + 1.96 * se
p_ort = (d_a + d_b) / (n_a + n_b)
z = fark / math.sqrt(p_ort * (1 - p_ort) * (1 / n_a + 1 / n_b))
p = 2 * (1 - NormalDist().cdf(abs(z)))
print(f"A %{tr(100 * p_a)} (n={n_a:_}) · B %{tr(100 * p_b)} (n={n_b:_})".replace("_", "."))
print(f"fark +{tr(100 * fark)} puan (%95 GA +{tr(100 * alt)} … +{tr(100 * ust)}), göreli +%{100 * fark / p_a:.0f}, "
      f"p = {tr(p, 3)}")
assert alt > 0
```

```cikti
A %10,1 (n=14.902) · B %11,0 (n=14.877)
fark +0,9 puan (%95 GA +0,2 … +1,6), göreli +%9, p = 0,012
```

```markdown
**Deney:** kayit_formu_kisa · 2026-10-05 → 2026-10-26 (3 tam hafta) · plan: bağlantı (sapma yok)
**Karar:** YAYINLA
**Birincil ölçüt — kayıt tamamlama:** A %10,1 (n=14.902) · B %11,0 (n=14.877)
  fark +0,9 puan (%95 GA +0,2 … +1,6), göreli +%9, p = 0,012
**Koruma ölçütleri:** 7. gün tutma −0,2 puan (GA −1,0 … +0,6): bozulma kanıtı yok · form hata oranı ve
  yükleme süresi değişmedi
**Örneklem oranı:** %50,0 / %50,0, SRM p = 0,84
**Keşif (karar için değil):** mobil +1,2 puan, masaüstü +0,3 puan (Holm sonrası anlamlı değil)
**Sınırlar:** yalnız yeni ziyaretçiler; bayram haftası dışında; etki büyüklüğünün alt sınırı +0,2 puan
**Sonraki adım:** 30 gün sonra kalıcı karşılaştırma grubuyla tutmayı yeniden ölç
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| B ilk üç gün "kazanıyordu", sonra fark kayboldu | Erken bakma ya da yenilik etkisi | Önceden sabit örneklem; en az iki tam hafta; günlük etki grafiği |
| Gruplar %50,8 / %49,2 (100 bin kişide) | SRM: atama ya da kayıt hatası | Sonuca bakmayın; yönlendirme, bot, önbellek, atama kodunu inceleyin |
| "Mobil kadınlarda %30 artış" | Çok segmente bakıldı (p-avcılığı) | Segmentler keşiftir; Holm; doğrulama deneyi |
| Her deneyde aynı kullanıcılar B'de | `id % 2` ile atama | Deney adıyla tuzlanmış özet |
| Güven aralığı inanılmayacak kadar dar | Sayfa görüntüleme düzeyinde analiz, kullanıcıyla atama | Ölçütü önce kullanıcı başına toplayın |
| Birincil ölçüt deney bitince değişti | Sonuca göre ölçüt seçildi | Plan önceden yazılır ve tarihlenir; sapma rapora yazılır |
| Yayından sonra etki çok daha küçük | Kazananın laneti, yenilik etkisi | Yeterli güç; kalıcı karşılaştırma grubu |
| "Anlamlı değil" → "etkisi yok" denildi | Güç yetersiz; aralık sıfırı da büyük etkiyi de kapsıyor | Güven aralığıyla raporlayın: "en çok +X puan olabilir" |
| B sayfası yavaş ama kimse görmedi | Koruma ölçütü yok | Yükleme süresi, hata oranı her deneyde koruma ölçütü |
| Pazar yerinde iki grup aynı stoğa yarışıyor | Gruplar arası girişim | Küme ya da zaman dilimli atama |
| "%10 artış" için örneklem 25 kat yanlış | MDE mutlak/göreli karıştı | MDE'yi iki biçimde de yazın |

## Denetim listesi

- [ ] Hipotez, tek birincil ölçüt, koruma ölçütleri, MDE (mutlak ve göreli), α, güç, örneklem ve süre deney
      başlamadan yazıldı ve tarihlendi.
- [ ] Süre tam haftalara yuvarlandı.
- [ ] Atama deney adıyla tuzlanmış özetle, doğru birimde ve kalıcı; analiz birimi aynı.
- [ ] İlk gün SRM denetimi yapıldı (mümkünse önce bir A/A testi).
- [ ] Birincil ölçüte bir kez ya da önceden planlı sıkı eşiklerle bakıldı.
- [ ] Sonuç; fark, %95 güven aralığı, göreli değişim, p değeri ve n ile raporlandı.
- [ ] Ek ölçüt ve segmentler "keşif" diye işaretli; çoklu karşılaştırma düzeltmesi uygulandı.
- [ ] Günlük etki grafiği yenilik etkisi için incelendi.
- [ ] Karar ve gerekçesi rapora yazıldı; plan ve rapor arşivde.

## Küçük modele yaptırırken

- **İsteme yazın:** "Deney planını şablona göre yaz. Örneklemi `grup_basina(taban, hedef)` ile hesapla (α=0,05,
  güç=0,80) ve süreyi tam haftaya yuvarla. Analizde önce SRM denetimini yap; sonra farkı, %95 güven aralığını,
  göreli değişimi ve p değerini ver. Koruma ölçütlerini ayrı tabloda göster. Segmentleri 'keşif' diye işaretle
  ve Holm düzeltmesi uygula. Deney bitmeden birincil ölçüt için 'kazandı' deme."
- **Modelin tipik hatası:** deney sürerken p < 0,05 görünce durdurmayı önerir; MDE'yi mutlak/göreli karıştırır;
  örneklemi grup başına değil toplam verir; olay düzeyinde analiz eder; "anlamlı değil"i "etkisi yok" diye yazar;
  sonuca bakıp tek yönlü teste geçer.
- **Çıktıda denetleyin:** plan tarihi başlangıçtan önce mi; n grup başına mı; güven aralığı var mı; SRM p değeri
  yazılı mı; kaç ölçüte bakıldı ve düzeltme yapıldı mı.
- **Sorun:** "Bu sonuç çıkmasaydı ne yapacaktık?" Yanıt aynıysa deneye gerek yoktu.

## İlgili

- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — p değeri, güven aralığı, etki büyüklüğü
- [Korelasyon ve nedensellik](korelasyon-ve-nedensellik.md) — deney yapılamadığında ne söylenebilir
- [Ürün ölçütleri](urun-olcutleri.md) — birincil ve koruma ölçütü seçimi
- [Olay izleme planı](olay-izleme-plani.md) — deney olayları (`deney_goruldu {deney, grup}`)
- [Analiz raporu yazma](analiz-raporu-yazma.md) — yüzde ↔ yüzde puan, yuvarlama
- Farkın güven aralığı için önyükleme (gruplu ve katmanlı): [`ml-temel/ml_temel/olcut/bootstrap.py`](../../ml-temel/ml_temel/olcut/bootstrap.py)
