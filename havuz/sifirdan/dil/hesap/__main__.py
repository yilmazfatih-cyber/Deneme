"""Komut satırı: tek ifade hesaplar ya da etkileşimli hesap makinesi açar.

    python -m hesap "2 + 3 * 4"                 → 14
    python -m hesap --tr "1.234,5 * 2"          → 2.469 (Türkçe sayı biçimi)
    python -m hesap "5 km + 300 m kaç m"        → 5300 m
    python -m hesap                             → etkileşimli (x = 5, son, :çık)
Çıkış kodu: 0 başarı, 1 hesap hatası.
Genişletme: yeni bir seçenek için `build_parser`'a argüman ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable

from .errors import CalcError
from .evaluate import Calculator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m hesap", description="Güvenli hesap makinesi")
    parser.add_argument("ifade", nargs="?", help="hesaplanacak ifade (yoksa etkileşimli kip)")
    parser.add_argument("--tr", action="store_true", help="Türkçe sayı biçimi: 1.234,5 ve ; ayracı")
    return parser


def interactive(calc: Calculator, read: Callable[[str], str], write: Callable[[str], None]) -> int:
    write("Hesap — çıkmak için :çık ya da Ctrl-D. Örnek: x = 5 km  |  x kaç m\n")
    while True:
        try:
            line = read("= ").strip()
        except EOFError:
            write("\n")
            return 0
        if line in (":çık", ":cik", ":q"):
            return 0
        if not line:
            continue
        try:
            write(calc.format(calc.calculate(line)) + "\n")
        except CalcError as err:
            write(err.render(line) + "\n")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    calc = Calculator(turkish=args.tr)
    if args.ifade is None:
        return interactive(calc, input, lambda text: print(text, end=""))
    try:
        print(calc.format(calc.calculate(args.ifade)))
    except CalcError as err:
        print(err.render(args.ifade), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
