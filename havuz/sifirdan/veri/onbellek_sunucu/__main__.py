"""Komut satırı: sunucuyu başlat (`sun`) ya da tek bir komut gönder (`komut`).

    python -m onbellek_sunucu sun [--kapi 8450] [--bellek 64m] [--anlik dosya] [--kaydet 60]
    python -m onbellek_sunucu komut [--kapi 8450] GET anahtar

Genişletme: yeni seçenek → `_parser`'a, sonra `CacheServer`'a parametre olarak geçirin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import sys

from .client import CacheClient, CacheError
from .server import DEFAULT_PORT, CacheServer
from .store import Store

_UNITS = {"k": 1024, "m": 1024**2, "g": 1024**3}


def parse_size(text: str) -> int:
    """'64m' → 67108864; '0' → sınırsız."""
    text = text.strip().lower()
    if text and text[-1] in _UNITS:
        return int(text[:-1]) * _UNITS[text[-1]]
    return int(text)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m onbellek_sunucu", description="Önbellek sunucusu"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="sunucuyu başlat")
    serve.add_argument("--kapi", type=int, default=DEFAULT_PORT)
    serve.add_argument("--bellek", default="0", help="bellek sınırı (ör. 64m); 0 = sınırsız")
    serve.add_argument("--anlik", help="anlık görüntü dosyası")
    serve.add_argument("--kaydet", type=float, help="kaç saniyede bir anlık görüntü alınsın")
    command = sub.add_parser("komut", help="tek komut gönder")
    command.add_argument("--kapi", type=int, default=DEFAULT_PORT)
    command.add_argument("argumanlar", nargs="+")
    return parser


async def _serve(args: argparse.Namespace) -> None:
    server = CacheServer(Store(maxmemory=parse_size(args.bellek)), port=args.kapi,
                         snapshot_path=args.anlik, save_interval=args.kaydet)  # fmt: skip
    port = await server.start()
    print(f"Önbellek sunucusu 127.0.0.1:{port} adresinde (durdurmak için Ctrl+C).", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.komut == "sun":
        with contextlib.suppress(KeyboardInterrupt):
            asyncio.run(_serve(args))
        return 0
    try:
        with CacheClient(port=args.kapi) as client:
            reply = client.execute(*args.argumanlar)
    except (CacheError, ConnectionError) as error:
        print(f"Hata: {error}", file=sys.stderr)
        return 1
    print(reply.decode(errors="replace") if isinstance(reply, bytes) else reply)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
