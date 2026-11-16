"""Komut satırı:

    python -m dns sun --bolge dns/ornek.zone --kapi 8453        yetkili sunucuyu başlat (UDP + TCP)
    python -m dns sor www.ornek.test A --sunucu 127.0.0.1:8453  bir soru sor
Genişletme: yeni bir alt komut için `build_parser`'a alt ayrıştırıcı, `main`'e dal ekleyin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import sys
from pathlib import Path

from dns.resolver import ResolveError, Resolver
from dns.server import DnsServer
from dns.zone import Zone, ZoneError, parse_zone


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m dns", description="Sıfırdan DNS")
    sub = parser.add_subparsers(dest="komut", required=True)
    serve = sub.add_parser("sun", help="yetkili sunucuyu başlat")
    serve.add_argument("--bolge", default=str(Path(__file__).with_name("ornek.zone")))
    serve.add_argument("--adres", default="127.0.0.1")
    serve.add_argument("--kapi", type=int, default=8453)
    ask = sub.add_parser("sor", help="bir soru sor")
    ask.add_argument("ad")
    ask.add_argument("tur", nargs="?", default="A")
    ask.add_argument("--sunucu", default="127.0.0.1:8453")
    return parser


async def run_server(zone: Zone, host: str, port: int) -> None:
    server = DnsServer(zone, host, port)
    udp, tcp = await server.start()
    print(f"DNS sunucusu: {host} UDP {udp} / TCP {tcp} (durdurmak için Ctrl+C)", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.komut == "sun":
        try:
            zone = parse_zone(Path(args.bolge).read_text(encoding="utf-8"))
        except (OSError, ZoneError) as exc:
            print(f"Bölge dosyası okunamadı: {exc}", file=sys.stderr)
            return 1
        with contextlib.suppress(KeyboardInterrupt):
            asyncio.run(run_server(zone, args.adres, args.kapi))
        return 0
    host, _, port = args.sunucu.rpartition(":")
    try:
        for value in Resolver((host, int(port))).resolve(args.ad, args.tur):
            print(value)
    except ResolveError as exc:
        print(f"Hata: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
