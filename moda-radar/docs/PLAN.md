# Moda Radar — ürün planı

Yazar: Fable 5.1 (baş mimar). Sürüm: 0.1, 2026-11-08. Uygulayıcı: Opus 5.5 ekibi (`docs/EKIP.md`).

## 1. Ne üretiyoruz

Üç çıktı, hepsi Markdown + JSON, hepsi bir sezon ve bir ülke için:

| Çıktı                | Soru                                                          | Birim                                                                |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Sezon paleti**     | Bu sezon hangi renkler tutacak, hangi Pantone koduyla?        | Renk satırı: TCX kodu, hex, Lab, olasılık, segment başına raf tarihi |
| **Trend tablosu**    | Hangi kumaş, desen, siluet, detay yükseliyor, hangisi iniyor? | Nitelik × segment: olasılık, ufuk, yön                               |
| **Yatırım kartları** | Ürün ürün neye yatırım yapılır, neye yapılmaz?                | Ürün tanımı → yatır / dene / bekle / girme + 5 boyut                 |

"Ürün" = kategori + siluet + kumaş + desen + renk birleşimi. Örnek: `kadin-ust / kutu kesim gömlek / keten görünümlü / düz / 14-4318 TCX`.

## 2. WGSN'nin tersine mühendisliği

Açık kaynaklardan görülen WGSN yapı taşları ve bizim karşılıklarımız:

| WGSN                                              | Ne yapar                                                                                          | Moda Radar karşılığı                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **TrendCurve AI**                                 | Çok kaynaklı veri + derin öğrenme, analist döngüde; %94 doğruluk iddiası (bağımsız doğrulama yok) | `moda_radar/tahmin/` yayılma modeli + moda editörü incelemesi + açık karne          |
| **Coloro ortaklığı**                              | 3.500 renklik kütüphaneden sezon renkleri; 2 yıl ileri renk raporu                                | Pantone TCX (2.310 renk, açık hex verisi) üzerinden ΔE2000 eşleme; Coloro opsiyonel |
| **Instock**                                       | 12.000+ perakendeci, 40M+ ürün takibi; fiyat ve çeşit kararı                                      | 5 segment çıpa markası + Trendyol haftalık tarama (`veri/perakende`)                |
| **Analist raporları**                             | İnsan yazımı sezon anlatısı                                                                       | `docs/sezonlar/<SEZON>/rapor.md`, moda editörü yazar, model verisiyle               |
| **Veri ekibi** (analytics eng., data eng., CV/AI) | dbt, SQL, Python, embeddings, Snowflake/Databricks, Airflow                                       | Parquet + DuckDB, Pydantic, Claude vision, Playwright; sunucusuz                    |

WGSN'nin gerçek avantajı modelden çok **veri derinliği ve küratör anlatısı**dır. Biz derinlikte yarışamayız; dar
pazarda (Türkiye) derin, açık yöntemli ve segmentli olmakla ayrışırız.

## 3. Veri katmanları

| Katman       | Kaynak                                                                                                      | Sıklık                                 | Saklanan                                                   | Hukuki not                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Podyum       | Vogue Runway, Tagwalk, marka YouTube defileleri, Mercedes-Benz Fashion Week Istanbul, Fashion Week Istanbul | Sezonda 2 kez (Şubat/Mart, Eylül/Ekim) | Etiket + renk kaydı; görsel saklanmaz                      | Görsel indirilip bellekte işlenir, atılır; robots.txt          |
| Perakende    | Beymen, Zara TR, LCW, Addax, Trendyol (segment çıpaları)                                                    | Haftalık                               | Ürün nitelikleri, fiyat, indirim, stok durumu, görsel renk | Kullanım şartları okunur; hız sınırı; yalnız kamuya açık sayfa |
| Pazar        | Merter/Osmanbey toptancı Instagram hesapları; saha fotoğrafı (5 referans pazar)                             | Haftalık / 2 haftada bir               | Etiket + renk                                              | Saha fotoğrafında yüz kırpılır, saklanmaz                      |
| Talep        | Google Trends TR, Pinterest Predicts, Instagram/TikTok TR etiketleri                                        | Haftalık                               | Zaman serisi                                               | Yalnız toplu sayılar                                           |
| Yerel bağlam | Dizi/yayın takvimi, bayram ve okul takvimi, iklim normalleri, TÜİK ilçe gelir                               | Sezonluk                               | Sabit tablolar (`content/ulkeler/tr/`)                     | Açık veri                                                      |
| Maliyet      | Kumaş ve baskı maliyet bantları (Bursa, Zeytinburnu referans)                                               | Sezonluk                               | `content/maliyet/`                                         | Elle girilir                                                   |

Her kayıt `kaynak_url`, `tarama_tarihi`, `sezon`, `segment` taşır (bkz. `moda_radar/sema.py`).

## 4. Nitelik çıkarma (görsel → etiket)

- Sözlük: `content/taksonomi.json`. Eksenler: kategori, siluet, boy, yaka, kol, kumaş görünümü, desen, detay, doku, kapanma.
  Sözlük dışı değer kabul edilmez; model "bilinmiyor" diyebilir.
- Yöntem: görsel dil modeli yapılandırılmış JSON üretir (şema `NitelikKaydi`). Toplu etiketleme Sonnet 5.5,
  rastgele %5 örneklem Opus 5.5 ile ikinci kez etiketlenir; eksen başına uyum ≥ 0,80 değilse sözlük veya istem düzelir (ADR-004).
- Bir defile görselinde birden fazla parça olabilir; her parça ayrı kayıt.
- Gömme (embedding) vektörü de saklanır: sözlükte olmayan yeni bir biçimi kümeleme ile yakalamak için ("adsız trend" uyarısı).

## 5. Renk hattı

1. Giysi maskesi: arka plan ve ten dışarıda. Hazır segmentasyon modeli; yüz bölgesi hiç işlenmez.
2. Piksel → CIELAB. k-means, k = 3..5, siluet oranına göre ağırlık. Parça başına 1 baskın + en fazla 2 vurgu renk.
3. Defile → sezon: tüm parçaların renkleri ΔE2000 < 6 ile kümelenir; küme payı = podyum payı. Aynı renk ailesinin
   önceki sezona göre farkı hesaplanır (giriş / yükseliş / zirve / çıkış).
4. Pantone eşleme: her küme merkezi, açık TCX hex veri kümesine (2.310 renk) ΔE2000 ile eşlenir; ΔE ve ikinci en yakın
   aday raporlanır. ΔE > 5 ise "yaklaşık" damgası. Renk adları Pantone'un telifidir; raporda kod önde, ad parantezde (ADR-001).
5. Segment paleti: podyum paleti, segment gecikmesi ve segment renk tercihi (geçmiş raf verisi) ile çarpılır.
   Örnek çıktı: "17-1564 TCX, podyum payı %6,1 (+3,2), Zara TR beklenen raf: SS27 Mart, LCW: SS27 Mayıs, Addax: FW27".

## 6. Trend yayılma modeli

Her nitelik `a`, segment `s`, zaman `t` için hedef: raf payı `R_{a,s}(t)` ve eşik aşma olasılığı `P(R ≥ eşik)`.

- **Sürüm 0 (pilot):** gecikmeli regresyon. `R_{a,s}(t) ~ podyum_a(t − L_s) + talep_a(t − d) + R_{a,s}(t − 1 sezon)`.
  `L_s` segment gecikmesi; önsel `content/segmentler.json`, geçmiş veriyle tahmin edilir.
- **Sürüm 1:** lojistik yayılma eğrisi (giriş→zirve→çıkış) nitelik başına; parametreler segment hiyerarşisinde paylaşılır
  (az veri olan segment, benzer segmentten ödünç alır).
- **Sürüm 2:** gradyan artırma; özellikler: podyum payı, podyum çeşitliliği (kaç marka), talep ivmesi, önceki raf payı,
  maliyet bandı, mevsim, bayram takvimi.
- Çıktı her zaman kalibre olasılık. Kalibrasyon ve Brier skoru `docs/karne/` altında sürüm sürüm tutulur.
- Yeni modelin eskiyi geçtiği gösterilmeden rapor üretmez.

## 7. Ülke ve segment katmanı

Ülke = segment kümesi + bağlam değişkenleri (iklim, takvim, tesettür payı, beden dağılımı). Türkiye'de 5 İstanbul segmenti:

| Kod       | Çıpa                                | Gecikme önseli | Not                                                                               |
| --------- | ----------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `luks`    | Beymen, Vakko                       | 1 sezon        | Podyuma en yakın; sınırlı hacim                                                   |
| `premium` | Zara, Massimo Dutti, Ipekyol        | 2 sezon        | Renk sinyali en net burada                                                        |
| `orta`    | LCW, Koton, DeFacto                 | 3 sezon        | En büyük hacim; Türkiye'ye özgü renk tercihi                                      |
| `deger`   | Addax, Waikiki alt seri             | 3–4 sezon      | Fiyat baskısı deseni belirler                                                     |
| `pazar`   | Semt pazarı, Merter/Osmanbey toptan | 4–6 sezon      | Site yok; toptancı Instagram + saha fotoğrafı; dizi/TikTok etkisi podyumdan güçlü |

Kesen boyutlar: tesettür (her segmentte ayrı pay), iklim bölgesi, yaş bandı. Yeni ülke eklemek = yeni `content/ulkeler/<kod>/` + segment tablosu; kod değişmez.

## 8. Yatırım kararı (ürün bazında)

Beş boyut ayrı ayrı hesaplanır, raporda ayrı ayrı görünür; tek skor yoktur.

| Boyut           | Kaynak                                           | Ölçek                    |
| --------------- | ------------------------------------------------ | ------------------------ |
| Trend ivmesi    | Bölüm 6 olasılığı ve yön                         | 0–1 ve giriş/zirve/çıkış |
| Segment uyumu   | Segmentin geçmiş raf verisiyle benzerlik         | 0–1                      |
| Zamanlama       | Beklenen raf tarihi ile satın alma takvimi farkı | erken / zamanında / geç  |
| Maliyet ve marj | `content/maliyet/` bantları, hedef fiyat         | marj %                   |
| Stok riski      | Moda rengi mi temel renk mi; kaç rakipte var     | düşük / orta / yüksek    |

Karar kuralı (sürüm 0, açık ve değiştirilebilir, `moda_radar/yatirim/kural.py`):

- **YATIR:** ivme ≥ 0,60 ve yön giriş/yükseliş, zamanlama "zamanında", marj hedefin üstünde, risk ≤ orta.
- **DENE:** ivme 0,45–0,60 veya zamanlama "erken"; %10–20 deneme partisi önerilir.
- **BEKLE:** sinyal çelişkili (podyum var, talep yok) veya zamanlama "erken" ve risk yüksek.
- **GİRME:** yön çıkış, ya da rakip yoğunluğu yüksek ve marj dar, ya da segment uyumu < 0,30.

Her kart gerekçe (≤ 3 cümle), kaynak sayısı ve "bu kararı değiştirecek sinyal" satırı taşır. "Çıkış uyarısı" ayrı liste: elde stok varsa indirime zamanında gir.

## 9. Geriye test protokolü

- Zaman kilidi: tahmin tarihi `T` için yalnız `tarama_tarihi ≤ T` kayıtları okunur. Web araması geriye testte kapalı.
- Tutma sezonları: SS25, FW25 (ileride her yeni sezon eklenir). Eğitim: SS23–FW24.
- Ölçütler: ilk 10 renk isabet oranı (ΔE < 6 ile eşleşme), nitelik yön doğruluğu, Brier skoru, kalibrasyon eğrisi,
  yatırım kararı için "YATIR denenlerin gerçek raf payı artışı" ve "GİRME denenlerin düşüşü".
- Karşılaştırma tabanları: (a) "geçen sezonun paleti aynen", (b) Pantone sezon raporu, (c) yalnız podyum payı.
  Model bu üçünü geçmiyorsa rapor üretmez.
- Karne `docs/karne/<model-surumu>.md`, sayılar `veri/karne/*.parquet`.

## 10. Teknoloji

Python 3.12 · Pydantic 2 · SQLite tek dosya (ADR-005; DuckDB analiz için opsiyonel) · Playwright + BeautifulSoup (tarama) · scikit-learn (k-means, regresyon) · colour-science
(ΔE2000) · Claude vision (etiket) · pytest, ruff. Sunucu yok; CLI ve Markdown rapor. Gösterge paneli P4'te.

Dil: kod tanımlayıcıları ve belgeler Türkçe; kütüphane adları olduğu gibi.

## 11. Hukuk ve etik

- Görsel saklanmaz, etiket saklanır (ADR-002). Kaynak URL ve tarih her kayıtta.
- Perakende taraması: robots.txt ve kullanım şartları; saniyede ≤ 1 istek; yalnız kamuya açık ürün sayfası; kişisel veri yok.
- Yüz: segmentasyonda yüz bölgesi maskelenir, hiç işlenmez.
- Pantone adları telifli: kod ve hex birincil, ad ikincil ve kaynak belirtilir.
- Rapor başında: "Yatırım tavsiyesi değildir; karar satın almacınındır."

## 12. Riskler ve karşılıkları

| Risk                                 | Karşılık                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Perakende siteleri taramayı engeller | Trendyol açık API/katalog alternatifi; saha fotoğrafı; haftalık yerine 2 haftalık |
| Podyum verisi az, model aşırı uyar   | Hiyerarşik paylaşım; basit modelden başla; taban karşılaştırması zorunlu          |
| Etiket kalitesi düşük                | %5 çift etiketleme, uyum eşiği, sözlük daraltma                                   |
| "Tutacak" iddiası satışa dönüşmüyor  | Yatırım kartı ve çıkış uyarısı; satın almacıyla pilot                             |
| Hukuki itiraz                        | Görsel saklamama, hız sınırı, kaynak gösterimi                                    |
