"""Komut satırı: ``ozetci ozetle dosya.pdf``, ``ozetci oku mail.eml``, ``ozetci bilgi``."""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .config import Settings
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
    return s


def cmd_ozetle(args) -> int:
    oz = Ozetci(_settings_from_args(args))
    results = []
    for path in args.paths:
        summary = oz.summarize(path, language=args.dil)
        results.append({"dosya": path, **summary.to_dict()})
        if not args.json:
            print(f"=== {path} ===")
            print(summary.render())
            if summary.notes:
                print("\n(" + "; ".join(summary.notes) + ")")
            print()
    if args.json:
        json.dump(results if len(results) > 1 else results[0], sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


def cmd_oku(args) -> int:
    oz = Ozetci(_settings_from_args(args))
    for path in args.paths:
        doc = oz.read(path, use_ocr=not args.ocr_kapali)
        if args.json:
            print(json.dumps({"dosya": path, "tur": doc.kind, "baslik": doc.title, "metin": doc.full_text(), "meta": _jsonable(doc.metadata)}, ensure_ascii=False, indent=2))
        else:
            print(f"=== {path} ({doc.kind}) ===")
            print(doc.full_text())
            print()
    return 0


def cmd_bilgi(args) -> int:
    s = _settings_from_args(args)
    budget = s.param_budget()
    print("Ayarlar:")
    for k, v in vars(s).items():
        print(f"  {k:14} {v}")
    print("Parametre bütçesi (milyon):")
    print(f"  LLM  {budget['llm_M'] or '?'}")
    print(f"  OCR  {budget['ocr_M'] or '?'}")
    if budget["llm_M"] and budget["ocr_M"]:
        total = budget["llm_M"] + budget["ocr_M"]
        print(f"  Toplam {total}  ({'1B altı' if total < 1000 else '1B ÜSTÜ!'})")
    for mod in ("torch", "transformers", "llama_cpp", "docling_core", "pytesseract", "pypdfium2"):
        try:
            __import__(mod)
            print(f"  [+] {mod}")
        except Exception:
            print(f"  [-] {mod}")
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
    p.add_argument("--model", help="HF model kimliği veya .gguf yolu (OZETCI_LLM)")
    p.add_argument("--ocr", help="OCR: HF model kimliği (Docling VLM), 'rapid', 'tesseract' veya 'none' (OZETCI_OCR)")
    p.add_argument("--backend", choices=["auto", "hf", "gguf", "extractive"], help="Özetleme arka ucu")
    p.add_argument("--threads", type=int, help="CPU iş parçacığı sayısı")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    s1 = sub.add_parser("ozetle", help="dosyaları özetle")
    s1.add_argument("paths", nargs="+")
    s1.add_argument("--dil", default="auto", choices=["auto", "tr", "en"], help="özet dili")
    s1.add_argument("--json", action="store_true")
    s1.set_defaults(func=cmd_ozetle)

    s2 = sub.add_parser("oku", help="yalnızca metni çıkar (OCR dahil)")
    s2.add_argument("paths", nargs="+")
    s2.add_argument("--json", action="store_true")
    s2.add_argument("--ocr-kapali", action="store_true", help="taranmış sayfaları OCR'a verme")
    s2.set_defaults(func=cmd_oku)

    s3 = sub.add_parser("bilgi", help="ayarları ve kurulu arka uçları göster")
    s3.set_defaults(func=cmd_bilgi)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
