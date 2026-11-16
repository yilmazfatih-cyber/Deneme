"""Komut satırı: `python -m btree <dosya> <komut> ...` (anahtar ve değerler UTF-8 metin).

Komutlar: ekle <anahtar> <değer> · oku <anahtar> · sil <anahtar> · aralik [başlangıç] [bitiş] ·
denetle · ciz · doldur <sayı> (deneme için sayı kadar anahtar ekler).

Genişletme: yeni komut için `_parser`'a alt komut, `main`'deki eşleşmeye bir dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys

from .invariants import check, height, render
from .tree import BPlusTree


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m btree", description="Sayfalı B+ ağacı")
    parser.add_argument("dosya", help="ağaç dosyası (yoksa oluşturulur)")
    parser.add_argument("--sayfa", type=int, default=4096, help="sayfa boyu (bayt)")
    sub = parser.add_subparsers(dest="komut", required=True)
    ekle = sub.add_parser("ekle", help="anahtar ekle ya da değiştir")
    ekle.add_argument("anahtar")
    ekle.add_argument("deger")
    sub.add_parser("oku", help="anahtarın değeri").add_argument("anahtar")
    sub.add_parser("sil", help="anahtarı sil").add_argument("anahtar")
    aralik = sub.add_parser("aralik", help="aralıktaki çiftler")
    aralik.add_argument("baslangic", nargs="?", default="")
    aralik.add_argument("bitis", nargs="?")
    sub.add_parser("denetle", help="ağaç değişmezlerini denetle")
    sub.add_parser("ciz", help="ağacı katman katman çiz")
    sub.add_parser("doldur", help="deneme anahtarları ekle").add_argument("sayi", type=int)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    tree = BPlusTree.open(args.dosya, page_size=args.sayfa)
    try:
        if args.komut == "ekle":
            tree.put(args.anahtar.encode(), args.deger.encode())
        elif args.komut == "oku":
            value = tree.get(args.anahtar.encode())
            if value is None:
                print(f"'{args.anahtar}' bulunamadı.", file=sys.stderr)
                return 1
            print(value.decode(errors="replace"))
        elif args.komut == "sil":
            if not tree.delete(args.anahtar.encode()):
                print(f"'{args.anahtar}' zaten yoktu.", file=sys.stderr)
        elif args.komut == "aralik":
            end = args.bitis.encode() if args.bitis is not None else None
            for key, value in tree.range(args.baslangic.encode(), end):
                print(f"{key.decode(errors='replace')}\t{value.decode(errors='replace')}")
        elif args.komut == "denetle":
            check(tree)
            print(f"Değişmezler sağlam: {len(tree)} anahtar, yükseklik {height(tree)}.")
        elif args.komut == "ciz":
            print(render(tree))
        elif args.komut == "doldur":
            for number in range(args.sayi):
                tree.put(f"anahtar{number:06d}".encode(), str(number).encode())
    finally:
        tree.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
