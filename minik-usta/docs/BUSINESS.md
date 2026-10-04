# İş planı

Sahip: entrepreneur · Durum: Faz 1 taslağı (v1) · Tarih: 2026-10-04
Girdi: `docs/BRIEF.md` (§1, §4, §10, §11, §13, §15). `docs/GDD.md` ve `docs/META.md` paralel yazıldığı için bu belgedeki
oyun içi altın miktarları **varsayımdır** ve "product-lead ile netleşecek" diye işaretlidir.

---

## 0. Okuma notu: kaynak ve doğrulama sınırı

- Her sayı ya bir kaynağa bağlıdır (`[K-n]`, liste §14'te, URL + erişim tarihi) ya da **tahmin** diye işaretlidir.
- Bu oturumdan web sayfalarının çoğu ağ politikası nedeniyle doğrudan açılamadı. Rakamlar arama motoru sonuç
  özetlerinden alındı (§14'te "WS"). Doğrudan açılıp okunan birincil kaynak yalnızca Apple App Review Guidelines'tır
  (§14'te "WF"). **Yatırımcı sunumu ya da bütçe onayından önce `[K-n]` rakamları birincil rapordan teyit edilmelidir.**
  İki kaynak aynı metriğe farklı değer verdiyse ikisi de yazıldı.
- Kur: 1 USD = 48,4 TL (TCMB 9 Eylül 2026 döviz satış 48,4598) [K51].
- Hesap: "hesap" etiketli sayılar bu belgedeki diğer sayılardan türetilmiştir; yöntemi yanında yazılıdır.

## Yönetici özeti

| Konu             | Karar (ÖNERİ)                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hedef kitle      | Brief varsayımı 8 **teyit**: 25–54 yaş yetişkin casual bulmaca oyuncusu (çekirdek 35–54, kadın ağırlıklı). Çocuğa yönelik değil; §3'teki 14 koruma şartı zorunlu.                                                |
| Monetizasyon     | IAP çekirdek + isteğe bağlı ödüllü reklam. Geçiş (interstitial) ve banner reklam yok. Ücretli rastgele öğe yok. Tek para birimi (altın). Zamanlı satın alma teklifi MVP ve soft launch Aşama 1'de yok.             |
| Fiyat            | 6 altın paketi: $1,99–$99,99 / 89,99–4.499,99 TL. +5 hamle 900 altın (≈ $1,79), deneme başına en fazla 3 kez, artan fiyatla. Altınla satılan her öğede gerçek para karşılığı gösterilir.                        |
| Sallanan Köprü   | +5 hamle kaldıracı kalır; 7 etik sınırla (§4.5): aynı fiyat, reklam alternatifi, harcama tavanı, baskı metni yok, bot davranışı ödemeden bağımsız.                                                                |
| Botlar           | Açıkça etiketli "Renkli Tepe çırakları" (NPC). Gerçek oyuncu gibi sunulmaz. Backend gelince: gerçek oyuncu + etiketli bot karması.                                                                                |
| KPI              | Global hedef: D1 ≥ %42, D7 ≥ %16, D30 ≥ %7, ödeyen (D30) ≥ %2,5, ARPDAU (tier-1) ≥ $0,12. Soft launch "geç" eşikleri §6.2'de.                                                                                     |
| Soft launch      | Web kapalı test (TR) → Android TR + Filipinler (tutma) → iOS+Android Kanada/Avustralya/Yeni Zelanda (gelir) → global karar. 4 karar kapısı.                                                                      |
| İçerik           | Global lansman kapısı ≥ 150 bölüm. Mağaza sürümünden sonra 2 haftada 10 bölüm (ilk 6 hafta), sonra 2 haftada 20 bölüm.                                                                                            |
| Ekip ve bütçe    | 6,7 FTE, ≈ 10 ay, global lansman kararına kadar ≈ $275 bin (tahmin). Yalın senaryo: 3,5 FTE, 14 ay, ≈ $180 bin (tahmin).                                                                                          |
| En kritik 5 risk | (1) Çocuğa yönelik sayılma, (2) IP benzerliği (Bob the Builder "Scoop", "Little Builder", Block Blast, Color Block Jam), (3) Köprü'de sömürücü tasarım ve bot aldatması, (4) 50 bölümün kısa içerik pisti, (5) düşük seviye Android'de web performansı. |

---

## 1. Pazar ve rakip analizi

### 1.1 Pazar büyüklüğü

| Metrik                                              | Değer                                               | Kaynak |
| --------------------------------------------------- | --------------------------------------------------- | ------ |
| Mobil bulmaca türü toplam geliri, 2025              | $14,4 milyar                                        | [K1]   |
| Mobil bulmaca IAP geliri, 2025                      | > $10 milyar, yıllık +%14; Strateji'den sonra 2. tür | [K2]   |
| Mobil oyun reklam geliri, 2025                      | > $12 milyar                                        | [K3]   |
| Bulmacanın oyun reklam gelirindeki payı (Şub–Nis 2026) | %53                                              | [K2]   |
| IAP geliri büyüyen tek segment, 2025                | Hibrit-casual, yıllık +%20                          | [K2]   |

### 1.2 Rakipler

| Oyun (yayıncı)                                 | Model                                               | Ölçek                                                                                                                                              | Bizim için ders                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Royal Match (Dream Games, İstanbul)            | Yalnız IAP, reklam yok [K11]                        | 2025 ≈ $1,37 milyar (Sensor Tower tahmini), ömür boyu > $6 milyar [K4]; 2025 IAP > $1,4 milyar [K2]; IAP ARPDAU $0,17 [K12]; 2 haftada bir 100 yeni bölüm [K14] | Reklamsız premium his satılabilir. Lava Quest (100 oyuncu, 7 bölüm, 24 saat, 10.000 altın havuz) Sallanan Köprü'nün tür kalıbıdır [K10]. |
| Royal Kingdom (Dream Games)                    | IAP                                                 | İlk yıl $301,1 milyon; Ekim 2025 aylık $43,6 milyon [K5]; ünlü kampanyalarıyla dijital reklam harcaması Q1→Q2 2025 +%142 [K5]                       | Aynı stüdyonun ikinci oyununda bile UA bütçesi belirleyici; bu ölçekte UA ile yarışılmaz.                         |
| Candy Crush Saga (King)                        | IAP + reklam                                        | 2025 IAP > $1,1 milyar [K2]; IAP ARPDAU $0,11 [K12]                                                                                                 | Olgun dev; ARPDAU kıyası için alt sınır.                                                                          |
| Toon Blast (Peak, İstanbul; Zynga/Take-Two)    | IAP                                                 | Ömür boyu ≈ $2,3 milyar, aylık ≈ $32 milyon; ABD harcaması $1,5 milyar, Japonya $494 milyon [K8]                                                     | Gelir merkezi ABD + Japonya.                                                                                      |
| Gardenscapes / Homescapes (Playrix)            | IAP                                                 | Gardenscapes ömür boyu > $3 milyar; Q4 2024 IAP $114,5 milyon [K9]                                                                                  | Yapı/dekor metası 8+ yıl gelir üretebiliyor.                                                                      |
| Block Blast! (Hungry Studio)                   | Reklam ağırlıklı (banner, geçiş, ödüllü), az IAP [K6] | 2025'te 368 milyon indirme, dünyada 1. sıra; toplam 793 milyon; 300 milyon MAU [K6]; Ocak–Mayıs 2026 reklam geliri $127 milyon [K2]; günlük ≈ $584 bin (üçüncü taraf tahmini) [K6]; 8×8 tahta, poliomino blok [K6] | Blok yerleştirmenin dokunsal hazzı kitlesel; ama meta yok. Bizim boşluğumuz: bu his + bölüm/kasaba metası.        |
| Color Block Jam (Rollic, İstanbul)             | Hibrit (IAP + reklam) [K7]                          | 2025 geliri $107 milyon (bir kaynak) – $150 milyon (diğer kaynak); blok bulmaca alt türü gelirinin ≈ %75'i (alt tür ≈ $183 milyon); harcamanın %60'ı ABD [K7] | Mekanik komşumuz: renkli blokları eşleşen renkli **kapılardan** çıkarır. Farklılaşma zorunlu (§2).               |

### 1.3 Türkiye pazarı

| Metrik                                         | Değer                                                  | Kaynak |
| ---------------------------------------------- | ------------------------------------------------------ | ------ |
| Türkiye oyun pazarı, 2025                      | $1,01 milyar; USD bazında +%24,69, TL bazında +%51,46 | [K17]  |
| Mobil gelir / mobil oyuncu                     | $649 milyon / 47 milyon                                | [K17]  |
| Aktif oyuncu, cinsiyet                         | 50 milyon; %46 kadın, %54 erkek                        | [K17]  |
| Yurt içi mobil gelir (AppMagic kapsamı), 2025  | $347 milyon, +%6                                       | [K18]  |
| Türk geliştiricilerin küresel mobil oyun payı  | %5                                                     | [K18]  |
| Türk geliştirici gelirinde bulmaca payı        | ≈ %97                                                  | [K18]  |
| Türk yayıncı indirmeleri, 2025                 | 1,8 milyar, −%4                                        | [K18]  |
| Dream Games yatırım turu (Mayıs 2025)          | $2,5 milyar                                            | [K54]  |

İki Türkiye raporu farklı kapsam ölçer (toplam pazar ↔ AppMagic mobil); birbirine eklenmez.
Mobil oyuncu başına yıllık yurt içi gelir ≈ $13,8 (hesap: $649 milyon / 47 milyon).
**Çıkarım:** Türkiye ana dil, ev ve test pazarıdır; gelir merkezi ABD'dir (Toon Blast ve Color Block Jam'de ABD payı [K7][K8]).

### 1.4 Oyuncu profili

- ABD'de eşleştirme bulmacası ve kelime/zekâ/masa oyunu oyuncularının %75'i kadın; kadınların %62'si, erkeklerin %39'u
  bulmaca oynuyor; bulmaca oyuncularının çoğunluğu 35 yaş üstü [K19].
- Casual oyunlarda 25–44 yaş kadınlar kitlenin %61'i [K19].

### 1.5 Çıkarımlar

1. Bulmaca pazarı büyük ve büyüyor, ama gelir ilk birkaç oyunda toplanıyor; yeni oyunun asıl engeli UA maliyetidir (§6.3).
2. Blok yerleştirme indirme şampiyonu (Block Blast) ama reklamla para kazanıyor; blok + bölüm + IAP birleşimi 2025'te
   Color Block Jam ile kanıtlandı. Minik Usta tam bu kesişimde duruyor.
3. Liderler 2 haftada 100 bölüm ekliyor [K14]; küçük ekip içerik hacmiyle yarışamaz. Fark his (kaldır–indir) ve
   yapı metasıyla kurulur; bölüm üretimi araçlarla (solver + bot) hızlandırılır (§9).
4. İstanbul bu türün dünya merkezi: yetenek havuzu var, ama Dream/Peak/Rollic ile işe alım rekabeti de var [K18][K54].

---

## 2. Konumlandırma ve farklılaşma

**Konumlandırma (TR):** Minik Usta, blok yerleştirmenin sakin dokunsal hazzını bölüm ve kasaba metasıyla birleştiren,
her bölümde gerçek bir yapı inşa ettiğin yetişkin bulmaca oyunudur.
**EN (mağaza kısa açıklaması taslağı):** "A relaxing build puzzle: lift, swing and drop blocks to raise a whole town."

| Boyut            | Minik Usta                                       | Block Blast                     | Royal Match                       | Color Block Jam            |
| ---------------- | ------------------------------------------------ | ------------------------------- | --------------------------------- | -------------------------- |
| Çekirdek hareket | Kaldır → duvarın üstünden aşır → indir (düşüş)   | Sürükle-bırak, satır temizle    | Dokun-eşleştir                    | Kaydır, kapıdan çıkar      |
| Bölüm hedefi     | Renk planına göre yapı inşa et                   | Puan (sonsuz)                   | Engel temizle                     | Tahtayı boşalt             |
| Meta             | Kasaba + 5 hikaye bölümü; yapılar bölümden gelir | Yok                             | Görevlerle kale/dekor              | Doğrulanmadı               |
| Para modeli      | IAP + isteğe bağlı ödüllü reklam                 | Reklam ağırlıklı [K6]           | Yalnız IAP [K11]                  | Hibrit [K7]                |

**Beş farklılaştırıcı**

1. **İmza hareket "yukarı–aşağı"** (YAO ≥ %60): rakiplerin hiçbirinde yok; reklam kreatifinin ve mağaza videosunun kalbi.
2. **Her bölüm somut bir yapı parçası:** ilerleme gözle görülür; Block Blast'ta ilerleme yok.
3. **Saygılı F2P:** geçiş reklamı yok, ücretli rastgele öğe yok, botlar etiketli, gerçek para karşılığı görünür.
   Hipotez: mağaza yorumlarında ayırt edici olur (soft launch'ta yorum analiziyle ölçülür).
4. **Sıcak, yerel ama evrensel dünya:** aile firmasını yeniden açma, dede–torun bağı, kasaba komşuluğu, Gribeton mizahı.
   Hipotez: 35+ oyuncuya nostalji olarak hitap eder.
5. **Okunabilir derinlik:** renk + şekil + erişim + yerçekimi; bölüm 1–3 dakika.

**Benzerlikten kaçınma kuralları** (design-lead'e Faz 1 inceleme turunda REVIEW_LOG üzerinden iletilecek):

- **Royal Match / Royal Kingdom:** taç, kral, kraliyet mavisi + altın palet, "Royal" kelimesi, lav teması ve Lava Quest'in
  görsel dili kullanılmaz. Sallanan Köprü kendi dünyasında kalır (nehir, simit, tahta köprü).
- **Block Blast:** koyu lacivert tahta + parlak neon blok görünümü kullanılmaz. Saha sıcak kum/ahşap zeminli kalır (brief §11.3).
- **Color Block Jam:** mağaza görsellerinde ve videoda geçit değil **duvar üstü** hareket öne çıkar; geçitler kestirmedir.
- **Bob the Builder** (HIT Entertainment / Mattel; ad ve karakterler oyun yazılımı dahil tescilli [K48]):
  sarı kask + mavi tulum + kareli gömlek + alet kemeri kombinasyonu yok; konuşan iş makinesi karakteri yok; "Yapabilir
  miyiz? Evet, yapabiliriz!" türü slogan yok. **Kepçe EN'de "Scoop" diye çevrilmez:** Scoop, Bob the Builder'ın sarı
  kazıcısının adıdır; vinç karakteri Lofty'dir [K48]. EN için "Kepche" ya da yeni bir ad (karar design-lead'in).
- **Anahtar kelime ve metin:** rakip adları (Royal Match, Block Blast vb.) mağaza metninde ve anahtar kelimelerde kullanılmaz
  (Apple 2.3.7) [K29]; "minör değişiklikle kopya" yasağı (Apple 4.1) [K29].

---

## 3. Hedef kitle kararı

**Karar:** Brief varsayımı 8 teyit edildi. Birincil kitle 25–54 yaş yetişkin casual bulmaca oyuncusu (çekirdek 35–54,
kadın ağırlıklı); ikincil 18–24. Oyun çocuğa yönelik (child-directed) değildir ve öyle görünmemelidir.

**Gerekçe**

1. **Veri:** bulmaca oyuncularının çoğunluğu 35+ ve kadın [K19]. Tür kalıpları (can, lig, sandık, hikaye) bu kitleye göre olgunlaşmış.
2. **Çocuğa yönelik olsaydı:** Google Play Aileler programı → yalnız sertifikalı reklam SDK'ları, kişiselleştirilmiş reklam
   yasak [K31]; Apple Kids kategorisi → üçüncü taraf analitik ve reklam yok, satın alma ebeveyn kapısının arkasında
   [K29 §1.3, §5.1.4]; COPPA → 13 yaş altından kişisel veri için doğrulanabilir ebeveyn izni [K33][K34]; Brezilya ECA
   Digital → reşit olmayanlarca erişilmesi muhtemel oyunlarda loot box yasak, 17 Mart 2026'dan itibaren [K45]; FTC'nin
   HoYoverse kararı → 16 yaş altına ebeveyn izni olmadan loot box satışı yasak, $20 milyon ceza [K35]. Bu kısıtlar
   ödüllü reklamı ve ölçümü daraltır; ARPDAU düşer (oranı tahmin edilmedi). Monetizasyon §4 bu yüzden yetişkin kitleye kuruldu.
3. **Ürün:** hikaye (firmayı yeniden açmak, kasaba ilişkileri, rakiple barışmak) yetişkin bakış açısıyla yazılabilir.
   Çocuk kahraman ≠ çocuk oyunu; ama aşağıdaki şartlar olmadan bu ayrım savunulamaz.

**Neden şart gerekiyor:** COPPA'nın "çocuğa yönelik" testi çok faktörlüdür: konu, görsel içerik, animasyonlu karakter ya
da çocuk odaklı etkinlik/teşvik, müzik, modellerin yaşı, çocuklara hitap eden ünlüler, dil, reklamların çocuklara yönelik
olup olmadığı ve kitle bileşimine dair ampirik kanıt [K33]. Animasyonlu karakter tek başına yeterli değildir ama bir
faktördür [K33]. 2025 değişikliğiyle pazarlama materyalleri, kullanıcı/üçüncü taraf yorumları ve benzer hizmetlerin
kullanıcı yaşı da eklendi; yürürlük 23 Haziran 2025, uyum tarihi 22 Nisan 2026 [K34]. Google Play, beyan edilen hedef
kitleye rağmen "çocukları hedefliyor sayılabilecek görsel ve terim" kullanımının değerlendirmeyi etkileyebileceğini ve
çocuklara "istemeden hitap" eden pazarlamayı denetlediğini söyler; yanlış beyan kaldırma sebebidir [K31]. Bizde 8 yaşında
kahraman + "oyuncak kutusu" sanat + inşaat teması üç faktörü birden tetikler.

**Zorunlu 14 şart**

| #   | Alan                     | Şart                                                                                                                                                                                                                                                                                                                                                        | Sahip                     |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| S1  | Sanat/içerik             | Eğitici çerçeve yok: "renkleri/şekilleri öğren", alfabe, sayı sayma dili yok.                                                                                                                                                                                                                                                                               | design-lead, product-lead |
| S2  | Sanat                    | Yazı tipi ve arayüz yetişkin okunaklılığında; el yazısı, tebeşir, çocuk çizimi stili yok.                                                                                                                                                                                                                                                                  | design-lead               |
| S3  | Hikaye                   | Ara sahne mizahı yetişkin bağlamı taşır (iş kurmak, belediye, komşuluk, nostalji); tuvalet mizahı ve çocuk şakası yok.                                                                                                                                                                                                                                     | design-lead               |
| S4  | Ses                      | Tekerleme, çocuk korosu, ninni tarzı müzik yok.                                                                                                                                                                                                                                                                                                             | design-lead               |
| S5  | Simge                    | Uygulama simgesinde Tuna'nın yüzü yakın planda yok; simge = blok + duvar + vinç kancası ya da kask. Simge A/B testi Sonra, yalnız 18+ hedeflemeyle.                                                                                                                                                                                                         | design-lead, entrepreneur |
| S6  | Mağaza                   | Kategori Bulmaca/Puzzle. "Eğitim", "Aile", "Kids" seçilmez; Apple Kids kategorisi ve Google Teacher Approved başvurusu yapılmaz [K29][K31].                                                                                                                                                                                                                  | entrepreneur              |
| S7  | Mağaza                   | Play Console hedef yaş grubu: yalnız "18 ve üzeri".                                                                                                                                                                                                                                                                                                         | entrepreneur              |
| S8  | Mağaza                   | Metin ve anahtar kelimede "çocuk, kids, toddler, eğitici, okul öncesi" yok. İlk ekran görüntüsü = oyun tahtası + tamamlanan yapı; karakter ikincil.                                                                                                                                                                                                         | entrepreneur              |
| S9  | Gizlilik                 | Gizlilik politikası: "Hizmet 13 yaş altına (AB'de ülkenin GDPR Madde 8 yaşının altına) yönelik değildir."                                                                                                                                                                                                                                                   | entrepreneur              |
| S10 | UA                       | Kullanıcı edinme reklamları yalnız 18+ (tercihen 25+) hedeflemeyle; "made for kids" envanteri ve çocuk kanalları hariç; çocuk influencer yok.                                                                                                                                                                                                               | entrepreneur              |
| S11 | Oyun içi reklam          | Mediation'da maksimum reklam içerik derecesi aile dostu (G/PG); kumar, alkol, flört kategorileri engelli.                                                                                                                                                                                                                                                  | code-lead                 |
| S12 | Yaş ekranı (mağaza sürümü) | Nötr yaş ekranı (doğum yılı, varsayılan değer yok, "18" ipucu yok) Bölüm 3 kazanıldıktan sonra, onay (CMP) adımıyla birlikte ve hiçbir reklam/analitik SDK'sı başlamadan gösterilir; böylece "ilk açılış → Bölüm 1 ≤ 3 dokunuş" bozulmaz. < 13 → çocuk muamelesi etiketi, bağlamsal reklam, kimlikli analitik yok. 13 ≤ yaş < ülkenin Madde 8 yaşı (13–16 [K36]) → kişiselleştirilmemiş reklam. Türkiye'de KVKK özel yaş sınırı koymaz; reşit olmayanın açık rızası Türk Medeni Kanunu m.16 ve veli üzerinden değerlendirilir [K37] → ihtiyatlı karar: TR'de 18 altına kişiselleştirilmiş reklam yok. Doğum yılı saklanmaz, yalnız yaş kovası saklanır. | code-lead, entrepreneur   |
| S13 | Web MVP                  | Üçüncü taraf SDK, kişisel veri, gerçek ödeme yok (yalnız localStorage). Bu yüzden web MVP'de yaş ekranı gerekmez.                                                                                                                                                                                                                                           | code-lead                 |
| S14 | Derecelendirme           | IARC ve Apple anketi dürüst doldurulur. Hedef PEGI 7 (ödül veren giriş sistemi); zamanlı teklif eklenirse PEGI 12; ücretli rastgele öğe olmadığı için PEGI 16 tetiklenmez [K42]. Apple'ın 2025 yaş sistemi (4+, 9+, 13+, 16+, 18+) anketle belirlenir [K30]. Türkiye: 7578 sayılı Kanun (RG 1 Mayıs 2026) derecelendirilmemiş oyunların platformlarda sunulamayacağını getirir; oyun platformu hükümleri Kasım 2026'da yürürlüğe girer [K39]. | entrepreneur              |

**İzleme tetikleyicisi:** soft launch'ta yaş ekranında 13 altı oranı > %5 (eşik tahmin) ya da mağazadan "çocuklara hitap"
bildirimi gelirse: sanat ve mağaza materyalleri yeniden incelenir, hukuki görüş alınır, gerekirse "karma kitle" moduna geçilir.

---

## 4. Monetizasyon modeli

### 4.1 Model: hibrit, IAP ağırlıklı

| Gelir kaynağı                                  | Karar                                                          | Etiket                                     |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Altın paketleri                                | Var (§5)                                                       | MVP (sahte satın alma), mağaza sürümünde gerçek |
| Başlangıç paketi                               | Tek seferlik, **süresiz** (satın alınana kadar mağazada)       | MVP (sahte)                                |
| Kumbara                                        | Var, Bölüm 20'de açılır, içeriği önceden görünür               | MVP (sahte)                                |
| Ödüllü reklam                                  | İsteğe bağlı, 3 yerleşim, günlük tavanlı (§4.3)                | MVP yer tutucu; mağaza sürümünde gerçek SDK |
| Geçiş (interstitial) reklam                    | **Yok**                                                        | Sonra yalnız ayrı test kararıyla           |
| Banner reklam                                  | **Yok**                                                        | —                                          |
| Ücretli rastgele öğe (loot box, çark, kart paketi) | **Yok** (kalıcı ilke)                                      | —                                          |
| Zamanlı satın alma teklifi (geri sayımlı paket) | MVP ve soft launch Aşama 1'de yok                             | Sonra (Aşama 2 testi, PEGI 12 kabulüyle)   |
| Sezon kartı "Usta Kartı"                       | Aylık, ödül yolu                                               | Sonra                                      |

### 4.2 Gerekçe

- Olgun pazarlarda (ABD, Kanada, Güney Kore, Japonya) oyun gelirinin %77–90'ı IAP; büyüyen pazarlarda reklam payı %55–70
  [K25]. Gelir merkezimiz ABD olduğu için çekirdek IAP'dir.
- Royal Match reklamsız modelle türün 1 numarası [K4][K11]; reklamsızlık marka değeridir.
- Ödüllü reklam ödemeyen oyuncuya ilerleme aracı verir: ABD ödüllü video eCPM iOS $13,75 / Android $12,01 (bir kaynak),
  iOS $19,63 / Android $16,49 (diğer kaynak); geçiş reklamı eCPM ≈ $9,64–10,11 [K24].
- Geçiş reklamı yok: 1–3 dakikalık bölümlerde her bölüm arası reklam kaldır–indir akışını böler. Tutmaya etkisi
  ölçülmeden eklenmez (hipotez).
- Zamanlı teklif yok: PEGI'nin Haziran 2026 kriterleri zamanlı/adet sınırlı teklifleri PEGI 12'ye taşır [K42]; ayrıca
  geri sayım baskısı etik ilkemizle çelişir. Aşama 2'de ödeyen oranı < %1,5 ise ayrı karar ile test edilir.

### 4.3 Ödüllü reklam yerleşimleri (varsayım; ekonomi product-lead ile netleşecek)

| Yerleşim                      | Ödül            | Tavan                                 |
| ----------------------------- | --------------- | ------------------------------------- |
| Kayıp ekranı                  | +5 hamle        | 1 / bölüm denemesi, 3 / gün           |
| Can 0 iken (ana ekran / bölüm öncesi) | +1 can  | 2 / gün                               |
| Günlük ödül                   | Ödül ×2         | 1 / gün                               |

Toplam ≤ 6 ödüllü reklam/gün. Reklam bölüm içinde açılmaz; "Hayır, teşekkürler" düğmesi "İzle" ile aynı boyuttadır.

### 4.4 Etik ilkeler (ekonomi ve UX tasarımına girdi)

| #   | İlke                                                                                                                                                                                                                                                                   | Dayanak     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| E1  | Ücretli rastgele öğe yok. Sandık (bölüm sandığı, lig sandığı) içeriği sabittir, açmadan önce gösterilir, sandık satın alınamaz.                                                                                                                                         | [K42][K43][K44][K45] |
| E2  | Tek para birimi (altın). Altınla satılan her öğenin yanında gerçek para karşılığı gösterilir ("900 altın ≈ $1,79"). Oran: en küçük paketin birim fiyatı (ihtiyatlı ve dürüst oran).                                                                                    | [K35][K40]  |
| E3  | Para birimi boşluğu yok: en sık harcama (+5 hamle, 900) en küçük pakete (1.000) sığar; oyuncu ihtiyacından çok fazla altın almaya zorlanmaz.                                                                                                                            | [K40]       |
| E4  | Bölüm içinde satış penceresi yok; teklif yalnız kayıp ekranında ve mağazada.                                                                                                                                                                                            | —           |
| E5  | "Vazgeç" düğmesi "Satın al" ile aynı boyutta; suçlayıcı metin yok ("Vazgeçiyorum, kaybetmek istiyorum" gibi).                                                                                                                                                          | [K41]       |
| E6  | Kayıp anındaki hamle fiyatı (900 / 5 = 180 altın/hamle) oyun öncesi planlı alımdan (Termos 450 / 3 = 150 altın/hamle) ucuz değildir; dürtüsel harcama ödüllendirilmez.                                                                                                  | —           |
| E7  | Oyuncunun kendi belirlediği aylık harcama limiti ayarı.                                                                                                                                                                                                                | Sonra (mağaza sürümü) |
| E8  | Bot zorluğu, bot elenme zamanları ve havuz bölüşümü oyuncunun ödeme geçmişinden bağımsızdır. EventService seed'i yalnız etkinlik kimliği + zaman; kod incelemesinde ve analitikte denetlenir.                                                                            | —           |
| E9  | Web MVP mağazasında "Test sürümü — ödeme alınmaz" etiketi.                                                                                                                                                                                                             | [K29 §2.3.1] |
| E10 | Günlük ödül döngüsü bir gün kaçırılınca **sıfırlanmaz, durur** (PEGI: ödüllendiren giriş sistemi PEGI 7, kaçırılan girişi cezalandıran PEGI 12).                                                                                                                        | [K42]       |

### 4.5 Sallanan Köprü: "+5 hamle elenmeyi önler" kaldıracının etik değerlendirmesi

**Durum:** Kaldıraç tür standardıdır (Royal Match Lava Quest: kaybeden ödülünü yitirir ve altınla devam etmeye teşvik
edilir [K10]). Devreye giren psikolojik baskılar: kayıp kaçınma (6 tahtalık ilerlemeyi kaybetme), batık maliyet ve sosyal
karşılaştırma ("Köprüde kalan: 47/100").

**Karar:** Kaldıraç kalır, 7 sınırla:

1. Fiyat etkinlik dışıyla aynıdır: 900 / 1.350 / 1.800 altın; bölüm denemesi başına en fazla 3 teklif, 4. teklif yok.
2. Her bölüm denemesinde 1 ödüllü reklam alternatifi (günlük tavan 3); ödemeyen oyuncu da bir kez kurtulabilir.
3. Etkinliğe girişte kural kartı: "Kaybedersen elenirsin. +5 hamleyle devam edebilirsin." + havuz büyüklüğü + kalan süre.
4. Kayıp penceresinde ek baskı metni ve "kalan oyuncu" sayacı yok; Tuna ağlamaz, tepki "kararlı" ifadesidir.
5. Gerçek para karşılığı görünür (E2).
6. Etkinlik turu başına +5 hamleye harcanabilecek altın tavanı 5.400 (≈ $10,75; iki tam eskalasyon, tahmin). Tavanda teklif
   yerine "Bir sonraki köprüde görüşürüz" ekranı.
7. Denetim metriği: Köprü içi +5 alımlarının toplam IAP gelirine oranı ≤ %25 (eşik tahmin). Aşılırsa tasarım gözden geçirilir.

### 4.6 Botların sunumu (brief §10 kararı)

| Seçenek                                         | Değerlendirme                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| A. Botları gerçek oyuncu gibi sunmak            | **Ret.** Aldatıcı uygulama riski (FTC Act [K35], AB haksız ticari uygulama), mağaza yanıltıcı pazarlama kuralı [K29 §2.3.1], keşfedilince güven kaybı. |
| B. Açıkça etiketli bot (NPC)                    | **MVP ve soft launch kararı.**                                                |
| C. Yalnız gerçek eşleştirme                      | Backend + yeterli eşzamanlı oyuncu gerektirir; soft launch ölçeğinde 100 kişilik gruplar dolmaz. |
| D. Gerçek oyuncu + boşlukları dolduran etiketli bot | **Backend hazır olunca (Kapı 3) kararı.**                                 |

**Uygulama (B):** 99 rakip "Renkli Tepe çırakları": kasaba temalı takma adlar (ör. "Çırak Fındık", "Kalfa Mısır"),
oyun dünyasından avatarlar (kask renkleri). Ülke bayrağı, "çevrimiçi" ışığı, gerçek insan adı-soyadı, sahte "X seni geçti!"
bildirimi yok. Etkinlik bilgi (i) panelinde: "Rakiplerin bilgisayarın yönettiği çıraklardır." Mağaza metninde "dünyanın
dört bir yanından oyuncularla yarış" iddiası yok.
**Emsal:** Skillz–AviaGames davasında botların insan gibi sunulması iddiası yanlış reklam davasının parçasıydı; iki dava
$80 milyonla uzlaştı [K46] (gerçek para yarışması; bizim durumumuzdan ağır ama yön gösterici).
**Ölçüm:** etiketin katılıma etkisi bilinmiyor; soft launch'ta etkinlik katılım ve tamamlama oranı izlenir.

---

## 5. Fiyat tablosu

### 5.1 Varsayımlar

- TR fiyatları KDV (%20) dahil, ABD fiyatları satış vergisi hariç. TR liste fiyatı ≈ kurun %93'ü; KDV düşülünce TR net
  gelir ≈ ABD'nin %78'i (hesap: 89,99 / 1,20 / 48,4 / 1,99). Bu bölgesel indirim **tahmindir**; Aşama 1'de dönüşümle test edilir.
- Mağaza komisyonu ilk $1 milyon yıllık gelir için %15 (Apple Small Business Program, Google Play) [K49].
- Fiyatlar mağaza kademesine en yakın değere yuvarlanır; App Store Türkiye TL ile satış yapar ve düşük ek kademeler sunar [K52].
- Royal Match'in en küçük altın paketi $1,99 [K16] → giriş fiyatı tür standardıdır.
- Altın miktarları ve altınla satılan öğe fiyatları **varsayım, product-lead ile netleşecek**.

### 5.2 Altın paketleri

| Paket        | Altın  | USD    | TL (KDV dahil) | Altın / $ | Taban pakete göre fazla |
| ------------ | ------ | ------ | -------------- | --------- | ----------------------- |
| Avuç         | 1.000  | 1,99   | 89,99          | 503       | —                       |
| Kova         | 2.750  | 4,99   | 219,99         | 551       | +%10                    |
| El Arabası   | 6.000  | 9,99   | 449,99         | 601       | +%19                    |
| Kamyon       | 13.000 | 19,99  | 899,99         | 650       | +%29                    |
| Vinç Dolusu  | 35.000 | 49,99  | 2.249,99       | 700       | +%39                    |
| Şantiye      | 75.000 | 99,99  | 4.499,99       | 750       | +%49                    |

Gerçek para karşılığı oranı (E2): 1 altın ≈ $0,00199 ≈ 0,09 TL (Avuç paketi).

### 5.3 Paketler

| Paket                     | İçerik (varsayım, product-lead ile netleşecek)          | USD  | TL     | Koşul                                       |
| ------------------------- | ------------------------------------------------------- | ---- | ------ | ------------------------------------------- |
| Başlangıç Paketi          | 2.500 altın + 2 Çekiç + 1 Vinç + 2 Termos               | 1,99 | 89,99  | Tek seferlik, süresiz; mağaza Bölüm 5'te açılır |
| Kumbara                   | Kazandıkça dolar; kapasite 3.000–6.000 altın            | 2,99 | 134,99 | Bölüm 20'de açılır; içerik önceden görünür   |
| Usta Kartı (Sonra)        | 30 günlük ödül yolu                                     | 4,99 | 219,99 | Sonra                                       |

### 5.4 Altınla satılan öğeler (varsayım, product-lead ile netleşecek)

| Öğe                            | Altın | ≈ USD | ≈ TL | Not                                                 |
| ------------------------------ | ----- | ----- | ---- | --------------------------------------------------- |
| +5 hamle (1. teklif)           | 900   | 1,79  | 81   | Royal Match kıyası: ekstra hamle 900, sonraki > 2.000 [K15] |
| +5 hamle (2. teklif)           | 1.350 | 2,69  | 121  | ×1,5                                                |
| +5 hamle (3. teklif, son)      | 1.800 | 3,58  | 162  | ×2; 4. teklif yok                                   |
| Tam can (5)                    | 900   | 1,79  | 81   | Royal Match kıyası: can 900 altın [K15]             |
| Geri Al                        | 300   | 0,60  | 27   |                                                     |
| Çekiç                          | 600   | 1,19  | 54   |                                                     |
| Boya Fırçası                   | 600   | 1,19  | 54   |                                                     |
| Vinç                           | 900   | 1,79  | 81   | En güçlü bölüm içi güçlendirici                      |
| Termos (+3 hamle, oyun öncesi) | 450   | 0,90  | 41   | E6                                                  |
| Mala Başlangıcı                | 600   | 1,19  | 54   |                                                     |
| Açık Kepenk                    | 600   | 1,19  | 54   |                                                     |

**Ödemeyen oyuncu şartı (product-lead'e girdi):** Kazanılan altınla, ödemeyen bir oyuncu her 10 bölümde en az 1 kez
+5 hamle alabilmelidir (hedef, tahmin). Ekonomi simülasyonu (Faz 3 bot raporu) bunu doğrulamalı.

---

## 6. KPI hedefleri ve ölçüm planı

### 6.1 Kıyas değerleri

| Metrik                         | Kıyas                                                                                                    | Kaynak      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------- |
| D1                             | Bulmaca türü %31,85. Tüm oyunlar: üst %25 ≈ %30, üst %10 ≈ %40                                          | [K21][K20]  |
| D7                             | Bulmaca %12,18. Tüm oyunlar: üst %25 %6–7, üst %10 %11–12                                                | [K21][K20]  |
| D30                            | Bulmaca %5,35. Tüm oyunlar: medyan %0,69–0,79, üst %1 %13–15                                             | [K21][K20]  |
| Oturum süresi                  | Medyan 5–6 dk, üst %25 8–9 dk (2024 verisi)                                                              | [K22]       |
| Günlük oturum                  | Ortalama 4                                                                                               | [K22]       |
| Ödeyen oranı                   | Match-3 için önerilen hedef %1,69; üst oyunlar %3,5–4                                                    | [K13]       |
| IAP ARPDAU (2025)              | Royal Match $0,17; Candy Crush $0,11                                                                     | [K12]       |
| CPI (ABD)                      | Bulmaca iOS ≈ $3,00 / Android ≈ $2,00 (bir kaynak); iOS $2,32 / Android $0,69 (diğer); match-3 Android $1,00–2,50, iOS $2,00–5,00 | [K23] |
| Ödüllü video eCPM (ABD)        | iOS $13,75–19,63; Android $12,01–16,49                                                                   | [K24]       |
| Android vitals kötü davranış   | Kullanıcının gördüğü çökme %1,09, ANR %0,47 (genel)                                                      | [K28]       |

### 6.2 Hedefler

| Metrik                                         | Soft launch "geç"  | Global hedef | "Durdur/yeniden düşün" | Not                                   |
| ---------------------------------------------- | ------------------ | ------------ | ---------------------- | ------------------------------------- |
| D1                                             | ≥ %38              | ≥ %42        | < %30                  | Bulmaca ortalamasının üstü [K21]      |
| D7                                             | ≥ %14              | ≥ %16        | < %9                   |                                       |
| D30                                            | ≥ %5               | ≥ %7         | < %3                   |                                       |
| Medyan oturum süresi                           | ≥ 7 dk             | ≥ 9 dk       | < 5 dk                 | [K22]                                 |
| Oturum / DAU / gün                             | ≥ 3                | ≥ 4          | < 2                    | [K22]                                 |
| Oynanan bölüm / DAU / gün                      | ≥ 6                | ≥ 8          | < 4                    | tahmin                                |
| Öğretici tamamlama (Bölüm 1–5)                 | ≥ %90              | ≥ %93        | < %80                  | tahmin                                |
| İlk gün Bölüm 10'a ulaşan kurulum              | ≥ %55              | ≥ %60        | < %40                  | tahmin                                |
| Ödeyen oranı (kohort, D30 kümülatif)           | ≥ %1,5             | ≥ %2,5       | < %0,8                 | [K13]                                 |
| ARPDAU (IAP + reklam, tier-1)                  | ≥ $0,08            | ≥ $0,12      | < $0,05                | [K12] kıyasıyla, tahmin               |
| Ödüllü reklam / DAU / gün                      | 1,0–3,0            | 1,0–3,0      | > 3,0                  | > 3 = ekonomi çok sıkı işareti, tahmin |
| Çökme / ANR (Android vitals)                   | < %0,5 / < %0,2    | aynı         | ≥ %1,09 / ≥ %0,47      | [K28]                                 |
| Etik: Köprü +5 geliri / toplam IAP             | ≤ %25              | ≤ %25        | > %35                  | tahmin                                |
| Etik: iade oranı                               | ≤ %1               | ≤ %1         | > %2                   | tahmin                                |
| Etik: "para tuzağı / pay to win" geçen 1–2 yıldızlı yorum oranı | ≤ %2 | ≤ %2   | > %5                   | tahmin                                |

### 6.3 Birim ekonomi (tahmin modeli)

- Tutma eğrisi D1 %40 ve D7 %15'ten üs yasasıyla uydurulur: R(d) = 0,40 · d^−0,504 → D30 ≈ %7,2 (hesap).
- 180 günde kurulum başına aktif gün ≈ 11,0 (hesap: 1 + Σ R(d), d = 1…180).
- LTV180 = 11,0 × ARPDAU → $0,10 için $1,10; $0,15 için $1,65; $0,20 için $2,20 (hesap).
- ABD CPI: Android $1,00–2,50, iOS $2,00–5,00 [K23]. **Sonuç:** global hedef KPI'larla bile ABD iOS ücretli UA 180 günde
  kendini ödemez; Android'de ARPDAU ≥ $0,15 ve CPI ≤ $1,50 iken LTV180/CPI ≥ 1,1 olur (hesap).
- Çıkarım: (a) kaldır–indir videosu ile kreatif IPM ve organik/ASO kritik; (b) global lansman LTV180/CPI ≥ 1,2 kapısına
  bağlı (§8); (c) Royal Kingdom ölçeğinde UA harcaması [K5] bir rekabet aracı değildir.

### 6.4 Ölçüm planı (ayrıntı `docs/ANALYTICS.md`, Faz 5, code-lead ile)

- **MVP olayları:** brief §12 listesi (app_open, tutorial_step, level_start, level_end, booster_used, offer_shown,
  purchase (sahte), event_join, event_eliminated, star_spent, life_lost).
- **Ek öneriler:** `offer_result` (yerleşim, fiyat, kabul/ret), `ad_rewarded` (yerleşim, tamamlandı mı), `coin_source` /
  `coin_sink` (miktar, neden), `event_continue` (Köprü +5; altın/reklam; kaçıncı teklif), `store_open`, `chest_open`
  (sabit içerik kimliği), `session_end` (süre), `settings_changed`; mağaza sürümünde `age_gate_result` (yalnız kova:
  <13, 13–15, 16–17, 18+) ve `consent_result`.
- **Panolar:** (1) tutma kohortları D1/D7/D30; (2) FTUE hunisi (açılış → Bölüm 1 başla → bitir → ana ekran → ilk yıldız);
  (3) bölüm hunisi ve zorluk sıçramaları (kazanma oranı, deneme, kalan hamle; LEVEL_REPORT ile karşılaştırma);
  (4) ekonomi kaynak/çıkış dengesi; (5) monetizasyon (ödeyen %, ARPPU, ARPDAU, reklam/DAU); (6) etkinlik (katılım,
  elenme tahtası, +5 kullanımı); (7) etik koruma panosu (§6.2 son üç satır).
- **Araç:** MVP konsol/yerel. Mağaza sürümünde tek analitik SDK (seçim code-lead + entrepreneur); yurt dışına aktarım
  için KVKK standart sözleşmesi imzadan sonra 5 iş günü içinde Kurum'a bildirilir [K38].

---

## 7. 8 haftalık LiveOps takvimi

Kapsam: ilk mağaza sürümünden (soft launch Aşama 1) itibaren ilk 8 hafta. İlkeler: aynı anda en fazla 2 etkinlik
(Köprü + Lig); hafta temaları yalnız `config/events.json` / `config/economy.json` değişikliğiyle (product-lead);
"kod" etiketli maddeler code-lead'in takvimine 4 hafta önceden girer; zamanlı satın alma teklifi yok (P-2).
Varsayılan Köprü: 6 saatlik katılım penceresi, havuz 10.000 altın (brief §10).

| Hafta | Tema                          | Sallanan Köprü                              | Usta Ligi                               | İçerik                                   | Değişiklik türü | Ölçülen KPI                         |
| ----- | ----------------------------- | ------------------------------------------- | --------------------------------------- | ---------------------------------------- | --------------- | ----------------------------------- |
| 1     | Renkli Tepe'ye hoş geldin     | Varsayılan                                  | Herkes Bronz Mala'da başlar             | Bölüm 1–50                               | —               | FTUE hunisi, D1, çökme              |
| 2     | Fırın Kokusu                  | Cuma–Pazar havuz 12.000 (+%20)              | Varsayılan                              | —                                        | config          | D7, Köprü katılımı                  |
| 3     | İçerik güncellemesi 1         | Varsayılan                                  | Hafta sonu Zor/Çok Zor puanı ×2         | Bölüm 51–60 (Hikaye 6 başlar)            | config + içerik | İçerik sonu kaybı                   |
| 4     | Altın Vida Haftası            | Kazanana +1 Altın Mala                      | Varsayılan                              | Kumbara kapasitesi +%25                  | config          | Ödeyen oranı, kumbara dönüşümü      |
| 5     | İçerik güncellemesi 2         | Varsayılan                                  | Varsayılan                              | Bölüm 61–70 (Hikaye 6 sonu)              | içerik          | Bölüm 50+ oyuncuların D+3 tutması   |
| 6     | Kepçe'nin Kazı Haftası        | Varsayılan                                  | Hafta sonu tüm galibiyetler +1 puan     | Kazı ağırlıklı bölümlerde ilk denemede 1 Termos hediye | config | Güçlendirici kullanımı, altın çıkışı |
| 7     | İçerik güncellemesi 3         | Varsayılan                                  | Varsayılan                              | Bölüm 71–90 (Hikaye 7)                   | içerik          | D30 eğilimi                         |
| 8     | Festival ve değerlendirme     | Günde 2 pencere (config)                    | Sezon sonu: Elmas Mala rozeti           | —                                        | config          | Tüm KPI; 2. çeyrek planı            |

Product-lead'e istek (Faz 1 inceleme turunda REVIEW_LOG'a yazılacak): `events.json` şu parametreleri taşımalı: Köprü havuzu,
pencere sayısı/süresi, ödül ekleri, lig puan çarpanı, hafta sonu çarpanı, başlangıç–bitiş (UTC).

---

## 8. Soft launch planı

| Aşama              | Platform                    | Ülke                                    | Süre    | Kurulum           | UA bütçesi (tahmin)                       | Amaç                                    |
| ------------------ | --------------------------- | --------------------------------------- | ------- | ----------------- | ----------------------------------------- | --------------------------------------- |
| 0 Kapalı test      | Mobil web                   | Türkiye (+ EN gönüllüler)               | 2 hafta | 200–500 davetli   | $0                                        | His, FPS, FTUE, bölüm zorluğu           |
| 1 Tutma testi      | Android (Capacitor)         | Türkiye, Filipinler                     | 6 hafta | 5.000 + 5.000     | ≈ $3.000 (CPI ≈ $0,30, tahmin)            | D1/D7, huniler, çökme                   |
| 2 Gelir testi      | iOS + Android               | Kanada, Avustralya, Yeni Zelanda        | 8 hafta | 10.000            | ≈ $25.000 (karma CPI ≈ $2,50, [K23] aralığında tahmin) | D30, ödeyen %, ARPDAU, LTV eğrisi |
| 3 Global karar     | iOS + Android               | ABD, Birleşik Krallık, Almanya          | —       | —                 | Ayrı karar                                 | Ölçek                                   |

- Ülke gerekçesi: Avustralya, Yeni Zelanda, Kanada, Filipinler ve İskandinavya standart soft launch ülkeleridir; İngilizce
  konuşur ve ABD/BK'ye benzer harcar; ABD, BK, Almanya ve Japonya bu aşamada dışarıda tutulur [K26]. Türkiye: ana dil ve
  ev pazarı. Filipinler: İngilizce, düşük CPI. Türkiye ve Filipinler için güncel CPI verisi bulunamadı → $0,30 tahmindir.
- Japonya Toon Blast'ın 2. büyük pazarıdır [K8] ama dil desteği yok → Sonra.
- Eşikler test başlamadan yazılı sabitlenir, test sırasında değiştirilmez (soft launch rehberlerinin ortak kuralı [K27]).

**Karar kapıları**

| Kapı                | Geç (hepsi)                                                                                                                                                       | Uzat                                          | Durdur                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Kapı 0 (0 → 1)      | Kritik hata 0; 4× CPU yavaşlatmada ≥ 50 FPS; ilk açılış → Bölüm 1 ≤ 10 sn (brief §14); katılımcıların ≥ %70'i ankette kaldır–indir hareketini "tatmin edici" bulur (tahmin eşik); Bölüm 1–10 kazanma oranları LEVEL_REPORT hedefinden ±10 puan içinde | Eşiklerden 1'i kaçarsa: 1 tur (2 hafta)       | Anket < %50 → çekirdek his yeniden tasarlanır (proje sahibine) |
| Kapı 1 (1 → 2)      | D1 ≥ %38, D7 ≥ %14, öğretici ≥ %90, çökme < %0,5, ANR < %0,2                                                                                                      | D1 %30–38: en fazla 2 iterasyon × 2 hafta     | 2 iterasyon sonra D1 < %30                                 |
| Kapı 2 (2 → 3)      | D30 ≥ %5, ödeyen ≥ %1,5, ARPDAU ≥ $0,08, en az 1 kanalda öngörülen LTV180/CPI ≥ 1,0, içerik ≥ 150 bölüm, etik metrikleri eşik içinde                              | 1 eşik kaçarsa: 4 hafta                       | ARPDAU < $0,05 ve ödeyen < %0,8                             |
| Kapı 3 (global)     | Tier-1'de en az 1 kanalda LTV180/CPI ≥ 1,2; marka başvuruları yapılmış; derecelendirmeler, KVKK/GDPR belgeleri tamam; EventService backend hazır (değilse etiketli botla devam) | —                                     | —                                                          |

---

## 9. 50 bölüm sonrası içerik yol haritası ve üretim temposu

### 9.1 Sorun: içerik pisti

Aktif oyuncu günde 6–15 bölüm oynarsa (tahmin) 50 bölüm 4–9 günde biter (hesap). D7 ve D30 hedefleri içerik sonuna çarpar.
Liderler 2 haftada 100 bölüm ekliyor [K14].

### 9.2 İçerik sonu kararı (brief §10 "Diğer"; product-lead ile ortak, ÖNERİ)

- **MVP:** "Yeni bölümler yolda" ekranı; Sallanan Köprü ve Usta Ligi oynanabilir kalır (etkinlik bölümleri tamamlanmış
  bölümlerden seçilir — product-lead kuralı).
- **Sonra-1 (Aşama 1 öncesi):** "Usta Modu" = 50 bölümün sıkı sürümü (hamle = solver minimumu + 1, "Zor" etiketi). Sanat
  maliyeti 0; bölüm verisinden türetilir; solver ve bot zaten doğrular.
- **Global lansman kapısı:** ≥ 150 bölüm (hesap: 50 + 100 yeni).

### 9.3 Yol haritası (Sonra; temalar ve mekanikler product-lead/design-lead onayına tabidir)

| Hikaye bölümü              | Bölümler | Ana yapı                  | Yeni mekanik önerisi (bölüm başına 1)      | Mağaza sürümünden itibaren |
| -------------------------- | -------- | ------------------------- | ------------------------------------------ | -------------------------- |
| 6 Liman Pazarı             | 51–70    | Balık hali, tezgâhlar     | Konveyör satır (saha satırı N hamlede kayar) | Hafta 3–5                  |
| 7 Tren İstasyonu           | 71–90    | Peron ve saat             | Ray makası (geçit yön değiştirir)          | Hafta 7                    |
| 8 Dağ Evi                  | 91–110   | Kar evi, şömine           | Buzlu blok (düşünce 1 hücre kayar)         | Hafta 9                    |
| 9 Belediye Meydanı         | 111–130  | Belediye binası           | Mıknatıs (aynı rengi 1 hücre çeker)        | Hafta 11                   |
| 10 Gribeton'u Renklendir   | 131–150  | Gri fabrika → renkli atölye | Kalıp (bloğun şekli değişir)             | Hafta 13                   |

### 9.4 Üretim temposu ve kapasite (tahmin)

| Dönem                           | Tempo                 | Birikimli bölüm              |
| ------------------------------- | --------------------- | ---------------------------- |
| Mağaza sürümü hafta 1–6         | 2 haftada 10 bölüm    | Hafta 5 sonunda 70           |
| Hafta 7 ve sonrası              | 2 haftada 20 bölüm    | Hafta 13 sonunda 150 (Kapı 2/3) |

- 1 bölüm tasarımcısı, araçlarla (validate + solve + bot + preview) haftada 8–12 bölüm (tasarım + ayar + inceleme).
  2 haftada 10 bölüm = 0,5 tasarımcı; 2 haftada 20 bölüm = 1 tasarımcı.
- Sanat: her hikaye bölümü 1 ana yapı (5 parça), 6–8 kasaba görevi, 2 ara sahne (3–6 panel) → 2D sanatçı ≈ 3 hafta/hikaye bölümü.
- Kural: hikaye bölümü başına en fazla 1 yeni mekanik; kod gerektiren mekanik code-lead'e en az 4 hafta önceden verilir.

---

## 10. Ekip ve bütçe tahmini (tamamı tahmin)

**Süre:** Faz 2 (4 hf) + Faz 3 (8 hf) + Faz 4 (6 hf) + Faz 5 (4 hf) + Aşama 0 (2 hf) + Aşama 1 (6 hf) + Aşama 2 (8 hf)
= 38 hafta + 4 hafta tampon ≈ 10 ay (hesap; faz süreleri tahmin).

**Maaş kıyası:** Türkiye 2026 oyun geliştirici ortalaması 83.700 TL/ay (aralık 45.300–147.600), oyun tasarımcısı ortalaması
70.000 TL (aralık 38.000–110.000), animasyon ve görsel tasarım uzmanı ortalaması 46.000 TL [K50]. Kaynakta net/brüt
ayrımı belirsiz. İşveren maliyeti = kaynak değerinin ≈ 1,6 katı (vergi + SGK, tahmin).

| Rol                                          | FTE | Aylık işveren maliyeti (TL) | Başlangıç |
| -------------------------------------------- | --- | --------------------------- | --------- |
| Yapımcı / ürün (kurucu)                      | 1,0 | 150.000                     | Faz 2     |
| Kıdemli geliştirici (TypeScript/Phaser)      | 1,0 | 220.000                     | Faz 2     |
| Geliştirici (Capacitor, araçlar, backend)    | 1,0 | 160.000                     | Faz 2     |
| Oyun ve bölüm tasarımcısı                    | 1,0 | 130.000                     | Faz 2     |
| 2D sanatçı (karakter, arayüz)                | 1,0 | 120.000                     | Faz 2     |
| 2D sanatçı / animatör (kasaba, ara sahne)    | 0,5 | 60.000                      | Faz 3, serbest |
| QA / oyun testi                              | 0,5 | 45.000                      | Faz 3     |
| Ses tasarımı                                 | 0,2 | 25.000                      | Faz 4, paket iş |
| UA / pazarlama                               | 0,5 | 70.000                      | Aşama 1   |
| **Toplam**                                   | **6,7** | **980.000 TL ≈ $20.250** |           |

| Kalem (≈ 10 ay)                                                                                       | Tutar                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Personel (10 ay, geç başlayan roller dahil üst sınır)                                                 | ≈ 9,8 milyon TL ≈ $202.500         |
| Soft launch UA (Aşama 1 + 2, §8)                                                                       | ≈ $28.000                          |
| Kreatif üretim (10 video konsepti)                                                                    | ≈ $5.000                           |
| Marka tescili: EUIPO 2 sınıf €900 [K53]; USPTO 2 sınıf $700 [K53]; TÜRKPATENT ücreti doğrulanamadı (≈ $300); vekil ≈ $2.000 | ≈ $4.000           |
| Hukuk ve gizlilik (aydınlatma metni, gizlilik politikası, kullanım şartları, KVKK standart sözleşme bildirimi [K38], CMP) | ≈ $5.000   |
| Test cihazları (2 düşük seviye + 1 orta Android, 1 eski iPhone)                                        | ≈ $1.500                           |
| Yazılım, barındırma, mağaza geliştirici hesapları                                                      | ≈ $3.000                           |
| EventService backend (Aşama 2 sonu, ≈ $500/ay)                                                         | ≈ $2.000                           |
| Beklenmeyen (%10)                                                                                     | ≈ $25.000                          |
| **Toplam (global lansman kararına kadar)**                                                            | **≈ $275.000**                     |

- **Yalın senaryo:** kurucu + 1 kıdemli geliştirici + 1 tasarımcı/sanatçı + 0,5 serbest sanat = 3,5 FTE, 14 ay,
  ≈ $180.000 (tahmin). Ajan destekli geliştirme kod süresini kısaltabilir; etkisi ölçülmediği için hesaba katılmadı.
- Global lansman UA bütçesi bu tabloda yok; Kapı 3'te LTV/CPI verisine göre ayrıca karar verilir.

---

## 11. Risk kaydı

Ölçek: Olasılık (O) ve Etki (E) 1–5; Skor = O × E. ≥ 15 kırmızı, 10–14 sarı, < 10 yeşil.

| Kimlik | Risk                                                                                                                                                                                          | O | E | Skor | Azaltma                                                                                                                                                                       | Sahip                         | Tetik / izleme                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | - | - | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| R-01   | Çocuğa yönelik ya da karma kitle sayılma (COPPA faktörleri [K33], 2025 değişikliği [K34], Play "istemeden hitap" denetimi [K31], Brezilya ECA Digital [K45])                                  | 3 | 5 | 15   | §3 S1–S14                                                                                                                                                                     | entrepreneur, design-lead     | Mağaza bildirimi; yaş ekranında < 13 oranı > %5       |
| R-02   | Bob the Builder benzerliği: çocuk inşaatçı + kask; Kepçe → "Scoop" çevirisi; vinç karakteri (Lofty); HIT/Mattel oyun yazılımında tescilli [K48]                                               | 2 | 5 | 10   | §2 kuralları; EN ad listesi incelemesi; karakter siluet yan yana testi                                                                                                         | design-lead                   | Faz 1 sanat incelemesi                               |
| R-03   | "Little Builder" EN adı: ≥ 4 mağaza uygulaması (çocuk inşaat oyunları), Fox & Sheep "Little Builders" (2–6 yaş), USPTO "LITTLE BUILDER" tescili (oyuncak bloklar) — NAMING.md                | 4 | 4 | 16   | EN'de kullanma; NAMING.md ilk 3'ten seç                                                                                                                                       | entrepreneur                  | İsim kararı (Faz 1 sonu)                             |
| R-04   | Royal Match / Block Blast / Color Block Jam görsel-mekanik benzerliği → Apple 4.1 taklit, 2.3.7 meta veri reddi [K29]                                                                          | 3 | 4 | 12   | §2 kuralları; ekran görüntüsü yan yana karşılaştırma; rakip adı anahtar kelimede yok                                                                                           | design-lead, entrepreneur     | Mağaza incelemesi reddi                              |
| R-05   | Marka tescili: ad tescil edilemez ya da itiraz gelir; "usta / builder / block" tanımlayıcı → zayıf koruma                                                                                      | 3 | 4 | 12   | İsim kararından sonra 2 hafta içinde vekil araması; TÜRKPATENT + EUIPO + USPTO sınıf 9 ve 41 başvurusu; ayırt edici ad                                                          | entrepreneur                  | Vekil araması sonucu                                 |
| R-06   | Sömürücü tasarım (Köprü'de kayıp kaçınma, artan +5 fiyatı, gizli gerçek para) → CPC ilkeleri [K40], FTC HoYoverse [K35], Digital Fairness Act önerisi (2026 Q3 bekleniyordu [K41]), PEGI 2026 [K42], yorum itibarı | 3 | 4 | 12 | §4.4–4.5                                                                                                                                                         | entrepreneur, product-lead    | Etik koruma panosu (§6.2)                            |
| R-07   | Botların gerçek oyuncu sanılması → aldatma iddiası, güven kaybı; emsal Skillz–AviaGames [K46]                                                                                                  | 2 | 4 | 8    | §4.6 B seçeneği; mağaza metninde "gerçek oyuncu" iddiası yok                                                                                                                   | entrepreneur, code-lead       | Yorumlarda "bot" şikâyeti                            |
| R-08   | Loot box / kumar kuralları: Belçika ücretli loot box'ı yasa dışı sayar, Hollanda koşullu [K44]; Brezilya yasağı [K45]; mağazalar oran açıklaması ister [K29 §3.1.1][K32]; PEGI 16 [K42]      | 2 | 5 | 10   | E1: ücretli rastgele öğe hiç yok; sandık sabit içerikli ve satılmaz                                                                                                             | product-lead, entrepreneur    | Ekonomi tasarım incelemesi                           |
| R-09   | Düşük seviye Android'de Phaser/WebView performansı: forumlarda Capacitor/WebView'de 10–30 FPS raporları (eski cihaz, eski kaynaklar) [K47]; imza hareket için dokunuş→hareket 1 kare şartı | 3 | 5 | 15   | Performans bütçesi (çizim çağrısı, parçacık, doku atlası), WebGL, referans düşük seviye cihazda haftalık ölçüm, "azaltılmış efekt" modu, Aşama 1 öncesi cihaz matrisi; başarısızsa yerel sarmalayıcı değerlendirmesi (Sonra) | code-lead | 4× CPU'da < 50 FPS; vitals [K28]           |
| R-10   | İçerik pisti kısa: 50 bölüm 4–9 günde biter (tahmin) → D7/D30 düşer                                                                                                                           | 4 | 4 | 16   | §9: Usta Modu, ≥ 150 bölüm kapısı, araçla üretim                                                                                                                               | product-lead, entrepreneur    | Bölüm 50'ye ulaşanların D+3 kaybı                    |
| R-11   | UA maliyeti ve doygun pazar; ABD iOS'ta LTV180 < CPI (§6.3); büyük rakiplerin reklam harcaması [K5]                                                                                            | 4 | 4 | 16   | Kreatif IPM, ASO/organik, TR topluluğu; Kapı 3 LTV/CPI ≥ 1,2                                                                                                                   | entrepreneur                  | Aşama 2 LTV eğrisi                                   |
| R-12   | Düşüş/yerçekimi mekaniklerinin "haksız" algılanması (rüzgâr, cam, 700 ms ağır yerçekimi) → olumsuz yorum, D1 düşüşü                                                                            | 3 | 3 | 9    | Düşüş gölgesi her zaman doğru (K-18); Aşama 0 anketinde "haksızlık" sorusu; kayıp nedeni analitiği                                                                             | product-lead, design-lead     | Kayıp nedeni dağılımı                                |
| R-13   | KVKK/GDPR: SDK'larla yurt dışı aktarım (standart sözleşme, 5 iş günü bildirim [K38]); GDPR Madde 8 yaşları 13–16 [K36]; 7578 sayılı Kanun derecelendirme şartı [K39]                            | 3 | 3 | 9    | Web MVP'de SDK yok; mağaza sürümünden önce hukuk paketi (§10)                                                                                                                  | entrepreneur, code-lead       | Mağaza sürümü kontrol listesi                        |
| R-14   | Kapsam şişmesi (Takım/Kulüp, gerçek backend, sezon kartı, Albüm) → Faz 3–4 gecikmesi                                                                                                          | 4 | 3 | 12   | §12 kesme çizgisi; her öneriye MVP/Sonra etiketi                                                                                                                               | entrepreneur                  | REVIEW_LOG'da etiketsiz özellik önerisi              |
| R-15   | 26 engel tipi × 50 bölüm Faz 3'ü uzatır                                                                                                                                                       | 3 | 3 | 9    | §12.3 B planı                                                                                                                                                                  | product-lead, code-lead       | Faz 3 > 2 hafta kayma                                |
| R-16   | İmza hareketin pazarda karşılık bulmaması (yeni mekanik riski)                                                                                                                                | 2 | 5 | 10   | Faz 2 dikey dilimde ≥ 10 dış oyuncu testi; Kapı 0 anket eşiği                                                                                                                  | entrepreneur, product-lead    | Kapı 0 anketi                                        |
| R-17   | TL kuru ve mağaza fiyat kademesi değişimi TR fiyatlarını aşındırır                                                                                                                            | 4 | 2 | 8    | 6 ayda bir TR fiyat incelemesi; App Store Türkiye fiyat güncellemeleri izlenir [K52]                                                                                           | entrepreneur                  | Kur değişimi > %15                                   |
| R-18   | Ödüllü reklamlarda uygunsuz içerik (çocuk erişimi + marka)                                                                                                                                    | 2 | 3 | 6    | S11                                                                                                                                                                            | code-lead, entrepreneur       | Kullanıcı şikâyeti                                   |
| R-19   | İstanbul'da işe alım rekabeti (Dream, Peak, Rollic) ekip maliyetini artırır [K18][K54]                                                                                                       | 3 | 3 | 9    | Uzaktan ekip, serbest sanat, net kapsam                                                                                                                                        | entrepreneur                  | İşe alım süresi > 6 hafta                            |

**En kritik 5 risk:** R-01 (çocuğa yönelik sayılma), R-02 + R-03 + R-04 (IP benzerliği, tek başlıkta), R-06 + R-07
(Köprü'de sömürücü tasarım ve bot aldatması, tek başlıkta), R-10 (içerik pisti), R-09 (düşük seviye Android performansı).
R-11 (UA ekonomisi) skor olarak eşit ama Faz 1 kararlarıyla değil Kapı 3 ile yönetilir.

---

## 12. MVP kesme çizgisi

### 12.1 Özellik listesi

| Özellik                                                                 | Etiket   | Not                                                         |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Çekirdek oynanış K-01…K-33, 26 engel, 50 bölüm                           | MVP      | Brief                                                       |
| 4 bölüm içi + 3 oyun öncesi güçlendirici, Usta Serisi / Altın Mala       | MVP      | Brief                                                       |
| Kasaba ekranı + 5 hikaye bölümünün görevleri                             | MVP      | Brief                                                       |
| Hikaye ara sahneleri (bölüm başı/sonu, 3–6 panel)                        | MVP      | Brief                                                       |
| Kasaba görevi tamamlanınca sahne                                         | MVP-lite | Yapı belirme animasyonu MVP; diyaloglu görev sahnesi Sonra   |
| Can, altın, yıldız; galibiyet serisi                                     | MVP      | Brief                                                       |
| Sallanan Köprü, Usta Ligi (etiketli botlarla)                            | MVP      | P-4, P-5                                                    |
| Günlük ödül (kaçırınca sıfırlanmaz)                                      | MVP      | E10                                                         |
| Bölüm sandığı (sabit, önceden gösterilen içerik)                         | MVP      | E1                                                          |
| Kumbara, mağaza, başlangıç paketi (sahte satın alma, "test" etiketi)     | MVP      | E9                                                          |
| Altınla satılan öğede gerçek para karşılığı                              | MVP      | E2; ucuz, ilke                                              |
| Ödüllü reklam yer tutucusu (+5 hamle, can, günlük ×2)                    | MVP      | §4.3                                                        |
| Ayarlar (ses, müzik aç/kapa, titreşim, dil, renk körü, animasyon azalt, destek) | MVP | Brief                                                  |
| TR + EN, localStorage kayıt + migration, yerel analytics                 | MVP      | Brief + §6.4 ek olaylar                                     |
| Prosedürel sesler                                                        | MVP      | Brief; müzik Sonra                                          |
| Alt navigasyon: Mağaza, Lig, Ana Sayfa aktif; Takım kilitli "yakında"    | MVP      | Brief                                                       |
| Albüm sekmesi                                                           | Sonra    | Kilitli gösterilir; kapsam koruması                          |
| "Yeni bölümler yolda" ekranı                                             | MVP      | §9.2                                                        |
| Usta Modu                                                               | Sonra-1  | Aşama 1 öncesi                                              |
| Gerçek IAP (StoreKit / Play Billing), gerçek reklam SDK + mediation       | Sonra    | Mağaza sürümü                                               |
| Nötr yaş ekranı + CMP onayı                                              | Sonra    | Mağaza sürümünde zorunlu (S12)                              |
| Harcama limiti ayarı                                                     | Sonra    | Mağaza sürümü (E7)                                          |
| Push bildirimleri, bulut kaydı / hesap                                   | Sonra    | Brief                                                       |
| Takım / Kulüp, gerçek eşleştirmeli EventService backend'i                 | Sonra    | Brief; Kapı 3                                               |
| Zamanlı teklifler, geçiş reklamı                                         | Sonra    | Yalnız test kararıyla; varsayılan yok                       |
| Usta Kartı (sezon kartı), kozmetik (kask renkleri)                       | Sonra    |                                                             |
| Hikaye bölümleri 6–10, ek diller, sosyal giriş, global sıralama          | Sonra    |                                                             |

### 12.2 Kapsam koruma kuralı

Faz 2–4'te önerilen her yeni özellik REVIEW_LOG'da "MVP" ya da "Sonra" etiketi almadan işe alınmaz. Etiket için 3 soru:
(1) D1/D7'yi doğrudan etkiliyor mu? (2) Brief MVP listesinde mi? (3) Faz çıkış kriteri için şart mı? Üçü de "hayır" → Sonra.

### 12.3 B planı (Faz 3 iki haftadan fazla kayarsa; proje sahibinin onayıyla)

Yalnız Hikaye Bölümü 4'te ilk kez görülen 5 engel (S5 Döner Platform, W8 Rüzgâr Fanı, Y8 Harçlı Blok, S6 Asansör
İskele, S8 Balonlu Blok) Sonra'ya alınır; Bölüm 31–50 mevcut engellerin kombinasyonlarıyla yeniden kurgulanır; bölüm
sayısı 50 kalır. Kesilen engeller Hikaye 6–8'e yeni mekanik olarak taşınır.

---

## 13. Önerilen kararlar (DECISIONS.md'ye orkestratör aktarır)

Numaralar geçicidir (P-n); orkestratör D-xxx verir.

### P-1 — Hedef kitle: yetişkin casual oyuncu, çocuğa yönelik değil
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-04
Karar: Birincil kitle 25–54 yaş yetişkin casual bulmaca oyuncusu. Oyun çocuğa yönelik değildir; BUSINESS.md §3'teki 14 şart (sanat, mağaza, UA, yaş ekranı, derecelendirme) zorunludur. Play Console hedef yaşı "18 ve üzeri"; Kids/Aile kategorisine girilmez.
Gerekçe: Bulmaca kitlesi çoğunlukla 35+ ve kadın; çocuk kahraman COPPA/Play faktörlerini tetiklediği için koruma şartları gerekir; çocuğa yönelik model ödüllü reklamı ve ölçümü daraltır.
Etkilenen: ART_DIRECTION, STORY, UX_FLOWS (yaş ekranı), STORE_LISTING, TECH_DESIGN (SDK başlatma sırası)

### P-2 — Monetizasyon modeli
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-04
Karar: IAP çekirdek + isteğe bağlı ödüllü reklam (3 yerleşim, ≤ 6/gün). Geçiş ve banner reklam yok. Ücretli rastgele öğe yok; sandık içeriği sabit ve önceden gösterilir, sandık satılmaz. Tek para birimi (altın). Zamanlı satın alma teklifi MVP ve Aşama 1'de yok. Günlük ödül kaçırılınca sıfırlanmaz.
Gerekçe: Olgun pazarlarda gelirin %77–90'ı IAP; Royal Match reklamsız; PEGI 2026 (rastgele ücretli öğe 16, zamanlı teklif 12, cezalı giriş 12); Belçika/Brezilya loot box kuralları; CPC ve FTC çok katmanlı para uyarıları.
Etkilenen: META, config/economy.json, UX_FLOWS (mağaza, kayıp ekranı), TECH_DESIGN

### P-3 — Fiyat tablosu ve gerçek para gösterimi
Durum: ÖNERİ     Sahip: entrepreneur (+ product-lead altın miktarları)     Tarih: 2026-10-04
Karar: BUSINESS.md §5 fiyatları: 6 paket $1,99–99,99 / 89,99–4.499,99 TL; Başlangıç $1,99 (tek seferlik, süresiz); Kumbara $2,99. +5 hamle 900 / 1.350 / 1.800 altın, deneme başına en fazla 3. Altınla satılan her öğede "≈ gerçek para" (Avuç paketi birim fiyatıyla). Web MVP mağazasında "Test sürümü — ödeme alınmaz".
Gerekçe: Tür giriş fiyatı $1,99; CPC ilkeleri gerçek para gösterimini istiyor; en sık harcama en küçük pakete sığar.
Etkilenen: META, config/economy.json, UX_FLOWS, i18n

### P-4 — Sallanan Köprü etik sınırları
Durum: ÖNERİ     Sahip: entrepreneur + product-lead     Tarih: 2026-10-04
Karar: +5 hamle kaldıracı kalır: fiyat etkinlik dışıyla aynı; her denemede 1 ödüllü reklam alternatifi; tur başına +5 harcama tavanı 5.400 altın; girişte kural kartı; kayıp penceresinde baskı metni ve kalan oyuncu sayacı yok; bot davranışı ve havuz bölüşümü ödeme geçmişinden bağımsız; Köprü +5 geliri toplam IAP'nin ≤ %25'i izlenir.
Gerekçe: Kayıp kaçınma + sosyal karşılaştırma baskısını sınırlamak; düzenleyici (CPC, DFA, PEGI) ve itibar riski.
Etkilenen: META, config/events.json, UX_FLOWS, src/services/events

### P-5 — Botlar açıkça etiketli çıraklar olarak sunulur
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-04
Karar: MVP ve soft launch'ta 99 rakip "Renkli Tepe çırakları": oyun dünyası takma adları ve avatarları; bayrak, "çevrimiçi" işareti, gerçek insan adı yok; bilgi panelinde "bilgisayarın yönettiği çıraklar" yazar. Backend gelince gerçek oyuncu + etiketli bot karması. Botları gerçek oyuncu gibi sunmak hiçbir aşamada yok.
Gerekçe: Aldatıcı uygulama ve mağaza yanıltıcı pazarlama riski; Skillz–AviaGames emsali.
Etkilenen: META, STORY (çırak adları), UX_FLOWS, STORE_LISTING, src/services/events

### P-6 — Rakip benzerliğinden kaçınma ve EN adlandırma
Durum: ÖNERİ     Sahip: entrepreneur + design-lead     Tarih: 2026-10-04
Karar: Kepçe EN'de "Scoop" diye çevrilmez (Bob the Builder karakteri). "Little Builder" EN oyun adı olarak kullanılmaz. BUSINESS.md §2 benzerlik kuralları (Royal Match taç/lav/palet, Block Blast koyu tahta-neon blok, Bob the Builder kıyafet ve slogan) sanat yönüne girer.
Gerekçe: Tescilli karakter ve ad çakışması; Apple 4.1/2.3.7 ret riski.
Etkilenen: ART_DIRECTION, STORY, i18n/en.json, NAMING

### P-7 — MVP kesme çizgisi ve B planı
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-04
Karar: BUSINESS.md §12.1 tablosu MVP sınırıdır (Albüm, Usta Modu, gerçek IAP/reklam, yaş ekranı, push, bulut kaydı, Takım, zamanlı teklif Sonra). Faz 3 iki haftadan fazla kayarsa B planı: Hikaye 4'ün 5 yeni engeli Sonra'ya, bölüm sayısı 50 kalır.
Gerekçe: Kapsam koruması; 26 engel × 50 bölüm Faz 3 riskini taşır.
Etkilenen: GDD, LEVELS, TECH_DESIGN, UX_FLOWS

### P-8 — İçerik sonu ve üretim temposu
Durum: ÖNERİ     Sahip: entrepreneur + product-lead     Tarih: 2026-10-04
Karar: MVP'de "Yeni bölümler yolda" + etkinlikler açık. Aşama 1 öncesi Usta Modu (hamle = solver min + 1). Mağaza sürümünden sonra 2 haftada 10 bölüm (6 hafta), sonra 2 haftada 20 bölüm. Global lansman kapısı ≥ 150 bölüm.
Gerekçe: 50 bölüm aktif oyuncuda 4–9 günde biter (tahmin); D7/D30 hedefleri içerik gerektirir.
Etkilenen: LEVELS, META, ROADMAP (BUSINESS §9)

### P-9 — Soft launch planı ve karar kapıları
Durum: ÖNERİ     Sahip: entrepreneur     Tarih: 2026-10-04
Karar: Aşama 0 web kapalı test (TR) → Aşama 1 Android TR + Filipinler → Aşama 2 iOS+Android Kanada/Avustralya/Yeni Zelanda → Kapı 3 global. Eşikler BUSINESS.md §8'de; test başlamadan sabitlenir.
Gerekçe: Standart soft launch ülkeleri; TR ana dil; eşikler bulmaca kıyaslarının üstünde çünkü UA ekonomisi bunu gerektiriyor.
Etkilenen: ROADMAP, ANALYTICS, TECH_DESIGN (Capacitor zamanlaması)

### P-10 — Mağaza sürümü yaş ekranı
Durum: ÖNERİ     Sahip: entrepreneur + code-lead     Tarih: 2026-10-04
Karar: Nötr yaş ekranı, Bölüm 3 kazanıldıktan sonra CMP onayıyla birlikte ve hiçbir reklam/analitik SDK'sı başlamadan gösterilir. < 13: bağlamsal reklam, kimlikli analitik yok. 13 ≤ yaş < ülke Madde 8 yaşı: kişiselleştirilmemiş reklam. TR'de 18 altı kişiselleştirilmiş reklam yok. Yalnız yaş kovası saklanır. Web MVP'de yaş ekranı yok.
Gerekçe: Karma kitle riskine karşı ihtiyat; "ilk açılış → Bölüm 1 ≤ 3 dokunuş" korunur.
Etkilenen: UX_FLOWS, TECH_DESIGN, ANALYTICS

---

## 14. Kaynaklar

Erişim tarihi hepsi için 2026-10-04. Yöntem: **WS** = arama sonucu özeti (birincil sayfa bu ortamdan açılamadı),
**WF** = sayfa doğrudan okundu. Bir satırda birden çok URL varsa iddia o sorgunun ortak sonucudur.

| Kod  | Konu                                                         | URL                                                                                                                                                                                  | Yöntem |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| K1   | Sensor Tower State of Gaming 2026 (bulmaca 2025 geliri)       | https://gamedevreports.substack.com/p/sensor-tower-state-of-gaming-2026                                                                                                              | WS     |
| K2   | Sensor Tower bulmaca raporu; IAP, reklam payı, Block Blast reklam geliri | https://gameindustrylibrary.com/documents/state-of-puzzle-games-unknown-time-unknown-time-2025/read ; https://sensortower.com/blog/2025-q2-android-top-5-puzzle%20games-revenue-us-64bc1644e1714cfff1e615fc | WS |
| K3   | Mobil oyun reklam geliri 2025 > $12 milyar                    | https://wnhub.io/news/analytics/item-51349                                                                                                                                           | WS     |
| K4   | Royal Match 2025 geliri, ömür boyu harcama                    | https://www.pocketgamer.biz/royal-kingdom-surpasses-300m-in-first-year-beating-royal-match ; https://www.blog.udonis.co/mobile-marketing/mobile-games/dream-games                     | WS     |
| K5   | Royal Kingdom ilk yıl, Ekim 2025, reklam harcaması            | https://www.pocketgamer.biz/royal-kingdom-surpasses-300m-in-first-year-beating-royal-match ; https://respawn.outlookindia.com/gaming/gaming-guides/royal-kingdom-hits-300-million-in-year-one ; https://mobilegamer.biz/data-digest-royal-kingdom-clash-royale-csr-2-brawl-stars-fallout-shelter-funding-news-sea-stats-more/ | WS |
| K6   | Block Blast indirme, MAU, model, günlük gelir tahmini, 8×8    | https://eu.36kr.com/en/p/3706617203732616 ; https://www.uberstrategist.com/press-releases/block-blast-surpasses-10-million-mau-in-brazil-and-mexico-cementing-latam-as-a-growth-engine-for-global-success ; https://ideausher.com/blog/puzzle-game-like-block-blast-development/ ; https://games.gg/block-blast/guides/ | WS |
| K7   | Color Block Jam geliri, alt tür payı, mekanik                 | https://mobidictum.com/hybrid-casual-puzzle-games-q1-2025/ ; https://gamedevreports.substack.com/p/appmagic-top-10-hybrid-casual-games ; https://naavik.co/digest/how-niche-subgenres-are-reshaping-the-mobile-puzzle-market/ | WS |
| K8   | Toon Blast gelir ve pazarlar                                  | https://www.blog.udonis.co/statistics/toon-blast ; https://gamedevreports.substack.com/p/appmagic-peak-games-earned-over-5b                                                           | WS     |
| K9   | Playrix / Gardenscapes / Homescapes                           | https://sensortower.com/blog/homescapes-revenue ; https://www.statista.com/statistics/1089408/gardenscapes-player-spending                                                           | WS     |
| K10  | Royal Match Lava Quest kuralları                              | https://thisweekinliveops.substack.com/p/this-week-in-liveops-royal-matchs ; https://www.gamigion.com/unpacking-the-lava-quest-live-ops-event-in-mobile-games/                       | WS     |
| K11  | Royal Match reklamsız model                                   | https://www.blog.udonis.co/mobile-marketing/mobile-games/royal-match-analysis ; https://www.esports.net/news/mobile-games/how-does-royal-match-make-money/                            | WS     |
| K12  | IAP ARPDAU 2025 (Royal Match, Candy Crush, Gossip Harbor)     | https://naavik.co/digest/what-leading-match-3-and-merge-games-do-differently/                                                                                                       | WS     |
| K13  | Match-3 ödeyen oranı kıyası                                   | https://www.gameanalytics.com/blog/match-3-games-metrics-guide ; https://wnhub.io/news/other/item-18052                                                                              | WS     |
| K14  | Royal Match 2 haftada 100 bölüm                               | https://www.apkmirror.com/apk/dream-games-ltd-2/royal-match/                                                                                                                        | WS     |
| K15  | Royal Match can ve ekstra hamle altın fiyatları               | https://www.esports.net/news/mobile-games/royal-match-free-lives/ ; https://www.esports.net/news/mobile-games/how-does-royal-match-make-money/                                       | WS     |
| K16  | Royal Match IAP listesi ($1,99 Mini Coin Package)             | https://apps.apple.com/us/app/-/id1482155847 ; https://mixrank.com/appstore/apps/1482155847                                                                                          | WS     |
| K17  | Türkiye oyun pazarı 2025                                      | https://www.forbes.com.tr/ekonomi/turkiye-oyun-pazari-1-milyar-dolar-sinirini-asti ; https://mobidictum.com/tr/turkiye-oyun-sektoru-raporu-2025/ ; https://www.tamindir.com/haber/turk-oyun-sektoru-1-milyar-dolar-siniri-asti_106062/ | WS |
| K18  | AppMagic Türkiye Mobile Gaming Landscape 2026                 | https://mobidictum.com/appmagic-turkiye-mobile-gaming-landscape-2026/ ; https://appmagic.rocks/files/view/upload/Reports/Turkiye_Mobile_Gaming_Landscape_2026.pdf                   | WS     |
| K19  | Bulmaca oyuncu demografisi                                    | https://www.blog.udonis.co/mobile-marketing/mobile-games/puzzle-games-report ; https://www.pangleglobal.com/resource/27797 ; https://appodeal.com/blog/who-will-play-your-games-in-2026/ | WS |
| K20  | GameAnalytics tutma kıyasları 2025/2026                       | https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game ; https://investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf           | WS     |
| K21  | Bulmaca türü D1/D7/D30                                        | https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies.md ; https://gamegrowthadvisor.com/blog/2026-03-17-mobile-game-kpis-benchmarks-2026/                             | WS     |
| K22  | Oturum süresi ve günlük oturum                                | https://gameindustrylibrary.com/documents/gameanalytics-mobile-gaming-benchmarks-2025 ; https://investgame.net/wp-content/uploads/2025/02/2025-GameAnalytics-Mobile-Gaming-Benchmarks.pdf | WS |
| K23  | CPI kıyasları                                                 | https://click-vision.com/mobile-game-marketing-statistics ; https://foxdata.com/fr/blogs/2026-mobile-game-user-acquisition-cost-benchmarks-how-much-should-you-spend/ ; https://admiral.media/mobile-game-marketing-benchmarks/ ; https://megadigital.ai/en/blog/cpi-mobile-game-guide/ | WS |
| K24  | Ödüllü ve geçiş reklamı eCPM                                  | https://blog.playio.co/rewarded-ad-benchmarks-2026 ; https://appodeal.com/the-mobile-ecpm-report-updated-q4-2024-view ; https://prado.co/post/rewarded-video-holds-the-crown-but-interstitial-ads-are-catching-up | WS |
| K25  | Hibrit monetizasyon, pazara göre IAP/reklam payı              | https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization ; https://appsamurai.com/blog/maximize-ltv-with-hybrid-monetization/                                 | WS     |
| K26  | Soft launch ülkeleri                                          | https://www.cgmagonline.com/articles/phone-gets-new-games/ ; https://www.pocketgamer.com/articles/075070/best-games-currently-in-soft-launch-for-iphone-ipad-or-android-mobile/      | WS     |
| K27  | Soft launch karar çerçeveleri                                 | https://gamegrowthadvisor.com/blog/2025-12-16-mobile-soft-launch-complete-guide/ ; https://www.liftoff.ai/?p=32321                                                                   | WS     |
| K28  | Android vitals kötü davranış eşikleri                         | https://developer.android.com/games/optimize/vitals                                                                                                                                 | WS     |
| K29  | Apple App Review Guidelines (1.3, 2.3.1, 2.3.7, 2.3.8, 3.1.1, 4.1, 5.1.4) | https://developer.apple.com/app-store/review/guidelines/                                                                                                                 | **WF** |
| K30  | Apple 2025 yaş derecelendirme sistemi                         | https://www.businesstoday.in/technology/news/story/apple-overhauls-app-store-age-ratings-adds-new-13-16-and-18-categories-486587-2025-07-28 ; https://www.mactech.com/2025/07/25/apple-updates-age-ratings-in-its-various-app-stores | WS |
| K31  | Google Play Aileler politikası, hedef kitle, karma kitle      | https://support.google.com/googleplay/android-developer/answer/9893335 ; https://www.phonearena.com/news/Google-ramps-up-efforts-to-make-the-Play-Store-a-safe-and-positive-place-for-kids-and-families_id116425 ; https://android-developers.googleblog.com/2019/05/building-safer-google-play-for-kids.html | WS |
| K32  | Google Play loot box oran açıklaması                          | https://www.fenwick.com/insights/publications/google-play-now-requires-disclosure-of-loot-box-odds                                                                                  | WS     |
| K33  | COPPA 16 CFR 312.2 "çocuğa yönelik" faktörleri                | https://cfr.vlex.com/vid/definitions-666118445 ; https://compliance.theartofservice.com/controls/coppa/coppa-312-2-dtc ; https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions | WS |
| K34  | COPPA 2025 değişikliği (yürürlük, uyum tarihi, yeni faktörler) | https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule ; https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect ; https://www.whitecase.com/insight-alert/unpacking-ftcs-coppa-amendments-what-you-need-know | WS |
| K35  | FTC – HoYoverse (Genshin Impact) uzlaşması, Ocak 2025         | https://ftc.gov/business-guidance/blog/2025/01/level-tips-businesses-ftcs-settlement-genshin-impact-developer-hoyoverse                                                              | WS     |
| K36  | GDPR Madde 8 ve ülke yaşları                                  | https://gdpr-text.com/read/ko/article-8 ; https://efilli.com/en/blog/collection-of-childrens-personal-data                                                                          | WS     |
| K37  | KVKK ve çocukların verisi; TMK m.16; Kurul 2022/776           | https://www.hukukihaber.net/gdpr-ve-kvkk-bakimindan-cocuklarin-kisisel-verilerinin-korunmasi-ve-konuya-iliskin-kurul-kararinin-degerlendirilmesi ; https://www.kvkk.gov.tr/Icerik/7572/2022-776 | WS |
| K38  | KVKK m.9 yurt dışı aktarım, standart sözleşme bildirimi       | https://www.kvkk.gov.tr/Icerik/8043/Standart-Sozlesme-Bildirim-Modulu-Hakkinda-Kamuoyu-Duyurusu ; https://www.alomaliye.com/2024/10/30/kvkk-standart-sozlesme-bildirim-modulu/          | WS     |
| K39  | 7578 sayılı Kanun (sosyal medya 15 yaş, oyun platformları)    | https://www.isinolsa.com/sosyal-medyaya-15-yas-siniri-oyun-platformlarina-yeni-kurallar-7578-sayili-kanun-resmi-gazetede/ ; https://www.ntv.com.tr/gundem/15-yas-altina-sosyal-medya-yasagi-yururluge-girdi-1722359 ; https://www.tgrthaber.com/teknoloji/sosyal-medya-ve-oyun-platformlarina-yonelik-duzenlemeler-kabul-edildi-agir-yaptirimla-3295936 | WS |
| K40  | AB CPC ağı: oyun içi sanal para ilkeleri (21 Mart 2025)       | https://connectontech.bakermckenzie.com/european-consumer-protection-network-issues-new-key-principles-on-in-game-virtual-currencies-impact-for-gaming-and-gambling-entities-in-belgium-the-eu-and-beyond/ ; https://www.reedsmith.com/articles/qas-on-the-eu-consumer-protection-authorities-joint-guidance-paper/ | WS |
| K41  | AB Digital Fairness Act durumu                                | https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act ; https://www.heuking.de/en/news-events/newsletter-articles/detail/digital-fairness-act-implementation-obligations-companies-need-to-prepare-for.html | WS |
| K42  | PEGI 2026 kriterleri (12 Mart 2026 duyuru, Haziran 2026 yürürlük) | https://www.gtlaw.com/en/insights/2026/3/pegi-updates-eu-video-game-age-rating-system ; https://www.nintendolife.com/news/2026/03/pegi-targets-loot-boxes-with-its-new-overhauled-ratings-system ; https://www.esports.net/news/loot-boxes-rated-16-rule | WS |
| K43  | PEGI "ücretli rastgele öğe" tanımı                            | https://pegi.info/bg/node/67 ; https://www.fieldfisher.com/en/services/technology-and-data/technology-law-blog/european-ratings-board-introduces-paid-random-item                    | WS     |
| K44  | Belçika ve Hollanda loot box kuralları                        | https://siege.gg/news/several-eu-countries-have-introduced-stricter-regulations-on-loot-boxes-in-games-in-2025 ; https://blog.promise.legal/loot-box-laws-game-developers/          | WS     |
| K45  | Brezilya ECA Digital (Kanun 15.211/2025)                      | https://www.demarest.com.br/en/eca-digital-nova-lei-de-protecao-de-criancas-e-adolescentes-no-ambiente-digital/ ; https://www.mattosfilho.com.br/en/unico/brazils-eca-digital/       | WS     |
| K46  | Skillz – AviaGames (botlar, $42,9 milyon karar, $80 milyon uzlaşma) | https://www.casino.org/news/skillz-awarded-43m-from-aviagames-juror-speaks/ ; https://news.bloomberglaw.com/ip-law/skillz-platform-ceo-details-patent-settlement-with-aviagames | WS |
| K47  | Phaser/Capacitor WebView performans raporları                 | https://phaser.discourse.group/t/phaser-3-capacitor-android-apk-white-screens-texture-rendering-failures-and-orientation-issues/15571 ; https://www.html5gamedevs.com/topic/29537-poor-performance-and-common-lags-on-mobile-browsers/ | WS |
| K48  | Bob the Builder markaları ve karakterleri                     | https://trademarks.justia.com/owners/hit-entertainment-limited-4038879 ; https://www.businesspost.ie/legacy/barbie-gets-together-with-bob-the-builder-111658 ; https://www.tpt.org/bob-the-builder | WS |
| K49  | Mağaza komisyonları (%15 ilk $1 milyon)                       | https://splitmetrics.com/blog/google-play-apple-app-store-fees/ ; https://docs.glassfy.io/docs/reduced-platform-commission-for-new-and-small-publishers                              | WS     |
| K50  | Türkiye 2026 maaşları (oyun geliştirici, tasarımcı, görsel)   | https://www.yenibiris.com/maaslar/oyun-gelistirici-maaslari ; https://www.eleman.net/meslek/oyun-gelistirici/maas ; https://www.eleman.net/meslek/animasyon-ve-gorsel-tasarim-uzmani/maas | WS |
| K51  | USD/TRY (TCMB, 9 Eylül 2026)                                  | https://www.ekonomist.com.tr/doviz/merkez-bankasi                                                                                                                                   | WS     |
| K52  | App Store Türkiye TL fiyatları ve düşük kademeler             | https://www.teknoblog.com/app-store-turkiye-subesinde-fiyatlar-turk-lirasi-cinsinden-gosterilmeye-basladi/ ; https://blog.gsmarena.com/apple-raising-app-store-prices-countries-introducing-new-low-cost-tiers | WS |
| K53  | EUIPO ve USPTO başvuru ücretleri                              | https://www.tramatm.com/trademark-questions-and-answers/cost-of-trademark-registration/what-is-the-price-for-1-trademark-class-in-the-eu ; https://ip-coster.com/News/global_intellectual_property_fee_updates/471 | WS |
| K54  | Türk oyun ekosistemi 2025, Dream Games yatırımı               | https://mobidictum.com/appmagic-turkiye-mobile-gaming-landscape-2026/ ; https://respawn.outlookindia.com/gaming/gaming-news/how-turkish-mobile-gaming-exploded-into-a-27b-global-powerhouse | WS |
