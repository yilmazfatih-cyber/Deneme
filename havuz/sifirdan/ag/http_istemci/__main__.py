"""Komut satırı: `python -m http_istemci getir ADRES` yanıtın durumunu, başlıklarını ve gövdesini
yazar.

    python -m http_istemci getir http://127.0.0.1:8450/ --baslik "Accept: text/html"
Genişletme: yeni bir alt komut için `build_parser`'a alt ayrıştırıcı, `main`'e dal ekleyin.
"""

from __future__ import annotations

import argparse
import sys

from http_istemci.client import Client
from http_istemci.connection import tls_context
from http_istemci.errors import HttpClientError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m http_istemci", description="Sıfırdan HTTP istemcisi"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    fetch = sub.add_parser("getir", help="bir adresi getir")
    fetch.add_argument("adres")
    fetch.add_argument("--yontem", default="GET")
    fetch.add_argument(
        "--baslik", action="append", default=[], help='"Ad: değer" (birden çok olabilir)'
    )
    fetch.add_argument(
        "--ca", help="güvenilecek sertifika dosyası (yerel/kendinden imzalı sunucular için)"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    headers = dict(h.split(":", 1) for h in args.baslik)
    headers = {k.strip(): v.strip() for k, v in headers.items()}
    context = tls_context(args.ca) if args.ca else None
    try:
        with Client(ssl_context=context) as client:
            response = client.request(args.yontem, args.adres, headers=headers)
    except HttpClientError as exc:
        print(f"Hata: {exc}", file=sys.stderr)
        return 1
    print(f"{response.version} {response.status} {response.reason}")
    for name, value in response.headers:
        print(f"{name}: {value}")
    print()
    print(response.text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
