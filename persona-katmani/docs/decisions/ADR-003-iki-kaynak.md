# ADR-003 · Gerçek müşteri verisi bağımsız ikinci kaynaktır; genel model ile birleştirilebilir ve farkı gösterilir

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi) · ADR-002'yi düzeltir

## Karar

ADR-002'deki zincir **S0 Dünya → S1 Türkiye → S2 Şehir → S3 Konum/site** olarak kalır ve **Kaynak A (genel model)** adını alır.
Gerçek müşteri verisi bu zincirin devamı (eski S4) **değildir**; **Kaynak B (gerçek müşteri modeli)** olarak **sıfırdan**, Kaynak A'dan
öncül almadan, kiracının kendi müşteri gözlemlerinden kestirilir.

Analizde üç sunum biçimi vardır ve çalışma tasarımında seçilir:

| Kip | Ne gösterir | Ne zaman |
| --- | --- | --- |
| **A** yalnız genel model | Literatür ve kamu istatistiğinden türeyen Türkiye/şehir/konum davranış profili | Müşteri verisi yok veya "piyasa geneli böyle davranır" sorusu |
| **B** yalnız gerçek müşteri | Kiracının kendi müşterilerinden hesaplanan profil, kendi belirsizliğiyle | "Bizim müşterimiz nasıl davranıyor" sorusu; dış varsayımdan bağımsız |
| **A+B** birleşik + fark | İki kaynağın birleştirilmiş kestirimi **ve** aralarındaki fark (parametre başına: yön, büyüklük, anlamlılık) | "Müşterimiz Türkiye genelinden nerede ayrışıyor" sorusu; en bilgilendirici kip |

Fark (A − B) kendi başına bir bulgudur: raporda "Türkiye genelinde kargo eşiği duyarlılığı X, sizin müşterinizde Y" biçiminde,
güven aralığı ve örneklem büyüklüğüyle verilir. Birleşik kestirimde ağırlık verinin miktarına göre otomatik belirlenir
(Bayesçi birleştirme: A öncül, B veri; ya da ters varyans ağırlıklı ortalama). Hangi yöntemle birleştirildiği raporda yazar.

## Neden

- Gerçek müşteri profili genel öncülle "yumuşatılırsa" müşterinin gerçek farkı silinir; en değerli içgörü kaybolur.
- İki bağımsız kaynak birbirinin doğrulamasıdır: B, A'nın Türkiye öncüllerinin kalibrasyonu için gerçek veri sağlar; A, B'nin az veriyle
  aşırı kesinliğe düşüp düşmediğini gösterir.
- Müşteri, dış varsayım içermeyen "yalnızca bizim verimiz" görünümünü isteyebilir.

## Sonuçları

- `07`: §3 iki kaynak olarak yeniden kurulur; "S4" terimi kalkar, yerine "Kaynak B"; yeni bölüm: birleştirme yöntemi ve fark raporu.
- `05` çalışma tasarımı: `parameter_source ∈ {A, B, A+B}` ve A için `level ∈ {S0..S3}`; rapor şablonuna "Fark tablosu".
- `03`: Kaynak B'nin kendi başına kalibrasyonu (tutulan oturum) ve A ile B'nin uyuşmazlık metriği.
- `02`: persona sınıfları `general_profile` (A) ve `customer_profile` (B); birleşik profil `fused_profile`.
- Excel: yalnızca Kaynak A'nın S0/S1 öncüllerini taşır; Kaynak B'ye literatür girmez.
- ADR-002'nin 3. ve 4. maddeleri bu belgeyle okunur; hedefleme yasağı ve kişiye gösterim yasağı Kaynak B için aynen geçerlidir.
