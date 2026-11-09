# Hukuk ve uyum

Bu belge yazılıma işlenen kuralları ve kaynaklarını listeler. Hukuki görüş değildir; canlıya almadan önce bir avukatla
gözden geçirin. Kaynaklar Kasım 2026’da hakemli hukuk dergilerindeki kanun alıntılarından ve resmî belgelerin özetlerinden
derlendi; mevzuat.gov.tr ve Resmî Gazete metinleriyle ayrıca karşılaştırılmalıdır.

## 634 sayılı Kat Mülkiyeti Kanunu

| Kural                                                                                                                                                                             | Madde      | Kodda                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| Kapıcı, kaloriferci, bahçıvan ve bekçi giderleri **eşit**; sigorta, bakım-onarım, yönetici ücreti ve diğer ortak giderler **arsa payı** oranında (aksine anlaşma yoksa)           | m.20/1     | `shared/labels.ts` → `DEFAULT_METHOD`, `domain/budget.ts`       |
| Gecikme tazminatı: ödemede geciktiği günler için **aylık %5** hesabıyla                                                                                                           | m.20/2     | `domain/ledger.ts` → `lateFee` (gün esaslı, basit)              |
| Olağan kurul yılda en az bir kez; çağrı en az **15 gün** önce, imzalı bildirim ya da taahhütlü mektupla; çağrıda ikinci toplantının yeri ve zamanı                                | m.29       | `domain/quorum.ts` → `scheduleWarnings`, `services/meetings.ts` |
| İlk toplantı: maliklerin **sayı ve arsa payı** bakımından yarıdan fazlası; ikinci toplantı ilkinden en az 7, en geç 15 gün sonra, yeter sayı aranmaz, katılanların salt çoğunluğu | m.30       | `domain/quorum.ts` → `quorum`, `tally`                          |
| Her bağımsız bölüm bir oy; çok bölümlü malikin oyu toplamın **1/3**’ünü aşamaz; vekâlet: 40 ve altı bölümde bir kişi en çok **2** malik, büyük yapılarda oyların **%5**’i         | m.31       | `voteCaps`, `proxyWarnings`                                     |
| Kararlar noter onaylı karar defterine yazılır, hazır bulunanlarca imzalanır                                                                                                       | m.32       | tutanak yalnız **taslak** üretir                                |
| Yönetim planı değişikliği: tüm maliklerin **beşte dördü**                                                                                                                         | m.28       | karar kuralı `bestedort`                                        |
| Yönetici seçimi ve faydalı yenilikler: tüm maliklerin **sayı ve arsa payı çoğunluğu**                                                                                             | m.34, m.42 | karar kuralı `sayi_arsa`                                        |
| Ortak yerlerde değişiklik: maliklerin beşte dördünün **yazılı rızası**                                                                                                            | m.19/2     | toplantı dışında yazılı rıza gerekir (bilgi notu)               |

Uygulama notları:

- **Gecikme tazminatı bileşik değildir:** kanun sessizdir; uygulama ana borç × %5/30 × gün şeklindedir. Tahakkuk edilen tazminata
  yeniden tazminat işletilmez. Yargıtay, tazminatın borçlunun borcu öğrenmesinden itibaren işleyeceğini kabul etmiştir
  (işletme projesinin tebliği önemlidir). Oran site ayarında 0–%5 arasında seçilebilir.
- **Çevrim içi oylama:** kat malikleri kurulu için kanuni dayanak yoktur. Kâhya oyları fiziki toplantıda kaydetmek ve yeter
  sayıyı hesaplamak için kullanılır; uzaktan katılım vekâletle olur.
- **7579 sayılı Kanun (RG 22.05.2026):** KMK m.35, m.37 ve m.70’te değişiklik yapılmıştır. Bildirimlere göre işletme projesi
  kurulca onaylanır; onaylanmazsa yönetici **geçici işletme projesi** düzenler. Kâhya’da proje durumları: taslak / kurulca onaylı /
  geçici. Önceki metinde yer alan 7 günlük itiraz süresinin ve işletme projesinin İİK m.68 belge niteliğinin güncel hali
  **doğrulanmalıdır**; bu nedenle son hatırlatma metni belirli bir icra maddesine atıf yapmaz. Toplu yapılarda (m.70) yönetim planı
  değişikliği için öngörülen çoğunluk da doğrulanmalıdır.

## KVKK (6698)

- **Rol:** veri sorumlusu ve veri işleyen rolleri yönetim sözleşmesinde açıkça yazılmalıdır (kat malikleri adına yönetim / profesyonel
  yönetim şirketi). VERBİS kayıt yükümlülüğünü şirket ölçeğinize göre kontrol edin.
- **Aydınlatma:** sakin portalında “Hesabım ve gizlilik” bölümünde örnek metin vardır; personel kişi kartında “Aydınlatıldı” işaretini görür.
- **İlgili kişi hakları (m.11):** kişi bazında veri dökümü (JSON) ve anonimleştirme. Aidat ve tahsilat kayıtları kişiye değil bağımsız
  bölüme bağlıdır; anonimleştirmede yasal saklama yükümlülüğü olan mali kayıtlar korunur, mesaj içerikleri silinir.
- **Yurt dışına aktarım (m.9, 7499 sayılı Kanunla 2024’te değişti):** Claude API ABD’de çalışır. Düzenli aktarım için Kurul’un ilan
  ettiği **standart sözleşme** imzalanmalı ve imzadan itibaren **5 iş günü** içinde Kurum’a bildirilmelidir (yeterlilik kararı yoktur;
  arızi aktarım istisnası düzenli kullanım için uygun değildir). Kâhya’nın maskelemesi aktarılan kişisel veriyi en aza indirir ama
  yükümlülüğü kaldırmaz. İstemeyen müşteriler için `KAHYA_AI=kural` seçeneği veri çıkışını tamamen kapatır.
- **Borçlu listesi yayımlanmaz:** duyurular kişi borcu içermez; hatırlatmalar yalnız ilgili kişiye gider. Panoya ya da WhatsApp
  grubuna borçlu listesi asmak KVKK ihlali riski taşır.
- **Barındırma:** sunucuyu Türkiye’deki bir veri merkezinde tutmak (yapay zekâ çağrıları hariç) aktarım konusunu sadeleştirir.

## Ticari elektronik ileti (6563) ve İYS

Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik m.6/2: devam eden abonelik/üyelik/ortaklık durumu ile **tahsilat,
borç hatırlatma, bilgi güncelleme** ve benzeri bildirimler için önceden onay aranmaz; ancak bu iletilerde mal veya hizmet tanıtımı
yapılamaz. Kâhya’nın hatırlatma, arıza bildirimi, toplantı çağrısı ve kesinti duyuruları bu kapsamda tasarlanmıştır (Netgsm
`iysfilter: "0"` = bilgilendirme). Duyurulara reklam ya da üçüncü taraf tanıtımı eklemeyin. Gönderici olarak İYS kaydı gerekip
gerekmediği konusunda kaynaklar çelişkilidir; doğrulayın.

## WhatsApp

Meta kuralı: sakinin son mesajından sonraki 24 saat içinde serbest metin, dışında yalnız **onaylı şablon** gönderilebilir.
Kâhya bu ayrımı otomatik yapar (`integrations/messaging.ts`); şablon adı `WHATSAPP_TEMPLATE_NAME`. Şablonu “Utility” kategorisinde,
tek gövde değişkeniyle açın (ör. “Site yönetiminden bilgilendirme: {{1}}”).

## Ödeme

- Kart ödemeleri PayTR iFrame ile alınır; kart verisi Kâhya’ya hiç gelmez.
- **Aidatı kendi şirket hesabınızda toplamayın:** başkası adına fon toplamak 6493 sayılı Kanun kapsamında ödeme hizmeti lisansı
  gerektirebilir. Her site için site adına açılmış banka hesabı / üye işyeri kullanılması önerilir; hukuki görüş alın.
- Tahsilat kayıtları iptal edilmez, “iptal” durumuna alınır; her işlem denetim günlüğündedir.

## Asansör ve periyodik kontroller

Asansör Periyodik Kontrol Yönetmeliği (RG 04.05.2018): yılda bir, TÜRKAK akrediteli **A tipi muayene kuruluşu** tarafından; etiketler
yeşil (güvenli), mavi (hafif kusurlu), sarı (kusurlu), kırmızı (güvensiz — kullanılamaz). Kusurların giderilme süreleri doğrulanmalıdır.
Diğer periyotlar (yangın tüpü, su deposu, jeneratör…) **önerilen** değerlerdir; mevzuat, belediye ve üretici talimatına göre site
bazında değiştirilebilir.

## Canlıya almadan önce doğrulanacaklar

- [ ] KMK m.37 (7579 sonrası) işletme projesi ve geçici proje usulü; hatırlatma metinleri
- [ ] KMK m.70 toplu yapı çoğunlukları (yönetim planı değişikliği)
- [ ] Standart sözleşme (KVKK m.9) imzası ve Kurum’a bildirim
- [ ] VERBİS kaydı, aydınlatma metni ve yönetim sözleşmesindeki veri sorumlusu/işleyen rolleri
- [ ] İYS kayıt gerekliliği; Netgsm başlık onayı
- [ ] Aidat tahsilat akışı ve 6493 sayılı Kanun değerlendirmesi; PayTR üye işyeri sözleşmesi
- [ ] Asansör etiketleri için giderme süreleri
