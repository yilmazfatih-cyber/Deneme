# Orkestratör kararları — Faz 1 revizyon turu

Tarih: 2026-10-04. Bu dosya revizyon turu için bağlayıcıdır; tur bitince içeriği `docs/DECISIONS.md`'ye taşınır.

## Genel ilke (sahiplik matrisi)

- **Kural ve veri** (ne olur): GDD / OBSTACLES / LEVELS / META → product-lead kazanır. Diğer belgeler GDD'ye uyar.
- **Sunum, etkileşim, his, metin tonu** (nasıl görünür/hissedilir): ART / UX / JUICE / STORY → design-lead kazanır.
- **Uygulama yöntemi, maliyet, performans**: TECH_DESIGN → code-lead kazanır (kuralı değiştirmeden).
- **Fiyat, etik sınırlar, kapsam (MVP/Sonra), hukuk**: BUSINESS → entrepreneur kazanır. Oyun içi altın miktarları product-lead'indir; çakışmada ikisi birlikte tek değer yazar.

## Somut kararlar

| # | Konu | Karar | Uygulayan |
|---|---|---|---|
| R-01 | K-34 Alttan Üste | KABUL (varsayılan). Proje sahibine onay için sunulacak. code-lead doğrulamaya ve TECH'e ekler; design-lead görünür kılar (inşa cephesi vurgusu, gölgede eksik destek taraması, sekme sonrası vurgu, ilk karşılaşmada Dede ipucu); UX Bölüm 3 öğretici sırası LEVELS çözümüne göre yeniden yazılır. | code, design, product |
| R-02 | TECH ↔ GDD farkları (S-9 balon tavanı, S-21 boya kapısı `via`, teslimat kuyruğu FIFO, Kamyon Yardımı, bot modeli, validator kodları K-45) | GDD geçerlidir; TECH_DESIGN GDD'ye uyar. Balon + düşen blok aynı adım (N33/N34): product-lead GDD'ye kural yazar (code-lead'in "önce düşüş yarım adımı, sonra yükselme yarım adımı" önerisi varsayılan). | code, product |
| R-03 | Duvar = sıfır genişlikli sınır (çekirdek) | KABUL (uygulama ayrıntısı; GDD koordinatları ve geçit kuralları değişmez, yalnızca ifade). | code; product GDD ifadesini kontrol eder |
| R-04 | Ölçüler | 120 px hücre, 60 px duvar; kod `layout.*` token'larından okur. | design (tokens), code |
| R-05 | Palet P-1, plan hücresi P-2, sembol mürekkebi P-3, K-18 çift kodlu gölge P-7, renk adı "Gök Mavisi" P-9 | KABUL (design-lead alanı; renk kodları değişmez). Palet değişikliği proje sahibine bilgi olarak sunulur. Diğer belgelerdeki hex/ad atıfları güncellenir. | design; product/code atıfları |
| R-06 | Ölçekleme FIT → EXPAND | Proje sahibine sorulacak (brif FIT diyor). Belgeler EXPAND'i öneri olarak tutar, FIT ile de çalışacak şekilde yazılır (alt/üst çapalar). | code, design |
| R-07 | Kasaba görevleri | STORY'deki 35 görev esastır (product-lead kararı). META ve economy.json STORY'ye göre güncellenir; **design-lead STORY'yi META'ya göre değiştirmez**. Yıldız maliyetleri META'da kesinleşir, STORY aynı değerleri gösterir. | product (META), design yalnızca maliyet atıflarını eşitler |
| R-08 | Öğretici metinler | Tek anahtar kümesi `tut.l{n}.{konu}`, terim "blok" (parça değil), renk adı yok (renk körü). Bölüm içinde ekranda görünen öğretici/Dede metni = STORY (design-lead yazar, ton). OBSTACLES'taki TR/EN metin = engel bilgi kartı metni, anahtar `obs.{id}.desc` (product-lead yazar). product-lead STORY satırlarının kurala uygunluğunu doğrular. | design, product |
| R-09 | Ara sahne tetikleyicisi | Brif FTUE sırası geçerlidir: Bölüm 1 → ana ekran → ilk yıldızı harcama → ilk ara sahne. META buna uyar. | product, design |
| R-10 | Hafif yerçekimi yönlendirme | Girdi biçimi design-lead'in (düşüş sırasında tahtaya dokunma; dokunulan taraf = kayma yönü); kural (1 sütun, aynı hamle, kaç kez) GDD'de product-lead. code-lead maliyet onayı verir. | design, product, code |
| R-11 | Ağır yerçekimi 700 ms | Kural kalır; ayarlarda erişilebilirlik seçeneği 1400 ms (product önerisi) KABUL. | product, design, code |
| R-12 | Animasyon sırasında girdi | Design-lead kuralı: yeni blok tutulabilir, bekleyen animasyonlar o an sonlandırılır; kilit yalnız dilim kayması, kamyon, karıştırma. "Animasyonları azalt" = JUICE solma varyantları. | code |
| R-13 | Bölüm içi kaldığı yerden devam | KABUL, MVP: her hamleden sonra hamle günlüğü kaydedilir; uygulama kapanması / arama kayıp sayılmaz, bölüm kaldığı yerden sürer (belirlenimci çekirdek + tekrar oynatma). Kayıp yalnız oyuncunun "bölümden çık" onayıyla ya da hamle bitince. K-43 güncellenir; P-7 (m=0 cezasız çıkış) KABUL. | product, code, design (çıkış onayı) |
| R-14 | Botlar | Entrepreneur P-5 KABUL: etiketli "Renkli Tepe çırakları", gerçek insan adı yok; Lig ve Köprü'de etiket + kural kartı. Ödeme geçmişinden bağımsızlık: saf bot modülü, economy/save import yasağı, iki-kayıt eşitlik testi. | design (UX/STORY çırak adları), product (META), code |
| R-15 | Teklif etiği | Entrepreneur P-2…P-4 KABUL: +5 penceresinde eşit boy düğmeler, gerçek para karşılığı, eskalasyon ve 3 teklif sınırı görünür, baskı metni yok, Köprü kayıp ekranında kalan sayaç yok. Reklamla alınan +5 de 3 teklif sınırına sayılır. | design, product |
| R-16 | Köprü harcama tavanı, kumbara, +5 fiyat basamakları, Usta sandığı | product-lead ve entrepreneur tek değer üzerinde anlaşır ve aynı sayıyı hem META/economy.json hem BUSINESS'a yazar. Varsayılan: Köprü tavanı 4.050 (900+1.350+1.800, tek denemenin tam eskalasyonu); kumbara entrepreneur önerisi ($1,99, kırma 1.000, tavan 2.000, galibiyet başı 50/75/100) — product-lead denge itirazı varsa gerekçeyle yazar. "Ödemeyen oyuncu" ölçütü: entrepreneur'ün altın bakiye bandı + kayıp kurtarma karışımı hedefi kullanılır. | product, entrepreneur |
| R-17 | Usta Modu | Proje sahibine sorulacak (kapsam). Her iki ajan MVP öneriyor; belgeler "MVP (onay bekliyor)" diye işaretler. | product, entrepreneur |
| R-18 | Hamle bütçeleri brif tahmininden düşük | Proje sahibine sorulacak. Formül (solver min + tampon, bot ayarı) geçerli kalır. | product |
| R-19 | Albüm | Entrepreneur kapsam kararı: Sonra. Alt navigasyonda Takım gibi kilitli "yakında" sekmesi olarak durur; "Albüme eklendi" animasyonu MVP'den çıkar. | design, code |
| R-20 | Debug paneli | Yalnız geliştirme derlemesinde (`import.meta.env.DEV`); üretimde `?debug=1` etkisiz. | code |
| R-21 | K-45/9 ↔ Bölüm 4 dar geçit | product-lead çözer: OBSTACLES'a her mekaniğin veri imzası; W3 yalnız `teaches` ile sayılır **ya da** Bölüm 4 geçidi boy 2 yapılır (product-lead seçer, gerekçeyle). | product, code |
| R-22 | K-06 panorama dokunma | Sunum design-lead'in: dokununca önizleme gösterilebilir; product-lead K-06 metnini "oyun durumunu değiştirmez" olarak günceller. | product |
| R-23 | Yaş ekranı, reklam/IAP servis arayüzü, referans düşük cihaz | Entrepreneur P-10 KABUL (mağaza sürümü, web MVP'de yok). code-lead TECH'e `ConsentService`, `AdsService`, `IapService` arayüzlerini (MVP'de sahte) ve referans düşük cihazı ekler. | code |
| R-24 | EN adlandırma | Kepçe EN "Kepche"; "Little Builder" mağaza adı/EN metinde yok; firma adı `{company}` (NAMING kararına kadar "Tuna & Co."). | design, entrepreneur |

## Revizyon kuralları

1. Her ajan, **kendisine yöneltilmiş her yorumu** kapatır: kendi belgesini günceller ya da gerekçeyle reddeder ya da proje sahibine açık soru yapar.
2. Kapanışları `docs/review_inbox/<ajan>-closure.md` dosyasına yazar: her satır `kaynak-dosya#yorum-başlığı → KAPANDI | RET (gerekçe) | AÇIK SORU`.
3. Yalnızca kendi dosyalarını düzenler. DECISIONS.md ve REVIEW_LOG.md'yi orkestratör birleştirir.
4. Önerilerini (P-x) güncel haliyle son raporunda verir (yeni, değişen, geri çekilen).
