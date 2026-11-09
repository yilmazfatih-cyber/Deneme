# ADR-010 · Kamu verisinden öğrenme: Meta Reklam Kütüphanesi ve X araması; kaydırma botu yok

Tarih: 2026-11-09 · Durum: Kabul edildi (proje sahibi: "önerinle başla")

## Karar

1. **Kaydırma (scrolling) botu kurulmaz.** Instagram, TikTok ve X'te otomatik hesapla akış kaydırıp içerik toplamak platform
   koşullarına aykırıdır (hesap ve bağlı reklam hesabı kapatma, dava riski), rızasız kişisel veri toplamadır (KVKK/GDPR, ADR-002)
   ve bilimsel olarak bozuktur: botun gördüğü akış botun geçmişine göre kişiselleşir, gerçek müşterinin akışı değildir.
   Proje sahibi kaydırma botu istedi; bu ADR yerine resmî kaynakları koyar.
2. **İlk iki kamu kaynağı:**
   - **Meta Reklam Kütüphanesi API** (`ads_archive`): marka ve rakiplerin yayındaki reklamları; metin, başlangıç/bitiş, platformlar;
     AB/BK reklamlarında erişim ve yaş × cinsiyet kırılımı. **Sınır:** ticari reklamlar API'de yalnız AB ülkeleri ve BK için döner;
     Türkiye'de yalnız siyasi/toplumsal konulu reklamlar (üçüncü taraf kaynaklara göre; Meta belgesinden doğrulanmalı). Bu yüzden
     varsayılan ülkeler Türk markalarının diaspora pazarları (DE, NL, AT, BE, FR) ve Türkiye için **elle giriş** yolu: analist Reklam
     Kütüphanesi sitesinde gördüğü reklamları CSV ile girer (insan gözlemi; otomasyon değil).
   - **X API v2** kullandıkça öde: `tweets/counts/recent` (günlük sayım, son 7 gün) ve `tweets/search/recent` (küçük örneklem).
     Birim fiyatlar üçüncü taraf kaynaklara göre okuma ve sayım isteği başına yaklaşık 0,005 USD (resmî sayfadan doğrulanmalı).
     Her çalıştırmada bütçe sınırı (`--butce-usd`); sayım ucuz olduğu için ilgi endeksi sayımlardan, duygu örneklemden.
3. **Saklanan:** sayım, toplu duygu oranları, konu oranları, örneklem ortalama etkileşimi; rakip reklamın metin özeti (işletme içeriği).
   **Saklanmayan:** gönderi metni, yazar, kullanıcı kimliği, profil.
4. **Öğrenilenler:** kategori ilgi endeksi ve eğilimi; marka ve rakip duygu karşılaştırması (hangi konuda şikâyet: fiyat, kargo, kalite);
   piyasada uzun yaşayan reklamların yaratıcı türü → yaratıcı çekim çarpanı için **zayıf** öncül (yarım ağırlıkla kendi reklam verisinin
   üstüne). Uzun yayın süresi performansın vekilidir, kanıtı değildir; rapor bunu söyler.
5. Sıradaki kamu kaynakları (bu ADR kapsamında değil): YouTube Data API, Reddit API, TikTok Creative Center/Commercial Content API,
   Instagram Hashtag Search, rızalı müşteri paneli.

## Sonuçları
- Şema: `kamu_sorgu`, `kamu_duygu`, `rakip_reklam`; konu hacmi mevcut `sosyal_konu_hacmi` tablosuna (`konu` = sorgu kimliği).
- Kod: `persona-katmani/sosyal/kamu/` (bağlayıcılar, elle giriş, öğrenme, `kamu_cli.py`); çıktı `persona-sim/public/ogrenilen/kamu.json`.
- Simülasyon: Reklam sekmesinde "Piyasa sinyali" paneli; yaratıcı çarpanı kendi verisi × piyasa^0,5.
