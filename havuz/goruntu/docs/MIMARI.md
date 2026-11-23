# Mimari

## Paketler

```
goruntu/
├─ cli.py, commands.py      komut satırı (Türkçe argparse) ve komut kaydı ("YENİ KOMUT BURAYA")
├─ komutlar/                her komut grubunun ince kabuğu: seçenekler + ilgili paketi çağırma
├─ messages.py              kullanıcıya görünen BÜTÜN metinler (t("anahtar"))
├─ config.py                TOML + -D değişiklikleri + hazır ayarlar
├─ hazirlik/                (torch YOK) güvenli açma, EXIF yönü, üst veri, boyutlandırma, model girdisi
├─ kopya/                   (torch YOK) aHash/dHash/pHash, Hamming, gruplar, sızıntı
├─ siniflandirma/           veri keşfi, sızıntısız ayrım, timm modeli, eğitim, ölçütler, kalibrasyon, plan
├─ disa_aktar/              ONNX aktarımı + int8; torch'suz çalışma zamanı (runtime.py)
├─ arama/                   gömme modelleri, dizin, sıfır atış, recall@k
├─ sunucu/                  FastAPI: istek kapısı (gate.py), durum, uçlar
├─ synthetic.py             programla örnek görüntü (veri depoya girmez)
├─ catalog.py               katalog şeması (katalog/modeller.yaml)
└─ hardware.py, console.py, errors.py, io_utils.py, text_tr.py   ortak yardımcılar
```

## Görüntünün yolculuğu (her yerde aynı)

```
dosya / yüklenen baytlar
  │  hazirlik/loader.open_checked   boyut ≤ azami_bayt → Image.open(formats=beyaz liste) → piksel ≤ azami_piksel
  │  hazirlik/loader.decode         pikseller çözülür, EXIF/XMP yönü uygulanır
  │  hazirlik/loader.normalize_mode 16 bit → 8 bit, palet/saydamlık → RGB (beyaz zemin), info = {}
  ▼
RGB görüntü (üst verisiz)
  ├─ hazirlik/metadata.encode_clean ............ temizle / hazirla (yeniden kodlama)
  ├─ kopya/scan.image_hashes .................... 5 kırpma varyantlı pHash
  ├─ hazirlik/model_input.prepare ............... uint8 (Y, G, 3) — eğitim değerlendirmesi, ONNX, sunucu
  │     └─ ImageClassifier / ONNX grafiği: ÷255, −ortalama, ÷sapma, NCHW → timm gövdesi → logit
  └─ arama/embedders ............................ HF işlemcisi (CLIP/SigLIP) ya da histogram → normlu vektör
```

## Eğitim akışı (`egit`)

```
klasör ──dataset.discover──► örnekler (sınıf = klasör adı, NFC; grup_deseni)
       ──kopya/scan──► 5 varyantlı özetler (açılamayanlar ayrim.json'a)
       ──split.plan_split──► egitim / dogrulama / test (kopyalar + gruplar aynı parçada, katmanlı)
       ──[--kuru] plan.render_plan──► plan, bellek ve süre kestirimi, DUR
       ──model.build_backbone──► timm (önceden eğitilmiş) + ImageClassifier sarmalayıcı
       ──train._fit──► dönemler: baş/tam kip, AdamW (ayrımlı oran), kosinüs, erken durdurma, en iyi ağırlık
       ──report.finish_training──► doğrulamada sıcaklık + eşik → testte rapor → model/ + json/txt
```

Çıktı klasörü: `model/` (agirliklar.safetensors + model.json), `degerlendirme.json`, `rapor.txt`,
`gunluk.jsonl`, `ayrim.json`, `yapilandirma.toml`, `ozet.json`; `disa-aktar` sonrası `paket/`
(model.onnx [+ model.int8.onnx] + paket.json).

## Çıkarım yolları

| Yol | Gerekenler | Kod |
| --- | --- | --- |
| PyTorch | torch + timm | `siniflandirma/predict.TorchClassifier` |
| ONNX (Python) | onnxruntime + numpy + pillow + pydantic | `disa_aktar/runtime.OnnxClassifier` (torch yüklemez, testli) |
| HTTP | `sunucu` ekstrası | `python -m goruntu sun --model … --dizin …` |
| Tarayıcı | onnxruntime-web | `docs/TARAYICI.md`, `ornekler/tarayici/index.html` |

İkisi de aynı karar kuralını kullanır (`calibration.Decision`): olasılık = softmax(logit / sıcaklık);
en yüksek olasılık < eşik → "emin değilim" (`etiket: null`).

## Arama akışı

```
indeksle KLASOR ──sha256 kimlik (varsa atla)──► load_rgb ──► embed_images (yığınlar) ──► ImageIndex.add ──► save (atomik)
ara METIN       ──► embed_texts (SigLIP: max_length=64) ──► dizin @ sorgu (kosinüs) ──► ilk k
benzer GORUNTU  ──► embed_images ──► dizin @ sorgu (sorgunun kendisi hariç) ──► ilk k
```

## Sunucu

`RequestGate` (ASGI) → gövde okunmadan önce: yerel kipte Host/Origin, anahtar kipinde Bearer/X-API-Key,
Content-Length ve akış sayacıyla boyut sınırı → FastAPI uçları (`def`, iş parçacığı havuzunda) →
`load_rgb` (piksel sınırı) → bileşen (`OnnxClassifier`, `Embedder`, `ImageIndex`).
