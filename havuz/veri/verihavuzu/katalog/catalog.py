"""Kataloğu okuma ve arama.

``load_catalog()`` → ``katalog/kumeler.yaml``ı okur ve doğrular. ``search(...)`` → sorgu
sözcüklerinin HEPSİ kaydın kimlik/görev/alan/dil/not/atıf metnindeki bir sözcüğün BAŞINDA geçen
kayıtlar ("iris" → "iris" bulur, "çevirisi" bulmaz; büyük/küçük harf ve Türkçe karakter farkı
gözetilmez); görev, alan, dil ve ticari kullanıma göre süzülebilir.
Genişletme: yeni bir süzgeç için ``search``e anahtar sözcüklü bir bağımsız değişken ekleyin ve
CLI'deki ``katalog ara`` seçeneklerine yazın.
"""

from __future__ import annotations

import re
from pathlib import Path

from verihavuzu.katalog.model import Catalog, DatasetEntry
from verihavuzu.katalog.yamlmini import loads
from verihavuzu.paths import catalog_dir
from verihavuzu.text import fold_ascii, lower_tr

CATALOG_FILE = "kumeler.yaml"


def load_catalog(path: Path | None = None) -> list[DatasetEntry]:
    file = path or catalog_dir() / CATALOG_FILE
    return Catalog.model_validate(loads(file.read_text(encoding="utf-8"))).kumeler


_WORD = re.compile(r"[0-9a-z]+")


def _norm(text: str) -> str:
    return fold_ascii(lower_tr(text))


def search(
    entries: list[DatasetEntry],
    query: str = "",
    *,
    gorev: str | None = None,
    alan: str | None = None,
    dil: str | None = None,
    ticari: str | None = None,
) -> list[DatasetEntry]:
    words = [_norm(word) for word in query.split()]
    found: list[DatasetEntry] = []
    for entry in entries:
        text = " ".join(
            [
                entry.kimlik,
                entry.gorev,
                entry.alan,
                " ".join(entry.dil),
                entry.not_,
                entry.atif,
                entry.lisans,
            ]
        )
        tokens = _WORD.findall(_norm(text))
        if not all(any(token.startswith(word) for token in tokens) for word in words):
            continue
        if gorev and entry.gorev != gorev:
            continue
        if alan and entry.alan != alan:
            continue
        if dil and dil not in entry.dil:
            continue
        if ticari and entry.ticari_kullanim != ticari:
            continue
        found.append(entry)
    return found


def find(entries: list[DatasetEntry], kimlik: str) -> DatasetEntry | None:
    return next((entry for entry in entries if entry.kimlik == kimlik), None)
