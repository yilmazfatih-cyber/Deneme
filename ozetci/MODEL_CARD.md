---
language: [tr, en]
license: apache-2.0
base_model: Qwen/Qwen3-0.6B
tags: [summarization, email, pdf, ocr, turkish, sub-1b]
---

# ozetci-qwen3-0.6b (ŞABLON — eğitimden sonra doldurun)

**Amaç:** PDF, e-posta ve taranmış belgeleri Türkçe/İngilizce özetlemek. Başka iş için eğitilmemiştir.

**Taban:** Qwen/Qwen3-0.6B (Apache-2.0), LoRA r=__ alpha=__, __ epoch, lr __, max_length __.
**Eğitim verisi:** __ sentetik TR e-posta/belge (öğretmen: __), __ açık küme (lisanslar: README tablosu).
**OCR ön ucu:** PP-OCRv5 latin (RapidOCR) — model ağırlığına dahil değildir; toplam sistem ≈ 615 M parametre.

## Sonuçlar (kendi değerlendirme kümeniz)

| Küme | ROUGE-L | Biçim uyumu | Uydurma rakam oranı |
| --- | --- | --- | --- |
| eval.jsonl (n=__) | __ | __ | __ |
| taranmış TR PDF (n=__) | __ | __ | __ |

## Sınırlar

- Metinde olmayan bilgi üretebilir; rakam/tarih uyarısı vardır ama insan denetimi gerekir.
- Hukuki/tıbbi/mali karar için kullanılmaz.
- Çok sütunlu PDF ve el yazısında kalite düşer.

## Kullanım

```python
from ozetci import Ozetci
print(Ozetci().summarize("belge.pdf").render())
```
