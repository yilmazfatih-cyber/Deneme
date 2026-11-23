---
baslik: Fiyat deneyleri
ozet: Fiyatı ön satış, kademeli teklif, fiyatlı sahte kapı ve rastgele deneyle sınamak; esneklik ve kâr hesabı, ziyaretçi başı gelirin gürültüsü, abonelikte uzun vade; etik ve yasal sınırlar (genel); çalışan hesaplar.
etiketler: [urun, fiyatlandirma, deney, esneklik, olcum, etik]
duzey: orta
guncellik: 2026-11
---

# Fiyat deneyleri

> Bu notu ne zaman okumalı: ilk fiyat konduktan sonra "daha yüksek mi, daha düşük mü olmalı?" sorusunda; fiyat ya
> da paket değişikliği yayına girmeden önce; "%20 indirimle satışlar arttı, indirim kalsın" sonucu çıkarılırken.
> **Hukuki ve mali danışmanlık değildir.** Tüketiciye satışta fiyat gösterimi, indirim duyurusu ve kişisel veriyle
> fiyatlama kurallarını bir hukukçuyla doğrulayın.

## Temel fikir

Fiyat deneyinin sorusu "kaç kişi alır?" değil, **"ziyaretçi başına, belli bir ufukta ne kadar kâr kalır?"**dır.
Fiyat dört şeyi birden değiştirir: dönüşüm, satış başına kâr, kalma süresi (abonelikte kayıp) ve gelen müşterinin
türü. Yalnız dönüşüme bakan her deney en düşük fiyatı seçer; yalnız ilk ödemeye bakan abonelik deneyi yüksek fiyatın
getirdiği erken kaybı göremez.

İkinci gerçek: fiyat deneyi **gürültülüdür**. Ziyaretçilerin çoğu hiçbir şey almadığı için ziyaretçi başı gelir
"çoğu sıfır, arada büyük" bir sayıdır; küçük ürünler ince fiyat farkını istatistikle ayırt edemez. Bu yüzden
yöntemler bir merdivendir: ucuz ve kaba olandan (görüşme, ön satış) pahalı ve kesin olana (rastgele deney).

Üçüncü gerçek: fiyat güven meselesidir. Aynı ürünü aynı anda iki kişiye farklı fiyattan satmak teknik olarak
kolaydır; ortaya çıkınca güveni ve bazı durumlarda yasal uyumu bozar. Deney, sonuçlanınca herkese açıklanabilecek
biçimde kurulur.

## Karar tablosu

| Soru / durum | Yöntem | Ne kanıtlar | Risk |
| --- | --- | --- | --- |
| Henüz ürün yok, fiyat aralığı belirsiz | Görüşme + fiyat soruları ("hangi fiyatta pahalı gelir?") | Kabaca aralık | Söylenen ödeme isteği gerçek ödemeden yüksek çıkar |
| Ürün yeni, az müşteri (onlar) | Ön satış: eşleştirilmiş gruplara farklı fiyatla gerçek teklif | Gerçek para; kaba düzey | Küçük örneklem; teklifler belgeli olmalı |
| Tanıtım sayfası var, trafik orta | Fiyatlı sahte kapı ya da kademeli teklif (hafta hafta fiyat) | Fiyat görenin tıklama/kayıt eğilimi | Zaman karışıklığı; dürüst ret iletisi şart |
| Trafik büyük, değişiklik geri alınabilir | Rastgele deney (yalnız yeni ziyaretçi) | Nedensel fark | Etik ve yasal sınırlar (aşağıda) |
| Fiyatın kendisini değil yapıyı sınamak | Paket içeriği, yıllık indirim oranı, deneme süresi deneyi | Daha az hassas, aynı değer sorusu | Paket karmaşası |
| İndirimin etkisi | Herkese açık kampanya kodu, kontrol grubuyla | Kampanyanın ek satışı | İndirim alışkanlığı; "zaten alacaktı" kitlesi |
| Kurumsal satış | Teklif kademeleri, kazan/kaybet kaydı | Pazarlıkta fiyat direnci | Satış görüşmesinin etkisi karışır |

## Yöntemleri doğru yapmak

- **Görüşmede fiyat:** "Bu ürünü alır mıydınız?" sorusu yanıt vermez. Bugünkü harcamayı (alternatifin bedelini)
  sorun; fiyat sorularını yalnız deneyin **aralığını** belirlemek için kullanın ([kullanıcı görüşmesi](kullanici-gorusmesi.md)).
- **Ön satış:** aynı nitelikte iki-üç aday listesi kurun (rastgele bölün), her listeye bir fiyatla gerçek teklif
  götürün (iadeli kapora, ilk ay ödemesi, imzalı niyet). Teklif metni yazılı ve aynı olsun; yalnız fiyat değişsin
  ([fikir doğrulama](fikir-dogrulama.md)).
- **Fiyatlı sahte kapı:** paket sayfasında fiyat gösterilir; "Satın al"a basana dürüst ileti: "Bu paket henüz açılmadı.
  Açılınca bu fiyattan ilk siz alın: e-posta bırakın." Ödeme bilgisi istenmez.
- **Kademeli teklif:** hafta 1 fiyat A, hafta 2 fiyat B… Zaman, mevsim ve kanal karışır; aynı kanaldan, aynı gün
  dağılımıyla, A-B-A-B sırasıyla tekrarlayın. Yalnız büyük farkları ayırt eder.
- **Rastgele deney:** yalnız **yeni** ziyaretçiler; atama kimlik özetiyle ve kalıcı (aynı kişi her cihazda aynı
  fiyatı görür); tanıtım sayfası, sepet ve ödeme aynı fiyatı gösterir; deney planı yayından önce yazılır
  ([A/B testi](../70-veri/ab-testi.md)).

## Esneklik ve kâr: hangi fiyat "kazandı"?

Üç fiyat, her biri 1.000 ziyaretçi; satış başına değişken maliyet 80 TL (kurgusal):

```python calistir
import math

UNIT_COST = 80  # satış başına değişken maliyet, TL (kurgusal)
arms = {199: (60, 1000), 249: (50, 1000), 299: (40, 1000)}  # fiyat → (satın alan, ziyaretçi): kurgusal deney


def wilson(k, n, z=1.96):
    p = k / n
    c, h = (p + z * z / (2 * n)) / (1 + z * z / n), z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return 100 * (c - h), 100 * (c + h)


print("fiyat  dönüşüm (%95 aralık)     1000 ziyaretçide ciro   kâr")
for price, (k, n) in arms.items():
    low, high = wilson(k, n)
    revenue, profit = 1000 * k / n * price, 1000 * k / n * (price - UNIT_COST)
    print(f"{price:5d}  %{100 * k / n:.1f} (%{low:.1f}–%{high:.1f})        {revenue:8.0f}    {profit:7.0f}")
prices = sorted(arms)
for p1, p2 in zip(prices, prices[1:]):  # yay esnekliği: orta noktaya göre yüzde değişimlerin oranı
    q1, q2 = arms[p1][0], arms[p2][0]
    elasticity = ((q2 - q1) / ((q1 + q2) / 2)) / ((p2 - p1) / ((p1 + p2) / 2))
    print(f"{p1} → {p2}: esneklik {elasticity:.2f} ({'ciro artar' if elasticity > -1 else 'ciro azalır'})")
```

```cikti
fiyat  dönüşüm (%95 aralık)     1000 ziyaretçide ciro   kâr
  199  %6.0 (%4.7–%7.6)           11940       7140
  249  %5.0 (%3.8–%6.5)           12450       8450
  299  %4.0 (%3.0–%5.4)           11960       8760
199 → 249: esneklik -0.81 (ciro artar)
249 → 299: esneklik -1.22 (ciro azalır)
```

Okuma:

- Dönüşüme bakan 199 TL'yi, ciroya bakan 249 TL'yi, kâra bakan 299 TL'yi seçer. Karar ölçütü kâr (ve abonelikte
  aşağıdaki gibi ufuklu kâr) olmalıdır; yazılmazsa ekip farkında olmadan cirosu ya da dönüşümü eniyiler.
- Esneklik −1'den küçükse (mutlak değeri 1'den büyükse) fiyat artışı ciroyu azaltır; kâr maliyet yüzünden yine de
  artabilir.
- **Ama bu deney bir şey kanıtlamıyor:** dönüşüm aralıkları örtüşüyor (%4,7–7,6 ile %3,0–5,4). 1.000 ziyaretçiyle
  görülen sıra şans olabilir. Tablo "neyi ölçeceğimizi" gösterir; kararı yeterli örneklem verir.

## Gürültü ve uzun vade

```python calistir
import math

# 1) Ziyaretçi başı gelir (çoğu sıfır) çok gürültülüdür: fark küçükse gereken ziyaretçi çok büyür
A, B = (100, 0.050), (120, 0.044)  # (fiyat, dönüşüm): kurgusal
rpv = lambda price, conv: price * conv
var = lambda price, conv: price * price * conv * (1 - conv)  # ziyaretçi başı gelirin varyansı
diff = rpv(*B) - rpv(*A)
n = math.ceil((1.96 + 0.84) ** 2 * (var(*A) + var(*B)) / diff**2)  # %5 anlamlılık, %80 güç
print(f"ziyaretçi başı gelir: {rpv(*A):.2f} → {rpv(*B):.2f} TL; farkı görmek için grup başına ~{n} ziyaretçi")

# 2) Abonelikte ilk ay kazanan, 12 ayda kaybedebilir: fiyat kaybı da değiştirir
COST = 30  # hesap başına aylık doğrudan maliyet, TL


def gross_per_visitor(price, conv, churn, months=12):
    return conv * (price - COST) * sum((1 - churn) ** m for m in range(months))


for name, (price, conv, churn) in {"149 TL": (149, 0.050, 0.06), "199 TL": (199, 0.042, 0.11)}.items():
    print(f"{name}: ilk ay ziyaretçi başı {conv * (price - COST):.2f} TL, 12 ayda {gross_per_visitor(price, conv, churn):.2f} TL")
```

```cikti
ziyaretçi başı gelir: 5.00 → 5.28 TL; farkı görmek için grup başına ~108073 ziyaretçi
149 TL: ilk ay ziyaretçi başı 5.95 TL, 12 ayda 51.97 TL
199 TL: ilk ay ziyaretçi başı 7.10 TL, 12 ayda 48.59 TL
```

Okuma:

- %20 fiyat farkının ziyaretçi başı gelire %5,6'lık etkisini görmek için grup başına ~108 bin ziyaretçi gerekiyor.
  Bu trafiği olmayan ürün ince fiyat farkını rastgele deneyle ölçemez: farkı büyütün (örneğin 199 ↔ 299), ön satış
  ve görüşmeyle karar verin ya da kararı "geri alınabilir değişiklik + izleme" olarak alın.
- Abonelikte 199 TL ilk ay %19 önde, 12 ayın sonunda %6,5 geride: yüksek fiyat daha çabuk ayrılan müşteri getirdi.
  Kayıp oranı kol başına aylarca ölçülmeden kesin karar verilmez; ara kararlar için ilk ay iptali ve ilk yenileme
  oranı izlenir, son karar kohortlar olgunlaşınca ([birim ekonomisi ve LTV](../70-veri/birim-ekonomisi-ve-ltv.md)).
- Rakamlar kurgusaldır; yöntem kalıcıdır: ölçüt = ziyaretçi başı, ufuklu, brüt kâr.

## Etik ve yasal sınırlar (genel)

| Yapmayın | Neden | Bunun yerine |
| --- | --- | --- |
| Aynı kişiye farklı zamanlarda/cihazlarda farklı fiyat göstermek | Fark edilir, güveni yıkar | Kalıcı atama: kişi hep aynı fiyatı görür |
| Var olan müşterinin fiyatını habersiz değiştirmek | Sözleşme ve güven sorunu | Yalnız yeni ziyaretçi; mevcut müşteriye önceden duyuru ([fiyatlandırma](fiyatlandirma.md)) |
| Kişisel veriye (konum, cihaz, gelir tahmini) göre bireysel fiyat | KVKK ve ayrımcılık riski; açıklanamaz | Herkese açık paketler ve kampanyalar |
| Sayfada bir fiyat, ödemede başka fiyat | Yanıltıcı; tüketici mevzuatıyla çatışabilir | Tanıtım, sepet ve ödeme aynı fiyat; KDV dahil gösterim |
| Hiç uygulanmamış "eski fiyat" üstüne indirim | Yanıltıcı indirim | Gerçek önceki fiyat; kuralın ayrıntısını (süre, en düşük fiyat) güncel mevzuattan doğrulayın (doğrulanmadı) |
| Deney bitince yüksek fiyattan alanları unutmak | Haksızlık algısı | Farkı iade edin ya da kazanan fiyata geçirin; bunu baştan plana yazın |
| Hassas kitleye (sağlık, sosyal amaçlı ürün) fiyat deneyi | Erişimi engelleyebilir | Kurum/hibe modelini sınayın ([fiyatlandırma](fiyatlandirma.md)) |

Deneyin yasal değerlendirmesi ürün, kitle (tüketici ↔ işletme) ve kanala göre değişir; planı yayından önce bir
hukukçuya gösterin ve tarihiyle kaydedin ([yasal temel belgeler](yasal-temel-belgeler.md)).

## Deney kartı

```text
Fiyat deneyi kartı — 2026-11-23 (deneyden ÖNCE doldurulur; sonradan değiştirilmez)
Soru:          "İşletme" paketi 349 TL yerine 399 TL olursa 12 aylık ziyaretçi başı brüt kâr artar mı?
Kitle:         Yalnız YENİ ziyaretçiler (tanıtım sayfası → kayıt). Mevcut müşterinin fiyatı değişmez.
Atama:         Ziyaretçi kimliğinin özeti, %50/%50, kalıcı; giriş yapınca hesapla eşlenir.
Birincil:      Ziyaretçi başı brüt kâr: ilk 3 ay gözlenen + kohort eğrisiyle 12 ay kestirimi.
Koruma:        İlk ay iptali, iade talebi, fiyatla ilgili destek talebi, ödeme adımında terk.
Örneklem/süre: Grup başına N ziyaretçi (hesap ekte); ara bakışta karar yok.
Etik:          Deney bitince 399 TL ödeyenler kazanan fiyata geçirilir, fark iade edilir.
Hukuk:         Plan 2026-11-20'de hukukçuya gösterildi (kayıt: …).
Karar kuralı:  Birincil ölçüt 399 lehine ve hiçbir koruma ölçütünde belirgin bozulma yoksa 399.
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| En düşük fiyat hep "kazanıyor" | Ölçüt dönüşüm | Ölçüt ziyaretçi başı kâr; ufuk yazılı |
| Yüksek fiyat ilk ay kazandı, yıl sonunda gelir düştü | Kayıp oranı fiyata bağlı | Kohortlar olgunlaşana kadar izleyin; ilk yenileme oranı |
| Deney iki hafta sürdü, sonuç "anlamlı değil" | Ziyaretçi başı gelir çok gürültülü | Örneklem hesabı önce; daha büyük fark ya da başka yöntem |
| Kullanıcılar sosyal medyada farklı fiyat ekran görüntüsü paylaştı | Kalıcı atama yok ya da mevcut müşteriler deneyde | Yalnız yeni ziyaretçi; kalıcı atama; açıklama metni hazır |
| İndirim döneminde satış patladı, indirim kalıcı oldu | "Zaten alacaktı" kitlesi ve öne çekilen satış | Kontrol grubu; indirim sonrası haftalara da bakın |
| Görüşmede herkes "bu fiyata alırım" dedi, kimse almadı | Söylenen ödeme isteği ≠ gerçek ödeme | Ön satış; gerçek para |
| Kademeli teklifte ikinci hafta çok iyi | Kampanya, maaş günü ya da kanal değişti | A-B-A-B sırası; aynı kanal; olay listesi |
| Sepette farklı fiyat çıktı | Deney yalnız tanıtım sayfasına uygulandı | Tanıtım, sepet, ödeme tek fiyat kaynağından |

## Denetim listesi

- [ ] Karar ölçütü yazıldı: ziyaretçi başı brüt kâr ve ufku (abonelikte 12 ay kestirimi).
- [ ] Yöntem merdivende doğru basamakta; rastgele deneyse grup başına örneklem önceden hesaplandı.
- [ ] Deney yalnız yeni ziyaretçide; atama kalıcı; tanıtım, sepet ve ödeme aynı fiyatı gösteriyor.
- [ ] Koruma ölçütleri (iptal, iade, destek, ödeme terki) tanımlı ve izleniyor.
- [ ] Deney sonrası yüksek fiyattan alanlar için plan (iade/geçiş) yazılı.
- [ ] Plan yayından önce hukukçuya gösterildi; kişisel veriye göre bireysel fiyat yok.
- [ ] Sonuç raporu aralıklarla; "anlamlı değil" sonucu da kaydedildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Fiyat deneyini yalnız yeni ziyaretçilere, kimlik özetiyle kalıcı atamayla kur. Fiyatı tek bir
  kaynaktan oku (tanıtım, sepet, ödeme aynı). Birincil ölçüt ziyaretçi başı brüt kâr; dönüşümü yalnız yardımcı ölçüt
  yaz. Örneklem hesabını ziyaretçi başı gelirin varyansıyla yap. Para hesaplarında Decimal kullan."
- **Modelin tipik hatası:** dönüşümü birincil ölçüt yapar; mevcut müşterileri de deneye alır; atamayı her sayfa
  yüklemesinde rastgele yapar; fiyatı tanıtım sayfasında değiştirip ödeme adımını unutur; örneklemi dönüşüm farkıyla
  hesaplar; abonelikte ilk ay sonucuyla karar verir; hukuki konularda kesin hüküm yazar.
- **Çıktıda denetleyin:** atamanın kalıcılığı (aynı kimlik → aynı kol); fiyatın tek kaynaktan geldiği; ölçüt
  tanımı; örneklem hesabının varyans içerdiği; deney sonrası iade/geçiş planı.
- **Sorun:** "Bu deneyi bütün müşterilerimiz gazetede okusa rahatsız olur muyduk?"

## İlgili

- [Fiyatlandırma](fiyatlandirma.md) — değer temelli fiyat, KDV gösterimi, kur riski, zam duyurusu
- [Fikir doğrulama](fikir-dogrulama.md) — ön satış ve sahte kapı · [Kullanıcı görüşmesi](kullanici-gorusmesi.md)
- [A/B testi](../70-veri/ab-testi.md) — örneklem, erken bakma · [Anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md)
- [Birim ekonomisi ve LTV](../70-veri/birim-ekonomisi-ve-ltv.md) — kohortla ufuklu kâr · [Tutma ve iptal akışı](tutma-ve-iptal-akisi.md)
- [Yasal temel belgeler](yasal-temel-belgeler.md) — tüketici mevzuatı ve ne zaman hukukçuya gidilir
- [Deney yapılamayanda nedensellik](../70-veri/deney-yapilamayanda-nedensellik.md) — fiyat herkese birden değiştiyse
- Havuz: fiyat sayfası içeriği [`site/src/content/fiyatlar/tr.json`](../../site/src/content/fiyatlar/tr.json);
  kuruş temelli para tipi [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py)
