"""RapidOCR (PP-OCR modelleri, ONNX Runtime): ~15 MB, CPU'da saniyenin altında, kurulumu kolay.

Türkçe için PP-OCRv5 **latin** tanıma modeli kullanılır (PaddleOCR dil listesinde ``tr`` bu ailededir).
Modeller ilk kullanımda indirilir (``rapidocr`` paketi, ModelScope/GitHub); sonra çevrimdışı çalışır.

İki paket desteklenir:
  * ``rapidocr`` (v3+, önerilen): ``lang`` ile ``latin`` / ``en`` / ``ch`` seçilebilir.
  * ``rapidocr_onnxruntime`` (eski, modeller pakette gömülü, yalnızca Çince+İngilizce):
    ``ş ğ ı İ`` harflerini İngilizce karşılıklarına indirger (``Teşekkürler -> Tesekkurler``).
    İnternetsiz hızlı deneme için yeterlidir; Türkçe üretim için ``rapidocr`` kurun.

Granite-Docling gibi belge modellerine göre okuma sırasını ve tabloları daha kaba korur;
düşük kaynaklı makineler ve hızlı taramalar için iyi bir seçimdir.
"""

from __future__ import annotations

import logging

from ..textutil import clean_text

log = logging.getLogger("ozetci.ocr")


def _warmup_image():
    """Tanıma modelinin yüklenmesini tetikleyecek kadar büyük bir metin görüntüsü."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (320, 80), "white")
    try:
        font = ImageFont.load_default(size=40)
    except TypeError:  # eski Pillow
        font = ImageFont.load_default()
    ImageDraw.Draw(img).text((10, 15), "OCR 123", fill="black", font=font)
    return np.array(img)


class RapidOCREngine:
    name = "rapidocr"

    def __init__(self, lang: str = "latin", version: str = "PP-OCRv5", model_type: str = "mobile", line_gap_ratio: float = 0.6, **kwargs) -> None:
        self.lang = lang
        self.line_gap_ratio = line_gap_ratio
        self._legacy = False
        try:
            from rapidocr import EngineType, LangRec, ModelType, OCRVersion, RapidOCR

            lang_enum = {"latin": LangRec.LATIN, "en": LangRec.EN, "ch": LangRec.CH, "cyrillic": LangRec.CYRILLIC, "arabic": LangRec.ARABIC}.get(lang.lower(), LangRec.LATIN)
            ver_enum = {"pp-ocrv4": OCRVersion.PPOCRV4, "pp-ocrv5": OCRVersion.PPOCRV5, "pp-ocrv6": OCRVersion.PPOCRV6}.get(version.lower(), OCRVersion.PPOCRV5)
            type_enum = {"mobile": ModelType.MOBILE, "server": ModelType.SERVER, "small": ModelType.SMALL, "medium": ModelType.MEDIUM, "tiny": ModelType.TINY}.get(model_type.lower(), ModelType.MOBILE)
            params = {
                "Rec.engine_type": EngineType.ONNXRUNTIME,
                "Rec.lang_type": lang_enum,
                "Rec.ocr_version": ver_enum,
                "Rec.model_type": type_enum,
                "Global.log_level": "warning",
            }
            params.update(kwargs)
            self.engine = RapidOCR(params=params)
            # modeller ilk kullanımda indirilir: burada tetikle ki ağ yoksa eski pakete düşülebilsin
            loader = getattr(self.engine, "_load_rec_model", None)
            if callable(loader):
                loader()
            else:  # pragma: no cover - sürüm farkı
                self.engine(_warmup_image())
            self.name = f"rapidocr:{version}-{lang}"
            return
        except ImportError:
            pass
        except Exception as exc:  # model indirilemedi vb.
            log.warning("rapidocr (v3) kurulamadı: %s — rapidocr_onnxruntime deneniyor", exc)
        from rapidocr_onnxruntime import RapidOCR as LegacyRapidOCR  # gömülü ch+en modelleri

        self.engine = LegacyRapidOCR(**kwargs)
        self._legacy = True
        self.name = "rapidocr:legacy-ch_en"
        if lang.lower() == "latin":
            log.warning("rapidocr_onnxruntime Türkçe harfleri (ş ğ ı İ) tanımaz; Türkçe için 'pip install rapidocr' kurun")

    def image_to_text(self, image) -> str:
        import numpy as np

        arr = np.array(image.convert("RGB"))
        items = self._run(arr)
        if not items:
            return ""
        return clean_text(self._lines_from_boxes(items))

    def _run(self, arr) -> list[tuple]:
        """Her iki paket için ortak çıktı: (box, text, score) listesi."""
        if self._legacy:
            result, _elapse = self.engine(arr)
            return [(box, text, score) for box, text, score in (result or [])]
        out = self.engine(arr)
        if out is None or out.txts is None or out.boxes is None:
            return []
        scores = out.scores or [1.0] * len(out.txts)
        return [(box.tolist() if hasattr(box, "tolist") else box, text, score) for box, text, score in zip(out.boxes, out.txts, scores)]

    def _lines_from_boxes(self, result) -> str:
        """Kutuları okuma sırasına koyar: üstten alta, aynı satırdakileri soldan sağa birleştirir."""
        items = []
        for box, text, _score in result:
            ys = [p[1] for p in box]
            xs = [p[0] for p in box]
            items.append((min(ys), max(ys), min(xs), text))
        items.sort(key=lambda t: (t[0], t[2]))
        lines: list[list[tuple]] = []
        for top, bottom, left, text in items:
            h = max(bottom - top, 1)
            if lines and abs(lines[-1][0][0] - top) < h * self.line_gap_ratio:
                lines[-1].append((top, bottom, left, text))
            else:
                lines.append([(top, bottom, left, text)])
        out = []
        for line in lines:
            line.sort(key=lambda t: t[2])
            out.append(" ".join(t[3] for t in line))
        return "\n".join(out)
