"""Görev ve eylem tanımları + bütün eylemlerin paylaştığı komut satırı seçenekleri.

Kim kullanır: her görevin `cli.py` dosyası bir `TaskSpec` tanımlar; `registry.py` onları toplar;
`cli.py` (paket kökündeki) argparse ağacını buradan kurar.

Bir eylem üç parçadır: yardım metni (sözlük anahtarı), seçenek ekleyen işlev ve çalıştıran işlev.
Çalıştıran işlev ağır kütüphaneleri (torch…) **kendi içinde** içe aktarır; böylece `--yardim`
anında açılır.

Genişletme: bütün eylemlerde ortak yeni bir seçenek için `add_config_arguments` içine ekleyin.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from ince_ayar.config import PRESETS, load_config, resolve_config_path
from ince_ayar.messages import t

C = TypeVar("C", bound=BaseModel)


@dataclass(frozen=True)
class Action:
    help_key: str
    add_arguments: Callable[[argparse.ArgumentParser], None]
    run: Callable[[argparse.Namespace], int]


@dataclass(frozen=True)
class TaskSpec:
    name: str
    help_key: str
    description_key: str
    actions: dict[str, Action]


def add_config_arguments(parser: argparse.ArgumentParser) -> None:
    """`--hazir`, `--ayar` ve `-D` seçenekleri (yapılandırma isteyen her eylemde)."""
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


def add_model_argument(parser: argparse.ArgumentParser, required: bool = False) -> None:
    parser.add_argument(
        "--model", required=required, metavar="KLASOR", help=t("yardim.secenek.model")
    )


def load_task_config(args: argparse.Namespace, task: str, schema: type[C]) -> C:
    """`--hazir`/`--ayar` + `-D` seçeneklerinden görevin yapılandırmasını yükler."""
    path = resolve_config_path(task, args.ayar, args.hazir)
    return load_config(Path(path), schema, list(args.degistir))


def no_arguments(parser: argparse.ArgumentParser) -> None:
    """Ek seçeneği olmayan eylemler için."""
    del parser
