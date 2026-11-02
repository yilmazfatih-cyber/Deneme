"""Komut satırı: ``ozetci ozetle dosya.pdf``, ``ozetci oku mail.eml``, ``ozetci bilgi``.

Her dosya ayrı ayrı işlenir: biri okunamazsa Türkçe bir hata satırı yazılır, kalanlar sürer,
çıkış kodu 1 olur. Python izleri yalnızca ``-v`` ile gösterilir. ``--json`` çıktısı her zaman listedir.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import traceback

from .config import DOCLING_OCR, Settings
from .pipeline import Ozetci


def _settings_from_args(args) -> Settings:
    s = Settings()
    if args.model:
        s.llm = args.model
    if args.ocr:
        s.ocr = args.ocr
    if args.backend:
        s.backend = args.backend
    if args.threads:
        s.threads = args.threads
    if getattr(args, "parola", None):
        s.pdf_password = args.parola
    return s


def _hata_mesaji(path: str, exc: Exception) -> str:
    if isinstance(exc, FileNotFoundError) or not os.path.exists(path):
        return f"Dosya bulunamadı: {path}"
    if isinstance(exc, ValueError):  # "Desteklenmeyen dosya türü: ...", "PDF parola korumalı ..."
        return str(exc)
    return f"Okunamadı: {path} ({exc})"


def _hata_yaz(args, path: str, exc: Exception) -> str:
    msg = _hata_mesaji(path, exc)
    print(msg, file=sys.stderr)
    if args.verbose:
        traceback.print_exc()
    return msg


def cmd_ozetle(args) -> int:
    try:
        oz = Ozetci(_settings_from_args(args))
        oz.summarizer  # arka uç/model uyumsuzluğu dosyalara dokunmadan görünsün
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    results, hatali = [], 0
    for path in args.paths:
        try:
            summary = oz.summarize(path, language=args.dil)
        except Exception as exc:  # noqa: BLE001 - tek dosya tüm işi durdurmasın
            hatali += 1
            results.append({"dosya": path, "hata": _hata_yaz(args, path, exc)})
            continue
        results.append({"dosya": path, **summary.to_dict()})
        if not args.json:
            print(f"=== {path} ===")
            print(summary.render())
            if summary.notes:
                print("\n(" + "; ".join(summary.notes) + ")")
            print()
    if args.json:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 1 if hatali else 0


def cmd_oku(args) -> int:
    oz = Ozetci(_settings_from_args(args))
    results, hatali = [], 0
    for path in args.paths:
        try:
            doc = oz.read(path, use_ocr=not args.ocr_kapali)
        except Exception as exc:  # noqa: BLE001
            hatali += 1
            results.append({"dosya": path, "hata": _hata_yaz(args, path, exc)})
            continue
        results.append({"dosya": path, "tur": doc.kind, "baslik": doc.title, "metin": doc.full_text(), "meta": _jsonable(doc.metadata)})
        if not args.json:
            print(f"=== {path} ({doc.kind}) ===")
            print(doc.full_text())
            print()
    if args.json:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 1 if hatali else 0


_PACKAGES = (
    ("torch", "transformers arka ucu (hf)"),
    ("transformers", "Qwen3 / Docling modelleri"),
    ("llama_cpp", "GGUF arka ucu"),
    ("jinja2", "GGUF sohbet şablonu"),
    ("rapidocr", "varsayılan OCR (PP-OCRv5 latin)"),
    ("rapidocr_onnxruntime", "OCR yedeği (gömülü modeller)"),
    ("docling_core", "DocTags -> Markdown"),
    ("pytesseract", "tesseract OCR"),
    ("pypdfium2", "PDF okuma"),
)


def cmd_bilgi(args) -> int:
    s = _settings_from_args(args)
    budget = s.param_budget()

    def fmt(v):
        return "?" if v is None else v

    print("Ayarlar:")
    for k, v in vars(s).items():
        if k == "pdf_password":
            v = "(verildi)" if v else None
        print(f"  {k:18} {v}")
    print(f"  {'cihaz (çözülen)':18} {s.resolve_device()}")
    print("Parametre bütçesi (milyon):")
    print(f"  LLM  {fmt(budget['llm_M'])}")
    print(f"  OCR  {fmt(budget['ocr_M'])}")
    if budget["llm_M"] is not None and budget["ocr_M"] is not None:
        total = budget["llm_M"] + budget["ocr_M"]
        print(f"  Toplam {total}  ({'1B altı' if total < 1000 else '1B ÜSTÜ!'})")
    print("Kurulu paketler:")
    installed = set()
    for mod, why in _PACKAGES:
        try:
            __import__(mod)
            installed.add(mod)
            print(f"  [+] {mod:22} {why}")
        except Exception:
            print(f"  [-] {mod:22} {why}")
    ocr = s.ocr.lower()
    if ocr.startswith("rapid") and not ({"rapidocr", "rapidocr_onnxruntime"} & installed):
        print("  [!] Seçili OCR 'rapid' için 'pip install rapidocr' gerekir")
    if ocr == "tesseract" and "pytesseract" not in installed:
        print("  [!] Seçili OCR 'tesseract' için 'pip install pytesseract' ve sistemde tesseract gerekir")
    if not ocr.startswith(("rapid", "tesseract", "none")) and "transformers" not in installed:
        print("  [!] Seçili OCR modeli için 'pip install -e .[hf,ocr]' gerekir")
    if s.backend in ("hf", "auto") and not s.llm.lower().endswith(".gguf") and "transformers" not in installed:
        print("  [!] LLM için 'pip install -e .[hf]' gerekir (ya da bir .gguf yolu ve .[gguf])")
    return 0


def _jsonable(obj):
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ozetci", description="1B altı açık modellerle PDF / e-posta / görüntü özetleyici")
    p.add_argument("--model", help="HF model kimliği (ör. Qwen/Qwen3-0.6B) ya da .gguf yolu (OZETCI_LLM)")
    p.add_argument("--ocr", help=f"OCR: 'rapid' (PP-OCRv5 latin, varsayılan), 'rapid:en', 'rapid:ch', 'tesseract', 'none' ya da HF Docling kimliği (ör. {DOCLING_OCR}) (OZETCI_OCR)")
    p.add_argument("--backend", choices=["auto", "hf", "gguf", "extractive"], help="özetleme arka ucu: auto (varsayılan), hf (transformers), gguf (llama.cpp), extractive (modelsiz yedek)")
    p.add_argument("--threads", type=int, help="CPU iş parçacığı sayısı")
    p.add_argument("--parola", help="parola korumalı PDF'ler için parola")
    p.add_argument("-v", "--verbose", action="store_true", help="ayrıntılı günlük ve hata izleri")
    sub = p.add_subparsers(dest="cmd", required=True)

    s1 = sub.add_parser("ozetle", help="dosyaları özetle")
    s1.add_argument("paths", nargs="+", help="PDF, .eml, .mbox, görüntü, .html ya da metin dosyaları")
    s1.add_argument("--dil", default="auto", choices=["auto", "tr", "en"], help="özet dili (varsayılan: metinden sezilir)")
    s1.add_argument("--json", action="store_true", help="çıktıyı JSON listesi olarak yaz")
    s1.set_defaults(func=cmd_ozetle)

    s2 = sub.add_parser("oku", help="yalnızca metni çıkar (gerekirse OCR ile)")
    s2.add_argument("paths", nargs="+", help="PDF, .eml, .mbox, görüntü, .html ya da metin dosyaları")
    s2.add_argument("--json", action="store_true", help="çıktıyı JSON listesi olarak yaz")
    s2.add_argument("--ocr-kapali", action="store_true", help="taranmış sayfaları OCR'a verme")
    s2.set_defaults(func=cmd_oku)

    s3 = sub.add_parser("bilgi", help="ayarları, parametre bütçesini ve kurulu paketleri göster")
    s3.set_defaults(func=cmd_bilgi)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
