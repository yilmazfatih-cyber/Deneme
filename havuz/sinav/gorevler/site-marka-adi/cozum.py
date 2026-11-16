"""Başvuru çözümü: ayar dosyası ve bütün içerikte ad değişir; ekler ünlü uyumuna göre (Çınar'ın, Çınar'ı).

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: içerik klasörüne yeni dosya türü eklenirse `SUFFIXES`'i genişletin.
"""

from pathlib import Path

from exam.edit import read, write

SUFFIXES = {".md", ".mdx", ".json"}
REPLACEMENTS = (("Sedir'in", "Çınar'ın"), ("Sedir'i", "Çınar'ı"), ("Sedir", "Çınar"))


def _rename(path: Path) -> None:
    text = read(path)
    new = text
    for old, replacement in REPLACEMENTS:
        new = new.replace(old, replacement)
    if new != text:
        write(path, new)


def coz(kopya: Path) -> None:
    _rename(kopya / "src/site.config.ts")
    for path in sorted((kopya / "src/content").rglob("*")):
        if path.is_file() and path.suffix in SUFFIXES:
            _rename(path)
