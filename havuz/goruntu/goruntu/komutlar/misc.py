"""Yardımcı komutlar: `modeller` (katalog), `ornek-veri` (programla örnek küme), `sun` (HTTP sunucusu).

Kim kullanır: `goruntu/commands.py`.

`sun` varsayılan olarak yalnız bu bilgisayardan (127.0.0.1) erişilir. Başka adrese açmak için API
anahtarı ortam değişkeni (`GORUNTU_API_ANAHTARI`) verilmelidir; verilmezse komut uyarır ve yerel kip
kuralları (Host/Origin denetimi) dışarıdan gelen istekleri zaten reddeder.

Genişletme: yeni bir yardımcı komut için `_add_<ad>` + `_<ad>` yazıp dosya sonuna `Command(...)` ekleyin.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from goruntu import console
from goruntu.console import format_table
from goruntu.errors import UserError
from goruntu.komutlar.base import Command, add_limit_arguments, limits_from
from goruntu.messages import t

DEFAULT_PORT = 8465
API_KEY_ENV = "GORUNTU_API_ANAHTARI"


def _add_modeller(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--gorev", choices=("siniflandirma", "gomme"), help=t("yardim.secenek.gorev")
    )


def _modeller(args: argparse.Namespace) -> int:
    from goruntu.catalog import load_catalog

    rows = [
        [
            e.takma_ad or "-",
            e.kimlik,
            ",".join(e.gorev),
            e.boyut,
            e.lisans or "?",
            e.ticari,
            e.girdi,
        ]
        for e in load_catalog().modeller
        if args.gorev is None or args.gorev in e.gorev
    ]
    console.result(format_table(t("katalog.basliklar").split("|"), rows))
    console.result("\n" + t("katalog.not"))
    return 0


def _add_ornek_veri(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("cikti", metavar="KLASOR", help=t("yardim.secenek.cikti_klasor"))
    parser.add_argument(
        "--sinif-basi", type=int, default=40, metavar="N", help=t("yardim.secenek.sinif_basi")
    )
    parser.add_argument(
        "--boyut", type=int, default=128, metavar="PIKSEL", help=t("yardim.secenek.boyut")
    )
    parser.add_argument(
        "--kopya-orani",
        type=float,
        default=0.1,
        metavar="ORAN",
        help=t("yardim.secenek.kopya_orani"),
    )
    parser.add_argument("--tohum", type=int, default=0, help=t("yardim.secenek.tohum"))


def _ornek_veri(args: argparse.Namespace) -> int:
    from goruntu.synthetic import write_shape_dataset

    if args.sinif_basi < 1 or not 16 <= args.boyut <= 1024 or not 0 <= args.kopya_orani <= 1:
        raise UserError(t("ornek.gecersiz"))
    counts = write_shape_dataset(
        Path(args.cikti), args.sinif_basi, args.tohum, args.boyut, args.kopya_orani
    )
    summary = ", ".join(f"{label}: {count}" for label, count in counts.items())
    console.result(t("ornek.bitti", yol=args.cikti, ozet=summary))
    return 0


def _add_sun(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", metavar="PAKET", help=t("yardim.secenek.sun_model"))
    parser.add_argument("--dizin", metavar="KLASOR", help=t("yardim.secenek.dizin"))
    parser.add_argument("--adres", default="127.0.0.1", help=t("yardim.secenek.adres"))
    parser.add_argument("--kapi", type=int, default=DEFAULT_PORT, help=t("yardim.secenek.kapi"))
    add_limit_arguments(parser)


def _sun(args: argparse.Namespace) -> int:
    import uvicorn

    from goruntu.sunucu.app import create_app
    from goruntu.sunucu.state import ServerState, load_components

    if not args.model and not args.dizin:
        raise UserError(t("sunucu.bilesen_yok"))
    api_key = os.environ.get(API_KEY_ENV) or None
    if api_key is None and args.adres not in ("127.0.0.1", "localhost", "::1"):
        console.warn(t("sunucu.anahtarsiz_dis_adres", adres=args.adres, ortam=API_KEY_ENV))
    classifier, index, embedder = load_components(args.model, args.dizin)
    state = ServerState(classifier, index, embedder, api_key, limits_from(args))
    console.info(t("sunucu.basliyor", adres=args.adres, kapi=args.kapi))
    uvicorn.run(create_app(state), host=args.adres, port=args.kapi, log_level="warning")
    return 0


MODELLER = Command("yardim.komut.modeller", _add_modeller, _modeller)
ORNEK_VERI = Command("yardim.komut.ornek_veri", _add_ornek_veri, _ornek_veri)
SUN = Command("yardim.komut.sun", _add_sun, _sun)
