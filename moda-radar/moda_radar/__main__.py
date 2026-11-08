"""Komut satırı girişi. Alt komutlar docs/PLAN.md ve CLAUDE.md'deki tabloyla aynıdır.

Şimdilik yalnız `dogrula` çalışır; diğerleri ilgili ajan tarafından eklenir (sahiplik: CLAUDE.md).
"""

from __future__ import annotations

import argparse
import sys

from moda_radar import dogrula

BEKLEYEN = {
    "topla": "veri-muhendisi",
    "renk": "renk-bilimci",
    "tahmin": "trend-modelci",
    "yatirim": "yatirim-analisti",
    "geriye-test": "trend-modelci",
}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="moda_radar", description="Moda Radar komutları")
    alt = p.add_subparsers(dest="komut", required=True)
    alt.add_parser("dogrula", help="content/ JSON'larını doğrular")
    for ad, sahip in BEKLEYEN.items():
        alt.add_parser(ad, help=f"(henüz yok; sahibi: {sahip})")
    args = p.parse_args(argv)
    if args.komut == "dogrula":
        return dogrula.main()
    print(f"'{args.komut}' henüz uygulanmadı; sahibi: {BEKLEYEN[args.komut]} (bkz. CLAUDE.md)", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
