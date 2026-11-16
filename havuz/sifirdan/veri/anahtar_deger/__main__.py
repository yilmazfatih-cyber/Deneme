"""Komut satırı: `python -m anahtar_deger <klasör> <komut> ...` (anahtar ve değerler UTF-8 metin).

Komutlar: yaz <anahtar> <değer> · oku <anahtar> · sil <anahtar> · tara [başlangıç] [bitiş] ·
birlestir · durum.

Genişletme: yeni komut için `_build_parser`'a alt komut, `main`'deki eşleşmeye bir dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys

from .store import KVStore


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m anahtar_deger", description="LSM anahtar-değer deposu"
    )
    parser.add_argument("klasor", help="deponun klasörü (yoksa oluşturulur)")
    sub = parser.add_subparsers(dest="komut", required=True)
    yaz = sub.add_parser("yaz", help="anahtara değer yaz")
    yaz.add_argument("anahtar")
    yaz.add_argument("deger")
    sub.add_parser("oku", help="anahtarın değerini yaz").add_argument("anahtar")
    sub.add_parser("sil", help="anahtarı sil").add_argument("anahtar")
    tara = sub.add_parser("tara", help="aralıktaki çiftleri sırayla listele")
    tara.add_argument("baslangic", nargs="?", default="")
    tara.add_argument("bitis", nargs="?")
    sub.add_parser("birlestir", help="bütün SSTable'ları tek tabloya birleştir")
    sub.add_parser("durum", help="bellek tablosu ve tablo sayıları")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    with KVStore.open(args.klasor) as db:
        if args.komut == "yaz":
            db.put(args.anahtar.encode(), args.deger.encode())
        elif args.komut == "oku":
            value = db.get(args.anahtar.encode())
            if value is None:
                print(f"'{args.anahtar}' bulunamadı.", file=sys.stderr)
                return 1
            print(value.decode(errors="replace"))
        elif args.komut == "sil":
            db.delete(args.anahtar.encode())
        elif args.komut == "tara":
            end = args.bitis.encode() if args.bitis is not None else None
            for key, value in db.scan(args.baslangic.encode(), end):
                print(f"{key.decode(errors='replace')}\t{value.decode(errors='replace')}")
        elif args.komut == "birlestir":
            db.flush()
            db.compact()
        elif args.komut == "durum":
            for name, number in db.stats().items():
                print(f"{name}: {number}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
