"""Türkçe argparse: "Kullanım:", "seçenekler", `--yardim` ve Türkçe hata iletileri.

Asıl kaynak: havuz/yz/yz/cli.py (`_TurkceAyristirici`); temeller birbirini içe aktarmadığı için kopyadır.
Genişletme: çevrilmeyen bir argparse iletisi görürseniz `_CEVIRI` listesine (İngilizce, Türkçe) ekleyin.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, NoReturn


class TurkishFormatter(argparse.RawDescriptionHelpFormatter):
    def add_usage(
        self, usage: str | None, actions: Any, groups: Any, prefix: str | None = None
    ) -> None:
        super().add_usage(usage, actions, groups, "Kullanım: " if prefix is None else prefix)


_CEVIRI = (
    ("the following arguments are required", "şu argümanlar gerekli"),
    ("unrecognized arguments", "tanınmayan argümanlar"),
    ("invalid choice", "geçersiz seçim"),
    ("choose from", "seçenekler"),
    ("expected one argument", "bir değer bekleniyor"),
    ("expected at least one argument", "en az bir değer bekleniyor"),
    ("invalid int value", "geçersiz tam sayı"),
    ("invalid float value", "geçersiz sayı"),
    ("argument", "argüman"),
)


class TurkishParser(argparse.ArgumentParser):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("formatter_class", TurkishFormatter)
        kwargs["add_help"] = False
        super().__init__(*args, **kwargs)
        self._optionals.title = "seçenekler"
        self._positionals.title = "argümanlar"
        self.add_argument("-h", "--yardim", action="help", help="bu yardımı göster ve çık")

    def error(self, message: str) -> NoReturn:
        for english, turkish in _CEVIRI:
            message = message.replace(english, turkish)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: hata: {message}\n(yardım için: {self.prog} --yardim)\n")
