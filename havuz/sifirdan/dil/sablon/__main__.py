"""Komut satırı: bir şablonu JSON verisiyle işler.

    python -m sablon isle sayfa.html --veri veri.json
    python -m sablon isle sayfa.html --veri veri.json --kacissiz     (HTML kaçışı kapalı: düz metin)
Şablonun bulunduğu klasör `include` için kök klasördür. Çıkış: 0 başarı, 1 şablon hatası,
2 dosya/veri hatası.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .environment import Environment, FileLoader, TemplateNotFoundError
from .markup import TemplateError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m sablon", description="Şablon motoru")
    sub = parser.add_subparsers(dest="komut", required=True)
    run = sub.add_parser("isle", help="şablonu veriyle işler ve sonucu yazar")
    run.add_argument("sablon", type=Path)
    run.add_argument("--veri", type=Path, help="JSON veri dosyası (nesne)")
    run.add_argument("--kacissiz", action="store_true", help="HTML kaçışını kapat")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    data: dict[str, object] = {}
    if args.veri is not None:
        try:
            loaded = json.loads(args.veri.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"Veri okunamadı: {args.veri}: {exc}", file=sys.stderr)
            return 2
        if not isinstance(loaded, dict):
            print("Veri dosyası bir JSON nesnesi ({…}) olmalı.", file=sys.stderr)
            return 2
        data = loaded
    path: Path = args.sablon
    env = Environment(FileLoader(path.parent), autoescape=not args.kacissiz)
    try:
        print(env.get_template(path.name).render(data), end="")
    except TemplateNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except TemplateError as err:
        source = env.loader.load(err.name) if env.loader and err.name != "<dizgi>" else ""
        print(err.render(source), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
