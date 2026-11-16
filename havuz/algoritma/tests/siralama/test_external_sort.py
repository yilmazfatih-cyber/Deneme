from __future__ import annotations

import random
from pathlib import Path

import pytest

from algoritma.siralama.external_sort import external_sort


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def test_multi_pass_merge_matches_sorted(tmp_path: Path) -> None:
    rng = random.Random(42)
    alphabet = "abcçdefgğhıijklmnoöprsştuüvyz"
    lines = ["".join(rng.choice(alphabet) for _ in range(rng.randint(0, 6))) for _ in range(1000)]
    source = _write(tmp_path / "girdi.txt", "\n".join(lines) + "\n")
    work = tmp_path / "is"
    work.mkdir()
    runs = external_sort(source, tmp_path / "cikti.txt", chunk_lines=37, work_dir=work, fan_in=3)
    assert runs == 28  # ⌈1000 / 37⌉; fan_in=3 olduğundan birkaç birleştirme geçişi yapıldı
    result = (tmp_path / "cikti.txt").read_text(encoding="utf-8").split("\n")[:-1]
    assert result == sorted(lines)
    assert list(work.iterdir()) == []  # geçici koşu dosyaları silindi


def test_edge_cases(tmp_path: Path) -> None:
    empty = _write(tmp_path / "bos.txt", "")
    assert external_sort(empty, tmp_path / "o1.txt", chunk_lines=5, work_dir=tmp_path) == 0
    assert (tmp_path / "o1.txt").read_text(encoding="utf-8") == ""
    no_newline = _write(tmp_path / "son.txt", "b\na")  # son satırda \n yok
    external_sort(no_newline, tmp_path / "o2.txt", chunk_lines=1, work_dir=tmp_path)
    assert (tmp_path / "o2.txt").read_text(encoding="utf-8") == "a\nb\n"
    with pytest.raises(ValueError):
        external_sort(empty, tmp_path / "o3.txt", chunk_lines=0, work_dir=tmp_path)
