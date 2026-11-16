"""Komut satırı: bayt koduna derleyip çalıştırma ve bayt kodu dökümü.

    python -m sanal_makine calistir dosya.tohum    derler ve sanal makinede çalıştırır
    python -m sanal_makine dok dosya.tohum         bayt kodunu okunur biçimde döker
    python -m sanal_makine kod 'yazdır(1 + 2)'     verilen kodu çalıştırır
Çıkış kodu: 0 başarılı, 1 Tohum hatası, 2 dosya hatası.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from yorumlayici.errors import TohumError
from yorumlayici.interp import Limits
from yorumlayici.natives import make_builtins
from yorumlayici.parser import parse
from yorumlayici.resolver import resolve

from .compiler import compile_program
from .disasm import disassemble
from .vm import DEFAULT_LIMITS, VM


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m sanal_makine", description="Tohum sanal makinesi"
    )
    parser.add_argument("--adim", type=int, default=DEFAULT_LIMITS.max_steps, help="en fazla komut")
    parser.add_argument(
        "--derinlik", type=int, default=DEFAULT_LIMITS.max_depth, help="çağrı derinliği"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    sub.add_parser("calistir", help="dosyayı çalıştırır").add_argument("dosya", type=Path)
    sub.add_parser("dok", help="bayt kodunu döker").add_argument("dosya", type=Path)
    sub.add_parser("kod", help="verilen kodu çalıştırır").add_argument("kaynak")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.komut == "kod":
        source = args.kaynak
    else:
        try:
            source = args.dosya.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"Dosya bulunamadı: {args.dosya}", file=sys.stderr)
            return 2
    try:
        if args.komut == "dok":
            program = parse(source)
            resolve(program, set(make_builtins()))
            print(disassemble(compile_program(program)))
        else:
            limits = Limits(max_steps=args.adim, max_depth=args.derinlik)
            VM(lambda text: print(text, end=""), limits).run(source)
    except TohumError as err:
        print(err.render(source), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
