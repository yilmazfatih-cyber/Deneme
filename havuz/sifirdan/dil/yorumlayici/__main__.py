"""Komut satırı: REPL, dosya çalıştırma ve AST dökümü.

    python -m yorumlayici                          etkileşimli kabuk (REPL)
    python -m yorumlayici calistir dosya.tohum     dosyayı çalıştırır
    python -m yorumlayici kod 'yazdır(1 + 2)'      verilen kodu çalıştırır
    python -m yorumlayici agac dosya.tohum         soyut sözdizim ağacını yazdırır
Çıkış kodu: 0 başarılı, 1 Tohum hatası, 2 kullanım/dosya hatası.
Genişletme: yeni alt komut için `build_parser` içine bir `add_parser`, `main` içine bir dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from pathlib import Path

from .errors import TohumError
from .interp import Interpreter, Limits
from .nodes import dump
from .parser import parse
from .values import display

HELP = """Komutlar: :çık (ya da Ctrl-D) çıkar, :yardım bu metni gösterir.
Örnek: değişken x = 5   |   yazdır(x * 2)   |   işlev kare(n) { döndür n * n }
Satır yarım kalırsa (açık '{' gibi) devam satırı istenir; boş satır girişi bitirir."""


def repl(read: Callable[[str], str], write: Callable[[str], None], limits: Limits) -> int:
    """Etkileşimli döngü. `read(istem)` bir satır döndürür; EOFError çıkış demektir."""
    interp = Interpreter(write, limits)
    write("Tohum REPL — çıkmak için :çık ya da Ctrl-D, yardım için :yardım\n")
    buffer = ""
    while True:
        try:
            line = read("... " if buffer else ">>> ")
        except EOFError:
            write("\n")
            return 0
        except KeyboardInterrupt:
            write("\n(iptal)\n")
            buffer = ""
            continue
        command = line.strip()
        if not buffer and command in (":çık", ":cik", ":q"):
            return 0
        if not buffer and command in (":yardım", ":yardim"):
            write(HELP + "\n")
            continue
        buffer = f"{buffer}\n{line}" if buffer else line
        try:
            value = interp.run(buffer)
        except TohumError as err:
            if err.at_eof and command:
                continue  # yarım satır: devamını iste
            write(err.render(buffer) + "\n")
        else:
            if value is not None:
                write(display(value, nested=True) + "\n")
        buffer = ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m yorumlayici", description="Tohum dili yorumlayıcısı"
    )
    parser.add_argument("--adim", type=int, default=Limits.max_steps, help="en fazla adım sayısı")
    parser.add_argument(
        "--derinlik", type=int, default=Limits.max_depth, help="en fazla çağrı derinliği"
    )
    sub = parser.add_subparsers(dest="komut")
    run_cmd = sub.add_parser("calistir", help="bir .tohum dosyasını çalıştırır")
    run_cmd.add_argument("dosya", type=Path)
    code_cmd = sub.add_parser("kod", help="verilen kodu çalıştırır")
    code_cmd.add_argument("kaynak")
    tree_cmd = sub.add_parser("agac", help="soyut sözdizim ağacını yazdırır")
    tree_cmd.add_argument("dosya", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    limits = Limits(max_steps=args.adim, max_depth=args.derinlik)
    if args.komut is None:
        return repl(input, lambda text: print(text, end=""), limits)
    if args.komut == "kod":
        source = args.kaynak
    else:
        try:
            source = args.dosya.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"Dosya bulunamadı: {args.dosya}", file=sys.stderr)
            return 2
    try:
        if args.komut == "agac":
            for stmt in parse(source).body:
                print(dump(stmt))
        else:
            Interpreter(lambda text: print(text, end=""), limits).run(source)
    except TohumError as err:
        print(err.render(source), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
