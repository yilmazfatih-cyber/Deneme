"""Komut satırı: `python -m goruntu <komut> [seçenekler]` — yardım ve hatalar Türkçe.

Kim kullanır: `__main__.py`. Komutlar `commands.py` içindeki `COMMANDS` sözlüğünden gelir.
Kaynak: `havuz/ince-ayar/ince_ayar/cli.py` (tek düzeyli komutlara uyarlandı).

argparse'ın kendi metinleri İngilizcedir; burada üç yerde Türkçeleştirilir: `TurkishFormatter`
("kullanım:"), `TurkishParser` (bölüm başlıkları, `-h/--yardim`) ve `TurkishParser.error` (sık hata
iletileri, `ARGPARSE_ERRORS` tablosu). `UserError` iz sürme basılmadan "HATA: …" diye gösterilir,
çıkış kodu 1 olur. Beklenmeyen hatalar olduğu gibi yükselir ki hata metni bir modele yapıştırılabilsin.

Genişletme: yeni komut için `commands.py` dosyasına bakın; bu dosyaya dokunmanız gerekmez.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import warnings
from collections.abc import Sequence
from typing import Any, NoReturn

from goruntu import __version__
from goruntu.errors import UserError
from goruntu.messages import t

ARGPARSE_ERRORS: list[tuple[str, str]] = [
    (r"the following arguments are required: (.+)", r"şu seçenekler gerekli: \1"),
    (
        r"argument (.+?): invalid choice: (.+) \(choose from (.+)\)",
        r"\1: geçersiz seçim \2 (seçenekler: \3)",
    ),
    (r"unrecognized arguments: (.+)", r"tanınmayan seçenekler: \1"),
    (r"argument (.+?): expected one argument", r"\1: bir değer bekleniyor"),
    (r"argument (.+?): expected at least one argument", r"\1: en az bir değer bekleniyor"),
    (r"argument (.+?): invalid (\w+) value: (.+)", r"\1: geçersiz \2 değeri: \3"),
    (r"argument (.+?): not allowed with argument (.+)", r"\1 ile \2 birlikte kullanılamaz"),
    (r"ambiguous option: (.+) could match (.+)", r"belirsiz seçenek: \1 (olasılar: \2)"),
]


def translate_error(message: str) -> str:
    """argparse'ın İngilizce hata iletisini Türkçeye çevirir; tanımazsa olduğu gibi bırakır."""
    for pattern, replacement in ARGPARSE_ERRORS:
        if re.fullmatch(pattern, message):
            return re.sub(pattern, replacement, message)
    return message


class TurkishFormatter(argparse.RawDescriptionHelpFormatter):
    def add_usage(
        self, usage: str | None, actions: Any, groups: Any, prefix: str | None = None
    ) -> None:
        super().add_usage(usage, actions, groups, "kullanım: " if prefix is None else prefix)


class TurkishParser(argparse.ArgumentParser):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs["add_help"] = False
        kwargs.setdefault("formatter_class", TurkishFormatter)
        super().__init__(*args, **kwargs)
        self._positionals.title = "konumsal argümanlar"
        self._optionals.title = "seçenekler"
        self.add_argument("-h", "--yardim", action="help", help="bu yardımı gösterir ve çıkar")

    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        hint = t("cli.yardim_ipucu", komut=self.prog)
        self.exit(2, f"{self.prog}: HATA: {translate_error(message)}\n{hint}\n")


def build_parser() -> TurkishParser:
    """Bütün komutlarıyla argparse ağacını kurar."""
    from goruntu.commands import COMMANDS

    parser = TurkishParser(
        prog="python -m goruntu", description=t("yardim.genel"), epilog=t("yardim.genel_ornek")
    )
    parser.add_argument(
        "--surum", action="version", version=f"goruntu {__version__}", help="sürümü gösterir"
    )
    commands = parser.add_subparsers(title="komutlar", dest="komut", metavar="KOMUT", required=True)
    for name, command in COMMANDS.items():
        sub = commands.add_parser(name, help=t(command.help_key), description=t(command.help_key))
        command.add_arguments(sub)
        sub.set_defaults(calistir=command.run)
    return parser


def quiet_libraries() -> None:
    """Kütüphanelerin kullanıcıya yararsız gürültüsünü kısar (indirme ilerlemesi görünür kalır)."""
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", message=".*TypedStorage.*")


def main(argv: Sequence[str] | None = None) -> int:
    quiet_libraries()
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.calistir(args))
    except UserError as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(t("cli.kesildi"), file=sys.stderr)
        return 130
