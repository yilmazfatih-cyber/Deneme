# 08 · Kaynak C: sosyal medyadan öğrenme (Facebook, Instagram, TikTok, X)

Karar: `decisions/ADR-009-sosyal-medya.md`. Bu bölüm Kaynak A (genel model) ve Kaynak B (şirketin gerçek işlem verisi) yanına
üçüncü kaynağı ekler: şirketin sosyal medya hesaplarından **resmî API'lerle** alınan **toplu** veri. Kazıma yok, kişi yok.

## 1. Ne öğrenilir, nereden

| Öğrenme | Girdi | Platform verisi | Çıktı | Parametre |
| --- | --- | --- | --- | --- |
| C1 Reklam tepkisi | Reklam ve organik gönderi metrikleri, yaş × cinsiyet × bölge kırılımı | Meta Insights (age, gender), TikTok report (age, gender), X Ads stats (AGE, GENDER) | Yaş bandı × kanal × yaratıcı × biçim için tıklama, dikkat (3 sn izlenme), tamamlama, etkileşim, dönüşüm oranları ve %95 GA | `dikkat_esigi`, `tau_reklam_tolerans`, yaratıcı tür etkileri (S1/S3 öncülü) |
| C2 Kalibrasyon | Simülasyonun kampanya tahmini (mühürlü) + platformdan gelen gerçek sonuç | Aynı kampanya kimliğiyle gösterim, tıklama, dönüşüm | Brier puanı, isabet oranı, kiracı ve karar türü başına güven hücresi | 03 §8.4 döngüsü dolar; rapor "geçmiş isabet" gösterebilir |
| C3 Sosyal sinyal | Kendi gönderilerinin yorumları (yalnız duygu sayımı), hashtag/konu hacmi | Yorum sayısı ve duygu özeti; X `tweets/counts`, TikTok/Meta hashtag hacmi (sınırlı) | Konu başına ilgi endeksi zaman serisi; olumlu−olumsuz dengesi | `ilgi` (kategori ilgisi), `w_sosyal_kanit` zayıf öncül |

Segment eşlemesi: simülasyon segmentleri yaş × gelir; platformlar yaş × cinsiyet verir. Eşleme **yaş bandı** üzerinden yapılır; gelir
eşlenmez (platform vermez). Cinsiyet kırılımı yalnız raporda gösterilir, segment tanımına girmez (F-3 kararıyla uyumlu: hassas
özellik yok; cinsiyet hassas değil ama segment boyutu da değil).

## 2. Veri akışı

```
Meta Graph/Marketing API ─┐
TikTok Business API ──────┼─► bağlayıcı (ortak şema) ─► sosyal_icerik, sosyal_metrik, sosyal_duygu_ozeti, sosyal_konu_hacmi
X Ads API / X API v2 ─────┘        ▲
Reklam yöneticisi CSV ─────────────┘ (API anahtarı yokken)
                                            │
                     C1 reklam-oncul ───────┼─► sosyal_ogrenim + oncul (S1, kaynak "sosyal") ─► persona-sim/public/ogrenilen/reklam.json
                     C2 kalibrasyon ────────┼─► kor_tahmin.gercek_sonuc, brier ─► rapor "geçmiş isabet"
                     C3 sosyal-sinyal ──────┴─► ilgi endeksi, w_sosyal_kanit çarpanı
```

## 3. Öğrenme kuralları

- **Shrinkage:** gösterim n için ağırlık w = n / (n + 20.000); çarpan = exp(w · ln(oran / taban)). Az veri → çarpan 1'e yakın, güven "düşük".
- **Taban:** aynı kiracının tüm bantlarının gösterim ağırlıklı ortalaması; böylece çarpan kiracı içi göreli farktır, platformlar arası
  ölçek farkı (TikTok CTR ≠ Meta CTR) öncüle sızmaz.
- **Kırpma:** çarpan 0.5–2.0 (C1), 0.7–1.3 (C3). Dışarı çıkan değer "aykırı" etiketiyle raporlanır, öncüle girmez.
- **Sürümleme:** her öğrenme koşusu `surum` taşır; `oncul`da aynı sürüm üzerine yazar, eski sürüm kalır (soy kaydı).
- **Kaynak etiketi:** `oncul.kaynaklar = ["sosyal:meta"]` gibi; rapor "bu öncül sosyal medya verisinden" diyebilir.
- **A ile çelişki:** C1 çarpanı literatür öncülünü (S0) 2 kattan fazla değiştiriyorsa `fark_raporu`na "A–C uyuşmazlığı" satırı düşer.

## 4. Gizlilik ve platform kuralları (06 ile arayüz)

- Saklanan: toplu metrikler, kırılımlar, duygu oranları, konu hacmi. Saklanmayan: kullanıcı kimliği, yorum metni (30 gün içinde
  özetlenip silinir), takipçi listesi, bireysel etkileşim.
- Tokenlar ortam değişkeninde; depoda ve logda yok. Her çekim `denetim_kaydi`na yazılır.
- Platform politikaları: Meta Platform Terms (veri saklama ve amaç sınırı), TikTok Business API Terms, X Developer Agreement.
  Kamu verisi (başkalarının gönderileri) yalnız hacim sayısı olarak; içerik saklanmaz.
- Kişiye hedefleme yok (ADR-002): öğrenilen her şey yaş bandı veya küme düzeyinde.

## 5. Simülasyonla bağ

`persona-sim` açılışta `public/ogrenilen/reklam.json` varsa okur; yaş bandı çarpanlarını segmentlere (`Segment.yas`) uygular ve
yaratıcı tür çarpanlarını `reklamTepkisi`ne iletir. Arayüzde "Öncül: S1 Türkiye + sosyal (Meta, TikTok, X; sürüm …)" görünür.
Çarpanlar yoksa veya güven "düşük" ise simülasyon S1 ile devam eder ve bunu söyler.

## 6. Sınırlar

- Platform dönüşümü piksel/CAPI kurulumuna bağlıdır; yoksa yalnız tıklama kalibre edilir ve rapor bunu belirtir.
- Yaş × cinsiyet kırılımı bazı platformlarda yalnız reklam hesaplarına açıktır; organik içerikte toplam vardır.
- Kamu trend verisi X'te ücretli, TikTok Research API akademik; ticari kullanımda sınırlı. Bu yüzden C3 zayıf öncüldür.
- Bu oturumda platformlara ağ erişimi yok; bağlayıcılar kuru modda ve CSV ile doğrulandı, canlı API çağrısı "doğrulanmalı" etiketli.

## Felsefi sorular (proje sahibine)

1. **Başkalarının gönderileri.** Kamuya açık gönderilerden (hashtag altındaki içerik) yalnız sayı mı alınsın, duygu da çıkarılsın mı?
   Duygu için içerik okunur; kişi saklanmasa bile bir topluluğun konuşması analiz edilmiş olur. Öneri: yalnız sayı; duygu yalnız kendi gönderilerinin yorumlarında.
2. **Yorumları LLM'e göndermek.** Duygu için yorum metni LLM sağlayıcısına gönderilsin mi (daha doğru), yoksa sözlük yöntemi mi kalsın (daha zayıf, veri çıkmaz)?
   Öneri: sözlükle başla; LLM'e yalnız kimliksiz ve toplu, 06 §5 kurallarıyla.
3. **Öğrenilen öncül kiracılar arası paylaşılsın mı?** F-9 "girsin" dedi; sosyal medya çarpanları da S1'e girsin mi, yoksa yalnız kiracının S3'ünde mi kalsın?
   Öneri: F-9 ile tutarlı olarak toplulaştırılmış hâliyle S1'e girsin.
