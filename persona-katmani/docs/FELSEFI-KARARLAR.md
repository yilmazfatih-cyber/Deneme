# Felsefi kararlar — proje sahibine

Altı rol bölümünün sonunda bıraktığı 33 soru burada 10 başlıkta birleştirildi. Her başlıkta: soru, neden teknik
olmadığı, seçenekler, ekibin önerisi, etkilenen mimari parçalar ve hangi bölümlerden geldiği. **Hiçbiri karara bağlanmadı**;
mimari belgeler "teknik varsayılan" ile ilerledi, karar değişirse ilgili bölüm güncellenir.

Yanıt biçimi önerisi: her satıra bir harf (a/b/c) veya kendi cümlenizi yazın; "sonra" da geçerli bir yanıttır.

| # | Soru | Teknik varsayılan (karar gelene kadar) |
| --- | --- | --- |
| F-1 | Persona gerçek bir insanı temsil ettiğini iddia edebilir mi? | **KARAR VERİLDİ (ADR-001): evet, her gerçek müşteri için istatistiksel dijital ikiz.** Rıza ve dil kuralları 06'da tasarlanacak |
| F-2 | Sentetik sonuç gerçek ölçümün yerine geçebilir mi? | **KARAR (ADR-007): geçebilir.** Kalibrasyon döngüsü öneri olarak kalır |
| F-3 | Hassas özellikler ve kalıp yargıya yakın farklar modellensin mi? | **KARAR (ADR-007): modellenmesin.** Hassas özellik hiçbir şemaya girmez |
| F-4 | Kullanıcıya ne kadar belirsizlik gösterilmeli? | **KARAR (ADR-007): tek skor** (0–100 hedefleme skoru); aralık ayrıntıda |
| F-5 | Müşteri personayı elle düzenleyebilir / yazabilir mi? | **KARAR (ADR-007): düzenleyebilir**; değişiklik koşuda işaretlenir |
| F-6 | Manipülatif optimizasyon (karanlık desen) sınırını kim çizer? | **KARAR (ADR-007): müşteri çizer**; ürün yalnız raporlar |
| F-7 | Söz ile davranış çelişirse personanın "görüşü" hangisi? | **KARAR (ADR-007): davranış**; söz yalnız gerekçe |
| F-8 | *(açık; yeniden anlatılacak)* Personaya insan adı/yüz; algıya insan kusuru eklensin mi? | Ad var, fotoğraf yok, "sentetik" etiketi sürekli; algı bozulması kalibre edilene kadar kapalı |
| F-9 | Müşteri verisi ortak kalibrasyon düzelticisine girsin mi? | **KARAR (ADR-007): girsin**; varsayılan dahil, çıkış hakkı |
| F-10 | Hangi işler ve çıktı biçimleri reddedilir? | **KARAR (ADR-007): şu an hiçbiri reddedilmez** |
| F-11 | Kişinin zayıf noktası üzerinden hedefleme? | **KARAR (ADR-002): Hayır.** Kişi parametreleri yalnızca genel çıkarım için; kişi kimliğiyle dışa aktarım yok |
| F-12 | Kişi kendi ikizini görür mü? | **KARAR (ADR-002): Hayır.** Bireye yönelik arayüz yok; ikiz müşteri şirketin analiz nesnesi |
| F-13 | Soğuk kayıt "ikiz" diye adlandırılabilir mi? | **KARAR (ADR-002):** birim seviye bazlı "davranış profili"; "ikiz" yalnızca gerçek müşteri kümesi (S4) için, tek kişi için değil |
| F-14 | Kültür/ülke öncülü veri gelmeden atansın mı? | **KARAR (ADR-002): Evet.** Dünya → Türkiye → şehir → konum/site → gerçek müşteri zinciri tasarımın kendisi; kart hangi seviyeden miras aldığını söyler |
| F-15 | Rıza geri çekilince geçmiş raporlar? | Daraldı (ADR-002): kişi kimliğiyle rapor yok; yalnızca S4 kestiriminden silme. Hukuki görüşle kapanacak |

---

## F-1 · Persona "gerçek bir insanı" temsil ettiğini iddia edebilir mi?

> **Karar (2026-11-07, proje sahibi): Evet, dijital ikiz.** Bkz. `decisions/ADR-001-dijital-ikiz.md` ve `mimari/07-dijital-ikiz-istatistik.md`. Aşağıdaki metin karar öncesi tartışmadır.

Geldiği bölümler: 01 F1, 02 S1/S6, 03 F1, 05 S1, 06 S1.

- **Soru:** Kanıt-temelli personalar "Ayşe Hanım, 42, gerçek müşterinizin dijital ikizi" olarak mı, yoksa her zaman
  "bu segmentin sentetik bir örneği" olarak mı sunulmalı? Tek bir gerçek kişinin (görüşmeci, çalışan, danışma kurulu üyesi)
  verisinden "dijital ikiz" üretilsin mi, rızayla bile? Kalibre edilmiş isabet "X kitlesini temsil eden personalar" demeye yeter mi?
- **Neden teknik değil:** Aynı veri modeli iki iddiayı da taşır. Fark, ürünün kullanıcıya ve dolaylı olarak o gerçek kişiye karşı
  ne iddia ettiğidir: temsil, rıza, onur. Kişinin hiç söylemediği sözlerin ona atfedilmesi rıza alınsa bile bir temsil sorusudur.
- **Seçenekler:**
  (a) Hiçbir zaman birey iddiası yok; en küçük birim hücre; dil her zaman "tahmin".
  (b) Kalibrasyonu belirli düzeyi geçen hücrelerde koşullu temsil dili ("bu karar türünde bu kitlenin tepkisini şu isabetle yaklaşıklayan"); birey ikizi yalnız açık, geri alınabilir rızayla ve kişinin çıktıları görme hakkıyla.
  (c) Müşteriye bırakılır.
- **Ekibin önerisi:** Başlangıçta (a). Kalibrasyon kaydı birikip bağımsız denetimden geçince kitle düzeyinde (b)'nin dil kısmı;
  birey ikizi 06'nın rıza akışı tasarlanmadan hiçbir koşulda yok. Kurumsal roller ("bir satın alma müdürü") zaten segment personasıyla karşılanıyor.
- **Etkilediği parçalar:** `Persona.class` ve `source`, anlatı üretimi ve kimlik kartı (02), rapor dili ve alıntı etiketi (05 §7),
  gösterge metinleri (03 §14), veri sınıfları ve rıza (06 §6), pazarlama metinleri.

## F-2 · Sentetik sonuç gerçek ölçümün yerine geçebilir mi?

Geldiği bölümler: 01 F2, 02 S5, 03 F2, 05 S2/S6.

- **Soru:** Müşteri yalnızca simülasyon sonucuna dayanarak karar verebilir mi? Yeşil kapıdan geçmiş, "güçlü" güvenli bir sonuçla
  canlı A/B testi atlanabilir mi? Büyük bir müşteri ödeme istekliliği simülasyonu isterse ürün "hayır" mı der, "hipotez modu" mu verir?
- **Neden teknik değil:** Kalibrasyon bir hata oranı verir; o oranın hangi karar için kabul edilebilir olduğu risk ve sorumluluk
  tercihidir. Ayrıca kalibrasyon verisi yalnızca gerçek test yapılmaya devam ettikçe birikir: ikame başarılı olursa doğrulama kaynağı kurur.
  Bu, iş modeli ile epistemik dürüstlük arasında bir tercihtir ve ürünün kimliğini belirler.
- **Seçenekler:**
  (a) Ürün hep "karar desteği"; her raporda zorunlu insan adımı önerisi; K1–K3 ve K9 mutlak kırmızı.
  (b) Düşük riskli, geri alınabilir kararlarda ikameye izin; sarı/kırmızıda zorunlu insan adımı; ikame edilen kararların rastgele bir yüzdesinde (örn. %10) gerçek test sözleşmeye bağlanır; K2–K3 için imzalı feragatle hipotez modu.
  (c) Kalibrasyon kaydı eşiği geçen soru tiplerinde ikame izni; müşteri bazında esnek kapı.
- **Ekibin önerisi:** (b). K1 (ödeme istekliliği), K6 (hassas özellik), K9 (gerçek kişi taklidi) her durumda kırmızı kalır.
  (c)'ye ancak bağımsız denetimden sonra geçiş.
- **Etkilediği parçalar:** Kapı tablosu (05 §6), kullanım sınıfı (02 §10), kör tahmin programı (03 §8.4), kapsam etiketi (03 §14),
  rapor dışa aktarma (05), fiyatlandırma (05 §9), yönetişim giriş kontrolü (06).

## F-3 · Hassas özellikler ve kalıp yargıya yakın alt grup farkları modellensin mi?

Geldiği bölümler: 01 F3, 02 S2, 03 F3, 05 S3, 06 S2.

- **Soru:** Din, etnik köken, siyasi görüş, cinsel yönelim, sağlık durumu persona şemasına girmeli mi? Türkiye'de birçok tüketim
  davranışı dindarlık veya bölgesel kimlikle ilişkilendiriliyor; bunları nüfus katmanı yapmak içgörü mü, kalıp yargıyı makineleştirmek mi?
  Gerçek veride var olan ama ayrımcılıkla ilişkili bir farkı doğru yeniden üretmek başarı mı?
- **Neden teknik değil:** Teşhis ölçülebilir (düzleşme/karikatür, P5). Ama hangi farkın "gerçek ve modellenmeye değer", hangisinin
  "kalıp yargı" olduğu ve "doğru ama incitici" bir örüntüyü yeniden üretmenin meşruiyeti bir değer kararıdır. Modellemezsek bu gruplar
  görünmez olur ve ürünlerin onlar üzerindeki etkisi ölçülemez; modellersek hedefleme/dışlama aracı veririz. İki yönde de kayıp var.
- **Seçenekler:**
  (a) Hassas boyutlar tamamen yasak.
  (b) Varsayılan kapalı (`unknown`); yalnızca kapsayıcılık/erişilebilirlik testleri için, kamu istatistiğiyle temellendirilmiş, toplu raporlanan, etik incelemeli çalışmalarda açılır; farklar ölçülür ama hedefleme raporunda gösterilmez; karikatür teşhisi zorunlu; kültürel işaretçi sözlüğü o topluluktan insan gözden geçirmesiyle kurulur.
  (c) Müşteri isteğine açık, uyarıyla.
- **Ekibin önerisi:** (b). Korunan özniteliklerle koşullandırma (c) hiçbir zaman.
- **Etkilediği parçalar:** Persona şeması `unknowns` varsayılanları ve işaretçi sözlüğü (02 §5, §7.3), P5–P7 (03 §7), kapı K6 (05 §6),
  karantina reddi ve ürün içi açıklama (06 §4.2, §7), rapor segmentleme (05).

## F-4 · Kullanıcıya ne kadar belirsizlik gösterilmeli?

Geldiği bölümler: 01 F4, 02 S4, 03 F4, 04 S5, 05 S4.

- **Soru:** Dürüst rapor geniş aralıklar, "kararsız" etiketleri ve "şu üç şeyi bilmiyoruz" der; karar sahibi net öneri ister.
  Belirsizlik ilk ekranda mı, ekte mi? Dört katmanlı sadakat tek bir "skor"a indirilsin mi? Sentetik huni müşterinin GA4 hunisinin yanına
  konunca kullanıcı ikisini aynı türden ölçüm sanabilir; ne kadar uyarı?
- **Neden teknik değil:** Hesaplanan belirsizlik aynıdır; ne kadarının yüzeye çıkacağı, kullanıcıya karşı sorumluluk ile ticari
  çekicilik arasında bir tercihtir. Belirsizliği gizleyen rapor, kategorinin literatürdeki temel eleştirisini doğrular.
- **Seçenekler:**
  (a) Her bulguda tam aralık + isabet şeridi + "ne bilmiyoruz", ilk ekranda; yalnızca katmanlı görünüm.
  (b) Özet görünümde sadeleştirilmiş üç kademe (güçlü/zayıf/ayırt edilemiyor), ayrıntıda tam aralık; "ayırt edilemiyor" hiçbir görünümde gizlenmez ve kazanan ilan edilmez; sentetik huni kalibrasyon öncesi yalnızca göreli (A vs B), sonrası mutlak + aralık.
  (c) Yalnızca nokta tahmin veya tek skor; aralık isteğe bağlı; müşteri seçer.
- **Ekibin önerisi:** (a) ürün içinde varsayılan, (b) yönetici özetinde. "%90 korelasyon" türü tek sayı pazarlamada kullanılmaz.
- **Etkilediği parçalar:** Rapor şeması zorunlu alanları (01 §4.6, 05 §7), gösterge metinleri (03 §14), analitik eşleme (04 §11),
  değerlendirme panosu (03), arayüz tasarımı.

## F-5 · Müşteri personayı elle düzenleyebilir veya kendi personasını yazabilir mi?

Geldiği bölümler: 01 F5, 05 S5.

- **Soru:** Müşteri "bizim müşterimiz böyle değil" deyip personayı değiştirmek veya "kendi personamı yazayım" demek ister. Bu bilgi
  katkısı mı, sonucu beklentisine yontma mı? Elle yazılan persona nüfus hizalama ve rapor istatistiğine girer mi?
- **Neden teknik değil:** Kontrolün kimde olduğu ve ürünün tarafsızlık iddiası meselesi; literatürdeki "katılım aşırı güven doğurur"
  bulgusu (2607.21757) bunu ürün kimliği sorusu yapıyor.
- **Seçenekler:**
  (a) Serbest düzenleme, istatistiğe girer.
  (b) Düzenleme serbest ama raporda işaretlenir, güven bir sınıf düşer; elle yazılan personalar ayrı "keşif" katmanında, istatistiğe girmez veya ağırlığı sınırlanır.
  (c) Düzenleme yok; nüfus yalnızca kanıt (veri) yükleyerek değişir.
- **Ekibin önerisi:** (c) varsayılan, (b) gelişmiş mod.
- **Etkilediği parçalar:** `Persona.class = user_authored` ve `source` (02), toplayıcı ve hizalama hesabı (01 L6, 02), güven hesabı (03),
  akış kuralları (05 §8).

## F-6 · Manipülatif optimizasyonun sınırını kim çizer?

Geldiği bölümler: 01 F6, 06 S3.

- **Soru:** Ürün "en çok terk ettirmeyen karanlık deseni" veya en ikna edici yanıltıcı mesajı bulmak için kullanılabilir. Dönüşüm
  optimizasyonu ile karanlık desen arasındaki gri bölgede (ör. kıtlık mesajı doğruysa) ürün reddeder mi, raporlar mı, müşteriye mi bırakır?
- **Neden teknik değil:** Dönüşüm optimizasyonu ile manipülasyon aynı boru hattıdır; ayrım etik bir ayrımdır ve ürünün müşteriye
  karşı ne kadar vesayetçi olacağını belirler.
- **Seçenekler:**
  (a) Sınırlama yok; kullanım koşulları yeterli; yalnızca raporla.
  (b) Açık yasak listesi (siyasi ikna, savunmasız gruplar, bilinen karanlık desen kalıpları) red; gri bölge raporlanır; persona "manipüle edildiğini fark etti mi?" gözlemi zorunlu ölçüt.
  (c) Sert red; gri bölge de engellenir.
- **Ekibin önerisi:** (b).
- **Etkilediği parçalar:** Senaryo `ölçütler` ve çalışma zamanı ifade çağrısı (01 §6.1), varyant tarayıcı (04), savunma katmanları (06 §8.2),
  rapor "manipülasyon bulgusu" bölümü (05).

## F-7 · Söz ile davranış çelişirse personanın "görüşü" hangisi?

Geldiği bölüm: 04 S1 (02 §9 ile ilişkili).

- **Soru:** Persona sesli düşünmede "çok beğendim" deyip üç adım sonra vazgeçerse raporda tutumu ne olarak sunulur?
- **Neden teknik değil:** İkisi de aynı modelin ürettiği metindir; hangisinin "gerçek niyeti" temsil ettiği, sentetik bir varlığa
  niyet atfetmenin anlamı sorusudur. İnsanlardaki say-do gap ölçülmüş bir olgudur; LLM'deki aynı adlı farkın aynı olgu olup olmadığı bilinmiyor.
- **Seçenekler:**
  (a) Davranış öncelikli; söz yalnızca açıklayıcı.
  (b) İkisi eşit; çelişki ayrı bir bulgu türü; "modelin iki kanalı arasındaki fark" diye adlandırılır.
  (c) Çelişen oturum "tutarsız persona" sayılır ve dışlanır.
- **Ekibin önerisi:** (b); fark insanlardaki say-do gap'in kanıtı diye pazarlanmaz.
- **Etkilediği parçalar:** Olay şeması `thought`/`action` ayrımı (04 §7), söz/davranış kanalı (02 §9), rapor biçimi (05), kalibrasyon hedefleri (03).

## F-8 · Personaya ne kadar insanlık: ad, yüz, kusurlu algı, dış irade?

Geldiği bölümler: 02 S3, 04 S2/S3.

- **Soru:** "Persona 7F3A" mı, "Ayşe, 48, Kayseri" mi? Ekran görüntüsünü okuyan model insandan daha iyi görür; "insan gibi algı" için
  bilerek bozulmuş algı (bulanıklık, çevresel görüş kaybı) eklensin mi? Dış sabır modeli oturumu bitirdiğinde persona "devam etmek
  istiyordum" demişse sonuç kimin?
- **Neden teknik değil:** İsim ve yüz kullanılabilirliği artırır ama aşırı güveni de artırır ve sentetik varlığı gerçek kişi gibi sunmanın
  dürüstlüğü sorusudur. Hangi kusurların "insanı temsil" için gerekli, hangilerinin bir grubu (yaşlı, az gören) karikatürleştirmek
  olduğu temsil ve saygı sorusudur. "Personalar terk etti" ile "modelimiz terk ettirdi" arasındaki fark dürüstlük ve sorumluluk sorusudur.
- **Seçenekler:**
  (a) Yalnızca kod; yalnızca bilgi sınırı süzgeci; dış model yalnızca uyarır, karar LLM'de.
  (b) Ad var, fotoğraf yok, "sentetik" uyarısı sürekli; parametreli algı bozulması göz izleme verisiyle kalibre edilene kadar kapalı; dış model üstün ama "sabır modeli sonlandırdı" etiketi zorunlu ve iki oran ayrı raporlanır.
  (c) Tam insanlaştırma; erişilebilirlik grupları için açık bozulma profilleri; iki koşu türü de raporlanır.
- **Ekibin önerisi:** (b). Fotoğraf hiçbir koşulda gerçek kişi fotoğrafı olmaz; sentetik ad havuzu (06).
- **Etkilediği parçalar:** `identity.display_name` ve kimlik kartı (02 §5, §11.2), algı katmanı ve `DeviceProfile` (04 §4), dikkat modeli ve
  `abandon.reason` (04 §6), rapor (05), kalibrasyon (03).

## F-9 · Müşteri verisi ortak kalibrasyon düzelticisine girsin mi?

Geldiği bölüm: 03 F5 (06 §4 ile ilişkili).

- **Soru:** Bir müşterinin A/B sonuçları global düzelticiyi iyileştirerek tüm müşterilere fayda sağlayabilir. İzinle bile yapılmalı mı?
- **Neden teknik değil:** İsabet artar; ama bir müşterinin pazar bilgisinin dolaylı olarak rakibine fayda sağlaması güven ve adalet sorusudur.
- **Seçenekler:**
  (a) Hiçbir müşteri verisi global katmana girmez.
  (b) Açık izinle, yalnızca toplulaştırılmış hata istatistikleri girer.
  (c) Varsayılan dahil, çıkış hakkı.
- **Ekibin önerisi:** (b).
- **Etkilediği parçalar:** Katmanlı düzeltici (03 §9.3), veri sınıfları ve sözleşme şablonu (06), müşteri bazlı yalıtım (03 §15).

## F-10 · Hangi işler, ortamlar ve çıktı biçimleri reddedilir?

Geldiği bölümler: 04 S4, 06 S4/S5.

- **Soru:** Seçim mesajı testi, kumar veya yüksek faizli kredi pazarlaması müşteri olarak kabul edilsin mi? Müşteri rakibinin ödeme
  akışında persona koşturabilir mi? Rapor yatırımcıya veya basına gösterilebilir mi; filigran kaldırılabilir mi?
- **Neden teknik değil:** Hukuka uygun olabilir; soru şirketin hangi işe ortak olmak istediğidir. Üçüncü tarafın rızası olmadan onun
  ürününü sistematik test edip sonucunu satmanın meşruiyeti; müşterinin kendi çıktısı üzerindeki hakkı ile üçüncü kişilerin
  yanıltılmaması arasındaki denge.
- **Seçenekler:**
  (a) Siyasi reklam sektör yasağı; yalnızca sahiplik doğrulanmış alanlar; filigran kaldırılamaz, kamuya açık iddia yasak.
  (b) İnsan incelemeli kapı ve yalnız anlaşılırlık testi (kumar, yüksek faiz); herkese açık sayfalar hız sınırıyla ve yan etkisiz; filigran kaldırılamaz ama iç kullanım dışı paylaşım serbest.
  (c) Serbest; kurumsal planda filigran kapatılabilir; müşterinin kendi kaydettiği ekran görüntüleriyle rakip analizi (canlı erişim yok).
- **Ekibin önerisi:** Siyasi reklamda (a); kumar/yüksek faizde (b); ortamda (a) varsayılan, (c)'nin kayıt tabanlı yolu 06'nın hukuki
  görüşüyle istisna; filigranda (a).
- **Etkilediği parçalar:** Yüksek riskli sektör kapısı (06 §8.2), sahiplik doğrulaması ve ortam havuzu (04 §8), dışa aktarım şablonları ve
  filigran (05, 06 §9), satış süreci ve kullanım politikası.

---

## F-11 … F-15 · Dijital ikiz kararının doğurduğu yeni sorular

> **Karar (2026-11-08, proje sahibi):** F-11 hayır, F-12 hayır, F-13 ve F-14 "genelden özele sosyolojik model" çerçevesiyle çözüldü; F-15 daraldı. Bkz. `decisions/ADR-002-genelden-ozele.md`. Aşağıdaki metin karar öncesi tartışmadır.

ADR-001 ile F-1 kapandı; `mimari/07-dijital-ikiz-istatistik.md` beş yeni değer sorusu çıkardı. Tam metin, seçenekler ve
gerekçeler 07'nin "Felsefi sorular" bölümünde; özet tabloda. Kısa yorum:

- **F-11 zayıf noktadan hedefleme:** teknik olarak en kolay ve en kârlı kullanım; aynı zamanda 06'nın manipülasyon tanımının
  kişi düzeyine inmiş hâli. Ekip "ikiz → pazarlama sistemine kişi kimliğiyle geri yazma yok" diyor.
- **F-12 kişinin kendi ikizini görmesi:** KVKK erişim hakkıyla da ilişkili; "ben böyle değilim" itirazı bir veri düzeltme talebidir.
- **F-13 soğuk ikiz adı:** pazarlama "ikiz" demek ister; soğuk kayıt aslında segment ortalamasıdır.
- **F-14 kültür öncülü:** F-3'ün devamı; veri gelmeden "kültürü gereği" atama kalıp yargıya en yakın nokta.
- **F-15 rıza geri çekme:** toplu sonuç ile bireysel iz arasında sınır nereye çekilecek.

## Yanıtlarınız geldiğinde ne olur

Her karar bir ADR olarak `persona-katmani/docs/decisions/` altına yazılır; ilgili bölüm sahibi ajan (`.claude/agents/pk-*.md`)
kendi dosyasındaki "teknik varsayılan"ı karara göre günceller; `MIMARI.md` §4 tablosu kapanır.
