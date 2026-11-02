# Enumaracle — Pazar ve Mevzuat Araştırma Notu

**Tarih:** 2 Kasım 2026 · **Amaç:** Türk operatörlerine (Türk Telekom, Turkcell, Vodafone TR) ve yurt dışı operatörlere satış dokümanı için kanıt tabanı.

**Yöntem ve sınırlar:** Web araması ile derlendi. Oturumun ağ kısıtı nedeniyle btk.gov.tr, ofcom.org.uk, arcep.fr, fcc/federalregister.gov, gsma.com ve hiya.com doğrudan açılamadı; bu kurumların metinleri arama özetleri ve ikincil haberler üzerinden aktarıldı. Her maddede durum işareti var:

- **[D]** Doğrulanmış: birincil kaynak veya birbirini tutan birden çok kaynak.
- **[İ]** İddia: tek taraflı (satıcı/operatör) beyan veya tek ikincil kaynak.
- **[?]** Doğrulanamadı: kaynak bulunamadı ya da kaynaklar çelişiyor.

---

## 1. Türkiye mevzuatı

### 1.1 5809 sayılı Elektronik Haberleşme Kanunu ve CLI kuralları

- **[D]** CLI (Arayan Hat Bilgisi) yükümlülükleri 5809 sayılı Kanun'a (md. 6 ve 60) dayanan ikincil mevzuatta: *Yetkilendirme Yönetmeliği* md. 19/1-(y) ve BTK'nın **"Arayan Hat Bilgisi (CLI) Kullanımına İlişkin Usul ve Esaslar"** (Kurul Kararı 2016/DK-YED/211, 12.04.2016). [K1, K2]
- **[D]** Usul ve Esaslar md. 4: CDR ve sinyalleşmede "arayan numara" alanında **işletmecinin aboneye tahsis ettiği numara** kullanılır. Md. 7: SMS/MMS'te "arayan numara" abone numarası, "gösterilen numara" alanında alfanümerik gönderici kimliği bulunur. [K1]
- **[D]** 2018'de e-Call çağrıları için değişiklik (Kurul Kararı 115/10, 12.04.2018). [K3]
- **[D]** BTK CLI ihlallerine idari para cezası uyguluyor: 2024 tarihli kararlar (233/2024 Mobilişim, 234/2024 Gold Telekom; IP santral/BDDK şikâyeti kaynaklı 2024/İK-YED/185). Örnek yaptırım: 2023 net satışının **yüz binde üçü**. [K2, K4, K5]
- **[?]** 2025'te Usul ve Esaslar'da değişiklik yapıldı (Kurul Kararı **398/2025**); içeriği (yurt dışı CLI doğrulama, numara taklidi hükümleri) doğrulanamadı. BTK metni okunmalı. [K6]
- **[?]** Kurul Kararı **412/2025** "İşletmeciler veya adına işlem yapanlar tarafından gerçekleştirilen istenmeyen aramaların önlenmesine yönelik tedbirler" — başlık doğrulandı, içerik okunamadı. [K7]

### 1.2 Yurt dışı kaynaklı numara taklidi: "BTK CLI sistemi"

- **[D]** Turkcell'in önerisi ve BTK koordinasyonuyla, Türk Telekom ve Vodafone TR'nin katılımıyla ülke çapında bir sistem kuruldu: yurt dışından gelip **yerli numara maskesi** taşıyan çağrıda abone dolaşımda (roaming) değilse çağrı sahte sayılıp sonlandırılıyor. Önce yalnızca operatör içi çalışıyordu, sonra tüm şebekelere genişletildi; ek yatırım olmadan operatörlerin kendi kaynaklarıyla yapıldı. [K8, K9, K10, K11]
- **[İ]** Turkcell beyanı: yalnızca **Aralık 2025'te Turkcell şebekesinde ~4 milyon** sahte arama engellendi. Bağımsız doğrulama yok. [K8, K9]
- **[D]** GSMA bu modeli "United Against Scams" kapsamında örnek uygulama seçti; MWC 2026'da (2–5 Mart 2026, Barselona) tanıtıldı. GSMA vaka sayfası mevcut. [K8, K11]
- **[?]** Sistemin dayandığı resmi BTK kararı/tebliğ metni bulunamadı. Satış dokümanında "BTK düzenlemeleri doğrultusunda" ifadesi kullanılmalı; madde numarası verilmemeli.

**Enumaracle için anlamı:** Türkiye'de roaming-kontrollü engelleme zaten var; STIR/SHAKEN benzeri **kriptografik doğrulama, kurumsal kimlik ve markalı arama katmanı yok**. Konumlandırma: mevcut engelleme sisteminin "beyaz liste / kimlik" tamamlayıcısı.

### 1.3 İstenmeyen arama ve SMS tedbirleri (2024 taslak → 2026 uygulama)

- **[D]** Kasım 2024 BTK taslağı: yurt dışından gelen **URL içeren SMS/MMS taşınmaz**; işletmeci, bayi ve acenteler **yalnızca kendi abonelerine** pazarlama araması yapabilir; 1 yıl trafiksiz abonelik iptal. Taslakta hedef yürürlük 01.01.2025 idi. [K12, K13, K14]
- **[D]** Nihai uygulama: haberlere göre **1 Nisan 2026** yürürlük; Bakan Uraloğlu 2 Nisan 2026'da duyurdu. 0850'li ve sabit numaralara kısıtlama; uymayanların **çağrı taşıma/sonlandırma yetkisi BTK kararıyla iptal edilebilir**. TOBB Telekomünikasyon Meclisi karara itiraz etti. [K15, K16, K17, K18]
- **[D]** A2P SMS'te alfanümerik gönderici adı **3–11 karakter**, yalnızca rakamdan oluşamaz; başkasının markası/sloganı başlık olamaz; 0850 ve coğrafi alan kodları toplu SMS başlığı olarak kullanılamaz (ikincil). BTK belgesine göre ~**650 yetkili şirket** ön denetimden geçiyor. 2016'dan beri alfanümerik SMS sonunda 4 haneli işletmeci kodu bulunur. [K19, K20, K21]
- **[D]** Yaptırım emsali: BTK 2023'te "istenmeyen arama" yapan şirketlere toplam **51,5 milyon TL** idari para cezası kesti. [K22]
- **[?]** Hangi hükmün hangi tarihte yürürlüğe girdiği kaynaklarda karışık; Resmî Gazete/BTK metniyle teyit şart.

### 1.4 KVKK (6698) ve verinin yurt içinde tutulması

- **[D]** 7499 sayılı Kanun (RG 12.03.2024) KVKK md. 9'u değiştirdi; **1 Haziran 2024**'te yürürlüğe girdi. Yurt dışı aktarım üç kademede: yeterlilik kararı, uygun güvenceler (standart sözleşme vb.), arızi aktarım. Açık rıza yalnızca arızi aktarımda dayanak (geçiş 01.09.2024'e kadar). Yönetmelik RG 10.07.2024 (32598); Kurum rehberi 2 Ocak 2025. [K23, K24, K25]
- **[D]** Sektörel kural — *Elektronik Haberleşme Sektöründe Kişisel Verilerin İşlenmesi ve Gizliliğin Korunmasına İlişkin Yönetmelik* (RG 04.12.2020, 31324) md. 6: **"Milli güvenlik gerekçesiyle trafik ve konum verilerinin yurt dışına çıkarılmaması esastır."** Mutlak yasak değil, "esas"; istisnalar metinden teyit edilmeli. [K26, K27]
- **Satış argümanı:** CDR/sinyalleşme ve arayan-aranan numara verisi trafik verisidir → platform **Türkiye'de barındırılmalı**; yabancı SaaS rakipler (Hiya, First Orion, TNS, Numeracle) bu noktada dezavantajlı.

### 1.5 İYS ve 6563 sayılı Kanun kapsamında ticari aramalar

- **[D]** 6563 ve *Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik*: SMS, e-posta **ve sesli arama** ile ticari ileti için alıcı onayı şart; onaylar İYS'de tutulur; ticari ileti gönderen gerçek/tüzel kişiler İYS'ye kayıt olur (MERSİS ile). Vatandaş izinlerini iys.org.tr, mobil uygulama, çağrı merkezi ve e-Devlet'ten yönetir. [K28, K29, K30]
- **[D]** İYS 1 Aralık 2020'de devreye girdi (haber). [K31]
- **[?]** İYS'de kayıtlı hizmet sağlayıcı/izin sayısı 2025 — bulunamadı.
- **Ürün bağı:** Kurumsal arayan kimliği doğrulamasında "İYS kayıtlı mı?" kontrolü doğal bir vetting adımı; BTK'nın "yalnızca kendi abonesini arayabilir" kuralıyla birlikte düşünülmeli.

### 1.6 Numara taşınabilirliği (MNP), MRVT ve ENUM

- **[D]** Merkezi Referans Veri Tabanı (**MRVT**): taşınmış numaraların yönlendirme ve işletmeci bilgisini tutan ortak veri tabanı; kurulumu **9 Mayıs 2008**'de tamamlandı. BTK'da herkese açık "taşınmış numara sorgulama" sayfası var. [K32, K33, K34]
- **[D]** BTK verisi: 2025 yılında **17.833.627** mobil numara taşıma; hizmet başından 2025 sonuna toplam **210.709.015** (mobil 207.834.045, sabit 2.874.970). [K35, K36]
- **[?]** Türkiye'de kamuya açık/ticari **ENUM** (e164.arpa benzeri) altyapısı bulunamadı. Pazarda "MNP ENUM" sorguları NAPTR üzerinden MCC/MNC döndürüyor; bu, uluslararası toplayıcıların genel uygulaması. [K37]
- **Ürün bağı:** Doğru operatör/yönlendirme için MRVT erişimi (işletmeci üzerinden) gerekecek; Enumaracle'ın ENUM katmanı operatör içi çalışmalı.

---

## 2. Dünya standartları ve zorunluluklar (2025–2026)

| Ülke | Çerçeve | Durum (2025–26) |
|---|---|---|
| **ABD** | TRACED Act (2019) → FCC STIR/SHAKEN | **[D]** 6. Karar (Mart 2023): tüm sağlayıcılar (non-gateway ara taşıyıcılar dâhil) Robocall Mitigation Database'e (RMD) kayıt; kayıtsız sağlayıcıdan gelen trafik engellenir; ceza çağrı başına **2.500–23.727 $**. **[D]** 8. Karar FCC 24-120 (Kasım 2024): üçüncü tarafa imzalatma serbest, sertifika sağlayıcının kendisine ait kalır; **[İ]** yürürlük 18 Eylül 2025 (ikincil). **[D]** 25 Ağustos 2025: **1.200+ sağlayıcı** RMD'den çıkarıldı; 2 Eylül 2026: 14 şirket daha. **[D]** Nisan 2025: Non-IP (TDM) doğrulama için NOI (ATIS-1000095); Temmuz 2026: "Know-Your-Upstream-Provider" ve STIR/SHAKEN güçlendirme **önerisi** (nihai değil). [K38–K44] |
| **Kanada** | CRTC 2019-402, 2021-123 | **[D]** 30 Kasım 2021'den itibaren STIR/SHAKEN hizmet sunma şartı; IP kısımlarında zorunlu; 6 aylık durum raporları sürüyor (2024 yazısı); sertifika yönetimi CSTGA. **[?]** 2025 değişikliği bulunamadı. [K45, K46, K47] |
| **Fransa** | Loi Naegelen (24.07.2020) → **MAN** | **[D]** MAN 1 Ekim 2024'te zorunlu oldu (ikincil kaynaklar; Arcep sayfası açılamadı). **[D]** 1 Ocak 2026: yurt dışından gelen ve doğrulanamayan **Fransız mobil numaraları "gizli numara" olarak** gösteriliyor. **[D]** 29 Ocak 2026: Arcep tüm operatörlere (Orange, SFR, Free, Bouygues) soruşturma açtı; "J'alerte l'Arcep" şikâyetleri **531 (2023) → 19.000+ (2025)**. Yaptırım/etkinlik raporu yok. [K48–K53] |
| **İngiltere** | Ofcom CLI Guidance | **[D]** Ocak 2024: Ofcom tam CLI kimlik doğrulamasından **vazgeçti** (yurt dışı çağrılar doğrulanamıyor, maliyetli). **[D]** Temmuz 2025 istişare, **15 Temmuz 2026 nihai bildirim**: yurt dışından +447 (UK mobil) gösteren çağrılarda ilk UK sağlayıcı CLI'yi değiştirir; dolaşım istisnası. **[İ]** Uygulama 15 Temmuz 2027, numara engellenmez gizlenir (tek hukuk bürosu kaynağı). **[D]** Şubat 2026: UK kullanıcılarının %37'si son 3 ayda şüpheli arama aldı. [K54–K58] |
| **AB / Avrupa** | ECC Report 338 (Haziran 2022); ulusal önlemler | **[D]** Cullen/BEREC 2025: incelenen 15 ülkenin 12'si önlem aldı, çoğu 2024–25. **İtalya** AGCOM 106/25/CONS: 19 Ağustos 2025 sabit, 19 Kasım 2025 mobil numara taklidi engeli; sabit aşamada ~43 M, mobilde ilk 12 günde **49,3 M** çağrı engellendi; **[İ]** 2026 ilk 8 ayda 191 M. **İspanya** Order TDF/149/2025 (12 Şubat 2025), 7 Haziran 2025 yürürlük; **[İ]** 50 M+ engellendi. **[?]** İsveç PTS Mart 2025 mobil CLI engeli (tek kaynak). **[?]** Europol Kasım 2025 koordineli çağrı; Digital Networks Act bağlantısı bulunamadı. [K59–K68] |

**Çıkarım:** Avrupa'da baskın model Türkiye'dekiyle aynı — *yurt dışı kaynaklı yerli CLI'yi engelle/gizle*. Kriptografik imza (STIR/SHAKEN) yalnızca ABD, Kanada ve Fransa'da zorunlu. Fransa deneyimi, imzanın tek başına yetmediğini ve **ekosistem denetimi + kimlik tesisi** gerektiğini gösteriyor → Enumaracle'ın "kimlik + itibar + imza" paketi için argüman.

---

## 3. Rakipler ve pazar

| Şirket / Program | Ürün | Kamuya açık fiyat / model | Not |
|---|---|---|---|
| **Numeracle** (ABD) | Verified Identity, Smart Branding (numara başına kampanya aç/kapa), **sVIP** (BCID + STIR/SHAKEN RCD), Entity Identity Management, KYCaaS, Number Reputation Management | **[D]** Fiyat yayımlanmıyor; "işletme büyüklüğü, tüzel kişi ve numara sayısı, seçilen hizmet"e göre özel. | **[D]** CTIA BCID'nin ilk Onboarding/Vetting ajanlarından; ISO 27001:2022 (Şubat 2026); **[İ]** 28 M $ büyüme turu (tarih teyitsiz); GLEIF (LEI) üyesi. [K69–K74] |
| **Hiya** (ABD) | Hiya Connect Branded Call, Caller Reputation ("kredi skoru", Eylül 2025) | **[D]** Kendi sayfası: **29 $/ay (250 arama), 99 $/ay (1.000), 275 $/ay (3.000)**, 25 $ kurulum, ek arama **0,13 $**; UK: £39/£149/£399, £0,17. **[?]** Üçüncü taraf izleyici farklı tarife ve 12 Ekim 2026 fiyat revizyonu bildiriyor. | **[İ]** "%30+ ortalama cevaplanma artışı"; Forrester TEI (Hiya siparişli): %677 ROI, 14,1 M $ NPV. [K75–K79] |
| **First Orion** (ABD) | INFORM (marka + logo), ENGAGE (arama nedeni) | **[İ]** İzleyici: 31 $/250, 52 $/500, 104 $/1.000, 240 $/2.500; kurumsal kullanım **0,04 $**/arama. TrustRadius "fiyat yok" diyor. | **[İ]** Vaka: üniversite +%16, teledişçilik +%34, perakende +%39, finans +%26; bazı sigorta vakalarında cevaplanma **düştü**, dönüşüm arttı. [K80–K83] |
| **TNS** (ABD) | Call Guardian (operatör analitiği), Enterprise Branded Calling | **[?]** Fiyat yok; 2024 ürün sayfasında "per impression" ibaresi (parça). | **[D]** Verizon, AT&T, T-Mobile, UScellular (Mart 2025) erişimi; **[İ]** 5.800+ işletme, 1,8 M numara; tek müşteride +%133 cevaplanma (2022). [K84–K87] |
| **TransUnion / Neustar** | TruContact Branded Call Display | **[?]** Fiyat yok. | **[D]** 6 Şubat 2025 AT&T şebeke içi "arama nedeni" (Android, uygulamasız); Haziran 2025 TELUS (Kanada); **[İ]** 280 M cihaz, "%56'ya kadar" cevaplanma artışı, 850+ taşıyıcı. [K88–K91] |
| **CTIA BCID** | Sektör programı: Onboarding Agent → Vetting Agent → Signing Agent (TransNexus vb.) → OSP | **[İ]** Ekosisteme katılım ücretsiz (Kasım 2024 sunumu). | **[D]** T-Mobile 1 Ekim 2024'ten beri canlı; Verizon Eylül 2025 sözleşme, gösterim başladı; **[?]** AT&T gösterim durumu teyitsiz. [K92–K96] |
| **Truecaller / Getcontact** | Tüketici uygulamaları | Freemium | **[D]** Getcontact'ın kurucusu Türk; **[İ]** 20 M+ aylık aktif kullanıcı (tarihsiz); BTK 25 uygulama incelemesine dâhil etti, mağazalardan geçici kaldırıldı. [K97–K100] |

**Türk operatörleri:** **[?]** Turkcell, Türk Telekom veya Vodafone TR'nin 2025–26'da duyurulmuş bir **markalı arama / kurumsal arayan etiketi / şebeke içi spam etiketleme** ürünü bulunamadı. Mevcut hizmetler eski tip ücretli "kim aradı / numara sorgulama" (Vodafone 7048, Turkcell 2222, Türk Telekom 11855 — 2019 fiyatları). [K101, K102] → **Pazarda boşluk.**

---

## 4. Satış argümanları için rakamlar

**Küresel spam/dolandırıcılık**
- **[D]** Truecaller 2025: dünyada **68 milyar+** spam/dolandırıcılık araması (2021: 37,8 milyar); Endonezya'da bilinmeyen aramaların %79'u spam. **[?]** Türkiye'nin 2025 sıralaması bulunamadı (ilk 5'te değil). [K103, K104]
- **[D]** Hiya Q1 2025: **12,5 milyar** şüpheli spam, günde 137 M; Q4 2024 dağılımı: %22 rahatsız edici, %9 dolandırıcılık. **[?]** Türkiye oranı tam raporda. [K105]
- **[D]** Hiya *State of the Call 2025* (262,8 milyar çağrı, ~12.000 tüketici): kişi başı haftada **8 istenmeyen arama** (2024: 4,8); çalışanların %28'i aramalarının spam etiketlendiğini, %26'sı markasının dolandırıcılarca kullanıldığını bildirdi; bilinmeyen numaradan aramaların **%80'i** cevaplanmıyor. 2026 raporu: **%86**. [K106, K107, K108]

**Markalı arama etkisi (tamamı satıcı beyanı — [İ])**
- Hiya "%30+"; TransUnion "%56'ya kadar"; Neustar "arama nedeni bilinince 2 kata kadar"; TNS +%133 (tek vaka); First Orion +%16 ile +%39 arası, kimi vakada düşüş. Bağımsız 2024–25 çalışması **yok**; dokümanda "satıcı vakalarında %16–56 aralığı" denmeli. [K77, K81, K86, K90, K109]

**Türkiye**
- **[İ]** Turkcell: Aralık 2025'te ~4 M sahte arama (tek operatör, tek ay). [K8]
- **[D]** BTK pazar verileri: mobil operatör şikâyetleri 2025 Q3 **35.999** (rekor), Q4 34.368; İSS Q4 41.516; ilk yarı toplam 81.271 → 102.712 (yıllar belirsiz). **[?]** "İstenmeyen arama" kategorisi ayrı verilmiyor. [K110, K111]
- **[D]** 2023: istenmeyen arama cezası 51,5 M TL. [K22]
- **[?]** Adalet Bakanlığı verisine atıf: dolandırıcılık dosyaları 460 bin (2020) → 2,3 M (2024); telefon/sosyal mühendislik ~%10 — tek haber, teyitsiz. **[?]** 2025 telefon dolandırıcılığı toplam zarar (TL) bulunamadı. [K112, K113]
- **[D]** Türkiye mobilde Avrupa'nın en çok konuşan ülkesi: 2025 Q2'de **81,8 milyar dk**, kişi başı ~493 dk/ay; 2025'te 17,8 M numara taşıma. [K114, K115, K35]

**Avrupa emsalleri (operatöre "regülatör baskısı" argümanı)**
- İtalya: 49,3 M mobil taklit çağrı 12 günde; İspanya 50 M+; Fransa şikâyet 36 kat artış; UK %37 şüpheli arama. [K61, K64, K51, K58]

---

## 5. Satış dokümanı için çıkarımlar

1. Türkiye'de **numara taklidi engelleme var, kimlik doğrulama yok**; Enumaracle "kimlik + itibar + markalı arama + STIR/SHAKEN hazırlığı" olarak konumlanmalı.
2. **Veri yerelleştirme** (2020 Yönetmelik md. 6) yabancı SaaS'a karşı en güçlü ayırıcı; on-prem/Türkiye bulutu şart.
3. BTK'nın 2026 tedbirleri (yalnızca kendi abonesini arama, 650 yetkili şirket, yetki iptali) operatöre **uyum maliyeti** yüklüyor → "uyumu otomatikleştiren platform" mesajı.
4. Fiyat kıyası için Hiya (0,13 $/arama, 29–275 $/ay) ve First Orion (0,04 $ kurumsal) referans; Numeracle/TNS özel fiyat. Türkiye için arama başına değil, **operatör platform lisansı + kurumsal müşteri başına** model öneriliyor (bu bölümdeki rakamlar ABD içindir).
5. Rakamlardan "[D]" olanlar doğrudan kullanılabilir; "[İ]" olanlar "satıcı beyanı" notuyla; "[?]" olanlar BTK/Ofcom/Arcep metni okunmadan kullanılmamalı.

---

## Kaynaklar

**Türkiye mevzuatı**
- K1 https://www.btk.gov.tr/uploads/communiques/arayan-hat-bilgisi-kullanimina-iliskin-usul-ve-esaslar.pdf
- K2 https://www.lexpera.com.tr/mevzuat/kurul-kararlari/cli-ihlali-mobilisim-2024-ik-yed-233
- K3 https://www.btk.gov.tr/uploads/boarddecisions/arayan-hat-bilgisi-cli-kullanimina-iliskin-usul-ve-esaslar-da-degisiklik-e-call-cagrilari/115-10-arayan-hat-bilgisi-cli-kullanimina-ilis-usul-ve-esaslar-da-deg-e-call-cagrilari-12-04-2018.pdf
- K4 https://btk.gov.tr/uploads/boarddecisions/cli-ihlali-gold-telekom/234-2024-web.pdf
- K5 https://www.lexpera.com.tr/mevzuat/kurul-kararlari/cli-ihlali-bddk-sikayeti-ip-santral-2024-ik-yed-185
- K6 https://www.btk.gov.tr/uploads/boarddecisions/arayan-hat-bilgisi-cli-kullanimina-iliskin-usul-ve-esaslarda-degisiklik/398-2025-web.pdf
- K7 https://www.btk.gov.tr/uploads/boarddecisions/isletmeciler-veya-adina-islem-yapanlar-tarafindan-gerceklestirilen-istenmeye-aramalarin-onlenmesine-yonelik-tedbirler/412-2025-web.pdf
- K8 https://www.chip.com.tr/haber/turkcellin-sahte-arama-engelleme-modeli-gsma-tarafindan-ornek-uygulama-secildi_178284.html
- K9 https://www.dha.com.tr/ekonomi/gsma-turkcellin-modelini-ornek-uygulama-olarak-secti-2830222
- K10 https://www.ensonhaber.com/ekonomi/gsma-turkcellin-modelini-ornek-uygulama-olarak-secti
- K11 https://www.gsma.com/solutions-and-impact/technologies/security/scams/gsma_study/turkcell-tackling-cli-spoofing-scams/
- K12 https://www.takvim.com.tr/guncel/2024/11/29/telefon-dolandiriciligina-son-btkdan-yeni-duzenleme-1-ocakta-yururluge-giriyor
- K13 https://www.donanimhaber.com/btk-dan-istenmeyen-sms-ve-aramalara-son-verecek-duzenleme--184685
- K14 https://www.webtekno.com/btk-istenmeyen-mesaj-aramalar-icin-yeni-duzenleme-h152571.html
- K15 https://www.dailysabah.com/turkiye/turkiye-blocks-unwanted-calls-sms-under-new-regulations/news
- K16 https://www.gzt.com/teknoloji/istenmeyen-aramalara-ve-dolandirici-smslerine-btk-kalkani-telefonlarda-yeni-donem-resmen-basladi-4224591
- K17 https://www.sozcu.com.tr/tobb-btk-nin-istenmeyen-aramalara-ve-sms-kararina-itiraz-etti-p329114
- K18 https://sabah.com.tr/ekonomi/telefona-gelen-yasadisi-kumar-linkine-onlem-7496238
- K19 https://www.teknoblog.com/btk-850-li-sms-spam-arama-ve-linkli-mesajlara-sinir-koydu/
- K20 https://www.btk.gov.tr/s3/web-btk-site/7708c26c-5161-4919-8b3d-daa31d4ac8fb/2026/03/c1c77376-2fc0-4534-8d4c-6da89067fda1.pdf
- K21 https://shiftdelete.net/0850li-sms-ve-aramalar-gercekten-engellendi-mi
- K22 https://www.ntv.com.tr/turkiye/btk-istenmeyen-arama-yapan-sirketlere-51-5-milyon-lira-ceza-verdi,XKPToKyWEEi09wkByovN4w
- K23 https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verilerin-korunmasi-kanununda-neler-degisti
- K24 https://www.ey.com/tr_tr/insights/law/kvkk-degisikliginin-yurt-disi-veri-aktarimina-etkisi
- K25 https://cottgroup.com/tr/blog/kvkk-gdpr/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari
- K26 https://alomaliye.com/2020/12/04/elektronik-haberlesme-sektoru-kisisel-verilerin-islenmesi/
- K27 https://www.lexpera.com.tr/mevzuat/yonetmelikler/elektronik-haberlesme-sektorunde-kisisel-verilerin-islenmesi-ve-gizliligin-korunmasina-iliskin
- K28 https://ticaret.gov.tr/ic-ticaret/ticari-elektronik-iletiler/ileti-yonetim-sistemi-iys
- K29 https://hukukcularevi.com/ticari-elektronik-ileti-iys-izin-6563-reklam/
- K30 https://www.alomaliye.com/2021/01/07/istenmeyen-sms-e-posta-ve-sesli-aramalar/
- K31 https://www.haberturk.com/ileti-yonetim-sistemi-1-aralik-ta-yururluge-giriyor-haberler-2874774-teknoloji
- K32 https://www.lexpera.com.tr/mevzuat/yonetmelikler/numara-tasinabilirligi-yonetmeligi-3
- K33 https://www.emo.org.tr/ekler/a6d6b468064abd2_ek.pdf?dergi=457
- K34 https://btk.gov.tr/en/ported-number-query
- K35 https://www.dunya.com/gundem/btk-verileri-acikladi-numara-tasima-nufusun-24-katina-ulasti-haberi-822499
- K36 https://www.yatirimx.com.tr/ekonomi/numara-tasimada-rekor-207-milyon-mobil-hat-tasindi/19719
- K37 https://developers.horisen.com/en/mnp-supplier-enum-api-v2

**Dünya standartları**
- K38 https://www.tlp.law/2023/03/22/fcc-extends-stir-shaken-to-intermediate-providers-and-expands-robocall-mitigation-requirements/
- K39 https://docs.fcc.gov/public/attachments/FCC-24-120A1.pdf
- K40 https://docs.fcc.gov/public/attachments/DOC-407144A1.pdf
- K41 https://viirtue.com/stir-shaken-compliance-requirements-2026-for-msps-and-voice-resellers/
- K42 https://docs.fcc.gov/public/attachments/DOC-410645A1.pdf
- K43 https://docs.fcc.gov/public/attachments/DOC-422744A1.pdf
- K44 https://www.federalregister.gov/documents/2026/07/09/2026-13874/enhancing-know-your-upstream-provider-requirements-and-strengthening-stirshaken-call-authentication
- K45 https://crtc.gc.ca/eng/archive/2019/2019-402.htm
- K46 https://mondaq.com/canada/telecoms-mobile-cable-communications/1098214/crtc-mandates-implementation-of-stirshaken-by-all-telecommunications-service-providers
- K47 https://crtc.gc.ca/eng/archive/2024/lt240321.htm
- K48 https://www.arcep.fr/mes-demarches-et-services/acteurs-regules/operateurs-telecoms/fiches-pratiques/authentification-numeros-telephone-fixe-ou-mobile-que-faire-en-tant-que-operateur-telephonique.html
- K49 https://www.neozone.org/societe/man-la-nouvelle-invention-qui-pourrait-bien-mettre-fin-aux-arnaques-telephoniques-en-france
- K50 https://transnexus.com/blog/2024/shaken-in-france
- K51 https://siecledigital.fr/2026/02/02/appels-frauduleux-larcep-met-les-operateurs-sous-pression/
- K52 https://www.degrouptest.com/actualite/protection-des-consommateurs-et-lutte-contre-les-appels-frauduleux-l-arcep-ouvre-une-enquete
- K53 https://siecledigital.fr/2025/12/04/arnaques-telephoniques-pourquoi-vous-verrez-beaucoup-plus-dappels-masques-des-2026/
- K54 https://www.ofcom.org.uk/__data/assets/pdf_file/0036/276687/01-24-cli-authentication-update.pdf
- K55 https://www.ispreview.co.uk/index.php/2025/07/ofcom-uk-to-restrict-number-spoofing-to-tackle-scam-calls-from-abroad.html
- K56 https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/tackling-scam-calls-from-abroad/statement-tackling-scam-calls-from-abroad.pdf
- K57 https://bratby.law/calling-line-identification/
- K58 https://www.ofcom.org.uk/phones-and-broadband/scam-calls-and-messages/cracking-down-on-scam-calls-from-abroad
- K59 https://docdb.cept.org/download/4026
- K60 https://www.cullen-international.com/news/2025/05/-National-measures-against-spoofing-practices-in-Europe.html
- K61 https://en.ilsole24ore.com/art/harassing-phone-calls-19-november-also-blocked-fake-mobile-network-calls-AHd0LlfD
- K62 https://mobileecosystemforum.com/2025/07/29/italys-new-agcom-regulation-a-turning-point-in-the-fight-against-telemarketing-and-spoofing/
- K63 https://za.lapresse.it/economy-za/2025/12/29/telemarketing-agcom-anti-spoofing-system-blocked-49-million-calls
- K64 https://www.theolivepress.es/spain-news/2025/08/19/50-million-spam-phone-calls-and-texts-blocked-since-march-under-new-laws-in-spain
- K65 https://www.twobirds.com/en/insights/2025/new-spanish-regulation-against-scam-calls-and-messages
- K66 https://mobileecosystemforum.com/2025/06/11/spain-takes-action-against-phone-scams-new-rules-coming-into-force/
- K67 https://pts.se/en/internet-and-telephony/sakerhet-och-skydd-av-uppgifter/telephone-scams-spoofing/
- K68 https://www.itu.int/en/ITU-T/Workshops-and-Seminars/2025/1117/Documents/Laurence%20Nivot.pdf

**Rakipler**
- K69 https://www.softwareadvice.com/product/528610-Numeracle/
- K70 https://www.newswire.com/news/numeracle-enables-service-providers-to-deliver-fully-branded-22642266
- K71 https://www.newswire.com/news/numeracle-expands-branded-calling-reach-as-verizon-goes-live-in-the-22670353
- K72 https://www.newswire.com/news/numeracle-achieves-iso-iec-27001-2022-certification-strengthening-global
- K73 https://fintech.global/?p=262030
- K74 https://cfotech.news/story/numeracle-launches-corporate-kycaas-identity-checks
- K75 https://www.hiya.com/products/connect/pricing
- K76 https://en-gb.hiya.com/products/connect/pricing
- K77 https://hiya.com/press-releases/hiya-connect-delivers-677-roi-14-1m-npv-according-to-total-economic-impact-study
- K78 https://pricingsaas.com/companies/hiya.connect
- K79 https://www.businesswire.com/news/home/20250930624483/en
- K80 https://pricingsaas.com/companies/firstorion
- K81 https://firstorion.com/case-studies/2023-branded-calling-trends-report
- K82 https://www.casestudies.com/company/first-orion/case-study/teledentistry-company-boosts-contact-rate-34-with-first-orion
- K83 https://firstorion.com/insurance-case-study/
- K84 https://www.businesswire.com/news/home/20250318182865/en/TNS-Expands-Branded-Calling-Solutions-at-2025-Channel-Partners-Conference-Expo
- K85 https://tnsi.com/wp-content/uploads/2026/07/CM_ProductSheet_TNS-Enterprise-Branded-Calling_July2026.pdf
- K86 https://tnsi.com/resource/com/enterprise-branded-calling-increases-financial-services-call-answer-rate-use-case/
- K87 https://business.mammothtimes.com/mammothtimes/article/bizwire-2025-1-16-new-tns-ebook-highlights-branded-calling-growth-in-2024
- K88 https://www.itiger.com/news/2509149273
- K89 https://newsroom.transunion.ca/telus-and-transunion-launch-branded-call-display-in-canada-with-business-name-logo-and-call-reason/
- K90 https://aws.amazon.com/marketplace/pp/prodview-lw7h4ycm7suta
- K91 https://www.transunion.com/lp/trucontact-branded-call-display
- K92 https://transnexus.com/blog/2025/branded-calling-new-business-opportunity/
- K93 https://transnexus.com/blog/2025/verizon-live-bcid/
- K94 https://www.lightreading.com/5g/verizon-to-roll-out-branded-calling-id-on-wireless-network
- K95 https://transnexus.com/assets/pdfs/branded-calling-new-business-opportunity-slides-5f1c7be54b.pdf
- K96 https://www.infobip.com/docs/voice-and-video/voice-trust/branded-calling-id
- K97 https://www.cnnturk.com/teknoloji/neredeyse-bir-cilginliga-donen-getcontactin-arkasindan-bir-turk-cikti-769756
- K98 https://www.sozcu.com.tr/apple-ve-googledan-getcontact-karari-iste-getcontact-numara-silme-yontemi-wp2318054
- K99 https://www.cnnturk.com/bilim-teknoloji/internet/getcontact-tehlikeli-mi-verdiginiz-izinlere-dikkat
- K100 https://shiftdelete.net/getcontact-google-play-app-store-kaldirildi
- K101 https://www.yeniakit.com.tr/haber/beni-kim-aramis-nasil-ogrenebilirim-turk-telekom-vodafone-turkcell-600912.html
- K102 https://www.takvim.com.tr/yasam/2021/07/08/telefon-numarasi-kime-ait-turkcell-vodafone-turk-telekom-beni-kim-aramis-ogrenme-bilinmeyen-numara-sorgulama

**İstatistikler**
- K103 https://techeconomy.ng/truecaller-said-it-identified-more-than-68-billion-spam-and-fraud-calls-in-2025/
- K104 https://news.cision.com/truecaller-ab/r/the-machine-era-of-spam-calls--the-ten-most-spammed-countries-in-the-world,c4344287
- K105 https://en-gb.hiya.com/global-call-threat-report
- K106 https://www.hendryadrian.com/?p=93309
- K107 https://blog.hiya.com/spam-vs-fraud-15-varieties-of-unwanted-calls
- K108 https://betanews.com/2025/02/25/deepfake-fraud-calls-target-consumers-cash
- K109 https://techhq.com/2023/05/branded-calling-solutions-improve-customer-answer-rates/
- K110 https://www.donanimhaber.com/btk-raporuna-gore-mobil-operator-sikayetleri-ikiye-katlandi--204196
- K111 https://www.iscihaber.net/teknoloji/btk-raporu-yayimlandi-mobil-operator-sikayetleri-35-bin-sinirina-dayandi/219961
- K112 https://www.iscihaber.net/gundem/dolandiricilikta-yeni-cag-kapidan-bankaya-ekrandan-sokaklara-turkiyenin-tuzak-haritasi/174145
- K113 https://www.turkgun.com/gundem/turkiye-genelinde-dev-dolandiricilik-operasyonu-180-gozalti-219-milyar-lira-incelemede/367461
- K114 https://www.milletnews.com/turkiye/turkiye-leads-europe-in-mobile-call-duration-with-818-billion-minutes-in-q2-2025
- K115 https://www.hurriyetdailynews.com/turkiye-tops-europe-in-mobile-phone-usage-with-493-minutes-per-month-214619
