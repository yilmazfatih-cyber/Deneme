# Araştırma notu: LLM persona simülasyonu akımı ve Talp

Tarih: 2026-11-07. Bu not, persona katmanı mimarisine girdi olmak için derlendi. Kaynaklar sonda.

## 1. Talp ne yapıyor (talp.ai, Kasım 2026)

- Slogan: "We simulate human intent". Kendini "behavior analysis engine" ve "infrastructure for foresight" olarak tanımlıyor.
- Aylık 650+ kampanya, 5 sektör: E-ticaret, Havacılık, B2B, Medya, Perakende (Finans "yakında").
- Üç ürün merceği, tek motor:
  - **Ad Intelligence:** Personalar görsel, video ve oynanabilir reklamları "izler/oynar", kendi sözleriyle ne düşündüğünü söyler;
    segment bazında kanca, kurgu ve teklif karşılaştırması; "skor değil gerekçe".
  - **Product Intelligence:** Personalar siteye/uygulamaya bırakılır, "nasıl hareket ettiği, duraksadığı ve karar verdiği" izlenir;
    Figma bağlantısıyla tasarım aşamasında geri bildirim; binlerce koşudan A/B kazananı; sınırsız dijital odak grubu.
  - **Strategy Intelligence (kapalı test):** Pazar, segment ve konumlandırma kaymalarının nüfus ölçeğinde simülasyonu.
- Satış argümanı: "say-do gap" (söylenen ile yapılan arasındaki %40-45 fark), odak grubunun gizli maliyeti (~11 bin $, 21 gün).
- Açık sınır: B2B sayfasında "talp davranışı simüle eder, ödeme istekliliğini değil" diyor.
- Kurucu Baran Ataş'ın "Observer Effect in Market Research" yazısı: ölçmek davranışı değiştirir; araştırmacıyı süreçten
  çıkarıp davranışı bağlamında yakalamak gerekir. (Satıcı çerçevesi; bağımsız doğrulama yok.)
- SOC 2 ve GDPR uyumu "devam ediyor". Şirket Delaware (Wilmington) kayıtlı; ekip Türkiye kökenli; Temmuz 2026'da 20 M$ değerlemeyle
  pre-seed (Formus Capital, Sunshine Lake, Aito, a16z Scout Fund).

### Kariyer sayfası bulgusu

`talp.ai/sitemap.xml` yalnızca ana sayfa, tools, meet-us, privacy, terms ve 5 sektör sayfasını listeliyor; `/careers`, `/jobs` vb.
404 döndürüyor. İlanlar büyük olasılıkla LinkedIn şirket sayfasında (linkedin.com/company/gettalp); bu oturumdan LinkedIn'e
ağ erişimi yok. Bu yüzden rol şartları iki kaynaktan türetildi: (a) Talp'ın ürün sayfalarının ima ettiği yetkinlikler,
(b) aynı kategorideki Aaru'nun (NYC, 1 Mr$ değerleme) 2026 ilanları. Talp'ın gerçek ilan metinleri elinize geçerse
`01-roller.md` buna göre yeniden hizalanmalı.

## 2. Aynı kategorideki şirketlerin ilanlarından çıkan şartlar (Aaru, 2026)

| İlan | Öne çıkan şartlar |
| --- | --- |
| Head of / Manager, Simulation Engineering | Kurucuya rapor veren, elleri kodda lider; simülasyon, sentetik veri veya dağıtık hesaplama sistemlerini ölçekte kurmuş; LLM uygulamaları, ajan sistemleri, çoklu ajan çerçeveleri, model orkestrasyonu, çıkarım zamanı hesaplama deneyimi. Hesaplamalı sosyal bilim eğitimi şart değil. |
| Software Engineer, Simulation | 3+ yıl ML/AI sistemleri; tercihen NeurIPS/ICML/ICLR/ACL yayını. |
| Software Engineer, Applied AI | Ajan işlevselliği, boru hattı verimi (throughput), değerlendirme koşum takımları (evaluation harness); ajan ve simülasyon yeteneklerini test edilebilir, tekrarlanabilir ve iyileştirilebilir kılan altyapı. |
| Researcher, Evaluation | Doktora yerine eşdeğer araştırma derinliği kabul; simülasyon çıktılarının gerçek dünyayla karşılaştırılması. |
| Simulation Architect (müşteri yüzü) | 7+ yıl araştırma / tüketici içgörüsü; CS derecesi şart değil; müşterinin araştırma sorusunu simülasyon tasarımına çevirir. |
| Research Engineer (Electric Twin, Londra) | 7+ yıl deneyim, en az 1 yıl uygulamalı LLM. |

Talp'ın ürün sayfalarının eklediği yetkinlikler: çok kipli (görsel/video/oynanabilir reklam) algı; tarayıcı/uygulama içinde
gezinen ajanlar; Figma entegrasyonu; sektör şablonları; "gerekçe veren" çıktı; SOC 2/GDPR.

## 3. Akım: GitHub ve literatür

**Açık kaynak çerçeveler**

- Microsoft **TinyTroupe**: `TinyPerson` + `TinyWorld`; reklam değerlendirme, sentetik veri, fırsat analizi. Deneysel, API sık değişiyor.
- **Generative Agents** (Stanford, 2023) ve ardılları: bellek akışı, yansıtma, planlama mimarisi.
- **PersonaHub** (Tencent): 1 milyar persona ile sentetik veri üretimi; persona çeşitliliği için "persona-driven data synthesis".
- Çoklu ajan sosyal simülasyon: **OASIS**, **Concordia** (DeepMind), **AgentSociety**; pazar ölçeğinde etkileşim modelleri.
- Araç katmanı: persona MCP sunucuları, "simulate buyer personas" Claude skill'leri — persona, ajan araç setine giriyor.

**Ticari oyuncular**: Aaru, Synthetic Users, Evidenza, Listen Labs ("Founding Research Scientist, Human Simulation" ilanı),
Electric Twin, Artificial Societies, Minds, SYMAR, Delve.ai, Uxia, Cambium. EY'nin Aaru ile paylaştığı "%90 medyan korelasyon"
satıcı beyanıdır.

**Literatürün uyarıları (2025-2026 arXiv)**

1. Persona koşullu LLM'ler **daha olumlu, daha ilerici ve daha az çeşitli** yanıt verir; çeşitlilik istense bile çıktı
   **kalıp yargı kümesine çöker** (Persona Generators, 2602.03545; Distribution-First Population Simulation, 2607.18310).
2. **Ortalamalar tutarken** varyans ve regresyon ilişkileri sapabilir; sadakat tek metrikle ölçülmez
   (When Can LLM Digital Twins Reduce Human Measurement, 2609.07987).
3. Kültürel **düzleşme ve karikatür** teşhis edilmeli (Cultural Divergence Preservation, 2609.29928).
4. **Nüfusa hizalı persona kümesi** şart; temsilsiz küme sonucu saptırır (Population-Aligned Persona Generation, 2509.10127).
5. Uzun ufuklu simülasyonlarda **kimlik kayması** ölçülmeli (MicroVerse, 2608.15844).
6. Kanıta dayalı personalar (**PersonaCite**, 2601.22288): yanıtlar saklı kanıtla sınırlanır, kanıt yoksa "bilmiyorum" der.
7. Katılım **aşırı güven** doğurabilir (2607.21757): kullanıcı personayı tasarlayınca ona fazla inanır.
8. Uygulama rehberleri: sentetik kullanıcılar **düşük riskli, geri alınabilir** kararlar için (mesaj iterasyonu, konsept eleme);
   karşılanmamış ihtiyaç keşfi ve ödeme istekliliği için değil.

## 4. Mimariye aktarılan tasarım gereksinimleri

- Persona üretimi nüfus dağılımından başlar (önce dağılım, sonra birey); kalıp yargı çöküşü ölçülür ve raporlanır.
- Her persona yanıtı kanıt ve belirsizlik taşır; "gerekçe + güven aralığı", tek skor değil.
- Kalibrasyon döngüsü zorunlu: simülasyon tahminleri gerçek sonuçlarla (A/B testi, kampanya metrikleri) karşılaştırılıp puanlanır.
- Kullanım alanı sınırlandırılır: ürün kendini "karar desteği" olarak konumlar, "ölçümün yerine geçme" iddiası yapmaz.
- Çok kipli ve ortam içi (tarayıcı, uygulama, Figma) etkileşim birinci sınıf vatandaş.
- Gizlilik: gerçek müşteri verisiyle besleme GDPR/KVKK kapsamında; sentetik ile gerçek veri ayrı tutulur.

## Kaynaklar

- talp.ai ana sayfa, tools.html, sector-ecommerce.html, sector-b2b.html, meet-us.html, sitemap.xml (2026-11-07 çekimi)
- https://techfundingnews.com/meet-talp-ai-startup-with-turkish-roots-raising-20m-pre-seed-valuation-to-simulate-customers-with-ai-personas/
- https://dealroom.co/news/136788-talp-raises-pre-seed-at-20m-valuation-to-replace-surveys-with-ai-custome/
- https://pulse2.com/talp-secures-backing-from-formus-capital-aito-capital-sunshine-lake-and-a16z-scout-fund/
- https://egirisim.com/2026/07/02/turk-girisimcilerin-abdde-kurdugu-talp-20-milyon-dolar-degerleme-uzerinden-yatirim-aldi/
- https://medium.com/@baran_93960/the-observer-effect-in-market-research-649742ef2a5e
- https://seedtable.com/companies/talp
- Aaru ilanları: https://aaru.com/careers/8aeb5666-2bc1-44ef-bb40-5c3e1ca0233a , https://jobs.ashbyhq.com/aaru/f04cd7a3-b53c-4797-bb8f-ebfe0467e9fe ,
  https://zapply.jobs/jobs/cba8ae25-7250-4d5a-8fe7-ca1d49f2184b/ , https://talents.vaia.com/companies/aaru/head-of-simulation-engineering-149595431/
- Listen Labs ilanı: https://builtin.com/job/founding-research-scientist-human-simulation/9263479
- https://github.com/microsoft/tinytroupe , https://microsoft.github.io/TinyTroupe
- arXiv: 2602.03545, 2607.18310, 2609.07987, 2609.29928, 2509.10127, 2608.15844, 2601.22288, 2607.21757, 2512.14562
- https://www.pymc-labs.com/blog-posts/synthetic-consumers-a-practical-guide , https://www.delve.ai/blog/synthetic-personas ,
  https://www.stackmatix.com/blog/synthetic-users , https://kromatic.com/blog/synthetic-personas-customer-discovery/ ,
  https://leadprysm.com/blog/2026-07-16-synthetic-users-persona-simulation-funding
