# Arap harfli el yazısı (HTR) ve baskı (OCR) tanıma: açık kaynak sistemler ve veri kümeleri

Tarama tarihi: 8 Kasım 2026. Amaç: Osmanlıca rik'a el yazısını okuyacak **çok küçük** bir model için mimari ve veri
kararlarına dayanak oluşturmak. Önce kısa cevap, sonra ayrıntılı tablolar.

## Kısa cevap: neden "OCR" olmuyor?

Rik'a el yazısı için klasik OCR motorlarının (Tesseract, EasyOCR, PaddleOCR, docTR) başarısız olmasının nedenleri:

1. **Bitişik yazı, karakter sınırı yok.** Harfler kelime içinde birleşir. Tesseract'ın eski motoru karakterleri kesip
   tek tek sınıflandırır; Arapça için harf kesme literatürde "çok hassas ve güvenilmez" diye geçer
   ([IAJIT 2012](https://ccis2k.org/iajit/index.php/archive/volume-9-2012/may-2012-no-3/item/2111-overview-of-some-algorithms-of-off-line-arabic-handwriting-segmentation),
   [Toufik](https://www.ccis2k.org/iajit/PDF/vol.4,no.4/1-Toufik.pdf)).
2. **Konuma bağlı 2–4 biçim ve dikey ligatürler.** Rik'ada harfler üst üste biner; tek bir dikey kesme çizgisiyle
   ayrılamaz. Sin/şin dişleri düz çizgiye iner, gövdeler taban çizgisinin altına kayar: "taban çizgisine sabit glif"
   varsayımı bozulur.
3. **Noktalar yer değiştirir ve birleşir.** İki nokta çizgi, üç nokta şapka olur ve gövdeden uzağa yazılır. KHATT
   üzerinde eğitilmiş bir CRNN'de genel CER %6,09 iken "nokta grubu CER'i" %8,24'tür
   ([FixFips kartı](https://huggingface.co/FixFips/arabicocr-khatt)).
4. **Eğitim verisi dağılımı.** Tesseract 4/5'in LSTM satır tanıyıcısı aslında bölütlemesizdir
   ([tessdoc](https://github.com/tesseract-ocr/tessdoc/blob/main/tess4/NeuralNetsInTesseract4.00.md)) ama `ara.traineddata`
   yazı tiplerinden üretilmiş **baskı** metinle eğitilmiştir; el yazısı resmen desteklenmez
   ([iText KB](https://kb.itextpdf.com/itext/pdfocr-is-handwriting-recognition-supported)). Qalam karşılaştırmasında
   Arapça el yazısında Tesseract'ın ortalama hatası %92,57, aynı tabloda CNN+BiLSTM+CTC %6,73
   ([Tablo 4](https://arxiv.org/html/2407.13559v1)).
5. **Sayfa düzeni ve sağdan sola.** PaddleOCR, docTR, EasyOCR kelime kutuları üretir ve RTL okuma sırasında hata yapar
   ([PaddleOCR #14971](https://github.com/PaddlePaddle/PaddleOCR/discussions/14971)); eğik, taşan el yazısı satırları için
   taban çizgisi (baseline) bölütleyici gerekir (Kraken `blla`).
6. **Bölütlemesiz CTC'nin üstünlüğü.** Kraken'ın dizi-dizi yaklaşımı Arap harfli baskıda ticari motorları geçer
   ([Kiessling vd. 2024](https://arxiv.org/abs/2402.10943)); Romanov vd. 2017 ~1.000 satırla "yüksek doksanlar" bildirir
   ([arXiv 1703.09550](https://arxiv.org/abs/1703.09550)).

**Sonuç:** Rik'a için doğru problem tanımı **satır düzeyinde HTR**'dir: satır görüntüsü → karakter dizisi, CTC kaybıyla,
karakter kesmeden. Bu depodaki model bu yüzden bir CRNN+CTC'dir ve kelime sınırlarını da boşluk sembolünün CTC
hizalamasından türetir.

## Küçük rik'a modeli için pratik çıkarımlar

- **Mimari:** 100–1.000 satırlık düşük kaynak rejiminde CRNN+CTC, Transformer'ı geçiyor
  ([Al-azzawi vd. 2026a](https://arxiv.org/abs/2605.02089), [2026b](https://arxiv.org/abs/2605.05900)). PaddleOCR'ın Arapça
  tanıyıcısı ~9,6 MB; FixFips CRNN modeli KHATT'ta %6 CER. Birkaç milyon parametre yeterli görünüyor.
- **VLM'ler veriyi ikame etmiyor:** 0,8 B parametreli Azra-1-Mini rik'ada karakter doğruluğu %67 (≈ CER %33)
  ([HF](https://huggingface.co/OttomanNLP/Azra-1-Mini-0.8b), [ön baskı](https://www.researchsquare.com/article/rs-10418926)).
- **Veri:** Tek açık rik'a ağırlıklı küme **Muharaf** (24.495 açık satır, CC BY-NC-SA, ticari kullanımda sorun). Osmanlıca
  rik'a için açık satır düzeyi küme **bulunamadı**. OpenITI'nin ~7.100 Osmanlıca satırı **baskıdır** ama ön eğitimde işe yarar.
- **Sentetik veri:** Mevcut Arapça üreticiler yazı tipi tabanlı; HATFormer/HAFITH "1 M sentetik + küçük gerçek" reçetesini izler.
- **Bölütleme:** Tanıma modelleri satır girdisi bekler; olgun açık kaynak taban çizgisi bölütleyici **Kraken `blla`**'dır.
  Bu depodaki izdüşüm tabanlı bölütleyici düzgün taranmış belgeler içindir; eScriptorium PAGE-XML çıktısı da içe aktarılır.
- **Transkribus** modelleri (Osmanlıca CER %11,6; Arapça el yazısı %15,4) ölçüt vermek için iyi ama kapalı ve çevrimdışı çalışmaz.

> **Yöntem notu:** Bulgular web araması ve sayfa okuma ile derlendi. zenodo.org, transkribus.org, kraken.re,
> digitalhumanities.org, researchsquare.com, archive.nyu.edu, tesseract-ocr.github.io sayfaları bu oturumun ağ
> kurallarından dolayı doğrudan okunamadı; onlara ait rakamlar arama özetlerinden alındı ve "(özetten)" diye işaretlendi.
> Doğrulanamayan alanlar "belirtilmemiş" bırakıldı.

## 1. Kraken / eScriptorium ve OpenITI modelleri

| Öğe | URL | Son etkinlik | Mimari | Eğitim verisi | CER/WER | Lisans | Satır bölütleme |
|---|---|---|---|---|---|---|---|
| **Kraken** motoru | [github](https://github.com/mittagessen/kraken) | 6.0: 29 Ağu 2025; 7.0 betaları ([newreleases](https://newreleases.io/project/github/mittagessen/kraken/release/6.0.0)) | VGSL ile CNN+(Bi)LSTM+CTC; bölütlemesiz ([Kiessling 2024](https://arxiv.org/abs/2402.10943)) | Modele bağlı | Modele bağlı | Apache-2.0 | **Evet**, `segment -bl` taban çizgisi; RTL destekli |
| **eScriptorium** | [gitlab](https://gitlab.com/scripta/escriptorium) | v0.14.0 (Eki 2023); 2024-25 ~63 commit/yıl ([openhub](https://www.openhub.net/p/escriptorium)) | Kraken'ı sarmalar | — | — | MIT (doğrulanmadı) | Evet |
| **OpenITI Printed Arabic-Script Base** | [zenodo 7050296](https://zenodo.org/records/7050296) | v1, Eyl 2022 (özetten) | Kraken 4.x | [arabic_print_data](https://github.com/OpenITI/arabic_print_data): ~23k Ar, ~17k Fa, ~11k Ur, **~7.100 Osmanlıca** basılı satır | belirtilmemiş | belirtilmemiş | Hayır |
| **OpenITI Printed Ottoman Base** | [zenodo 7050342](https://zenodo.org/records/7050342) | 2022 (özetten) | Arapça tabanın Osmanlıca ince ayarı | ~7.100 basılı Osmanlıca satır | belirtilmemiş | belirtilmemiş | Hayır |
| **OpenITI Printed Urdu Base** | [zenodo 14585602](https://zenodo.org/records/14585602) | v3, Oca 2025 | Kraken 4.x | ~11k Urduca satır | — | — | Hayır |
| Kraken al-Abhath vaka çalışması | [arXiv 2402.10943](https://arxiv.org/abs/2402.10943) | Şub 2024 | Kraken | Basılı Arapça dergi | özette yok | CC BY | — |

Değerlendirme: OpenITI'nin Zenodo modelleri **yalnızca baskı** içindir; rik'a için Kraken tabanlı hazır Osmanlıca model
bulunamadı. HTR-United kataloğunda ([htr-united.github.io](https://htr-united.github.io/)) Osmanlıca girdi doğrulanamadı.

## 2. Calamari, PyLaia, Transkribus

| Öğe | URL | Son etkinlik | Mimari | Eğitim verisi | CER | Lisans | Satır bölütleme |
|---|---|---|---|---|---|---|---|
| **Calamari** | [github](https://github.com/Calamari-OCR/calamari) · [modeller](https://github.com/Calamari-OCR/calamari_models) | Modeller 2.1 | CNN+LSTM+CTC (TensorFlow) | GT4HistOCR, Antiqua, Fraktur… | — | Motor GPL-3.0; modeller MIT | Hayır; **Arap harfli hazır model yok** |
| **PyLaia** (Teklia) | [arXiv 2404.18722](https://arxiv.org/html/2404.18722v1) · [HF](https://huggingface.co/Teklia) | ICDAR 2024; 12 açık model | CRNN+CTC (+ n-gram LM) | IAM, RIMES, HOME-Alcar; **Arapça resmi model yok** | — | MIT | Hayır |
| PyLaia topluluk: johnlockejrr/pylaia-ar-hand_v1 | [HF](https://huggingface.co/johnlockejrr/pylaia-ar-hand_v1) | belirtilmemiş | PyLaia CRNN+CTC | KHATT v1.0 | kartta yok | MIT | Hayır |
| **Transkribus "Ottoman-Turkish Generic"** | [transkribus](https://www.transkribus.org/models/ottoman-turkish-generic) | belirsiz (özetten) | Transkribus (PyLaia/HTR+?) | 789 sayfa, 25.480 satır, 201.096 kelime (özetten) | **%11,6** | Kapalı platform; model ücretsiz | Evet |
| Transkribus "Arabic Khat 17–20. yy handwritten" | [transkribus](https://www.transkribus.org/models/arabic-khat-17-20-century-handwritten) | — | PyLaia (özetten) | belirtilmemiş | **%15,4** | Kapalı | Evet |
| Transkribus Agapet13 (13. yy Hristiyan Arapçası) | [transkribus](https://www.transkribus.org/models/agapet-13th-century) · [zenodo 15005562](https://zenodo.org/records/15005562) | Oca 2025 | — | Tek müstensih | %7,48 | — | Evet |
| **HTROM** (Akcan, Viyana; Osmanlı el yazması → Latin transkripsiyon) | [DAS 2024 PDF](https://aperta.ulakbim.gov.tr/api/files/bf9df870-497c-4f8b-b592-972eeedd6f92/DAS-2024.pdf) | 2024 | Transkribus | Karışık el yazısı | **%28,32** (özetten) | — | Evet |

Değerlendirme: Transkribus en çok hazır modele sahip ama kapalı kaynak; çevrimdışı/PWA'ya gömülemez. Calamari ve
PyLaia'nın resmi Arapça modeli yok; ikisi de bölütleme yapmaz.

## 3. TrOCR tabanlı modeller, Qari-OCR, Qalam, Arabic-Nougat, 2025–2026 makaleleri

| Öğe | URL | Yıl | Mimari | Boyut | Eğitim verisi | CER/WER | Lisans | El yazısı? |
|---|---|---|---|---|---|---|---|---|
| **Qari-OCR** (NAMAA) | [arXiv 2506.02295](https://arxiv.org/abs/2506.02295) · [HF](https://huggingface.co/NAMAA-Space/Qari-OCR-0.1-VL-2B-Instruct) | Haz 2025 | VLM, Qwen2-VL-2B ince ayarı | ~2 B | Sentetik Arapça sayfalar | v0.2: CER 0,061 / WER 0,160 | apache-2.0 (Qwen koşullarına bağlı) | v0.1 kartı "el yazısı için eğitilmedi" |
| **Qalam** (UBC) | [arXiv 2407.13559](https://arxiv.org/html/2407.13559v1) · [ACL 2024](https://aclanthology.org/2024.arabicnlp-1.19.pdf) | Tem 2024 | SwinV2 + RoBERTa çözücü | belirtilmemiş | 4,5 M el yazması görüntüsüyle ön eğitim; MIDAD | HWR WER %0,80 (MIDAD); KHATT sıfır-atış 10,43; tarihî el yazması 30,88 | ağırlık yayını belirsiz | Evet |
| **Arabic-Nougat** | [arXiv 2411.17835](https://arxiv.org/abs/2411.17835) · [HF](https://huggingface.co/MohamedRashad/arabic-large-nougat) | Kas 2024 | Nougat (Swin+BART) → Markdown | small/base/large | 13,7k sentetik sayfa | göreli | GPL-3.0 | Hayır |
| **HATFormer** | [arXiv 2410.02179](https://arxiv.org/abs/2410.02179v2) | Nis 2025 | TrOCR uyarlaması + Arapça byte-level BPE | belirtilmemiş | ~1 M sentetik satır + Muharaf | **CER %8,6 Muharaf** | CC BY-NC-SA (makale); kod URL'si bulunamadı | Evet |
| **HAFITH** | [HF mdnaseif/hafith](https://huggingface.co/mdnaseif/hafith) | 2026 | SigLIP-2 (400 M) + RoBERTa-Large çözücü (242 M) | **642 M** | 1 M sentetik (350 yazı tipi) + 37k gerçek satır | Muharaf CER %8,35; KHATT %11,21; RASAM %4,95 | Apache-2.0 | Evet |
| **ArabicOCR-KHATT** (FixFips) | [HF](https://huggingface.co/FixFips/arabicocr-khatt) | — | **CRNN+CTC**, giriş yüksekliği 96, bigram LM | küçük | KHATT 11.375 satır | **CER %6,09 / WER %27,26** | MIT | Evet |
| TrOCR topluluk modelleri | [HF arama](https://huggingface.co/models?search=trocr%20arabic) | 2024–25 | TrOCR 0,3–0,5 B | 0,3–0,5 B | çoğu KHATT | bir proje sayfası CER %8,10 ([netlify](https://arabic-handwritten-textrecognition.netlify.app/)) | çeşitli | Evet |
| **Invizo** | [arXiv 2502.05277](https://arxiv.org/abs/2502.05277) | Şub 2025 | CNN + Transformer + metin algılama | — | belirtilmemiş | El yazısı CER %7,91 | kod yok | Evet |
| **Cross-Lingual Learning within Arabic Script** (Al-azzawi vd.) | [arXiv 2605.02089](https://arxiv.org/abs/2605.02089) · [2605.05900](https://arxiv.org/abs/2605.05900) | May–Haz 2026, ICDAR 2026 | CRNN ve HTR-VT; 100/500/1000 satırlık düşük kaynak | — | KHATT + NUST-UHWR + PHTD | PHTD CER 9,99; UNHD 17,20→14,45 | kod belirtilmemiş | Evet |
| **Azra 1-Mini** (OttomanNLP) | [HF](https://huggingface.co/OttomanNLP/Azra-1-Mini-0.8b) · [ön baskı](https://www.researchsquare.com/article/rs-10418926) | 2026 | VLM, Qwen3.5-Vision tabanlı | **0,8–0,9 B** | Hokkabaz aracıyla işaretlenmiş rik'a; 1.418 eğitim satırı (özetten) | **Rik'a karakter doğruluğu %67,08**, Nesih %80,23 | Apache-2.0 | Evet, satır girdisi |
| Diğer 2025 Arapça VLM'ler | [Baseer](https://arxiv.org/abs/2509.18174v1) · [AtlasOCR](https://arxiv.org/pdf/2604.08070) · [KITAB-Bench](https://arxiv.org/abs/2502.14949) | 2025–26 | VLM | büyük | baskı/belge | KITAB-Bench: VLM'ler klasik OCR'den CER'de ort. %60 iyi | — | tam sayfa |

## 4. Genel OCR motorları: Arapça var mı, el yazısı yapar mı?

| Motor | URL | Arapça | El yazısı | Not |
|---|---|---|---|---|
| **Tesseract** | [github](https://github.com/tesseract-ocr/tesseract) · [LSTM belgesi](https://github.com/tesseract-ocr/tessdoc/blob/main/tess4/NeuralNetsInTesseract4.00.md) | `ara`, `fas`, `urd`; **`ota` resmi tessdata'da yok** ([forum 2017](https://groups.google.com/g/tesseract-ocr/c/lEPI3bKev5g)) | Resmen desteklenmez ([iText KB](https://kb.itextpdf.com/itext/pdfocr-is-handwriting-recognition-supported)); tesstrain wiki'de deneme var | Arapça el yazısında hata %92,57 ([Qalam Tablo 4](https://arxiv.org/html/2407.13559v1)) |
| **PaddleOCR** | [model listesi](https://www.paddleocr.ai/v2.9/en/ppocr/model_list.html) | `arabic_PP-OCRv3_rec` (~9,6 MB) | Baskı odaklı; bir forum testinde el yazısı CER 0,535 ([HF forum](https://discuss.huggingface.co/t/arabic-handwritten-vlm/180583)) | RTL sırası sorunu ([#14971](https://github.com/PaddlePaddle/PaddleOCR/discussions/14971)) |
| **EasyOCR** | [github](https://github.com/JaidedAI/EasyOCR) | `ar`, `fa`, `ur` | Baskı odaklı | CRAFT + CRNN+CTC |
| **docTR** | [issue #490](https://github.com/mindee/doctr/issues/490) · [HF parseq-arabic](https://huggingface.co/madskills/doctr-parseq-arabic) | sözlük var, resmi ağırlık yok | Baskı | Kelime kutuları; el yazısı satırları için uygun değil |
| **Surya** | [pypi](https://pypi.org/project/surya-ocr/0.5.0) | 90+ dil | "Baskı için; el yazısında bazen" | Transformer satır tanıyıcı; GPL/ticari |
| **MMOCR** | [github](https://github.com/open-mmlab/mmocr) | Arapça model bulunamadı | — | Araştırma çerçevesi |

## 5. Veri kümeleri

| Küme | URL | Yıl | İçerik | Yazı | Lisans | Format |
|---|---|---|---|---|---|---|
| **KHATT** | [LDC](https://catalog.ldc.upenn.edu/LDC2015T23) · [HF aynası](https://huggingface.co/datasets/benhachem/KHATT) · [makale](https://faculty.kfupm.edu.sa/ics/alshayeb/publications/J20-KFUPM-KHATT.pdf) | 2012 | 1.000 yazar; ~11k satır | Modern Arapça serbest el | LDC anlaşması | Satır görüntüleri |
| **IFN/ENIT** | [ifnenit.com](http://www.ifnenit.com) | 2002 | ~26.5k Tunus yer adı, 411 yazar | Kelime | Araştırma için ücretsiz | Kelime görüntüleri |
| **Muharaf** | [arXiv 2406.09630](https://arxiv.org/html/2406.09630v2) · [zenodo](https://zenodo.org/records/11492215) · [github](https://github.com/MehreenMehreen/muharaf) · [HF](https://huggingface.co/datasets/aamijar/muharaf-public) | 2024 (NeurIPS) | 1.644 sayfa, 36.311 satır; **açık kısım 1.216 sayfa / 24.495 satır**; **çoğunluk ruk'a** | 19.–21. yy mektup, resmî yazışma | **CC BY-NC-SA 4.0** | PAGE-XML + JSON; satır PNG 60 px |
| **RASM 2018/2019** | [primaresearch](https://www.primaresearch.org/RASM2019/) · [BL](https://bl.iro.bl.uk/collection/ffab19f8-e9b7-485c-a7c3-64aba143be9c) | 2018–19 | 20 eğitim + 100 test sayfası; 2.164 satır | Nesih el yazması | Kamu malı | PAGE-XML |
| **RASAM / RASAM 2** | [HAL](https://halshs.archives-ouvertes.fr/halshs-03430697/) · [CHR 2024](https://ceur-ws.org/Vol-3834/paper35.pdf) · [HF](https://huggingface.co/datasets/johnlockejrr/RASAM) | 2021 / 2024 | 300 + 250 sayfa | Mağribî | Apache-2.0 | PAGE-XML |
| **OpenITI arabic_print_data** | [github](https://github.com/OpenITI/arabic_print_data) | 2022 | ~23k Ar + 17k Fa + 11k Ur + **7,1k Osmanlıca** | **Baskı** | belirtilmemiş | Satır |
| **OpenITI MAKHZAN** | [zenodo 16410106](https://zenodo.org/records/16410106) · [JOHD](https://doi.org/10.5334/johd.465) | Nis 2026 | ~1.500 sayfa, 208 belge; Ar/Fa/Osm/Ur, baskı **ve** el yazısı | Karışık | belirtilmemiş | ALTO/PAGE (doğrulanmadı) |
| Osmanlıca rik'a kümeleri | [Azra/Hokkabaz](https://www.researchsquare.com/article/rs-10418926) · [OttomanNLP](https://huggingface.co/spaces/OttomanNLP/README) · [Roboflow ottoman-ocr](https://universe.roboflow.com/ottoman-ocr/ottoman-ocr) | 2026 | Hokkabaz ile işaretlenmiş rik'a; **yayımlandığı belirtilmemiş**. Osmanlıca.com'a ait açık veri bulunamadı. Bucolin (OTC, HisTR) yalnızca metin ([arXiv 2501.04828](https://arxiv.org/abs/2501.04828)) | Rik'a | — | — |
| **Churro-DS** | [github](https://github.com/stanford-oval/Churro) | 2025 | 150+ tarihî kümenin birleşimi, Türkçe dahil | Karışık | — | — |
| Sentetik üreticiler | [OCRSmith](https://github.com/atlasia-ma/OCRSmith) · [TRDG Ar/Fa çatalı](https://github.com/amirmgh1375/TextRecognitionDataGenerator) · [SynthDoG-RTL](https://dev.to/aiviewz_team/generating-synthetic-rtl-ocr-data-for-donut-with-synthdog-rtl-3ghi) · [SARD](https://arxiv.org/abs/2505.24600) · [arabic-ocr-printed-500k](https://huggingface.co/datasets/medyas/arabic-ocr-printed-500k) | 2024–26 | Tümü yazı tipi tabanlı; el yazısı GAN/difüzyonu için güncel Arapça repo yok ([PeerJ 2022](https://peerj.com/articles/cs-861) en yakını) | — | — | Satır/sayfa |

Doğrulanamayanlar: Zenodo/Transkribus/kraken.re sayfa içerikleri, OpenITI modellerinin CER ve lisansları, MAKHZAN
lisans/format, HATFormer kod deposu, Qalam ağırlıkları, Azra eğitim verisinin erişilebilirliği, Tesseract `ara` eğitim verisi.
