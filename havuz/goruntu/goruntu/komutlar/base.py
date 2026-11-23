"""Komutların ortak parçaları: `Command` tanımı ve birçok komutun paylaştığı seçenekler.

Kim kullanır: `goruntu/komutlar/*.py`, `goruntu/commands.py`.

Genişletme: birden çok komutta aynı seçenek gerekiyorsa buraya `add_<ad>_argument` işlevi ekleyin
(yardım metni `messages.py` → `yardim.secenek.*`).
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from goruntu.config import PRESETS
from goruntu.hazirlik.loader import DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS, LoadLimits
from goruntu.messages import t


@dataclass(frozen=True)
class Command:
    help_key: str
    add_arguments: Callable[[argparse.ArgumentParser], None]
    run: Callable[[argparse.Namespace], int]


def add_config_arguments(parser: argparse.ArgumentParser) -> None:
    """`--hazir`, `--ayar` ve `-D` seçenekleri (yapılandırma isteyen komutlarda)."""
    parser.add_argument("--hazir", choices=PRESETS, help=t("yardim.secenek.hazir"))
    parser.add_argument("--ayar", metavar="DOSYA.toml", help=t("yardim.secenek.ayar"))
    parser.add_argument(
        "-D",
        "--degistir",
        action="append",
        default=[],
        metavar="BOLUM.ANAHTAR=DEGER",
        help=t("yardim.secenek.degistir"),
    )


def add_limit_arguments(parser: argparse.ArgumentParser) -> None:
    """Görüntü güvenlik sınırları (piksel ve dosya boyutu)."""
    parser.add_argument(
        "--azami-piksel",
        type=int,
        default=DEFAULT_MAX_PIXELS,
        metavar="SAYI",
        help=t("yardim.secenek.azami_piksel"),
    )
    parser.add_argument(
        "--azami-mb",
        type=float,
        default=DEFAULT_MAX_BYTES / 1024 / 1024,
        metavar="MB",
        help=t("yardim.secenek.azami_mb"),
    )


def limits_from(args: argparse.Namespace) -> LoadLimits:
    return LoadLimits(max_pixels=args.azami_piksel, max_bytes=int(args.azami_mb * 1024 * 1024))


def add_json_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", metavar="DOSYA", help=t("yardim.secenek.json"))


def existing_path(text: str) -> Path:
    return Path(text)
