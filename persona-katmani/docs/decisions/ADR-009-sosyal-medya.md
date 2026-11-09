# ADR-009 · Sosyal medya üçüncü veri kaynağı (Kaynak C): Facebook, Instagram, TikTok, X

Tarih: 2026-11-09 · Durum: Kabul edildi (proje sahibi: "sosyal medyadan öğrenebilsin")

## Karar

1. **Yalnız resmî API'ler.** Meta Graph/Marketing API (Facebook + Instagram), TikTok for Business API, X API v2 / X Ads API. Kazıma yok;
   oturum çerezi, tarayıcı otomasyonu veya üçüncü taraf kazıyıcı kullanılmaz.
2. **Kaynak C = toplu veri.** Kişi düzeyi sosyal profil tutulmaz. Alınan birimler: reklam/gönderi metrikleri, platformun verdiği
   **yaş × cinsiyet × bölge** kırılımı, yorumların **toplu duygu özeti**, hashtag/konu hacmi. Yorum metni ham hâliyle 30 günden uzun
   saklanmaz; yorum yazarının kimliği hiç saklanmaz. (ADR-002, 06 §3)
3. **Üç öğrenme yolu:**
   - **C1 Reklam tepkisi öncülleri:** kampanya kırılımlarından (yaş × cinsiyet × kanal × yaratıcı) tıklama, izlenme ve etkileşim oranları →
     `dikkat_esigi`, `tau_reklam_tolerans`, yaratıcı tür etkileri için S1/S3 öncülleri (`oncul` tablosu, `kaynaklar`: "sosyal").
     Simülasyonun segmentleri yaş × gelir; platform yaş × cinsiyet verir → yaş bandı üzerinden eşlenir, gelir eşlenmez.
   - **C2 Kalibrasyon döngüsü:** simülasyonun kampanya tahmini `kor_tahmin`e mühürlenir; platformdan gelen gerçek sonuç
     (dönüşüm, tıklama) `gercek_sonuc` olarak yazılır; Brier ve isabet hesaplanır. Böylece "isabetimiz şu" denebilir.
   - **C3 Sosyal sinyal:** kendi gönderilerinin yorumlarından toplu duygu (olumlu/olumsuz/nötr oranı) ve gönderi konusu;
     hashtag/konu hacminden kategori ilgisi zaman serisi → `ilgi` parametresi ve `w_sosyal_kanit` için zayıf öncül.
4. **Erişim yoksa dosya.** Her platformun reklam yöneticisi dışa aktarım CSV'si aynı şemaya okunur; API anahtarı gelene kadar bu yol çalışır.
5. **Kimlik bilgileri** ortam değişkeni veya gizli depodan okunur, depoya yazılmaz; bağlayıcılar `--kuru` modda sahte veriyle çalışır.

## Sonuçları

- Şema: `sosyal_hesap`, `sosyal_icerik`, `sosyal_metrik` (toplu, kırılımlı), `sosyal_duygu_ozeti`, `sosyal_konu_hacmi`; `kor_tahmin` C2 ile doldurulur.
- `persona-katmani/sosyal/` Python paketi: ortak şema, platform bağdaştırıcıları (meta, tiktok, x), CSV içe aktarım, `ogren` komutları (C1, C2, C3).
- 07'ye Kaynak C bölümü; 03 §8.4 kalibrasyon döngüsü artık veri kaynağına sahip; 06'ya platform politikaları ve saklama süreleri.
- Simülasyon: öğrenilen reklam öncülleri `persona-sim/public/ogrenilen/reklam.json` olarak dışa aktarılır, uygulama S1 öncüllerinin üstüne uygular.

## Riskler
- Platform API kotaları ve politika değişiklikleri; yaş × cinsiyet kırılımı bazı platformlarda yalnız reklam hesaplarına açık.
- Platform metrikleri "tıklama" gibi ara sonuçlardır; satın alma dönüşümü için piksel/CAPI entegrasyonu veya şirketin kendi dönüşüm verisi gerekir.
- Yorum duygusu için LLM kullanılırsa yorum metni sağlayıcıya gider: yalnız özet, kimliksiz, 06 §5 kuralları.
