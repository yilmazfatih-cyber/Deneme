# ADR-007 · F-2 … F-10 ve F-16 kararları

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi). F-8 açık (yeniden anlatılacak).

| # | Soru | Karar | Mimari sonucu |
| --- | --- | --- | --- |
| F-2 | Simülasyon gerçek ölçümün yerine geçebilir mi? | **Geçebilir.** | Uygunluk kapısı K10 ("insan adımı zorunlu") kalkar; rapor "ölçümün yerine geçmez" ibaresi yerine "kalibrasyon geçmişiyle birlikte okunur" der. Kalibrasyon döngüsü (kör tahmin → gerçek sonuç → Brier) **öneri** olarak kalır, zorunlu değil. Risk: gerçek test yapılmazsa isabet ölçülemez; bu durum raporda "kalibrasyon verisi yok" etiketiyle görünür. |
| F-3 | Hassas özellikler (din, etnik köken, siyasi görüş, cinsel yönelim, sağlık) modellensin mi? | **Modellenmesin.** | Persona şeması ve segment tanımları bu boyutları içermez; kümeleme yalnız davranış özellikleri kullanır (ADR-006 ile uyumlu); kapı K6 mutlak kırmızı; veritabanı `segment` ve `musteri` tablolarında bu alanlar yoktur ve eklenmez. |
| F-4 | Belirsizlik gösterimi | **Tek skor.** | Hedefleme raporunda her satır için 0–100 arası **hedefleme skoru** birincil gösterge; güven aralığı ve ham oranlar küçük yazı/ayrıntıda kalır, gizlenmez. Skor: artışın büyüklüğü, güven aralığının sıfırdan uzaklığı, rahatsızlık ve maliyetten türetilir (`reklam/rapor.ts`). |
| F-5 | Müşteri personayı düzenleyebilir mi? | **Düzenleyebilir.** | Segment kaydırmaları ve persona θ değerleri arayüzden değiştirilebilir; değiştirilmiş koşu `surum_demeti`nde "elle düzenlendi" işareti taşır (istatistik dışında tutulmaz, yalnız işaretlenir). |
| F-6 | Manipülasyon sınırını kim çizer? | **Müşteri.** | Ürün reddetmez; karanlık desen tespiti yalnız **bilgi** olarak raporlanır ("bu varyant kıtlık mesajı/ön seçili kutu içeriyor"). Kullanım koşulları sorumluluğu müşteriye bırakır. |
| F-7 | Söz ile davranış çelişirse personanın görüşü hangisi? | **Davranış.** | Rapor davranış kanalını esas alır; söz kanalı (sesli düşünme) yalnız gerekçe/açıklama olarak eklenir, KPI'ya girmez. |
| F-8 | Personaya ne kadar insanlık (ad, yüz, kusurlu algı, dış sabır modeli) | **Açık** | Teknik varsayılan sürer: ad var, fotoğraf yok, algı bozulması kapalı, dış sabır modeli etiketli. |
| F-9 | Müşteri verisi ortak kalibrasyona girsin mi? | **Girsin.** | Kiracıların gerçek sonuçları (kör tahmin → gerçek) S1 Türkiye öncüllerini ve global düzelticiyi besler; varsayılan dahil, sözleşmede çıkış hakkı. Ham fiş verisi değil, kalibrasyon istatistiği paylaşılır. |
| F-10 | Hangi işler/çıktılar reddedilir? | **Şu an hiçbiri.** | Sektör kapısı yok; filigran ve "sentetik" etiketi bilgilendirme amaçlı kalır, kaldırılabilir; sahiplik doğrulaması zorunlu değil (üçüncü taraf sitelerde salt okunur gezinme serbest). Hukuki görüşle yeniden ele alınabilir. |
| F-16 | Şehir/konum düzeyinde küçük örneklemde yerel profil yazılsın mı? | **Yazılsın.** | S2/S3 profilleri n'den bağımsız yazılır; n ve güven aralığı yanında gösterilir, "yerel" etiketi n ≥ 50'de, altında "az veri" etiketi. Yer adları gelirle anılmaz (nötr ad kuralı). |

## Etkilenen belgeler
`05-icgoru-ve-urun.md` §6 kapı tablosu (K6 kalır, K10 kalkar, K1–K3 sarıya iner), §7 rapor biçimi (tek skor); `06-guven-gizlilik.md` §8 (red yerine bilgi), §9 (filigran isteğe bağlı); `02` §5 (hassas alan yok, zaten yok); `07` §3.2 S2/S3 etiketleri; `03` §14 (skor tanımı). Bunlar bir sonraki belge turunda güncellenir; kod tarafı bu ADR ile başladı.
