"""Komut satırı:

    python -m eposta yakala --kapi 8459 --klasor yakalanan    # geliştirme posta yakalayıcısı
    python -m eposta gonder --kapi 8459 --kime mehmet@ornek.test --konu "Deneme" --metin "Merhaba"
Uygulamanızı SMTP sunucusu olarak 127.0.0.1:8459'a yönlendirin; gönderilen her posta .eml olarak
klasöre düşer ve kimseye gerçekten gitmez.
Genişletme: yeni bir alt komut için `build_parser`'a alt ayrıştırıcı, `main`'e dal ekleyin.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
from pathlib import Path

from eposta.mime import build_message
from eposta.parser import parse_message
from eposta.smtp_client import send_mail
from eposta.smtp_server import Envelope, MailCatcher, SmtpServer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m eposta", description="Sıfırdan e-posta araçları"
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    catch = sub.add_parser("yakala", help="yerel SMTP yakalayıcı")
    catch.add_argument("--kapi", type=int, default=8459)
    catch.add_argument("--klasor", default="yakalanan")
    send = sub.add_parser("gonder", help="bir deneme postası gönder")
    send.add_argument("--kapi", type=int, default=8459)
    send.add_argument("--kimden", default="deneme@ornek.test")
    send.add_argument("--kime", required=True)
    send.add_argument("--konu", default="Deneme")
    send.add_argument("--metin", default="Merhaba!")
    return parser


class PrintingCatcher(MailCatcher):
    async def __call__(self, envelope: Envelope) -> None:
        await super().__call__(envelope)
        parsed = parse_message(envelope.data)
        print(
            f"Yakalandı: {envelope.sender} → {', '.join(envelope.recipients)} | {parsed.subject}",
            flush=True,
        )


async def catch(port: int, folder: str) -> None:
    server = SmtpServer(PrintingCatcher(Path(folder)), port=port)
    await server.start()
    print(f"SMTP yakalayıcı 127.0.0.1:{server.port} — postalar {folder}/ klasörüne düşer.")
    print("Durdurmak için Ctrl+C.", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    with contextlib.suppress(KeyboardInterrupt):
        if args.komut == "yakala":
            asyncio.run(catch(args.kapi, args.klasor))
        else:
            message = build_message(
                sender=("", args.kimden), to=[("", args.kime)], subject=args.konu, text=args.metin
            )
            asyncio.run(send_mail("127.0.0.1", args.kapi, args.kimden, [args.kime], message))
            print("Gönderildi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
