"""Birleşik fark ve yama testleri: difflib çıktısıyla aynılık, gidiş-dönüş, kayma, hatalar."""

from __future__ import annotations

import difflib
import shutil
import subprocess
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from fark import PatchError, apply_patch, diff_text, parse_patch, unified_diff

LINES = st.lists(st.sampled_from(["a\n", "b\n", "c\n", "ç\n", "\n", "uzun satır\n"]), max_size=25)


def as_text(lines: list[str], newline_at_end: bool) -> str:
    text = "".join(lines)
    return text if newline_at_end or not text else text.rstrip("\n") + ("" if text.strip() else "x")


@given(st.integers(min_value=0, max_value=40), st.data())
def test_single_region_change_matches_difflib(size: int, data: st.DataObject) -> None:
    a = [f"satır {i}\n" for i in range(size)]
    start = data.draw(st.integers(min_value=0, max_value=size))
    end = data.draw(st.integers(min_value=start, max_value=size))
    new = [f"yeni {i}\n" for i in range(data.draw(st.integers(min_value=0, max_value=4)))]
    b = a[:start] + new + a[end:]
    context = data.draw(st.integers(min_value=0, max_value=4))
    expected = list(difflib.unified_diff(a, b, "eski", "yeni", n=context))
    assert unified_diff(a, b, "eski", "yeni", context) == expected


@given(LINES, LINES, st.booleans(), st.booleans(), st.integers(min_value=0, max_value=3))
def test_patch_round_trip(
    a_lines: list[str], b_lines: list[str], a_nl: bool, b_nl: bool, context: int
) -> None:
    old, new = as_text(a_lines, a_nl), as_text(b_lines, b_nl)
    patch = diff_text(old, new, context=context)
    if old == new:
        assert patch == ""
        return
    assert apply_patch(old, patch) == new
    assert apply_patch(new, patch, reverse=True) == old


def test_patch_applies_with_offset() -> None:
    old = "".join(f"satır {i}\n" for i in range(1, 30))
    new = old.replace("satır 20\n", "yirmi\n")
    patch = diff_text(old, new)
    shifted = "başa eklenen\n" * 5 + old
    assert apply_patch(shifted, patch) == "başa eklenen\n" * 5 + new


def test_patch_failure_explains_what_and_where() -> None:
    old = "bir\niki\nüç\ndört\n"
    patch = diff_text(old, "bir\niki\nÜÇ\ndört\n")
    with pytest.raises(PatchError) as info:
        apply_patch("bir\nİKİ\nüç\ndört\n", patch)
    message = str(info.value)
    assert "1. parça uygulanamadı" in message and "satır 2" in message
    assert "'iki\\n'" in message and "'İKİ\\n'" in message


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ("merhaba\n", "başlığı bulunamadı"),
        ("@@ -1 +1 @@\n-a\n+b\n", "parçasından önce"),
        ("--- a\n+++ b\n@@ bozuk @@\n", "bozuk parça başlığı"),
        ("--- a\n+++ b\n@@ -1,2 +1,1 @@\n-a\n", "başlıkla uyuşmuyor"),
    ],
)
def test_parse_errors(patch: str, message: str) -> None:
    with pytest.raises(PatchError, match=message):
        apply_patch("a\nb\n", patch)


def test_multi_file_patch_and_git_noise() -> None:
    text = (
        "diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-1\n+2\n"
        "--- a/y\n+++ b/y\n@@ -1,0 +2 @@\n+son\n"
    )
    files = parse_patch(text)
    assert [(f.old_name, f.new_name, len(f.hunks)) for f in files] == [
        ("a/x", "b/x", 1),
        ("a/y", "b/y", 1),
    ]
    assert apply_patch("1\n", files[0]) == "2\n"
    assert apply_patch("ilk\n", files[1]) == "ilk\nson\n"


@pytest.mark.skipif(shutil.which("patch") is None, reason="GNU patch kurulu değil")
def test_gnu_patch_accepts_our_output(tmp_path: Path) -> None:
    old = "".join(f"satır {i}\n" for i in range(1, 15)) + "son satır"
    new = old.replace("satır 3\n", "ÜÇ\n").replace("son satır", "yeni son")
    target = tmp_path / "dosya.txt"
    target.write_text(old, encoding="utf-8")
    (tmp_path / "yama.diff").write_text(
        diff_text(old, new, "dosya.txt", "dosya.txt"), encoding="utf-8"
    )
    result = subprocess.run(
        ["patch", "-s", "dosya.txt", "yama.diff"], cwd=tmp_path, capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert target.read_text(encoding="utf-8") == new
