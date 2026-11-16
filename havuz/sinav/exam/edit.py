"""Görev betiklerinin (hazirla.py, cozum.py, hile.py) dosya düzenleme yardımcıları.

Hepsi "tam olarak beklenen yerde" çalışır: aranan metin bulunamazsa ya da beklenenden farklı sayıda
geçerse `EditError` verir. Böylece temel ileride değişirse görev sessizce bozuk bir başlangıç durumu
üretmez; `python sinav.py dogrula` ve `tests/test_gorevler.py` hatayı hemen gösterir.

Kullanım (görev betiğinde):
    from exam.edit import replace, write, remove_between, run
    replace(kopya / "web/src/lib/date.ts", "eski metin", "yeni metin")
Genişletme: yeni bir düzenleme biçimi gerekiyorsa buraya küçük, saf bir işlev ekleyin + testine örnek.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


class EditError(RuntimeError):
    """Görev betiği temeli beklenen hâlde bulamadı (temel değişmiş olabilir)."""


def read(path: Path) -> str:
    if not path.is_file():
        raise EditError(f"Dosya yok: {path}")
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace(path: Path, old: str, new: str, count: int = 1) -> None:
    """`old` metni dosyada TAM `count` kez geçmeli; hepsi `new` olur."""
    text = read(path)
    found = text.count(old)
    if found != count:
        raise EditError(
            f"{path.name}: aranan metin {count} kez beklenirken {found} kez bulundu:\n{old[:200]}"
        )
    write(path, text.replace(old, new))


def remove_between(path: Path, start: str, end: str, keep_end: bool = True) -> str:
    """`start` ile başlayan ve ilk `end`e kadar süren bölümü siler; silinen metni döndürür."""
    text = read(path)
    if text.count(start) != 1:
        raise EditError(f"{path.name}: başlangıç işareti tek değil ya da yok: {start[:120]}")
    begin = text.index(start)
    stop = text.find(end, begin + len(start))
    if stop < 0:
        raise EditError(f"{path.name}: bitiş işareti bulunamadı: {end[:120]}")
    finish = stop if keep_end else stop + len(end)
    write(path, text[:begin] + text[finish:])
    return text[begin:finish]


def insert_before(path: Path, marker: str, new: str) -> None:
    """`marker`ın (tek olmalı) hemen önüne `new` ekler."""
    replace(path, marker, new + marker)


def delete(path: Path) -> None:
    if not path.exists():
        raise EditError(f"Silinecek dosya yok: {path}")
    path.unlink()


def run(command: list[str], cwd: Path) -> str:
    """Çözüm betiklerinde komut (ör. üreteç) çalıştırır; başarısızsa çıktıyla birlikte hata verir."""
    done = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
    if done.returncode != 0:
        raise EditError(
            f"Komut başarısız: {' '.join(command)}\n{done.stdout[-2000:]}{done.stderr[-2000:]}"
        )
    return done.stdout
