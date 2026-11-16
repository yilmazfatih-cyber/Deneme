---
baslik: Fikir doğrulama
ozet: Problemi çözümden ayırmak, varsayımları sıralayıp en riskliyi bulmak, en ucuz deneyi seçmek ve başarı ölçütünü deneyden önce sayıyla yazmak.
etiketler: [urun, fikir-dogrulama, varsayim, deney, erken-asama]
duzey: temel
guncellik: 2026-11
---

# Fikir doğrulama

> Bu notu ne zaman okumalı: bir ürün fikrini kodlatmaya başlamadan önce; ya da yayındaki ürünü kimse
> kullanmıyorsa ve nedenini bilmiyorsanız.

## Temel fikir

Bir fikir iki ayrı iddiadır ve **sırayla** sınanır:

1. **Problem iddiası:** "Şu kişiler, şu durumda, şu engel yüzünden zaman ya da para kaybediyor ve bugün bunu bir
   yolla (defter, WhatsApp, Excel, bir çalışan, hiçbir şey) idare ediyor."
2. **Çözüm iddiası:** "Bizim yolumuz bu kaybı bugünkü yoldan belirgin biçimde iyi kapatıyor; bunun için para ya da
   emek verirler."

Problem yoksa çözümün iyiliği önemsizdir. Her fikir onlarca **varsayıma** (kanıtı olmayan inanca) dayanır. Hepsi
sınanmaz: önce **en riskli** olan, yani yanlışsa her şeyi çökerten ve hakkında en az kanıt bulunan sınanır. Sınama
aracı **deneydir**: süresi ve bütçesi sınırlı, çıktısı kod değil **karar** olan iş (devam / değiştir / bırak).

Kod yazdırmak ucuzladı; yanlış ürüne giden haftalar, tanıtım emeği ve dikkat ucuzlamadı. Altın kural:
**başarı ölçütü deneyden önce, sayıyla ve tarihle yazılır.** Sonradan yazılan ölçüt her sonucu "başarı" yapar.

## Karar tablosu: hangi soru için hangi deney

| Sınanan soru                              | En ucuz deney                                                     | Kanıtladığı                         | Kanıtlamadığı                       |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Problem gerçek mi, ne sıklıkta?           | 5–10 problem görüşmesi ([görüşme notu](kullanici-gorusmesi.md))   | Sıklık, bugünkü yol, bugünkü maliyet | İlgi, ödeme isteği                  |
| İnsanlar bunu ister mi?                   | Tanıtım sayfası + erken erişim formu ("duman testi", smoke test)  | Mesajın ilgi çekmesi                | Kullanım, ödeme                     |
| Para öderler mi?                          | Ön satış: iadeli kaparo, ilk ayın ödemesi, imzalı niyet mektubu   | En güçlü talep sinyali              | Uzun süre kalıcılık                 |
| Çözüm gerçekten işe yarıyor mu?           | Elle yapılan hizmet (concierge): işi kodsuz, elle siz yaparsınız  | Değer, süreç, gerçek ihtiyaçlar     | Ölçeklenebilirlik                   |
| Kullanıcı otomasyonu kabul eder mi?       | Önde ürün, arkada insan ("sihirbaz deneyi", Wizard of Oz)         | Deneyim ve beklenti                 | Teknik yapılabilirlik               |
| Bu özelliği isteyen var mı?               | Sahte kapı (fake door): düğme var, tıklayınca "yakında, haber verelim mi?" | Merak ve tıklama          | Gerçek kullanım                     |
| Teknik olarak yapılabilir mi?             | Zaman kutulu teknik deney (spike, yarım–iki gün)                  | Yapılabilirlik, kabaca maliyet      | Talep                               |
| Anlayıp kullanabiliyorlar mı?             | Tıklanabilir taslak + [kullanılabilirlik testi](kullanilabilirlik-testi.md) | Anlaşılırlık, akış sorunları | Talep, ödeme                     |
| Hangi mesaj daha çok çekiyor?             | Aynı kitleye iki başlıklı tanıtım sayfası ya da iki ilan metni    | Mesaj farkı                         | Ürün değeri                         |

Kural: tablonun yukarısındaki soru yanıtlanmadan aşağıdakine geçmeyin. Teknik deney en sona yakındır; çoğu fikir
teknik değil talep yüzünden batar.

## Nasıl yapılır

1. **Fikri tek cümleye indirin:** "[Kim], [hangi durumda], [ne yapmaya] çalışırken [hangi engel] yüzünden [ne
   kaybediyor]; bugün [bugünkü yol] ile idare ediyor."
2. **Varsayımları yazın** (en az 10). Başlıklar: kullanıcı ve problem, değer, ödeme, kanal (onlara nasıl
   ulaşırım), yapılabilirlik, yasal. Her biri tek cümle ve **sınanabilir** olsun: "kullanıcılar sever" değil,
   "müşterilerin en az üçte biri bağlantıdan kendi randevusunu alır".
3. **Puanlayın:** önem (yanlışsa ne olur: 1 can sıkar, 3 her şey çöker) ve kanıt (0 hiç, 3 ölçülmüş). Risk =
   önem × (3 − kanıt).
4. **En riskliyi seçin.** Eşitlikte ötekinin ön koşulu olanı seçin.
5. **En ucuz deneyi seçin** (tablo) ve **deney kartını önceden doldurun** (aşağıda).
6. **Uygulayın, bitiş gününde karar verin.** Kartı kapatın: sonuç, karar, öğrenilen tek cümle.

### Örnek: Sedir (kurgusal randevu yazılımı)

Sedir, havuzdaki [`site`](../../site/) temelinin örnek markasıdır; buradaki bütün rakamlar kurgusaldır.

> Tek başına çalışan kuaförler, müşteriyle ilgilenirken telefonla randevu vermeye çalıştıkları için işleri bölünüyor
> ve haftada birkaç randevu kaçırıyor; bugün defter ve WhatsApp ile idare ediyorlar.

Varsayımları puanlayıp sıralamak bir tabloda yapılabilir; aynı hesap:

```python calistir
# (varsayım, önem 1-3, kanıt 0-3) — Sedir, kurgusal
assumptions = [
    ("Kuaförler telefonla randevu vermekten yoruluyor", 3, 2),  # 6 görüşmenin 5'inde anlatıldı
    ("Müşteriler bağlantıdan kendi randevusunu alır", 3, 0),
    ("Kuaför ayda 349 TL öder", 3, 0),
    ("Bağlantı Instagram profiline konur", 2, 1),
    ("Google Takvim eşitlemesi yapılabilir", 1, 3),
]


def risk(item: tuple[str, int, int]) -> int:
    _, importance, evidence = item
    return importance * (3 - evidence)  # önemli ve kanıtsız olan en üstte


ranked = sorted(assumptions, key=risk, reverse=True)  # sıralama kararlı: eşitlikte yazılış sırası
assert [risk(item) for item in ranked] == [9, 9, 4, 3, 0]
for text, importance, evidence in ranked[:3]:
    print(f"{importance * (3 - evidence)}  {text}")
```

```cikti
9  Müşteriler bağlantıdan kendi randevusunu alır
9  Kuaför ayda 349 TL öder
4  Bağlantı Instagram profiline konur
```

İlk ikisi eşit. Önce "müşteriler bağlantıdan alır" sınanır: müşteri bağlantıyı kullanmıyorsa kuaförün ödeme
isteğini sormanın anlamı yoktur. Teknik varsayım (takvim eşitlemesi) en altta: yapılabileceği zaten biliniyor.

### Deney kartı (deneyden önce doldurulur)

```text
Deney kartı — 2026-11-18 (deneyden ÖNCE dolduruldu; sonradan değiştirilmez)
Varsayım:     Kuaförlerin müşterileri bir bağlantıdan kendi randevusunu alır.
Neden şimdi:  En riskli varsayım (önem 3, kanıt 0). Yanlışsa ürünün çekirdeği yok.
Yöntem:       Elle yapılan hizmet. 3 kuaför, 2 hafta. "Bağlantı" basit bir form; randevuyu biz takvime yazarız,
              hatırlatmayı biz göndeririz. Kuaföre ve müşterilere işin elle yapıldığı söylenir.
Ölçüt:        Randevuların en az %30'u bağlantıdan gelir (her kuaförde ayrıca bakılır).
Örneklem:     3 kuaför, toplam en az 120 randevu.
Bitiş:        2026-12-02. Uzatma yok; o gün karar verilir.
Geçerse:      Randevu sayfası dilimini yaptırırız (bkz. mvp-kapsami).
Kalırsa:      Müşterilerle 5 görüşme: neden telefonu seçiyorlar? Kanal değişebilir (WhatsApp'tan bağlantı).
Belirsizse:   2 hafta ve 2 kuaför daha; ölçüt AYNI kalır.
Sonuç / Karar / Öğrenilen tek cümle: (bitişte doldurulur)
```

### Sonucu okumak: küçük sayıda "geçti" demeyin

Ölçüt bir oransa, gözlenen oran tek başına yetmez; az veriyle şans payı büyüktür. Basit ve dürüst bir kural:
oranın güven aralığının **alt sınırı** eşiği geçiyorsa "geçti", **üst sınırı** eşiğin altındaysa "kaldı", aralık
eşiği kesiyorsa "belirsiz". Belirsiz, başarısızlık değildir; daha çok veri ya da daha güçlü bir deney demektir.

```python calistir
import math


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Bir oran için %95 güven aralığı (Wilson); küçük örneklemde de makul davranır."""
    p = successes / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return center - half, center + half


def decide(successes: int, n: int, threshold: float) -> str:
    low, high = wilson(successes, n)
    if low >= threshold:
        return "geçti"
    if high < threshold:
        return "kaldı"
    return "belirsiz"


# Deneyden ÖNCE yazılan ölçüt: tanıtım sayfası ziyaretçilerinin en az %10'u erken erişim formunu doldurur.
THRESHOLD = 0.10
assert decide(31, 240, THRESHOLD) == "belirsiz"  # %12,9 görünüyor ama 240 ziyaret az
assert decide(78, 600, THRESHOLD) == "geçti"  # aynı oran, daha çok veri
assert decide(9, 240, THRESHOLD) == "kaldı"  # %3,75: eşiğin açıkça altında
low, high = wilson(31, 240)
print(f"31/240 → %{100 * low:.1f} – %{100 * high:.1f}")
```

```cikti
31/240 → %9.3 – %17.8
```

Bu kural istatistik dersinin yerine geçmez; iki seçeneği karşılaştıran deneyler (A/B) için `70-veri` kümesine
bakın. Ürün kararı için yeterli olan şudur: **ölçütü önceden yaz, aralığa bak, "belirsiz"i kabul et.**

### Deney türlerini doğru yapmak

- **Tanıtım sayfası (duman testi):** tek sayfa, tek çağrı ("Erken erişim için e-postanızı bırakın"). Trafik hedef
  kitleden gelmeli: arkadaş paylaşımı değil, hedef kitlenin olduğu grup, ilan ya da doğrudan mesaj. Formu
  dolduranın ikinci adımı (görüşmeye evet demesi, e-postaya yanıt vermesi) asıl sinyaldir. Kurulum için
  [tanıtım sayfası notu](tanitim-sayfasi.md) ve [`site`](../../site/) temeli.
- **Elle yapılan hizmet:** ürünün vaat ettiği sonucu, az sayıda müşteriye kendi elinizle verirsiniz. En çok şeyi
  öğreten deneydir: hangi adımın gerçekten gerektiğini ve hangisinin süs olduğunu gösterir. MVP'nin
  "elle yapılacak kısımlar" listesi buradan çıkar ([MVP kapsamı](mvp-kapsami.md)).
- **Sihirbaz deneyi:** kullanıcı bir ürün görür, arkada siz çalışırsınız. Kişisel veriyi bir insan görüyorsa bunu
  açıkça söyleyin; "otomatik" deyip insana okutmak hem güveni hem KVKK'yı çiğner.
- **Sahte kapı:** henüz olmayan özelliğin düğmesi. Tıklayana dürüst davranın: "Bu özellik hazır değil. Hazır
  olunca haber verelim mi?" Ölçülen şey tıklama oranıdır; tıklayanlarla görüşme ayarlamak daha değerlidir.
- **Ön satış:** en güçlü sinyal paradır. İade koşulunu baştan yazın ve kesin uygulayın
  ([yasal temel belgeler](yasal-temel-belgeler.md)).

## Tuzaklar

| Belirti                                                                 | Neden                                                        | Çözüm                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Görüşmelerde herkes "harika fikir" dedi, kimse kaydolmadı               | Fikir anlatıldı; ölçülen şey nezaketti                       | Geçmiş davranışı sorun; sonunda taahhüt isteyin (görüşme, deneme, ön ödeme)              |
| Tanıtım sayfasında kayıt oranı yüksek, ürün çıkınca kullanım yok        | Trafik çevreden geldi; kayıt bedavaydı, ilgi ≠ kullanım       | Trafiği hedef kitleden alın; ikinci adımı (görüşme, ödeme) ölçün                        |
| Her deney "kısmen başarılı" bitiyor                                     | Ölçüt önceden sayıyla yazılmadı                              | Tarihli deney kartı; eşik sayı; sonradan değiştirilmez                                  |
| Deney üç aydır sürüyor                                                  | Bitiş tarihi yok, karar ertelendi                            | Bitiş günü kartta; o gün sonuç ne olursa karar                                          |
| Çözüm çok beğenildi ama kimse ödemedi                                   | Problem küçük ya da seyrek; bugünkü yol "yeterince iyi"       | Önce problemi sınayın: sıklık, bugünkü maliyet, bugün harcanan para                     |
| "Rakibimiz yok" dendi, sonra herkesin defter ve WhatsApp kullandığı görüldü | Bugünkü yol rakip sayılmadı                               | Rakip listesine "hiçbir şey yapmamak", defter, Excel, WhatsApp, bir çalışan da girer     |
| Hedef kitle "herkes"                                                    | Segment seçilmedi; ölçüm her şeyi karıştırıyor               | En çok acı çeken dar bir segment seçin; deneyi onda yapın                               |
| Deney diye her hafta yeni özellik ekleniyor                             | Kod yazmak öğrenmek sanılıyor                                | Önce kodsuz deneyi deneyin; kod en pahalı deneydir                                      |
| Bekleme listesinde yüzlerce kişi var, e-postaları kimse açmıyor          | Dürtüsel kayıt; ilgi zayıf                                   | Kayıttan sonra bir soru sorun ya da görüşme önerin; yanıt oranını ölçün                 |
| %13 oranla "geçti" denildi, ölçek büyüyünce %6 çıktı                     | Az veriyle karar; şans payı göz ardı edildi                  | Aralığa bakın; "belirsiz" sonucu kaydedin, örneklemi büyütün                            |

## Denetim listesi

- [ ] Fikir tek cümlede: kim, hangi durumda, hangi engel, bugünkü yol.
- [ ] Problem iddiası ve çözüm iddiası ayrı yazıldı; önce problem sınanıyor.
- [ ] En az 10 sınanabilir varsayım var; her biri önem ve kanıtla puanlandı.
- [ ] En riskli varsayım seçildi ve neden o olduğu bir cümleyle yazıldı.
- [ ] Deney kartında eşik (sayı), örneklem büyüklüğü, bitiş tarihi ve üç dal (geçerse / kalırsa / belirsizse)
      deneyden **önce** dolduruldu.
- [ ] Katılımcılar ve trafik hedef segmentten geliyor; arkadaş ve aile sayılmadı.
- [ ] Sihirbaz ya da elle yapılan deneyde kullanıcıya gerçeği söyleyen bir cümle var.
- [ ] Sonuç aralıkla okundu; belirsizse "belirsiz" diye kaydedildi.
- [ ] Karar (devam / değiştir / bırak) ve öğrenilen tek cümle yazıldı; kart kapatıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu fikrin varsayımlarını listele. Her birini şu başlıklardan birine koy: kullanıcı ve problem,
  değer, ödeme, kanal, yapılabilirlik, yasal. Her varsayım tek cümle ve ölçülebilir olsun. Puan verme; puanları ben
  vereceğim. Pazar büyüklüğü, yüzde ya da istatistik yazma." Kanıt puanını yalnız siz bilirsiniz; modele verdirmeyin.
- **Deney kartı için:** "Şu varsayım için en ucuz deneyi öner ve yukarıdaki deney kartı biçiminde doldur. Ölçüt bir
  sayı ve bir bitiş tarihi içersin. Kalırsa ve belirsizse ne yapılacağını da yaz."
- **Modelin tipik hatası:** fikri över; uydurma pazar büyüklüğü ve oran yazar; varsayımları doğru kabul edip özellik
  listesine geçer; ölçütü "olumlu geri bildirim alınırsa" gibi sayısız yazar; deney yerine "MVP'yi yapalım" önerir.
- **Çıktıda denetleyin:** her varsayım bir gözlemle yanlışlanabilir mi; kartta sayı ve tarih var mı; kaynaksız
  istatistik var mı (varsa silin ya da kaynak isteyin).

## İlgili

- [Kullanıcı görüşmesi](kullanici-gorusmesi.md): problem iddiasını sınamanın ilk yolu.
- [MVP kapsamı](mvp-kapsami.md): doğrulanan problemden en küçük değerli ürüne.
- [Tanıtım sayfası](tanitim-sayfasi.md) ve [ölçüm ve öğrenme](olcum-ve-ogrenme.md): duman testini kurmak ve okumak.
- [İşi parçalama](../00-yontem/isi-parcalama.md): teknik deneyin (spike) yeri.
- [ML problemini çerçeveleme](../80-ml/problem-cerceveleme.md): fikir "yapay zekâ ile tahmin" ise.
- Tanıtım sayfası ve erken erişim formu için hazır temel: [`site`](../../site/).
