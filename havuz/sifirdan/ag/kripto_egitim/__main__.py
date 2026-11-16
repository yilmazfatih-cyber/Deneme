"""Komut satırı: `python -m kripto_egitim <alt-komut>` — denemek ve göstermek için.

    ozet METIN                      SHA-256 (sıfırdan) ve hashlib sonucu yan yana
    gizli-uret --hesap A --yayinci Y  yeni TOTP anahtarı + otpauth:// adresi
    totp --gizli BASE32             şu anki 6 haneli kod
Genişletme: yeni bir alt komut için `build_parser` içine bir alt ayrıştırıcı ve `main` içine bir dal
ekleyin.
"""

from __future__ import annotations

import argparse
import hashlib
import time

from kripto_egitim.encoding import normalize_base32_secret
from kripto_egitim.otp import generate_secret, otpauth_uri, totp
from kripto_egitim.sha import sha256


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m kripto_egitim",
        description="Eğitsel kripto araçları (üretimde kullanmayın).",
    )
    sub = parser.add_subparsers(dest="komut", required=True)
    ozet = sub.add_parser("ozet", help="metnin SHA-256 özeti")
    ozet.add_argument("metin")
    uret = sub.add_parser("gizli-uret", help="yeni TOTP anahtarı ve otpauth:// adresi")
    uret.add_argument("--hesap", required=True)
    uret.add_argument("--yayinci", required=True)
    kod = sub.add_parser("totp", help="şu anki TOTP kodu")
    kod.add_argument("--gizli", required=True, help="Base32 anahtar")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.komut == "ozet":
        data = args.metin.encode("utf-8")
        print(f"sıfırdan : {sha256(data).hexdigest()}")
        print(f"hashlib  : {hashlib.sha256(data).hexdigest()}")
    elif args.komut == "gizli-uret":
        secret = generate_secret()
        print(f"gizli anahtar: {secret}")
        print(f"adres        : {otpauth_uri(secret, args.hesap, args.yayinci)}")
    else:
        print(totp(normalize_base32_secret(args.gizli), time.time()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
