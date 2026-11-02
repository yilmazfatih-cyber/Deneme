# ozetci — 1B altı açık modellerle PDF, e-posta ve görüntü özetleyici

`ozetci`, **toplam 1 milyar parametrenin altında** iki açık modelle çalışan, internetsiz (ilk model
indirmesinden sonra) ve CPU'da çalışan küçük bir Türkçe/İngilizce özetleyicidir. Tek işi var:
**PDF, e-posta (.eml/.mbox) ve taranmış görüntüleri okuyup kısa, yapılı bir özet çıkarmak.**

```
dosya ──► okuma (PDF metin katmanı / e-posta ayrıştırma)
             │ metin katmanı yoksa
             ▼
        OCR  (PP-OCRv5 latin ≈ 15 M  |  seçenek: Granite-Docling-258M, PaddleOCR-VL-1.5)
             │
             ▼
        özetleme (Qwen3-0.6B ≈ 600 M, düşünme kapalı; uzun belgede böl-özetle-birleştir)
             │
             ▼
        ÖZET / MADDELER / EYLEMLER  (+ doğrulanamayan rakam uyarısı)
```

## Parametre bütçesi

| Rol | Varsayılan model | Parametre | Lisans | Türkçe | Not |
| --- | --- | --- | --- | --- | --- |
| OCR | PP-OCRv5 latin (RapidOCR, ONNX) | ≈ 15 M | Apache-2.0 | listede (`tr`) | sezim + tanıma; ~15 MB, CPU'da < 1 sn/sayfa |
| Özet | `Qwen/Qwen3-0.6B` | ≈ 600 M (gömme dahil ≈ 596 M) | Apache-2.0 | 119 dil listesinde | 32K bağlam; GGUF Q8_0 ≈ 805 MB |
| **Toplam** | | **≈ 615 M < 1 000 M** | | | |

Seçenekler (hepsi tek başına 1B altı):

| OCR seçeneği | Parametre | Lisans | Türkçe | Ne zaman |
| --- | --- | --- | --- | --- |
| `ibm-granite/granite-docling-258M` | 258 M | Apache-2.0 | kanıt yok (İngilizce; ja/ar/zh deneysel) | tablo ve okuma sırası önemliyse, İngilizce belgeler |
| `ds4sd/SmolDocling-256M-preview` | 256 M | Apache-2.0 / CDLA-P-2.0 (kart tutarsız) | kanıt yok | Granite-Docling'in öncülü |
| `PaddlePaddle/PaddleOCR-VL-1.5` | ≈ 959 M | Apache-2.0 | listede | en iyi düzen + Türkçe; ama LLM ile toplam 1B'yi aşar |
| `tesseract` (`tur+eng`) | — | Apache-2.0 | var | sistemde tesseract varsa hızlı yedek |

| LLM seçeneği | Parametre | Lisans | Türkçe | Ne zaman |
| --- | --- | --- | --- | --- |
| `Qwen/Qwen3.5-0.8B` | ≈ 900 M (görsel kodlayıcı dahil) | Apache-2.0 | 201 dil iddiası, açık liste yok | daha iyi kalite istenirse; yeni mimari, araç desteği daha genç |
| `Qwen/Qwen2.5-0.5B-Instruct` | 494 M | Apache-2.0 | listede | daha az bellek |
| `google/gemma-3-270m-it` | 268 M | Gemma Terms | belirsiz | ince ayar tabanı olarak çok ucuz; Türkçe'de daha verimli tokenizer |
| `HuggingFaceTB/SmolLM2-360M-Instruct` | 362 M | Apache-2.0 | yalnızca İngilizce | İngilizce-only kullanım |

Rakamlar üretici bildirimleridir; `huggingface.co` bu geliştirme ortamından erişilemediği için
safetensors üzerinden birebir sayılmadı. `ozetci bilgi` komutu seçili bileşenlerin bütçesini yazar.
Adayların tamamı, doğrulama sonuçları ve kaynaklarla birlikte `docs/MODEL_SECIMI.md` dosyasındadır.

## Kurulum

```bash
cd ozetci
python -m venv .venv && source .venv/bin/activate
pip install -e ".[hf,rapid]"          # transformers + Qwen3 için torch, RapidOCR
# CPU'da en hızlı yol: GGUF
pip install -e ".[gguf,rapid]"
huggingface-cli download Qwen/Qwen3-0.6B-GGUF Qwen3-0.6B-Q8_0.gguf --local-dir models
```

Model ağırlıkları ilk çalıştırmada indirilir (Qwen3-0.6B ≈ 1,5 GB fp16 / 805 MB Q8_0; PP-OCRv5
latin modelleri ≈ 15 MB). Sonrasında internet gerekmez.

## Kullanım

```bash
ozetci ozetle fatura.pdf                      # PDF (metin katmanı yoksa OCR)
ozetci ozetle gelen.eml --json                # e-posta + PDF/görüntü ekleri
ozetci ozetle kutu.mbox                       # birden çok ileti
ozetci ozetle taranmis.png --dil tr           # görüntü -> OCR -> özet
ozetci --model models/Qwen3-0.6B-Q8_0.gguf ozetle rapor.pdf     # GGUF arka ucu
ozetci --ocr ibm-granite/granite-docling-258M oku tablo.pdf     # yalnızca metin çıkar
ozetci bilgi                                  # ayarlar, kurulu arka uçlar, parametre bütçesi
```

Python:

```python
from ozetci import Ozetci
oz = Ozetci()                      # ayarlar: OZETCI_LLM, OZETCI_OCR, OZETCI_BACKEND ...
ozet = oz.summarize("gelen.eml")
print(ozet.render())               # ÖZET / MADDELER / EYLEMLER
print(ozet.to_dict())              # sözlük (JSON'a uygun)
```

Çıktı biçimi sabittir ve ayrıştırıcı toleranslıdır: model başlıkları atlarsa ham yanıt `ozet`
alanına yazılır ve `notlar`da belirtilir. Özetteki **metinde geçmeyen rakamlar** `notlar`a
"doğrulayın" uyarısıyla eklenir; 1B altı modellerde en sık hata budur.

Ortam değişkenleri: `OZETCI_LLM` (HF kimliği ya da `.gguf` yolu), `OZETCI_OCR` (`rapid`, `rapid:en`,
HF Docling kimliği, `tesseract`, `none`), `OZETCI_BACKEND` (`auto|hf|gguf|extractive`), `OZETCI_THREADS`,
`OZETCI_DEVICE` (`auto|cpu|cuda|mps`), `OZETCI_MAX_CHARS` (parçalama eşiği, varsayılan 6000 karakter ≈ 2000 belirteç),
`OZETCI_OCR_MAX_NEW_TOKENS` (Docling VLM sayfa başına üst sınır).

Model ağırlığı yoksa `extractive` yedek çalışır: en bilgilendirici cümleleri seçer, hiçbir şey
üretmez. Testler bu yedekle ve rastgele ağırlıklı minik bir Qwen3 ile internetsiz koşar.

## Nasıl çalışır

- **PDF** (`ozetci/extract/pdf.py`): `pypdfium2` ile sayfa metni; sayfa başına < 40 harf, düşük harf
  oranı ya da `(cid:…)` kalıntısı varsa sayfa "taranmış" sayılır, 170 DPI görüntüye çevrilip OCR'a verilir.
  Karar belge değil sayfa başınadır (karışık belgeler yaygındır).
- **E-posta** (`ozetci/extract/email.py`): yalnızca standart kütüphane. Başlıklar (Kimden/Kime/Konu/Tarih)
  metnin başına eklenir; HTML gövde düz metne çevrilir (`blockquote`, Gmail/Outlook alıntı kapsayıcıları atlanır);
  `>` alıntıları, "… yazdı:" / "Original Message" blokları ve imza kesilir; yanlış etiketlenmiş
  `iso-8859-1` Türkçe postalar `cp1254` ile yeniden çözülür. PDF ve görüntü ekleri metne çevrilip özete katılır.
- **Türkçe harf** (`ozetci/textutil.py`): `İ/ı` eşlemesi doğru yapılır (`str.upper()` kullanılmaz), NFC,
  bitişik harf (`ﬁ`) ve satır sonu tire düzeltmesi; kısa satırlar (form alanı, tablo) birleştirilmez.
- **Parçalama** (`ozetci/chunking.py`): paragraf → cümle → sert sınır; parçalar arasında örtüşme.
  Uzun belgede her parça düz paragraf olarak özetlenir, sonra tek yapılı özete birleştirilir (en çok 2 seviye).
- **İstemler** (`ozetci/summarize/prompts.py`): küçük model için kısa, kesin, "yalnızca metindeki bilgi"
  kuralı; biçim şablonu ayrıştırıcıyla birebir aynı. Qwen3 düşünme modu kapalı (`enable_thinking=False`,
  GGUF'ta `/no_think`), üretim açgözlü (`do_sample=False`, `repetition_penalty=1.05`).

## İnce ayar (modeli özetlemeye özelleştirme)

Taban Qwen3-0.6B özet yazabilir ama biçimi ve Türkçe e-posta üslubunu öğrenmesi için LoRA ince ayarı
önerilir. Ücretsiz Colab/Kaggle T4 yeterlidir (0.6B + LoRA r=16, fp16).

```bash
pip install -e ".[train]"
# 1) Açık kümelerden eğitim verisi (lisans tablosuna bakın)
python train/build_dataset.py --out data --max-per-source 20000            # araştırma
python train/build_dataset.py --out data --commercial --synth data/synth.jsonl   # ticari: yalnızca izinli + sentetik
# 2) (önerilir) Öğretmen modelle sentetik Türkçe e-posta/belge özetleri
python train/make_synth.py --inputs "dokumanlar/*.txt" --base-url http://localhost:8000/v1 --model Qwen/Qwen3-8B
# 3) LoRA SFT (TRL, loss yalnızca yanıt belirteçlerinde; Qwen3 için boş <think> öneki)
python train/sft_lora.py --data data --out runs/qwen3-0.6b-ozet --epochs 2
# 4) Birleştir, GGUF'a çevir, nicemle (Q8_0 önerilir; 1B altı modellerde Q4 kaybı büyüktür)
python train/merge_export.py --adapter runs/qwen3-0.6b-ozet --out models/ozetci-qwen3-0.6b --gguf --llama-cpp ~/llama.cpp
# 5) Değerlendir: ROUGE-L, biçim uyumu, uydurma rakam oranı
python train/eval.py --data data/eval.jsonl --model models/ozetci-qwen3-0.6b --limit 200
```

Eğitim istemi çalışma zamanındaki istemle **birebir aynıdır** (`train/common.py` → `ozetci/summarize/prompts.py`),
böylece model tam olarak uygulamanın gönderdiği girdiyi görür. İki hedef türü vardır:

- **Açık kümeler** (haber/rapor özetleri) yalnızca *düz özet* öğretir: çalışma zamanındaki "bölüm özeti"
  istemiyle eşlenir. Bu kümelerde eylem bilgisi olmadığından biçimli hedef üretmek modele her zaman
  "EYLEMLER: Yok" yazmayı öğretirdi.
- **Sentetik veri** (`make_synth.py`) ÖZET / MADDELER / EYLEMLER biçimini ve Türkçe e-posta üslubunu öğretir.

`train/synth_noise.py` yalnızca eğitim kümesindeki metinlerin bir kısmına OCR tarzı gürültü ekler
(ı/i, ş/s, satır kırığı, tire); rakamlar ve tarihler bozulmaz, değerlendirme kümesi temiz kalır.
Qwen3 için hedeflerin başına boş `<think></think>` bloğu konur; GGUF arka ucu sohbet şablonunu kendisi
işleyip aynı istemi üretir (HF ve GGUF yolları birebir aynı girdiyi verir).

### Veri kümeleri ve lisanslar

| Küme | HF kimliği | Dil / tür | Lisans | Ticari |
| --- | --- | --- | --- | --- |
| XL-Sum (tr) | `csebuetnlp/xlsum` (`turkish`) | TR haber | CC BY-NC-SA 4.0 | hayır |
| WikiLingua (tr) | `GEM/wiki_lingua` (`tr`) | TR nasıl-yapılır | CC BY-NC-SA | hayır |
| MLSUM (tu) | `reciTAL/mlsum` (`tu`) | TR haber | araştırma | hayır |
| XL-Sum (en) | `csebuetnlp/xlsum` (`english`) | EN haber | CC BY-NC-SA 4.0 | hayır |
| GovReport | `ccdv/govreport-summarization` | EN uzun rapor | CC BY 4.0 (kaynak) | evet |
| BillSum | `FiscalNote/billsum` | EN yasa metni | CC0 | evet |
| AESLC (isteğe bağlı, `--only`) | `Yale-LILY/aeslc` | EN e-posta → konu satırı (çok kısa) | Enron türevi, kart belirsiz | dikkat |
| Dolly-15k (tr çeviri) | `atasoglu/databricks-dolly-15k-tr` | TR talimat | CC BY-SA 3.0 | evet (paylaş-aynı) |

**Açık bir Türkçe e-posta özetleme kümesi yoktur.** Bu yüzden ürün kalitesi için asıl veri, kendi
belgeleriniz/e-postalarınızdan (yalnızca kendi makinenizde çalışan bir öğretmenle) üretilen sentetik
özetlerdir; önerilen hacim 60-120 bin Türkçe örnek, 2-3 bin elle denetlenmiş değerlendirme örneği.

## Sınırlar (dürüst liste)

- 1B altı bir model **uydurabilir**; rakam/tarih denetimi notu vardır ama her çıktı okunmalıdır.
  Hukuki, tıbbi, mali kararlar için insan onayı şarttır.
- PP-OCR latin modeli Türkçe harfleri tanır ama el yazısı ve kötü taramalarda `ı/i`, `ş/s` karışır;
  Granite-Docling'in Türkçe kanıtı yoktur. Taranmış Türkçe belgelerde OCRTurk benzeri bir örneklemle
  kendi ölçümünüzü yapın.
- Çok sütunlu PDF ve karmaşık tablolarda okuma sırası bozulabilir (pypdfium2 sınırı).
- Bu geliştirme ortamında `huggingface.co` ağ politikasıyla kapalıydı: gerçek ağırlıklarla uçtan uca
  koşu **yapılamadı**. Kod yolları rastgele ağırlıklı minik bir Qwen3 ile (transformers, TRL LoRA, birleştirme)
  ve RapidOCR'ın gömülü modeliyle doğrulandı; GGUF arka ucunda yalnızca şablon işleme birim testle denendi,
  gerçek bir GGUF dosyasıyla üretim bu ortamda çalıştırılamadı.
- Terapi/karar aracı değildir; yalnızca okuma ve özetleme desteğidir.

## Testler

```bash
pip install -e ".[dev]"
pytest -q            # ~60 test: PDF/e-posta ayrıştırma, parçalama, ayrıştırıcı, boru hattı, CLI, minik Qwen3 üretimi, eğitim yardımcıları
pytest -q -m "not slow"
```

## Dizin yapısı

```
ozetci/
  ozetci/            paket
    extract/         pdf.py, email.py, image.py, router.py, base.py (Document)
    ocr/             rapid.py (PP-OCR), docling_vlm.py (Granite/SmolDocling), tesseract.py
    summarize/       prompts.py, llm.py (map-reduce), output_parse.py, extractive.py, hf_backend.py, gguf_backend.py
    pipeline.py      Ozetci sınıfı      cli.py  komut satırı      config.py  ayarlar ve bütçe
  train/             build_dataset.py, make_synth.py, synth_noise.py, sft_lora.py, merge_export.py, eval.py
  tests/             internetsiz testler (sentetik PDF/eml/görüntü üreticileri conftest.py'de)
  docs/MODEL_SECIMI.md  araştırılan 20+ aday model, doğrulama sonuçları, veri kümeleri ve kaynaklar
  MODEL_CARD.md      ince ayarlı modeli yayımlarken doldurulacak kart
```
