"""Ajanın ne kadar değişiklik yaptığı: eklenen/silinen/değişen dosya ve satır sayıları.

Başlangıç anlık görüntüsüyle (tree.Snapshot) şimdiki kopya karşılaştırılır; bağımlılık ve önbellek
klasörleri sayılmaz. İkili dosyalar satır sayısına girmez, yalnız dosya sayısına girer.
Genişletme: yeni bir ölçü (ör. yalnız test satırları) için `DiffStats`'a alan ve `diff_stats`'a sayaç ekleyin.
"""

from __future__ import annotations

import difflib
from dataclasses import asdict, dataclass, field
from pathlib import Path

from exam.tree import Manifest, Snapshot, file_digest, iter_files, text_of


@dataclass
class DiffStats:
    yeni_dosya: int = 0
    degisen_dosya: int = 0
    silinen_dosya: int = 0
    eklenen_satir: int = 0
    silinen_satir: int = 0
    dosyalar: list[str] = field(default_factory=list)

    @property
    def toplam_dosya(self) -> int:
        return self.yeni_dosya + self.degisen_dosya + self.silinen_dosya

    def as_dict(self) -> dict[str, object]:
        return {**asdict(self), "toplam_dosya": self.toplam_dosya}

    def short(self) -> str:
        return (
            f"{self.toplam_dosya} dosya (yeni {self.yeni_dosya}, değişen {self.degisen_dosya}, "
            f"silinen {self.silinen_dosya}), +{self.eklenen_satir} −{self.silinen_satir} satır"
        )


def _count(old: str, new: str) -> tuple[int, int]:
    added = removed = 0
    for line in difflib.unified_diff(old.splitlines(), new.splitlines(), lineterm="", n=0):
        if line.startswith("+") and not line.startswith("+++"):
            added += 1
        elif line.startswith("-") and not line.startswith("---"):
            removed += 1
    return added, removed


def diff_stats(root: Path, manifest: Manifest, snapshot: Snapshot) -> DiffStats:
    stats = DiffStats()
    current = set(iter_files(root))
    for rel, digest in sorted(manifest.items()):
        if rel not in current:
            stats.silinen_dosya += 1
            stats.dosyalar.append(f"- {rel}")
            old = text_of(snapshot.read(rel))
            stats.silinen_satir += len(old.splitlines()) if old else 0
            continue
        if file_digest(root / rel) == digest:
            continue
        stats.degisen_dosya += 1
        stats.dosyalar.append(f"~ {rel}")
        old = text_of(snapshot.read(rel))
        new = text_of((root / rel).read_bytes())
        if old is not None and new is not None:
            added, removed = _count(old, new)
            stats.eklenen_satir += added
            stats.silinen_satir += removed
    for rel in sorted(current - set(manifest)):
        stats.yeni_dosya += 1
        stats.dosyalar.append(f"+ {rel}")
        new = text_of((root / rel).read_bytes())
        stats.eklenen_satir += len(new.splitlines()) if new else 0
    return stats
