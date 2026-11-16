"""Üç yollu birleştirme (diff3): ortak ata + iki değişik sürüm → birleşmiş metin + çakışmalar.

Yöntem (bzr/merge3 ile aynı): ata↔bizim ve ata↔onların eşleşen bloklarından, atanın HER İKİ
sürümde de aynen durduğu "eş" bölgeler bulunur. Aradaki her bölgede: yalnız bir taraf değiştiyse o
taraf alınır; iki taraf aynı değişikliği yaptıysa bir kez alınır; ikisi farklı değiştirdiyse
çakışma işaretleri yazılır:
    <<<<<<< bizim / (||||||| ortak — diff3 biçiminde) / ======= / >>>>>>> onların
Genişletme: çakışmayı kendiliğinden çözen bir strateji (ör. "bizimki kazanır") için `merge`'e
`strateji` parametresi ekleyin.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass

from .myers import matching_blocks

Region = tuple[str, int, int, int, int, int, int]  # (tür, ata1, ata2, a1, a2, b1, b2)


@dataclass
class MergeResult:
    text: str
    conflicts: int


def sync_regions(base: Sequence[str], a: Sequence[str], b: Sequence[str]) -> list[tuple[int, ...]]:
    """Atanın iki sürümde de eşleştiği bölgeler (ata1, ata2, a1, a2, b1, b2); sonda boş bölge."""
    a_blocks, b_blocks = matching_blocks(base, a), matching_blocks(base, b)
    ia = ib = 0
    regions: list[tuple[int, ...]] = []
    while ia < len(a_blocks) and ib < len(b_blocks):
        a_base, a_match, a_len = a_blocks[ia]
        b_base, b_match, b_len = b_blocks[ib]
        start, end = max(a_base, b_base), min(a_base + a_len, b_base + b_len)
        if start < end:
            a_sub, b_sub = a_match + start - a_base, b_match + start - b_base
            regions.append((start, end, a_sub, a_sub + end - start, b_sub, b_sub + end - start))
        if a_base + a_len < b_base + b_len:
            ia += 1
        else:
            ib += 1
    regions.append((len(base), len(base), len(a), len(a), len(b), len(b)))
    return regions


def merge_regions(base: Sequence[str], a: Sequence[str], b: Sequence[str]) -> Iterator[Region]:
    iz = ia = ib = 0
    for z1, z2, a1, a2, b1, b2 in sync_regions(base, a, b):
        if a1 > ia or b1 > ib:
            ours, theirs, old = a[ia:a1], b[ib:b1], base[iz:z1]
            if ours == theirs:
                yield ("aynı", iz, z1, ia, a1, ib, b1)
            elif ours == old:
                yield ("onlar", iz, z1, ia, a1, ib, b1)
            elif theirs == old:
                yield ("biz", iz, z1, ia, a1, ib, b1)
            else:
                yield ("çakışma", iz, z1, ia, a1, ib, b1)
        if z2 > z1:
            yield ("değişmedi", z1, z2, a1, a2, b1, b2)
        iz, ia, ib = z2, a2, b2


def merge(
    base: str,
    ours: str,
    theirs: str,
    labels: tuple[str, str, str] = ("bizim", "ortak", "onların"),
    show_base: bool = False,
) -> MergeResult:
    """Üç metni birleştirir. `show_base=True`: çakışmada ata metni de gösterilir (diff3 biçimi)."""
    z, a, b = base.splitlines(True), ours.splitlines(True), theirs.splitlines(True)
    out: list[str] = []
    conflicts = 0
    for kind, z1, z2, a1, a2, b1, b2 in merge_regions(z, a, b):
        if kind in ("değişmedi", "aynı", "biz"):
            out += a[a1:a2]
        elif kind == "onlar":
            out += b[b1:b2]
        else:
            conflicts += 1
            out.append(f"<<<<<<< {labels[0]}\n")
            out += ensure_newline(a[a1:a2])
            if show_base:
                out.append(f"||||||| {labels[1]}\n")
                out += ensure_newline(z[z1:z2])
            out.append("=======\n")
            out += ensure_newline(b[b1:b2])
            out.append(f">>>>>>> {labels[2]}\n")
    return MergeResult("".join(out), conflicts)


def ensure_newline(lines: Sequence[str]) -> list[str]:
    """Çakışma bloğundaki son satırda satır sonu yoksa ekler (işaretler kendi satırında kalsın)."""
    fixed = list(lines)
    if fixed and not fixed[-1].endswith("\n"):
        fixed[-1] += "\n"
    return fixed
