---
baslik: Önceliklendirme
ozet: Etki/çaba, RICE puanı, MoSCoW ve gecikme maliyeti sezgisiyle iş sıralamak; yol haritasını tarih sözünden ayırmak ve gerekçeli "hayır" demek.
etiketler: [urun, onceliklendirme, rice, yol-haritasi, karar]
duzey: temel
guncellik: 2026-11
---

# Önceliklendirme

> Bu notu ne zaman okumalı: yapılacaklar listesi yapabileceğinizden uzunsa; bir müşteri ya da ortak "şu da olsun"
> dediğinde; yol haritasına tarih yazmanız istendiğinde.

## Temel fikir

Önceliklendirme, **neyi şimdi yapmayacağınıza** karar vermektir: her "evet", başka bir işe "şimdi değil" demektir.

Puanlama yöntemleri kararı sizin yerinize vermez; tartışmayı zevkten **varsayıma** taşır: "Bu kaç kişiye ulaşır?
Ne kadar eminiz? Kaç hafta sürer?" Puan, varsayımı yazılınca değerlidir.

İki ayrı soru vardır: **değer** (ne kazandırır) ve **zaman** (gecikirse ne kaybedilir). Bekledikçe para kaybettiren
orta değerli iş, beklemekle değer kaybetmeyen büyük işten önce gelebilir. Ayrım: **hangi özelliğin** önce geleceğine
değer ve gecikme maliyeti karar verir; bir özelliğin **içindeki dilimlerin** sırasına risk karar verir
([işi parçalama](../00-yontem/isi-parcalama.md)).

Puanlamaya girmeyenler: güvenlik açığı, veri kaybı, yasal zorunluluk, çökme. Bunlar sıranın başına geçer.
Yol haritası bir **sıradır**, tarih sözü değildir.

## Karar tablosu: hangi yöntem

| Durum                                                             | Yöntem                                                              | Neden                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| 5–10 kalem, hızlı karar                                           | Etki/çaba 2×2                                                       | On dakikada biter                              |
| 15+ kalem ya da ekipte görüş ayrılığı                             | RICE                                                                | Varsayımları yazdırır, kişisel zevki azaltır   |
| Bir sürümün kapsamını sınırlamak                                  | MoSCoW                                                              | "Olmazsa olmaz" ile "olsa iyi"yi ayırır        |
| Zamana bağlı iş (sezon, bayram, sözleşme, yasal tarih, rakip)      | Gecikme maliyeti ÷ süre (CD3)                                       | Bekledikçe kaybettiren önce                    |
| Hata ve destek talepleri                                          | Sıklık × şiddet ([geri bildirim](geri-bildirim-ve-destek.md))       | Kullanıcı acısını ölçer                        |
| Güvenlik, veri kaybı, yasal zorunluluk, çökme                     | Puanlanmaz; hemen                                                   | Bedeli üst sınırsız                            |
| Tek müşterinin özel isteği                                        | Üç müşteri kuralı: üç bağımsız müşteri isteyene dek istek defterinde | Tek müşteriye ürün yazılmaz                   |
| Temel beklenti mi, fark yaratan mı?                               | Önce temel beklentiler (yoksa şikâyet edilir, varsa fark edilmez)   | Temel eksikken parlak özellik değer görmez     |

## Etki/çaba 2×2

|                 | Düşük çaba                 | Yüksek çaba               |
| --------------- | -------------------------- | ------------------------- |
| **Yüksek etki** | Hemen yap                  | Planla ve dilimle         |
| **Düşük etki**  | Toplu yap (bir günde beşi) | Yapma                     |

Tuzak: çaba tahmini hep iyimser, "yüksek etki" hep kendi fikrimizdir. Etkiyi bir kanıta (görüşme, ölçüm, destek
talebi sayısı) bağlayamıyorsanız kalemi "düşük etki"ye koyun.

## RICE: çalışan hesap

- **Erişim (Reach):** bir dönemde (ör. çeyrek) etkilenecek kişi ya da olay sayısı; ölçümden gelir. Bütün kalemler
  **aynı dönem** için yazılır.
- **Etki (Impact):** kişi başına etki, sabit ölçekle: 3 çok büyük, 2 büyük, 1 orta, 0,5 düşük, 0,25 çok düşük.
- **Güven (Confidence):** kanıtın türünden: ölçüldü %100, güçlü kanıt (görüşme, destek talebi) %80, tahmin %50.
  Daha düşükse puanlamayın; önce [deney](fikir-dogrulama.md).
- **Çaba (Effort):** kişi-hafta ya da model oturumu.
- **Puan** = erişim × etki × güven ÷ çaba.

```python calistir
IMPACT = {3: "çok büyük", 2: "büyük", 1: "orta", 0.5: "düşük", 0.25: "çok düşük"}
CONFIDENCE = {1.0: "ölçüldü", 0.8: "güçlü kanıt", 0.5: "tahmin"}

# (iş, erişim/çeyrek, etki, güven, çaba kişi-hafta) — Sedir, kurgusal; erişim aynı dönem için
backlog = [
    ("Otomatik WhatsApp hatırlatma", 400, 2, 0.8, 4),
    ("Bekleme listesi", 120, 1, 0.5, 3),
    ("Google Takvim eşitlemesi", 150, 1, 0.8, 5),
    ("Kapora ile ön ödeme", 60, 2, 0.5, 6),
    ("Kurulum sihirbazı", 900, 1, 0.8, 2),
    ("Koyu tema", 400, 0.25, 0.8, 1),
]


def rice(reach: float, impact: float, confidence: float, effort: float) -> float:
    assert impact in IMPACT, f"etki sabit ölçekten olmalı: {sorted(IMPACT)}"
    assert confidence in CONFIDENCE, "güven kanıt türünden gelir; %50 altıysa önce deney"
    assert effort > 0, "çaba sıfır olamaz"
    return reach * impact * confidence / effort


ranked = sorted(backlog, key=lambda row: -rice(*row[1:]))
for name, *values in ranked:
    print(f"{rice(*values):6.1f}  {name}")

# Duyarlılık: ilk ikisinin güveni "tahmin"e düşse sıra değişir mi?
pessimistic = {name: rice(r, i, 0.5, e) for name, r, i, c, e in backlog}
assert pessimistic["Kurulum sihirbazı"] > pessimistic["Otomatik WhatsApp hatırlatma"] > 80
```

```cikti
 360.0  Kurulum sihirbazı
 160.0  Otomatik WhatsApp hatırlatma
  80.0  Koyu tema
  24.0  Google Takvim eşitlemesi
  20.0  Bekleme listesi
  10.0  Kapora ile ön ödeme
```

Okuma: kurulum sihirbazının erişimi büyük, çünkü her **yeni** kayıt ona dokunur. Koyu temanın üçüncü çıkması
RICE'ın bilinen huyudur: küçük çaba puanı şişirir. Bu yanlış değil ama "etki 0,25" tahmini gerçekten doğru mu
diye bakılır; böyle küçük işler toplu yapılır, tek başına sırayı işgal etmez. Duyarlılık satırı, sıranın
varsayımlara ne kadar bağlı olduğunu gösterir: güven düşse de ilk iki iş yer değiştirmiyor.

## Gecikme maliyeti: bekledikçe kaybettiren önce

Bazı işlerin değeri zamana bağlıdır: bayram yoğunluğundan önce çıkmayan "çok çalışanlı takvim" o sezonun
satışını kaçırır. Her işe kabaca "bir hafta gecikirse kaç TL kaybederiz?" diye bir rakam verin ve **gecikme
maliyetini süreye bölün** (CD3). Bu sıra, toplam gecikme maliyetini en aza indirir; aşağıda bütün sıralarla
karşılaştırılarak gösteriliyor:

```python calistir
from itertools import permutations

# (iş, haftalık gecikme maliyeti TL, süre hafta) — kurgusal tahminler
jobs = [
    ("Çok çalışanlı takvim", 4000, 4),
    ("Otomatik hatırlatma", 3000, 2),
    ("Raporlar", 500, 1),
]


def delay_cost(order) -> int:
    """Her iş bitene dek her hafta kendi gecikme maliyetini öder."""
    clock = total = 0
    for _, cost_per_week, weeks in order:
        clock += weeks
        total += cost_per_week * clock
    return total


by_value = sorted(jobs, key=lambda job: -job[1])  # yalnız değere bakan sıra
by_cd3 = sorted(jobs, key=lambda job: -job[1] / job[2])  # gecikme maliyeti / süre
best = min(permutations(jobs), key=delay_cost)
assert delay_cost(by_cd3) == delay_cost(best)  # CD3 sırası en ucuz sıradır
print("değere göre:", delay_cost(by_value), "TL")
print("CD3'e göre: ", delay_cost(by_cd3), "TL →", " > ".join(name for name, _, _ in by_cd3))
```

```cikti
değere göre: 37500 TL
CD3'e göre:  33500 TL → Otomatik hatırlatma > Çok çalışanlı takvim > Raporlar
```

Rakamlar kaba tahmindir ve öyle kalabilir; yöntem, "en değerli olan önce" sezgisinin kısa işleri nasıl
geciktirdiğini gösterir. Aynı nedenle **aynı anda bir-iki iş** yürütülür: her şeye biraz dokunmak, hepsinin bitişini
geciktirir.

## MoSCoW: bir sürümün sınırı

| Sınıf                         | Test sorusu                                         |
| ----------------------------- | --------------------------------------------------- |
| Olmazsa olmaz (Must)          | "Bu olmadan sürümü çıkarır mıyız?" Hayırsa buradadır |
| Olmalı (Should)               | Önemli ama geçici bir yolu var (elle, eski yol)     |
| Olabilir (Could)              | Varsa güzel; ilk kesilen                            |
| Bu sürümde yok (Won't)        | Yazılı olarak dışarıda; bir sonraki tartışmanın girdisi |

Yaygın bir kural: "olmazsa olmaz"lar toplam eforun yarısını-üçte ikisini geçmesin; geçerse sürüm tek bir
gecikmeyle batar. "Bu sürümde yok" sütunu boşsa liste yalan söylüyordur.

## Yol haritası ve tarih sözü

```text
Yol haritası — Sedir (kurgusal), 2026-11-20 güncellemesi. Tarihler yalnız "Şimdi" sütununda ve aralıkla.
ŞİMDİ  (bu ay)      Kurulum sihirbazı — yeni kayıtların yarısı kurulumda bırakıyor → hedef: aktivasyon artışı
                    Tahmini bitiş: 1–12 Aralık (%80 güven)
SONRA  (1–3 ay)     Otomatik hatırlatma — gelmeyen müşteri en sık 2. şikâyet
                    Çok çalışanlı takvim — bayram öncesi talep (gecikme maliyeti yüksek)
BELKİ  (kanıt bekliyor)  Kapora · Raporlar · Takvim eşitlemesi — her biri için istek defterinde ≥ 3 müşteri bekleniyor
```

Kurallar: tarih yalnız yakın ve küçük işe, aralıkla verilir; uzak işe tarih verilmez. Tarih sabitse kapsam
esnektir ("15 Aralık'ta ne hazırsa o"); kapsam sabitse tarih esnektir. İkisi birden sabitlenirse kalite düşer.
Dışarıyla paylaşılan yol haritasına "planlarımız değişebilir" yazılır ve tarih konmaz.

## Gerekçeli "hayır"

"Hayır", "asla" değildir: **şimdi değil + neden + geçici çözüm + ne zaman yeniden bakılacağı.** Her istek, arkasındaki
problemle birlikte istek defterine yazılır; aynı problem üç bağımsız müşteriden gelince yeniden puanlanır.

```text
Merhaba Gülay Hanım,
Önerinizi not ettim, teşekkür ederim. Şu an önceliğimiz kurulumun kolaylaşması; çünkü yeni başlayanların çoğu
orada zorlanıyor. Raporlar listemizde; benzer istek gelince yeniden değerlendireceğiz. Bu arada randevu
listenizi "Dışa aktar" düğmesiyle tabloya indirip haftalık sayıları görebilirsiniz.
```

## Tuzaklar

| Belirti                                                    | Neden                                                   | Çözüm                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Sıra her toplantıda değişiyor                              | Ölçüt yok; en son konuşanın isteği öne geçiyor          | Varsayımlar yazılı puanlama; sıra haftada bir kez gözden geçirilir       |
| Herkes kendi işine "3" etki veriyor                        | Ölçek ve güven tanımsız                                 | Sabit etki ölçeği; güveni kanıt türüne bağlayın                          |
| Hep küçük işler yapılıyor, büyük sorun yerinde duruyor     | RICE küçük çabayı ödüllendirir                          | Büyük işi dilimleyin; her dönem bir "büyük taş" ayırın                   |
| Yol haritasındaki tarih kaçtı, müşteri kızgın              | Uzak işe tarih verildi                                  | Şimdi/Sonra/Belki; tarih yalnız yakın işe ve aralıkla                    |
| En büyük müşterinin isteği ürünü başka yöne çekti          | Tek müşteriye ürün yazıldı                              | Üç müşteri kuralı; özel iş elle ya da ayrı fiyatla                       |
| Güvenlik açığı RICE'ta düşük çıktı                         | Zorunlu iş puanlandı                                    | Zorunlular puanlamaya girmez                                             |
| MoSCoW'da her şey "olmazsa olmaz"                          | Test sorusu sorulmadı                                   | "Bu olmadan çıkar mıyız?" Evetse Must değil                              |
| Teknik borç hiç sıraya giremiyor                           | Etkisi görünmüyor                                       | Kullanıcı etkisine çevirin (hata sıklığı, yavaşlık) ya da sabit pay ayırın |
| Sıralama doğru ama hiçbir şey bitmiyor                     | Aynı anda çok iş                                        | Aynı anda en çok 1–2 iş                                                  |
| Erişim rakamları birbirini tutmuyor                        | Kimi aylık, kimi çeyreklik yazıldı                      | Bütün kalemler aynı dönem; birim tablonun başında                         |

## Denetim listesi

- [ ] Zorunlular (güvenlik, veri kaybı, yasal, çökme) ayrıldı ve sıranın başında.
- [ ] Her kalemin arkasındaki kullanıcı problemi bir cümleyle yazılı.
- [ ] RICE'ta erişim ölçümden ve aynı dönem için; etki sabit ölçekten; güven kanıt türünden.
- [ ] Zamana bağlı işler için gecikme maliyeti düşünüldü.
- [ ] MoSCoW'da test sorusu uygulandı; "bu sürümde yok" sütunu dolu.
- [ ] Yol haritası Şimdi/Sonra/Belki; tarih yalnız "Şimdi"de ve aralıkla.
- [ ] Reddedilen her istek gerekçe ve geçici çözümle yanıtlandı, istek defterine yazıldı.
- [ ] Aynı anda yürüyen iş sayısı en çok iki.

## Küçük modele yaptırırken

- **İsteme yazın:** "Erişim ve güven değerlerini ben vereceğim; sen uydurma. Yalnız hesapla, sırala ve her kalemin
  varsayımını bir cümleyle yaz. Etki için yalnız 3, 2, 1, 0,5, 0,25 kullan."
- **Modelin tipik hatası:** her şeye yüksek etki verir; erişim rakamı uydurur; aylık ile çeyreklik erişimi karıştırır;
  çaba sıfır ya da boş kalınca bölme hatası verir ya da kalemi atlar; yol haritasına kendiliğinden tarih yazar.
- **Çıktıda denetleyin:** birimler aynı dönem mi; güven 1'i geçiyor mu; ilk üç kalem stratejiyle (şu anki öğrenme
  hedefiyle) uyumlu mu; tablo dışında "öneri" diye yeni kalem eklenmiş mi.
- **"Hayır" yanıtı taslatırken:** "Kısa, suçlamayan, gerekçeli yaz; geçici bir çözüm öner; tarih sözü verme."

## İlgili

- [MVP kapsamı](mvp-kapsami.md): ilk sürümün sınırı; MoSCoW'un "bu sürümde yok"u.
- [Gereksinim yazma](gereksinim-yazma.md): sıraya giren kalemi hikâyeye çevirmek.
- [Geri bildirim ve destek](geri-bildirim-ve-destek.md): istek defteri ve sıklık × şiddet.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): erişim ve etkinin ölçümden gelmesi.
- [Ürün belgesi şablonları](urun-belgesi-sablonlari.md): yol haritası ve karar kaydı.
- [İşi parçalama](../00-yontem/isi-parcalama.md): özelliğin içinde riskli dilim önce.
