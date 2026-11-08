# E-ticaret ortamı — notlar (core'a öneriler ve varsayımlar)

Core (`src/core/*`) değiştirilmedi. Aşağıdakiler ortam tarafında geçici çözümle karşılandı; core sahibine öneri.

## Core'da eksik / ölçek sorunu görülenler

1. **`terkOlasiligi` bekleme ölçeği yükleme için zayıf.** `gecen/sabir·0.02` ile 8 sn yükleme ~%0.2/sn tehlike verir;
   yavaş sayfanın web verisindeki etkisi (04 §6) çok daha güçlü. Ortamda `YUKLEME_ALGI_CARPANI = 15` ile çarpıldı.
   Öneri: `terkOlasiligi`'na `tur: 'yukleme' | 'okuma'` ya da ayrı `yuklemeTerkOlasiligi` eklemek.
2. **Sürtünme sayısı sönmüyor.** Çekirdek tehlike `surtunme·0.02/sn` sabit; tek bir sürtünme 25 sn'lik ödeme sayfasında
   ~%40 terk veriyordu. Ortamda sönümlü "etkin sürtünme" (τ = 8 sn) verildi; toplam `hayal_kirikligi_esigi`'ne ulaşınca
   toplam veriliyor (rage quit). Ayrıca eşikte 0.06 → 0.2 sıçraması sert bir uçurum yaratıyor (yükleme 3 → 4 sn).
   Öneri: core'da `DikkatDurumu { sabir, hayalKirikligi }` (04 §6.2) ve yumuşak geçiş (lojistik).
3. **`Teklif.ekUcret` aşamadan bağımsız.** "Ne kadar geç görünürse o kadar sert" (drip pricing, WB Blake 2021) core'da yok;
   ortamda `SURPRIZ_CARPANI` (ürün 1, sepet 1.3, ödeme 1.8) ile ekUcret büyütülüyor. Öneri: `Teklif.ekUcretAsamasi`.
4. **İndirim çerçevesi (yüzde / TL) `Teklif`'te yok.** Ortamda "100 kuralı" ile `indirimOrani` ×1.2 / ×0.8 yapılıyor (varsayım).
5. **`secimOlasiliklari`'nda "hiçbiri" (dış seçenek) yok;** seçmeme yalnız `secimYukuTerkOlasiligi` ile. Fayda düşük
   listede de biri seçiliyor.
6. **Kategori ilgisi θ'da yok, `MusteriGirdisi`'nde hedef kategori/ürün yok.** Ortam her ziyaretçiye rng ile hedef kategori
   ve kategori ilgisi atıyor (hedef: 0.45 + 0.5·niyet). Reklam modülü hedef kategoriyi geçirebilmeli (`MusteriGirdisi.hedefKategori?`).
7. **Segment rengi `Musteri`'de yok;** `ciz` `TURKIYE_SEGMENTLERI`'ne bağlı. Özel segment listesi kullanılırsa renk gri kalır.
   Öneri: `Ortam.baslat`'a segment listesi ya da `MusteriGirdisi.renk`.
8. `Ortam` arayüzünde `huni()` yok; UI ortak huni paneli için isteğe bağlı `huni?()` eklenebilir.
9. `kpi()` `Record<string, number>` → `enCokTerkAsamasi` sayısal indeks; metin için `enCokTerk()` ayrı metot.

## Ortam varsayımları (03 kalibre etmeli)

- Geliş: P(gel) = 0.4 + 0.6·niyet; hedefli (doğrudan ürün sayfası) = 0.1 + 0.7·niyet; gelişler sürenin ilk %70'inde.
- Açılışta hemen çıkma (hedefsiz) = 0.4·(1 − niyet). Ürün sayfasında gezinme çarpanı = 0.35 + 0.65·niyet.
- Sayfa süreleri: kelime/okuma_hizi (liste 4 kelime/kart, en çok 30 kart + Hick-Hyman 1.2·log2(N+1); ürün 80; sepet 30;
  ödeme 15 sn + 40 kelime). Form hatası %12 (+12 sn, sürtünme). Yavaş yükleme (> 3 sn) sürtünmesi birikime 0.25 sayılır.
- Sepet/ödeme "sonraya bırak" tabanı 0.9 + 0.08·niyet; sürprizde göreli oran P(al | ekUcret)/P(al).
  Ödemede taksit + rozet oranı en çok 1.15'e çıkarabilir.
- Eşik tamamlama: eksik tutarı karşılayan en ucuz katalog ürünü; P(ekle) = lojistik((u_ekle − u_kargo)/τ).
- Huni sayımı "en ileri ulaşılan aşama"ya göredir; hedefli ziyaretçi listeyi atlasa da liste girenine sayılır.
- Sim süresinin 2 katında açık oturumlar `terk(neden: oturum_sonu)` ile kapatılır.
