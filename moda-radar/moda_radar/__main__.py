"""Komut satırı girişi. Alt komutlar modül bazlı eklenir: moda_radar/<modul>/komut.py içinde
`ekle(alt_parser_grubu)` ve `calistir(args) -> int` tanımlanır (docs/ARAYUZ.md)."""

from __future__ import annotations

import argparse
import importlib
import sys

from moda_radar import dogrula

MODULLER = ("veri", "renk", "tahmin", "yatirim", "gorsel")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="moda_radar", description="Moda Radar komutları")
    alt = p.add_subparsers(dest="komut", required=True)
    alt.add_parser("dogrula", help="content/ JSON'larını doğrular")
    calistiricilar = {}
    for modul in MODULLER:
        try:
            k = importlib.import_module(f"moda_radar.{modul}.komut")
        except ModuleNotFoundError:
            continue
        for ad in k.ekle(alt):
            calistiricilar[ad] = k.calistir
    args = p.parse_args(argv)
    if args.komut == "dogrula":
        return dogrula.main()
    return calistiricilar[args.komut](args)


if __name__ == "__main__":
    sys.exit(main())
