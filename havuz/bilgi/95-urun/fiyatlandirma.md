---
baslik: Fiyatlandırma
ozet: Değer ve maliyet temelli fiyat, abonelik, tek seferlik ve kullanım bazlı modeller, ücretsiz katman, fiyat sayfası, birim ekonomisi hesabı; Türkiye'de KDV gösterimi, kuruş yuvarlama ve kur riski.
etiketler: [urun, fiyatlandirma, birim-ekonomisi, abonelik, kdv, gelir]
duzey: orta
guncellik: 2026-11
---

# Fiyatlandırma

> Bu notu ne zaman okumalı: ilk fiyatı koyarken; ücretsiz katman ya da deneme tasarlarken; "bir müşteriyi kazanmak
> kaça mal oluyor, kaç lira bırakıyor?" sorusunda; maliyetleriniz dövize bağlı, fiyatınız TL iken.
> **Mali ve hukuki danışmanlık değildir.** Vergi, fatura ve tüketici mevzuatı konularını mali müşavirinizle ve bir
> hukukçuyla doğrulayın.

## Temel fikir

Fiyatın üç sınırı vardır: **taban** maliyettir (altında her satış zarar); **tavan** müşterinin gördüğü değerdir (üstünde
kimse almaz); aradaki yeri **alternatifler** belirler: müşterinin bugün harcadığı (bir çalışanın saati, kaçan
randevu, başka bir program). Maliyet yalnız tabanı verir; fiyat değerin bir payı olarak konur.

Fiyat bir **değer ölçütüne** bağlanır: neye göre artar (çalışan, şube, randevu, belge, kullanım)? İyi ölçüt, müşterinin
aldığı değerle birlikte büyür, anlaşılır ve önceden tahmin edilir.

İlk fiyat bir varsayımdır; görüşme ve ön satışla sınanır ([fikir doğrulama](fikir-dogrulama.md)). Var olan müşteriye
zam yapmak zordur: erken müşterilere yazılı bir "kurucu fiyatı" verip yeni müşteri fiyatını ayrı tutmak yaygındır.
Büyüme kararı **birim ekonomisine** bakar: bir müşteriyi kazanmanın bedeli (CAC) ve müşterinin ömrü boyunca bıraktığı
brüt kâr (LTV).

## Karar tablosu: fiyat modeli

| Durum                                                            | Model                                   | Dikkat                                                     |
| ---------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Değer her ay yeniden alınıyor (randevu, muhasebe, stok)          | Abonelik (aylık / yıllık)               | Kayıp oranı her şeydir; iptal kolay olmalı                 |
| Tek seferlik iş, kalıcı çıktı (şablon, rapor, araç)              | Tek seferlik ödeme                      | Güncelleme ve destek bedeli sürer                          |
| Maliyet kullanımla büyüyor (ileti, yapay zekâ, depolama)         | Kullanım bazlı ya da abonelik + aşım    | Fatura sürprizi: üst sınır ve %80'de uyarı                  |
| Bireysel tüketici, düşük tutar                                   | Yıllık ya da tek seferlik; mağaza ödemesi | Mağaza payı marja girer ([mobil ve mağaza](mobil-ve-magaza.md)) |
| Kurumsal müşteri                                                 | Teklif + yıllık sözleşme                | Satış süreci uzun; güvenlik ve KVKK soruları gelir         |
| Ürün ilke gereği ücretsiz (Köprü gibi sosyal amaçlı)             | Ücretsiz; kurum, hibe ya da bağış       | Sürdürülebilirlik planı yazılı olmalı                      |

**Ücretsiz katman mı, süreli deneme mi?** Değer ilk günlerde görünüyorsa süreli deneme (ör. 14 gün bütün özellikler);
değer zamanla birikiyorsa (müşteri listesi, geçmiş) sınırlı ücretsiz katman. Sınır **değer ölçütüne** konur ("1 takvim,
ayda 100 randevu"): kullanıcı büyüdükçe yükseltmeye kendiliğinden gelir. Çekirdek değeri kesen sınır (ücretsizde
randevu alınamıyor) değeri hiç göstermez; sınırsız ücretsiz katman kimseyi ödemeye götürmez. Kartlı deneme daha az
ama daha niyetli deneyen getirir; kartsız deneme tersini. Ücretsiz kullanıcının da sunucu ve destek bedeli vardır.

## Fiyat sayfası

- 2–3 paket, **kime göre** adlandırılmış ("Tek başına çalışanlar için"); en çok bir "en çok tercih edilen".
- Fiyat açık rakamla; dönem; **KDV durumu**; deneme ve iptal koşulu fiyatın hemen altında.
- Yıllık indirim hesabıyla: "yıllık ödemede 2 ay ücretsiz" = %16,7 indirim.
- Paketler değer ölçütüyle ayrılır; uzun özellik listeleriyle değil.
- SSS'de iptal, iade, fatura, verinin dışa aktarılması, aşım ücreti.
- Site temelinde: [`fiyatlar/tr.json`](../../site/src/content/fiyatlar/tr.json) (`price`, `currency`, `period`,
  `highlighted`) ve [`anasayfa/tr.json`](../../site/src/content/anasayfa/tr.json) → `pricing.note`. Örnekteki "Fiyatlara
  KDV dâhil değildir" notu işletmeye satış içindir; tüketiciye satıyorsanız değiştirin.

## Birim ekonomisi: çalışan hesap

| Kavram                       | Tanım                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Hesap başına aylık gelir     | **KDV hariç** (KDV devlete aittir, gelir değildir)                                        |
| Brüt marj                    | (Gelir − doğrudan maliyetler) / gelir; doğrudan: sunucu, ileti, yapay zekâ, ödeme komisyonu, mağaza payı, destek |
| Aylık kayıp oranı            | Dönem başı hesaplardan ay içinde ayrılanlar / dönem başı hesaplar ([ürün ölçütleri](../70-veri/urun-olcutleri.md)) |
| Ömür boyu değer (LTV)        | Aylık gelir × brüt marj ÷ aylık kayıp oranı                                                |
| Edinme maliyeti (CAC)        | (Reklam + satış ve tanıtım **emeği**) ÷ yeni müşteri                                        |
| Geri ödeme süresi            | CAC ÷ (aylık gelir × brüt marj), ay                                                       |

```python calistir
from decimal import ROUND_HALF_UP, Decimal as D

# Sedir "İşletme" paketi — bütün rakamlar KURGUSAL, yalnız yöntemi göstermek için
price = D("349")  # aylık, KDV hariç (işletmeye satış)
direct_costs = {  # hesap başına aylık doğrudan maliyet, TL
    "ileti (300 × 0,15)": D("45"),
    "sunucu ve yedek": D("10"),
    "ödeme kuruluşu komisyonu (%3)": price * D("0.03"),
    "destek (saat payı)": D("20"),
}
monthly_churn = D("0.04")  # dönem başı hesaplardan ayrılan oranı
acquisition_spend = D("30000") + D("20000")  # reklam + satış emeği (saat × ücret)
new_customers = 40

gross_margin = (price - sum(direct_costs.values())) / price
ltv = price * gross_margin / monthly_churn
cac = acquisition_spend / new_customers
payback_months = cac / (price * gross_margin)

print(f"brüt marj: %{gross_margin * 100:.1f}")
print(f"LTV: {ltv:.0f} TL · CAC: {cac:.0f} TL · LTV/CAC: {ltv / cac:.1f}")
print(f"geri ödeme: {payback_months:.1f} ay")
assert ltv / cac > 3 and payback_months < 12  # yaygın pratik kurallar, yasa değil

# YANLIŞ 1: ciroyu (marjı değil) kullanmak LTV'yi şişirir
assert price / monthly_churn > ltv * D("1.3")
# YANLIŞ 2: tüketiciye KDV dâhil 349 TL satılıyorsa gelir 349 değil, ~290,83 TL'dir
net_if_b2c = (price / D("1.20")).quantize(D("0.01"), rounding=ROUND_HALF_UP)
assert net_if_b2c == D("290.83")
```

```cikti
brüt marj: %75.5
LTV: 6588 TL · CAC: 1250 TL · LTV/CAC: 5.3
geri ödeme: 4.7 ay
```

Okuma: "LTV/CAC 3'ün üstünde, geri ödeme 12 ayın altında" yaygın pratik kurallardır, yasa değil; nakdiniz azsa geri
ödeme süresi oranlardan önemlidir. Kayıp oranını **olgun** kohortlardan alın: ilk ayın kaybı hep yüksektir ve ayrı
izlenir. Erken dönemde CAC'ın büyük kısmı kurucunun emeğidir; saatini yazmazsanız kanal olduğundan ucuz görünür.

## Türkiye'ye özgü notlar

**KDV gösterimi.** Tüketiciye (B2C) gösterilen fiyatın vergiler dâhil olması tüketici mevzuatının gereğidir;
işletmeye (B2B) satışta "349 TL + KDV" yazmak yaygındır ama açıkça yazılır. KDV oranı ürüne göre değişir ve zamanla
değişebilir: oranı koda gömmeyin, ayar dosyasında tutun ve güncel oranı doğrulayın.

**Kuruş ve yuvarlama.** Parayı `float` ile hesaplamayın. KDV dâhil tutardan net ve KDV'yi ayırırken tek bir yuvarlama
kuralı seçin ve her yerde aynısını uygulayın; satır satır mı toplamdan mı hesaplanacağı da bir karardır:

```python calistir
from decimal import ROUND_HALF_UP, Decimal

KURUS = Decimal("0.01")
VAT_RATE = Decimal("0.20")  # oran ayardan gelir; kodda sabit yazmayın (güncel oranı doğrulayın)


def split_gross(gross: Decimal, rate: Decimal = VAT_RATE) -> tuple[Decimal, Decimal]:
    """KDV dâhil tutarı net + KDV'ye ayırır; ikisinin toplamı her zaman brüte eşittir."""
    net = (gross / (1 + rate)).quantize(KURUS, rounding=ROUND_HALF_UP)
    return net, gross - net


net, vat = split_gross(Decimal("102.75"))
assert (net, vat) == (Decimal("85.63"), Decimal("17.12"))
assert round(102.75 / 1.2, 2) == 85.62  # YANLIŞ: float + round() yarım kuruşu aşağı atabilir

lines = [Decimal("9.99")] * 3
per_line = sum(split_gross(g)[0] for g in lines)
on_total = split_gross(sum(lines))[0]
print(f"satır satır net: {per_line} TL · toplamdan net: {on_total} TL")
```

```cikti
satır satır net: 24.99 TL · toplamdan net: 24.98 TL
```

Kuruş temelli, `float`suz para tipi ve KDV dâhil/hariç hesabı havuzda hazır:
[`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py) ve
[`kutuphane/ts/src/para.ts`](../../kutuphane/ts/src/para.ts). Ekranda gösterim biçimi ("₺1.234,56" ya da "1.234,56 TL")
`97-turkce` kümesinin konusudur.

**Kur riski.** Maliyetin bir kısmı dövize bağlı (sunucu, yapay zekâ API'si, ileti), fiyat TL ise marj her ay erir;
yıllık planın indirimi bu erimeyi öne çeker:

```python calistir
# Sabit TL fiyat, döviz bağlantılı maliyet: marj ay ay erir (KURGUSAL senaryo)
PRICE = 349.0  # TL/ay, KDV hariç
TL_COSTS = 30.0  # TL cinsinden sabit maliyetler (destek, komisyon payı vb.)
FX_COST_NOW = 60.0  # döviz bağlantılı maliyetin bugünkü TL karşılığı (sunucu, yapay zekâ, ileti)
FX_MONTHLY_RISE = 0.03  # varsayım: kur her ay %3 artıyor
TARGET = 0.70  # hedef brüt marj


def margin(month: int, price: float = PRICE) -> float:
    cost = TL_COSTS + FX_COST_NOW * (1 + FX_MONTHLY_RISE) ** month
    return (price - cost) / price


first_below = next(m for m in range(60) if margin(m) < TARGET)
annual_price = PRICE * 10 / 12  # "yıllık ödemede 2 ay ücretsiz"
annual_avg = sum(margin(m, annual_price) for m in range(12)) / 12
print(f"ay 0: %{100 * margin(0):.0f} · ay 6: %{100 * margin(6):.0f} · ay 11: %{100 * margin(11):.0f}")
print(f"hedef marjın altına ilk düşüş: {first_below}. ay")
print(f"yıllık planın 12 aylık ortalama marjı: %{100 * annual_avg:.0f}")
assert first_below == 8 and annual_avg < TARGET  # yıllık indirim + kur: marj baştan hedefin altında
```

```cikti
ay 0: %74 · ay 6: %71 · ay 11: %68
hedef marjın altına ilk düşüş: 8. ay
yıllık planın 12 aylık ortalama marjı: %65
```

Politikalar: fiyatı belirli aralıklarla gözden geçirin ve değişikliği önceden (ör. 30 gün) duyurun; yıllık indirimi
kur riskine göre ayarlayın; dövize bağlı maliyeti olan kalemleri (ileti, yapay zekâ) kullanım bazlı ücretlendirin.
Yurt içinde döviz cinsinden fiyat ve sözleşme kısıtlamalara tabi olabilir; düşünüyorsanız önce bir hukukçuya sorun
(doğrulanmadı).

**Ödeme ve fatura.** Yurt dışı ödeme altyapılarının Türkiye'de kurulu bir şirketi destekleyip desteklemediğini baştan
doğrulayın. Tek seferlik ve yüksek tutarlı tüketici satışında taksit beklentisi yaygındır; taksit komisyonu marja
girer. e-Arşiv / e-Fatura yükümlülüğü ve yurt dışına satışın vergisi mali müşavirin konusudur. Tüketici aboneliğinde
iptalin kolay olması (kurulduğu yolla sona erdirilebilmesi) beklenir; ayrıntı: [yasal temel belgeler](yasal-temel-belgeler.md).

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Fiyat maliyete göre konmuş; müşteri ne ucuz ne pahalı diyor | Değer ve alternatif sorulmadı                            | Bugünkü harcamayı sorun; maliyet yalnız taban                               |
| Ücretsiz kullanıcı çok, ödeyen yok                          | Sınır yanlış ölçütte ya da çok cömert                    | Sınırı değer ölçütüne koyun; yükseltme anını ürün içinde gösterin           |
| LTV harika, kasada para yok                                 | Ciro ya da KDV dâhil gelir kullanıldı; geri ödeme unutuldu | KDV hariç gelir, brüt marj; geri ödeme süresine bakın                     |
| Kur arttı, yıllık planlar zarar ediyor                      | Dövize bağlı maliyet, sabit TL fiyat, cömert yıllık indirim | Gözden geçirme politikası; yıllık indirimi sınırlayın; kullanım bazlı kalem |
| Zam duyurusu müşteri kaybettirdi                            | Habersiz, gerekçesiz ve ani zam                          | Önceden duyuru, geçiş süresi, gerekçe; erken müşteriye yazılı söz            |
| Küçük işletmeler "fiyat için bize ulaşın"a yazmıyor         | Fiyat gizlendi                                           | Açık fiyat; kurumsal paket dışında                                           |
| Tüketiciye KDV hariç fiyat gösterildi                       | İşletmeye satış kalıbı tüketiciye uygulandı              | Tüketiciye vergiler dâhil fiyat                                              |
| Faturada kuruş farkı çıkıyor                                | `float` ve farklı yuvarlama kuralları                    | Ondalık tip; tek yuvarlama kuralı; satır ya da toplam kararı yazılı          |
| Aşım ücreti sürpriz faturaya döndü                          | Kullanım bazlıda uyarı ve üst sınır yok                  | %80'de uyarı; kullanıcı onayı olmadan aşım yok                               |

## Denetim listesi

- [ ] Müşterinin bugünkü alternatifi ve bedeli yazılı; fiyat bu değerin bir payı.
- [ ] Değer ölçütü seçildi; paketler bu ölçütle ayrılıyor.
- [ ] Hesap başına doğrudan maliyet hesaplı; dövize bağlı kalemler ayrı satırda.
- [ ] Ücretsiz katman ya da deneme kararı gerekçeli; sınır değer ölçütünde.
- [ ] Fiyat sayfasında KDV durumu, dönem, iptal, iade ve deneme koşulu açık.
- [ ] LTV KDV hariç gelir ve brüt marjla; CAC'a emek dâhil; geri ödeme süresi hesaplı.
- [ ] Kur senaryosu hesaplandı; fiyat gözden geçirme ve zam duyurusu politikası yazılı.
- [ ] Para hesapları ondalık tiple ve tek yuvarlama kuralıyla yapılıyor; KDV oranı ayarda.
- [ ] Fatura, KDV ve tüketici kuralları mali müşavir ve hukukçuyla doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bütün para hesaplarını `Decimal` ile yap (ya da havuzdaki `para` yardımcısıyla). KDV'yi gelirden
  ayır. LTV'yi brüt marjla hesapla. Varsayımları başta tablo olarak yaz. Eksik rakamı uydurma, bana sor."
- **Fiyat sayfası metni için:** "KDV durumu, dönem, iptal koşulu ve deneme süresi fiyatın hemen altında olsun. En çok
  bir paketi öne çıkar. Paket adları kime göre olsun."
- **Modelin tipik hatası:** `float` ile para hesabı; KDV dâhil tutarı gelir sayma; LTV'de ciro kullanma; aylık ile
  yıllık kayıp oranını karıştırma; "sektör ortalaması" ya da rakip fiyatı uydurma; KDV oranını koda gömme.
- **Çıktıda denetleyin:** `float` ve `round(` araması; birimlerin (aylık mı, KDV hariç mi) her satırda yazılı olması;
  varsayım tablosu; oranın ayardan okunması.

## İlgili

- [Tanıtım sayfası](tanitim-sayfasi.md): fiyat bölümünün yeri ve metni.
- [İçerik ve büyüme](icerik-ve-buyume.md): kanal başına edinme maliyeti.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md) ve [ürün ölçütleri](../70-veri/urun-olcutleri.md): kayıp oranı ve tutma.
- [Yapay zekâ özelliği tasarlama](yapay-zeka-ozelligi-tasarlama.md): kullanım bazlı yapay zekâ maliyeti.
- [Yasal temel belgeler](yasal-temel-belgeler.md): mesafeli satış, cayma, abonelik iptali.
