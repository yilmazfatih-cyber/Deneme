"""Bulanık yineleme ayıklama (Türkçe normalleştirmeyle): aynı kaydın biraz farklı yazılmış
kopyalarını bulur.

Adımlar: (1) her değeri normalleştir: bozuk kodlamayı onar, Türkçe küçük harf, ASCII'ye indir,
yaygın kısaltmaları aç (mah. → mahallesi, cad. → caddesi, sk. → sokak, a.ş. → as), noktalama ve
fazla boşluğu at; (2) "sıralı komşuluk": kayıtları anahtara göre sırala, her kaydı sonraki
``window`` kayıtla karşılaştır (bir kez de ters çevrilmiş anahtarla; baştaki yazım hatası
için);
(3) benzerlik: sütun başına Jaro-Winkler ortalaması; eşiği geçen çiftleri birleşim-bul ile kümele.
Benzerlik işlevleri sıfırdan yazılmıştır ve testlerde elle hesaplanmış değerlerle sınanır.
Genişletme: yeni kısaltma için ``ABBREVIATIONS``e ekleyin; farklı bir benzerlik için
``similarity`` yerine kendi işlevinizi ``find_duplicates(..., scorer=…)`` ile verin.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from verihavuzu.kalite.clean import fix_mojibake
from verihavuzu.kalite.values import is_missing
from verihavuzu.text import fold_ascii, lower_tr

Row = dict[str, Any]
ABBREVIATIONS = {
    "mah": "mahallesi",
    "mh": "mahallesi",
    "cad": "caddesi",
    "cd": "caddesi",
    "sok": "sokak",
    "sk": "sokak",
    "bulv": "bulvari",
    "blv": "bulvari",
    "apt": "apartmani",
    "no": "no",
    "as": "as",
    "ltd": "limited",
    "sti": "sirketi",
    "tic": "ticaret",
    "san": "sanayi",
}
_NON_WORD = re.compile(r"[^0-9a-z]+")


def normalize_tr(value: Any) -> str:
    """Karşılaştırma için normal biçim: "  Ä°STANBUL Cad. " → "istanbul caddesi"."""
    if is_missing(value):
        return ""
    text = fold_ascii(lower_tr(fix_mojibake(str(value))))
    text = text.replace("a.s.", "as")  # "A.Ş." ASCII'ye indirgenince "a.s." olur
    tokens = [token for token in _NON_WORD.split(text) if token]
    return " ".join(ABBREVIATIONS.get(token, token) for token in tokens)


def levenshtein(a: str, b: str) -> int:
    """Düzenleme uzaklığı (ekleme, silme, değiştirme)."""
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ch_a in enumerate(a, start=1):
        current = [i]
        for j, ch_b in enumerate(b, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ch_a != ch_b))
            )
        previous = current
    return previous[-1]


def jaro(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    window = max(0, max(len(a), len(b)) // 2 - 1)
    matched_b = [False] * len(b)
    matches_a: list[str] = []
    for i, ch in enumerate(a):
        for j in range(max(0, i - window), min(len(b), i + window + 1)):
            if not matched_b[j] and b[j] == ch:
                matched_b[j] = True
                matches_a.append(ch)
                break
    if not matches_a:
        return 0.0
    matches_b = [b[j] for j in range(len(b)) if matched_b[j]]
    transpositions = sum(x != y for x, y in zip(matches_a, matches_b, strict=True)) / 2
    m = len(matches_a)
    return (m / len(a) + m / len(b) + (m - transpositions) / m) / 3


def jaro_winkler(a: str, b: str, prefix_weight: float = 0.1) -> float:
    """Jaro-Winkler benzerliği (0–1); ortak önek (en çok 4 harf) puanı artırır."""
    score = jaro(a, b)
    prefix = 0
    for x, y in zip(a[:4], b[:4], strict=False):
        if x != y:
            break
        prefix += 1
    return score + prefix * prefix_weight * (1 - score)


def similarity(first: Row, second: Row, columns: Sequence[str]) -> float:
    """Sütunların normalleştirilmiş değerleri üzerinde Jaro-Winkler ortalaması (boşlar atlanır)."""
    scores = []
    for column in columns:
        a, b = normalize_tr(first.get(column)), normalize_tr(second.get(column))
        if a and b:
            scores.append(jaro_winkler(a, b))
    return sum(scores) / len(scores) if scores else 0.0


@dataclass
class DuplicateReport:
    ciftler: list[tuple[int, int, float]]  # (satır, satır, puan) — satırlar 1'den başlar
    kumeler: list[list[int]]  # her küme: aynı kayıt sayılan satır numaraları


def _find(parent: list[int], index: int) -> int:
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = parent[index]
    return index


def find_duplicates(
    rows: Sequence[Row],
    columns: Sequence[str],
    *,
    threshold: float = 0.93,
    window: int = 8,
    scorer: Callable[[Row, Row, Sequence[str]], float] = similarity,
) -> DuplicateReport:
    """Bulanık yinelenen çiftleri ve kümeleri bulur."""
    keys = [" ".join(normalize_tr(row.get(c)) for c in columns) for row in rows]
    pairs: dict[tuple[int, int], float] = {}
    for ordering in (
        sorted(range(len(rows)), key=lambda i: keys[i]),
        sorted(range(len(rows)), key=lambda i: keys[i][::-1]),
    ):
        for position, i in enumerate(ordering):
            for j in ordering[position + 1 : position + 1 + window]:
                pair = (min(i, j), max(i, j))
                if pair not in pairs:
                    pairs[pair] = scorer(rows[pair[0]], rows[pair[1]], columns)
    parent = list(range(len(rows)))
    found = sorted((a + 1, b + 1, round(s, 4)) for (a, b), s in pairs.items() if s >= threshold)
    for a, b, _ in found:
        parent[_find(parent, a - 1)] = _find(parent, b - 1)
    clusters: dict[int, list[int]] = {}
    for index in range(len(rows)):
        clusters.setdefault(_find(parent, index), []).append(index + 1)
    return DuplicateReport(found, sorted(c for c in clusters.values() if len(c) > 1))


def deduplicate(
    rows: Sequence[Row], columns: Sequence[str], **options: Any
) -> tuple[list[Row], DuplicateReport]:
    """Her kümenin İLK satırını tutar, diğerlerini atar."""
    report = find_duplicates(rows, columns, **options)
    dropped = {number for cluster in report.kumeler for number in cluster[1:]}
    kept = [row for number, row in enumerate(rows, start=1) if number not in dropped]
    return kept, report
