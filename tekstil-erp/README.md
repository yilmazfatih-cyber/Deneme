# Tekstil AI ERP

Türkiye'deki tekstil şirketleri (iplik, dokuma/örme, boya-apre, konfeksiyon, toptan/perakende) için
**yapay zekâ destekli, sunucusuz, çevrimdışı çalışan ERP web uygulaması (PWA)**.

Tüm veriler tarayıcının IndexedDB'sinde kalır; hiçbir sunucuya gönderilmez. Yapay zekâ modelleri
tarayıcıda (WebGL/WASM) çalışır. İsteğe bağlı olarak yerel bir dil modeli (Ollama) bağlanabilir.

## Modüller

| Modül | Ne yapar | Kullanılan açık model / teknik |
| --- | --- | --- |
| **Ürünler** | İplik, kumaş, konfeksiyon, aksesuar kartları; gramaj, en, kompozisyon; kritik stok eşiği | — |
| **Üretim takibi** | Parti (lot) bazlı takip: İplik → Dokuma/Örme → Boya → Apre → Kesim → Dikiş → Kalite → Paketleme → Sevkiyat; kanban, termin gecikmesi | — |
| **Stok ve barkod** | QR'lı parti etiketi basma, kamera ile barkod/QR okuma, giriş/çıkış/transfer/fire hareketleri, depo özeti | Tarayıcı `BarcodeDetector` API'si, yoksa [ZXing](https://github.com/zxing-js/browser); QR üretimi [node-qrcode](https://github.com/soldair/node-qrcode) |
| **Müşteriler / Siparişler** | Cari, segment (toptan/perakende/ihracat), teklif → onay → üretim → sevk → fatura akışı, siparişten üretim emri ve e-Fatura benzeri satış faturası | — |
| **Kamera analizi** | Mağaza/showroom kamerasından **kişi sayma**, kalış süresi, bölge (giriş/reyon/kasa) yoğunluğu, ısı haritası, saatlik/günlük ziyaretçi grafikleri, kural tabanlı içgörüler. Görüntü kaydedilmez, yüz tanıma yoktur (KVKK) | [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) (`lite_mobilenet_v2`) + basit centroid izleyici |
| **Finans (AI)** | Fatura/ödeme/tahsilat; **otomatik yevmiye** (Tek Düzen Hesap Planı), **gider sınıflandırma**, **nakit akışı tahmini** (Holt üstel düzeltme), **anomali tespiti** (sağlam z-skoru, mükerrer fatura, KDV uyuşmazlığı), vade/risk analizi, KDV özeti | Kural ve istatistik tabanlı; LLM bağlıysa doğal dil yorumu |
| **Belgeler ve OCR** | PDF ve fotoğraf faturaları okuyup alanları çıkarır (fatura no, tarih, VKN, KDV, toplam, satırlar), tek tıkla fatura + yevmiye oluşturur; aranabilir belge arşivi | [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR, `tur+eng`), [PDF.js](https://github.com/mozilla/pdf.js) (metin katmanı; yoksa sayfayı render edip OCR) |
| **AI asistan** | "Bu ay nakit durumu nasıl?", "Vadesi geçen alacaklar kimde?" gibi sorulara verilerinizden yanıt | Yerel kural tabanlı analiz; isteğe bağlı [Ollama](https://github.com/ollama/ollama) veya OpenAI uyumlu uç nokta |
| **Ayarlar** | Şirket bilgisi, LLM bağlantısı, OCR dilleri, tema, JSON yedek/geri yükleme, demo verisi | — |

## Kurulum

```bash
cd tekstil-erp
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ — herhangi bir statik barındırmaya (GitHub Pages, Nginx, S3) kopyalanabilir
npm run check      # tip denetimi + ESLint + birim testler
```

Kamera ve barkod okuma için tarayıcı **HTTPS** veya `localhost` ister. Üretimde HTTPS'li bir statik sunucu yeterlidir.

### Açık modellerin ilk indirmesi

Uygulama kodu küçüktür; modeller ilk kullanımda indirilir ve Service Worker ile önbelleğe alınır
(sonraki kullanımlar çevrimdışı çalışır):

- COCO-SSD lite: ~6 MB (kamera analizi ilk açılışta)
- Tesseract.js çekirdek + `tur` ve `eng` dil verileri: ~15 MB (ilk OCR'da)
- PDF.js worker: paketle birlikte gelir

### İsteğe bağlı yerel LLM (Ollama)

```bash
# https://ollama.com — modeli indir ve tarayıcıdan erişime izin ver
ollama pull qwen2.5:7b
OLLAMA_ORIGINS=* ollama serve
```

Ayarlar → Yapay zekâ → Sağlayıcı: **Ollama**, uç nokta `http://localhost:11434/v1`, model `qwen2.5:7b`.
LLM bağlı değilken de tüm finans analizleri ve asistan yerel kurallarla çalışır.

## Mimari

```
src/
  db/schema.ts        Veri modeli (ürün, parti, hareket, üretim emri, müşteri, sipariş, fatura, ödeme, yevmiye, belge, kamera)
  db/index.ts         Dexie (IndexedDB) + yedek/geri yükleme
  db/seed.ts          Demo verisi
  ai/finance.ts       Yevmiye, sınıflandırma, tahmin, anomali, vade/risk
  ai/invoiceParser.ts Türkçe fatura metninden alan çıkarımı
  ai/ocr.ts           Tesseract.js sarmalayıcı
  ai/pdf.ts           PDF.js metin + OCR geri dönüşü
  ai/vision.ts        COCO-SSD kişi algılama
  ai/tracker.ts       Centroid izleyici, bölge ve ısı haritası
  ai/llm.ts           OpenAI uyumlu sohbet köprüsü (Ollama)
  ai/assistant.ts     Veri bağlamı + yerel yanıt + LLM
  pages/              Ekranlar (HashRouter)
  components/         Ortak arayüz bileşenleri
tests/                Vitest birim testleri (finans, fatura çıkarımı, izleyici)
```

## Sınırlar ve notlar

- Uygulama **mali müşavirin veya resmî e-Fatura/e-Defter sisteminin yerini almaz**; yevmiye kayıtları ve KDV hesapları ön muhasebe amaçlıdır.
- OCR doğruluğu belge kalitesine bağlıdır; çıkarılan her alan kaydetmeden önce düzenlenebilir ve güven puanıyla gösterilir.
- Kamera analizi yalnızca anonim sayım yapar; görüntü veya kimlik verisi saklamaz. Mağazada kamera kullanımı için yerel mevzuata (KVKK aydınlatma metni) uyulmalıdır.
- Veriler tek cihazdadır; çoklu kullanıcı için **Ayarlar → Yedek** ile JSON paylaşılabilir. Sunucu senkronizasyonu yol haritasındadır.
