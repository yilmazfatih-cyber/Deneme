"""Komut satırı: bir klasörü HTTP üzerinden yayınlar.

    python -m http_sunucu sun --klasor ./public --kapi 8450
Durdurmak için Ctrl+C (düzgün kapanış: süren yanıtlar tamamlanır).
Genişletme: yeni bir alt komut için `build_parser`'a alt ayrıştırıcı, `main`'e dal ekleyin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging

from http_sunucu.server import HttpServer
from http_sunucu.static import StaticFiles


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m http_sunucu", description="Sıfırdan HTTP/1.1 sunucusu"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="bir klasörü yayınla")
    serve.add_argument("--klasor", default=".", help="yayınlanacak klasör (varsayılan: bulunulan)")
    serve.add_argument(
        "--adres", default="127.0.0.1", help="dinlenecek adres (varsayılan: yalnız bu bilgisayar)"
    )
    serve.add_argument("--kapi", type=int, default=8450, help="kapı numarası (varsayılan: 8450)")
    return parser


async def serve(folder: str, host: str, port: int) -> None:
    server = HttpServer(StaticFiles(folder), host=host, port=port)
    await server.start()
    print(f"{server.url}/ adresinde yayında. Durdurmak için Ctrl+C.", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(serve(args.klasor, args.adres, args.kapi))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
