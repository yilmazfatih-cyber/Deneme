"""Komut satırı: doğrulama, biçimleme ve akış olaylarını gösterme.

    python -m json_ayristirici dogrula veri.json                 geçerli mi? (hata: satır/sütun + ^)
    python -m json_ayristirici bicimle veri.json --girinti 2     düzgün girintili yazar
    python -m json_ayristirici olaylar veri.json --parca 16      akış olaylarını (16 karakterlik
                                                                 parçalarla okuyarak) listeler
Çıkış kodu: 0 geçerli, 1 JSON hatası, 2 dosya bulunamadı.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .parser import JsonError, loads
from .stream import EventParser
from .writer import dumps


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m json_ayristirici", description="JSON aracı")
    sub = parser.add_subparsers(dest="komut", required=True)
    check = sub.add_parser("dogrula", help="dosyanın geçerli JSON olup olmadığını söyler")
    check.add_argument("dosya", type=Path)
    pretty = sub.add_parser("bicimle", help="girintili ve düzgün yazar")
    pretty.add_argument("dosya", type=Path)
    pretty.add_argument("--girinti", type=int, default=2)
    pretty.add_argument("--sirali", action="store_true", help="anahtarları sırala")
    pretty.add_argument("--ascii", action="store_true", help="ASCII dışını \\uXXXX yaz")
    events = sub.add_parser("olaylar", help="akış ayrıştırıcısının olaylarını listeler")
    events.add_argument("dosya", type=Path)
    events.add_argument("--parca", type=int, default=64, help="okuma parçası boyu (karakter)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        text = args.dosya.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"Dosya bulunamadı: {args.dosya}", file=sys.stderr)
        return 2
    try:
        if args.komut == "dogrula":
            loads(text)
            print(f"Geçerli JSON: {args.dosya}")
        elif args.komut == "bicimle":
            value = loads(text)
            print(dumps(value, indent=args.girinti, sort_keys=args.sirali, ensure_ascii=args.ascii))
        else:
            parser = EventParser()
            size = max(1, args.parca)
            for start in range(0, len(text), size):
                for event in parser.feed(text[start : start + size]):
                    print(event.kind.value, "" if event.value is None else repr(event.value))
            for event in parser.close():
                print(event.kind.value, "" if event.value is None else repr(event.value))
    except JsonError as err:
        print(err.render(text), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
