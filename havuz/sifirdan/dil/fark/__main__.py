"""Komut satırı: karşılaştır, yama uygula, sözcük farkı, üç yollu birleştir.

    python -m fark karsilastir eski.txt yeni.txt [-n 3]        birleşik fark (diff -u)
    python -m fark uygula dosya.txt yama.diff [--ters] [-o cikti.txt]
    python -m fark kelime eski.txt yeni.txt [--html]           sözcük farkı
    python -m fark birlestir ortak.txt bizim.txt onlarin.txt [--diff3] [-o cikti.txt]
Çıkış kodu: karsilastir 0 = aynı, 1 = fark var; birlestir 0 = temiz, 1 = çakışma var;
uygula 0 = başarı, 1 = yama tutmadı; 2 = dosya bulunamadı.
Genişletme: yeni alt komut için `build_parser` ve `main` içine birer dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .merge3 import merge
from .patch import PatchError, apply_patch
from .unified import diff_text
from .words import word_diff, word_diff_html


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m fark", description="Metin farkı araçları")
    sub = parser.add_subparsers(dest="komut", required=True)
    cmp_ = sub.add_parser("karsilastir", help="birleşik fark yazar")
    cmp_.add_argument("eski", type=Path)
    cmp_.add_argument("yeni", type=Path)
    cmp_.add_argument("-n", type=int, default=3, help="bağlam satırı sayısı")
    app = sub.add_parser("uygula", help="yamayı dosyaya uygular")
    app.add_argument("dosya", type=Path)
    app.add_argument("yama", type=Path)
    app.add_argument("--ters", action="store_true", help="yamayı geri al")
    app.add_argument("-o", "--cikti", type=Path, help="sonucu bu dosyaya yaz (yoksa ekrana)")
    words = sub.add_parser("kelime", help="sözcük düzeyinde fark")
    words.add_argument("eski", type=Path)
    words.add_argument("yeni", type=Path)
    words.add_argument("--html", action="store_true")
    mrg = sub.add_parser("birlestir", help="üç yollu birleştirme")
    mrg.add_argument("ortak", type=Path)
    mrg.add_argument("bizim", type=Path)
    mrg.add_argument("onlarin", type=Path)
    mrg.add_argument("--diff3", action="store_true", help="çakışmada ortak atayı da göster")
    mrg.add_argument("-o", "--cikti", type=Path)
    return parser


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(text: str, target: Path | None) -> None:
    if target is None:
        sys.stdout.write(text)
    else:
        target.write_text(text, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.komut == "karsilastir":
            out = diff_text(
                read(args.eski), read(args.yeni), str(args.eski), str(args.yeni), args.n
            )
            sys.stdout.write(out)
            return 1 if out else 0
        if args.komut == "uygula":
            try:
                result = apply_patch(read(args.dosya), read(args.yama), reverse=args.ters)
            except PatchError as err:
                print(f"Yama hatası: {err}", file=sys.stderr)
                return 1
            write(result, args.cikti)
            return 0
        if args.komut == "kelime":
            render = word_diff_html if args.html else word_diff
            sys.stdout.write(render(read(args.eski), read(args.yeni)))
            return 0
        merged = merge(read(args.ortak), read(args.bizim), read(args.onlarin), show_base=args.diff3)
        write(merged.text, args.cikti)
        if merged.conflicts:
            print(f"{merged.conflicts} çakışma var; <<<<<<< işaretlerini çözün.", file=sys.stderr)
        return 1 if merged.conflicts else 0
    except FileNotFoundError as err:
        print(f"Dosya bulunamadı: {err.filename}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
