# Mağaza ortamı — notlar (varsayımlar ve core için eksikler)

## Varsayımlar (`MAGAZA_SABITLERI`, `ortam.ts`)

- **Izgara:** 1 hücre ≈ 1 m; yürüme 0,9 hücre/sn (±%20); 4 komşulu BFS, hedef başına önbellekli uzaklık alanı → adım başına O(n).
- **Varış:** Poisson, `varisHiziDkBasina` kapı önünden geçen potansiyel müşteri; giriş olasılığı `0,55 + 0,45·niyet`.
  Havuzdan iadeli seçim; aynı müşteri tekrar gelirse kimliği `m12#2`.
- **Liste:** kategori ilgisi = temel ilgi (gıda 0,9 … ev 0,35) × U(0,4–1,3) × bölge çekiciliği × (kampanyalıysa 1 + 2·indirim·niyet).
  Ürün seçimi `secimOlasiliklari` (yeni ürünler `nu_yenilik` üzerinden). Harcama hedefi `butce·(0,45 + 0,4·niyet + 0,1·U)`;
  çeşit sayısı `2–4 + 6·niyet + hedef/400`; ürün başına en çok 6 adet.
- **Rafta:** seçenek sayısı = rafta ürün × 3 varyant (aksi hâlde 3–4 ürün `secimYukuTerkOlasiligi` eşiği 6'nın altında kalır);
  bekleme = 2 sn + seçenek × 5 kelime / `okuma_hizi` + 3 sn/kalem.
- **Plansız alım:** hedef dışı komşu raf için `farkEtmeOlasiligi × 0,35` (göz gezdirme), promosyon adası için tam olasılık
  (ada çevresinde 2 hücre). Plansız ilgi çarpanı raf 0,6, ada 0,75.
- **Kuyruk sabrı:** `θ.sabir` web saniyesi; fiziksel kuyrukta zaman ölçeği 8 (1 web sn ≈ 8 mağaza sn):
  `terkOlasiligi(θ, geçen/8, sürtünme, dt/8)`. Sürtünme: önde ≥ 4 kişi varken kuyruğa girmek ve her 150 sn bekleme.
- **Kasa süresi:** `kasaIslemSuresiSn × (0,5 + 0,5·adet/6) × U(0,8–1,2)`.
- **Bütçe kalibrasyonu (ADR-004):** `gercekSepetMedyaniTL` verilince başlangıç çarpanı = hedef / medyan(θ.butce) / beklenen pay,
  sonra her 20 fişte sönümlü düzeltme (son 200 fişin **medyanı** hedefe). Ortalama sepet sağa çarpık dağılım yüzünden medyanın
  ≈ 1,4 katıdır; test (4) bu yüzden medyanı ±%30, ortalamayı 0,7–1,8 aralığında denetler.
- **Kamera sayımı:** `giris` → varış hızı = giren/saat ÷ ortalama giriş olasılığı. Raf bulunan bölgelerin sayımı, ortalamalarına
  oranla (0,3–3 sınırlı) o bölgedeki kategorilerin liste ağırlığını çarpar. `kasa_onu`, `promosyon` sayımları şimdilik kullanılmıyor.
- `bolgeSayimlari()` alanlarına `tekil` eklendi (bölgeye uğrayan ziyaret sayısı); `toplam` bölgeye giriş sayısıdır (yeniden girişler dahil).
- `kpi()` ek alanlar: `iceride`, `kuyrukAnlik`, `fisSayisi`, `terk`, `gecen`. Ek yöntemler: `kategoriSatislari()`, `butceOlcegi()`.
- `kasa` olayının `veri`'sinde ayrıca `butce` (o ziyaretin etkin bütçesi) ve `kasa` var; `terk` olayında `tutar`, `urunSayisi`, `beklemeSn`.

## Core'da eksik / tutarsız gördüklerim (core değiştirilmedi)

1. **Sabır birimi:** `terkOlasiligi` web saniyesine göre ayarlı; fiziksel kuyrukta doğrudan kullanılınca 2–3 dakikalık bekleme
   neredeyse herkesi terk ettiriyor. Öneri: `terkOlasiligi(..., zamanOlcegi = 1)` parametresi veya ortama özgü `sabir` çarpanı core'da.
2. **Kategori ilgisi θ'da yok:** `Teklif.ilgi` her ortamda elle uyduruluyor. Öneri: `Musteri`'ye isteğe bağlı `kategoriIlgisi`
   (segmentten türeyen) veya `Segment.kategoriKaydirmalari`.
3. **`fiyatTerimi` ucuz ürünlerde doyuyor:** fiyat/bütçe çok küçükken `−η·ln(p/b)` +3–4 logit veriyor; fark edilen her ucuz ürün
   ~%95 alınıyor. Plansız alım bu yüzden fark etme olasılığıyla sınırlandı. Öneri: terim için alt sınır veya kategori referansına göre oran.
4. **Adet yok:** `Teklif` tek birim; market sepetinde adet kararı (stoklama, `beta_simdicilik`) modellenmiyor. Burada listede kural tabanlı.
5. **Olay türü:** `pos_transaction` (ADR-004) `OlayTuru`'nda yok; mağaza `kasa` kullanıyor. Kuyruktan vazgeçme için `terk` ile
   `veri.sebep='kuyruk'` yeterli ama ayrı tür analitikte daha temiz olur.
6. **ADR-004 ile gerilim:** ADR-004 kamera/cihaz izlemeyi ilk sürümde kaynak saymıyor; `gercekBolgeSayimlari` isteğe bağlı ve yalnız
   toplu sayım (kimliksiz) olarak uygulandı. Kullanımı proje sahibinin kararına bağlı olmalı.
7. **Segment rengi araması:** `TURKIYE_SEGMENTLERI` dışında bir segment listesiyle üretilen müşteriler gri çizilir; `Musteri`'de renk
   veya segment listesini ortama verme yolu yok.
