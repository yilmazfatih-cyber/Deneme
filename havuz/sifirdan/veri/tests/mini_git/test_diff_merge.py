"""Myers farkı (en kısalık, uygulanabilirlik) ve üç yollu satır birleştirmenin özellikleri."""

from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from mini_git import edit_script, merge3, unified_diff
from mini_git.diff import lcs_length

LINES = st.lists(st.sampled_from([b"a\n", b"b\n", b"c\n", b"d\n", b"e"]), max_size=12)


def _apply(
    script: list[tuple[str, int | None, int | None]], a: list[bytes], b: list[bytes]
) -> list[bytes]:
    out: list[bytes] = []
    for op, i, j in script:
        if op == "=":
            assert i is not None and j is not None and a[i] == b[j]
            out.append(a[i])
        elif op == "+":
            assert j is not None
            out.append(b[j])
    return out


@given(LINES, LINES)
def test_myers_script_is_valid_and_minimal(a: list[bytes], b: list[bytes]) -> None:
    script = edit_script(a, b)
    assert _apply(script, a, b) == b
    assert [
        a[i] for op, i, _ in script if op != "+" and i is not None
    ] == a  # a'nın her satırı sırayla
    edits = sum(op != "=" for op, _, _ in script)
    assert edits == len(a) + len(b) - 2 * lcs_length(a, b)  # en kısa düzenleme betiği


def test_unified_diff_format() -> None:
    old = [f"satır {n}\n".encode() for n in range(1, 21)]
    new = list(old)
    new[1] = b"ikinci degisti\n"  # 2. satır değişti
    new.insert(15, b"yeni satir\n")  # 15. satırdan sonra ekleme
    # Değişiklikler arasında 12 değişmemiş satır var (> 2·3 bağlam) → iki ayrı parça (hunk).
    assert unified_diff(old, new, "a/f", "b/f") == [
        "--- a/f",
        "+++ b/f",
        "@@ -1,5 +1,5 @@",
        " satır 1",
        "-satır 2",
        "+ikinci degisti",
        " satır 3",
        " satır 4",
        " satır 5",
        "@@ -13,6 +13,7 @@",
        " satır 13",
        " satır 14",
        " satır 15",
        "+yeni satir",
        " satır 16",
        " satır 17",
        " satır 18",
    ]
    assert unified_diff([b"x"], [b"y"], "a/f", "b/f")[2:] == [
        "@@ -1 +1 @@",
        "-x",
        "\\ No newline at end of file",
        "+y",
        "\\ No newline at end of file",
    ]
    assert unified_diff([], [b"yeni\n"], "/dev/null", "b/f")[2] == "@@ -0,0 +1 @@"


@given(LINES, LINES)
def test_merge3_trivial_cases(base: list[bytes], other: list[bytes]) -> None:
    assert merge3(base, base, other, "HEAD", "dal") == (other, False)  # yalnız onlar değişti
    assert merge3(base, other, base, "HEAD", "dal") == (other, False)  # yalnız biz değiştik
    assert merge3(base, other, other, "HEAD", "dal") == (other, False)  # ikimiz de aynı değiştik


def test_merge3_combines_disjoint_changes_and_marks_conflicts() -> None:
    base = [f"{n}\n".encode() for n in range(1, 9)]
    ours, theirs = list(base), list(base)
    ours[1] = b"bizim 2\n"
    theirs[6] = b"onlarin 7\n"
    merged, conflict = merge3(base, ours, theirs, "HEAD", "dal")
    assert not conflict and merged[1] == b"bizim 2\n" and merged[6] == b"onlarin 7\n"
    theirs[1] = b"onlarin 2\n"
    merged, conflict = merge3(base, ours, theirs, "HEAD", "dal")
    assert conflict
    assert merged[:6] == [
        b"1\n",
        b"<<<<<<< HEAD\n",
        b"bizim 2\n",
        b"=======\n",
        b"onlarin 2\n",
        b">>>>>>> dal\n",
    ]
    assert merged[-2] == b"onlarin 7\n"  # çakışmasız parça yine birleşti
