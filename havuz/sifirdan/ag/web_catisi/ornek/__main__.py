"""Not defteri örneğini çalıştırır.

    python -m web_catisi.ornek --kapi 8452                    # http_sunucu ile (asyncio)
    python -m web_catisi.ornek --kapi 8452 --wsgi             # stdlib wsgiref ile (aynı uygulama)
    NOT_DEFTERI_GIZLI=$(python -c "import secrets; print(secrets.token_hex(32))") python -m
    web_catisi.ornek
Gizli anahtar verilmezse her başlangıçta rastgele üretilir (yeniden başlatınca oturumlar kapanır).
Genişletme: yeni bir seçenek için `build_parser`'a argüman ekleyin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import os
import secrets
from wsgiref.simple_server import make_server

from http_sunucu import HttpServer
from orm import Database
from web_catisi.adapters import http_handler, wsgi_app
from web_catisi.app import App
from web_catisi.ornek.modeller import Kullanici, Not
from web_catisi.ornek.uygulama import create_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m web_catisi.ornek", description="Not defteri örneği"
    )
    parser.add_argument("--adres", default="127.0.0.1")
    parser.add_argument("--kapi", type=int, default=8452)
    parser.add_argument("--veritabani", default="not_defteri.sqlite3")
    parser.add_argument(
        "--wsgi", action="store_true", help="http_sunucu yerine stdlib wsgiref kullan"
    )
    return parser


def secret_key() -> bytes:
    value = os.environ.get("NOT_DEFTERI_GIZLI", "")
    if len(value) >= 64:
        return bytes.fromhex(value)
    print("Uyarı: NOT_DEFTERI_GIZLI yok; geçici anahtar üretildi.")
    print("Yeniden başlatınca açık oturumlar kapanır. Anahtar için: .env.example dosyasına bakın.")
    return secrets.token_bytes(32)


async def serve_async(app: App, host: str, port: int) -> None:
    server = HttpServer(http_handler(app), host=host, port=port)
    await server.start()
    print(f"Not defteri: {server.url}/  (durdurmak için Ctrl+C)", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    db = Database(args.veritabani)
    db.migrate([Kullanici, Not])
    app = create_app(db, [secret_key()])
    with contextlib.suppress(KeyboardInterrupt):
        if args.wsgi:
            with make_server(args.adres, args.kapi, wsgi_app(app)) as server:
                print(f"Not defteri (wsgiref): http://{args.adres}:{args.kapi}/", flush=True)
                server.serve_forever()
        else:
            asyncio.run(serve_async(app, args.adres, args.kapi))
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
