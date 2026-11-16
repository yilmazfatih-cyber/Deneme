---
baslik: Korelasyon ve nedensellik
ozet: Karıştırıcı değişken, Simpson paradoksu, seçim ve hayatta kalan yanlılığı, ortalamaya dönüş, çarpışan değişken ve sahte eğilim korelasyonu; çalışan örnekler ve nedensel sonuç için gerekenler.
etiketler: [istatistik, nedensellik, korelasyon, yanlilik, analiz, deney]
duzey: orta
guncellik: 2026-11
---

# Korelasyon ve nedensellik

> Bu notu ne zaman okumalı: "X'i kullananlar daha çok kalıyor, herkese X'i gösterelim" türünden bir öneri
> geldiğinde; bir müdahaleden sonra sayı iyileştiğinde ve bunu müdahaleye bağlamadan önce; segment kırılımı genel
> sonuçla çeliştiğinde.

## Temel fikir

Korelasyon: iki şey birlikte değişiyor. Nedensellik: birini değiştirince öteki değişiyor. Ürün kararları
ikincisini ister: "X'i herkese gösterirsek tutma artar mı?"

Gözlemsel veride birliktelik beş yoldan doğar: X → Y (aradığımız); Y → X (ters neden); Z hem X'i hem Y'yi
etkiler (**karıştırıcı**, confounder); yalnız bir alt gruba bakıyoruz (**seçim**); şans. Rastgele deney ilk dördünü
ayırmanın tek güvenilir yoludur ([A/B testi](ab-testi.md)). Deney yoksa varsayımlarınızı yazarak daha zayıf bir
sonuç çıkarırsınız.

Ürün analizindeki en yaygın hata **kendi kendini seçmedir** (self-selection): bir özelliği kullananlar zaten farklı
insanlardır (daha istekli, daha deneyimli, daha çok ihtiyacı olan).

## Karar tablosu

| Elinizdeki kanıt | Söyleyebileceğiniz | Dayandığı varsayım |
| --- | --- | --- |
| Rastgele deney | "X, Y'yi şu kadar değiştirdi (GA ile)" | Atama gerçekten rastgele, gruplar birbirini etkilemiyor |
| Kademeli yayın + yayın almayan karşılaştırma grubu | Farkların farkıyla (difference-in-differences) etki tahmini | X olmasa iki grup aynı eğilimde giderdi (paralel eğilim) |
| Eşik kuralı (100 TL üstü kargo bedava) | Eşiğin hemen altı ↔ hemen üstü karşılaştırması (regression discontinuity) | Eşiğe yakın kişiler başka açıdan benzer |
| Yalnız öncesi–sonrası | "Sonra daha iyi"; neden olarak X'i söyleyemezsiniz | Mevsim, kampanya, ortalamaya dönüş elenmedi |
| Kullananlar ↔ kullanmayanlar | "Birlikte görülüyor" | Kendi kendini seçme elenmedi |
| Yalnız kalan müşteriler ya da anketi yanıtlayanlar | O alt grubu anlatır, bütünü değil | Hayatta kalan / seçim yanlılığı |

## Karıştırıcı değişken

İstekli kullanıcılar hem özelliği daha çok kullanıyor hem daha çok kalıyor. Özelliğin tutmaya etkisi **sıfır**:

```python calistir
import random

r = random.Random(4)
kullanicilar = []
for _ in range(20000):
    istekli = r.random() < 0.3  # karıştırıcı: kullanıcının isteği
    ozellik = r.random() < (0.6 if istekli else 0.1)  # istekli olan özelliği daha çok kullanır
    kaldi = r.random() < (0.7 if istekli else 0.3)  # tutma YALNIZ isteğe bağlı
    kullanicilar.append((istekli, ozellik, kaldi))


def tutma(kosul) -> float:
    secili = [k for k in kullanicilar if kosul(k)]
    return 100 * sum(k[2] for k in secili) / len(secili)


print(f"genel: özelliği kullanan %{tutma(lambda k: k[1]):.0f}, kullanmayan %{tutma(lambda k: not k[1]):.0f}")
for grup in (True, False):
    ad = "istekli" if grup else "isteksiz"
    print(f"{ad:8s}: özelliği kullanan %{tutma(lambda k: k[0] == grup and k[1]):.0f}, "
          f"kullanmayan %{tutma(lambda k: k[0] == grup and not k[1]):.0f}")
```

```cikti
genel: özelliği kullanan %58, kullanmayan %37
istekli : özelliği kullanan %69, kullanmayan %70
isteksiz: özelliği kullanan %27, kullanmayan %31
```

Genel karşılaştırma 21 puanlık bir "etki" gösteriyor; isteklilik katmanında fark kayboluyor. Gerçek veride
"istek" doğrudan ölçülmez; yerine geçen ölçüler (ilk hafta etkinliği, kayıt kaynağı, plan) ile katmanlanır ve
ölçülemeyen karıştırıcılar için sonuç "en iyi durumda bir üst sınır" diye okunur.

## Simpson paradoksu

Yeni karşılama akışı (B) önce mobilde yayına alındı. Platform kırılımı ile genel sonuç zıt:

```sql calistir
CREATE TABLE sonuc (surum TEXT, platform TEXT, kullanici INTEGER, tamamlayan INTEGER);
INSERT INTO sonuc VALUES ('A', 'mobil', 200, 60), ('B', 'mobil', 800, 280),
  ('A', 'masaustu', 800, 560), ('B', 'masaustu', 200, 150);
SELECT 'genel', surum, round(100.0 * SUM(tamamlayan) / SUM(kullanici), 1) FROM sonuc GROUP BY surum;
SELECT platform, surum, round(100.0 * tamamlayan / kullanici, 1) FROM sonuc ORDER BY platform, surum;
-- Aynı platform karışımıyla (yarı mobil, yarı masaüstü) karşılaştırma: doğrudan standartlaştırma
SELECT 'eşit karışım', surum, round(SUM(0.5 * 100.0 * tamamlayan / kullanici), 1) FROM sonuc GROUP BY surum;
```

```cikti
genel|A|62.0
genel|B|43.0
masaustu|A|70.0
masaustu|B|75.0
mobil|A|30.0
mobil|B|35.0
eşit karışım|A|50.0
eşit karışım|B|55.0
```

B iki platformda da 5 puan iyi, genelde 19 puan kötü: B'nin kullanıcılarının %80'i tamamlama oranı düşük olan
mobilden geliyor. Hangisi doğru? Platform, sürümün **sonucu** değil, kimin hangi sürümü göreceğinin **nedeni**
(yayın mobilde başladı); öyleyse karıştırıcıdır ve katmanlara bakılır: B daha iyi. Platformu sürüm değiştirseydi
(ör. B kullanıcıları masaüstüne geçirseydi) genel sonuca bakılırdı. Karar veriden değil, nedensel yapıdan çıkar.

## Hayatta kalan ve seçim yanlılığı

Hayatta kalan yanlılığı (survivorship bias): ürün hiç değişmese de, mutsuz olanlar ayrıldıkça kalanların memnuniyet
ortalaması yükselir:

```python calistir
import random
import statistics as st

r = random.Random(6)
memnuniyet = [r.random() for _ in range(10000)]  # 0–1; ürün hiç değişmiyor
for ay in range(0, 13, 3):
    print(f"ay {ay:2d}: kalan {len(memnuniyet):5d} müşteri, ortalama memnuniyet {st.fmean(memnuniyet):.2f}".replace(".", ","))
    for _ in range(3):  # üç ay ilerle; mutsuz olan daha çok ayrılır
        memnuniyet = [m for m in memnuniyet if r.random() > 0.3 * (1 - m)]
```

```cikti
ay  0: kalan 10000 müşteri, ortalama memnuniyet 0,50
ay  3: kalan  6350 müşteri, ortalama memnuniyet 0,58
ay  6: kalan  4394 müşteri, ortalama memnuniyet 0,66
ay  9: kalan  3226 müşteri, ortalama memnuniyet 0,72
ay 12: kalan  2524 müşteri, ortalama memnuniyet 0,77
```

"Müşteri memnuniyeti yıl içinde 0,50'den 0,77'ye çıktı" cümlesi doğru ama ürünle ilgisiz. Aynı yanlılığın
akrabaları: anketi yalnız çok memnun ya da çok kızgın olanların yanıtlaması; "başarılı uygulamaların hepsi X
yapmış" (başarısız olanlar örneklemde yok); yalnız karşılama akışını bitirenlerin analizi. Çözüm: analiz kitlesini
**başlangıçtaki** gruptan (kohort) kurun; ayrılanları ve yanıt vermeyenleri dışarıda bırakmayın; yanıt oranını yazın.

## Ortalamaya dönüş

Ortalamaya dönüş (regression to the mean). Mağaza puanları = kalıcı kalite + o ayın şansı. Birinci ayın en kötü 10
mağazası seçilir ve **hiçbir şey yapılmaz**:

```python calistir
import random
import statistics as st

r = random.Random(9)
kalite = [r.gauss(4.0, 0.2) for _ in range(100)]  # gerçek kalite, değişmiyor
ay1 = [k + r.gauss(0, 0.3) for k in kalite]  # ölçüm = kalite + şans
ay2 = [k + r.gauss(0, 0.3) for k in kalite]
sira = sorted(range(100), key=lambda i: ay1[i])
for ad, grup in (("en kötü 10", sira[:10]), ("en iyi 10", sira[-10:])):
    once, sonra = st.fmean(ay1[i] for i in grup), st.fmean(ay2[i] for i in grup)
    print(f"{ad}: birinci ay {once:.2f} → ikinci ay {sonra:.2f}".replace(".", ","))
```

```cikti
en kötü 10: birinci ay 3,34 → ikinci ay 3,68
en iyi 10: birinci ay 4,57 → ikinci ay 4,17
```

En kötüler "düzeldi", en iyiler "geriledi". En kötü 10 mağazaya eğitim verilseydi düzelme eğitime yazılırdı.
Uç değerlere göre seçilmiş her grupta (en çok şikâyet alanlar, en yavaş günler, en düşük puanlı ürünler) bu olur.
Çözüm: seçilen grubun yarısına rastgele müdahale edin, yarısını karşılaştırma grubu bırakın.

## Çarpışan değişken ve sahte eğilim

**Çarpışan değişken** (collider): iki bağımsız özelliğin ortak sonucuna göre süzerseniz aralarında ilişki doğar.
**Eğilim:** zamanla artan iki seri, birbiriyle ilgisiz olsa da güçlü korelasyon gösterir.

```python calistir
import random
import statistics as st

r = random.Random(1)
aday = [(r.gauss(0, 1), r.gauss(0, 1)) for _ in range(5000)]  # (teknik beceri, iletişim): bağımsız
secilen = [(a, b) for a, b in aday if a + b > 1.5]  # işe alım: toplamı yüksek olanlar
kor = lambda x, y: round(st.correlation(x, y), 2) + 0.0  # + 0.0: "-0,00" yazılmasın
print(f"bütün adaylarda korelasyon {kor(*zip(*aday)):+.2f}, işe alınanlarda {kor(*zip(*secilen)):+.2f}".replace(".", ","))

kullanici, maliyet = [1000.0], [500.0]
for _ in range(99):  # iki bağımsız seri, ikisi de büyüyor
    kullanici.append(kullanici[-1] + 10 + r.gauss(0, 15))
    maliyet.append(maliyet[-1] + 5 + r.gauss(0, 8))
fark = lambda s: [b - a for a, b in zip(s, s[1:])]
print(f"düzeyler arası korelasyon {kor(kullanici, maliyet):+.2f}, "
      f"günlük değişimler arası {kor(fark(kullanici), fark(maliyet)):+.2f}".replace(".", ","))
```

```cikti
bütün adaylarda korelasyon +0,00, işe alınanlarda -0,67
düzeyler arası korelasyon +0,98, günlük değişimler arası +0,07
```

İşe alınanlar arasında "teknik olanlar iletişimde zayıf" görünür; bu, seçimin ürünüdür. Ürün karşılığı: "uygulama
mağazasında öne çıkanlar arasında tasarım ile özellik sayısı ters ilişkili" ya da "yalnız yorum yazanlar arasında
fiyat ile puan ters ilişkili". Eğilimli serilerde düzeyleri değil değişimleri ilişkilendirin.

## Nedensel sonuç için ne gerekir

1. **Zaman sırası:** neden, sonuçtan önce gelir (olay zamanlarıyla gösterilir).
2. **Karşı-olgusal:** "X olmasaydı ne olurdu?" sorusunun yanıtı olan bir karşılaştırma grubu.
3. **Karıştırıcılar:** listelendi; ölçülenler katmanlandı ya da ayarlandı; ölçülemeyenler sınır olarak yazıldı.
4. **Mekanizma:** etkinin nasıl oluştuğuna dair makul bir açıklama.
5. **Doz–yanıt:** daha çok X, daha çok Y (varsa güçlü ipucu).
6. **Sağlamlık:** başka dönemde, başka tanımla, başka segmentte aynı yön.
7. **Mümkünse deney.** Deney mümkün değilse farkların farkı ya da eşik karşılaştırması gibi yarı deneysel yollar:

```sql calistir
CREATE TABLE satis (sehir TEXT, donem TEXT, siparis INTEGER);
INSERT INTO satis VALUES ('İzmir', 'önce', 1000), ('İzmir', 'sonra', 1300),
  ('Bursa', 'önce', 900), ('Bursa', 'sonra', 1035);
-- İzmir'de ücretsiz kargo başladı; Bursa karşılaştırma şehri. Varsayım: kargo olmasa İzmir de Bursa gibi artardı.
SELECT 'yalnız öncesi-sonrası', (SELECT siparis FROM satis WHERE sehir = 'İzmir' AND donem = 'sonra')
  - (SELECT siparis FROM satis WHERE sehir = 'İzmir' AND donem = 'önce');
SELECT 'farkların farkı (oransal)', round(100.0 * (1300.0 / 1000 - 1035.0 / 900), 1) || ' puan';
```

```cikti
yalnız öncesi-sonrası|300
farkların farkı (oransal)|15.0 puan
```

Öncesi–sonrası "+300 sipariş (+%30)" diyor; Bursa aynı dönemde kargo olmadan %15 büyüdü, öyleyse kargonun payı
yaklaşık 15 puandır. Bu yalnız paralel eğilim varsayımı tutarsa doğrudur: önceki aylarda iki şehrin seyrini
çizip benzer gittiklerini gösterin.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "X'i kullananlar iki kat daha çok kalıyor" | Kendi kendini seçme | Deney; yoksa etkinlik düzeyine göre katmanlama |
| Segmentlerde B iyi, genelde kötü | Simpson: gruplarda karışım farklı | Katmanlara bakın; karışımı ve nedensel yapıyı yazın |
| Müdahaleden sonra en kötüler düzeldi | Ortalamaya dönüş | Rastgele karşılaştırma grubu |
| Memnuniyet ortalaması yıl yıl artıyor | Hayatta kalan yanlılığı | Kohort bazında, ayrılanlar dahil |
| Anket "kullanıcılar çok memnun" diyor | Yanıtlayanlar seçilmiş | Yanıt oranı; yanıtlamayanların davranışı |
| Kampanyadan sonra satış arttı | Mevsim, eş zamanlı başka olay | Karşılaştırma grubu; geçen yılın aynı dönemi |
| "Bildirimi açanlar daha çok alıyor" | Ters neden: niyetli olan bildirimi açar | Bildirimi rastgele gönderin |
| Seçilmiş grupta beklenmedik ters ilişki | Ortak sonuca göre süzme (çarpışan) | Süzmeden önceki veride bakın |
| İki seri neredeyse kusursuz ilişkili | İkisi de zamanla büyüyor | Değişimleri ilişkilendirin |
| Güçlü korelasyon tek noktadan geliyor | Aykırı değer | Saçılım grafiğine bakın |

## Denetim listesi

- [ ] Önerilen eylem nedensel bir iddiaya dayanıyorsa kanıt türü yazıldı (deney, yarı deney, gözlem).
- [ ] Olası karıştırıcılar listelendi; ölçülenlere göre katmanlı sonuç verildi.
- [ ] Segment sonuçları genel sonuçla karşılaştırıldı; karışım farkı açıklandı.
- [ ] Uç değere göre seçilmiş grupların karşılaştırma grubu var.
- [ ] Analiz kitlesinin dışarıda bıraktıkları (ayrılanlar, yanıt vermeyenler) yazıldı.
- [ ] Zaman serisi korelasyonunda eğilim ayıklandı.
- [ ] Sonuç cümlesinin fiili kanıta uygun: "birlikte görülüyor" ↔ "artırdı".

## Küçük modele yaptırırken

- **İsteme yazın:** "Bulgunun yanına kanıt türünü yaz (deney / yarı deney / gözlem). Gözlemsel veride 'neden
  oldu', 'artırdı', 'sayesinde' deme; 'birlikte görülüyor' de. Olası üç karıştırıcıyı ve her birini eleyecek
  analizi öner. Segment kırılımını genel sonuçla karşılaştır; çelişirse karışımı göster."
- **Modelin tipik hatası:** kullananlar–kullanmayanlar karşılaştırmasından "özellik tutmayı artırıyor" der;
  öncesi–sonrası farkını müdahaleye bağlar; en kötüleri seçip iyileşmeyi müdahaleye yazar; eğilimli iki seriyi
  ilişkilendirir; yalnız kalan müşterilerle "müşteri" hakkında konuşur.
- **Çıktıda denetleyin:** sonuç cümlelerindeki fiiller; karşılaştırma grubu var mı; seçim ölçütü sonuçla ilişkili mi.
- **Sorun:** "Bu ilişkiyi, X'in hiçbir etkisi olmasa da üretebilecek bir açıklama var mı?"

## İlgili

- [A/B testi](ab-testi.md) — nedensel sonucun en güvenilir yolu
- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — şansı elemek
- [Betimsel istatistik](betimsel-istatistik.md) — oranların ortalaması, Simpson'un yakın akrabası
- [Ürün ölçütleri](urun-olcutleri.md) — kohort bazlı tutma
- [Veri sızıntısı](../80-ml/veri-sizintisi.md) — modelde "gelecekten bilgi" hatası, aynı dikkat türü
- Gözlemsel bir karşılaştırma örneği (kampanya günleri ↔ sıradan günler):
  [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md) 5. tarif
- [Olasılık temelleri](../92-matematik/olasilik-temelleri.md) — koşullu olasılık ve Bayes kuralı
- [Anket ve örneklem](anket-ve-orneklem.md) — yanıt vermeme yanlılığı ve ağırlıklandırma
