"""Komut satırı girişi: `python -m dil_modeli <komut> [seçenekler]`.

Her komut bir `cli_*.py` dosyasındadır: `add_<ad>_args(parser)` seçenekleri ekler,
`run_<ad>(args)` işi yapar ve çıkış kodunu döndürür. Bu dosya yalnız kayıt defteridir.
Yalnız çalıştırılan komutun dosyası içe aktarılır: `egit` sunucu kütüphanelerini yüklemez.

Genişletme: yeni komut için (1) `cli_ornek.py` içinde `add_ornek_args` + `run_ornek` yazın,
(2) aşağıdaki `COMMANDS` listesinde "YENİ KOMUT BURAYA" satırının üstüne ekleyin,
(3) tests/test_cli.py'ye bir duman testi ekleyin. Komut adı Türkçe ve yalnız ASCII olmalı;
tests/test_cli.py her kaydın dosyasının ve işlevlerinin var olduğunu denetler.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from collections.abc import Callable, Sequence
from typing import Any, NamedTuple, cast

from . import __version__


class Command(NamedTuple):
    name: str  # komut satırındaki ad
    help: str  # tek satırlık Türkçe açıklama
    module: str  # dil_modeli içindeki dosya (uzantısız)
    function: str  # işlev adı kökü: add_<kök>_args ve run_<kök>


COMMANDS: tuple[Command, ...] = (
    Command("tokenizer-egit", "metinden BPE tokenizer eğitir", "cli_data", "tokenizer"),
    Command("veri-hazirla", "metni belirteçlere çevirip eğitime hazırlar", "cli_data", "prepare"),
    Command("egit", "dil modelini eğitir (ya da sürdürür)", "cli_train", "train"),
    Command("degerlendir", "şaşkınlık ve karakter başına bit ölçer", "cli_train", "eval"),
    Command(
        "boyutlar", "hazır model boyutlarını ve parametre sayılarını listeler", "cli_train", "sizes"
    ),
    Command("uret", "istemin devamını üretir", "cli_generate", "generate"),
    Command("sohbet", "uçbirimde modelle sohbet eder", "cli_generate", "chat"),
    Command(
        "ince-ayar", "sohbet verisiyle LoRA (ya da tam) ince ayar yapar", "cli_finetune", "finetune"
    ),
    Command(
        "disa-aktar",
        "modeli Hugging Face / tarayıcı / ONNX biçimine aktarır",
        "cli_export",
        "export",
    ),
    Command("sun", "OpenAI uyumlu HTTP sunucusu başlatır", "cli_serve", "serve"),
    Command("rapor", "eğitim günlüğünden kayıp eğrisi raporu (HTML) yazar", "cli_report", "report"),
    # YENİ KOMUT BURAYA
)

AddArguments = Callable[[argparse.ArgumentParser], None]
Run = Callable[[argparse.Namespace], int]


def load_command(command: Command) -> tuple[AddArguments, Run]:
    """Komutun dosyasını içe aktarıp `add_<kök>_args` ve `run_<kök>` işlevlerini döndürür."""
    module = importlib.import_module(f"{__package__}.{command.module}")
    add = cast(AddArguments, getattr(module, f"add_{command.function}_args"))
    run = cast(Run, getattr(module, f"run_{command.function}"))
    return add, run


class TurkishHelpFormatter(argparse.HelpFormatter):
    """Yardım metninin "usage:" önekini Türkçe yazar."""

    def add_usage(
        self, usage: str | None, actions: Any, groups: Any, prefix: str | None = None
    ) -> None:
        super().add_usage(usage, actions, groups, "kullanım: " if prefix is None else prefix)


def _turkish(parser: argparse.ArgumentParser) -> argparse.ArgumentParser:
    """argparse'ın İngilizce bölüm başlıklarını ve -h açıklamasını Türkçeleştirir."""
    parser._optionals.title = "seçenekler"
    parser._positionals.title = "konumsal bağımsız değişkenler"
    parser.add_argument("-h", "--help", action="help", help="bu yardımı göster ve çık")
    return parser


def build_parser(selected: str | None = None) -> argparse.ArgumentParser:
    """Ayrıştırıcıyı kurar; seçenekler yalnız `selected` komut için yüklenir."""
    parser = _turkish(
        argparse.ArgumentParser(
            prog="python -m dil_modeli",
            description="Sıfırdan dil modeli: tokenizer, eğitim, üretim, ince ayar, sunum.",
            epilog="Bir komutun seçenekleri için: python -m dil_modeli <komut> --help",
            formatter_class=TurkishHelpFormatter,
            add_help=False,
        )
    )
    parser.add_argument(
        "--surum", action="version", version=f"dil-modeli {__version__}", help="sürümü göster"
    )
    sub = parser.add_subparsers(dest="komut", metavar="<komut>", title="komutlar")
    for command in COMMANDS:
        child = _turkish(
            sub.add_parser(
                command.name,
                help=command.help,
                description=command.help,
                formatter_class=TurkishHelpFormatter,
                add_help=False,
            )
        )
        if command.name == selected:
            add, run = load_command(command)
            add(child)
            child.set_defaults(_run=run)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    selected = next((a for a in arguments if not a.startswith("-")), None)
    parser = build_parser(selected)
    args = parser.parse_args(arguments)
    if not getattr(args, "_run", None):
        parser.print_help()
        return 2
    try:
        code: int = args._run(args)
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        # Beklenen kullanıcı hataları: iz dökümü yerine yol gösteren tek satır.
        print(f"Hata: {error}", file=sys.stderr)
        return 1
    return code
