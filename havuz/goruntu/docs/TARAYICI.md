# Tarayıcıda çıkarım (ONNX Runtime Web)

Eğitilmiş sınıflandırıcı, sunucu olmadan doğrudan web sayfasında çalışabilir: fotoğraf kullanıcının
cihazından çıkmaz. Örnek sayfa: `ornekler/tarayici/index.html` (tek dosya, çerçevesiz).

## Adımlar

1. Paketi üretin: `python -m goruntu disa-aktar --model ciktilar/cpu-kucuk`
2. Sayfayı ve paketi bir klasöre koyun:
   ```
   site/
   ├─ index.html          (ornekler/tarayici/index.html)
   └─ paket/
      ├─ model.onnx       (ciktilar/cpu-kucuk/paket/model.onnx)
      └─ paket.json       (aynı klasörden; tarayıcı ONNX üst verisini okuyamadığı için gerekli)
   ```
3. HTTP sunucusuyla açın (dosyayı çift tıklamak `fetch` yüzünden çalışmaz):
   `cd site && python -m http.server 8000` → http://127.0.0.1:8000
4. ONNX Runtime Web varsayılan olarak jsDelivr'den (`onnxruntime-web@1.31.1`) yüklenir. İnternetsiz
   kullanım için paketin `dist/` klasöründen `ort.wasm.min.js`, `ort-wasm-simd-threaded.wasm`,
   `ort-wasm-simd-threaded.mjs` dosyalarını `site/ort/` altına koyup `?ort=ort/` ile açın
   (`npm pack onnxruntime-web@1.31.1` ile indirilebilir).

## Sayfa ne yapar

- Görüntüyü `createImageBitmap(dosya, { imageOrientation: "from-image" })` ile açar: EXIF yönü uygulanır.
- `paket.json` → `on_isleme` ile `hazirlik/model_input.prepare`'in AYNI hesabını yapar: kısa kenar
  `floor(boyut / kirpma_orani)`, ortadan kırpma (yarımları çifte yuvarlayarak, Python/torchvision gibi),
  saydam yerler beyaz zemine. Kırpılan bölge tek `drawImage` ile model boyutuna çizilir.
- Girdi uint8 `[1, yükseklik, genişlik, 3]`; normalleştirme modelin içinde. Çıkış `olasilik` zaten
  sıcaklıkla kalibre; en yüksek olasılık `esik`'in altındaysa "Emin değilim" yazar.
- `numThreads = 1`: çok iş parçacıklı WASM, sunucunun COOP/COEP başlıklarını ister.

## Eşdeğerlik denemesi (ölçüldü)

Headless Chromium 153 (Chrome for Testing), onnxruntime-web 1.31.1 yerel dosyalarla, minik test modeliyle
(64 px girdi), sayfa `?ornek=<görüntü>` kipinde çalıştırılıp Python `OnnxClassifier` ile karşılaştırıldı.
Yeniden koşmak için: `python scripts/tarayici_esdegerlik.py --paket CIKTI/paket --ort <onnxruntime-web>/dist`
(yeniden boyutlandırmasız görüntüde fark 1e-5'i aşarsa çıkış kodu 1).

| Görüntü | Olasılıklarda en büyük fark |
| --- | ---: |
| 67×67 (yeniden boyutlandırma yok, yalnız kırpma) | 1,7e-8 — girdi birebir aynı |
| 120×120 ve 137×137 (67'ye küçültme) | 7,7e-6 ve 1,6e-6 — tarayıcının ölçekleme filtresi Pillow'un bicubic'iyle aynı değil |

Minik modelin olasılıkları neredeyse eşit olduğundan ikinci satır, gerçek bir modelde farkın büyüklüğünü
göstermez: **yeniden boyutlandırma gereken görüntülerde tarayıcı ile Python arasında küçük farklar
beklenir**; sınırdaki örneklerde karar değişebilir. Tam eşdeğerlik gerekiyorsa görüntüyü sunucuda
(`python -m goruntu sun`) sınıflandırın.

## Denenmeyenler

Gerçek telefon tarayıcıları (iOS Safari, Android Chrome), WebGPU arka ucu, int8 paketi, ICC profili olan
(Display P3) fotoğraflarda renk farkı, büyük modellerin (≥100 MB) indirme süresi.
