"""Komut satırı: Markdown dosyasını HTML'e çevirir ya da içindekileri listeler.

    python -m markdown cevir belge.md                     HTML'i ekrana yazar
    python -m markdown cevir belge.md -o belge.html --tam-sayfa   tam HTML sayfası yazar
    python -m markdown icindekiler belge.md               başlık ağacını girintili listeler
Çıkış kodu: 0 başarı, 2 dosya bulunamadı.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import convert
from .safety import escape_html

PAGE = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
</head>
<body>
{body}</body>
</html>
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m markdown", description="Markdown → HTML")
    sub = parser.add_subparsers(dest="komut", required=True)
    conv = sub.add_parser("cevir", help="Markdown'ı HTML'e çevirir")
    conv.add_argument("dosya", type=Path)
    conv.add_argument("-o", "--cikti", type=Path, help="yazılacak HTML dosyası")
    conv.add_argument("--tam-sayfa", action="store_true", help="<html> iskeletiyle yaz")
    toc = sub.add_parser("icindekiler", help="başlıkları ve kimliklerini listeler")
    toc.add_argument("dosya", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        text = args.dosya.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"Dosya bulunamadı: {args.dosya}", file=sys.stderr)
        return 2
    result = convert(text)
    if args.komut == "icindekiler":
        for entry in result.toc:
            print(f"{'  ' * (entry.level - 1)}- {entry.text}  (#{entry.id})")
        return 0
    html = result.html
    if args.tam_sayfa:
        title = result.toc[0].text if result.toc else args.dosya.stem
        html = PAGE.format(title=escape_html(title), body=html)
    if args.cikti:
        args.cikti.write_text(html, encoding="utf-8")
        print(f"Yazıldı: {args.cikti}")
    else:
        print(html, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
