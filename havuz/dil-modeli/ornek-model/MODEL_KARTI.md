# Örnek model kartı: `ornek-model`

Bu klasördeki model, `dil_modeli` paketinin uçtan uca çalıştığını göstermek için CPU'da 13 dakikada
eğitilmiş **çok küçük** bir Türkçe dil modelidir. Bir ürün modeli değildir; bilgi kaynağı olarak
kullanılmamalıdır.

## Özet

| Özellik           | Değer                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| Mimari            | LLaMA uyumlu çözücü: RMSNorm, RoPE, SwiGLU, paylaşımlı gömme/çıkış               |
| Boyut             | 1.328.256 parametre — 4 katman, gizli boyut 128, 4 baş, ara katman 352           |
| Bağlam            | 256 belirteç                                                                     |
| Tokenizer         | Bayt düzeyi BPE, 4.096 belirteç (16 özel belirteç dahil), aynı veriyle eğitildi |
| Tür               | Temel (ön eğitimli) model. Sohbet ince ayarı **yapılmadı**.                      |
| Eğitim süresi     | 12,9 dakika, CPU, 2 iş parçacığı (paylaşımlı 4 çekirdekli makine)                |
| Görülen belirteç  | 6.553.600 (eğitim verisinin ~0,8 turu)                                           |

## Veri

- **Kaynak:** Hugging Face `wikimedia/wikipedia`, alt küme `20231101.tr` (Türkçe Vikipedi, 1 Kasım
  2023 dökümü), veri kümesi sürümü (commit) `b04c8d1ceb2f5cd4588862100d08de323dccfbaa`.
- **Kullanılan kısım:** `20231101.tr/train-00000-of-00002.parquet` dosyasının ilk 3 satır grubu
  (3.000 madde). 500 karakterden kısa maddeler ve "(anlam ayrımı)" sayfaları atıldı → **2.595
  madde, 25,7 milyon karakter**. Belge bazında %2 doğrulamaya ayrıldı (doğrulama: 122.971
  belirteç, 381.060 karakter).
- **Lisans:** veri kümesi kartında `cc-by-sa-3.0` ve `gfdl` (Hugging Face API'sinden okundu,
  `egitim-kaydi.json` → `veri.kaynak.lisans`). Atıf: _Vikipedi katkıcıları, Türkçe Vikipedi._
- Ham veri depoda yoktur. Yeniden indirmek: `python scripts/ornek_model.py hazirla`.

## Eğitim

`yapilandirma/ornek-model.toml`: 1.600 adım, yığın 16 × 256 belirteç, AdamW (β 0,9/0,95, ağırlık
çürümesi 0,1), öğrenme oranı 2e-3 → 100 adım ısınma → kosinüsle 2e-4, gradyan kırpma 1,0, tohum 0.
Uçtan uca hız: 6.553.600 belirteç / 779,5 sn ≈ 8.400 belirteç/sn (başlatma, doğrulama ve kayıt
dahil; makinede başka işler de çalışıyordu). Günlükteki aralık değerleri 6.060–9.870; düşük olanlar
doğrulama adımlarından hemen sonraki aralıklardır (o sürümde değerlendirme süresi hıza sayılıyordu;
düzeltildi).

| Adım | 200   | 400   | 600   | 800   | 1000  | 1200  | 1400  | 1600  |
| ---- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Doğrulama kaybı | 5,442 | 4,794 | 4,483 | 4,309 | 4,167 | 4,079 | 4,006 | 3,966 |

Kayıp hâlâ iniyordu: daha uzun eğitim ya da daha çok veri modeli iyileştirir.

## Ölçümler (nasıl ölçüldü)

Hepsi doğrulama belgeleri üzerinde, `scripts/ornek_model.py paketle` içinde hesaplandı:

| Ağırlık türü              | Boyut   | Doğrulama kaybı¹ | Şaşkınlık² | Karakter başına bit² |
| ------------------------- | ------- | ---------------- | ---------- | -------------------- |
| float32 (`model.safetensors`) | 5,32 MB | 3,9656       | 51,21      | 1,8325               |
| float16 (tarayıcı, depoda yok) | 2,66 MB | 3,9656      | 51,21      | 1,8325               |
| int8 (`tarayici/model.bin`) | 1,37 MB | 3,9655         | 51,21      | 1,8324               |

¹ Çakışmayan 256 belirteçlik pencereler, belirteç başına ortalama çapraz entropi (nat).
² Kayan pencere (bağlam 256, adım 128): her belirteç en az 128 belirteçlik bağlamla bir kez sayılır.

Satır başına int8 nicemleme bu modelde ölçülebilir kayıp getirmedi (fark gürültü düzeyinde).
Örnek tokenizer'la bir karakter ortalama 1/3,16 belirteçtir.

## Örnek çıktılar

Sıcaklık 0,8, top-p 0,95, yineleme cezası 1,1, tohum 0, 60 belirteç (`egitim-kaydi.json` →
`ornek_ciktilar`); istem kalın:

- **Osmanlı İmparatorluğu**'nun (d. 1731) / 18 Şubat - Eile Dahliyea, Fransız yazar ve ressam (d.
  1752) / 1824 - Benine Haprien, Amerikalı politikacı (d. 1837) …
- **Futbol** sondası / MÖ 3. bölgeye ile kalan ve doğusunda bulunan altı bölümü vardır. Üç iki ülke
  sayısı 5.400–24309). İlişkinlere şehirde ülkenin batıda …

Açgözlü (sıcaklık 0) **Türkiye'nin başkenti** → "dir. / Milayet, Osmanlı'nın güneyinde, güneyde
Kafkasya'nın güneyinde yer alan bir yerdir. / Kültür / Kültür …"

## Ne yapabilir, ne yapamaz

- **Yapabilir:** Türkçe ekleri, kelime biçimlerini ve Vikipedi düzenini ("(d. 1752)", "Kültür"
  başlıkları, tarih listeleri) taklit eden metin üretir. Paketin bütün yollarını (üretim, sunucu,
  tarayıcı, Hugging Face/GGUF aktarımı, LoRA ince ayarı) denemek için yeterlidir.
- **Yapamaz:** Doğru bilgi vermez (yukarıdaki "Fransız ressam" uydurmadır), anlamlı paragraf
  kuramaz, soru yanıtlayamaz, talimat izleyemez; açgözlü üretimde aynı satırı yineler. Bağlam 256
  belirteçtir. Vikipedi'deki önyargıları ve yazım hatalarını taşıyabilir.

## Dosyalar

| Dosya                       | Ne                                                     |
| --------------------------- | ------------------------------------------------------ |
| `config.json`               | model biçimi (`dil-modeli/1`)                          |
| `model.safetensors`         | float32 ağırlıklar                                     |
| `tokenizer.json`            | BPE tokenizer (Hugging Face `tokenizer.json` alt kümesi) |
| `tarayici/`                 | int8 tarayıcı paketi (`manifest.json`, `model.bin`, `tokenizer.json`) |
| `egitim-kaydi.json`         | veri kimliği/sürümü/lisansı, dosya özetleri, ayarlar, kayıp eğrisi, süreler, ölçümler |

Toplam model dosyası: 6,93 MB.

## Lisans

Model ağırlıklarının, eğitim verisinin türevi sayılıp sayılmadığı hukuken net değildir. Güvenli
taraf: bu modeli ve tokenizer'ı verinin lisansıyla, **CC BY-SA 3.0** koşullarında (atıf: "Vikipedi
katkıcıları" + aynı lisansla paylaşım) dağıtın. Bu bir hukuki görüş değildir.

## Yeniden üretme

```bash
python scripts/ornek_model.py hazirla   # indir (~30 MB), tokenizer + veri (~30 sn)
python scripts/ornek_model.py egit      # ~13 dk, CPU
python scripts/ornek_model.py paketle   # bu klasör + egitim-kaydi.json
python scripts/tarayici_sinama.py       # tarayıcı eşlik vektörleri
```

Aynı makinede tokenizer ve veri dosyaları bayt bayt aynı çıktı (denendi). Eğitim tohumludur;
farklı işlemci ya da PyTorch sürümünde kayan nokta farkları sonucu küçükçe değiştirebilir.
