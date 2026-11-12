# İş fikirleri: 51 depodan çıkan işler ve kime satılacakları

> [Repo Atlası](../README.md)'nın **meyve** katmanı ([ağaç](../AGAC.md)): 51 deponun her birinden en az bir iş fikri,
> fikrin **kime** satılacağı, nasıl para kazanacağı ve riskleri. Altı fikir çalışan MVP olarak kodlandı.

**İçindekiler:** [1. Fikirler nasıl çıkarıldı](#1-fikirler-nasıl-çıkarıldı) ·
[2. Değerlendirme ölçütleri](#2-değerlendirme-ölçütleri) · [3. En güçlü 10 fikir](#3-en-güçlü-10-fikir) ·
[4. Kodlanan MVP'ler](#4-kodlanan-mvpler) · [5. Tam katalog](#5-tam-katalog-d01d10) ·
[6. Kime göre dizin](#6-kime-göre-dizin) · [7. Dürüst notlar ve sınırlar](#7-dürüst-notlar-ve-sınırlar)

## 1. Fikirler nasıl çıkarıldı

Her depo için dört soru soruldu:

1. **Depo ne kabiliyet veriyor?** markitdown her belgeyi Markdown'a çevirir; bir "awesome" listesi seçilmiş bilgi
   verir; 996.ICU bir toplumsal hareketin ve lisansla aktivizmin örneğidir.
2. **Türkiye'de bu kabiliyetle küçülen, düzenli ve parası ödenen bir dert kimde var?** Cevap her kartta bir segment ve
   somut bir persona olarak yazıldı.
3. **Yasal ve etik bir yol var mı?** Deponun lisansı (MIT, GPL, AGPL, CC BY-NC, "yalnızca kişisel kullanım"…), KVKK
   (6698 sayılı Kanun), 5846 sayılı FSEK, sitelerin kullanım koşulları.
4. **Küçük sermayeyle 90 gün içinde ilk gelir mümkün mü?**

Depo ile fikir arasındaki ilişki üç türden biridir:

| İlişki               | Anlamı                                                                                                                        | Örnek                                                            | Bu katalogda (kartın başlığındaki depoya göre)                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Bileşen**          | Depo ürünün çalışan parçasıdır                                                                                                | markitdown, yt-dlp, Firecrawl, n8n, Ollama                       | 20 kart: F01, F03, F04, F06, F07, F08, F11, F14, F16–F19, F21–F24, F26–F28, F30 |
| **Bilgi kaynağı**    | Depodaki seçilmiş bilgi, biçim ya da kural bir hizmete dönüşür; lisansa göre ya yalnızca bağlantı verilir ya atıfla uyarlanır | awesome listeleri, OSSU, system-design-primer, `SKILL.md` biçimi | 24 kart: F02, F05, F09, F12, F13, F20, F25, F31–F39, F42–F49                    |
| **Konu ya da ilham** | Deponun popülerliği bir talebin ya da riskin göstergesidir ya da fikre model olur; içeriğinden ve kodundan yararlanılmaz      | Microsoft-Activation-Scripts → yazılım lisans uyumu hizmeti      | 7 kart: F10, F15, F29, F40, F41, F50, F51                                       |

Kartın öteki depoları başka türde olabilir: F02'de hedef sürüm vuejs/core, F25'te (MVP 04) Ollama, F51'de (MVP 06) Vue
ve Bootstrap bileşendir.

## 2. Değerlendirme ölçütleri

Her fikir altı ölçütte 1–5 puan alır. **Yüksek puan her zaman iyidir**: zorluk ve risk ölçütleri ters çevrildi.
En yüksek toplam 30'dur.

| Ölçüt       | Soru                                                          | 1 puan                                            | 5 puan                                         |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **Pazar**   | Türkiye'de ulaşılabilir ve ödeme yapacak müşteri var mı?      | Belirsiz, küçük ya da ödeme isteği düşük          | Çok sayıda, sorunu bilen ve ödeyen müşteri     |
| **Hız**     | İlk gelire kadar ne kadar sürer?                              | 12 aydan uzun                                     | 1 ay içinde                                    |
| **Sermaye** | Ne kadar başlangıç parası gerekir?                            | Donanım, ekip, uzun geliştirme (1 milyon TL üstü) | Bir dizüstü bilgisayar ve birkaç haftalık emek |
| **Teknik**  | Bir ya da iki kişi kurabilir mi?                              | Araştırma düzeyinde zor                           | Bilinen tekniklerle kurulur                    |
| **Savunma** | Taklit edilmesi ne kadar zor?                                 | Herkes bir haftada kopyalar                       | Yerel uzmanlık, veri, satış kanalı ya da güven |
| **Hukuk**   | Lisans, KVKK, telif ve sektör kuralları açısından güvenli mi? | Yüksek ya da belirsiz risk                        | Düşük ve net risk                              |

Eşitlikte sırasıyla pazar, savunma, hız ve hukuk puanı yüksek olan öne alınır. Puanlar bizim yargımızdır; her fikir ilk
müşteri görüşmeleriyle yeniden puanlanmalıdır. Kartlardaki fiyatlar 2026 sonu için **örnek fiyatlardır (varsayım)**.

## 3. En güçlü 10 fikir

| Sıra | Fikir                                                           | Kime                                                                                                                   | Pazar | Hız | Sermaye | Teknik | Savunma | Hukuk | Toplam | Neden üstte                                                                                                                                                               |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----- | --- | ------- | ------ | ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [İhale şartname analizcisi](#f17) (MVP 01)                      | Kamu ihalelerine düzenli teklif veren KOBİ tedarikçi ve müteahhitler, ihale danışmanları                               | 5     | 4   | 5       | 4      | 4       | 4     | **26** | Eksik belge teklifi eletir: acı somut ve tekrarlı; yerel mevzuat bilgisi ve "belge dışarı çıkmaz" vaadi taklidi zorlaştırır                                               |
| 2    | [E-posta teslim edilebilirlik ve DNS hizmeti](#f12)             | E-postası spam'e düşen KOBİ'ler                                                                                        | 4     | 5   | 5       | 4      | 2       | 5     | **25** | Ertesi gün faturalanabilir, riski düşük; büyük e-posta sağlayıcılarının kimlik doğrulama kuralları talebi artırmış olabilir (varsayım)                                    |
| 3    | [Kendi sunucusunda n8n otomasyon ajansı](#f19)                  | Mali müşavirlik büroları, e-ticaret firmaları, klinikler                                                               | 5     | 4   | 5       | 4      | 3       | 3     | **24** | Her ofiste tekrarlayan iş var; veri yurt içinde kalır; n8n müşterinin sunucusunda, onun iç işi için çalışır (lisans sınırı); hızlı gelir                                  |
| 4    | [Rakip fiyat ve kampanya radarı](#f18) (MVP 03)                 | Kendi e-ticaret sitesinde satan KOBİ'ler (rakiplerin kendi sitelerini izler), dijital ajanslar                         | 5     | 5   | 5       | 4      | 2       | 3     | **24** | Değeri ölçülebilir (fiyat farkı), abonelikle satılır; robots.txt/kullanım koşulları ve taklit kolaylığı zayıf yanı                                                        |
| 5    | [Kampanya dönemi yük hazırlık denetimi](#f42)                   | Kasım indirimlerinde zorlanan orta ölçekli e-ticaret siteleri                                                          | 4     | 4   | 5       | 3      | 3       | 5     | **24** | Tarihi belli bir acı; sabit fiyatlı, uzmanlık isteyen bir hizmet                                                                                                          |
| 6    | [Yazılım lisans uyum denetimi](#f15)                            | 20–250 çalışanlı mimarlık ve mühendislik ofisleri, ajanslar, üreticiler                                                | 4     | 4   | 5       | 4      | 3       | 4     | **24** | Lisans denetimi riski gerçek ve pahalı; MAS'ın popülerliği lisans maliyeti baskısına işaret eder (varsayım); iş yasal tarafta durur                                       |
| 7    | [AI kodlama ajanı kurulum paketi](#f31) (MVP 05)                | 10–50 kişilik yazılım ajansları, 5–50 kişilik ürün ekipleri, serbest danışmanlar                                       | 4     | 5   | 5       | 4      | 2       | 4     | **24** | Ekipler ajan kullanıyor ama ortak düzen ve güvenlik yok; araçlar hızla değiştiği için savunması zayıf                                                                     |
| 8    | [Esnaf mesaj ve randevu asistanı](#f25) (MVP 04)                | Randevuyla çalışan mikro işletmeler: önce 1–3 koltuklu berber ve kuaför, sonra diş muayenehanesi, veteriner, halı saha | 5     | 4   | 5       | 3      | 3       | 3     | **23** | Çok sayıda müşteri, kaçan randevu ölçülebilir; sağlık verisi (KVKK) dikkat ister; MVP yalnız Telegram'da, esnafın müşterisi çoğunlukla WhatsApp'ta (gözlem, doğrulanmadı) |
| 9    | ["Veri yurt içinde" açık kaynak ofis paketi](#f46)              | 10–50 kişilik muhasebe ve hukuk büroları                                                                               | 4     | 4   | 4       | 4      | 3       | 4     | **23** | KVKK ve döviz bazlı abonelik baskısı; yönetilen hizmet tekrar eden gelir getirir                                                                                          |
| 10   | [Fazla mesai ve çalışma süresi uyum hesaplayıcı](#f51) (MVP 06) | Ödeyen: mali müşavirler, KOBİ İK/bordro, iş hukuku büroları, sendikalar; ücretsiz: çalışanlar                          | 4     | 4   | 5       | 4      | 2       | 4     | **23** | 4857 sayılı Kanun'daki sınırlar herkesi ilgilendirir; ücretsiz araç güven kazandırır, gelir profesyonel paketlerden gelir                                                 |

F42 ile F15 toplamda, pazarda, savunmada ve hızda eşittir; hukuk puanı yüksek olan F42 öndedir.

İlk 10'a giremeyen ama güçlü adaylar: Vue 2 → Vue 3 göç hizmeti ([F02](#f02)), "100 günde Python ile ofis
otomasyonu" kampı ([F41](#f41)), TypeScript ekipleri için beceri kütüphanesi ([F33](#f33)), yerli iş yazılımları için
VS Code eklentisi ([F06](#f06)).

## 4. Kodlanan MVP'ler

| #   | MVP                                                                 | Kime                                                                                                                                                                         | Kullandığı depolar                                                                                                                                                                                                   | Klasör                                                     |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 01  | İhale şartname analizcisi: şartname → kaynaklı uyum kontrol listesi | Kamu ihalelerine düzenli teklif veren KOBİ tedarikçi ve müteahhitlerin ihale sorumluları; birden çok firmanın dosyasını hazırlayan ihale danışmanları                        | microsoft/markitdown (kütüphane), ollama/ollama (isteğe bağlı REST API)                                                                                                                                              | [01-ihale-analizci](01-ihale-analizci/README.md)           |
| 02  | Ders videosu → not, kavram sözlüğü, soru, Anki kartı                | Ders videolarını kendi sitesinde ya da LMS'inde yayımlayan YKS/KPSS/ALES kursları ve eğitmenler; ikinci segment kurumsal eğitim ekipleri ve OSGB'ler                         | yt-dlp/yt-dlp (Python API), huggingface/transformers (isteğe bağlı Whisper), ollama/ollama (isteğe bağlı)                                                                                                            | [02-ders-notu](02-ders-notu/README.md)                     |
| 03  | Rakip fiyat ve kampanya radarı + n8n iş akışı                       | Kendi e-ticaret sitesinde 50–500 ürün satan, fiyatını rakiplerin kendi sitelerine bakarak ayarlayan KOBİ'ler (ilk odak ev aletleri ve ev tekstili); dijital ajanslar         | firecrawl/firecrawl (isteğe bağlı REST API), n8n-io/n8n (içe aktarılabilir iş akışı dosyası)                                                                                                                         | [03-fiyat-radar](03-fiyat-radar/README.md)                 |
| 04  | Esnaf mesaj ve randevu asistanı (Telegram)                          | Mesajları sahibinin ya da tek sekreterin yanıtladığı, randevuyla çalışan mikro işletmeler: önce 1–3 koltuklu berber ve kuaför, sonra diş muayenehanesi, veteriner, halı saha | ollama/ollama (isteğe bağlı yerel model), openclaw/openclaw ve NousResearch/hermes-agent (dışa aktarılan beceri biçimi, kanal tasarımı), anthropics/skills (ön bilgi kuralları), obra/superpowers (açıklama ilkesi)  | [04-esnaf-asistani](04-esnaf-asistani/README.md)           |
| 05  | AI kodlama ajanı kurulum paketi                                     | 10–50 kişilik yazılım ajansları, 5–50 kişilik ürün ekipleri, bu kurulumu hizmet olarak satan serbest danışmanlar                                                             | anthropics/skills, obra/superpowers, mattpocock/skills, affaan-m/ECC, multica-ai/andrej-karpathy-skills, anomalyco/opencode, openclaw/openclaw, NousResearch/hermes-agent (biçim, kural ve yöntem; kod kopyalanmadı) | [05-ajan-kurulum-paketi](05-ajan-kurulum-paketi/README.md) |
| 06  | Fazla mesai ve çalışma süresi uyum hesaplayıcı                      | Ödeyen: KOBİ bordrosunu yapan mali müşavirler, KOBİ İK/bordro sorumluları, iş hukuku büroları; ücretsiz: çalışanlar; kurumsal lisans: sendikalar                             | vuejs/core ve twbs/bootstrap (çalışma zamanı; sürümü sabit, SRI'lı CDN), 996icu/996.ICU (problem tanımı ve madde numaralı ihlal yaklaşımı; kod yok)                                                                  | [06-mesai-hesap](06-mesai-hesap/README.md)                 |

MVP 01–05'in testleri Python standart kütüphanesiyle, MVP 06'nın testleri Node 22 ile, internetsiz ve ek paket
kurmadan çalışır. Gerçek kütüphane (markitdown, yt-dlp ve ffmpeg), yerel Ollama modeli ya da depo klonları varsa ek
entegrasyon testleri de koşar, yoksa atlanır:

```bash
cd repo-atlasi/is-fikirleri
for d in 01-ihale-analizci 02-ders-notu 03-fiyat-radar 04-esnaf-asistani 05-ajan-kurulum-paketi; do
  (cd "$d" && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -t .)
done
(cd 06-mesai-hesap && node --test)
```

Her MVP'nin çalıştırma komutları ve test ayrıntıları kendi README dosyasındadır. MVP'ler yalnızca puana göre
seçilmedi: amaç, 51 depodaki gerçek kütüphaneleri, arayüzleri ve dosya biçimlerini (markitdown API'si, yt-dlp Python
API'si, Firecrawl `/v2/scrape`, n8n iş akışı biçimi, Ollama REST API'si, Agent Skills `SKILL.md` biçimi, Vue 3 ve
Bootstrap 5) kullanmayı öğretmekti. MVP 02 bu yüzden ilk 10'da olmadığı hâlde kodlandı.

## 5. Tam katalog (D01–D10)

Her kartta aynı alanlar vardır: **Fikir**, **Kime** (segment ve persona), **Problem**, **Çözüm**, **Kullanılan
depolar** (ve nasıl), **Gelir modeli** (örnek fiyat; tüm fiyatlar ilk müşteri görüşmelerinde doğrulanacak
varsayımlardır), **İlk 10 müşteri**, **Riskler**, **MVP** ve **Puan** (pazar · hız · sermaye · teknik · savunma ·
hukuk). Depo adları o deponun atlas dosyasına (`dallar/…/README.md`) bağlanır; tüm depoların tablosu
[ENVANTER.md](../ENVANTER.md)'dedir.

### D01 — Web arayüzü ([dal](../dallar/01-web-arayuzu/README.md))

<a id="f01"></a>

#### F01 · react/react — AB'ye satan e-ihracatçılar için erişilebilirlik uyum paketi

- **Fikir:** Kendi sitesinden Avrupa'daki tüketiciye satan firmanın vitrinini erişilebilirlik açısından denetleyip
  React bileşen kitiyle düzeltmek ve izlemek.
- **Kime:** Kendi React/Next.js sitesi olan 10–50 çalışanlı e-ihracatçılar. Persona: Denizli'den Almanya'ya ev
  tekstili satan firmanın e-ticaret müdürü.
- **Problem:** AB Erişilebilirlik Yasası (Direktif 2019/882) Haziran 2025'ten beri tüketiciye sunulan e-ticaret
  hizmetlerini kapsıyor; klavyeyle gezinme, alternatif metin ve kontrast eksikleri yaygın (varsayım). Kapsam ve mikro
  işletme istisnası hukukçuyla doğrulanmalı.
- **Çözüm:** Otomatik tarama + elle test → önceliklendirilmiş rapor → erişilebilir bileşen kiti (odak yönetimi, form
  etiketleri, `useId` ile bağlanan hata mesajları) → düzeltme PR'ları → aylık izleme.
- **Kullanılan depolar:** [react/react](../dallar/01-web-arayuzu/react/README.md) (bileşen kiti; `useId` kancası
  `packages/react/src/ReactHooks.js`'te), [twbs/bootstrap](../dallar/01-web-arayuzu/bootstrap/README.md)
  (erişilebilirlik belgesi `site/src/content/docs/getting-started/accessibility.mdx` kontrol listesine kaynak).
- **Gelir modeli:** Denetim raporu 30.000 TL; düzeltme paketi 60.000–150.000 TL; izleme 3.000 TL/ay.
- **İlk 10 müşteri:** İhracatçı birliklerinin e-ihracat eğitimlerine katılan firmalar; e-ihracat danışmanları (kanal);
  pazaryerinden kendi sitesine geçen markalar.
- **Riskler:** "Uyum garantisi" verilemez, ülke uygulamaları farklı; eski temalarda düzeltme pahalı; ucuz ama yetersiz
  "erişilebilirlik eklentisi" satıcılarıyla fiyat rekabeti.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 4 · 3 · 4 = **23**

<a id="f02"></a>

#### F02 · vuejs/vue — Vue 2'den Vue 3'e göç hizmeti

- **Fikir:** Desteği bitmiş Vue 2 uygulamalarını analiz edip aşamalı olarak Vue 3'e taşımak.
- **Kime:** İç paneli ya da müşteri portalı 2018–2022 arasında Vue 2 ile yazılmış orta ölçekli şirketler. Persona:
  bir lojistik firmasında 5 kişilik iç yazılım ekibinin lideri.
- **Problem:** Vue 2'nin desteği 31 Aralık 2023'te sona erdi; güvenlik yaması gelmiyor, bağımlılıklar güncellenemiyor;
  ekip hem yeni iş hem göç yapamıyor.
- **Çözüm:** Göç analizi raporu (kaldırılan API'ler, filtreler, `Vue.set`, eklentiler, Vuex) → Vue 2.7 ara adımı →
  `@vue/compat` uyumluluk derlemesiyle Vue 3 → Vite + Pinia → testler.
- **Kullanılan depolar:** [vuejs/vue](../dallar/01-web-arayuzu/vue2/README.md) (kaldırılan API'lerin kaynağı),
  [vuejs/core](../dallar/01-web-arayuzu/vue3-core/README.md) (hedef; `packages/vue-compat` uyumluluk katmanı).
- **Gelir modeli:** Analiz raporu 25.000 TL; sabit fiyatlı göç 150.000–600.000 TL (kod boyutuna göre); ekip koçluğu
  12.000 TL/gün.
- **İlk 10 müşteri:** İş ilanlarında "Vue 2" geçen şirketler (göç ihtiyacının işareti); yazılım ajanslarına taşeron
  olarak; Vue topluluk buluşmaları.
- **Riskler:** Üçüncü taraf eklentilerin Vue 3 karşılığı olmayabilir; müşteri "çalışıyor, dokunma" diyebilir; teknik
  risk testsiz kod tabanında yüksek.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 3 · 3 · 5 = **23**

<a id="f03"></a>

#### F03 · vuejs/core — Saha servis ekipleri için çevrimdışı iş emri uygulaması

- **Fikir:** İnternetsiz de çalışan, Vue 3 ile yazılmış bir PWA ile teknisyenin iş emri, fotoğraf, parça ve müşteri
  imzasını dijitalleştirmek.
- **Kime:** 15–60 teknisyenli kombi, klima ve beyaz eşya servisleri. Persona: Bursa'da yetkili servis işleten firmanın
  operasyon müdürü.
- **Problem:** Bodrum katta bağlantı yok; iş emri kâğıtta, faturalama ve parça stoğu gecikiyor (varsayım).
- **Çözüm:** Çevrimdışı önbellekli PWA + bağlantı gelince eşitleme + yönetici paneli + muhasebe yazılımına aktarım.
- **Kullanılan depolar:** [vuejs/core](../dallar/01-web-arayuzu/vue3-core/README.md) (reaktivite ve bileşenler),
  [twbs/bootstrap](../dallar/01-web-arayuzu/bootstrap/README.md) (arayüz),
  [n8n-io/n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (muhasebe/ERP aktarım akışlarının prototipi ve
  kendi n8n'ini işleten müşteriye akış şablonu).
- **Gelir modeli:** Teknisyen başına 250 TL/ay; kurulum 20.000 TL.
- **İlk 10 müşteri:** Marka yetkili servis ağları; sanayi sitelerindeki servis firmaları; servis yazılımı arayan
  bayiler.
- **Riskler:** Eşitleme çakışmaları; hazır saha servis yazılımlarıyla rekabet; müşteri adres ve telefonları kişisel
  veri (KVKK, veri işleyen sözleşmesi); barındırılan üründe aktarım n8n'le değil kendi kodumuzla çalışır, çünkü
  müşterinin muhasebe kimlik bilgileriyle sunucumuzda çalışan bir n8n akışı lisans sınırının dışında kalabilir
  ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 3 · 4 · 3 · 3 · 4 = **21**

<a id="f04"></a>

#### F04 · twbs/bootstrap — Esnaf için tek sayfalık site ve QR fiyat listesi

- **Fikir:** Formu dolduran esnafa birkaç dakikada tek sayfalık, mobil uyumlu site ve dükkâna asılacak QR kodlu fiyat
  listesi üretmek; güncellemeyi mesajla yapmak.
- **Kime:** Mahalle esnafı (fırın, kuaför, oto yıkama). Persona: Eskişehir'de iki şubeli fırının sahibi.
- **Problem:** Haritalarda görünüyor ama güncel fiyat ve menü yok; ajans fiyatları yüksek, hazır site kurucular
  karmaşık.
- **Çözüm:** Bootstrap şablonlarından statik site + QR kod + mesajla fiyat güncelleme (prototipte n8n akışı) + ucuz
  statik barındırma.
- **Kullanılan depolar:** [twbs/bootstrap](../dallar/01-web-arayuzu/bootstrap/README.md) (duyarlı ızgara ve hazır
  bileşenler), [n8n-io/n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (güncelleme akışının prototipi).
  Bootstrap ayrıca [MVP 06](06-mesai-hesap/README.md)'nın arayüzünde kullanılır.
- **Gelir modeli:** Kurulum 2.500 TL + 250 TL/ay (barındırma, güncelleme).
- **İlk 10 müşteri:** Esnaf odaları; esnafın muhasebecisi (tavsiye); yürüyerek mahalle ziyareti.
- **Riskler:** Çok rekabetçi ve kolay taklit edilir; esnafın ödeme isteği düşük; SMS/bildirim gönderilecekse 6563 sayılı
  Kanun ve İleti Yönetim Sistemi (İYS) kuralları; güncelleme akışı bizim sunucumuzda çalışacağı için n8n'in "yalnızca
  kendi iç iş amaçları" sınırına girip girmediği net değil, teyit gelene kadar akış kendi kodumuzla çalışır
  ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 5 · 1 · 5 = **23**

<a id="f05"></a>

#### F05 · getify/You-Dont-Know-JS — Kurumsal "JavaScript'i derinlemesine anlamak" atölyesi

- **Fikir:** Framework bilen ama dilin çekirdeğinde (kapanış, `this`, prototip, olay döngüsü, async) hata yapan ekiplere
  özgün materyalle uygulamalı atölye.
- **Kime:** Bankaların, telekom ve perakende şirketlerinin 10–40 kişilik ön yüz ekipleri. Persona: bir banka teknoloji
  iştirakinde ön yüz takım lideri.
- **Problem:** Üretimdeki hataların bir kısmı dilin temel davranışlarından kaynaklanıyor; mülakatlarda da aynı konular
  eleniyor (varsayım).
- **Çözüm:** 3 günlük atölye: ekibin kendi kodundan anonimleştirilmiş "hata avı" alıştırmaları, kod inceleme rubriği,
  ölçme sınavı. Kitap ücretsiz okuma kaynağı olarak önerilir.
- **Kullanılan depolar:** [getify/You-Dont-Know-JS](../dallar/01-web-arayuzu/you-dont-know-js/README.md) (konu sırası
  için ilham; lisansı CC BY-NC-ND 4.0 olduğundan çevrilmez, uyarlanmaz, satılmaz),
  [trekhleb/javascript-algorithms](../dallar/09-bilgisayar-bilimi/javascript-algorithms/README.md) (alıştırma havuzu).
- **Gelir modeli:** Kişi başı 6.000 TL ya da 15 kişilik grup için 90.000 TL.
- **İlk 10 müşteri:** Kurumsal eğitim satın alma birimleri; teknoloji konferanslarında konuşma; LinkedIn'de kısa video
  dersler.
- **Riskler:** Kitap içeriğinin izinsiz kullanımı (lisans); eğitim firmalarıyla rekabet; savunma eğitmenin itibarına
  bağlı.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 4 · 2 · 4 = **22**

### D02 — Uygulama platformları ([dal](../dallar/02-uygulama-platformlari/README.md))

<a id="f06"></a>

#### F06 · microsoft/vscode — Yerli iş yazılımlarının betik dilleri için VS Code eklentisi

- **Fikir:** Kendi rapor/betik dilini iş ortaklarına sunan yazılım üreticilerine sözdizimi renklendirme, tamamlama ve
  hata gösteren VS Code eklentisi geliştirmek.
- **Kime:** ERP, muhasebe ve otomasyon yazılımı üreticileri. Persona: İstanbul'da 80 kişilik bir ERP firmasının ürün
  müdürü (bayi danışmanları rapor tasarımında zorlanıyor).
- **Problem:** Özel dil düz metin düzenleyicide yazılıyor; sözdizimi hataları destek talebine dönüşüyor.
- **Çözüm:** Dil sunucusu (LSP) + gramer + kod parçacıkları + istenirse hata ayıklama adaptörü; Marketplace/Open VSX ya
  da kurum içi dağıtım.
- **Kullanılan depolar:** [microsoft/vscode](../dallar/02-uygulama-platformlari/vscode/README.md) (eklenti API'si;
  `extensions/json-language-features` ve `extensions/typescript-language-features` gibi yerleşik dil eklentileri
  örnek mimari).
- **Gelir modeli:** Proje 250.000–600.000 TL + bakım 15.000 TL/ay.
- **İlk 10 müşteri:** Yazılım sanayicileri dernekleri; ERP üreticilerinin iş ortağı kanalları; teknoparklardaki ürün
  firmaları.
- **Riskler:** Dilin resmi grameri yoksa çıkarmak zaman alır (müşterinin kendi dili, izinli); az sayıda büyük müşteri.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 3 · 4 · 5 = **23**

<a id="f07"></a>

#### F07 · flutter/flutter — Bağımsız kafe ve fırınlar için beyaz etiket sadakat ve ön sipariş uygulaması

- **Fikir:** Tek Flutter kod tabanından markaya özel iOS/Android uygulaması: dijital damga kartı, ön sipariş, kampanya
  bildirimi.
- **Kime:** 2–8 şubeli bağımsız kafe ve fırın zincirleri. Persona: Ankara'da 4 şubeli butik kahve zincirinin sahibi.
- **Problem:** Büyük zincirlerin uygulaması var; bağımsızlar kâğıt damga kartıyla kalıyor, müşteri verisi yok, sipariş
  platformlarına komisyon ödüyor (oranlar müşteriyle konuşulmalı).
- **Çözüm:** Tema ile markalanan hazır uygulama + yönetim paneli + POS/muhasebe entegrasyonu.
- **Kullanılan depolar:** [flutter/flutter](../dallar/02-uygulama-platformlari/flutter/README.md) (tek kod tabanı),
  [n8n-io/n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (entegrasyon akışlarının prototipi).
- **Gelir modeli:** Kurulum 40.000 TL + şube başına 1.500 TL/ay.
- **İlk 10 müşteri:** Kahve ekipmanı tedarikçileri (kanal); barista akademileri; kafe fuarları.
- **Riskler:** Bildirim ve SMS için 6563 sayılı Kanun ve İYS onayı; KVKK; mağaza inceleme süreleri; hazır sadakat
  SaaS'larıyla rekabet; müşterinin POS ve muhasebe kimlik bilgileriyle sunucumuzda çalışan entegrasyon, n8n'den ticari
  lisans alınmadıkça kendi kodumuzla yazılır ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 3 · 4 · 3 · 3 · 3 = **20**

<a id="f08"></a>

#### F08 · ohmyzsh/ohmyzsh — Yazılım ekipleri için "ilk gün hazır" geliştirici ortamı paketi

- **Fikir:** Şirkete özel kabuk, git ve araç yapılandırmasını tek komutla kuran, bakımı yapılan bir geliştirici ortamı
  paketi.
- **Kime:** Yılda 10+ geliştirici işe alan 10–100 kişilik yazılım şirketleri. Persona: İstanbul'da bir fintech'in
  geliştirici deneyimi sorumlusu.
- **Problem:** Yeni gelenin bilgisayarını kurmak 1–3 gün sürüyor; sürüm farkları "bende çalışıyor" hatası üretiyor
  (varsayım).
- **Çözüm:** Şirkete özel dotfiles deposu: zsh + seçilmiş Oh My Zsh eklentileri, git takma adları, sürüm yöneticileri,
  tekrar çalıştırılabilir kurulum betiği, geliştirme konteyneri; belgeler ve bakım.
- **Kullanılan depolar:** [ohmyzsh/ohmyzsh](../dallar/02-uygulama-platformlari/ohmyzsh/README.md) (`lib/`, `plugins/`
  — 372 eklenti klasörü — ve `themes/` mimarisi),
  [trimstray/the-book-of-secret-knowledge](../dallar/03-sistem-ag-guvenlik/the-book-of-secret-knowledge/README.md)
  (komut satırı araçları).
- **Gelir modeli:** Kurulum paketi 40.000 TL + bakım 4.000 TL/ay.
- **İlk 10 müşteri:** DevOps buluşmaları; [MVP 05](#f31) müşterilerine çapraz satış.
- **Riskler:** Ekipler bunu kendisi yapabilir (ödeme isteği düşük); kolay taklit; işletim sistemi farkları.
- **MVP:** fikir aşamasında · **Puan:** 2 · 4 · 5 · 4 · 1 · 5 = **21**

<a id="f09"></a>

#### F09 · freeCodeCamp/freeCodeCamp — Belediye ve STK'lar için kodlama kampı işletme hizmeti

- **Fikir:** Gençlik istihdamı projelerinde freeCodeCamp'in ücretsiz sertifika yollarını kullanan, mentorlu ve takipli
  16 haftalık kohortları anahtar teslim yürütmek.
- **Kime:** Belediyeler, kalkınma ajansları ve STK'ların proje koordinatörleri (hibe destekli projeler). Persona: bir
  kalkınma ajansı desteğiyle gençlik istihdamı projesi yürüten büyükşehir belediyesi gençlik merkezinin proje
  koordinatörü.
- **Problem:** Kurum kodlama eğitimi açmak istiyor ama müfredat, mentor, ilerleme takibi ve işverenle buluşturma
  altyapısı yok.
- **Çözüm:** Öğrenciler freeCodeCamp platformunda ilerler; biz Türkçe mentor saatleri, haftalık ilerleme panosu, proje
  değerlendirmesi ve işveren buluşmaları sağlarız.
- **Kullanılan depolar:** [freeCodeCamp/freeCodeCamp](../dallar/02-uygulama-platformlari/freecodecamp/README.md)
  (`curriculum/` yapısı ve sertifika yolları; yazılım BSD-3, müfredat içeriği © freeCodeCamp olduğundan kopyalanmaz),
  [practical-tutorials/project-based-learning](../dallar/10-kuratorluk-topluluk/project-based-learning/README.md)
  (proje fikirleri).
- **Gelir modeli:** 30 katılımcılı kohort başına 400.000–900.000 TL hizmet bedeli (proje bütçesinden).
- **İlk 10 müşteri:** Kalkınma ajanslarının teklif çağrıları; belediye gençlik merkezleri; üniversite kariyer
  merkezleri.
- **Riskler:** Hibe takvimine bağlı nakit akışı; işe yerleştirme vaadi verilmemeli; freeCodeCamp adı ve logosu izinsiz
  "ortaklık" gibi kullanılmamalı; katılımcıların ilerleme ve değerlendirme verisi kişisel veridir: kurumla veri işleme
  sözleşmesi, aydınlatma ve saklama süresi (KVKK), 18 yaş altı katılımcıda veli onayı.
- **MVP:** fikir aşamasında · **Puan:** 4 · 2 · 4 · 5 · 3 · 4 = **22**

<a id="f10"></a>

#### F10 · nilbuild/developer-roadmap — Kariyer basamakları ve yetkinlik matrisi aracı

- **Fikir:** Yazılım şirketlerine rol × seviye yetkinlik matrisi, öz değerlendirme ve kalibrasyon toplantısı aracı.
- **Kime:** 20–200 kişilik yazılım şirketlerinin CTO'su ve İK iş ortağı. Persona: Ankara'da 60 geliştiricili bir
  savunma yazılımı tedarikçisinin mühendislik müdürü.
- **Problem:** Terfi ölçütleri belirsiz; "kıdemli" tanımı ekipten ekibe değişiyor; iyi çalışan ayrılıyor.
- **Çözüm:** Özgün matris şablonları + kişisel gelişim planı + öğrenme bağlantıları (roadmap.sh'ye yalnızca bağlantı).
- **Kullanılan depolar:** [nilbuild/developer-roadmap](../dallar/02-uygulama-platformlari/developer-roadmap/README.md)
  (etkileşimli yol haritası fikri; lisans dosyası içeriği yalnızca kişisel kullanıma açtığı için içerik kullanılmaz),
  [ossu/computer-science](../dallar/09-bilgisayar-bilimi/ossu-computer-science/README.md) (bağlantı verilen açık
  müfredat).
- **Gelir modeli:** Çalışan başı 60 TL/ay (en az 3.000 TL/ay) + matris tasarım danışmanlığı 50.000 TL.
- **İlk 10 müşteri:** İK teknolojisi etkinlikleri; CTO toplulukları; teknopark firmaları.
- **Riskler:** roadmap.sh içeriğini kopyalamak lisans ihlalidir; performans yönetimi yazılımlarıyla rekabet; uzun satış
  döngüsü; çalışanların öz değerlendirme ve kalibrasyon notları kişisel veridir: işverenle veri işleme sözleşmesi,
  çalışanlara aydınlatma, yurt içinde barındırma (yurt dışındaysa KVKK md. 9).
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 4 · 3 · 4 = **22**

### D03 — Sistem, ağ ve güvenlik ([dal](../dallar/03-sistem-ag-guvenlik/README.md))

<a id="f11"></a>

#### F11 · torvalds/linux — Fabrikalardaki endüstriyel Linux cihazları için bakım ve yama hizmeti

- **Fikir:** Makinelerden veri toplayan gömülü Linux kutularının envanterini çıkarıp güncel ve güvenli tutmak.
- **Kime:** OSB'lerde 50–300 çalışanlı üreticiler. Persona: Kocaeli'de bir yan sanayi firmasının bakım ve BT sorumlusu.
- **Problem:** Kurulumdan sonra hiç güncellenmeyen eski çekirdekli cihazlar, açık portlar, desteği bitmiş tedarikçiler.
- **Çözüm:** Envanter (çekirdek sürümü, servisler), uzun süreli destek (LTS) çekirdeğe geçiş planı, bakım pencerelerinde
  yama, uzaktan izleme; gerekirse sürücü taşıma.
- **Kullanılan depolar:** [torvalds/linux](../dallar/03-sistem-ag-guvenlik/linux/README.md) (`Documentation/process/`
  altındaki kararlı/LTS sürüm süreci, sürücü ağacı),
  [trimstray/the-book-of-secret-knowledge](../dallar/03-sistem-ag-guvenlik/the-book-of-secret-knowledge/README.md)
  (sistem ve ağ araçları).
- **Gelir modeli:** İlk denetim 20.000 TL; cihaz başına 400 TL/ay.
- **İlk 10 müşteri:** OSB yönetimlerinin dijital dönüşüm etkinlikleri; makine üreticileri (servis ortaklığı).
- **Riskler:** Kapalı üretici paketleri; üretim duruşu riski; çekirdeği biz derleyip müşterinin cihazına kurarsak
  (değiştirilmiş olsun olmasın) bu bir dağıtımdır ve GPL-2.0 md. 3 gereği kaynak kodu ya da yazılı teklif verilir
  (`LICENSES/preferred/GPL-2.0`); dağıtımın resmî paketleri kendi deposundan kurulduğunda bu yük genellikle dağıtımdadır
  (doğrulanmadı).
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 4 · 2 · 4 · 4 = **20**

<a id="f12"></a>

#### F12 · DigitalPlatDev/FreeDomain — KOBİ'ler için e-posta teslim edilebilirlik ve DNS hizmeti

- **Fikir:** E-postaları spam kutusuna düşen işletmenin alan adı DNS kayıtlarını (SPF, DKIM, DMARC, MX) kurmak ve
  izlemek.
- **Kime:** 5–50 çalışanlı KOBİ'ler. Persona: Gaziantep'te tekstil ihracatçısının dış ticaret sorumlusu (teklif
  e-postaları alıcının spam kutusuna gidiyor).
- **Problem:** DNS kayıtları eksik ya da hatalı; Google ve Yahoo Şubat 2024'ten beri tüm gönderenlerden SPF ya da DKIM,
  toplu gönderenlerden ayrıca DMARC istiyor (eşikler doğrulanmadı). Teklif e-postası atan KOBİ çoğunlukla toplu
  gönderen değildir, ama kayıtları eksik alan adının e-postası yine spam'e düşebilir; alan adını kimin yönettiği bile
  bilinmiyor.
- **Çözüm:** Denetim raporu → düzeltme → DMARC raporlarının aylık özeti → kara liste takibi.
- **Kullanılan depolar:** [DigitalPlatDev/FreeDomain](../dallar/03-sistem-ag-guvenlik/freedomain/README.md) (DNS'i
  uygulamalı öğreten kaynaklar; ücretsiz alt alan adları test ortamı için, müşterinin ana alan adı için değil),
  [the-book-of-secret-knowledge](../dallar/03-sistem-ag-guvenlik/the-book-of-secret-knowledge/README.md) (DNS
  araçları), [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (aylık DMARC özetinin prototipi).
- **Gelir modeli:** Kurulum 3.000 TL; izleme 400 TL/ay.
- **İlk 10 müşteri:** Mali müşavirler (müşterilerine önerir); web ajansları; ihracatçı birliklerinin eğitimleri.
- **Riskler:** Kolay taklit edilir (savunma: güven ve hız); DMARC raporlarında e-posta adresleri bulunur (KVKK,
  saklama süresi); aylık özeti sunucumuzda n8n'le üretmenin lisans sınırına girip girmediği net değil, teyit gelene
  kadar özet kendi kodumuzla üretilir ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 5 · 5 · 4 · 2 · 5 = **25**

<a id="f13"></a>

#### F13 · trimstray/the-book-of-secret-knowledge — KOBİ'ler için savunma odaklı dış yüzey sağlık kontrolü

- **Fikir:** Yazılı izinle, yalnızca müşterinin kendi varlıklarında dış yüzey kontrolü ve yönetici özetli Türkçe rapor.
- **Kime:** Hasta ya da müşteri verisi işleyen 10–100 çalışanlı işletmeler. Persona: Antalya'da 3 şubeli diş kliniği
  zincirinin işletme müdürü.
- **Problem:** Açık uzak masaüstü, eski VPN, süresi dolan sertifika, yedeksiz dosya sunucusu fark edilmiyor; veri ihlali
  KVKK'ya bildirim ve itibar riski doğurur.
- **Çözüm:** İzinli tarama + TLS/DNS/e-posta yapılandırması + parola ve yedekleme kontrol listesi + çeyreklik tekrar.
- **Kullanılan depolar:**
  [trimstray/the-book-of-secret-knowledge](../dallar/03-sistem-ag-guvenlik/the-book-of-secret-knowledge/README.md)
  (savunma ve denetim araçları, tek satırlık komutlar),
  [FreeDomain](../dallar/03-sistem-ag-guvenlik/freedomain/README.md) (DNS), [linux](../dallar/03-sistem-ag-guvenlik/linux/README.md)
  (sunucu sıkılaştırma).
- **Gelir modeli:** İlk rapor 9.000 TL; izleme 2.000 TL/ay.
- **İlk 10 müşteri:** Diş hekimleri odası etkinlikleri; mali müşavirler; sigorta acenteleri.
- **Riskler:** İzinsiz tarama 5237 sayılı TCK md. 243 vd. kapsamında suç oluşturabilir ve sözleşme ya da kullanım
  koşullarını ihlal eder (doğrulanmadı): yazılı izin ve kapsam şart; sorumluluk sınırlandırması; güvenlik firmalarıyla
  rekabet.
- **MVP:** fikir aşamasında · **Puan:** 4 · 4 · 5 · 3 · 3 · 3 = **22**

<a id="f14"></a>

#### F14 · morluto/rea — Kaynak kodu kaybolmuş iç yazılımlar için belgeleme ve birlikte çalışabilirlik

- **Fikir:** Müşterinin sahip olduğu, kaynağı kayıp eski yazılımın veri biçimlerini ve davranışını belgeleyip yeni
  sisteme köprü kurmak.
- **Kime:** 20 yıllık özel yazılımı üretimde kullanan fabrika ve lojistik firmaları. Persona: Kocaeli'de bir otomotiv
  yan sanayi firmasının BT müdürü (eski tartı/etiket programı).
- **Problem:** Yazılımı yazan firma yok; veriyi yeni ERP'ye taşımak ya da programı değiştirmek riskli.
- **Çözüm:** Yazılı izinle analiz → dosya ve veritabanı biçimlerinin belgelenmesi → davranış testleri → dışa aktarma
  aracı.
- **Kullanılan depolar:** [morluto/rea](../dallar/03-sistem-ag-guvenlik/rea/README.md) (ajanın MCP üzerinden hedefi
  inceleyip kanıtıyla bulgu döndürdüğü iş akışı; `DISCLAIMER.md`'deki meşru kullanım çerçevesi: kendi yazılımın,
  birlikte çalışabilirlik, yazılım koruma), [anomalyco/opencode](../dallar/07-kodlama-ajanlari/opencode/README.md)
  (ajan), [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (kod dışarı çıkmadan yerel model).
- **Gelir modeli:** Keşif 40.000 TL; belgeleme + köprü 150.000–400.000 TL.
- **İlk 10 müşteri:** ERP göç projelerinde tıkanan danışmanlar; sistem entegratörleri; OSB'ler.
- **Riskler:** Yalnızca müşterinin hakkı olan yazılım; lisans sözleşmesindeki tersine mühendislik yasakları ve FSEK'teki
  birlikte çalışabilirlik istisnasının sınırları avukatla doğrulanmalı (doğrulanmadı); DRM, lisans ve kopya korumasını
  aşmak kesinlikle kapsam dışı.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 2 · 4 · 3 = **20**

<a id="f15"></a>

#### F15 · massgravel/Microsoft-Activation-Scripts — Yazılım lisans uyum denetimi ve lisans planlama

- **Fikir:** Deponun tersine bir iş: işletmenin yazılım envanterini lisans kanıtlarıyla eşleştirip uyumsuzluğu yasal
  yoldan kapatmak (yazılım varlık yönetimi).
- **Kime:** 20–250 çalışanlı mimarlık ve mühendislik ofisleri, ajanslar, üreticiler. Persona: İstanbul'da 35 kişilik
  mimarlık ofisinin ortağı (lisans denetimi mektubu aldı ya da almaktan çekiniyor).
- **Problem:** Yıllar içinde kurulan bilgisayarların lisans durumu bilinmiyor; bazılarında yetkisiz etkinleştirme
  araçları olabilir; denetimde tazminat ve itibar riski (5846 sayılı FSEK).
- **Çözüm:** Envanter ve lisans kanıtı eşleşmesi → uyumsuzluk raporu → yasal lisanslama planı (hacim lisansı,
  abonelik ya da açık kaynak alternatif) → yetkisiz araçların kaldırılması ve politika.
- **Kullanılan depolar:**
  [massgravel/Microsoft-Activation-Scripts](../dallar/03-sistem-ag-guvenlik/microsoft-activation-scripts/README.md)
  yalnızca **konu** olarak: popülerliği lisans maliyeti baskısına ve uyumsuzluk riskine işaret eder (varsayım:
  Türkiye'deki yaygınlık ölçülmedi); koddan hiçbir şekilde yararlanılmaz.
  [awesome-selfhosted](../dallar/10-kuratorluk-topluluk/awesome-selfhosted/README.md) (lisans maliyetini düşüren yasal
  açık kaynak alternatifler).
- **Gelir modeli:** 30 cihaza kadar denetim 25.000 TL; yıllık takip 3.000 TL/ay; lisans alımında bayi komisyonu
  (müşteriye açıkça beyan edilerek).
- **İlk 10 müşteri:** Mimar ve mühendis odalarının meslek içi eğitimleri; mali müşavirler; BT hizmet sağlayıcıları.
- **Riskler:** Denetim yetkisi değil danışmanlıktır; gizlilik sözleşmesi şart ("ihbar" algısı); lisans satışında çıkar
  çatışması şeffaf yönetilmeli.
- **MVP:** fikir aşamasında · **Puan:** 4 · 4 · 5 · 4 · 3 · 4 = **24**

### D04 — Veri araçları ve otomasyon ([dal](../dallar/04-veri-araclari-otomasyon/README.md))

<a id="f16"></a>

#### F16 · yt-dlp/yt-dlp — Ders videosundan not, soru ve Anki kartı (MVP 02)

- **Fikir:** Eğitmenin kendi ders videosundan ya da altyazısından zaman damgalı not, kavram sözlüğü, soru ve tekrar
  kartı üretmek.
- **Kime:** Ders videolarını kendi sitesinde ya da LMS'inde yayımlayan YKS/KPSS/ALES hazırlık kursları ile kendi
  videosunu satan eğitmenler; ikinci segment İSG gibi zorunlu eğitim videoları olan kurumsal eğitim ekipleri ve
  OSGB'ler. Persona: Ankara'da 3 şubeli KPSS kursunun eğitim koordinatörü.
- **Problem:** Video arşivi büyük; öğrenci özet ve soru istiyor; her ders saati için not hazırlamak ek mesai.
- **Çözüm:** Altyazı varsa yalnız altyazı, yoksa ses + Whisper; LLM ile bölüm bölüm özet ve sorular, LLM yoksa tanım
  kalıplarından kavram ve boşluk doldurma.
- **Kullanılan depolar:** [yt-dlp/yt-dlp](../dallar/04-veri-araclari-otomasyon/yt-dlp/README.md) (Python API; yalnızca
  izin verilen alan adlarında, önce altyazı), [huggingface/transformers](../dallar/05-yapay-zeka-altyapisi/transformers/README.md)
  (Whisper), [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (yerel özet).
- **Gelir modeli:** Eğitmen 600 TL/ay (20 ders saati); kurs 4.000 TL/ay (150 ders saati); arşiv dönüştürme 60 TL/ders
  saati; kurum içi kurulum 25.000 TL tek seferlik (KDV hariç).
- **İlk 10 müşteri:** Kendi video arşivi olan kurslar; eğitmen toplulukları; 3 dersi ücretsiz işleyip örnek göstermek.
- **Riskler:** Telif ve platform koşulları (yalnızca hakkı olan içerik; YouTube gibi platformlardaki videolar
  indirilmez, eğitmen kendi kaynak dosyasını verir); canlı ders kaydındaki öğrenci sesi ve adı kişisel veridir (KVKK);
  Türkçe ASR hataları; LLM'in yanlış soru üretmesi (öğretmen onayı).
- **MVP:** [02-ders-notu](02-ders-notu/README.md) · **Puan:** 4 · 4 · 5 · 3 · 3 · 3 = **22**

<a id="f17"></a>

#### F17 · microsoft/markitdown — İhale şartname analizcisi (MVP 01)

- **Fikir:** İhale belgelerinden tarih, teminat, istenen belge, ceza ve ödeme koşullarını kaynağıyla birlikte çıkaran,
  belgeleri bilgisayardan dışarı çıkarmayan bir kontrol listesi aracı.
- **Kime:** Kamu ihalelerine düzenli teklif veren KOBİ tedarikçi ve müteahhitlerin ihale sorumluları ile birden çok
  firmanın teklif dosyasını hazırlayan ihale danışmanları. Persona: Ankara'da ofis mobilyası satan, yılda 20–40 ihaleye
  giren firmanın ihale sorumlusu.
- **Problem:** Onlarca sayfalık belge seti elle okunuyor; tek bir eksik belge ya da kaçan tarih teklifi değerlendirme
  dışı bırakabilir; firmalar teklif bilgisini bulut araçlarına vermek istemiyor.
- **Çözüm:** Belge → Markdown → bölümler → Türkçe kurallar (+ isteğe bağlı yerel LLM, uydurma alıntı süzgeci) →
  "dosya › madde › alt madde (satır)" kaynaklı Markdown ve CSV liste.
- **Kullanılan depolar:** [microsoft/markitdown](../dallar/04-veri-araclari-otomasyon/markitdown/README.md) (PDF,
  DOCX, XLSX → Markdown), [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (`/api/chat` + JSON
  şeması).
- **Gelir modeli:** İhale başına 750 TL; tedarikçi aboneliği 1.500 TL/ay; danışman ofisi 5.000 TL/ay; yerel LLM kurulumu
  15.000 TL tek seferlik (KDV hariç).
- **İlk 10 müşteri:** Sonuç ilanlarında sık görülen tedarikçiler (elle araştırma); ticaret ve sanayi odalarının kamu
  ihale eğitimleri; ihale danışmanları (kanal).
- **Riskler:** Kuralın kaçırdığı madde (yanlış negatif) → "bulunamayanlar" listesi ve elle doğrulama uyarısı; taranmış
  PDF (OCR); hukuki görüş değildir; belgeyi bizim işlediğimiz hizmet modelinde "belge dışarı çıkmaz" vaadi geçmez ve
  veri işleyen yükümlülükleri doğar (KVKK).
- **MVP:** [01-ihale-analizci](01-ihale-analizci/README.md) · **Puan:** 5 · 4 · 5 · 4 · 4 · 4 = **26**

<a id="f18"></a>

#### F18 · firecrawl/firecrawl — Rakip fiyat ve kampanya radarı (MVP 03)

- **Fikir:** Rakip ürün sayfalarını her sabah tarayıp fiyat, eski fiyat, stok ve Türkçe kampanya metinlerindeki
  değişikliği yalnızca değişiklik olduğunda Telegram'a bildirmek.
- **Kime:** Kendi e-ticaret sitesinde 50–500 ürün satan ve fiyatını 3–10 rakibin kendi sitelerine bakarak her gün elle
  ayarlayan KOBİ'ler (ilk odak: ev aletleri ve ev tekstili) ile bu firmalara hizmet veren dijital ajanslar; pazaryerinde
  de satanlar rakiplerin kendi sitelerini izler, pazaryeri ilan sayfaları taranmaz. Persona: İzmir'de küçük ev aletleri
  satan 8 kişilik firmanın kurucusu (150 ürünü 6 rakiple karşılaştırıyor).
- **Problem:** Rakip fiyatları her sabah sekme sekme kontrol ediliyor; "sepette %10", "3 al 2 öde" gibi yerel kampanya
  dili hazır araçlarda iyi okunmuyor (varsayım).
- **Çözüm:** robots.txt ve hız sınırına uyan getirici (Firecrawl ya da yerleşik), JSON-LD/meta/metin ayrıştırma, sqlite
  geçmişi, "rakip sizden ucuz" uyarısı, n8n iş akışı.
- **Kullanılan depolar:** [firecrawl/firecrawl](../dallar/04-veri-araclari-otomasyon/firecrawl/README.md) (REST API
  olarak `/v2/scrape` POST isteği, isteğe bağlı `product` biçimi; yoksa yerleşik getirici),
  [n8n-io/n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (içe aktarılabilir iş akışı dosyası: zamanlama →
  HTTP → koşul → Telegram).
- **Gelir modeli:** Başlangıç 750 TL/ay (50 URL); Büyüme 2.500 TL/ay (500 URL); Ajans 7.500 TL/ay (2.000 URL, beyaz
  etiket rapor); kendi sunucunda kurulum 10.000 TL tek seferlik (KDV hariç).
- **İlk 10 müşteri:** Dijital ajanslar (kanal: bir ajans birden çok müşteri getirir); hazır e-ticaret altyapılarının iş
  ortağı ağları ve kullanıcı toplulukları; il ticaret odalarının e-ticaret eğitimleri.
- **Riskler:** Sitelerin kullanım koşulları ve bot korumaları (robots.txt'e uyulur, engelleyen site zorlanmaz,
  "okunamadı" diye raporlanır); pazaryeri ilan sayfaları taranmaz; açıklama ve fotoğraf saklanmaz, yalnızca fiyat
  alanları (FSEK); Firecrawl çekirdeği AGPL-3.0: MVP yalnızca REST API'sini çağırır, Firecrawl değiştirilip ağ
  üzerinden sunulursa değiştirilmiş kaynak kod kullanıcılara açılır (AGPL md. 13); n8n'i müşteri kendi sunucusuna
  kendisi kurar, barındırılan paketler n8n'siz (cron ile) çalışır ([n8n notu](#n8n-lisansi)); kolay taklit; rekabet
  hukuku (izleme bilgi içindir; fiyat koordinasyonu ve bayi fiyatı denetimi için satılmaz).
- **MVP:** [03-fiyat-radar](03-fiyat-radar/README.md) · **Puan:** 5 · 5 · 5 · 4 · 2 · 3 = **24**

<a id="f19"></a>

#### F19 · n8n-io/n8n — KOBİ'ler için "kendi sunucunda" otomasyon kurulum ve bakım ajansı

- **Fikir:** Müşterinin kendi sunucusuna, müşterinin adına n8n kurup tekrarlayan ofis işlerini (e-posta → tablo, form →
  CRM, hatırlatma, rapor) iş akışına çevirmek ve bakımını yapmak; n8n'in kullanıcısı ve lisans sahibi müşteridir.
- **Kime:** 10–100 çalışanlı mali müşavirlik büroları, e-ticaret firmaları, klinikler. Persona: Kayseri'de 25 kişilik
  mali müşavirlik bürosunun ortağı.
- **Problem:** Aynı işler her ay elle yapılıyor; bulut otomasyon servisleri veriyi yurt dışına taşıyor (KVKK yurt dışı
  aktarım kaygısı).
- **Çözüm:** Kurulum + 5–10 hazır iş akışı + yedekleme + eğitim + aylık bakım; yapay zekâ adımları yerel modelle.
- **Kullanılan depolar:** [n8n-io/n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (iş akışı motoru ve düğüm
  kütüphanesi `packages/nodes-base`), [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (yerel
  model), [awesome-selfhosted](../dallar/10-kuratorluk-topluluk/awesome-selfhosted/README.md) (yanına kurulacak
  araçlar).
- **Gelir modeli:** Kurulum 25.000 TL + iş akışı başına 5.000–15.000 TL + bakım 3.500 TL/ay.
- **İlk 10 müşteri:** Mali müşavir odalarının etkinlikleri; e-ticaret toplulukları; [MVP 03](#f18) müşterileri.
- **Riskler:** n8n açık kaynak değil "fair-code"dur; Sustainable Use License yalnızca kendi iç iş amaçları için
  kullanıma izin verir: n8n'i müşteri kendisi indirip lisansı kabul eder, ajans danışmanlık, iş akışı yazma ve bakım
  hizmeti satar, n8n'i kendi sunucusunda barındırıp erişimini ücretle satmaz ([n8n notu](#n8n-lisansi); danışmanlığın
  uygunluğu n8n'in lisans SSS'siyle doğrulanmalı); Execute Command düğümü güvenlik gereği varsayılan olarak kapalıdır
  (`NODES_EXCLUDE`); klinik müşterilerinde iş akışları sağlık verisine dokunabilir (KVKK md. 6).
- **MVP:** iş akışı örneği [03-fiyat-radar](03-fiyat-radar/README.md)'da · **Puan:** 5 · 4 · 5 · 4 · 3 · 3 = **24**

<a id="f20"></a>

#### F20 · public-apis/public-apis — Ücretsiz API'ye bağımlı uygulamalar için API sağlık ve değişiklik izleme

- **Fikir:** Uygulamanın kullandığı üçüncü taraf API uç noktalarını izleyip kesinti, kota ve yanıt şeması değişikliğini
  önceden haber vermek; aynı kategoriden yedek API önermek.
- **Kime:** Prototip ve MVP'lerinde ücretsiz API kullanan mobil/web ajansları. Persona: 6 kişilik mobil ajansın teknik
  lideri.
- **Problem:** Ücretsiz API'ler habersiz kapanıyor ya da yanıt biçimini değiştiriyor; müşteri uygulaması bozuluyor.
- **Çözüm:** Sentetik istek + JSON şema farkı + gecikme ve kota uyarısı + yedek önerisi.
- **Kullanılan depolar:** [public-apis/public-apis](../dallar/04-veri-araclari-otomasyon/public-apis/README.md)
  (`| API | Description | Auth | HTTPS | CORS |` sütunlu kategori kataloğu; yedek önerilerinin kaynağı),
  [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (kendi n8n'ini işleten ajansa uyarı akışı şablonu).
- **Gelir modeli:** 10 uç nokta ücretsiz; 100 uç nokta 500 TL/ay; ajans 2.000 TL/ay.
- **İlk 10 müşteri:** Hackathon organizatörleri (sponsorluk); mobil ajanslar; kurs mezunları.
- **Riskler:** Ödeme isteği düşük; genel çalışma süresi izleme servisleriyle rekabet; izleme istekleri de API kotasını
  tüketir ve API koşullarına uymalı; ücretli izleme ve uyarı hizmetinin çekirdeği n8n'le değil kendi kodumuzla çalışır,
  çünkü ürünün çekirdeği olan bir n8n akışı "kendi iç iş amacı" sayılmayabilir ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 2 · 4 · 5 · 4 · 2 · 4 = **21**

### D05 — Yapay zekâ altyapısı ([dal](../dallar/05-yapay-zeka-altyapisi/README.md))

<a id="f21"></a>

#### F21 · tensorflow/tensorflow — Üretim hattında kamera ile kusur tespiti

- **Fikir:** Hat üzerindeki kameradan gelen görüntüde kusurlu ürünü uç cihazda çalışan bir modelle ayırmak.
- **Kime:** 50–500 çalışanlı tekstil, ambalaj ve plastik enjeksiyon üreticileri. Persona: Denizli'de havlu üreticisinin
  kalite müdürü.
- **Problem:** Kalite kontrol göz ile; vardiya sonunda kaçan kusurlar müşteri iadesine dönüşüyor (varsayım).
- **Çözüm:** Transfer öğrenmeyle sınıflandırma modeli (TensorFlow/Keras) → uç cihazda LiteRT ile çıkarım (TensorFlow
  Lite'ın halefi, google-ai-edge/litert; 51 deponun dışında) → operatör ekranı ve kusur istatistiği.
- **Kullanılan depolar:** [tensorflow/tensorflow](../dallar/05-yapay-zeka-altyapisi/tensorflow/README.md) (Keras ile
  eğitim; `tensorflow/lite/README.md` incelenen `15014f3`'te TensorFlow Lite'ın bakım modunda olduğunu ve uç cihaz
  geliştirmesinin LiteRT'ye geçtiğini yazar), [huggingface/transformers](../dallar/05-yapay-zeka-altyapisi/transformers/README.md)
  (görsel modellerle karşılaştırma).
- **Gelir modeli:** Tek hat pilot 250.000 TL; hat başına 8.000 TL/ay.
- **İlk 10 müşteri:** OSB'ler; makine üreticileri; sanayi odalarının dijital dönüşüm programları.
- **Riskler:** Veri etiketleme ve ışık değişimi; donanım sermayesi; uzun satış döngüsü; TensorFlow Lite'a dayanan eski
  örnekler bakım modunda olduğundan yıllarca bakım isteyecek kurulum LiteRT ile yapılır; kameralar çalışanı değil ürünü
  görmeli (KVKK ve çalışan güveni).
- **MVP:** fikir aşamasında · **Puan:** 4 · 2 · 2 · 2 · 4 · 4 = **18**

<a id="f22"></a>

#### F22 · huggingface/transformers — Çağrı merkezi kayıtlarının yerinde Türkçe transkripsiyonu ve konu analizi

- **Fikir:** Çağrıları kurumun kendi sunucusunda yazıya döküp konu, şikâyet ve iptal riski açısından sınıflandırmak.
- **Kime:** 20–200 temsilcili çağrı merkezleri. Persona: İstanbul'da 80 temsilcili bir sigorta çağrı merkezinin kalite
  müdürü.
- **Problem:** Kalite ekibi çağrıların küçük bir kısmını dinleyebiliyor (varsayım); ses kaydı kişisel veri, buluta
  göndermek riskli.
- **Çözüm:** Whisper ile transkripsiyon + Türkçe metin sınıflandırma + anahtar ifade alarmı + kalite formunu ön
  doldurma.
- **Kullanılan depolar:** [huggingface/transformers](../dallar/05-yapay-zeka-altyapisi/transformers/README.md)
  (`automatic-speech-recognition` ve sınıflandırma boru hatları — [MVP 02](02-ders-notu/README.md)'deki ASR ile aynı
  API), [ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (özet), [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md)
  (raporlama; kurumun sunucusunda, kurumun adına kurulur).
- **Gelir modeli:** Kurulum 75.000 TL + temsilci başına 600 TL/ay.
- **İlk 10 müşteri:** Çağrı merkezi sektör etkinlikleri; müşteri deneyimi konferansları; dış kaynak çağrı merkezleri.
- **Riskler:** KVKK (aydınlatma, yerinde işleme, saklama ve imha); gürültülü telefon sesinde Türkçe ASR kalitesi; büyük
  müşteri deneyimi platformlarıyla rekabet; n8n'in lisans sahibi kurumdur, biz kurulum ve bakım hizmeti veririz
  ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 3 · 3 · 3 · 4 · 3 = **20**

<a id="f23"></a>

#### F23 · ollama/ollama — Ofis içi yerel yapay zekâ kutusu

- **Fikir:** Ofise kurulan tek bir GPU'lu bilgisayarla, gizli belgeleri dışarı göndermeden özetleme, taslak ve arama
  yapan yerel yapay zekâ.
- **Kime:** Müvekkil, hasta ya da mükellef verisiyle çalışan 5–30 kişilik bürolar. Persona: Ankara'da 12 avukatlı bir
  hukuk bürosunun yönetici ortağı.
- **Problem:** Çalışanlar gizli belgeleri genel sohbet araçlarına yapıştırıyor; meslek sırrı ve yurt dışı aktarım
  soruları cevapsız.
- **Çözüm:** Ollama + açık ağırlıklı model + basit arayüz; aynı kutuda [MVP 01](01-ihale-analizci/README.md),
  [MVP 02](02-ders-notu/README.md) ve [MVP 04](04-esnaf-asistani/README.md) gibi uygulamalar.
- **Kullanılan depolar:** [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (yerel model sunucusu ve
  REST API; `docs/integrations/` altında opencode, Hermes ve OpenClaw ile bağlantı belgeleri),
  [microsoft/markitdown](../dallar/04-veri-araclari-otomasyon/markitdown/README.md) (belge → metin).
- **Gelir modeli:** Donanım + kurulum 120.000–250.000 TL (donanım fiyatı kura bağlı) ya da kiralama 9.000 TL/ay; bakım
  3.000 TL/ay.
- **İlk 10 müşteri:** Baro ve mali müşavir odası eğitimleri; büro yazılımı satıcıları (kanal); hukuk teknolojisi
  etkinlikleri.
- **Riskler:** Yerel modellerin kalitesi bulut modellerin gerisinde kalabilir; donanım tedariki ve kur; her açık
  ağırlıklı modelin kendi lisansı; çıktıların meslek kurallarına göre denetlenmesi.
- **MVP:** altyapı olarak MVP 01, 02 ve 04'te · **Puan:** 4 · 4 · 3 · 4 · 3 · 4 = **22**

<a id="f24"></a>

#### F24 · 666ghj/MiroFish — Kampanya ve ürün kararları için sentetik tüketici paneli (senaryo provası)

- **Fikir:** Çok ajanlı simülasyonla yeni ambalaj, fiyat ya da mesajın olası tepkilerini lansmandan önce "prova"
  etmek; çıktı tahmin değil, gerçek araştırmaya girecek hipotez listesidir.
- **Kime:** Hızlı tüketim markalarının pazarlama ekipleri, reklam ajanslarının strateji birimleri. Persona: İstanbul'da
  bir gıda markasının marka müdürü.
- **Problem:** Anket ve odak grup pahalı ve yavaş; erken fikir eleme için ucuz bir ön adım yok.
- **Çözüm:** Tohum belge (ürün bilgisi, hedef kitle) → Türk tüketici personalarından ajan dünyası → etkileşim → rapor.
- **Kullanılan depolar:** [666ghj/MiroFish](../dallar/05-yapay-zeka-altyapisi/mirofish/README.md) (tohum materyal +
  doğal dille istenen tahmin → rapor ve etkileşimli dünya üreten çok ajanlı motor; AGPL-3.0),
  [ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (MiroFish OpenAI uyumlu bir LLM uç noktası ister,
  `LLM_BASE_URL`; LLM kısmı Ollama'nın OpenAI uyumlu ucuyla yerelleştirilebilir, denenmedi; hafıza grafiği her durumda
  Zep Cloud'da kalır).
- **Gelir modeli:** Senaryo başına 35.000 TL; ajans aboneliği 20.000 TL/ay.
- **İlk 10 müşteri:** Reklam ajanslarının strateji ekipleri; pazarlama konferansları; araştırma şirketleriyle ortaklık
  (gerçek araştırmadan önce ön eleme).
- **Riskler:** Sentetik paneller gerçek tüketiciyi temsil etmeyebilir: "tahmin" vaadi verilmez; MiroFish hafıza
  grafiği için Zep Cloud'a zorunlu bağımlıdır (`backend/app/config.py`, `7657031`: `ZEP_API_KEY` şart, `ZEP_API_URL`
  reddedilir), yani müşterinin lansman öncesi ürün ve fiyat bilgisi yurt dışındaki bir servise gider: gizlilik
  sözleşmesi ve müşterinin yazılı onayı şart, gerçek tüketici verisi kullanılmaz ya da KVKK md. 9 değerlendirilir;
  AGPL-3.0 (değiştirip ağ üzerinden hizmet olarak sunarsan kaynak kodu paylaşma yükümlülüğü); siyasi ya da kamuoyu
  yönlendirme amaçlı işler reddedilir.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 4 · 3 · 2 · 3 = **18**

### D06 — Ajan platformları ([dal](../dallar/06-ajan-platformlari/README.md))

<a id="f25"></a>

#### F25 · openclaw/openclaw — Esnaf mesaj ve randevu asistanı (MVP 04)

- **Fikir:** Mesajlaşma uygulamasından gelen "yarın 3'e yer var mı, saç kesimi kaç para" sorularını 7/24 yanıtlayan,
  randevuyu çakışmasız kuran, gerektiğinde işletme sahibine devreden asistan.
- **Kime:** Randevuyla çalışan, mesajları sahibinin ya da tek sekreterin yanıtladığı mikro işletmeler; ilk segment 1–3
  koltuklu berber ve kuaförler (güzellik salonu dahil), sonra diş muayenehanesi, veteriner ve 24:00'e kadar açık halı
  saha. Persona: Kadıköy'de iki koltuklu berber; ya da iki hekimli bir diş muayenehanesinin sekreteri.
- **Problem:** Mesajı yanıtlayan kişi aynı anda hizmeti veren kişi; cevapsız mesaj kaçan randevu, defterde çifte
  rezervasyon.
- **Çözüm:** Telegram botu + Türkçeye ayarlı kural tabanlı niyet bulma + açık "Evet" onayıyla çakışmasız randevu +
  insana devir; anlaşılmayan mesaj isteğe bağlı yerel modele gider ama model randevu kuramaz. İşletme bilgisi OpenClaw
  ve Hermes'in yüklediği beceri biçiminde de dışa aktarılır (ayrıntılar MVP README'sinde).
- **Kullanılan depolar:** [ollama/ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (isteğe bağlı yerel
  model: `/api/chat` ve salt okunur araç çağrısı), [openclaw/openclaw](../dallar/06-ajan-platformlari/openclaw/README.md)
  ve [NousResearch/hermes-agent](../dallar/06-ajan-platformlari/hermes-agent/README.md) (dışa aktarılan beceri
  klasörünün dosya biçimi, gerçek kurulumda uçtan uca denenmedi; Telegram kanalının kuyruk ve güvenlik kurallarından
  tasarım ilhamı), [anthropics/skills](../dallar/08-ajan-becerileri/anthropic-skills/README.md) (beceri ön bilgisinin
  doğrulama kuralları), [obra/superpowers](../dallar/08-ajan-becerileri/superpowers/README.md) (açıklama yalnızca "ne
  zaman kullanılır" der). Kanal Telegram Bot API'dir; 51 deponun biri değildir.
- **Gelir modeli:** Kurulum 2.500 TL (bir kez); Esnaf 699 TL/ay; Klinik 1.499 TL/ay; yerel model eki +600 TL/ay (KDV
  hariç).
- **İlk 10 müşteri:** Kendi semtindeki berber ve kuaförlere yerinde demo; esnaf ve meslek odaları; "DM'den randevu"
  yazan işletme hesapları.
- **Riskler:** Sağlık verisi (KVKK md. 6) → hassas veri modu, insana devir ve hukukçu onayı; MVP yalnızca Telegram'da
  çalışır, oysa esnafın müşterisi çoğunlukla WhatsApp'ta yazar (gözlem, doğrulanmadı): pazar puanı WhatsApp kanalına
  bağlıdır. Pilotta Telegram'a yönlendirme kabul görmezse WhatsApp Business Platform bağdaştırıcısı önce yapılır
  (platform kuralları ve mesaj ücretleri doğrulanmadı); dışa aktarılan beceriyi OpenClaw ya da Hermes'in WhatsApp kanalı
  üzerinden kullanmak da bir seçenektir (denenmedi). Hazır randevu uygulamaları ve WhatsApp Business'ın otomatik
  yanıtlarıyla rekabet.
- **MVP:** [04-esnaf-asistani](04-esnaf-asistani/README.md) · **Puan:** 5 · 4 · 5 · 3 · 3 · 3 = **23**

<a id="f26"></a>

#### F26 · NousResearch/hermes-agent — Mali müşavirlik büroları için prosedür öğrenen iç asistan

- **Fikir:** Büro çalışanlarının mesajlaşma uygulamasından yazdığı işleri (belge takibi, beyanname takvimi, sık sorulan
  sorular) yapan ve tekrarlanan işleri beceriye dönüştüren kendi sunucusunda çalışan bir asistan.
- **Kime:** 10–40 kişilik mali müşavirlik büroları. Persona: İzmir'de bir SMMM bürosunun ofis yöneticisi.
- **Problem:** Her ay aynı belge hatırlatmaları ve aynı sorular; büro bilgisi birkaç kişinin kafasında.
- **Çözüm:** Hermes'in deneyimden beceri üreten öğrenme döngüsü + büronun kendi notları + yerel model + hatırlatma
  akışları; her yeni beceri yönetici onayından geçer.
- **Kullanılan depolar:** [NousResearch/hermes-agent](../dallar/06-ajan-platformlari/hermes-agent/README.md)
  (deneyimden beceri oluşturan ve kullanırken iyileştiren ajan; mesajlaşma ağ geçidi),
  [ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (Ollama'nın `docs/integrations/hermes.mdx` belgesi),
  [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (takvim ve hatırlatmalar).
- **Gelir modeli:** Kurulum 30.000 TL + 2.500 TL/ay.
- **İlk 10 müşteri:** Mali müşavir odalarının eğitimleri; [F19](#f19) müşterileri; muhasebe yazılımı bayileri.
- **Riskler:** Mükellef verisi (KVKK, meslek sırrı) → yerel kurulum; ajanın yanlış bilgi vermesi → onay adımı; hızlı
  değişen açık kaynak proje; n8n büronun sunucusunda büronun adına kurulur ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında (beceri biçimi: [MVP 04](04-esnaf-asistani/README.md)) · **Puan:** 4 · 3 · 4 · 3 · 3 · 3 = **20**

<a id="f27"></a>

#### F27 · Significant-Gravitas/AutoGPT — E-ticaret müşteri hizmetleri için e-posta sınıflandırma ajanı kurulumu

- **Fikir:** Gelen müşteri e-postalarını (iade, kargo, fatura, şikâyet) sınıflandırıp taslak yanıt hazırlayan ve
  ilgili ekibe yönlendiren ajanı, müşterinin kendi altyapısında ve kendi iç kullanımı için tasarlayıp kurmak ve ekibi
  eğitmek; platformu müşteri işletir, biz barındırmayız.
- **Kime:** 5–30 kişilik e-ticaret firmalarının müşteri hizmetleri ekipleri. Persona: Bursa'da bir ev tekstili
  markasının müşteri hizmetleri sorumlusu.
- **Problem:** Kampanya dönemlerinde e-posta yığılıyor; aynı sorulara elle yanıt veriliyor.
- **Çözüm:** Hazır bloklarla görsel ajan akışı → sınıflandırma → taslak → insan onayı → yanıt; Türkçe kategori ve yanıt
  şablonları, ekip eğitimi.
- **Kullanılan depolar:** [Significant-Gravitas/AutoGPT](../dallar/06-ajan-platformlari/autogpt/README.md)
  (`autogpt_platform/` ajan platformu ve blokları, PolyForm Shield; platform dışındaki kısım, ör. `classic/`, MIT),
  [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (e-posta ve yardım masası bağlantıları; müşterinin
  sunucusunda müşterinin adına).
- **Gelir modeli:** Tasarım ve kurulum 35.000 TL (bir kez); isteğe bağlı iyileştirme danışmanlığı 3.000 TL/ay (akış ve
  şablon güncellemesi; platformu müşteri işletir).
- **İlk 10 müşteri:** E-ticaret toplulukları; [MVP 03](#f18) müşterileri; yardım masası yazılımı bayileri.
- **Riskler:** `autogpt_platform/` PolyForm Shield'dır (`autogpt_platform/LICENSE.md`, `9cb76f9`): kişisel ve iç iş
  kullanımı serbest, ama AutoGPT'yle ya da lisans verenin bu yazılımla sunduğu ürünlerle rekabet eden ürün sağlamak
  yasaktır; ücretsiz ya da başka bir arayüzle sunulan ürün de rekabet sayılır. Lisans veren ücretli, barındırılan bir
  Platform ve e-posta taslağı hazırlayan hazır bir "Executive Assistant" uzmanı sunuyor (README); bu yüzden barındırma
  ve işletme satılmaz, danışmanlığın "rekabet eden ürün" sayılıp sayılmadığı avukatla incelenir ya da çözüm MIT
  lisanslı kısım, n8n veya kendi kodumuz üzerine kurulur (doğrulanmadı); müşteri verisi (KVKK); n8n lisansı için
  [n8n notu](#n8n-lisansi).
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 3 · 2 · 2 = **18**

### D07 — Kodlama ajanları ([dal](../dallar/07-kodlama-ajanlari/README.md))

<a id="f28"></a>

#### F28 · anomalyco/opencode — Kodu dışarı çıkamayan kurumlar için kurum içi kodlama ajanı

- **Fikir:** Açık kaynak kodlama ajanını kurumun kendi model sunucusuna bağlayıp izin, denetim kaydı ve ekip kurallarıyla
  kurmak.
- **Kime:** Bankaların, sigorta şirketlerinin, savunma ve kamu kurumlarının yazılım birimleri. Persona: bir katılım
  bankasının yazılım geliştirme müdürü.
- **Problem:** Geliştiriciler yapay zekâ kodlama araçlarını kullanmak istiyor; güvenlik politikası buluta kod
  göndermeyi yasaklıyor.
- **Çözüm:** opencode + kurum içi model sunucusu + salt okunur "plan" ajanıyla başlayan aşamalı yetki + [MVP 05](#f31)
  beceri paketi + eğitim.
- **Kullanılan depolar:** [anomalyco/opencode](../dallar/07-kodlama-ajanlari/opencode/README.md) (`build` ve salt okunur
  `plan` ajanları), [ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (`docs/integrations/opencode.mdx`:
  yerel modellerle bağlantı).
- **Gelir modeli:** Kurulum 300.000 TL + destek 25.000 TL/ay.
- **İlk 10 müşteri:** Bankacılık BT etkinlikleri; sistem entegratörleri; MVP 05 müşterileri.
- **Riskler:** Yerel modellerin kod kalitesi; uzun güvenlik onay süreçleri; BDDK'nın destek hizmeti ve bilgi sistemleri
  düzenlemeleri (doğrulanmalı).
- **MVP:** kısmen [05-ajan-kurulum-paketi](05-ajan-kurulum-paketi/README.md) · **Puan:** 4 · 2 · 4 · 3 · 4 · 4 = **21**

<a id="f29"></a>

#### F29 · ultraworkers/claw-code — Ajanlarla hızlı yazılmış kod tabanları için bağımsız denetim

- **Fikir:** Büyük kısmı yapay zekâ ajanlarıyla, az insan incelemesiyle yazılmış kod tabanlarına sabit fiyatlı güvenlik,
  lisans ve test denetimi; "insan kontrol noktaları" sürecini kurmak.
- **Kime:** Yatırım turu öncesi teknik inceleme bekleyen 2–10 kişilik girişimler. Persona: tohum yatırım arayan bir
  B2B SaaS girişiminin kurucu ortağı.
- **Problem:** Hızla birikmiş kodda sır sızıntısı, lisans karışıklığı, test boşlukları; yatırımcı teknik inceleme
  istiyor.
- **Çözüm:** Bağımlılık ve lisans taraması, sır taraması, test kapsamı, mimari risk raporu, birleştirme öncesi insan onay
  kuralları.
- **Kullanılan depolar:** [ultraworkers/claw-code](../dallar/07-kodlama-ajanlari/claw-code/README.md) (kendini "ajan
  yönetimli müze sergisi" diye tanımlıyor; `PHILOSOPHY.md`'deki "insan yön verir, ajanlar çalışır" döngüsü ve
  `PARITY.md` gibi izlenebilirlik belgeleri bu denetimin ders malzemesi), [affaan-m/ECC](../dallar/08-ajan-becerileri/ecc/README.md)
  (güvenlik denetimleri), [obra/superpowers](../dallar/08-ajan-becerileri/superpowers/README.md) (TDD disiplini).
- **Gelir modeli:** Denetim 60.000–150.000 TL.
- **İlk 10 müşteri:** Hızlandırıcılar ve melek yatırımcı ağları (portföy şirketleri); girişim etkinlikleri.
- **Riskler:** Denetim sorumluluğu (sözleşmeyle sınırlandırma); kapsamın belirsizliği.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 3 · 3 · 4 = **22**

<a id="f30"></a>

#### F30 · deepseek-ai/deepseek-harness — Kurum içi sistemlere bağlanan eklenti paketleri

- **Fikir:** "Her şey bir eklentidir" mimarisindeki ajana kurumun iş takip sistemi, iç dokümantasyonu ve test
  ortamları için eklentiler yazmak.
- **Kime:** Maliyet hassas 10–50 kişilik yazılım evleri. Persona: Ankara'da 30 kişilik bir yazılım evinin CTO'su.
- **Problem:** Ajan iç sistemlere bağlanmadıkça verimi düşük; her ajan için entegrasyonu baştan yazmak pahalı.
- **Çözüm:** Eklenti başına sabit fiyat; açık kaynak çekirdek eklentiler + ücretli kurumsal eklentiler + bakım.
- **Kullanılan depolar:** [deepseek-ai/deepseek-harness](../dallar/07-kodlama-ajanlari/deepseek-harness/README.md)
  (Cordis tabanlı eklenti mimarisi; README'de "developer preview" ve uyumluluğu bozan değişiklik uyarısı, `SAFETY.md`),
  [anthropics/skills](../dallar/08-ajan-becerileri/anthropic-skills/README.md) (beceri biçimi karşılaştırması).
- **Gelir modeli:** Eklenti başına 40.000 TL; bakım 5.000 TL/ay.
- **İlk 10 müşteri:** `dsh-plugin` konu etiketli depoların sahipleri; yazılım topluluk buluşmaları.
- **Riskler:** Geliştirici önizlemesi: API kırılır, bakım maliyeti yüksek; küçük pazar.
- **MVP:** fikir aşamasında · **Puan:** 2 · 3 · 5 · 3 · 3 · 5 = **21**

### D08 — Ajan becerileri ([dal](../dallar/08-ajan-becerileri/README.md))

<a id="f31"></a>

#### F31 · anthropics/skills — Yazılım ekipleri için AI kodlama ajanı kurulum paketi (MVP 05)

- **Fikir:** Bir depoyu okuyup ona uyarlanmış talimat dosyası, başlangıç becerileri (TDD, hata ayıklama, kod
  inceleme), güvenlik kancası ve ekip rehberi üreten; var olan becerileri ve kancaları denetleyen araç + danışmanlık.
- **Kime:** Türkiye'deki 10–50 kişilik yazılım ajansları, 5–50 kişilik ürün ekipleri ve bu kurulumu müşterilerine
  hizmet olarak satan serbest danışmanlar. Persona: İzmir'de 18 kişilik bir ajansın teknik direktörü (altı müşteri
  projesi, dört farklı yığın); KOBİ'lere atölye veren serbest danışman.
- **Problem:** Herkes farklı ajan kullanıyor; talimat dosyası yok ya da eski; internetten bulunan beceriler ve kancalar
  okunmadan kuruluyor (tedarik zinciri riski).
- **Çözüm:** Analiz → üretim (`AGENTS.md`, başlangıç becerileri, güvenlik kancası, izin ayarları, ekip rehberi) →
  denetim → ekip atölyesi → ölçüm (ayrıntılar MVP README'sinde).
- **Kullanılan depolar:** [anthropics/skills](../dallar/08-ajan-becerileri/anthropic-skills/README.md) (`SKILL.md`
  biçimi ve `skills/skill-creator/scripts/quick_validate.py`'deki ön bilgi kuralları; kökte lisans dosyası yok, beceri
  klasörlerindeki `LICENSE.txt` dosyaları Apache-2.0: belge becerileri `docx`/`pdf`/`pptx`/`xlsx` de incelenen
  `2c5958e` commit'iyle Apache-2.0'a taşındı, `doc-coauthoring`'de lisans dosyası yok),
  [obra/superpowers](../dallar/08-ajan-becerileri/superpowers/README.md) ve
  [mattpocock/skills](../dallar/08-ajan-becerileri/mattpocock-skills/README.md) (TDD, hata ayıklama ve inceleme
  yöntemi; kanca mimarisi), [affaan-m/ECC](../dallar/08-ajan-becerileri/ecc/README.md) (kanca çıkış kodları, güvenlik
  risk kalıpları), [multica-ai/andrej-karpathy-skills](../dallar/08-ajan-becerileri/karpathy-skills/README.md)
  (`AGENTS.md` çalışma kuralları), [anomalyco/opencode](../dallar/07-kodlama-ajanlari/opencode/README.md)
  (`opencode.json` izin biçimi, beceri ad kuralı),
  [openclaw/openclaw](../dallar/06-ajan-platformlari/openclaw/README.md) (`.claude/skills` → `.agents/skills` bağı),
  [NousResearch/hermes-agent](../dallar/06-ajan-platformlari/hermes-agent/README.md) (görünmez karakter ve sembolik
  bağ denetimi, `hermes skills trust` notu); react/react, n8n-io/n8n, Significant-Gravitas/AutoGPT ve
  vinta/awesome-python'daki ayar dosyaları biçim örneği. Metin ve kod kopyalanmadı; biçim, kural ve yöntem özgün olarak
  yeniden yazıldı.
- **Gelir modeli:** Depo kurulumu 18.000 TL; ekip paketi 60.000 TL; bakım ve denetim 9.000 TL/ay; danışman lisansı
  4.000 TL/ay (KDV hariç).
- **İlk 10 müşteri:** Teknoparklardaki yazılım firmalarına seminer; topluluk buluşmalarında canlı demo; LinkedIn'de
  teknik direktörlere elle yazılmış mesajla ücretsiz denetim raporu.
- **Riskler:** Ajan araçları ve biçimleri hızla değişiyor (MVP'deki kaynak kayması testi bunu yakalar); güvenlik
  kancası bir emniyet kemeridir, güvenlik sınırı değildir; müşteri kodunun bulut modele gitmemesi gereken durumlar
  (NDA, KVKK md. 9, bankacılık sırrı); kolay taklit, ajanların kendi `/init` komutlarıyla rekabet.
- **MVP:** [05-ajan-kurulum-paketi](05-ajan-kurulum-paketi/README.md) · **Puan:** 4 · 5 · 5 · 4 · 2 · 4 = **24**

<a id="f32"></a>

#### F32 · obra/superpowers — "Ajanla disiplinli geliştirme" ekip eğitimi ve koçluğu

- **Fikir:** Yapay zekâ kodlama aracı alan ama verim alamayan ekiplere beyin fırtınası → plan → TDD ile uygulama →
  inceleme döngüsünü öğretmek ve 4 hafta koçluk yapmak.
- **Kime:** 10–40 kişilik ürün ekiplerinin mühendislik müdürleri. Persona: İstanbul'da bir e-ticaret yazılım ekibinin
  mühendislik müdürü.
- **Problem:** Ajan hızlı ama özensiz kod üretiyor: testsiz değişiklik, dev PR'lar, plansız işler.
- **Çözüm:** 2 günlük uygulamalı eğitim + ekip kurallarına uyarlanmış beceri seti + ölçüm (PR boyutu, geri alınan
  değişiklik, hata oranı).
- **Kullanılan depolar:** [obra/superpowers](../dallar/08-ajan-becerileri/superpowers/README.md) (birleştirilebilir
  beceriler üzerine kurulu geliştirme yöntemi; README'deki "Commercial Services" bölümü kurucunun da kurumsal destek
  sunduğunu gösterir: rakip ya da iş ortağı olarak değerlendirilmeli),
  [karpathy-skills](../dallar/08-ajan-becerileri/karpathy-skills/README.md).
- **Gelir modeli:** Ekip eğitimi 120.000 TL; koçluk 15.000 TL/hafta.
- **İlk 10 müşteri:** [MVP 05](#f31) müşterileri; mühendislik yöneticisi toplulukları; konferans atölyeleri.
- **Riskler:** Yöntem açık kaynak: savunma eğitmenin deneyimi; araçlar hızla değişiyor.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 4 · 2 · 5 = **23**

<a id="f33"></a>

#### F33 · mattpocock/skills — TypeScript ekipleri için kod tabanına özel beceri kütüphanesi

- **Fikir:** Şirketin kendi kalıplarını (hata yönetimi, test fabrikaları, API sözleşmeleri) bilen küçük, birleştirilebilir
  beceriler yazmak ve testlerle bakımını yapmak.
- **Kime:** TypeScript tek depo (monorepo) kullanan 15–60 kişilik ürün şirketleri. Persona: İstanbul'da bir B2B SaaS
  şirketinin kıdemli mühendisi.
- **Problem:** Genel beceriler şirketin kalıplarını bilmiyor; ajan her seferinde yanlış kalıbı üretiyor.
- **Çözüm:** Kod tabanı incelemesi → 10–20 beceri → her beceri için örnek görev ve beklenen çıktı (beceri testi) →
  aylık bakım.
- **Kullanılan depolar:** [mattpocock/skills](../dallar/08-ajan-becerileri/mattpocock-skills/README.md) ("küçük, kolay
  uyarlanır, birleştirilebilir" ilkesi; MIT), [anthropics/skills](../dallar/08-ajan-becerileri/anthropic-skills/README.md)
  (`spec/`).
- **Gelir modeli:** Paket 80.000 TL + bakım 8.000 TL/ay.
- **İlk 10 müşteri:** TypeScript buluşmaları; [MVP 05](#f31) müşterileri; açık kaynak katkısıyla görünürlük.
- **Riskler:** Türkiye'de TypeScript ağırlıklı ekip sayısı sınırlı (varsayım); beceri biçimleri değişiyor; şirket
  bilgisinin gizliliği (NDA).
- **MVP:** fikir aşamasında · **Puan:** 2 · 4 · 5 · 4 · 3 · 5 = **23**

<a id="f34"></a>

#### F34 · affaan-m/ECC — Ajan kullanımında maliyet ve güvenlik denetimi

- **Fikir:** Kodlama ajanlarının yapılandırmasını, izinlerini, kancalarını ve bağlam alışkanlıklarını inceleyip maliyeti
  ve sır sızıntısı riskini düşürmek.
- **Kime:** Yapay zekâ API faturası ciddi boyuta ulaşan 20–200 geliştiricili şirketler. Persona: bir fintech'in platform
  mühendisliği lideri.
- **Problem:** Maliyet öngörülemiyor; ajanlar fazla yetkiyle çalışıyor; ortam dosyalarındaki sırlar risk altında.
- **Çözüm:** Denetim raporu + izin listeleri + güvenlik kancaları + aylık maliyet panosu.
- **Kullanılan depolar:** [affaan-m/ECC](../dallar/08-ajan-becerileri/ecc/README.md) (ajan çalışma ortamı için
  performans optimizasyonu: beceriler, hafıza, güvenlik, kancalar), [karpathy-skills](../dallar/08-ajan-becerileri/karpathy-skills/README.md),
  [opencode](../dallar/07-kodlama-ajanlari/opencode/README.md).
- **Gelir modeli:** Denetim 70.000 TL; aylık izleme 10.000 TL.
- **İlk 10 müşteri:** Platform mühendisliği toplulukları; [MVP 05](#f31) müşterileri; bulut maliyet danışmanlarıyla
  ortaklık.
- **Riskler:** Kesin tasarruf vaadi verilmemeli; erişim için gizlilik sözleşmesi; araçların hızlı değişimi.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 3 · 3 · 5 = **23**

<a id="f35"></a>

#### F35 · multica-ai/andrej-karpathy-skills — Depoya özel talimat dosyası yazımı ve ölçümü

- **Fikir:** Sabit fiyatlı küçük hizmet: depo incelemesi → tek talimat dosyası (`CLAUDE.md`/`AGENTS.md`) → 10 örnek
  görevle önce/sonra karşılaştırması.
- **Kime:** Serbest geliştiriciler ve küçük ajanslar. Persona: 3 kişilik bir mobil ajansın kurucusu.
- **Problem:** Tek bir talimat dosyası ajan davranışını çok etkiliyor ama ekipler ne yazacağını bilmiyor.
- **Çözüm:** Karpathy gözlemlerine dayanan dört ilke ("Think Before Coding", "Simplicity First", "Surgical Changes",
  "Goal-Driven Execution") + projeye özgü kurallar + ölçüm.
- **Kullanılan depolar:** [multica-ai/andrej-karpathy-skills](../dallar/08-ajan-becerileri/karpathy-skills/README.md)
  (tek dosyalık yaklaşım; README'ye göre MIT ama depoda lisans dosyası yok, metin kopyalanmaz),
  [affaan-m/ECC](../dallar/08-ajan-becerileri/ecc/README.md).
- **Gelir modeli:** Depo başına 7.500 TL; aylık güncelleme 1.000 TL.
- **İlk 10 müşteri:** Geliştirici toplulukları; serbest çalışma platformları; kısa video içerikleri.
- **Riskler:** Giriş bariyeri çok düşük (herkes yazabilir); ölçüm yöntemi şeffaf olmalı; büyük paketin
  ([MVP 05](#f31)) giriş ürünü olarak daha anlamlı.
- **MVP:** fikir aşamasında · **Puan:** 2 · 5 · 5 · 5 · 1 · 5 = **23**

### D09 — Bilgisayar bilimi ([dal](../dallar/09-bilgisayar-bilimi/README.md))

<a id="f36"></a>

#### F36 · TheAlgorithms/Python — Türkçe geri bildirimli algoritma ödevi değerlendirici

- **Fikir:** Algoritma ve veri yapıları ödevlerini testlerle, karmaşıklık ölçümüyle ve Türkçe açıklamalı geri bildirimle
  değerlendiren, kopya şüphesini işaretleyen araç.
- **Kime:** Bilgisayar mühendisliği bölümleri ve programlama kursları. Persona: bir vakıf üniversitesinde 180 öğrencili
  "Algoritmalar" dersinin araştırma görevlisi.
- **Problem:** Yüzlerce ödevin elle okunması; geç geri bildirim; kopya tespiti zor.
- **Çözüm:** Ödev başına test seti + girdi boyutuna göre süre ölçümü + benzerlik analizi + öğrenme yönetim sistemine not
  aktarımı.
- **Kullanılan depolar:** [TheAlgorithms/Python](../dallar/09-bilgisayar-bilimi/thealgorithms-python/README.md) (referans
  çözümler; `CONTRIBUTING.md`'nin istediği doctest kültürü değerlendirme testlerine model; MIT),
  [javascript-algorithms](../dallar/09-bilgisayar-bilimi/javascript-algorithms/README.md),
  [ollama](../dallar/05-yapay-zeka-altyapisi/ollama/README.md) (geri bildirimi Türkçe açıklama).
- **Gelir modeli:** Ders başına dönemlik 15.000 TL; kurum lisansı 150.000 TL/yıl.
- **İlk 10 müşteri:** Bölüm başkanlıkları; araştırma görevlisi ağları; programlama kursları.
- **Riskler:** Öğrenci kodu ve notu kişisel veri (kurum içi kurulum); kamu üniversitelerinde satın alma ihale ile olur
  ([MVP 01](#f17) burada da işe yarar).
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 3 · 3 · 4 = **21**

<a id="f37"></a>

#### F37 · trekhleb/javascript-algorithms — Lise bilişim öğretmenleri için görselleştirmeli algoritma ders paketi

- **Fikir:** Sıralama, arama ve grafları tarayıcıda adım adım gösteren etkinlikler + öğretmen kılavuzu + ölçme soruları.
- **Kime:** Bilişim teknolojileri öğretmenleri ve özel okullar. Persona: İzmir'de bir özel lisenin bilişim zümre
  başkanı.
- **Problem:** Türkçe, derste doğrudan kullanılabilecek görselleştirmeli etkinlik az (varsayım).
- **Çözüm:** Okul lisansıyla web paketi; öğrenciden kişisel veri toplamayan tasarım.
- **Kullanılan depolar:** [trekhleb/javascript-algorithms](../dallar/09-bilgisayar-bilimi/javascript-algorithms/README.md)
  (açıklamalı uygulamalar; MIT, atıfla kullanılabilir), [vuejs/core](../dallar/01-web-arayuzu/vue3-core/README.md)
  (arayüz), [TheAlgorithms/Python](../dallar/09-bilgisayar-bilimi/thealgorithms-python/README.md).
- **Gelir modeli:** Okul lisansı 8.000 TL/yıl; öğretmen eğitimi 25.000 TL/gün.
- **İlk 10 müşteri:** Özel okul zincirleri; öğretmen toplulukları; eğitim teknolojisi fuarları.
- **Riskler:** Kamu okullarında satın alma zor; müfredat uyumu (doğrulanmalı); çocuk verisi toplanmamalı.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 4 · 2 · 4 = **21**

<a id="f38"></a>

#### F38 · jwasham/coding-interview-university — Teknik mülakat soru bankası ve puanlama rubriği aracı

- **Fikir:** İşe alım tarafına: role ve seviyeye göre konu haritası, özgün soru bankası, puanlama rubriği, mülakatçı
  kalibrasyonu, adaya geri bildirim şablonu.
- **Kime:** Yılda 10+ geliştirici işe alan şirketlerin İK ve teknik işe alım sorumluları. Persona: Ankara'da yılda 15–25
  geliştirici alan 120 kişilik bir yazılım firmasının teknik işe alım sorumlusu.
- **Problem:** Mülakatlar kişiden kişiye değişiyor; değerlendirme tutarsız; yanlış işe alımın maliyeti yüksek.
- **Çözüm:** Konu kapsamı CIU'nun çalışma planından esinlenir, sorular ve rubrikler özgün yazılır.
- **Kullanılan depolar:** [jwasham/coding-interview-university](../dallar/09-bilgisayar-bilimi/coding-interview-university/README.md)
  (konu kapsamı; CC BY-SA 4.0 olduğundan uyarlanan içerik aynı lisansla paylaşılmalı, bu yüzden soru bankası özgün),
  [system-design-primer](../dallar/09-bilgisayar-bilimi/system-design-primer/README.md).
- **Gelir modeli:** Kurulum 30.000 TL + 2.500 TL/ay (5 mülakatçı).
- **İlk 10 müşteri:** İK teknolojisi etkinlikleri; [F10](#f10) müşterileri; teknopark firmaları.
- **Riskler:** Mülakat notları kişisel veri (KVKK, saklama süresi); ayrımcılık yasağına uygun soru seçimi; teknik
  değerlendirme platformlarıyla rekabet.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 4 · 2 · 4 = **22**

<a id="f39"></a>

#### F39 · ossu/computer-science — Kariyer değiştiren yetişkinler için mentorlu OSSU çalışma grupları

- **Fikir:** OSSU sırasını izleyen 12 haftalık kohortlar: haftalık canlı oturum, özgün Türkçe çalışma notları, proje
  değerlendirme, mentor eşleşmesi.
- **Kime:** 25–40 yaş arası, başka meslekten yazılıma geçmek isteyenler. Persona: Ankara'da akşamları çalışan 32
  yaşında bir muhasebe uzmanı.
- **Problem:** Ücretsiz müfredat var ama yalnız çalışanlar yarıda bırakıyor; rehberlik ve akran grubu yok.
- **Çözüm:** Kohort + mentor + ilerleme takibi; işverenlerden burs sponsorluğu.
- **Kullanılan depolar:** [ossu/computer-science](../dallar/09-bilgisayar-bilimi/ossu-computer-science/README.md)
  (müfredat iskeleti; MIT), [EbookFoundation/free-programming-books](../dallar/10-kuratorluk-topluluk/free-programming-books/README.md)
  (`books/free-programming-books-tr.md` ve `courses/free-courses-tr.md` Türkçe kaynakları).
- **Gelir modeli:** Katılımcı başına 2.500 TL/ay; işveren sponsorlu burslar.
- **İlk 10 müşteri:** Kariyer değiştirme toplulukları; kısa video içerikleri; şehir buluşmaları.
- **Riskler:** Tamamlama oranı; "iş garantisi" gibi yanıltıcı vaat yok (6502 sayılı Tüketici Kanunu); mesafeli satış
  kuralları; katılımcıların ilerleme ve değerlendirme verisi için aydınlatma ve saklama süresi (KVKK), burs veren
  işverenle paylaşım yalnızca katılımcının açık rızasıyla.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 5 · 2 · 4 = **23**

<a id="f40"></a>

#### F40 · CyC2018/CS-Notes — Türkçe mülakat temelleri için aralıklı tekrar uygulaması

- **Fikir:** İşletim sistemi, ağ, veritabanı ve sistem tasarımı temel sorularını özgün Türkçe kartlarla ve aralıklı
  tekrarla çalıştıran mobil uygulama.
- **Kime:** Son sınıf öğrencileri ve junior geliştiriciler. Persona: Konya'da bilgisayar mühendisliği son sınıf
  öğrencisi.
- **Problem:** Temel konular mülakatta soruluyor; kısa, Türkçe, tekrar odaklı kaynak az (varsayım).
- **Çözüm:** 600 özgün kart, haftalık deneme mülakatı; [MVP 02](02-ders-notu/README.md)'nin Anki çıktısıyla uyumlu
  biçim.
- **Kullanılan depolar:** [CyC2018/CS-Notes](../dallar/09-bilgisayar-bilimi/cs-notes/README.md) (konu haritası için
  ilham; içerik CC BY-NC-SA 4.0 olduğundan ticari üründe kullanılmaz),
  [system-design-primer](../dallar/09-bilgisayar-bilimi/system-design-primer/README.md) (CC BY 4.0: atıfla
  uyarlanabilir).
- **Gelir modeli:** Ücretsiz katman + 149 TL/ay.
- **İlk 10 müşteri:** Üniversite toplulukları ve kariyer günleri; kısa video içerikleri.
- **Riskler:** Bireysel kullanıcının ödeme isteği düşük; içerik üretimi pahalı; CS-Notes içeriğini kullanmak lisans
  ihlali olur; abonelik tüketiciye mesafeli satıştır (6502 sayılı Kanun: ön bilgilendirme, cayma ve abonelik iptali;
  ayrıntı doğrulanmadı); kullanıcı ve kullanım verisi için KVKK aydınlatması, yurt dışındaki analitik servislerinde md. 9.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 4 · 4 · 2 · 4 = **20**

<a id="f41"></a>

#### F41 · jackfrued/Python-100-Days — Beyaz yaka için "100 günde Python ile ofis otomasyonu" kampı

- **Fikir:** Günde 30 dakikalık, 100 günlük özgün Türkçe program; her katılımcı kendi işinden bir otomasyonu teslim eder.
- **Kime:** Finans, İK ve satın alma ekiplerinin Excel ağırlıklı çalışanları. Persona: bir holdingin finans biriminde
  raporlama uzmanı.
- **Problem:** Aynı raporlar her ay elle hazırlanıyor; BT kuyruğu uzun.
- **Çözüm:** Python temelleri → pandas → Excel/PDF otomasyonu (markitdown ile PDF'ten metin) → zamanlanmış raporlar
  (n8n) → final projesi.
- **Kullanılan depolar:** [jackfrued/Python-100-Days](../dallar/09-bilgisayar-bilimi/python-100-days/README.md)
  (100 günlük yapı fikri; depoda lisans dosyası da README'de lisans beyanı da bulunmadığından içerik
  kullanılmaz),
  [microsoft/markitdown](../dallar/04-veri-araclari-otomasyon/markitdown/README.md),
  [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md) (katılımcının kendi şirketinde, iç kullanım için),
  [vinta/awesome-python](../dallar/10-kuratorluk-topluluk/awesome-python/README.md).
- **Gelir modeli:** Kişi başı 12.000 TL; 20 kişilik kurum kohortu 200.000 TL.
- **İlk 10 müşteri:** Holdinglerin eğitim akademileri; İK eğitim satın alma birimleri; LinkedIn.
- **Riskler:** Katılımcı devamlılığı; gerçek şirket verisi yerine anonim örneklerle çalışma (KVKK); n8n'i katılımcının
  şirketi kendi iç işi için kurar ([n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 3 · 5 · 5 · 2 · 4 = **23**

<a id="f42"></a>

#### F42 · donnemartin/system-design-primer — Kampanya dönemi yük hazırlık denetimi

- **Fikir:** Kasım indirimleri ve yılbaşı gibi trafik zirvelerinden önce e-ticaret sitesinin mimarisini ve yük
  dayanımını iki haftada denetlemek.
- **Kime:** Kampanya günlerinde yavaşlayan ya da çöken orta ölçekli e-ticaret siteleri. Persona: Bursa'da 40 kişilik
  bir giyim e-ticaret firmasının CTO'su.
- **Problem:** Trafik zirvesinde site yavaşlıyor, ciro kaybı; ekipte ölçekleme deneyimi yok.
- **Çözüm:** Mimari inceleme, yük testi, önbellek/CDN/kuyruk önerileri, kampanya günü kontrol listesi ve nöbet planı.
- **Kullanılan depolar:** [donnemartin/system-design-primer](../dallar/09-bilgisayar-bilimi/system-design-primer/README.md)
  (önbellekleme, yük dengeleme, kuyruk, veritabanı ölçekleme; CC BY 4.0, atıfla eğitim materyaline uyarlanabilir),
  [awesome-selfhosted](../dallar/10-kuratorluk-topluluk/awesome-selfhosted/README.md) (izleme araçları).
- **Gelir modeli:** Denetim 90.000–180.000 TL; kampanya günü nöbeti 40.000 TL.
- **İlk 10 müşteri:** [MVP 03](#f18) müşterileri (aynı segment); e-ticaret altyapı firmalarının iş ortakları;
  e-ticaret etkinlikleri.
- **Riskler:** Mevsimsel talep (Eylül–Kasım); "çökmez" garantisi verilemez; uzman bağımlılığı.
- **MVP:** fikir aşamasında · **Puan:** 4 · 4 · 5 · 3 · 3 · 5 = **24**

### D10 — Küratörlük ve topluluk ([dal](../dallar/10-kuratorluk-topluluk/README.md))

<a id="f43"></a>

#### F43 · sindresorhus/awesome — KOBİ'ler için Türkçe seçilmiş yazılım rehberi ve bülten

- **Fikir:** "awesome" listelerinin kabul kurallarına benzer açık ölçütlerle seçilmiş Türkçe KOBİ yazılım rehberi,
  aylık bülten ve karşılaştırma tabloları.
- **Kime:** Okur olarak araç arayan KOBİ sahipleri; gelir tarafında KOBİ'ye yazılım satan şirketler (etiketli
  sponsorluk). Ödeyen persona: KOBİ'lere ön muhasebe yazılımı satan yerli bir SaaS şirketinin pazarlama müdürü. Okur
  persona: Konya'da 12 çalışanlı bir hırdavat toptancısının sahibi.
- **Problem:** "Hangi muhasebe, CRM ya da e-ticaret aracı?" sorusunun cevabı reklamlara gömülü; bağımsız Türkçe liste az
  (varsayım).
- **Çözüm:** Kabul ölçütleri (lisans, Türkçe destek, veri konumu, fiyat şeffaflığı) + düzenli güncelleme + bülten.
- **Kullanılan depolar:** [sindresorhus/awesome](../dallar/10-kuratorluk-topluluk/awesome/README.md) (liste biçimi,
  katkı kuralları; PR şablonundaki `awesome-lint` denetimi; CC0),
  [awesome-selfhosted](../dallar/10-kuratorluk-topluluk/awesome-selfhosted/README.md) (açık kaynak alternatifler).
- **Gelir modeli:** Satıcı başına etiketli sponsorluk 7.500 TL/ay; ücretli karşılaştırma raporları.
- **İlk 10 müşteri:** Sponsor: KOBİ'ye satış yapan yerli SaaS'lar. Okur: KOBİ dernekleri, LinkedIn.
- **Riskler:** Tarafsızlık algısı (sponsorlu içerik açıkça etiketlenmeli; örtülü reklam yasağı); güncel tutma maliyeti;
  sponsorlu tanıtım taşıyan bülten ticari elektronik ileti sayılabilir: 6563 sayılı Kanun uyarınca önceden onay, İYS
  kuralları ve her iletide ret yolu (doğrulanmadı); abone listesi kişisel veridir (KVKK aydınlatma).
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 5 · 3 · 4 = **23**

<a id="f44"></a>

#### F44 · vinta/awesome-python — Python projeleri için bağımlılık sağlığı ve alternatif önerisi raporu

- **Fikir:** `requirements.txt`/`pyproject.toml` dosyasını tarayıp bakımsız, lisansı riskli ya da güvenlik açığı olan
  paketleri ve yerlerine geçebilecek alternatifleri aylık raporlamak.
- **Kime:** Python kod tabanı olan ajans ve ürün ekipleri. Persona: Django tabanlı B2B uygulaması olan 12 kişilik
  ekibin teknik lideri.
- **Problem:** Bağımlılıklar yaşlanıyor; neyin yerine ne konacağı bilinmiyor.
- **Çözüm:** Paket başına bakım durumu, lisans uyumu ve aynı kategoriden alternatif + güncelleme PR önerisi.
- **Kullanılan depolar:** [vinta/awesome-python](../dallar/10-kuratorluk-topluluk/awesome-python/README.md) (kategori ↔
  paket eşlemesi; CC BY 4.0, atıfla kullanılabilir), [n8n](../dallar/04-veri-araclari-otomasyon/n8n/README.md)
  (aylık rapor akışının prototipi).
- **Gelir modeli:** Depo başına 750 TL/ay.
- **İlk 10 müşteri:** Python ve Django buluşmaları; ajanslar; [F42](#f42) ve [MVP 05](#f31) müşterileri.
- **Riskler:** Ücretsiz bağımlılık güncelleme botlarıyla rekabet (fark: alternatif önerisi, lisans, Türkçe rapor);
  zayıf savunma; müşteri deposuna erişen rapor sunucumuzda n8n'le değil kendi kodumuzla üretilir
  ([n8n notu](#n8n-lisansi)); depo erişimi için gizlilik sözleşmesi ve salt okunur yetki.
- **MVP:** fikir aşamasında · **Puan:** 2 · 4 · 5 · 4 · 2 · 5 = **22**

<a id="f45"></a>

#### F45 · avelino/awesome-go — Darboğaz servisleri Go'ya taşıma atölyesi ve servis şablonu

- **Fikir:** PHP/Java monolitteki darboğaz servisi Go'ya taşımak isteyen ekibe 3 günlük atölye, üretime hazır servis
  şablonu ve ilk servisin birlikte taşınması.
- **Kime:** Yüksek trafikli e-ticaret ve fintech ekipleri. Persona: Ankara'da ödeme altyapısı geliştiren 25 kişilik
  bir fintech'in yazılım mimarı.
- **Problem:** Go ekosisteminde kütüphane seçimi ve kalıplar konusunda deneyim yok; yeniden yazım korkutuyor.
- **Çözüm:** Yapılandırma, log, metrik, test ve CI içeren şablon + bakım ölçütlerine göre kütüphane seçim raporu.
- **Kullanılan depolar:** [avelino/awesome-go](../dallar/10-kuratorluk-topluluk/awesome-go/README.md) (kategoriler ve
  `CONTRIBUTING.md`'deki "Quality standards" ölçütleri; MIT),
  [system-design-primer](../dallar/09-bilgisayar-bilimi/system-design-primer/README.md).
- **Gelir modeli:** Atölye 150.000 TL; şablon lisansı 40.000 TL; danışmanlık 15.000 TL/gün.
- **İlk 10 müşteri:** Go buluşmaları; fintech etkinlikleri; [F42](#f42) müşterileri.
- **Riskler:** Yeniden yazım projeleri başarısız olabilir: kapsam tek darboğaz servisle sınırlanır; uzman bulmak zor.
- **MVP:** fikir aşamasında · **Puan:** 3 · 3 · 5 · 3 · 3 · 5 = **22**

<a id="f46"></a>

#### F46 · awesome-selfhosted/awesome-selfhosted — Bürolar için "veri yurt içinde" açık kaynak ofis paketi

- **Fikir:** Dosya paylaşımı, takvim, parola yönetimi ve belge arşivini yurt içindeki bir sunucuda (ya da ofiste) açık
  kaynak yazılımlarla kurup yönetilen hizmet olarak işletmek.
- **Kime:** 10–50 kişilik muhasebe ve hukuk büroları. Persona: İzmir'de 18 kişilik bir mali müşavirlik bürosunun ortağı.
- **Problem:** Veriler yabancı bulut servislerinde (KVKK yurt dışı aktarım kaygısı); abonelikler döviz bazlı.
- **Çözüm:** Nextcloud (dosya, takvim), Vaultwarden (parola), Paperless-ngx (belge arşivi), yedekleme, tek oturum açma;
  aylık bakım ve güvenlik güncellemeleri; [F23](#f23) yerel yapay zekâ kutusuyla birleştirilebilir.
- **Kullanılan depolar:** [awesome-selfhosted/awesome-selfhosted](../dallar/10-kuratorluk-topluluk/awesome-selfhosted/README.md)
  (lisans ve dil bilgisiyle seçim havuzu; üç yazılım da ana listede: Nextcloud AGPL-3.0, Vaultwarden ve Paperless-ngx
  GPL-3.0; liste CC BY-SA 3.0), [linux](../dallar/03-sistem-ag-guvenlik/linux/README.md) (sunucu).
- **Gelir modeli:** Kurulum 40.000 TL; kullanıcı başına 300 TL/ay yönetilen hizmet.
- **İlk 10 müşteri:** Mali müşavir ve baro etkinlikleri; büro yazılımı satıcıları; [F23](#f23) müşterileri.
- **Riskler:** Güvenlik ve yedekleme sorumluluğu (hizmet seviyesi sözleşmesi); AGPL lisanslı bileşenleri değiştirip
  hizmet olarak sunarken kaynak paylaşımı yükümlülüğü; destek yükü; büronun verisini biz işlediğimiz için veri işleme
  sözleşmesi (KVKK md. 12). Paket yalnızca açık kaynak lisanslı yazılımlardan oluşur: n8n gibi "fair-code" yazılımlar
  eklenmez, çünkü n8n'i barındırıp ücretli hizmet olarak sunmak Sustainable Use License'a aykırıdır (awesome-selfhosted
  da n8n'i ana listede değil `non-free.md`'de tutar; [n8n notu](#n8n-lisansi)).
- **MVP:** fikir aşamasında · **Puan:** 4 · 4 · 4 · 4 · 3 · 4 = **23**

<a id="f47"></a>

#### F47 · EbookFoundation/free-programming-books — Belediye kütüphaneleri için kişiye özel ücretsiz öğrenme planı

- **Fikir:** Seviye testinden sonra Türkçe ücretsiz kaynaklardan 8 haftalık öğrenme planı çıkaran, bağlantıları düzenli
  denetlenen bir kütüphane hizmeti.
- **Kime:** Belediye kütüphaneleri, gençlik merkezleri, halk eğitim kursları. Persona: bir büyükşehir belediyesinin
  kütüphane hizmetleri şube müdürü.
- **Problem:** "Yazılım öğrenmek istiyorum" diye gelen gence verilecek, seviyeye göre sıralı Türkçe bir plan yok;
  bağlantılar dağınık ve kırık.
- **Çözüm:** Seviye testi → plan → ilerleme takibi → kırık bağlantı izleme; yalnızca bağlantı verilir, içerik kopyalanmaz.
- **Kullanılan depolar:** [EbookFoundation/free-programming-books](../dallar/10-kuratorluk-topluluk/free-programming-books/README.md)
  (`books/free-programming-books-tr.md`, `courses/free-courses-tr.md`; CC BY 4.0),
  [build-your-own-x](../dallar/10-kuratorluk-topluluk/build-your-own-x/README.md),
  [project-based-learning](../dallar/10-kuratorluk-topluluk/project-based-learning/README.md).
- **Gelir modeli:** Kurum lisansı 60.000 TL/yıl + kütüphaneci eğitimi.
- **İlk 10 müşteri:** Belediyeler (satın alma ihale ya da doğrudan temin ile: [MVP 01](#f17) bağlantısı);
  kütüphaneciler dernekleri.
- **Riskler:** Kamu satış döngüsü uzun; 18 yaş altı kullanıcılar için veli onayı; bağlantıların kırılması.
- **MVP:** fikir aşamasında · **Puan:** 3 · 2 · 5 · 5 · 2 · 5 = **22**

<a id="f48"></a>

#### F48 · codecrafters-io/build-your-own-x — Junior mühendisler için "sıfırdan yap" onboarding programı

- **Fikir:** Yeni mezunlara 8 haftada HTTP sunucusu, anahtar-değer deposu, mini git ve mini React'i kendilerine
  yazdıran, testli ve kod incelemeli kurumsal program.
- **Kime:** Yılda 10+ yeni mezun alan yazılım şirketlerinin mühendislik eğitim sorumluları. Persona: İstanbul'da yılda
  12 yeni mezun alan bir bankacılık yazılımı firmasının mühendislik akademisi sorumlusu.
- **Problem:** Yeni mezun framework kullanıyor ama altındaki mekanizmayı bilmiyor; ilk aylarda verim düşük (varsayım).
- **Çözüm:** Haftalık "kendin yaz" projeleri + test paketleri + kod incelemesi; bu atlasın `sifirdan/` mini
  uygulamaları ders materyali.
- **Kullanılan depolar:** [codecrafters-io/build-your-own-x](../dallar/10-kuratorluk-topluluk/build-your-own-x/README.md)
  (rehber listesi; `LICENSE` dosyası yok ama README'nin "Origins & License" bölümü listeyi CC0 ile kamu malına bırakır,
  liste ticari üründe de kullanılabilir; bağlantı verilen her rehberin kendi lisansı vardır, rehberler kopyalanmaz),
  [Repo Atlası dalları](../AGAC.md) (`sifirdan/` klasörleri).
- **Gelir modeli:** Kişi başı 25.000 TL; 10 kişilik kohort 220.000 TL.
- **İlk 10 müşteri:** Teknopark firmaları; [F38](#f38) ve [F10](#f10) müşterileri.
- **Riskler:** CodeCrafters'ın kendi ücretli platformuyla rekabet; içerik üretimi yoğun.
- **MVP:** fikir aşamasında · **Puan:** 3 · 4 · 5 · 4 · 3 · 4 = **23**

<a id="f49"></a>

#### F49 · practical-tutorials/project-based-learning — Junior geliştiriciler için portföy projesi ve kod incelemesi aboneliği

- **Fikir:** Ayda bir gerçekçi proje, haftalık kıdemli mühendis kod incelemesi, demo günü; izin alındıktan sonra
  işverenlere portföy vitrini.
- **Kime:** İlk işini arayan kurs mezunları. Persona: İstanbul'da 3 aydır iş arayan 24 yaşında bir kurs mezunu.
- **Problem:** Portföyde aynı "yapılacaklar listesi" uygulaması; deneyimli geri bildirim yok.
- **Çözüm:** Listeden seçilen öğretici + "gerçek dünya" ek gereksinimleri + PR incelemesi + demo günü.
- **Kullanılan depolar:** [practical-tutorials/project-based-learning](../dallar/10-kuratorluk-topluluk/project-based-learning/README.md)
  (dile göre proje öğreticileri; MIT), [freeCodeCamp](../dallar/02-uygulama-platformlari/freecodecamp/README.md),
  [build-your-own-x](../dallar/10-kuratorluk-topluluk/build-your-own-x/README.md).
- **Gelir modeli:** Aday aboneliği 1.500 TL/ay. İşveren tarafı gelir (vitrin üzerinden işe alımda ücret) ancak özel
  istihdam bürosu izni alındıktan sonra ya da izinli bir büroyla ortaklıkla (bkz. Riskler).
- **İlk 10 müşteri:** Kurs mezun toplulukları; kariyer etkinlikleri; kısa video içerikleri.
- **Riskler:** Bireysel ödeme gücü; inceleyici bulmak; "iş garantisi" vaadi verilmez (6502 sayılı Kanun; abonelikte
  mesafeli satış ve cayma kuralları); adayı işverene tanıtıp bundan ücret almak iş ve işçi bulmaya aracılıktır ve 4904
  sayılı Türkiye İş Kurumu Kanunu uyarınca İŞKUR'dan özel istihdam bürosu izni gerektirir (doğrulanmadı, avukatla
  teyit edilmeli); izin yoksa yalnızca aday aboneliği; adayın portföyü ve inceleme notları işverenle yalnızca adayın
  açık rızasıyla paylaşılır (KVKK md. 5 ve 10).
- **MVP:** fikir aşamasında · **Puan:** 2 · 4 · 5 · 5 · 2 · 4 = **22**

<a id="f50"></a>

#### F50 · 521xueweihan/HelloGitHub — Türkçe aylık açık kaynak keşif dergisi

- **Fikir:** HelloGitHub'ın aylık sayı modeline benzer biçimde her ay 30 açık kaynak projeyi özgün Türkçe açıklamayla
  tanıtan, "Türkiye'den projeler" bölümü olan dergi ve bülten.
- **Kime:** Okur: Türk geliştiriciler ve öğrenciler. Gelir: işe alım yapan şirketler ve geliştirici aracı satanlar.
  Ödeyen persona: İstanbul'da geliştirici işe alan bir oyun şirketinin işveren markası yöneticisi. Okur persona:
  Eskişehir'de bilgisayar mühendisliği 3. sınıf öğrencisi.
- **Problem:** Giriş seviyesine uygun projeleri ve Türk geliştiricilerin projelerini düzenli görünür kılan Türkçe bir
  yayın az (varsayım).
- **Çözüm:** Web + e-posta bülteni + mesajlaşma kanalı; katkı rehberleri.
- **Kullanılan depolar:** [521xueweihan/HelloGitHub](../dallar/10-kuratorluk-topluluk/hellogithub/README.md) (aylık sayı
  üretim süreci ve kategori yapısı; içerik CC BY-NC-ND 4.0 olduğundan çevrilmez ve kopyalanmaz),
  [sindresorhus/awesome](../dallar/10-kuratorluk-topluluk/awesome/README.md).
- **Gelir modeli:** Sayı başına sponsor 15.000 TL; iş ilanı 5.000 TL.
- **İlk 10 müşteri:** Sponsor: geliştirici işe alan teknoloji şirketleri. Okur: üniversite toplulukları, sosyal medya.
- **Riskler:** Okur kitlesi oluşturmak zaman alır; editoryal emek; sponsorlu içerik açıkça etiketlenmeli (örtülü reklam
  yasağı); sponsorlu tanıtım taşıyan bülten ticari elektronik ileti sayılabilir: 6563 sayılı Kanun uyarınca önceden
  onay, İYS kuralları ve her iletide ret yolu (doğrulanmadı); abone listesi kişisel veridir (KVKK aydınlatma); iş
  ilanında aday verisi toplanmaz, başvuru doğrudan işverene gider (aracılık sayılmaması için; 4904 sayılı Kanun,
  doğrulanmadı).
- **MVP:** fikir aşamasında · **Puan:** 3 · 2 · 5 · 5 · 3 · 5 = **23**

<a id="f51"></a>

#### F51 · 996icu/996.ICU — Fazla mesai ve çalışma süresi uyum hesaplayıcı (MVP 06)

- **Fikir:** Haftalık çalışma çizelgesinden net süreyi, fazla çalışmayı, tahmini alacağı ve madde numaralı ihlal
  listesini çıkaran, tamamen tarayıcıda çalışan hesaplayıcı.
- **Kime:** Ödeyen müşteri: KOBİ bordrosunu yapan serbest mali müşavirler, KOBİ İK/bordro sorumluları ve iş hukuku
  büroları; ücretsiz kullanıcı: fazla çalışmasının karşılığını hesaplamak isteyen çalışanlar; kurumsal lisans:
  sendikalar. Persona: 40 KOBİ'nin bordrosunu yapan bir mali müşavir (ilk ödeyen müşteri); teslim haftalarında 12 saat
  çalışan bir yazılım geliştiricisi (ücretsiz kullanıcı).
- **Problem:** 4857 sayılı İş Kanunu'na göre haftalık çalışma en çok 45 saattir; aşan süre fazla çalışmadır ve her saati
  %50 zamlı ödenir, yıllık toplam 270 saati geçemez (md. 41 ve 63; güncel mevzuattan doğrulayın). Bu hesaplar çoğu
  yerde elle ve hatalı yapılıyor (varsayım).
- **Çözüm:** Vue 3 + Bootstrap 5 arayüz, saf JavaScript hesap motoru, madde numaralı ihlal listesi, CSV çıktısı; hesap
  tarayıcıda yapılır, girilen veri cihazdan çıkmaz. Kütüphaneler ilk açılışta CDN'den sürümü sabit ve SRI özetli
  yüklenir, bu yüzden sayfa ilk açılışta internet ister (ayrıntılar MVP README'sinde).
- **Kullanılan depolar:** [vuejs/core](../dallar/01-web-arayuzu/vue3-core/README.md) ve
  [twbs/bootstrap](../dallar/01-web-arayuzu/bootstrap/README.md) (çalışma zamanı bağımlılıkları: Vue 3.5.44 global
  yapısı ve Bootstrap 5.3.8 CSS), [996icu/996.ICU](../dallar/10-kuratorluk-topluluk/996-icu/README.md) (kod bağımlılığı
  yok: problem tanımı, "996 örneği" çizelgesi ve `blacklist/README.md`'deki fazla mesaiyi kanun maddeleriyle tanımlama
  yaklaşımı; deponun "Anti 996" lisansı, lisanslı işi kullananın çalışma mevzuatına uymasını şart koşar).
- **Gelir modeli:** Bireysel kullanım ücretsiz ve reklamsız; Müşavir/İK Pro 349 TL/ay; hukuk bürosu 1.250 TL/ay;
  sendika lisansı 40.000 TL/yıl (KDV hariç).
- **İlk 10 müşteri:** Hedef 6 mali müşavir, 3 hukuk bürosu, 1 sendika ya da çalışan hakları derneği: SMMM odalarının
  eğitim günleri ve bordro yazılımı kullanıcı grupları; baroların iş hukuku komisyonları; sendikaların eğitim ve hukuk
  birimleri. Çalışanlar ücretsiz kullanır, gelir değil görünürlük getirir.
- **Riskler:** Hesaplama hukuki görüş değildir; toplu iş sözleşmeleri, denkleştirme ve Yargıtay uygulamasına dayanan
  yöntemlerde yorum farkı (MVP'de "doğrulanmadı" diye işaretli); 4857 kapsamı dışındaki işler ve fazla çalışma
  yaptırılamayan işçiler ayırt edilmez; kişisel veri (çalışma saatleri) cihazda kalmalı, sunucudaki Pro sürümde veri
  işleme sözleşmesi gerekir; CDN'e ulaşılamazsa arayüz açılmaz.
- **MVP:** [06-mesai-hesap](06-mesai-hesap/README.md) · **Puan:** 4 · 4 · 5 · 4 · 2 · 4 = **23**

## 6. Kime göre dizin

Bir fikir birden çok segmente satılıyorsa her ilgili satırda yer alır.

| Müşteri segmenti                                         | Fikirler                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KOBİ (sektörden bağımsız)                                | [F12 e-posta/DNS](#f12) · [F13 dış yüzey kontrolü](#f13) · [F15 lisans uyumu](#f15) · [F19 otomasyon](#f19) · [F43 KOBİ yazılım rehberi (okur)](#f43)                                                                                                                                                                                                                                                                                                                          |
| KOBİ e-ticaret ve e-ihracat                              | [F18 fiyat radarı (MVP 03)](#f18) · [F42 yük denetimi](#f42) · [F01 erişilebilirlik](#f01) · [F27 e-posta sınıflandırma](#f27) · [F19 otomasyon](#f19) · [F12 e-posta/DNS](#f12)                                                                                                                                                                                                                                                                                               |
| Kamu ihalesine giren tedarikçi ve müteahhitler           | [F17 ihale analizcisi (MVP 01)](#f17)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Hukuk, mali müşavirlik, mimarlık ve mühendislik büroları | [F23 yerel yapay zekâ kutusu](#f23) · [F46 veri yurt içinde ofis](#f46) · [F26 prosedür asistanı](#f26) · [F19 otomasyon](#f19) · [F15 lisans uyumu](#f15) · [F51 mesai hesabı (MVP 06)](#f51)                                                                                                                                                                                                                                                                                 |
| Esnaf ve yerel hizmetler                                 | [F25 mesaj ve randevu asistanı (MVP 04)](#f25) · [F04 tek sayfalık site](#f04) · [F07 kafe sadakat uygulaması](#f07) · [F03 saha servis](#f03)                                                                                                                                                                                                                                                                                                                                 |
| Sağlık (klinik, muayenehane, veteriner)                  | [F25 randevu asistanı (MVP 04)](#f25) · [F13 dış yüzey kontrolü](#f13) · [F23 yerel yapay zekâ](#f23) · [F19 otomasyon](#f19)                                                                                                                                                                                                                                                                                                                                                  |
| Eğitim kurumları ve eğitmenler                           | [F16 ders notu (MVP 02)](#f16) · [F36 ödev değerlendirici](#f36) · [F37 algoritma paketi](#f37) · [F47 kütüphane öğrenme planı](#f47) · [F09 kodlama kampı](#f09)                                                                                                                                                                                                                                                                                                              |
| Kurumsal eğitim ve İK                                    | [F41 Python ofis otomasyonu](#f41) · [F05 JavaScript atölyesi](#f05) · [F48 onboarding](#f48) · [F10 kariyer basamakları](#f10) · [F38 mülakat rubriği](#f38) · [F16 ders notu, İSG videoları (MVP 02)](#f16) · [F51 mesai hesabı (MVP 06)](#f51)                                                                                                                                                                                                                              |
| Sanayi ve üretim                                         | [F21 kusur tespiti](#f21) · [F11 endüstriyel Linux bakımı](#f11) · [F14 eski yazılım belgeleme](#f14) · [F15 lisans uyumu](#f15)                                                                                                                                                                                                                                                                                                                                               |
| Yazılım ekipleri, ajanslar ve ürün şirketleri            | [F31 ajan kurulum paketi (MVP 05)](#f31) · [F02 Vue göçü](#f02) · [F06 VS Code eklentisi](#f06) · [F28 kurum içi ajan](#f28) · [F29 ajan kodu denetimi](#f29) · [F30 eklentiler](#f30) · [F32 ajanla disiplinli geliştirme eğitimi](#f32) · [F33 beceri kütüphanesi](#f33) · [F34 ajan maliyet ve güvenlik denetimi](#f34) · [F35 talimat dosyası](#f35) · [F44 bağımlılık sağlığı](#f44) · [F45 Go'ya taşıma](#f45) · [F08 geliştirici ortamı](#f08) · [F20 API izleme](#f20) |
| Bankacılık, sigorta ve kamu kurumları                    | [F28 kurum içi kodlama ajanı](#f28) · [F05 JavaScript atölyesi](#f05) · [F22 çağrı merkezi analizi](#f22)                                                                                                                                                                                                                                                                                                                                                                      |
| Çağrı merkezi ve müşteri hizmetleri                      | [F22 çağrı transkripsiyonu](#f22) · [F27 e-posta sınıflandırma](#f27)                                                                                                                                                                                                                                                                                                                                                                                                          |
| Pazarlama, ajans ve medya                                | [F24 sentetik tüketici paneli](#f24) · [F43 KOBİ yazılım rehberi (sponsor)](#f43) · [F50 açık kaynak dergisi (sponsor)](#f50) · [F18 fiyat radarı, ajans paketi (MVP 03)](#f18)                                                                                                                                                                                                                                                                                                |
| Kamu, belediye, STK ve sendikalar                        | [F09 kodlama kampı](#f09) · [F47 kütüphane öğrenme planı](#f47) · [F51 mesai hesabı, sendika lisansı (MVP 06)](#f51)                                                                                                                                                                                                                                                                                                                                                           |
| Bireysel geliştiriciler ve öğrenciler                    | [F39 OSSU çalışma grupları](#f39) · [F40 aralıklı tekrar](#f40) · [F49 portföy aboneliği](#f49) · [F35 talimat dosyası](#f35) · [F50 açık kaynak dergisi (okur)](#f50)                                                                                                                                                                                                                                                                                                         |
| Çalışanlar                                               | [F51 mesai hesabı, ücretsiz (MVP 06)](#f51)                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 7. Dürüst notlar ve sınırlar

- **Rakamlar varsayımdır.** Pazar büyüklüğü, süre, "çoğu firmada" gibi ifadeler ve tüm fiyatlar doğrulanmış veri
  değildir; "(varsayım)" yazmayan yerlerde de öyle okuyun. Her fikrin ilk adımı 10 müşteri görüşmesidir: sorun gerçekten
  var mı, bugün nasıl çözülüyor, ne kadar ödeniyor?
- **Hukuki notlar hukuki görüş değildir.** Anılan düzenlemeler (6698 sayılı KVKK, 5846 sayılı FSEK, 4734 sayılı Kamu
  İhale Kanunu, 4857 sayılı İş Kanunu, 4904 sayılı Türkiye İş Kurumu Kanunu, 6563 sayılı Elektronik Ticaret Kanunu, 6502
  sayılı Tüketici Kanunu, 5237 sayılı TCK, 4054 sayılı Rekabet Kanunu, AB Erişilebilirlik Yasası, BDDK düzenlemeleri)
  bu ortamda güncel metinlerinden doğrulanamadı; satıştan önce güncel metinlerinden ve bir avukatla doğrulanmalıdır.
- **Lisans bilgileri** depoların incelenen commit'indeki (9 Kasım 2026 anlık görüntüsü) lisans dosyalarından ve
  README'lerinden alındı (bkz. [ENVANTER.md](../ENVANTER.md)); lisanslar değişebilir. Lisans dosyası olmayan ama
  README'de lisans beyan eden depolar beyana göre değerlendirildi: build-your-own-x (CC0 feragati; ticari kullanım
  serbest), andrej-karpathy-skills (MIT; yine de metin kopyalanmaz), CS-Notes (CC BY-NC-SA 4.0) ve HelloGitHub (CC
  BY-NC-ND 4.0). "Yalnızca kişisel kullanım" (developer-roadmap), CC BY-NC(-ND/-SA) (You-Dont-Know-JS, CS-Notes,
  HelloGitHub) ve hiçbir lisans beyanı olmayan Python-100-Days **ticari ürünün içeriği olamaz**; bu kartlarda yalnızca
  bağlantı verilir ya da özgün içerik üretilir. Kaynağı açık ama ticari kullanımı kısıtlı iki lisans ayrıca dikkat
  ister: AutoGPT'nin `autogpt_platform/` klasöründeki PolyForm Shield (lisans verenle ve onun bu yazılımla sunduğu
  ürünlerle rekabet eden ürün yasak; [F27](#f27)) ve n8n'in Sustainable Use License'ı (aşağıda).
- <a id="n8n-lisansi"></a>**n8n lisansı.** n8n açık kaynak değil "fair-code"dur (README'nin "License" bölümü). `LICENSE.md`
  (`5ee06d3`) "Limitations" bölümü yazılımı yalnızca kendi iç iş amaçları ya da ticari olmayan ve kişisel kullanım için
  kullanmaya izin verir; başkasına ancak ücretsiz ve ticari olmayan amaçla dağıtılabilir; adında `.ee.` geçen dosyalar
  ayrı Enterprise lisansındadır. Katalogda üç kural uygulanır:
  1. **Müşterinin kendi kurulumu** ([F18](#f18)'in "kendi sunucunda" paketi, [F19](#f19), [F22](#f22), [F26](#f26),
     [F27](#f27), [F41](#f41)): n8n'i müşteri kendi sunucusuna kendisi kurar ve kendi iç işi için kullanır; biz iş
     akışı dosyası, kurulum, eğitim ve bakım danışmanlığı satarız. Danışmanlığın bu lisansla uyumlu olduğu, README'nin
     bağlantı verdiği lisans sayfasında (`docs.n8n.io/sustainable-use-license`) yazar (doğrulanmadı: internet yok).
  2. **Bizim sunucumuzda, ücretli hizmetin parçası** ([F03](#f03), [F04](#f04), [F07](#f07), [F12](#f12),
     [F20](#f20), [F44](#f44)): müşteri verisi ya da kimlik bilgileriyle çalışan ya da ürünün çekirdeği olan bir akış
     "kendi iç iş amacı" sayılmayabilir. n8n'den yazılı teyit ya da ticari lisans alınmadan barındırılan sürümde n8n
     kullanılmaz; aynı iş cron ve kendi kodumuzla yapılır ([MVP 03](03-fiyat-radar/README.md)'teki gibi), n8n akışı
     prototip ve kendi n8n'ini işleten müşteriler için şablon olarak kalır.
  3. **n8n'i barındırıp erişimini satmak** (beyaz etiket ya da "yönetilen n8n") hiçbir kartta yoktur; [F46](#f46) bu
     yüzden n8n içermez.
- **Etik çizgi.** Microsoft-Activation-Scripts ve REA kartları yalnızca yasal hizmetler önerir (lisans uyumu; sahibi
  olunan yazılımın belgelenmesi); hiçbir kart koruma aşmayı içermez. Tarama yapan MVP 03 robots.txt'e ve hız sınırına
  uyar, pazaryeri ilan sayfalarını taramaz; indirme yapan MVP 02 yalnızca müşterinin izin verdiği kendi alan adındaki
  sayfayı okur ve platform videolarını indirmez. Sentetik panel (F24) tahmin vaadi vermez ve kamuoyu yönlendirme
  işlerini reddeder.
- **MVP'ler prototiptir.** Testler birim ve entegrasyon düzeyindedir; bağımsız güvenlik denetimi (sızma testi), yük
  testi ve kullanıcı araştırması yapılmadı. Gerçek müşteri verisiyle çalıştırmadan önce KVKK değerlendirmesi ve
  güvenlik gözden geçirmesi gerekir.
