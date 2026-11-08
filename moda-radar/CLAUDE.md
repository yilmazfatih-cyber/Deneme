# Moda Radar — ortak anayasa

Moda Radar, defile görsellerinden sezonun tutacak **renklerini (Pantone TCX koduyla), kumaşlarını, desenlerini ve
siluetlerini** tahmin eden; bu tahmini **ülke ve sosyoekonomik segment** bazında yerelleştiren; ürün bazında
**"yatır / dene / bekle / girme"** kararı üreten bir karar destek sistemidir. WGSN'nin kapalı kutu yaptığını açık,
ölçülebilir yöntemle ve Türkiye odağıyla yapar.

Mimar: Fable 5.1 (bu belge ve `docs/`). Üretim: Opus 5.5 ajan ekibi (`.claude/agents/`, `docs/EKIP.md`).
Plan: `docs/PLAN.md` · Yol haritası: `docs/ROADMAP.md` · Kararlar: `docs/decisions/` · Ekip: `docs/EKIP.md`.

## Sekiz ilke (her inceleme bunlara göre yapılır)

1. **Her tahmin olasılık ve ufuk taşır.** "Tutacak" yok; "SS27'de Zara segmentinde raf payı ≥ %4 olma olasılığı 0,62" var.
2. **Renk isim değil koddur.** Her renk Lab değeri + en yakın Pantone TCX (ΔE2000) + eşleme güveni taşır. İsim okunabilirlik içindir.
3. **Podyum tek kaynak değildir.** Podyum erken sinyal, perakende raf doğrulama, talep (arama, sosyal) hızdır. Üçü olmadan tahmin yayımlanmaz.
4. **Segment gecikmesi öğrenilir, varsayılmaz.** Podyum→raf gecikmesi segment başına geçmiş veriden ölçülür; önsel `content/segmentler.json`'da, model günceller.
5. **Geriye test olmadan ileri tahmin yok.** Her model sürümü en az iki geçmiş sezonda tutturma oranıyla `docs/karne/` altına kaydedilir.
6. **Yatırım kararı tek sayıya indirgenmez.** Trend ivmesi, segment uyumu, zamanlama, maliyet/marj, stok riski ayrı gösterilir; karar sonra gelir.
7. **Veri etik ve hukukidir.** Görsel saklanmaz, çıkarılmış etiket saklanır; robots.txt'e uyulur; yüz işlenmez; her kayıtta kaynak ve tarih vardır.
8. **Yatırım tavsiyesi değildir.** Sistem gerekçeli öneri verir; satın alma kararı insanındır.

## Komutlar (hedef arayüz; `moda_radar/cli.py` bunu uygular)

| Komut                                                                                                  | Ne yapar                                                                      |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `python -m moda_radar topla --sezon SS27 --kaynak podyum`                                              | Defile görsellerini indirir, etiketler, görseli siler                         |
| `python -m moda_radar topla --sezon SS27 --kaynak perakende --segment zara`                            | Perakende ürün sayfalarını tarar, nitelik + renk kaydı üretir                 |
| `python -m moda_radar renk --sezon SS27`                                                               | Sezon paletini çıkarır, Pantone TCX eşler                                     |
| `python -m moda_radar tahmin --sezon SS27 --ulke TR --segment hepsi`                                   | Nitelik × segment olasılık tablosu                                            |
| `python -m moda_radar yatirim --sezon SS27 --segment zara --kategori kadin-ust`                        | Ürün kartları: yatır / dene / bekle / girme                                   |
| `python -m moda_radar geriye-test --tahmin SS25 --veri-kadar 2024-09-30`                               | Zaman kilidiyle geçmiş sezon tahmini ve karne                                 |
| `python -m moda_radar dogrula`                                                                         | `content/` JSON'larını şemayla ve çapraz kurallarla doğrular                  |
| `python -m moda_radar sor --segment orta --renk "#2E5A88" --desen duz --siluet oversize --kumas keten` | Tek ürün için beş boyutlu yatırım kartı (kullanıcı sorusu)                    |
| `python -m moda_radar esle --hex "#DA321C"`                                                            | Hex → en yakın iki Pantone TCX, ΔE ve güven                                   |
| `python -m moda_radar db-ozet` · `sinyal-yukle` · `gecikme-olc`                                        | Veritabanı özeti; rapor sinyallerini DB'ye yükler; podyum→raf gecikmesi ölçer |
| `pytest` · `ruff check .` · `ruff format --check .`                                                    | Birim test, lint, biçim                                                       |

## Klasör sahipliği (her klasörün tek yazarı vardır)

| Yol                                                                                         | Sahibi                             |
| ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `CLAUDE.md`, `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/EKIP.md`, `docs/sezonlar/*/brief.md`  | bas-mimar                          |
| `docs/decisions/`                                                                           | bas-mimar + ilgili ajan            |
| `moda_radar/sema.py`, `moda_radar/veri/`, `moda_radar/cli.py`, `scripts/`, `pyproject.toml` | veri-muhendisi                     |
| `moda_radar/gorsel/`, `content/taksonomi.json`                                              | gorsel-analist                     |
| `moda_radar/renk/`, `content/pantone/`                                                      | renk-bilimci                       |
| `moda_radar/tahmin/`, `docs/karne/`                                                         | trend-modelci                      |
| `moda_radar/yatirim/`, `content/segmentler.json`, `content/maliyet/`                        | yatirim-analisti                   |
| `docs/sezonlar/*/rapor.md`, `docs/sezonlar/*/reviews/`                                      | moda-editoru                       |
| `tests/`                                                                                    | kodu yazan ajan, kendi modülü için |

Ajanlar birbirinin dosyasını değiştirmez; geri bildirim `docs/sezonlar/<SEZON>/reviews/<ajan>-<tur>.md` dosyasına yazılır.
Her bulgu: **önem** (Engel / Önemli / Öneri) + **yer** + **somut düzeltme**. Engel varsa iş geri döner.

## Mimari özeti

- **Python 3.12, sunucusuz.** Veri SQLite tek dosya (`veri/moda.db`, ADR-005; `moda-verileri` dalında yaşar, GitHub Actions haftalık doldurur), şemalar Pydantic (`moda_radar/sema.py`). Raporlar Markdown + JSON. Modüller arası imzalar `docs/ARAYUZ.md`.
- **Görsel → etiket:** Nitelik çıkarma için görsel dil modeli yapılandırılmış JSON üretir (`content/taksonomi.json` sözlüğüyle);
  toplu etiketleme Sonnet 5.5, örneklem denetimi Opus 5.5 (ADR-004). Görsel diske yazılmaz, bellekten işlenip atılır.
- **Renk:** Giysi maskesi → Lab → k-means (k=3..5) → baskın/vurgu renk → sezon paleti → ΔE2000 ile Pantone TCX eşlemesi (ADR-001).
- **Yayılma modeli:** Nitelik × segment için gecikmeli raf payı modeli; çıktı eşik aşma olasılığı; Brier ile kalibrasyon (ADR-003).
- **Zaman kilidi:** Geriye testte karar tarihinden sonraki hiçbir kayıt okunmaz (`moda_radar/veri/zaman_kilidi.py`).
- **Segment:** Türkiye için 5 İstanbul segmenti + kesen boyutlar (tesettür, iklim). Ülke = segment kümesi + bağlam değişkenleri.
- Büyük harf her zaman `str.upper()` değil `tr-TR` kurallarıyla; dosya ve rapor dili Türkçe, kod tanımlayıcıları Türkçe.

## "Bitti" tanımı (her sezon raporu)

- [ ] Her renk satırında: TCX kodu, hex, Lab, ΔE, podyum payı, önceki sezona fark, segment başına beklenen raf tarihi
- [ ] Her nitelik tahmininde: olasılık, ufuk, eşik, kaynak sayısı, gerekçe (≤ 3 cümle)
- [ ] Her yatırım kartında beş boyut ayrı ayrı görünür; tek skor yok; "girme" kararı da gerekçeli
- [ ] Rapor, geriye test karnesine bağlantı verir (hangi model sürümü, geçmiş tutturma oranı)
- [ ] Hiçbir ham görsel depoda değil; her kayıtta kaynak URL ve tarama tarihi var
- [ ] `pytest`, `ruff`, `dogrula` temiz
- [ ] Moda editörü incelemesinde Engel yok

## Kalite kapıları

1. **Plan kapısı** (baş mimar): sezon brief'i, kapsam ve kabul kriterleri yazılı.
2. **Otomatik kapı** (veri mühendisi): `pytest`, `ruff`, `dogrula` temiz; geriye test karnesi güncel.
3. **Uzman incelemesi** (moda editörü): alan mantığı; "bu renk bu segmentte bu tarihte" iddiası makul mü.
4. **İnsan kapısı** (proje sahibi, mümkünse bir satın almacıyla): rapor okunur, karar insanındır.

Bir sezonda en fazla **3 düzeltme turu**. Üçüncü turdan sonra Engel kalırsa baş mimar durur, seçenekleri `docs/sezonlar/<SEZON>/demo.md`'ye yazar.
Commit kendi çalışma dalına serbesttir; `main`'e birleştirme ve her dış eylem (Issue, e-posta, ödeme) insan onayı ister.
