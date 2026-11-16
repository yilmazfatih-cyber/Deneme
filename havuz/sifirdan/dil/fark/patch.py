"""Yama: birleşik fark metnini ayrıştırma ve bir metne uygulama (isteğe bağlı ters yönde).

Her parçanın (hunk) "eski" satırları (bağlam + silinen) metinde aranır: önce başlıktaki satırda,
tutmazsa en yakın konumdan başlayarak tüm metinde (GNU patch'in "kayma/offset" davranışı). Hiçbir
yerde tutmazsa hangi parçanın, hangi satırda, ne beklenip ne bulunduğunu söyleyen `PatchError`.
Parçalar sırayla ve çakışmadan uygulanır. `\\ No newline at end of file` doğru işlenir.
Genişletme: bağlam satırlarını gevşek eşleyen "fuzz" seçeneği için `locate` içine bir dal ekleyin.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


class PatchError(ValueError):
    """Yama ayrıştırılamadı ya da uygulanamadı (ileti nerede ve neden olduğunu söyler)."""


@dataclass
class Hunk:
    old_start: int
    old_len: int
    new_start: int
    new_len: int
    lines: list[tuple[str, str]] = field(default_factory=list)  # (" " | "-" | "+", satır)

    def old_lines(self) -> list[str]:
        return [text for op, text in self.lines if op != "+"]

    def new_lines(self) -> list[str]:
        return [text for op, text in self.lines if op != "-"]

    def reversed(self) -> Hunk:
        swap = {"-": "+", "+": "-", " ": " "}
        lines = [(swap[op], text) for op, text in self.lines]
        return Hunk(self.new_start, self.new_len, self.old_start, self.old_len, lines)


@dataclass
class FilePatch:
    old_name: str
    new_name: str
    hunks: list[Hunk] = field(default_factory=list)


def parse_patch(text: str) -> list[FilePatch]:
    """Birleşik fark metnini dosya yamalarına ayırır (birden çok dosya olabilir)."""
    files: list[FilePatch] = []
    lines = text.splitlines(True)
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("--- ") and i + 1 < len(lines) and lines[i + 1].startswith("+++ "):
            files.append(FilePatch(line[4:].rstrip("\n"), lines[i + 1][4:].rstrip("\n")))
            i += 2
        elif line.startswith("@@"):
            if not files:
                raise PatchError(f"satır {i + 1}: '@@' parçasından önce '---'/'+++' başlığı yok")
            i = parse_hunk(lines, i, files[-1])
        else:
            i += 1  # "diff --git", "index …" gibi açıklama satırları atlanır
    if not files:
        raise PatchError("yama metninde '--- / +++' başlığı bulunamadı")
    return files


def parse_hunk(lines: list[str], i: int, target: FilePatch) -> int:
    header = HUNK.match(lines[i])
    if header is None:
        raise PatchError(f"satır {i + 1}: bozuk parça başlığı: {lines[i].rstrip()!r}")
    old_len = int(header.group(2)) if header.group(2) is not None else 1
    new_len = int(header.group(4)) if header.group(4) is not None else 1
    hunk = Hunk(int(header.group(1)), old_len, int(header.group(3)), new_len)
    i += 1
    old_seen = new_seen = 0
    while i < len(lines) and (
        old_seen < old_len or new_seen < new_len or lines[i].startswith("\\")
    ):
        line = lines[i]
        if line.startswith("\\"):
            if hunk.lines:  # önceki satırın sonunda "\n" yok
                op, text = hunk.lines[-1]
                hunk.lines[-1] = (op, text.removesuffix("\n"))
        elif line[:1] in (" ", "-", "+"):
            op = line[0]
            hunk.lines.append((op, line[1:]))
            old_seen += op != "+"
            new_seen += op != "-"
        elif line in ("\n", ""):  # bazı düzenleyiciler boş bağlam satırının boşluğunu siler
            hunk.lines.append((" ", "\n"))
            old_seen += 1
            new_seen += 1
        else:
            break
        i += 1
    if old_seen != old_len or new_seen != new_len:
        raise PatchError(
            f"parça (@@ -{hunk.old_start},{old_len} …) başlıkla uyuşmuyor: "
            f"{old_len} eski / {new_len} yeni satır bekleniyordu, {old_seen} / {new_seen} bulundu"
        )
    target.hunks.append(hunk)
    return i


def locate(lines: list[str], wanted: list[str], guess: int, floor: int) -> int | None:
    """`wanted` satırlarının `floor` sonrasında `guess`'e en yakın başladığı konum."""
    limit = len(lines) - len(wanted)
    for distance in range(max(guess - floor, limit - guess) + 1):
        for pos in (guess - distance, guess + distance):
            if floor <= pos <= limit and lines[pos : pos + len(wanted)] == wanted:
                return pos
    return None


def apply_patch(text: str, patch: str | FilePatch, reverse: bool = False) -> str:
    """Yamayı metne uygular; `reverse=True` yamayı geri alır (yeni → eski)."""
    file_patch = patch if isinstance(patch, FilePatch) else parse_patch(patch)[0]
    lines = text.splitlines(True)
    result: list[str] = []
    cursor = 0  # `lines` içinde henüz kopyalanmamış ilk satır
    shift = 0  # önceki parçaların kayması
    for number, raw in enumerate(file_patch.hunks, start=1):
        hunk = raw.reversed() if reverse else raw
        wanted = hunk.old_lines()
        guess = max(hunk.old_start - 1 + (0 if hunk.old_len else 1) + shift, cursor)
        pos = locate(lines, wanted, guess, cursor)
        if pos is None:
            raise PatchError(describe_failure(number, hunk, lines, guess))
        shift = pos - (hunk.old_start - 1 + (0 if hunk.old_len else 1))
        result += lines[cursor:pos]
        result += hunk.new_lines()
        cursor = pos + len(wanted)
    result += lines[cursor:]
    return "".join(result)


def describe_failure(number: int, hunk: Hunk, lines: list[str], guess: int) -> str:
    wanted = hunk.old_lines()
    for offset, expected in enumerate(wanted):
        found = lines[guess + offset] if guess + offset < len(lines) else "(dosya sonu)"
        if found != expected:
            return (
                f"{number}. parça uygulanamadı (beklenen satır {guess + offset + 1}): "
                "bağlam tutmuyor. "
                f"Beklenen: {expected!r}, bulunan: {found!r}. Dosya yama yapıldıktan sonra "
                "değişmiş ya da yama başka bir dosya için olabilir."
            )
    return f"{number}. parça uygulanamadı: satırlar dosyada bulunamadı"
