"""Birleştirme: ortak ata (merge base), satır düzeyinde üç yollu birleştirme (diff3) ve ağaç
birleştirme.

diff3: taban→bizim ve taban→onların Myers eşleşmeleri bulunur. Üç dosyada da DEĞİŞMEMİŞ taban
satırları "sabit noktalar"dır; aralarındaki her parça için:
    bizim == taban → onlarınki · onların == taban → bizimki · bizim == onların → bizimki · yoksa
    ÇAKIŞMA
Çakışma, git'in biçimiyle yazılır:
    <<<<<<< HEAD / bizim satırlar / ======= / onların satırlar / >>>>>>> dal

Genişletme: çapraz (criss-cross) geçmişte birden çok en iyi ata olabilir; şimdi en yenisi seçilir.
Git'in "recursive" stratejisi ataları önce kendi aralarında birleştirir.
"""

from __future__ import annotations

from collections.abc import Sequence

from .diff import edit_script
from .repo import FlatTree, Repository


def ancestors(repo: Repository, sha: str) -> set[str]:
    """`sha` ve bütün ataları."""
    seen: set[str] = set()
    stack = [sha]
    while stack:
        current = stack.pop()
        if current not in seen:
            seen.add(current)
            stack.extend(repo.objects.read_commit(current).parents)
    return seen


def merge_base(repo: Repository, ours: str, theirs: str) -> str | None:
    common = ancestors(repo, ours) & ancestors(repo, theirs)
    best = [c for c in common if not any(c != o and c in ancestors(repo, o) for o in common)]
    if not best:
        return None
    return max(best, key=lambda sha: (repo.objects.read_commit(sha).timestamp, sha))


def _matches(base: Sequence[bytes], other: Sequence[bytes]) -> dict[int, int]:
    return {
        i: j
        for op, i, j in edit_script(base, other)
        if op == "=" and i is not None and j is not None
    }


def merge3(
    base: list[bytes], ours: list[bytes], theirs: list[bytes], our_label: str, their_label: str
) -> tuple[list[bytes], bool]:
    """(birleşmiş satırlar, çakışma_var_mı)."""
    to_ours, to_theirs = _matches(base, ours), _matches(base, theirs)
    stable = [b for b in range(len(base)) if b in to_ours and b in to_theirs]
    result: list[bytes] = []
    conflict = False
    i = j = k = 0
    for b in [*stable, None]:
        end_b, end_o, end_t = (
            (len(base), len(ours), len(theirs)) if b is None else (b, to_ours[b], to_theirs[b])
        )
        chunk_base, chunk_ours, chunk_theirs = base[i:end_b], ours[j:end_o], theirs[k:end_t]
        if chunk_ours == chunk_base:
            result += chunk_theirs
        elif chunk_theirs == chunk_base or chunk_ours == chunk_theirs:
            result += chunk_ours
        else:
            conflict = True
            result += [f"<<<<<<< {our_label}\n".encode(), *_terminated(chunk_ours)]
            result += [b"=======\n", *_terminated(chunk_theirs)]
            result += [f">>>>>>> {their_label}\n".encode()]
        if b is not None:
            result.append(base[b])
            i, j, k = b + 1, to_ours[b] + 1, to_theirs[b] + 1
    return result, conflict


def _terminated(lines: list[bytes]) -> list[bytes]:
    """İşaret satırından önce son satırın satır sonu olsun."""
    if lines and not lines[-1].endswith(b"\n"):
        return [*lines[:-1], lines[-1] + b"\n"]
    return lines


def merge_trees(
    repo: Repository,
    base: FlatTree,
    ours: FlatTree,
    theirs: FlatTree,
    labels: tuple[str, str],
) -> tuple[FlatTree, dict[str, bytes], list[str]]:
    """(sonuç index'i, çalışma ağacına yazılacak çakışmalı içerikler, çakışan yollar).

    Çakışan yolda index BİZİM sürümü tutar; işaretli içerik yalnız çalışma ağacına yazılır.
    """
    merged: FlatTree = {}
    conflicted_content: dict[str, bytes] = {}
    conflicts: list[str] = []
    for path in sorted(set(base) | set(ours) | set(theirs)):
        b, o, t = base.get(path), ours.get(path), theirs.get(path)
        if o == t or t == b:
            chosen = o
        elif o == b:
            chosen = t
        elif o is None or t is None:  # bir taraf sildi, öteki değiştirdi
            conflicts.append(path)
            survivor = o or t
            assert survivor is not None
            conflicted_content[path] = repo.objects.read(survivor[1])[1]
            chosen = o
        else:
            lines = [
                repo.objects.read(entry[1])[1].splitlines(keepends=True) if entry else []
                for entry in (b, o, t)
            ]
            content, clash = merge3(lines[0], lines[1], lines[2], *labels)
            body = b"".join(content)
            mode = o[0] if o[0] == t[0] or (b and t[0] == b[0]) else t[0]
            if clash:
                conflicts.append(path)
                conflicted_content[path] = body
                chosen = o
            else:
                chosen = (mode, repo.objects.write("blob", body))
        if chosen is not None:
            merged[path] = chosen
    return merged, conflicted_content, conflicts
