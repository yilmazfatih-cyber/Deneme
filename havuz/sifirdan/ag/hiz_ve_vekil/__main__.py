"""Ters vekili başlatır.

    python -m hiz_ve_vekil sun --arka 127.0.0.1:9001 --arka 127.0.0.1:9002 --kapi 8456 --strateji
    en-az
Genişletme: yeni seçenek için `build_parser`'a argüman ekleyin; varsayılanlar güvenli tarafta
kalsın.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging

from hiz_ve_vekil.balancer import Backend, make_strategy
from hiz_ve_vekil.health import HealthChecker
from hiz_ve_vekil.policies import RateLimiter
from hiz_ve_vekil.proxy import ReverseProxy
from http_sunucu import HttpServer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m hiz_ve_vekil", description="Sıfırdan ters vekil"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="vekili başlat")
    serve.add_argument(
        "--arka", action="append", required=True, help="arka uç sunucu:kapı (birden çok)"
    )
    serve.add_argument("--adres", default="127.0.0.1")
    serve.add_argument("--kapi", type=int, default=8456)
    serve.add_argument("--strateji", choices=["sirali", "en-az", "karma"], default="sirali")
    serve.add_argument("--hiz", type=float, default=50.0, help="istemci başına saniyede istek")
    return parser


async def run(args: argparse.Namespace) -> None:
    backends = [Backend(h, int(p)) for h, _, p in (a.rpartition(":") for a in args.arka)]
    strategy = make_strategy(args.strateji, backends)
    proxy = ReverseProxy(backends, strategy=strategy, limiter=RateLimiter(args.hiz, args.hiz * 2))
    health = HealthChecker(backends)
    health.start()
    server = HttpServer(proxy, host=args.adres, port=args.kapi)
    await server.start()
    print(
        f"Vekil: {server.url}/ → {', '.join(b.name for b in backends)} (Ctrl+C ile durdurun)",
        flush=True,
    )
    try:
        await asyncio.Event().wait()
    finally:
        await health.stop()
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
