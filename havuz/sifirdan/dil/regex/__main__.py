"""Komut satırı: arama, tümünü bulma, değiştirme, program dökümü ve ölçüm.

    python -m regex ara '(\\d+)-(\\d+)' 'tel: 0212-555'      ilk eşleşme ve gruplar
    python -m regex hepsi '\\w+' 'iyi günler'                 findall
    python -m regex degistir '(\\w+)' '<\\1>' 'iyi gün'        sub
    python -m regex dok 'a(b|c)*'                             NFA programını yazdırır
    python -m regex olc                                       felaket desende re ↔ bu motor
Çıkış kodu: 0 eşleşme/başarı, 1 eşleşme yok, 2 desen hatası.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys

from .api import Pattern
from .bench import report
from .nodes import RegexError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m regex", description="Doğrusal zamanlı regex")
    sub = parser.add_subparsers(dest="komut", required=True)
    find = sub.add_parser("ara", help="ilk eşleşmeyi bulur")
    find.add_argument("desen")
    find.add_argument("metin")
    every = sub.add_parser("hepsi", help="tüm eşleşmeleri listeler (findall)")
    every.add_argument("desen")
    every.add_argument("metin")
    replace = sub.add_parser("degistir", help="eşleşmeleri değiştirir (sub)")
    replace.add_argument("desen")
    replace.add_argument("sablon")
    replace.add_argument("metin")
    dump = sub.add_parser("dok", help="derlenmiş NFA programını yazdırır")
    dump.add_argument("desen")
    sub.add_parser("olc", help="felaket desende re ile karşılaştırmalı ölçüm")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.komut == "olc":
        print(report())
        return 0
    try:
        pattern = Pattern(args.desen)
        if args.komut == "dok":
            for pc, inst in enumerate(pattern.program):
                print(f"{pc:4d}  {inst}")
            return 0
        if args.komut == "hepsi":
            found = pattern.findall(args.metin)
            print(found)
            return 0 if found else 1
        if args.komut == "degistir":
            print(pattern.sub(args.sablon, args.metin))
            return 0
        m = pattern.search(args.metin)
    except RegexError as err:
        print(err.render(), file=sys.stderr)
        return 2
    if m is None:
        print("eşleşme yok")
        return 1
    print(f"eşleşme {m.span()}: {m.group()!r}")
    for i, group in enumerate(m.groups(), start=1):
        print(f"  grup {i}: {group!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
