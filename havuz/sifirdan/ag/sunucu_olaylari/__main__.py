"""Gösterim: `python -m sunucu_olaylari sun --kapi 8457` — her 2 saniyede bir "saat" olayı yayınlar.

Tarayıcıda: `new EventSource("http://127.0.0.1:8457/olaylar")`; komut satırında: `curl -N
.../olaylar`.
Genişletme: gerçek olay kaynağı (ör. sipariş kuyruğu) için `tick` yerine kendi yayın döngünüzü
yazın.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import time

from http_sunucu import HttpServer
from sunucu_olaylari.broker import Broker, sse_endpoint


async def run(port: int) -> None:
    broker = Broker()
    server = HttpServer(sse_endpoint(broker), port=port)
    await server.start()
    print(f"SSE: {server.url}/olaylar (curl -N ile izleyin; Ctrl+C ile durdurun)", flush=True)
    try:
        while True:
            broker.publish(time.strftime("%H:%M:%S"), event="saat")
            await asyncio.sleep(2)
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m sunucu_olaylari", description="SSE gösterimi")
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="saat olaylarını yayınla")
    serve.add_argument("--kapi", type=int, default=8457)
    args = parser.parse_args(argv)
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args.kapi))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
