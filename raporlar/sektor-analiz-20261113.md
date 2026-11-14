# Sektör analizi — eşit ağırlıklı sektör endeksleri (2024-01 → 2026-11)

Endeks: sektördeki hisselerin günlük getiri ortalaması. Evren BIST 100'ün bir kısmı; sektör başına 1–4 hisse. Yatırım tavsiyesi değildir.

## Sektörlerin getirisi

| Sektör | Dönem toplamı | Son 3 ay |
| --- | --- | --- |
| savunma | +638.8% | -10.9% |
| ulasim | +329.7% | -17.8% |
| enerji_dagitim | +221.2% | +8.1% |
| kamu_banka | +220.0% | +19.9% |
| holding_insaat | +205.5% | -13.8% |
| havalimani | +182.4% | +9.2% |
| madencilik | +157.2% | -11.0% |
| sigorta | +147.8% | -9.7% |
| gyo | +137.6% | -7.3% |
| perakende | +102.8% | -3.6% |
| madencilik_altin | +101.1% | -18.5% |
| banka | +96.6% | +4.6% |
| telekom | +84.1% | -7.0% |
| kimya_gubre | +82.3% | -31.0% |
| rafineri_petrokimya | +63.6% | -3.6% |
| demir_celik | +50.7% | -6.3% |
| havacilik | +24.0% | +3.1% |
| enerji_uretim | +22.4% | -20.2% |
| cimento | +17.0% | -27.2% |
| gida | +12.4% | -12.1% |
| holding | +4.2% | -26.7% |
| araci_kurum | -11.4% | -13.3% |
| otomotiv | -20.5% | -9.9% |
| cam | -23.0% | -8.0% |
| kimya | -25.0% | -30.1% |
| dayanikli_tuketim | -44.8% | -24.7% |
| enerji_ekipman | -58.0% | -44.9% |
| kimya_tarim | -91.1% | -36.4% |

## Sektör rotasyonu (her ay son 3 ayın en iyi 2 sektörü, 1 ay tut, 10 bp maliyet)

32 ay: rotasyon +100.7%, tüm sektörler eşit ağırlık +42.9%, XU100 +30.3%. Aylık fark ortalaması +1.6% (t = 1.0), rotasyonun önde olduğu ay oranı 56%. Bu ayın seçimi: enerji_dagitim, kamu_banka.

## Sürücülere duyarlılık (sektör − XU100)

Eşzamanlı beta: sürücünün günlük değişimine sektörün fazla getirisi (USD/TRY, EUR/TRY aynı gün; diğerleri önceki gün). Öngörü: sürücünün son 20 günlük değişimi ile sektörün sonraki 20 gün fazla getirisi, çakışmasız aylık örnek (|t| ≥ 2 kalın).

| Sektör | Sürücü | Eşzamanlı beta | Korelasyon | Öngörü ρ (20g) | t | Ay |
| --- | --- | --- | --- | --- | --- | --- |
| banka | usdtry | -0.92 | -0.17 | +0.07 | 0.4 | 33 |
| banka | abd10y | 0.00 | +0.01 | +0.36 | **2.1** | 33 |
| cam | abd10y | 0.01 | +0.02 | -0.35 | **-2.1** | 33 |
| cimento | vix | -0.00 | -0.06 | +0.39 | **2.3** | 33 |
| cimento | abd10y | -0.01 | -0.05 | -0.49 | **-3.1** | 33 |
| cimento | usdtry | 0.24 | +0.04 | -0.35 | **-2.1** | 33 |
| cimento | brent | -0.02 | -0.03 | -0.35 | **-2.1** | 33 |
| enerji_uretim | abd10y | 0.02 | +0.06 | -0.37 | **-2.2** | 33 |
| havalimani | eurtry | 0.36 | +0.10 | -0.34 | **-2.0** | 33 |
| havalimani | dxy | -0.11 | -0.03 | +0.45 | **2.8** | 33 |
| holding_insaat | abd10y | 0.00 | +0.00 | -0.37 | **-2.2** | 33 |
| kimya | altin | -0.00 | -0.00 | -0.36 | **-2.2** | 33 |
| madencilik | brent | -0.02 | -0.02 | -0.44 | **-2.7** | 33 |
| otomotiv | eem | 0.03 | +0.04 | +0.38 | **2.3** | 33 |
| perakende | usdtry | 0.13 | +0.02 | -0.47 | **-3.0** | 33 |
| rafineri_petrokimya | abd10y | 0.00 | +0.01 | -0.43 | **-2.7** | 33 |
| savunma | spx | 0.04 | +0.02 | -0.42 | **-2.6** | 33 |
| telekom | altin | 0.01 | +0.01 | +0.51 | **3.3** | 33 |
| ulasim | brent | -0.05 | -0.04 | -0.35 | **-2.1** | 33 |

## Sektör profilleri (araştırma ajanları, 23 sektör): sürücüler ve test edilebilir hipotezler

- **banka**: sürücüler — TCMB politika faizi ve fiili fonlama faizi (olumsuz); Yıllık TÜFE ve dezenflasyon hızı (olumsuz); Kur ve ülke risk primi (olumsuz); Kredi büyüme sınırları / makroihtiyati tedbirler (olumlu); Küresel risk iştahı ve dolar (olumsuz). Hipotez: TCMB'nin faiz indirdiği PPK günlerinde (14:00 sonrası kapanışa kadar) banka sepeti XU100'ü geçer; artırım veya repo ihalesine ara verme duyurusu günlerinde XU100'ün altında kalır.
- **kamu_banka**: sürücüler — TCMB fonlama faizi (olumsuz); Kur savunması ve rezerv (olumsuz); Kamu politikası ve görevlendirmeler (karisik); Siyasi takvim ve yönetim değişiklikleri (olumsuz); Sermaye yeterliliği ve kâr dağıtımı (olumsuz). Hipotez: Faiz indirimi günlerinde HALKB+VAKBN sepetinin XU100'e göre getirisi özel banka sepetininkinden yüksektir (beta > özel bankalar).
- **holding**: sürücüler — Banka iştirakleri (olumlu); Yabancı akımı, MSCI ve ülke notu (olumlu); NAV iskontosu (olumsuz); Kur (karisik); Petrol ve rafineri marjı (karisik). Hipotez: KCHOL+SAHOL sepetinin günlük getirisinin XBANK ile korelasyonu 0,7'nin üstündedir; XBANK'ın %3'ten fazla hareket ettiği günlerde sepet aynı yönde XU100'den fazla hareket eder.
- **holding_insaat**: sürücüler — Orta Doğu ve Körfez jeopolitik riski (olumsuz); Rusya-Ukrayna barış süreci ve yaptırımlar (olumlu); Dolar bazlı nakit ve gelir (olumlu); Yurt dışı müteahhitlik yeni iş hacmi (olumlu); Gübre fiyatı ve doğalgaz maliyeti (karisik). Hipotez: Orta Doğu'da ateşkes açıklanan günlerde ENKAI+TKFEN sepeti XU100'ü geçer; çatışmanın başladığı/genişlediği günlerde XU100'ün altında kalır.
- **savunma**: sürücüler — Ulusal programlar ve sözleşmeler (olumlu); Savunma ihracatı (olumlu); Küresel savunma harcaması (NATO/AB) (olumlu); Bölgesel jeopolitik tehdit (olumlu); Politika faizi ve işletme sermayesi (olumsuz). Hipotez: XU100'ün %2'den fazla düştüğü jeopolitik şok günlerinde ASELS'in XU100'e göre getirisi pozitiftir.
- **havacilik**: sürücüler — Jet yakıtı / Brent (olumsuz); Orta Doğu hava sahası ve jeopolitik (olumsuz); Turizm ve yolcu talebi (olumlu); Kur yapısı (olumlu); Küresel risk ve talep (olumsuz). Hipotez: Brent'in günlük %5'ten fazla düştüğü günlerde THYAO+PGSUS sepeti XU100'ü geçer; %5'ten fazla yükseldiği günlerde geride kalır.
- **havalimani**: sürücüler — Dış hat yolcu trafiği (olumlu); Euro kuru (olumlu); Turizm sezonu (olumlu); Bölgesel jeopolitik (Körfez, Suudi Arabistan, Orta Asya) (olumsuz); Petrol (dolaylı) (olumsuz). Hipotez: DHMİ aylık dış hat yolcu büyümesinin yıllık %10'u aştığı açıklamaların ardından TAVHL 5 günde XU100'ü geçer.
- **telekom**: sürücüler — Enflasyona endeksli fiyatlama gücü (karisik); Kur ve dolar bazlı yatırım (olumsuz); Faiz ve defansif rotasyon (karisik); Düzenleme ve frekans (olumsuz); 5G ve veri talebi (olumlu). Hipotez: XU100'ün 20 günde %10'dan fazla düştüğü dönemlerde telekom sepetinin XU100'e göre getirisi pozitiftir (defansif); jeopolitik şok başlangıcında ise bu ilişki kırılır.
- **perakende**: sürücüler — Asgari ücret (karisik); Gıda enflasyonu (karisik); Politika faizi (olumsuz); Enerji ve lojistik maliyeti (olumsuz); Reel ücret ve tüketici güveni (olumlu). Hipotez: Asgari ücret açıklama gününde BIMAS+MGROS sepetinin XU100'e göre anormal getirisi istatistiksel olarak sıfırdan farklı değildir (beklenti fiyatlı).
- **gida**: sürücüler — Kakao fiyatı (olumsuz); Buğday, şeker ve bitkisel yağ (olumsuz); Asgari ücret ve işgücü maliyeti (olumsuz); Kur (karisik); Orta Doğu/Körfez talebi ve lojistik (olumsuz). Hipotez: Kakao vadelilerinin 60 günlük getirisi ile ULKER'in iki çeyrek sonraki brüt marj değişimi negatif korelasyonludur.
- **enerji_uretim**: sürücüler — PTF (gün öncesi piyasa takas fiyatı) (+ ise olumlu); EPDK azami fiyat limiti (+ ise olumlu); Doğalgaz maliyeti (TTF, BOTAŞ santral tarifesi) (+ ise karışık (gaz dışı portföy için olumlu)); Hidroloji / yağış (+ (yağış) hidro ağırlıklıya olumlu, termik ağırlıklıya olumsuz); USDTRY (+ ise olumsuz). Hipotez: EPDK azami fiyat limiti artışının açıklandığı günden sonraki 3 işlem gününde AKSEN+ODAS eşit ağırlıklı sepeti XU100'ü geçer (hipotez; test edilmeli)
- **enerji_dagitim**: sürücüler — EPDK dağıtım/sistem kullanım bedeli ve getiri oranı (+ ise olumlu); Tüketim hacmi / hava sıcaklığı (+ (soğuk/HDD) ise olumlu); BOTAŞ perakende fiyat artışları (+ ise nötr-olumsuz); Enflasyon (+ ise kısa vadede olumsuz, tarife güncellemesinde olumlu); Politika faizi (+ ise olumsuz). Hipotez: BOTAŞ konut zammı açıklandığında AHGAZ'ın 5 günlük getirisi XU100'den anlamlı farklı değildir (geçişli maliyet) (hipotez; test edilmeli)
- **enerji_ekipman**: sürücüler — Şebeke ve yenilenebilir yatırımları (+ ise olumlu); Bakır fiyatı (+ ise olumsuz); Elektrik fiyat oynaklığı / pik-dip farkı (+ ise olumlu (depolama)); Kur (USDTRY, EURTRY) (+ ise olumlu); Küresel şebeke / veri merkezi talebi (+ ise olumlu). Hipotez: HG=F 20 günde +%10 → ASTOR'un 20 günlük XU100'e göre getirisi negatif (hipotez; test edilmeli)
- **rafineri_petrokimya**: sürücüler — Akdeniz ürün marjları (crack spread) (+ ise olumlu (TUPRS)); Brent seviyesi ve değişimi (+ ise TUPRS için kısa vadede olumlu, PETKM için olumsuz); Ham petrol iskontoları ve yaptırımlar (+ (iskonto genişlemesi) ise olumlu; yaptırım sıkılaşması olumsuz); USDTRY (+ ise olumlu); Petrokimya marjları ve Çin arzı (+ (marj) ise olumlu). Hipotez: Brent 20 işlem gününde +%10 → TUPRS 20 günlük getirisi XU100'ü geçer, PETKM geride kalır (hipotez; test edilmeli)
- **kimya**: sürücüler — Polyester zinciri marjları (+ ise olumlu); Petrol ve türev hammaddeler (+ ise karışık (genelde olumsuz)); Çin kapasitesi ve ticaret savunma önlemleri (+ (Çin ihracatı) ise olumsuz); Enerji maliyeti (+ ise olumsuz); Yurt içi tekstil talebi (+ ise olumlu). Hipotez: BOTAŞ sanayi gazına ≥%15 zam açıklandığında SASA 5 işlem gününde XU100'ün gerisinde kalır (hipotez; test edilmeli)
- **kimya_gubre**: sürücüler — Uluslararası gübre fiyatları (+ ise olumlu); Doğalgaz maliyeti (+ ise olumsuz); Üre/gaz marjı (+ ise olumlu); Çiftçi alım gücü ve destekler (+ ise olumlu); Jeopolitik arz şokları (+ (arz şoku) ise olumlu). Hipotez: Üre fiyatı 4 haftada +%20 → GUBRF sonraki 20 günde XU100'ü geçer (ör. Mart 2026) (hipotez; test edilmeli)
- **kimya_tarim**: sürücüler — Çiftçi gelirleri ve ürün fiyatları (+ ise olumlu); İklim olayları (+ (olumsuz iklim olayı) ise olumsuz); Faiz ve tarımsal kredi (+ (faiz) ise olumsuz); Çin jenerik etken madde fiyatları (+ (fiyat düşüşü) ise olumsuz); Girdi maliyetleri (gübre, mazot, sulama elektriği) (+ ise karışık (çoğunlukla olumsuz)). Hipotez: Politika faizinde ≥250 bp artış → HEKTS 20 günde XU100'ün gerisinde kalır (hipotez; test edilmeli)
- **demir_celik**: sürücüler — Küresel çelik fiyatı (+ ise olumlu); Hammadde maliyeti ve spread (+ (hammadde) ise olumsuz); Çin çelik ihracatı (+ ise olumsuz); Ticaret korumaları (dış pazar engeli + ise olumsuz; iç pazar koruması + ise olumlu); Enerji maliyeti (+ ise olumsuz). Hipotez: HRC 20 günde +%5 → EREGL'nin 20 günlük XU100'e göre getirisi pozitif (hipotez; test edilmeli)
- **cimento**: sürücüler — İnşaat faaliyeti (+ ise olumlu); Deprem bölgesi ve kamu konut programları (+ ise olumlu); Enerji maliyeti (+ ise olumsuz); İhracat pazarları ve navlun (+ ise olumlu); Politika faizi ve konut kredisi (+ ise olumsuz). Hipotez: Suriye/yeniden yapılanma veya kamu konut programı haberi → CIMSA ve OYAKC 5 günde XU100'ü geçer (hipotez; test edilmeli)
- **cam**: sürücüler — Doğalgaz maliyeti (+ ise olumsuz); Avrupa talebi (+ ise olumlu); Soda külü fiyatı (+ ise olumlu); EURTRY ve reel kur (+ (EURTRY reel artış) ise olumlu); Politika faizi ve risk iştahı (+ (faiz) ise olumsuz). Hipotez: TTF 20 günde +%20 → SISE 20 günde XU100'ün gerisinde kalır (hipotez; test edilmeli)
- **otomotiv**: sürücüler — AB talebi (+ ise olumlu); Yurt içi satışlar (+ ise olumlu); Taşıt kredisi faizi ve BDDK sınırları (+ (faiz/sıkılaşma) ise olumsuz); ÖTV matrah ve oranları (+ (ÖTV yükü) ise olumsuz); EURTRY (+ ise FROTO/TOASO için olumlu, DOAS için olumsuz). Hipotez: ODMD aylık satışları yıllık +%15'i aştığında DOAS ve TOASO sonraki 10 günde XU100'ü geçer (hipotez; test edilmeli)
- **dayanikli_tuketim**: sürücüler — Avrupa beyaz eşya talebi (+ ise olumlu); Yurt içi satışlar (+ ise olumlu); EURTRY ve TL reel kur (+ (EURTRY reel artış) ise olumlu); Hammadde maliyetleri (+ ise olumsuz); Tüketici kredisi ve faiz (+ (faiz) ise olumsuz). Hipotez: TÜRKBESD yurt içi satışları yıllık +%10 → ARCLK sonraki 10 günde XU100'ü geçer (hipotez; test edilmeli)
- **madencilik_altin**: sürücüler — Ons altın fiyatı (+ ise olumlu); USDTRY (+ ise olumlu); Dolar endeksi ve ABD reel faizleri (+ ise olumsuz); Jeopolitik risk ve piyasa stresi (+ ise olumlu); Ruhsat, ÇED ve çevre düzenlemeleri (+ (sıkılaşma) ise olumsuz). Hipotez: GC=F 20 günde +%5 → TRALT 20 günde XU100'ü geçer (hipotez; test edilmeli)