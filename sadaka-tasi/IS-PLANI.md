# Sadaka Taşı — iş planı

> Taslak 1 · Kasım 2026. Bu belge bir iş ve tasarım planıdır, hukuki görüş değildir. Hukuk bölümündeki her bilgi,
> sandık kurulmadan önce bir avukat ve bir mali müşavirle doğrulanmalıdır (§3.3'teki soru listesiyle).

Demo site: [`index.html`](index.html) · Kuralların kodu: [`kurallar.mjs`](kurallar.mjs) · Testler:
`node --test sadaka-tasi/*.test.mjs` · Geliştirici notları: [`README.md`](README.md)

## 1. Kısa özet

**Fikir (senin cümlenle):** İnsanlar sadakalarını bir sandığa koyar. Sandık, sigorta şirketi olmadan, kötü günlerinde
onlara harcama limitleri içinde destek olur; kalan para sadakaya gider. Böylece insanlar sadaka için koydukları parayla
hem kendi hem başkalarının kötü günlerini düzeltir.

Bu plan fikrin özünü koruyor ama üç yerini değiştiriyor. Olduğu gibi uygulanırsa Türk hukukunda üç ayrı ağır risk doğuyor:

| İlk fikir                                        | Sorun                                                                                                                                             | Bu plandaki karşılığı                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "İnsanlar paralarını bana yatıracak"             | İzinsiz yardım toplama (2860). Para hukuken senin malın sayılır: vergi, hesap blokesi, güveni kötüye kullanma suçlaması riski.                    | Para **derneğin** banka hesabına, **lisanslı bir ödeme kuruluşu** üzerinden girer. Kurucu dahil kimse paraya kişisel olarak dokunmaz.              |
| "İhtiyaç durumunda onlara para vereceğim"        | Prim karşılığı ödeme taahhüdü, adı ne olursa olsun sigortacılıktır; ruhsatsız yapmak suçtur (5684). "Sigorta şirketi yok" demek korumaz.          | Üyelik **yardım talep hakkı doğurmaz.** Kurul, belgelenen ihtiyaca ve havuzun durumuna göre karar verir; hiçbir tutar garanti edilmez.             |
| "Harcama limitleri olacak" (koyduğu paraya göre) | Ödenene bağlı limit sandığı sigortaya ve "üyeye para aktarma" yasağına (5253 md. 12) yaklaştırır. Çekilebilen bir bakiye mevduata (5411) dönüşür. | **Herkese aynı yardım tavanı**, yalnız üyelik süresine bağlı: 3. aydan sonra 10.000 TL, 12. aydan sonra 20.000 TL (12 ayda). Bakiye yok, iade yok. |
| "Kalan paralar sadakaya gidecek"                 | Sorun yok.                                                                                                                                        | Korundu ve güçlendirildi. Aidatın %20'si **aynı ay** sadaka olur; havuzda ihtiyatın üstünde kalan her kuruş da **her ay** sadakaya gider.          |

**Rakamlar (temel senaryo, 36 ay):** yaklaşık 3.950 üye ve 29,4 milyon TL aidat. Bunun 19,6 milyon TL'si (%67) sadakaya,
4 milyon TL'si yaklaşık 570 kara güne destek olarak gider. Zayıf nokta işletme bütçesi: %10'luk işletme payı, iki kişilik
profesyonel bir ekibi ancak 6.000 üye civarında taşır. O güne kadar gönüllü emek, sponsor ya da yazılım geliri gerekir (§6.4).

**İlk üç adım:**

1. Bir dernek avukatı ve bir sigorta hukukçusuyla bu planı gözden geçir (§3.3). Mümkünse SEDDK'dan yazılı görüş al.
2. Yedi kurucuyu bul: güvenilir, farklı çevrelerden, en az biri mali müşavir ya da hukukçu.
3. Tek bir toplulukla, 100–300 kişilik kapalı bir pilot başlat: bir cami cemaati, bir hemşehri derneği ya da bir işyeri.

## 2. Ürün

### 2.1 Ad ve hikâye

Osmanlı şehirlerinde, çoğu cami avlusunda, üstü oyuk taş sütunlar dururdu. Varlıklı olan oyuğa sessizce para bırakır,
ihtiyacı olan yalnızca ihtiyacı kadarını alırdı. Veren alanı, alan vereni görmezdi. Sadaka Taşı bu geleneği bugünün
şeffaflığıyla sürdürür: **kimin aldığı gizli, paranın nereye gittiği herkese açıktır.**

"Sadaka Taşı" geçici bir addır. TÜRKPATENT'te marka araması yapılmalı. Avukat, adın "bağış topluyor" izlenimi verip
vermediğine de bakmalı; gerekirse dernek adı "Sadaka Taşı Dayanışma Derneği" gibi kurulabilir.

### 2.2 Kimler için

- Her ay sadaka veren ama "yerine ulaşıyor mu?" diye soran, 30–65 yaş arası insanlar.
- Kendisi de kırılgan olanlar: esnaf, işçi, memur, emekli. Beklenmedik bir masrafta kredi kartına, tefeciye ya da akrabaya muhtaç kalanlar.
- Topluluklar: cami cemaatleri, hemşehri ve köy dernekleri, aynı işyerinde çalışanlar.

### 2.3 Ne vaat eder, ne etmez

| Vaat eder                                                               | Vaat etmez                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Aidatın sadaka payının her ay, seçilen alanda ihtiyaç sahibine ulaşması | Garanti: yardım bir hak değil, kurul kararıdır      |
| Kara günde hızlı, onurlu, kimliği gizli bir dayanışma                   | Sigorta: DASK, SGK ve özel sigortanın yerini tutmaz |
| Her kuruşun ay ay yayımlanması                                          | Getiri, faiz, iade, bakiye                          |

## 3. Hukuki çerçeve

Bu bölüm, ayrı bir araştırmanın (Kasım 2026, yaklaşık 30 kaynak) özetidir. mevzuat.gov.tr araştırma ortamından
açılamadı; bilgiler Lexpera, Alomaliye, hukuk bürosu yazıları, TCMB, KVKK ve Diyanet sayfalarından derlendi. Her satırın
kesinliği yazılıdır. Madde numaraları, ceza aralıkları ve TL tutarları avukatla teyit edilmelidir.

### 3.1 Önerilen yapı

- **Dernek** (TMK md. 56 vd., 5253 sayılı Dernekler Kanunu). En az 7 kurucu gerekir. Amaç maddesinde iki şey yazmalı:
  - üyeler arası yardımlaşma (5253 md. 12'deki yardımlaşma sandığı: üyelerin temel ihtiyaçları ve kısa vadeli kredi ihtiyaçları);
  - ihtiyaç sahiplerine ve benzer amaçlı dernek ve vakıflara yardım.
- **Aidat, bağış değil.** Üyelerden alınan aidat 2860 kapsamı dışındadır, izin gerekmez. Üye olmayanlardan bağış istemek ise
  yardım toplamadır ve valilik ya da İçişleri izni ister: sitede bağış düğmesi, ilan edilmiş IBAN, sosyal medya çağrısı dahil.
  Bu yüzden sitede "bağış yap" yok, yalnız "üye ol" var. _Belirsiz:_ herkese internetten açılan bir üyelik fiilen bağış
  toplama sayılabilir mi? Avukata sorulacak.
- **Banka:** derneğin kendi hesabı, bir katılım bankasında (faiz yok); para çıkışı iki imzayla.
- **Tahsilat:** TCMB lisanslı bir ödeme kuruluşu (iyzico, PayTR vb.), aidatı doğrudan derneğin hesabına geçirir. Nakit hiç alınmaz.
- **Teknoloji şirketi (isteğe bağlı):** yazılımı sağlar, paraya hiç dokunmaz. Para kendi hesabından geçerse 6493'e göre
  ödeme kuruluşu izni gerekir.

### 3.2 Mevzuat özeti

| Konu                                              | Ne diyor                                                                                                                                                                                                                                                                                    | Tasarıma etkisi                                                                                                     | Kesinlik                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Yardım toplama (2860, 7262 değişikliği)           | İzinsiz yardım toplanamaz; internet dahil. 7262 ile idari para cezası 5.000–100.000 TL, internette 10.000–200.000 TL oldu; tutarlar her yıl yeniden değerlemeyle artar. Erişim engeli ve paraya el koyma da var. Örnekler: 2020 belediye kampanyaları, 2022 İBB, Nesin Vakfı hesap blokesi. | Kişisel hesap yok; üye olmayandan bağış istenmez.                                                                   | büyük olasılıkla                                 |
| Dernek ve sandık (TMK 56, 5253 md. 12)            | En az 7 kurucu. Dernek üyeleri için yardımlaşma sandığı kurabilir; kâr payı dağıtamaz, "gelir, faiz veya başka adlarla" üyelere para aktaramaz. Fesihte mal üyelere dağıtılmaz.                                                                                                             | Yardım ihtiyaca dayalı; ödenene bağlı limit yok. Fazla fonun sadakaya gitmesi tüzükte amaç olarak yazılır.          | büyük olasılıkla                                 |
| Sigortacılık (5684, TTK 1401, SEDDK yönetmeliği)  | "Her ne ad altında olursa olsun" prim karşılığı teminat vermek sigortacılıktır; ruhsatsız yapmak suçtur (5684 md. 35). Mütüel sigorta bile ruhsatlı bir kooperatif (en az 200 ortak) ister. Dernek fonlarını sigorta sayan bir emsal bulunamadı.                                            | Talep hakkı yok, ihtiyaç tespiti, kurul kararı, fonla sınırlı, garanti yok. Lansmandan önce SEDDK'dan yazılı görüş. | büyük olasılıkla; ceza aralığı doğrulanmadı      |
| Ödeme hizmetleri (6493)                           | Derneğin kendi aidatını lisanslı kuruluşla tahsil etmesi lisans gerektirmez. Başkası adına para toplamak ödeme kuruluşu izni ister (md. 14); izinsiz faaliyet suçtur (md. 28).                                                                                                              | Teknoloji şirketi paraya dokunmaz.                                                                                  | büyük olasılıkla                                 |
| Bankacılık (5411 md. 150)                         | İzinsiz mevduat ya da katılım fonu kabulü suçtur. Mevduat, adı ne olursa olsun istenince geri ödenmek üzere alınan paradır.                                                                                                                                                                 | İade yok, bakiye yok, getiri yok.                                                                                   | büyük olasılıkla; ceza aralığı doğrulanmadı      |
| Kişisel veriler (6698, 7499 ile 2024 değişikliği) | Sağlık verisi için açık rıza hâlâ bir hukuki dayanak. Derneklere tanınan yeni şart yalnız siyasi, felsefi, dini ya da sendikal amaçlılar için. VERBİS muafiyeti koşullu; 2025 değişikliği doğrulanmalı.                                                                                     | Açık rıza ve veri minimizasyonu (teşhis değil "rapor var" bilgisi); veriler Türkiye'de.                             | büyük olasılıkla; 2025 VERBİS ayrıntısı belirsiz |
| Vergi (GVK 89/1-4, KVK 10/1-c, VİV)               | Bağış indirimi yalnız kamu yararına dernek ve vergi muafiyetli vakıflara yapılan bağışlarda (%5, kalkınmada öncelikli yörelerde %10). Sıradan derneğe aidat da bağış da indirilemez. Kamu yararı statüsü en az 1 yıl faaliyet ve Cumhurbaşkanı kararı ister.                                | Vergi avantajı vaat edilmez. Ödemeler bağış değil aidattır.                                                         | büyük olasılıkla                                 |
| Dernekler Yönetmeliği                             | Tahsilatlar 30 gün içinde, eşiği aşan tutarlar 2 iş günü içinde bankaya yatırılır. Eşik her yıl artar (2026 tutarı doğrulanmalı).                                                                                                                                                           | Nakit hiç alınmaz.                                                                                                  | büyük olasılıkla                                 |

### 3.3 Avukata ve mali müşavire sorulacaklar

1. Tüzüğe 5253 md. 12 sandığı, üyelere ihtiyaca dayalı karşılıksız yardım ve üye olmayanlara yardım birlikte yazılabilir mi? Örnek madde metni.
2. Basamaklı yardım tavanı ve üç aylık bekleme süresi sigortacılık riski yaratır mı? SEDDK'ya görüş başvurusu nasıl yapılır?
3. İnternetten herkese açık üyelik, 2860 bakımından bağış toplama sayılır mı? Üyelik formunda nelere dikkat edilmeli?
4. Aidatın %20'sinin aynı ay başka dernek ve vakıflara aktarılması tüzükte nasıl yazılmalı?
5. Kurucunun dernekte ücretli çalışması ya da yazılım şirketiyle sözleşme yapılması: çıkar çatışması kuralları.
6. Faizsiz borç (karz-ı hasen) sandığı, 5253 md. 12'deki "kısa vadeli kredi ihtiyaçları" kapsamında kurulabilir mi? Koşulları?
7. KVKK: sağlık belgeleri için açık rıza metni, saklama süreleri, VERBİS durumu.
8. Muhasebe: işletme hesabı mı, bilanço esası mı? Sandık hesapları ayrı mı tutulur? Bağımsız denetim nasıl yapılır?

### 3.4 Dini çerçeve

- Diyanet Din İşleri Yüksek Kurulu'nun 2005 kararına göre sosyal, karşılıklı ve ticari sigorta genelde caizdir. Bu yüzden
  "sigorta haram, o yüzden sandık" diye bir gerekçe kullanılmamalı. Sandığın gerekçesi dayanışma ve sadakadır.
- Zekâtta temlik şarttır: mal fakirin mülküne geçmeli ve verene dönmemelidir. Bu yüzden zekât ve fitre, verenin de
  yararlanabileceği bir havuza konamaz. **Sandık zekât ve fitre kabul etmez.** İleride, yalnız ihtiyaç sahiplerine vekâletle
  dağıtılan ayrı bir zekât hesabı açılabilir.
- **Terim:** havuza giden kısma "sadaka" değil "dayanışma aidatı" denir. "Sadaka payı" ayrı tutulur ve aynı ay dağıtılır.
  Site bu dili kullanıyor.
- Danışma kurulunda bir ilahiyatçı olmalı. DİYK'den yazılı görüş istenebilir.

## 4. Sandık kuralları

Kuralların tamamı [`kurallar.mjs`](kurallar.mjs) dosyasındaki `VARSAYILAN_KURALLAR` nesnesindedir ve testlidir. Bir
değeri orada değiştirmek siteyi, hesaplayıcıyı ve projeksiyonu birlikte değiştirir.

| Kural           | Değer                                                                                                       | Neden                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Asgari aidat    | Ayda 150 TL, üst sınır yok                                                                                  | Herkesin katılabileceği bir eşik; ama havuzun taşıyabileceği bir tutar.                                                    |
| Bölünüş         | %20 sadaka payı · %70 dayanışma havuzu · %10 işletme                                                        | Sadaka niyeti her ay yerine gelir; havuz kara günleri taşır; işletme payı bir tavandır.                                    |
| Bekleme süresi  | 3 ay kesintisiz aidat; ara verip dönen üyede yeniden işler                                                  | Yalnız kara günü geldiğinde katılıp hemen yardım almayı önler.                                                             |
| Yardım tavanı   | 3.–11. ay: 10.000 TL · 12. aydan sonra: 20.000 TL (12 ayda toplam); herkese aynı                            | Aidat tutarına bağlı değil, bu yüzden sigortaya ve "kendi parasını çekme"ye benzemez. Her yıl enflasyona göre güncellenir. |
| Karar           | Belgelenen gider esas alınır; sigorta, SGK ya da belediyeden karşılanan kısım düşülür                       | Yardım bir hak değil, ihtiyaç tespitidir.                                                                                  |
| İnceleme yolu   | 5.000 TL'ye kadar ve kalan tavanın yarısına kadar: hızlı inceleme, 24 saat · diğerleri: kurul, 3 iş günü    | Küçük ve acil ihtiyaç beklemesin; büyük tutarlara çok göz baksın.                                                          |
| Ödeme yeri      | Önce doğrudan kuruma (hastane, eczane, usta, cenaze hizmeti); değilse üyenin adına kayıtlı hesaba           | Dolandırıcılığı azaltır, paranın amacına gittiğini gösterir.                                                               |
| Afet kuralı     | Bir ayda havuzun en çok %30'u ödenir; fazlası sıraya girer, sonraki aylarda orantılı ödenir                 | Büyük bir depremde ilk başvuranlar havuzu bitirmez.                                                                        |
| İhtiyat akçesi  | O ayki havuz girişinin 3 katı                                                                               | Normal ayların 1,5–2 yılını, afetin ilk ayını taşır (§6.3).                                                                |
| Ay sonu         | Sadaka payı ve ihtiyatın üstündeki havuz, üyelerin tercih ettiği alanlara dağıtılır                         | "Kalan para sadakaya gider" sözünün kendisi.                                                                               |
| Sadaka alanları | En acil ihtiyaç (kurul seçer), gıda, eğitim, sağlık, barınma, afet                                          | Anlaşmalı ve denetlenen dernek ve vakıflar aracılığıyla; her ay alan alan yayımlanır.                                      |
| Kurul           | 3 gönüllü üye + 1 görevli; talep sahibinin adını ve aidat tutarını görmez; gerekçeli karar                  | Tarafsızlık ve onur. Kimlik ve belge kontrolünü yalnız görevli yapar.                                                      |
| İtiraz          | Uygun görülmeyen talebe bir kez; ilk kararı vermeyen üyeler inceler. Uygun görülmeyen talep tavandan düşmez | Hata affedilir.                                                                                                            |
| Diğer           | Bir anda bir açık talep · nakit yok · iade yok · zekât ve fitre yok                                         | Basitlik ve hukuki güvenlik.                                                                                               |

## 5. Para akışı ve şeffaflık

```
Üye aidatı ── lisanslı ödeme kuruluşu ── derneğin katılım bankası hesabı
                                              │
         ┌────────────────────────────────────┼──────────────────────────────┐
     %20 sadaka payı                      %70 havuz                     %10 işletme
         │                                    │                              │
         │                         kara gün yardımları                ödeme komisyonu,
         │                         (çoğu doğrudan kuruma)             personel, yazılım,
         │                                    │                       hukuk, denetim
         │                       ihtiyat hedefinin üstü (ay sonu)
         └──────────────┬─────────────────────┘
                 sadaka alanları (anlaşmalı dernek ve vakıflar, makbuzla)
```

Her ay yayımlanır: defter (her para hareketi, kişiler görünmeden), kara gün yardımlarının türe göre dökümü, sadaka
alanlarına dağıtım ve alıcı kurumların makbuzları, işletme giderlerinin kalem kalem dökümü. Yılda bir bağımsız denetim
raporu yayımlanır. Demo sitedeki Şeffaflık sayfası bu raporun taslağıdır.

## 6. Finans

### 6.1 Varsayımlar

Tutarlar 2026 TL'sidir ve kabadır. Projeksiyon, sitedeki "Sandık projeksiyonu" ile aynı fonksiyonla
(`projeksiyon()` / [`kurallar.mjs`](kurallar.mjs)) hesaplandı. Beklenen değer hesabıdır; gerçek aylar dalgalanır.

| Varsayım                 | Temkinli |    Temel |  İyimser |
| ------------------------ | -------: | -------: | -------: |
| Başlangıç üye            |      100 |      300 |      500 |
| Her ay katılan yeni üye  |       40 |      150 |      400 |
| Her ay ayrılan üye       |       %3 |       %2 |     %1,5 |
| Ortalama aylık aidat     |   250 TL |   350 TL |   400 TL |
| Yılda yardım isteyen üye |      %12 |      %10 |       %8 |
| Ortalama yardım          | 8.000 TL | 7.000 TL | 7.000 TL |

### 6.2 Üç senaryo, 36 ay

| Senaryo  | Üye (12. / 24. / 36. ay) | Toplanan aidat |       Sadakaya giden | Kara gün desteği | Desteklenen kara gün | 36. ayda aylık işletme geliri |
| -------- | ------------------------ | -------------: | -------------------: | ---------------: | -------------------: | ----------------------------: |
| Temkinli | 451 / 721 / 909          |  5,2 milyon TL |  2,9 milyon TL (%55) |    1,3 milyon TL |                 ~164 |                     23 bin TL |
| Temel    | 1.735 / 2.976 / 3.950    | 29,4 milyon TL | 19,6 milyon TL (%67) |      4 milyon TL |                 ~567 |                    138 bin TL |
| İyimser  | 4.508 / 8.183 / 11.249   | 91,2 milyon TL | 63,9 milyon TL (%70) |    8,7 milyon TL |               ~1.242 |                    450 bin TL |

Sadaka oranı ilk yıl düşük (%44–53), çünkü ihtiyat akçesi birikir. Sandık büyümeyi yavaşlattıkça oran %70–75'e çıkar.

### 6.3 Afet stres testi

Temel senaryoda 18. ayda üyelerin %15'inin aynı anda ortalama 15.000 TL istediği varsayıldı. O ayki ihtiyaç 4,5 milyon TL.
Afet kuralı gereği o ay bunun %15'i (681 bin TL) ödenir; kalan sıra **8 ayda** erir. Havuz hiçbir ay sıfırlanmaz. Bedeli
sadakadan ödenir: 36 ayda sadaka 19,6 milyon TL'den 15,2 milyon TL'ye iner. Afette yardım garanti edilmez ama sandık ayakta
kalır.

### 6.4 İşletme bütçesi ve başabaş

%10'luk işletme payından önce ödeme komisyonu çıkar (kartla tahsilatta kabaca %2–3). Geriye aidatların yaklaşık %7,5'i kalır.

| Gider (aylık, kaba varsayım)                               |          Tutar |
| ---------------------------------------------------------- | -------------: |
| 2 kişi (genel sekreter + vaka görevlisi), işveren maliyeti |     120.000 TL |
| Yazılım ve barındırma                                      |      15.000 TL |
| Mali müşavir                                               |      10.000 TL |
| Bağımsız denetim (yıllık 120.000 TL)                       |      10.000 TL |
| Hukuk danışmanlığı                                         |      10.000 TL |
| **Toplam**                                                 | **165.000 TL** |

Başabaş: ortalama aidat 250 TL ise yaklaşık 8.800 üye, 350 TL ise 6.300 üye, 500 TL ise 4.400 üye. Temel senaryoda 36.
ayda bile aylık işletme geliri (komisyondan sonra yaklaşık 100 bin TL) bu gideri karşılamıyor. Seçenekler:

1. **Yalın başlangıç:** kurucular ilk yıl gönüllü; yarı zamanlı bir vaka görevlisi; yazılım bu demodan geliştirilir.
2. **Sponsor modeli:** işletme giderlerini birkaç kurumsal sponsor ya da hayırsever karşılar; aidatın tamamı havuza ve
   sadakaya gider. Güven için çok güçlü bir mesajdır. Sponsorluk dernek üyelik aidatı değildir; 2860 açısından avukata sorulmalı.
3. **Yazılım geliri:** aşağıdaki B2B modeli.

### 6.5 Kurucu nasıl kazanır?

Sadaka parasından kâr edilmez. Bu hem hukuken hem ahlaken kırmızı çizgidir. Dürüst seçenekler:

- **Dernekte ücretli çalışan:** kurucu, işletme payından makul ve yayımlanan bir maaşla genel sekreter olabilir. Yönetim
  kurulu üyeliğiyle birleşmesi çıkar çatışması doğurur; avukata sorulmalı.
- **Yazılım şirketi (SaaS):** ayrı bir şirket bu platformu geliştirir ve **paraya dokunmadan** lisanslar:
  - derneğin kendisine, sözleşmesi ve bedeli yayımlanarak;
  - Türkiye'deki binlerce hemşehri, köy ve cenaze yardımlaşma derneğine. Çoğu bugün Excel ve WhatsApp'la çalışıyor;
  - işverenlere: çalışanlar için kurum içi dayanışma sandığı. İşveren katkısı eklenebilir; bir İK yan hakkı olur.

  Bu, işin asıl ticari tarafıdır ve sadaka parasından tamamen ayrıdır.

## 7. Pazara giriş

- **Pilot (6 ay):** tek bir topluluk, 100–300 üye. Ölçütler: üyelerin %80'i 6. ayda hâlâ aidat ödüyor; yardım kararları
  ortalama 3 iş gününü aşmıyor; hiç şikâyet edilmeden yayımlanan 6 aylık defter.
- **Kanallar:** cami dernekleri (cuma sonrası tanıtım), hemşehri dernekleri, işyerleri (İK), WhatsApp grupları, yerel
  radyo. Her ay kısa bir "bu ay ne oldu" videosu: kaç kara güne yetişildi, sadaka nereye gitti.
- **Mesaj:** "Sadakanız her ay yerine ulaşsın. Kara gününüzde yalnız kalmayın."
- **Güven:** kurucuların adları açık; aylık defter; ilk yıldan bağımsız denetim; danışma kurulunda ilahiyatçı, hukukçu ve mali müşavir.
- **Yapılmayacaklar:** referans ödülü ya da "arkadaşını getir" primi (saadet zinciri algısı), getiri vaadi, "garanti"
  kelimesi, ünlü yüzlerle abartılı reklam, üye olmayanlardan izinsiz bağış istemek.

## 8. Operasyon

- **Talep süreci:** başvuru → görevli kimliği ve belgeyi doğrular (e-Devlet barkodlu belge doğrulaması en hızlısı) →
  hızlı inceleme (24 saat) ya da kurul (3 iş günü) → ödeme (çoğu doğrudan kuruma) → deftere anonim kayıt.
- **Kimlik:** NVİ TC kimlik doğrulama servisi ya da ödeme kuruluşunun kimlik doğrulaması. Bir kişiye bir üyelik.
- **Dolandırıcılığa karşı:** bekleme süresi, tavan, doğrudan kuruma ödeme, belge doğrulama, bir anda bir talep, sık
  talep eden ve aynı belgeyi kullanan hesapların izlenmesi, 10.000 TL üstü kararlarda iki kurul üyesinin onayı.
- **Kurul:** dönüşümlü görev, çıkar çatışması beyanı, tanıdığının talebinden çekilme, gerekçeli ve suçlamayan karar dili.
- **Sadaka ortakları:** kamu yararına dernekler ve vergi muafiyetli vakıflar arasından, denetim raporu yayımlayanlar;
  her aktarım makbuzla.
- **Veri:** yalnız gerekli veri. Sağlıkta teşhis değil "rapor var" bilgisi tutulur. Belgeler şifreli saklanır ve yasal süre dolunca silinir.

## 9. Teknoloji

**Bu depodaki demo** (bu klasör) derlemesiz, sunucusuz bir sitedir. Kuralların tamamı test edilmiş saf fonksiyonlardır.
İçinde şunlar var: ana sayfa, kurallar, kişisel hesaplayıcı, 36 aylık sandık projeksiyonu (afet senaryolu), şeffaflık
sayfası (grafikler ve defter), sorular, üyelik, Hesabım, talep formu ve kurul paneli. Demo takvimiyle aylar kapatılabilir.
Para, kimlik ve belge yüklemesi taklittir; demo verisi yalnız tarayıcıda durur.

**Gerçek MVP için:**

| Parça           | Öneri                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sunucu ve veri  | TypeScript/Node API, PostgreSQL. Çift kayıtlı, değiştirilemez defter. `kurallar.mjs` sunucuya taşınır, testleriyle birlikte. |
| Tahsilat        | Lisanslı ödeme kuruluşunun tekrarlayan ödeme (abonelik) hizmeti; para doğrudan derneğin hesabına                             |
| Kimlik ve belge | NVİ doğrulaması; şifreli belge deposu; e-Devlet barkod kontrolü                                                              |
| Kurul paneli    | Rol tabanlı erişim, dört göz ilkesi, her işlemin denetim izi                                                                 |
| Bildirim        | SMS ve e-posta. Ticari ileti gönderilecekse İYS kaydı gerekir.                                                               |
| Barındırma      | Türkiye'de (KVKK yurt dışı aktarım kuralları nedeniyle); günlük şifreli yedek                                                |
| Yazı tipleri    | Google Fonts yerine sunucudan servis (KVKK)                                                                                  |

## 10. Riskler ve önlemler

| Risk                                      | Olasılık | Etki       | Önlem                                                                                       |
| ----------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------- |
| Ruhsatsız sigortacılık sayılmak           | Orta     | Çok yüksek | Talep hakkı yok, ihtiyaç esaslı karar, tek tip tavan; SEDDK yazılı görüşü; sözleşme dili    |
| İzinsiz yardım toplama sayılmak           | Orta     | Yüksek     | Yalnız üyelik aidatı; bağış düğmesi yok; avukat onaylı üyelik akışı                         |
| Güven kaybı ("sadakamızı yediler")        | Orta     | Çok yüksek | Aylık defter, bağımsız denetim, açık kurucular, makbuzlu sadaka aktarımı                    |
| Ters seçim (yalnız ihtiyacı olan katılır) | Yüksek   | Orta       | 3 ay bekleme, tavan, kesintisiz aidat şartı                                                 |
| Abartılı ya da sahte talep                | Orta     | Orta       | Belge doğrulama, doğrudan kuruma ödeme, iki onay, anomali takibi                            |
| Büyük deprem (yoğunlaşma)                 | Düşük    | Çok yüksek | Afet kuralı (%30), ihtiyat akçesi, coğrafi çeşitlilik, DASK'ın yerini tutmadığı uyarısı     |
| Enflasyon                                 | Yüksek   | Orta       | Tavanların ve asgari aidatın yıllık güncellenmesi; üyeye "aidatımı TÜFE ile artır" seçeneği |
| İşletme bütçesinin yetmemesi              | Yüksek   | Orta       | Yalın başlangıç, sponsor, yazılım geliri (§6.4)                                             |
| Kişisel veri ihlali                       | Düşük    | Yüksek     | Veri minimizasyonu, şifreleme, Türkiye'de barındırma, erişim kaydı                          |
| Kurucuya bağımlılık                       | Orta     | Yüksek     | Yönetim ve denetim kurulunda bağımsız üyeler; çift imza; yazılı süreçler                    |
| Saadet zinciri algısı                     | Düşük    | Yüksek     | Getiri ve referans ödülü yok; paranın nereye gittiği her ay açık                            |

## 11. Yol haritası

| Dönem                 | İş                                                                                                                                                    | Bitti sayılır                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0. Hazırlık (0–2. ay) | Avukat, sigorta hukukçusu ve mali müşavirle plan; 7 kurucu; tüzük; dernek kuruluşu; katılım bankası hesabı; ödeme kuruluşu sözleşmesi; KVKK metinleri | Dernek kurulmuş, hesap açık, SEDDK'ya görüş başvurusu yapılmış |
| 1. MVP (2–4. ay)      | Demo gerçek bir uygulamaya dönüşür: sunucu, defter, tahsilat, kurul paneli; 3–5 sadaka ortağıyla protokol                                             | İlk gerçek aidat alınmış, ilk aylık rapor yayımlanmış          |
| 2. Pilot (4–10. ay)   | Tek toplulukla 100–300 üye; aylık rapor; kurul pratiği; kurallar gerekirse ayarlanır                                                                  | §7'deki pilot ölçütleri tutmuş                                 |
| 3. Büyüme (10–24. ay) | Yeni topluluklar ve şehirler; ilk bağımsız denetim; işveren sandıkları; yazılım lisansı                                                               | 2.000+ üye, denetim raporu yayımlanmış                         |
| 4. Olgunluk (2. yıl+) | Karz-ı hasen sandığı (hukuki onayla); kamu yararı başvurusu değerlendirilir; mobil uygulama                                                           | İşletme payı giderleri karşılıyor                              |

## 12. Ölçütler

Aylık izlenecekler:

- **Büyüme:** aktif üye; aylık katılım ve ayrılma; ortalama aidat.
- **Sadaka:** sadakaya giden pay (hedef: 2. yıldan sonra %65+); alan dağılımı.
- **Yardım:** yardım talep oranı; ortalama karar süresi (hedef: hızlı 24 saat, kurul 3 iş günü); onay, kısmi onay ve ret
  oranları; itiraz sonuçları.
- **Sağlamlık:** ihtiyat akçesinin hedefe oranı; sırada bekleyen ödeme (normal aylarda 0 olmalı).
- **Verimlilik:** işletme giderinin aidatlara oranı (tavan %10).
- **Güven:** şikâyet sayısı; aylık rapor açılma sayısı.

## 13. Senin vermen gereken kararlar

1. **Ad:** "Sadaka Taşı" kalsın mı? (Marka araştırması ve avukat görüşüyle.)
2. **Kurucular:** yedi kişi kim? Yönetim, denetim ve yardım kurullarına kimler girer?
3. **Rakamlar:** asgari aidat (150 TL), sadaka payı (%20), tavanlar (10.000 / 20.000 TL), işletme tavanı (%10).
   Hepsi `kurallar.mjs`'te tek yerde; değiştirmek bir satırdır.
4. **İlk topluluk:** pilot hangi cemaat, dernek ya da işyeriyle yapılacak?
5. **Ticari yapı:** yazılım şirketi kurulacak mı? Sen dernekte mi çalışacaksın, şirkette mi?
6. **Faizsiz borç:** büyük ihtiyaçlar için karz-ı hasen sandığı ikinci aşamada açılsın mı?
7. **Bağış:** üye olmayanlardan da bağış alınacak mı? Alınacaksa 2860 izni gerekir.

## Ek A — Demoyu deneme

1. Klasörü bir statik sunucuyla açın (`npx serve sadaka-tasi`) ya da GitHub Pages'te `/sadaka-tasi/` adresine gidin.
2. **Hesabım → Örnek üyeyle gez:** 15 aylık bir üyenin tavanını, talep geçmişini ve aidatının nereye gittiğini görün.
3. **Kurul:** bekleyen dört talebe onay, kısmi onay, belge isteme ya da gerekçeli ret kararı verin.
4. Alttaki **Ayı kapat:** aidatlar alınır, sıradaki ödemeler yapılır, ihtiyatın üstü sadakaya dağıtılır; Şeffaflık sayfası güncellenir.
5. **Hesapla → Sandık projeksiyonu:** varsayımları değiştirin, afet senaryosunu açın.

## Ek B — Kaynaklar

Araştırmada kullanılan başlıca kaynaklar (Kasım 2026). Birincil metinler mevzuat.gov.tr'den ayrıca kontrol edilmelidir.

- Yardım toplama: [Lexpera 2860](https://www.lexpera.com.tr/mevzuat/kanunlar/yardim-toplama-kanunu-2860) ·
  [Yardım Toplama Esas ve Usulleri Yönetmeliği](https://www.lexpera.com.tr/mevzuat/yonetmelikler/yardim-toplama-esas-ve-usulleri-hakkinda-yonetmelik-1) ·
  [Erdem & Erdem bağış rehberi](https://www.erdem-erdem.av.tr/bilgi-bankasi/bagis-ve-yardim-rehberi) ·
  [İnternette yardım toplama izni (Webtekno)](https://www.webtekno.com/internet-yardim-toplama-faaliyetleri-izne-tabi-tutulacak-h104335.html)
- Dernek ve sandık: [TMK md. 56](https://av-saimincekas.com/kanun/turk-medeni-kanunu/madde-56-tmk/) ·
  [TÜSEV mevzuat görüşü](https://tusev.org.tr/wp-content/uploads/2024/01/MevzuatGorus_06092022.pdf) ·
  [Dernek sandıklarının hukuki durumu (Alomaliye)](https://www.alomaliye.com/2007/10/20/dernek-sandiklari-ve-bu-sandiklarin-hukuki-durumu/)
- Sigortacılık: [Sigortacılık kapsamında değerlendirilecek faaliyetler yönetmeliği](https://www.lexpera.com.tr/mevzuat/yonetmelikler/sigortacilik-kapsaminda-degerlendirilecek-faaliyetler-ve-mesafeli-akdedilen-sigorta-sozlesmeleri-1) ·
  [5684 (TSB)](https://www.tsb.org.tr/content/Legislations/1.5.5684.pdf)
- Ödeme hizmetleri: [TCMB ödeme kuruluşları](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Odeme+Hizmetleri/Odeme+Kuruluslari)
- KVKK: [7499 değişikliği (Erdem & Erdem)](https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verilerin-korunmasi-kanununda-neler-degisti) ·
  [VERBİS duyurusu](https://www.kvkk.gov.tr/Icerik/6990/DERNEK-VAKIF-VE-SENDIKALARA-AIT-IKTISADI-ISLETMELERIN-VERBIS-E-KAYIT-YUKUMLULUGU-HAKKINDA-DUYURU)
- Vergi: [Derneğe bağış (Alomaliye)](https://alomaliye.com/2016/12/08/dernege-yapilan-bagis-ve-yardimlar/) ·
  [TÜSEV kamu yararı bilgi notu](https://tusev.org.tr/wp-content/uploads/2024/06/DerneklericinKamuYarariVakiflaricinVergiMuafiyetiBilgiNotu.pdf)
- Diyanet: [Sigortanın dini hükmü](https://kurul.diyanet.gov.tr/tr/fetva/sigortanin-dini-hukmu-nedir/42e764b2-731b-44d0-b9c1-08dd1c135350) ·
  [Zekât şartları](https://kurul.diyanet.gov.tr/Cevap-Ara/393/zekat-kimlere-farzdir-gecerli-olmasinin-sartlari-nelerdir)
- Emsaller: [Amelebirliği cenaze yardımı](https://csgb.gov.tr/amelebirligi/sandigin-hizmetleri/cenaze-defin-yardimi/) ·
  [DİTİB cenaze fonu](https://www.memurlar.net/haber/687371/o-vasiyet-ditib-e-emanet.html?amp=1) ·
  [Büyükorhan mahalle cenaze fonu](https://www.bursahakimiyet.com.tr/bursa/bursa-buyukorhan-da-4-mahalleden-dikkat-ceken-karar-cenaze-fonu-kuruldu-1634015)
- Yaptırım örnekleri: [İBB bağışına el konulması (2020)](https://www.sozcu.com.tr/son-dakika-ibbnin-istanbullulardan-topladigi-6-2-milyonluk-bagisa-el-konuldu-wp6957800) ·
  [İstanbul Valiliği işlemi (2022)](https://medyascope.tv/2022/02/04/istanbul-valiligi-izinsiz-yardim-topladigi-gerekcesiyle-ibb-hakkinda-yasal-islem-baslatti/)
