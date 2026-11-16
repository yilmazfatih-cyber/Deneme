---
baslik: Analiz raporu yazma
ozet: Soru → yöntem → bulgu → sınırlılık → öneri düzeni, yönetici özeti, sayıları doğru yuvarlama, yüzde ile yüzde puan farkı ve Türkçe sayı biçimi; şablon ve kısa örnek.
etiketler: [rapor, analiz, yazim, yuvarlama, turkce, karar]
duzey: temel
guncellik: 2026-11
---

# Analiz raporu yazma

> Bu notu ne zaman okumalı: bir analizin sonucunu başkasına (ya da üç ay sonraki kendinize) yazarken; bir modelin
> yazdığı raporu onaylamadan önce; "%20 arttı" mı "20 puan arttı" mı diye duraksadığınızda.

## Temel fikir

Rapor bir **karar** için yazılır. İlk satırlar soruya yanıttır: kısa yanıt, öneri, ne kadar emin olunduğu (yönetici
özeti, executive summary). Okur yalnız ilk paragrafı okusa da doğru kararı verebilmelidir; yöntem ve ayrıntı sonra
gelir.

Düzen: **soru → kısa yanıt ve öneri → bulgular → yöntem → sınırlılıklar → sonraki adım**.

Her sayı birimi, dönemi, n'si ve karşılaştırmasıyla yazılır; belirsizlik aralıkla verilir; sayı anlamlı basamağa
yuvarlanır. Oranlar arasındaki fark **yüzde puandır** (percentage point): %10'dan %12'ye çıkan oran 2 puan, göreli
olarak %20 artmıştır. Fiiller kanıta uyar: gözlemsel bulguda "birlikte görülüyor", deneyde "artırdı". Sınırlılıklar
bölümü raporu zayıflatmaz, güvenilir kılar.

## Karar tablosu

| Durum | Nasıl yazılır | Neden |
| --- | --- | --- |
| Okurun bir dakikası var | İlk üç satır: yanıt, öneri, güven | Gerisini okumayabilir |
| İki oran karşılaştırılıyor | Mutlak fark puanla, göreli fark yüzdeyle: "2 puan (göreli %20)" | İkisi çok farklı izlenim verir |
| Küçük oranda büyük göreli değişim (%0,1 → %0,2) | Mutlak değeri öne çıkarın: "binde 1'den binde 2'ye" | "%100 arttı" abartır |
| Belirsizlik büyük | Aralıkla: "+0,2 ile +1,6 puan arası" | Tek sayı kesinlik izlenimi verir |
| Gözlemsel bulgu | "birlikte görülüyor", "ilişkili" | "Neden oldu" kanıtsız |
| Deney sonucu | "artırdı (%95 GA …)" | Kanıt nedensel |
| Etki bulunamadı | "Etki bulunamadı; en çok X olabilir" | "Etkisi yok" kanıtsız |
| Sayı tabloları | Sağa yaslı, aynı basamak, birim başlıkta, toplam satırı ayrık | Göz sütun boyunca karşılaştırır |

## Yuvarlama ve sayı biçimi

```python calistir
from decimal import ROUND_HALF_UP, Decimal

print("Python round:", round(2.5), round(3.5), round(2.675, 2))  # çoğu kişi 3, 4, 2.68 bekler


def yarim_yukari(x: float, basamak: int) -> Decimal:
    return Decimal(str(x)).quantize(Decimal(1).scaleb(-basamak), rounding=ROUND_HALF_UP)


print("yarım yukarı:", yarim_yukari(2.5, 0), yarim_yukari(3.5, 0), yarim_yukari(2.675, 2))


def tr_sayi(x: float, basamak: int = 1) -> str:
    yuvarlak = yarim_yukari(x, basamak)
    metin = f"{abs(yuvarlak):,.{basamak}f}".replace(",", " ").replace(".", ",").replace(" ", ".")
    return ("−" if yuvarlak < 0 else "") + metin


print("Türkçe biçim:", tr_sayi(1234567.891), "·", tr_sayi(-0.25), "·", "%" + tr_sayi(12.345), "·", tr_sayi(-0.04))
```

```cikti
Python round: 2 4 2.67
yarım yukarı: 3 4 2.68
Türkçe biçim: 1.234.567,9 · −0,3 · %12,3 · 0,0
```

Python'un `round` işlevi yarımları çifte yuvarlar (banker yuvarlaması) ve `2.675` gibi değerler ikili sistemde tam
yazılamadığı için beklenenden küçük çıkar. Raporda ve parada `Decimal` ile yarım yukarı yuvarlayın. Türkçe biçim:
binlik nokta, ondalık virgül, yüzde işareti önde (`%12,3`), eksi işareti `−`; sıfıra yuvarlanan negatif sayıya
işaret konmaz.

**Yüzdelerin toplamı 100 etmiyor.** Üç eşit pay ayrı ayrı yuvarlanınca %33,3 + %33,3 + %33,3 = %99,9 olur. En büyük
kalan yöntemi (largest remainder) toplamı korur:

```python calistir
def yuzdelere_bol(adetler: list[int], basamak: int = 1) -> list[float]:
    olcek = 10 ** basamak
    ham = [100 * olcek * a / sum(adetler) for a in adetler]
    taban = [int(h) for h in ham]
    eksik = 100 * olcek - sum(taban)
    for i in sorted(range(len(ham)), key=lambda i: ham[i] - taban[i], reverse=True)[:eksik]:
        taban[i] += 1  # kalanı en büyük olanlara birer birim dağıt
    return [t / olcek for t in taban]


adetler = [1, 1, 1]
ayri_ayri = [round(100 * a / sum(adetler), 1) for a in adetler]
print("ayrı ayrı yuvarlanmış:", ayri_ayri, "toplam", round(sum(ayri_ayri), 1))
print("en büyük kalan       :", yuzdelere_bol(adetler), "toplam", round(sum(yuzdelere_bol(adetler)), 1))

eski, yeni = 0.10, 0.12
print(f"oran %{100 * eski:.0f} → %{100 * yeni:.0f}: fark {100 * (yeni - eski):.0f} puan, göreli %{100 * (yeni / eski - 1):.0f} artış")
```

```cikti
ayrı ayrı yuvarlanmış: [33.3, 33.3, 33.3] toplam 99.9
en büyük kalan       : [33.4, 33.3, 33.3] toplam 100.0
oran %10 → %12: fark 2 puan, göreli %20 artış
```

**Anlamlı basamak:** sayı, belirsizliğinden daha kesin yazılmaz. ±1 puan belirsizlikli bir oran için "%12,3456"
değil "%12" yazılır; 10.214 sipariş tahmini "yaklaşık 10.200" olur. Aynı tabloda aynı basamak kullanılır.

**Sayıya ek:** "%20'si", "2026'da", "3'te" gibi ekler sayının okunuşuna göre seçilir; elle yazarken dikkat,
kodla üretirken hazır yardımcıyı kullanın (aşağıda bağlantı).

## Rapor şablonu

```markdown
# <Soru biçiminde başlık: Kısa kayıt formu kayıtları artırdı mı?>

**Kısa yanıt:** <bir cümle, sayıyla ve aralıkla>
**Öneri:** <ne yapılmalı>
**Güven:** <düşük / orta / yüksek> — <neden: kanıt türü, n, süre>

## Bulgular
1. <en önemli bulgu: sayı + birim + dönem + karşılaştırma + aralık>
2. <…>

## Yöntem
- Veri: <tablo/dosya, dönem, saat dilimi, n>
- Tanımlar: <ölçüt kartlarına bağlantı>
- Analiz: <sorgu/betik bağlantısı; kullanılan test ve aralık yöntemi>

## Sınırlılıklar
- <kapsam dışı kalanlar, varsayımlar, veri sorunları>

## Sonraki adım
- <kim, ne, ne zaman>
```

## Kısa örnek

Gözlemsel bir bulgunun dürüst yazımı:

```markdown
# Bildirim açanlar daha çok sipariş veriyor mu?

**Kısa yanıt:** Evet, birlikte görülüyor: Ekim'de bildirimi açan kullanıcıların %8,4'ü sipariş verdi, açmayanların
%3,1'i (5,3 puan fark; n = 18.240). Bu fark bildirimin etkisini göstermez.
**Öneri:** Bildirimin etkisini ölçmek için iki haftalık bir deney yapın: rastgele %50'ye bildirim gönderilmesin.
**Güven:** Düşük (nedensellik için): sipariş vermeye niyetli kullanıcılar bildirimi zaten daha çok açıyor olabilir.

## Bulgular
1. Bildirimi açanlarda sipariş oranı %8,4 (n = 4.120), açmayanlarda %3,1 (n = 14.120).
2. Fark son 30 günde etkin olan kullanıcılarla sınırlayınca 1,9 puana iniyor: farkın çoğu etkinlik düzeyinden geliyor.

## Sınırlılıklar
- Yalnız Ekim ayı; kampanya dönemi dahil değil. Kimlik birleştirme öncesi anonim kullanıcılar dışarıda.
```

İkinci bulgu raporun en değerli satırıdır: karıştırıcı bir değişkene göre katmanlayınca farkın büyük kısmı
kayboluyor ([korelasyon ve nedensellik](korelasyon-ve-nedensellik.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Dönüşüm %20 arttı" ama oran 10'dan 12'ye | Yüzde ile yüzde puan karıştı | "2 puan (göreli %20)" |
| "%12,3456" | Aşırı kesinlik | Belirsizliğe göre anlamlı basamak |
| Pasta dilimleri toplamı %99,9 | Ayrı ayrı yuvarlama | En büyük kalan yöntemi ya da dipnot |
| 2,5 → 2 yazıldı | Python `round` çifte yuvarlar | `Decimal` + `ROUND_HALF_UP` |
| "Ortalama sepet %300 arttı" | Tek büyük sipariş | Ortanca ve aykırıyı ayrıca söyleyin |
| "X tutmayı artırıyor" (gözlemsel veriyle) | Nedensellik dili | "Birlikte görülüyor"; deney önerin |
| "500 kişi şikâyet etti" | Payda ve dönem yok | "500 / 40.000 sipariş (%1,25), Ekim" |
| "Rekor ay!" | Seçilmiş karşılaştırma | Geçen yılın aynı ayı, son 12 ayın dağılımı |
| Sonuç raporun sonunda | Yöntem önce anlatılmış | Kısa yanıt en üstte |
| `1,234` mü `1.234` mü belli değil | İngilizce ve Türkçe biçim karışık | Tek biçim: Türkçe; birim başlıkta |
| "%-5", "−%5", "5% düşüş" bir arada | Tutarsız yazım | Tek yazım: "%5 düşüş" ya da "−%5" |
| "Anlamlı değil, etkisi yok" | Güç yetersiz | "Etki bulunamadı; en çok X olabilir" |
| Sınırlılık bölümü yok | Güven sorusu yanıtsız | Bölüm zorunlu; boş bırakılmaz |

## Denetim listesi

- [ ] İlk üç satırda kısa yanıt, öneri ve güven düzeyi var; yalnız onları okuyan doğru kararı verir.
- [ ] Başlık soru ya da bulgu; konu değil.
- [ ] Her sayının birimi, dönemi, n'si ve karşılaştırması var.
- [ ] Oran farkları puanla; göreli değişim ayrıca ve "göreli" diye yazıldı.
- [ ] Belirsizlik aralıkla verildi; bulunamayan etki "en çok X" diye yazıldı.
- [ ] Sayılar anlamlı basamakta, yarım yukarı yuvarlanmış, Türkçe biçimde (1.234,5; %12).
- [ ] Yüzde dağılımlarının toplamı 100 ya da dipnot var.
- [ ] Fiiller kanıt türüne uygun.
- [ ] Yöntem: veri kaynağı, dönem, saat dilimi, tanımlar, sorgu ya da betik bağlantısı.
- [ ] Sınırlılıklar ve sonraki adım (kim, ne, ne zaman) yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Raporu şu şablonla yaz: ilk üç satır kısa yanıt, öneri, güven. Oran farkını puanla ver, göreli
  değişimi ayrıca yaz. Her sayıya birim, dönem ve n ekle. Sayıları Türkçe biçimde (1.234,5 ve %12) ve anlamlı
  basamağa yuvarla; yuvarlamada yarım yukarı kullan. Gözlemsel bulguda 'neden oldu', 'sayesinde' deme.
  Sınırlılıklar bölümünü boş bırakma."
- **Modelin tipik hatası:** yöntemi uzun uzun anlatıp sonucu sona koyar; "%20 arttı" ile puanı karıştırır; dört
  ondalık basamak yazar; İngilizce sayı biçimi kullanır; `round` ile yarımları aşağı yuvarlar; nedensel fiil seçer;
  sınırlılıkları atlar; tabloları birimsiz bırakır.
- **Çıktıda denetleyin:** ilk paragraf tek başına karar verdiriyor mu; "%" geçen her cümlede puan/yüzde ayrımı
  doğru mu; sayılarda nokta ve virgül tutarlı mı; fiiller kanıta uygun mu.
- **Sorun:** "Bu raporu okuyan biri hangi kararı verecek ve neye ne kadar güvenecek?"

## İlgili

- [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md) — aralık ve "anlamlı değil" sonucun yazımı
- [A/B testi](ab-testi.md) — deney sonucu raporu şablonu
- [Korelasyon ve nedensellik](korelasyon-ve-nedensellik.md) — kanıta uygun fiil
- [Betimsel istatistik](betimsel-istatistik.md) — ortalama, ortanca, aykırı
- [Görselleştirme seçimi](gorsellestirme-secimi.md) — bulguyu söyleyen grafik başlığı
- [Pano tasarımı](pano-tasarimi.md) — tekrar eden raporun pano hâli
- Türkçe sayı biçimi (yarım yukarı yuvarlar): `format_number_tr` —
  [`kutuphane/py/kutuphane/sayi_yazi.py`](../../kutuphane/py/kutuphane/sayi_yazi.py); en büyük kalanla paylaştırma:
  `allocate` — [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py); sayıya kesmeyle ek
  ("%20'si", "2026'da"): `add_suffix` — [`kutuphane/py/kutuphane/ek.py`](../../kutuphane/py/kutuphane/ek.py)
- [Türkçe sayı ve para](../97-turkce/turkce-sayi-ve-para.md) — sayı biçimi, kuruş yuvarlama, en büyük kalan
- [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md) — yuvarlama kipleri, Decimal
- [Teknik yazı](../00-yontem/teknik-yazi.md) — açık ve kısa yazmanın genel kuralları
- [Keşifsel veri analizi](kesifsel-veri-analizi.md) — raporun yöntem bölümüne giren veri notu
