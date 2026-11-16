"""Komut satırı: `python -m websocket sun --kapi 8451` sohbet örneğini başlatır.

    python -m websocket gonder ws://127.0.0.1:8451/oda "merhaba"   tek ileti gönderip ilk yanıtı
    yazar
Genişletme: yeni bir alt komut için `build_parser`'a alt ayrıştırıcı, `main`'e dal ekleyin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib

from http_sunucu import HttpServer
from websocket.client import connect
from websocket.ornek_sohbet import build_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m websocket", description="WebSocket örnekleri")
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="sohbet örneğini başlat")
    serve.add_argument("--adres", default="127.0.0.1")
    serve.add_argument("--kapi", type=int, default=8451)
    send = sub.add_parser("gonder", help="bir iletiyi gönder, ilk yanıtı yaz")
    send.add_argument("adres", help="ws://sunucu:kapı/yol")
    send.add_argument("ileti")
    return parser


async def run_server(host: str, port: int) -> None:
    server = HttpServer(build_app(), host=host, port=port)
    await server.start()
    print(f"Sohbet: {server.url}/  (iki sekmede açın; durdurmak için Ctrl+C)", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


async def send_once(url: str, text: str) -> None:
    ws = await connect(url)
    await ws.send(text)
    print(await ws.recv())
    await ws.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    with contextlib.suppress(KeyboardInterrupt):
        if args.komut == "sun":
            asyncio.run(run_server(args.adres, args.kapi))
        else:
            asyncio.run(send_once(args.adres, args.ileti))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
