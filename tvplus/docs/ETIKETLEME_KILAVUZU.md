# TV+ etiketleme kılavuzu

> Bu dosya `npm run tagging:guide` ile `content/tagging/vocabulary.json` sözlüğünden **üretilir**; elle düzenlemeyin.
> Sözlük sürümü: **2026.11-1**. Sözlük değişince kılavuz yeniden üretilir ve fişler bu sürümle doldurulur.

## 1. Etiketleme ne işe yarar

Her yapım için bir **etiket fişi** doldurursunuz: ölçeklerde 0–5 arası bir seviye, yüzlerde listeden değerler. Fişler birleşerek yapımın
"geçerli etiketlerini" oluşturur. Bunlardan iki şey çıkar:

- **Mikro türler:** "Uzay Keşfi Hakkında Düşündürücü Belgeseller" gibi dar kategoriler. Geniş olanlar ana sayfada satır olur; dar olanlar
  görünmez ama "Buna benzer" ve "Çünkü … izledin" önerilerini besler.
- **İçerik uyarısı denetimi:** fişinizdeki şiddet, cinsellik vb. seviyeler yapımın RTÜK işaretiyle karşılaştırılır.

Bu yüzden her seviye, yorumla değil **yazılı ölçüte** göre seçilir. İki etiketleyici aynı yapımı izlediğinde aynı fişi doldurabilmelidir.

## 2. Nasıl etiketlenir

1. **Yapımın tamamını izleyin.** Filmde baştan sona; dizide ilk sezonun bütün bölümlerini. Fragman, özet ya da başkasının yorumuyla fiş gönderilmez.
   İzlemeyi bitirmeden kaydettiğiniz fiş **taslak** kalır; gönderilen fişte "yapımın tamamı izlendi" (`watched: true`) işaretli olmalıdır.
2. **Her ölçekte soruyu okuyun, sonra seviyeleri 0'dan yukarı doğru okuyun.** Gördüğünüz ya da duyduğunuz şeyi en iyi anlatan seviyeyi seçin.
3. **İki seviye arasında kalırsanız düşük olanı seçin.** Seviyeyi yükseltmek için ölçütteki şeyin gerçekten ekranda olması gerekir.
4. **İçerik uyarılarında en yoğun anı, ton ve anlatıda yapımın genelini esas alın** (bkz. ölçek grupları). Örnek: filmde
   yalnız bir sahnede yakın çekimde kanlı bir yara görünüyorsa "Kan ve yara" 3 olur; aynı film baştan sona neşeliyse "Karanlık ton" yine 0–1 kalır.
5. **Emin değilseniz boş bırakın.** Boş, "değerlendirilmedi" demektir ve uzlaşıda sayılmaz; boş bırakmak tahmin etmekten iyidir.
6. **Yüzlerde yalnız yapımı gerçekten tanımlayan değerleri seçin.** Her yüzün yanında en çok kaç değer seçilebileceği yazılıdır.
   Hikâyede bir an görünen bir şey (ör. tek sahnelik hastane) mekân sayılmaz.
7. **Her etiketleyici kendi fişini doldurur.** Başkasının fişine bakmadan doldurun; farklı görüşler uzlaşıda birleşir.
   Kimliğiniz bir takma addır (ör. `etiket-01`); gerçek adınızı ya da e-postanızı kullanmayın.
8. **Not yazın.** Kararsız kaldığınız seviyeleri, seviyeyi belirleyen sahneyi (yaklaşık dakikasıyla) ve listede karşılığını bulamadığınız
   özellikleri nota yazın. Not en çok 2000 karakterdir.

### Fişin yolculuğu

| Durum                    | Anlamı                                          | Kim              |
| ------------------------ | ----------------------------------------------- | ---------------- |
| Taslak (`DRAFT`)         | Kaydedildi, henüz gönderilmedi; uzlaşıya girmez | etiketleyici     |
| Gönderildi (`SUBMITTED`) | İzleme bitti, onay bekliyor                     | etiketleyici     |
| Onaylandı (`APPROVED`)   | Uzlaşıya girer                                  | içerik sorumlusu |

Onaylı fişlerin uzlaşısı: her ölçekte fişlerin **ortancası** (çift sayıda fişte ortadaki iki değerin ortalaması aşağı yuvarlanır), her yüzde
**fişlerin yarıdan fazlasında** seçilmiş değerler. Fişlerin birbirine ne kadar yakın olduğu 0–1 arası bir **uyum puanı** olarak gösterilir;
düşük uyum, ölçütün farklı okunduğunu gösterir ve fişler yeniden gözden geçirilir.

Onaylı insan fişi olmayan yapımlarda önce depodaki **örnek fiş** (izlenmeden, özetten doldurulmuş), o da yoksa künyeden kurulan **otomatik
öneri** kullanılır. İkisi de yalnız başlangıç noktasıdır; sizin fişiniz onaylanınca onların yerini alır.

### RTÜK uyarıları

Uyarı ölçeklerinde seçtiğiniz seviye, yapımın taşıdığı işaretten daha yükseğini (ör. başlık 7+ iken 13+) ya da başlıkta yazılı olmayan bir
gerekçeyi gerektiriyorsa stüdyo ekranında uyarı çıkar. **İşareti kendiniz değiştirmeyin;** seviyeyi ölçüte göre doğru seçtiyseniz notta
sahneyi belirtin, içerik sorumlusu işareti gözden geçirir.

İşaretler: `GENEL` (Genel İzleyici) · `7+` · `13+` · `18+`. Gerekçeler: Şiddet ve Korku · Cinsellik · Olumsuz Örnek Oluşturabilecek Davranışlar.

## 3. Ölçekler (0–5)

### İçerik uyarıları

Bu ölçeklerde yapımdaki **en yoğun anı** esas alın: tek bir sahne bile seviyeyi belirler. Her seviyenin yanında, o seviyenin gerektirdiği en düşük RTÜK işareti yazılıdır.

#### 3.1. Cinsellik (`cinsellik`)

**Soru:** Ekranda cinsellik ne ölçüde gösteriliyor ya da konuşuluyor?

RTÜK gerekçesi: **Cinsellik**

| Seviye | Ad       | Ölçüt                                                                                                 | En düşük işaret |
| :----: | -------- | ----------------------------------------------------------------------------------------------------- | :-------------: |
|   0    | Yok      | Cinsel içerikli hiçbir görüntü, söz ya da ima yok.                                                    |      GENEL      |
|   1    | İma      | Yalnızca sarılma, yanaktan öpme ya da flört var; cinselliğe sözle ima ediliyor ama gösterilmiyor.     |      GENEL      |
|   2    | Hafif    | Dudaktan öpüşme ya da sevişmenin öncesi ve sonrası (aynı yatakta uyanma) gösteriliyor; çıplaklık yok. |       7+        |
|   3    | Belirgin | Sevişme sahnesi var ama beden örtülü (çarşaf, karanlık, kurgu); cinsellik açıkça konuşuluyor.         |       13+       |
|   4    | Yoğun    | Sevişme sahneleri uzun ya da tekrarlı; kısa süreli ya da arkadan çıplaklık görünüyor.                 |       18+       |
|   5    | Açık     | Cinsel ilişki açık çıplaklıkla ve ayrıntılı gösteriliyor; cinsellik yapımın belirleyici unsuru.       |       18+       |

Mikro tür adına giren sıfat: 4–5 → **Erotik**

#### 3.2. Şiddet (`siddet`)

**Soru:** Ekranda fiziksel şiddet ne ölçüde ve nasıl gösteriliyor?

RTÜK gerekçesi: **Şiddet ve Korku**

| Seviye | Ad       | Ölçüt                                                                                                 | En düşük işaret |
| :----: | -------- | ----------------------------------------------------------------------------------------------------- | :-------------: |
|   0    | Yok      | Kavga, vurma ya da silah kullanımı yok.                                                               |      GENEL      |
|   1    | Şakacı   | Çizgi film tarzı, sonuçsuz şiddet var: düşme, tokat, kovalamaca; kimse gerçekten yaralanmıyor.        |      GENEL      |
|   2    | Hafif    | İtişme, yumruklaşma ya da silahlı çatışma var ama darbe ve yara gösterilmiyor; kurgu kesiyor.         |       7+        |
|   3    | Belirgin | Dövüş ve çatışma açıkça gösteriliyor; yaralanma ve ölüm görünüyor ama ayrıntıya girilmiyor.           |       13+       |
|   4    | Sert     | Şiddet uzun, gerçekçi ve tekrarlı; işkence, infaz ya da yakın mesafeden öldürme sahneleri var.        |       18+       |
|   5    | Aşırı    | Şiddet ayrıntılı ve ağır biçimde gösteriliyor; yapımın merkezinde ve kendi başına bir gösteri unsuru. |       18+       |

Mikro tür adına giren sıfat: 4–5 → **Sert**

#### 3.3. Kan ve yara (`kan`)

**Soru:** Kan, yara ve bedene verilen zarar ne kadar görünür?

RTÜK gerekçesi: **Şiddet ve Korku**

| Seviye | Ad       | Ölçüt                                                                                 | En düşük işaret |
| :----: | -------- | ------------------------------------------------------------------------------------- | :-------------: |
|   0    | Yok      | Kan ya da yara görünmüyor.                                                            |      GENEL      |
|   1    | Az       | Küçük bir kesik ya da burun kanaması gibi az miktarda kan bir an görünüyor.           |       7+        |
|   2    | Hafif    | Yara ve kan görünüyor ama yakın çekim yok; kanlı görüntüler birkaç saniyeyi geçmiyor. |       7+        |
|   3    | Belirgin | Kanlı yaralar ya da cesetler açıkça görünüyor; birkaç sahnede yakın çekim var.        |       13+       |
|   4    | Yoğun    | Açık yara, parçalanma, ameliyat ya da otopsi görüntüleri ayrıntılı gösteriliyor.      |       18+       |
|   5    | Aşırı    | Kan ve vahşet yapımın gösteri unsuru; bu görüntüler uzun, ayrıntılı ve tekrarlı.      |       18+       |

Mikro tür adına giren sıfat: 4–5 → **Kanlı**

#### 3.4. Korku (`korku`)

**Soru:** Yapım izleyiciyi ne kadar korkutmaya ya da ürkütmeye çalışıyor?

RTÜK gerekçesi: **Şiddet ve Korku**

| Seviye | Ad        | Ölçüt                                                                                            | En düşük işaret |
| :----: | --------- | ------------------------------------------------------------------------------------------------ | :-------------: |
|   0    | Yok       | Korkutucu görüntü, ses ya da durum yok.                                                          |      GENEL      |
|   1    | Hafif     | Kısa süreli tedirginlik var (karanlık oda, ani bir ses); hemen güvenli bir ortama dönülüyor.     |      GENEL      |
|   2    | Ürpertici | Ürkütücü bir yaratık ya da tehdit var; birkaç ani korkutma var ama uzun sürmüyor.                |       7+        |
|   3    | Belirgin  | Birden çok uzun korku sahnesi var; tehdit gerçek ve karakterler ölüm tehlikesiyle karşı karşıya. |       13+       |
|   4    | Yoğun     | Yapımın büyük bölümü korku üzerine kurulu; rahatsız edici görüntüler ve ani korkutmalar sık.     |       13+       |
|   5    | Aşırı     | Kesintisiz dehşet; ruhsal ya da bedensel olarak sarsıcı, uzun süre akılda kalan sahneler var.    |       18+       |

Mikro tür adına giren sıfat: 4–5 → **Ürkütücü**

#### 3.5. Argo ve küfür (`argo`)

**Soru:** Konuşmalarda argo, küfür ve aşağılayıcı dil ne ölçüde var?

RTÜK gerekçesi: **Olumsuz Örnek Oluşturabilecek Davranışlar**

| Seviye | Ad       | Ölçüt                                                                                         | En düşük işaret |
| :----: | -------- | --------------------------------------------------------------------------------------------- | :-------------: |
|   0    | Yok      | Argo ya da kaba söz yok.                                                                      |      GENEL      |
|   1    | Hafif    | "Aptal", "salak" gibi hafif hakaretler ya da kaba ünlemler birkaç kez geçiyor.                |       7+        |
|   2    | Belirgin | Argo konuşmanın doğal parçası; ağır küfür yok ya da sesle örtülüyor.                          |       13+       |
|   3    | Sık      | Ağır küfürler birkaç sahnede açıkça söyleniyor.                                               |       13+       |
|   4    | Yoğun    | Ağır küfür ve cinsel içerikli argo sahnelerin çoğunda geçiyor.                                |       18+       |
|   5    | Aşırı    | Küfür ve aşağılayıcı dil (ırkçı ya da cinsiyetçi hakaretler dahil) yapımın dilini belirliyor. |       18+       |

#### 3.6. Madde kullanımı (`madde-kullanimi`)

**Soru:** Sigara, alkol ve uyuşturucu kullanımı ne ölçüde ve nasıl gösteriliyor?

RTÜK gerekçesi: **Olumsuz Örnek Oluşturabilecek Davranışlar**

| Seviye | Ad          | Ölçüt                                                                                        | En düşük işaret |
| :----: | ----------- | -------------------------------------------------------------------------------------------- | :-------------: |
|   0    | Yok         | Sigara, alkol ya da uyuşturucu görünmüyor ve konuşulmuyor.                                   |      GENEL      |
|   1    | Arka planda | Arka planda sigara içen ya da kadeh tutan yetişkinler var; olay örgüsünde yer tutmuyor.      |      GENEL      |
|   2    | Hafif       | Karakterler sigara ve alkol kullanıyor; sarhoşluk kısa ve olumsuz sonuçlarıyla gösteriliyor. |       13+       |
|   3    | Belirgin    | Alkol ya da uyuşturucu olay örgüsünün parçası; kullanım sahneleri açıkça gösteriliyor.       |       13+       |
|   4    | Yoğun       | Uyuşturucu kullanımı ayrıntılı (hazırlama, iğne) ya da özendirici biçimde gösteriliyor.      |       18+       |
|   5    | Merkezde    | Bağımlılık ve madde kullanımı yapımın ana konusu; kullanım sahneleri sık ve ayrıntılı.       |       18+       |

### Ton

Bu ölçeklerde yapımın **genelini** esas alın: tek bir sahne değil, izleyicide kalan genel duygu.

#### 3.7. Romantizm (`romantizm`)

**Soru:** Aşk ve romantik ilişki hikâyede ne kadar yer tutuyor?

| Seviye | Ad         | Ölçüt                                                                                 |
| :----: | ---------- | ------------------------------------------------------------------------------------- |
|   0    | Yok        | Romantik bir ilişki yok.                                                              |
|   1    | Yan öğe    | Bir karakterin sevgilisi ya da eşi var; ilişki hikâyenin gidişini etkilemiyor.        |
|   2    | Yan hikâye | Romantik bir yan hikâye var; birkaç sahne yalnızca ona ayrılmış.                      |
|   3    | Önemli     | Aşk ilişkisi ana hikâyenin önemli bir ipliği; karakterlerin kararlarını değiştiriyor. |
|   4    | Ana eksen  | Hikâye büyük ölçüde bir aşk ilişkisinin kurulması ya da bozulması üzerine.            |
|   5    | Tamamen    | Yapımın tamamı bir aşk hikâyesi; neredeyse her sahne ilişkiye hizmet ediyor.          |

Mikro tür adına giren sıfat: 4–5 → **Romantik**

#### 3.8. Mizah (`mizah`)

**Soru:** Yapım izleyiciyi ne ölçüde güldürmeyi amaçlıyor?

| Seviye | Ad         | Ölçüt                                                                            |
| :----: | ---------- | -------------------------------------------------------------------------------- |
|   0    | Yok        | Güldürme amacı yok; ciddi ton baştan sona korunuyor.                             |
|   1    | Ara sıra   | Ortamı yumuşatan birkaç espri ya da komik an var.                                |
|   2    | Hafif      | Esprili diyaloglar ve komik durumlar düzenli aralıklarla geliyor; ana ton ciddi. |
|   3    | Dengeli    | Mizah ve ciddiyet aşağı yukarı eşit; komik sahneler hikâyeyi ilerletiyor.        |
|   4    | Komik      | Sahnelerin çoğu güldürmek üzere kurulmuş; ciddi anlar kısa.                      |
|   5    | Saf komedi | Neredeyse her sahne bir şaka, gag ya da komik durum üzerine kurulu.              |

Mikro tür adına giren sıfat: 2–3 → **Esprili** · 4–5 → **Komik**

#### 3.9. Gerilim (`gerilim`)

**Soru:** Yapım izleyiciyi ne kadar gergin ve merakta tutuyor?

| Seviye | Ad          | Ölçüt                                                                                     |
| :----: | ----------- | ----------------------------------------------------------------------------------------- |
|   0    | Yok         | Tehlike ya da merak unsuru yok; olaylar sakin akıyor.                                     |
|   1    | Hafif       | Küçük bir merak ya da engel var; sonucun kötü olacağından kimse endişe etmiyor.           |
|   2    | Orta        | Karakterler bir tehlikeyle ya da zaman baskısıyla karşılaşıyor; birkaç gergin sahne var.  |
|   3    | Belirgin    | Hikâye bir tehdit ya da sır etrafında ilerliyor; gergin sahneler art arda geliyor.        |
|   4    | Yüksek      | Gerilim baştan sona sürüyor; beklenmedik gelişmeler ve kovalamacalar sık.                 |
|   5    | Nefes kesen | Gerilim hiç düşmüyor; neredeyse her sahnede bir tehlike, kaçış ya da çözülmemiş soru var. |

Mikro tür adına giren sıfat: 4–5 → **Gerilimli**

#### 3.10. Duygusallık (`duygusallik`)

**Soru:** Yapım izleyiciyi ne ölçüde duygulandırıyor (hüzün, dokunaklılık, sıcaklık)?

| Seviye | Ad        | Ölçüt                                                                                                      |
| :----: | --------- | ---------------------------------------------------------------------------------------------------------- |
|   0    | Yok       | Duygusal bir an yok; anlatım mesafeli ya da yalnızca bilgilendirici.                                       |
|   1    | Hafif     | Bir iki dokunaklı an var; üzerinde durulmuyor.                                                             |
|   2    | Orta      | Kayıp, ayrılık ya da kavuşma sahneleri var; müzik ve oyunculuk bunları vurguluyor.                         |
|   3    | Belirgin  | Hikâyenin dönüm noktaları duygusal; karakterlerin ağladığı ya da derinden sarsıldığı birden çok sahne var. |
|   4    | Yoğun     | Yapım izleyiciyi duygulandırmak üzere kurulmuş; hüzünlü ya da dokunaklı sahneler baskın.                   |
|   5    | Çok yoğun | Baştan sona duygu yüklü; ölüm, ağır hastalık ya da büyük bir kayıp hikâyenin merkezinde.                   |

Mikro tür adına giren sıfat: 4–5 → **Duygusal**

#### 3.11. Karanlık ton (`karanlik-ton`)

**Soru:** Yapımın genel havası ne kadar karanlık, umutsuz ya da rahatsız edici?

| Seviye | Ad           | Ölçüt                                                                         |
| :----: | ------------ | ----------------------------------------------------------------------------- |
|   0    | Aydınlık     | Hava neşeli ve umutlu; kötü bir şey olursa kalıcı olmuyor.                    |
|   1    | Hafif gölge  | Üzücü ya da kötü olaylar var ama ton iyimser kalıyor.                         |
|   2    | Karışık      | Ciddi sorunlar ve kayıplar işleniyor; umut ile umutsuzluk dengede.            |
|   3    | Kasvetli     | Ölüm, suç ya da yıkım belirgin; mutlu anlar az ve kısa.                       |
|   4    | Karanlık     | Atmosfer baştan sona kasvetli; rahatsız edici seçimler ve kötü sonlar baskın. |
|   5    | Çok karanlık | Umutsuz, acımasız bir dünya; yapım izleyiciyi bilerek rahatsız ediyor.        |

Mikro tür adına giren sıfat: 4–5 → **Karanlık**

### Anlatı

Bu ölçekler hikâyenin nasıl anlatıldığını ölçer. Hikâyesi olmayan yapımlarda (söyleşi, konser, haber) "Sonun netliği"ni boş bırakın.

#### 3.12. Tempo (`tempo`)

**Soru:** Olaylar ve sahneler ne hızla ilerliyor?

| Seviye | Ad        | Ölçüt                                                                                 |
| :----: | --------- | ------------------------------------------------------------------------------------- |
|   0    | Durgun    | Uzun, sabit çekimler; olay neredeyse yok, gözlem ve atmosfer öne çıkıyor.             |
|   1    | Ağır      | Sahneler uzun, konuşmalar yavaş; bir olaydan ötekine geçmek zaman alıyor.             |
|   2    | Ölçülü    | Sakin ama düzenli ilerliyor; her sahnede küçük bir gelişme var.                       |
|   3    | Akıcı     | Olaylar düzenli aralıklarla gelişiyor; ağır ve hızlı bölümler dengeli.                |
|   4    | Hızlı     | Kısa sahneler ve hızlı kurgu var; olaylar sık sık yön değiştiriyor.                   |
|   5    | Çok hızlı | Neredeyse durmadan aksiyon ya da olay var; soluklanılacak sahne yok denecek kadar az. |

Mikro tür adına giren sıfat: 0–1 → **Ağır Tempolu** · 4–5 → **Hızlı Tempolu**

#### 3.13. Karmaşıklık (`karmasiklik`)

**Soru:** Hikâyeyi ya da anlatılan konuyu izlemek ne kadar dikkat ve düşünce istiyor?

| Seviye | Ad           | Ölçüt                                                                                                   |
| :----: | ------------ | ------------------------------------------------------------------------------------------------------- |
|   0    | Çok kolay    | Tek bir olay çizgisi var; her şey açıkça söyleniyor ya da gösteriliyor.                                 |
|   1    | Kolay        | Az sayıda karakter ve tek ana olay var; yan hikâye yok ya da çok kısa.                                  |
|   2    | Orta         | Birkaç karakter ve yan hikâye var; izleyici birkaç bağlantıyı kendisi kuruyor.                          |
|   3    | Katmanlı     | Birden çok hikâye çizgisi, zamanda sıçramalar ya da yoğun bilgi var; dikkatle izlemek gerekiyor.        |
|   4    | Düşündürücü  | Fikirler, simgeler ya da bilimsel kavramlar anlatının merkezinde; izleyiciyi sorgulamaya çağırıyor.     |
|   5    | Çok karmaşık | Doğrusal olmayan anlatım ya da yoğun kavramsal içerik var; anlamak için ikinci kez izlemek gerekebilir. |

Mikro tür adına giren sıfat: 0–1 → **Kolay İzlenen** · 4–5 → **Düşündürücü**

#### 3.14. Sonun netliği (`son-netligi`)

**Soru:** Hikâye ne kadar kesin ve kapanmış biçimde bitiyor?

| Seviye | Ad               | Ölçüt                                                                                |
| :----: | ---------------- | ------------------------------------------------------------------------------------ |
|   0    | Açık uçlu        | Ana soru cevapsız kalıyor; ne olduğu tamamen izleyicinin yorumuna bırakılmış.        |
|   1    | Belirsiz         | Bir son var ama önemli sorular cevapsız; birden çok yorum mümkün.                    |
|   2    | Yarı açık        | Ana olay çözülüyor; karakterlerin geleceği ya da bazı yan hikâyeler açık kalıyor.    |
|   3    | Büyük ölçüde net | Ana sorular cevaplanıyor; yalnızca küçük ayrıntılar açık kalıyor.                    |
|   4    | Net              | Ana ve yan hikâyelerin hepsi kapanıyor; karakterlerin sonu belli.                    |
|   5    | Kesin            | Her şey açıkça bağlanıyor; çoğu zaman sonrasını gösteren bir kapanış sahnesi de var. |

Mikro tür adına giren sıfat: 0–1 → **Ucu Açık**

### Biçim

Bu ölçekler görüntüyü ve yapımın bilgi verme amacını ölçer.

#### 3.15. Görsellik (`gorsellik`)

**Soru:** Görüntü, tasarım ve görsel efektler yapımda ne kadar öne çıkıyor?

| Seviye | Ad         | Ölçüt                                                                                               |
| :----: | ---------- | --------------------------------------------------------------------------------------------------- |
|   0    | İşlevsel   | Görüntü yalnızca bilgi aktarıyor (ör. sabit kamera karşısında konuşma).                             |
|   1    | Sade       | Temiz ama sıradan görüntü; hiçbir görsel tercih dikkat çekmiyor.                                    |
|   2    | Özenli     | Işık, renk ve çerçeve özenli; birkaç sahne görsel olarak dikkat çekiyor.                            |
|   3    | Güçlü      | Belirgin bir görsel üslup var (renk düzeni, kamera hareketi, tasarım); birçok sahne akılda kalıyor. |
|   4    | Çarpıcı    | Görsel tasarım yapımın en güçlü yanı; manzara, efekt ya da animasyon dikkat çekici.                 |
|   5    | Olağanüstü | Yapım büyük ölçüde görsel bir deneyim; görüntü hikâyenin önüne geçiyor.                             |

Mikro tür adına giren sıfat: 4–5 → **Görsel Açıdan Çarpıcı**

#### 3.16. Öğreticilik (`ogreticilik`)

**Soru:** İzleyici yapımdan ne kadar yeni bilgi ya da beceri ediniyor?

| Seviye | Ad               | Ölçüt                                                                                       |
| :----: | ---------------- | ------------------------------------------------------------------------------------------- |
|   0    | Yok              | Bilgi aktarma amacı yok; yapım yalnızca eğlendiriyor ya da hikâye anlatıyor.                |
|   1    | Az               | Arka planda tarihsel ya da kültürel bilgi geçiyor; üzerinde durulmuyor.                     |
|   2    | Orta             | Hikâye ya da program birkaç olguyu açıkça anlatıyor.                                        |
|   3    | Belirgin         | Yapımın önemli bir bölümü bilgi aktarmaya ayrılmış; uzman görüşü, belge ya da açıklama var. |
|   4    | Öğretici         | Yapımın asıl amacı bir konuyu öğretmek; kavramlar adım adım açıklanıyor.                    |
|   5    | Ders niteliğinde | Bir ders gibi kurulmuş; izleyici sonunda belirli bir konuyu ya da beceriyi öğrenmiş oluyor. |

Mikro tür adına giren sıfat: 4–5 → **Öğretici**

## 4. Yüzler (listeden seçilen etiketler)

"Addaki ifade" sütunu, değerin mikro tür adında nasıl görüneceğidir. İfadesi olmayan değerler fişte kullanılır ama ada girmez.
"Ek sıfatlar" yüzü, ölçeklerin anlatamadığı nitelikler içindir: "Romantik", "Komik", "Karanlık" gibi sıfatlar ölçeklerden kendiliğinden
çıkar; bunları ek sıfat olarak ayrıca seçmeyin.

### 4.1. Kaynak (`kaynak`)

**Soru:** Hikâye nereden geliyor? (Belgesel ve programlarda yalnız uyarlama varsa seçin.)

En çok **2** değer · mikro tür adında **uyarlama kaynağı** olarak kullanılır.

| Değer                     | Anahtar          | Ne zaman seçilir                                                                  | Addaki ifade                      |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| Özgün hikâye              | `ozgun`          | Başka bir esere ya da gerçek bir olaya dayanmıyor.                                | —                                 |
| Gerçek olay               | `gercek-olay`    | Kurgu yapım, yaşanmış bir olayı canlandırıyor (belgeselde seçilmez).              | "Gerçek Olaylardan Uyarlanan"     |
| Gerçek bir kişinin hayatı | `biyografi`      | Kurgu yapım, yaşamış bir kişinin hayatını ya da hayatının bir dönemini anlatıyor. | "Biyografik"                      |
| Roman ya da öykü          | `kitap`          | Yayımlanmış bir roman ya da öyküden uyarlanmış.                                   | "Kitaptan Uyarlanan"              |
| Masal, mit ya da efsane   | `masal-efsane`   | Halk masalı, mitoloji ya da efsaneden uyarlanmış.                                 | "Masal ve Efsanelerden Uyarlanan" |
| Çizgi roman ya da manga   | `cizgi-roman`    | —                                                                                 | "Çizgi Romandan Uyarlanan"        |
| Tiyatro oyunu             | `tiyatro`        | —                                                                                 | "Tiyatro Oyunundan Uyarlanan"     |
| Video oyunu               | `video-oyunu`    | —                                                                                 | "Video Oyunundan Uyarlanan"       |
| Yeniden çevrim            | `yeniden-cevrim` | Daha önce çekilmiş bir film ya da dizinin yeni çekimi.                            | "Yeniden Çevrim"                  |
| Devam ya da yan hikâye    | `devam`          | Daha önceki bir yapımın devamı ya da aynı evrende geçen yan hikâyesi.             | —                                 |

### 4.2. Mekân (`mekan`)

**Soru:** Hikâye ya da program çoğunlukla nerede geçiyor?

En çok **2** değer · mikro tür adında **mekân** olarak kullanılır.

| Değer                 | Anahtar         | Ne zaman seçilir                                 | Addaki ifade               |
| --------------------- | --------------- | ------------------------------------------------ | -------------------------- |
| Büyükşehir            | `buyuksehir`    | —                                                | "Büyükşehirde Geçen"       |
| Küçük kasaba          | `kasaba`        | —                                                | "Küçük Kasabada Geçen"     |
| Köy ve kırsal         | `kirsal`        | —                                                | "Kırsalda Geçen"           |
| Deniz ve gemi         | `deniz`         | —                                                | "Denizde Geçen"            |
| Vahşi doğa            | `vahsi-doga`    | Orman, dağ, çöl, kutup gibi yerleşim dışı doğa.  | "Vahşi Doğada Geçen"       |
| Uzay                  | `uzay`          | Uzay aracı, başka gezegen, yörünge.              | "Uzayda Geçen"             |
| Hayalî dünya          | `hayali-dunya`  | Gerçekte olmayan, yapım için kurulmuş bir dünya. | "Hayalî Bir Dünyada Geçen" |
| Okul ya da üniversite | `okul`          | —                                                | "Okulda Geçen"             |
| Hastane               | `hastane`       | —                                                | "Hastanede Geçen"          |
| İş yeri               | `is-yeri`       | —                                                | "İş Yerinde Geçen"         |
| Ev içi                | `ev`            | Hikâye büyük ölçüde bir evin içinde geçiyor.     | "Bir Evde Geçen"           |
| Cezaevi               | `cezaevi`       | —                                                | "Cezaevinde Geçen"         |
| Cephe                 | `cephe`         | —                                                | "Cephede Geçen"            |
| Tren ve demiryolu     | `tren`          | —                                                | "Trende Geçen"             |
| İstanbul              | `istanbul`      | —                                                | "İstanbul'da Geçen"        |
| Anadolu               | `anadolu`       | —                                                | "Anadolu'da Geçen"         |
| Karadeniz             | `karadeniz`     | —                                                | "Karadeniz'de Geçen"       |
| Avrupa                | `avrupa`        | —                                                | "Avrupa'da Geçen"          |
| Amerika               | `amerika`       | —                                                | "Amerika'da Geçen"         |
| Asya                  | `asya`          | —                                                | "Asya'da Geçen"            |
| Afrika                | `afrika`        | —                                                | "Afrika'da Geçen"          |
| Orta Doğu             | `orta-dogu`     | —                                                | "Orta Doğu'da Geçen"       |
| Latin Amerika         | `latin-amerika` | —                                                | "Latin Amerika'da Geçen"   |

### 4.3. Hikâyenin dönemi (`donem`)

**Soru:** Hikâye hangi zamanda geçiyor? (Yapım yılını değil, olayların zamanını seçin.)

En çok **2** değer · mikro tür adında **hikâyenin dönemi** olarak kullanılır.

| Değer                        | Anahtar            | Ne zaman seçilir                                 | Addaki ifade                       |
| ---------------------------- | ------------------ | ------------------------------------------------ | ---------------------------------- |
| Tarih öncesi                 | `tarih-oncesi`     | —                                                | "Tarih Öncesinde Geçen"            |
| Antik çağ                    | `antik-cag`        | —                                                | "Antik Çağda Geçen"                |
| Orta Çağ                     | `orta-cag`         | —                                                | "Orta Çağda Geçen"                 |
| Osmanlı dönemi               | `osmanli`          | —                                                | "Osmanlı Döneminde Geçen"          |
| 19. yüzyıl                   | `19-yuzyil`        | —                                                | "19. Yüzyılda Geçen"               |
| Birinci Dünya Savaşı         | `1-dunya-savasi`   | —                                                | "Birinci Dünya Savaşı'nda Geçen"   |
| Kurtuluş Savaşı              | `kurtulus-savasi`  | —                                                | "Kurtuluş Savaşı'nda Geçen"        |
| Erken Cumhuriyet (1923–1950) | `erken-cumhuriyet` | —                                                | "Erken Cumhuriyet Döneminde Geçen" |
| İkinci Dünya Savaşı          | `2-dunya-savasi`   | —                                                | "İkinci Dünya Savaşı'nda Geçen"    |
| 1950'ler ve 60'lar           | `1950-60lar`       | —                                                | "1950'ler ve 60'larda Geçen"       |
| 1970'ler ve 80'ler           | `1970-80ler`       | —                                                | "1970'ler ve 80'lerde Geçen"       |
| 1990'lar                     | `1990lar`          | —                                                | "1990'larda Geçen"                 |
| Günümüz                      | `gunumuz`          | Yapımın çekildiği yıllar.                        | —                                  |
| Yakın gelecek                | `yakin-gelecek`    | —                                                | "Yakın Gelecekte Geçen"            |
| Uzak gelecek                 | `uzak-gelecek`     | —                                                | "Uzak Gelecekte Geçen"             |
| Belirsiz ya da zamansız      | `zamansiz`         | Masal dünyası ya da zamanı belli olmayan hikâye. | —                                  |

### 4.4. Konu (`konu`)

**Soru:** Yapım asıl olarak neyi anlatıyor ya da neyi konu alıyor?

En çok **3** değer · mikro tür adında **konu** olarak kullanılır.

| Değer                          | Anahtar            | Ne zaman seçilir | Addaki ifade                      |
| ------------------------------ | ------------------ | ---------------- | --------------------------------- |
| Aile ilişkileri                | `aile`             | —                | "Aile Hakkında"                   |
| Evlilik ve ayrılık             | `evlilik`          | —                | "Evlilik ve Ayrılık Hakkında"     |
| Arkadaşlık                     | `arkadaslik`       | —                | "Arkadaşlık Hakkında"             |
| Büyümek ve ergenlik            | `buyumek`          | —                | "Büyümek Hakkında"                |
| Yaşlılık                       | `yaslilik`         | —                | "Yaşlılık Hakkında"               |
| Sağlık ve hastalık             | `saglik`           | —                | "Sağlık ve Hastalık Hakkında"     |
| Ruh sağlığı                    | `ruh-sagligi`      | —                | "Ruh Sağlığı Hakkında"            |
| İş hayatı ve kariyer           | `is-hayati`        | —                | "İş Hayatı Hakkında"              |
| Para ve ekonomi                | `para-ekonomi`     | —                | "Para ve Ekonomi Hakkında"        |
| Göç ve gurbet                  | `goc`              | —                | "Göç ve Gurbet Hakkında"          |
| Suç ve adalet                  | `suc-adalet`       | —                | "Suç ve Adalet Hakkında"          |
| Siyaset ve iktidar             | `siyaset`          | —                | "Siyaset Hakkında"                |
| Savaş                          | `savas`            | —                | "Savaş Hakkında"                  |
| Din ve inanç                   | `inanc`            | —                | "İnanç Hakkında"                  |
| Hayatta kalma                  | `hayatta-kalma`    | —                | "Hayatta Kalma Hakkında"          |
| İntikam                        | `intikam`          | —                | "İntikam Hakkında"                |
| Sınıf farkı ve emek            | `sinif-emek`       | —                | "Sınıf Farkı ve Emek Hakkında"    |
| Eşitlik ve haklar              | `esitlik`          | —                | "Eşitlik ve Haklar Hakkında"      |
| İyilik ve dayanışma            | `dayanisma`        | —                | "İyilik ve Dayanışma Hakkında"    |
| Sıradan insanların hikâyeleri  | `insan-hikayeleri` | —                | "İnsan Hikâyeleri Anlatan"        |
| Spor                           | `spor`             | —                | "Spor Hakkında"                   |
| Müzik ve müzisyenler           | `muzik`            | —                | "Müzik Hakkında"                  |
| Müzik tarihi                   | `muzik-tarihi`     | —                | "Müzik Tarihi Hakkında"           |
| Sinema                         | `sinema`           | —                | "Sinema Hakkında"                 |
| Edebiyat ve kitaplar           | `edebiyat`         | —                | "Edebiyat Hakkında"               |
| Sanat ve sanatçılar            | `sanat`            | —                | "Sanat Hakkında"                  |
| Yemek ve mutfak kültürü        | `yemek`            | —                | "Yemek Kültürü Hakkında"          |
| Seyahat ve keşif               | `seyahat`          | —                | "Seyahat Hakkında"                |
| Kültür ve miras                | `kultur-mirasi`    | —                | "Kültürel Miras Hakkında"         |
| Arkeoloji ve antik uygarlıklar | `arkeoloji`        | —                | "Arkeoloji Hakkında"              |
| Osmanlı tarihi                 | `osmanli-tarihi`   | —                | "Osmanlı Tarihi Hakkında"         |
| Eğitim ve okul                 | `egitim`           | —                | "Eğitim Hakkında"                 |
| Uzay keşfi ve uzay görevleri   | `uzay-kesfi`       | —                | "Uzay Keşfi Hakkında"             |
| Evren ve astronomi             | `astronomi`        | —                | "Evren ve Astronomi Hakkında"     |
| Fizik                          | `fizik`            | —                | "Fizik Hakkında"                  |
| Hayvanlar                      | `hayvanlar`        | —                | "Hayvanlar Hakkında"              |
| Doğa, çevre ve iklim           | `doga-cevre`       | —                | "Doğa ve Çevre Hakkında"          |
| Beyin, zihin ve öğrenme        | `zihin`            | —                | "Zihin ve Öğrenme Hakkında"       |
| Mühendislik ve icatlar         | `muhendislik`      | —                | "Mühendislik Hakkında"            |
| Yapay zekâ ve robotlar         | `yapay-zeka`       | —                | "Yapay Zekâ ve Robotlar Hakkında" |
| İnternet ve sosyal medya       | `sosyal-medya`     | —                | "Sosyal Medya Hakkında"           |

### 4.5. Ana karakter (`ana-karakter`)

**Soru:** Hikâyeyi taşıyan karakter ya da karakterler kim?

En çok **2** değer · mikro tür adında **ana karakter** olarak kullanılır.

| Değer                                | Anahtar            | Ne zaman seçilir                                                             | Addaki ifade                       |
| ------------------------------------ | ------------------ | ---------------------------------------------------------------------------- | ---------------------------------- |
| Güçlü bir kadın                      | `guclu-kadin`      | Kararları hikâyeyi yönlendiren kadın ana karakter.                           | "Güçlü Kadın Karakterli"           |
| Çocuk                                | `cocuk`            | —                                                                            | "Çocuk Kahramanlı"                 |
| Genç (13–19 yaş)                     | `genc`             | —                                                                            | "Genç Kahramanlı"                  |
| Yaşlı                                | `yasli`            | —                                                                            | "Yaşlı Kahramanlı"                 |
| Hayvan                               | `hayvan`           | —                                                                            | "Hayvan Kahramanlı"                |
| Robot ya da yapay zekâ               | `robot`            | —                                                                            | "Robot Kahramanlı"                 |
| Fantastik varlık                     | `fantastik-varlik` | Ejderha, vampir, canavar, ruh gibi gerçek olmayan bir varlık.                | "Fantastik Varlıkların Yer Aldığı" |
| Bir aile                             | `aile`             | —                                                                            | "Bir Aileyi Anlatan"               |
| Bir ekip ya da arkadaş grubu         | `ekip`             | —                                                                            | "Bir Ekibi Anlatan"                |
| Kusurlu ana karakter (anti kahraman) | `anti-kahraman`    | —                                                                            | "Anti Kahramanlı"                  |
| Polis ya da dedektif                 | `dedektif`         | —                                                                            | "Dedektif Kahramanlı"              |
| Doktor ya da sağlık çalışanı         | `doktor`           | —                                                                            | "Doktor Kahramanlı"                |
| Sunucu ya da anlatıcı                | `sunucu`           | Programı bir sunucu ya da anlatıcı taşıyor (programlar ve belgeseller için). | —                                  |
| Belirgin bir ana karakter yok        | `yok`              | —                                                                            | —                                  |

### 4.6. Yaş grubu (`yas-grubu`)

**Soru:** Yapım öncelikle hangi yaştaki izleyici için yapılmış? (RTÜK işaretini değil, hedef kitleyi seçin.)

En çok **2** değer · mikro tür adında **yaş grubu** olarak kullanılır.

| Değer                         | Anahtar    | Ne zaman seçilir                                     | Addaki ifade       |
| ----------------------------- | ---------- | ---------------------------------------------------- | ------------------ |
| Okul öncesi (2–5 yaş)         | `2-5`      | —                                                    | "2–5 Yaş için"     |
| 6–7 yaş                       | `6-7`      | —                                                    | "6–7 Yaş için"     |
| 8–10 yaş                      | `8-10`     | —                                                    | "8–10 Yaş için"    |
| 11–12 yaş                     | `11-12`    | —                                                    | "11–12 Yaş için"   |
| Çocuklar (yaş bandı belirsiz) | `cocuk`    | Çocuklar için yapılmış ama yaş bandı belirlenemiyor. | "Çocuklar için"    |
| Gençler (13–17 yaş)           | `genc`     | —                                                    | "Gençler için"     |
| Tüm aile                      | `aile`     | Çocuk ve yetişkinin birlikte izlemesi için.          | "Tüm Aile için"    |
| Yetişkinler                   | `yetiskin` | —                                                    | "Yetişkinler için" |

### 4.7. Biçim (`bicim`)

**Soru:** Yapım hangi biçimde? (Süreyi ve yapım türünü künyeden denetleyin.)

En çok **3** değer · mikro tür adında **biçim** olarak kullanılır.

| Değer                             | Anahtar         | Ne zaman seçilir                                        | Addaki ifade              |
| --------------------------------- | --------------- | ------------------------------------------------------- | ------------------------- |
| Uzun metraj (60 dk ve üzeri film) | `uzun-metraj`   | —                                                       | "Uzun Metrajlı"           |
| Orta metraj (40–59 dk film)       | `orta-metraj`   | —                                                       | "Orta Metrajlı"           |
| Kısa film (40 dk'dan kısa)        | `kisa-film`     | —                                                       | "Kısa"                    |
| Sezonlu dizi                      | `dizi`          | Birden çok sezonu olan ya da süren dizi.                | —                         |
| Mini dizi                         | `mini-dizi`     | Tek sezonda biten, baştan sonu planlanmış dizi.         | "Tek Sezonluk"            |
| Antoloji (her bölüm ayrı hikâye)  | `antoloji`      | —                                                       | "Antoloji"                |
| Belgesel film                     | `belgesel-film` | —                                                       | —                         |
| Belgesel dizi                     | `belgesel-dizi` | —                                                       | —                         |
| Söyleşi ya da sohbet programı     | `soylesi`       | —                                                       | "Söyleşi Biçimindeki"     |
| Stand-up gösterisi                | `stand-up`      | —                                                       | "Sahnede Kaydedilmiş"     |
| Konser kaydı                      | `konser`        | —                                                       | "Konser Kaydı Olan"       |
| Sessiz film                       | `sessiz`        | Konuşmalar ara yazılarla veriliyor.                     | "Sessiz"                  |
| Siyah-beyaz                       | `siyah-beyaz`   | —                                                       | "Siyah-Beyaz"             |
| Kamera arkası                     | `kamera-arkasi` | Başka bir yapımın çekim ve hazırlık sürecini anlatıyor. | "Kamera Arkasını Anlatan" |

### 4.8. Ek sıfatlar (`ek-sifatlar`)

**Soru:** Ölçeklerin anlatmadığı hangi sıfatlar yapımı iyi tanımlıyor?

En çok **4** değer · mikro tür adında **sıfat** olarak kullanılır.

| Değer                     | Anahtar        | Ne zaman seçilir                                                      | Addaki ifade                |
| ------------------------- | -------------- | --------------------------------------------------------------------- | --------------------------- |
| Kült                      | `kult`         | Yıllar içinde sadık bir izleyici kitlesi edinmiş ve sık anılan yapım. | "Kült"                      |
| Ödüllü                    | `odullu`       | Ulusal ya da uluslararası önemli bir ödül almış.                      | "Ödüllü"                    |
| Eleştirmenlerce beğenilen | `elestirmen`   | —                                                                     | "Eleştirmenlerce Beğenilen" |
| İç ısıtan                 | `ic-isitan`    | İyilik, sevgi ve umut duygusu bırakıyor.                              | "İç Isıtan"                 |
| Nostaljik                 | `nostaljik`    | —                                                                     | "Nostaljik"                 |
| Absürt                    | `absurt`       | Mantık dışı, gerçeküstü durumlarla oynuyor.                           | "Absürt"                    |
| İlham verici              | `ilham-verici` | —                                                                     | "İlham Verici"              |
| Dinlendirici              | `dinlendirici` | Sakin müzik ve görüntüyle izleyiciyi dinlendiriyor.                   | "Dinlendirici"              |
| Diyalogsuz                | `diyalogsuz`   | Konuşma yok ya da anlamsız; hikâye görüntüyle anlatılıyor.            | "Diyalogsuz"                |
| Eğlenceli                 | `eglenceli`    | —                                                                     | "Eğlenceli"                 |
| Sıra dışı                 | `sira-disi`    | —                                                                     | "Sıra Dışı"                 |
| Zekice kurgulanmış        | `zekice`       | —                                                                     | "Zekice Kurgulanmış"        |
| Gerçekçi                  | `gercekci`     | —                                                                     | "Gerçekçi"                  |
| Destansı                  | `destansi`     | —                                                                     | "Destansı"                  |
| Hicivli                   | `hicivli`      | Toplumu ya da iktidarı alaya alıyor.                                  | "Hicivli"                   |

## 5. Mikro tür adları nasıl kurulur

Etiketleyici ad yazmaz; ad, fişlerden otomatik kurulur. Yine de seçimlerinizin nereye gittiğini bilmek işe yarar:

- Ad, hazır ifadelerin şu sırayla dizilmesidir, sonda çekirdek türün çoğul adı gelir: yapım dönemi → yaş grubu → uyarlama kaynağı → hikâyenin dönemi → mekân → konu → ana karakter → sıfat → köken → biçim → kişi → tür.
- Köken bölgesi ve yapım dönemi künyeden (ülke ve yıl) gelir; fişte seçilmez.
- Kişi (oyuncu, yönetmen, sunucu) katalogda en az iki yapımda geçiyorsa kendi mikro türünü alır ("Buster Keaton Komedi Filmleri").
- Tür adında zaten söylenen nitelik ada eklenmez ("Komik Komediler" oluşmaz); biri ötekini söyleyen iki nitelik
  ("Sessiz" ve "Diyalogsuz") aynı adda birleşmez.
- Aynı başlıkları kapsayan iki ad varsa daha sade olanı kalır: bütün sessiz komediler 1920'lerdense
  "1920'lerden Sessiz Komedi Filmleri" değil "Sessiz Komedi Filmleri" görünür.

Örnek tür adları:

| Tür             | Film                     | Dizi                        | Karışık                          |
| --------------- | ------------------------ | --------------------------- | -------------------------------- |
| Komedi          | Komedi Filmleri          | Komedi Dizileri             | Komediler                        |
| Dram            | Dram Filmleri            | Dram Dizileri               | Dramlar                          |
| Aksiyon         | Aksiyon Filmleri         | Aksiyon Dizileri            | Aksiyon Filmleri ve Dizileri     |
| Macera          | Macera Filmleri          | Macera Dizileri             | Macera Filmleri ve Dizileri      |
| Gerilim         | Gerilim Filmleri         | Gerilim Dizileri            | Gerilim Filmleri ve Dizileri     |
| Korku           | Korku Filmleri           | Korku Dizileri              | Korku Filmleri ve Dizileri       |
| Suç             | Suç Filmleri             | Suç Dizileri                | Suç Filmleri ve Dizileri         |
| Romantik        | Romantik Filmler         | Romantik Diziler            | Romantik Filmler ve Diziler      |
| Bilim Kurgu     | Bilim Kurgu Filmleri     | Bilim Kurgu Dizileri        | Bilim Kurgu Filmleri ve Dizileri |
| Fantastik       | Fantastik Filmler        | Fantastik Diziler           | Fantastik Filmler ve Diziler     |
| Animasyon       | Animasyon Filmleri       | Animasyon Dizileri          | Animasyonlar                     |
| Belgesel        | Belgesel Filmler         | Belgesel Diziler            | Belgeseller                      |
| Doğa ve Bilim   | Doğa ve Bilim Filmleri   | Doğa ve Bilim Dizileri      | Doğa ve Bilim Yapımları          |
| Tarih           | Tarih Filmleri           | Tarih Dizileri              | Tarih Yapımları                  |
| Müzik           | Müzik Filmleri           | Müzik Dizileri              | Müzik Yapımları                  |
| Spor            | Spor Filmleri            | Spor Dizileri               | Spor Yapımları                   |
| Çocuk ve Aile   | Çocuk ve Aile Filmleri   | Çocuk ve Aile Dizileri      | Çocuk ve Aile Yapımları          |
| Yaşam ve Kültür | Yaşam ve Kültür Filmleri | Yaşam ve Kültür Programları | Yaşam ve Kültür Yapımları        |
| Teknoloji       | Teknoloji Filmleri       | Teknoloji Programları       | Teknoloji Yapımları              |
| Haber ve Güncel | Haber ve Güncel Yapımlar | Haber ve Güncel Programlar  | Haber ve Güncel Yapımlar         |
| Kısa Film       | Kısa Filmler             | Kısa Bölümlü Diziler        | Kısa Filmler ve Diziler          |
| Sessiz Sinema   | Sessiz Filmler           | Sessiz Diziler              | Sessiz Sinema Yapımları          |
| Klasikler       | Klasik Filmler           | Klasik Diziler              | Klasikler                        |
| Yerli Yapımlar  | Yerli Filmler            | Yerli Diziler               | Yerli Yapımlar                   |

## 6. İşlenmiş örnekler

Aşağıdaki iki fiş depodaki **örnek** fişlerdir: yapım izlenmeden, özet ve künyeden doldurulmuştur. Bu yüzden izlemeden bilinemeyecek
ölçekler boş bırakılmış ve her seviyenin dayanağı nota yazılmıştır. Gerçek fişte bu ölçekleri izleyerek doldurursunuz.

### 6.1. Sintel (2010, film)

| Ölçek           | Seviye        |
| --------------- | ------------- |
| Cinsellik       | 0 — Yok       |
| Şiddet          | 3 — Belirgin  |
| Kan ve yara     | boş bırakıldı |
| Korku           | boş bırakıldı |
| Argo ve küfür   | 0 — Yok       |
| Madde kullanımı | 0 — Yok       |
| Romantizm       | boş bırakıldı |
| Mizah           | boş bırakıldı |
| Gerilim         | 3 — Belirgin  |
| Duygusallık     | 4 — Yoğun     |
| Karanlık ton    | boş bırakıldı |
| Tempo           | boş bırakıldı |
| Karmaşıklık     | 1 — Kolay     |
| Sonun netliği   | boş bırakıldı |
| Görsellik       | 4 — Çarpıcı   |
| Öğreticilik     | 0 — Yok       |

Yüzler:

- **Mekân:** Hayalî dünya
- **Ana karakter:** Güçlü bir kadın, Fantastik varlık
- **Biçim:** Kısa film (40 dk'dan kısa)

Bu fişten çıkan sıfatlar: "Duygusal", "Kolay İzlenen", "Görsel Açıdan Çarpıcı".

> **Not:** Örnek fiş: izlenmeden, özet ve künyeden dolduruldu. Şiddet 3: RTÜK 13+ (şiddet ve korku) işaretinin bu ölçekteki en düşük karşılığı. Cinsellik, argo ve madde 0: işaretin gerekçelerinde bu başlıklar yok. Gerilim 3 ve duygusallık 4: 'heyecanlı' ve 'duygusal' ruh hâli etiketleri ile özetteki tehlikeli yolculuk. Karmaşıklık 1: özet tek bir olay çizgisi anlatıyor. Görsellik 4: 'göz alıcı' niteliği. Mekân hayalî dünya, ana karakter genç kadın ve ejderha: özetten. Kan, korku, ton, tempo ve sonun netliği izlenmeden belirlenemez; boş bırakıldı.

### 6.2. Köydeki Lezzet (2026, dizi)

| Ölçek           | Seviye        |
| --------------- | ------------- |
| Cinsellik       | 0 — Yok       |
| Şiddet          | 0 — Yok       |
| Kan ve yara     | 0 — Yok       |
| Korku           | 0 — Yok       |
| Argo ve küfür   | 0 — Yok       |
| Madde kullanımı | 0 — Yok       |
| Romantizm       | 0 — Yok       |
| Mizah           | boş bırakıldı |
| Gerilim         | boş bırakıldı |
| Duygusallık     | boş bırakıldı |
| Karanlık ton    | boş bırakıldı |
| Tempo           | boş bırakıldı |
| Karmaşıklık     | boş bırakıldı |
| Sonun netliği   | boş bırakıldı |
| Görsellik       | boş bırakıldı |
| Öğreticilik     | 3 — Belirgin  |

Yüzler:

- **Mekân:** Köy ve kırsal
- **Konu:** Yemek ve mutfak kültürü
- **Biçim:** Belgesel dizi
- **Ek sıfatlar:** İç ısıtan

Bu fişten çıkan sıfatlar: yok.

> **Not:** Örnek fiş: izlenmeden, özet ve künyeden dolduruldu. Uyarı ölçekleri 0: RTÜK Genel İzleyici. Öğreticilik 3: her bölüm bir yemeği (sebzeli pilav, Azerbaycan mantısı, Özbek pilavı, menemen, Karabağ ketesi) ele alıyor. Konu yemek kültürü; adı ve anahtar kelimeleri köyde geçtiğini gösteriyor. 'İç ısıtan' etiketi ek sıfat olarak işlendi. Duygusallık ve tempo izlenmeden belirlenemez.

## 7. Sık yapılan hatalar

- Tür etiketine bakarak seviye seçmek ("korku filmi, demek ki korku 5"). Seviye ekranda görülene göre seçilir.
- Tek bir sahne yüzünden ton ölçeklerini yükseltmek. Tek sahne yalnız içerik uyarılarında belirleyicidir.
- Yapım yılı ile hikâyenin dönemini karıştırmak. 2020 yapımı bir dizi 1970'lerde geçebilir; "Hikâyenin dönemi" olayların zamanıdır.
- Belgeselde "Kaynak: Gerçek olay" seçmek. Bu değer, gerçek bir olayı canlandıran kurgu yapımlar içindir.
- Bir yüzde sınırı doldurmak için zayıf değerler eklemek. Az ama doğru değer, çok ama belirsiz değerden iyidir.
- Emin olunmayan bir ölçeğe orta değer (2–3) yazmak. Bilmiyorsanız boş bırakın ve notta nedenini yazın.
