"""bulanik_arama — Türkçe normalleştirmeli bulanık arama: yazım hatasına, büyük/küçük harfe, ç/c ş/s ı/i
farkına dayanıklı. Levenshtein ve Damerau (bitişik harf yer değiştirmesi) uzaklığı, trigram benzerliği, puanlama
ve sıralama.

Kullanım:
    fuzzy_search("isparta", ["Isparta", "Iğdır", "Sparta FK"])          # [FuzzyResult(item="Isparta", score=1.0, index=0), …]
    fuzzy_search("kadikoy", kisiler, key=lambda k: k.ilce, limit=5)    # nesne listesinde alanla
    damerau_levenshtein("ankra", "ankara")                              # 1
    trigram_similarity("Çağrı Merkezi", "cagri merkez")                 # 0…1

Puan (0–1): tam eşleşme 1 · başta eşleşme 0,9+ · bir sözcüğün başında 0,8+ · içinde 0,7+ · değilse en iyi sözcük
benzerliği (Damerau) ile trigram benzerliğinin büyüğü × 0,7. Eşit puanda listedeki sıra korunur.

Sınırlar: Uzaklıklar kod noktası üzerinden hesaplanır. Damerau, "kısıtlı" (OSA) türüdür. Her aramada liste baştan
taranır (O(n·m)); on binlerce kayıtta ön dizin (trigram indeksi) kurun. Normalleştirme bu dosyadadır (turkce
modülüne bağımlı değildir).

Genişletme: Yeni puan kuralı `fuzzy_score` içine, sırası belli bir `if` olarak eklenir; TypeScript eşine
(ts/src/bulanik_arama.ts) aynı sayılarla eklenir ve `vektorler/bulanik_arama.json`'a örnek yazılır.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

__all__ = [
    "FuzzyResult",
    "damerau_levenshtein",
    "fuzzy_score",
    "fuzzy_search",
    "levenshtein",
    "normalize_text",
    "trigram_similarity",
    "trigrams",
]

T = TypeVar("T")


@dataclass(frozen=True)
class FuzzyResult(Generic[T]):
    item: T
    score: float
    index: int


def normalize_text(text: str) -> str:
    """Arama için normalleştirir: Türkçe küçük harf, işaretsiz, harf/rakam dışı → boşluk, tek boşluk."""
    lower = (
        unicodedata.normalize("NFC", text).replace("İ", "i").replace("I", "ı").lower()
    )  # harf: İ/I elle
    out: list[str] = []
    for ch in unicodedata.normalize("NFD", lower):
        if unicodedata.category(ch).startswith("M"):
            continue
        folded = "i" if ch == "ı" else ch
        out.append(folded if folded.isalnum() else " ")
    words = unicodedata.normalize("NFC", "".join(out)).split(" ")
    return " ".join(word for word in words if word)


def levenshtein(a: str, b: str, max_distance: int | None = None) -> int:
    """Levenshtein uzaklığı. `max_distance` aşılırsa erken çıkar ve max_distance + 1 döner."""
    if max_distance is not None and abs(len(a) - len(b)) > max_distance:
        return max_distance + 1
    previous = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        current = [i]
        row_min = i
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            value = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            current.append(value)
            row_min = min(row_min, value)
        if max_distance is not None and row_min > max_distance:
            return max_distance + 1
        previous = current
    distance = previous[len(b)]
    return max_distance + 1 if max_distance is not None and distance > max_distance else distance


def damerau_levenshtein(a: str, b: str) -> int:
    """Kısıtlı Damerau-Levenshtein (OSA): bitişik iki harfin yer değiştirmesi 1 işlem sayılır."""
    d = [
        [j if i == 0 else i if j == 0 else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)
    ]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            value = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                value = min(value, d[i - 2][j - 2] + 1)
            d[i][j] = value
    return d[len(a)][len(b)]


def trigrams(text: str) -> list[str]:
    """Normalleştirilmiş metnin trigramları (sözcük başına "  söz " dolgulu; pg_trgm gibi), sıralı ve tekil."""
    found: set[str] = set()
    for word in normalize_text(text).split(" "):
        if word:
            padded = f"  {word} "
            found.update(padded[i : i + 3] for i in range(len(padded) - 2))
    return sorted(found)


def trigram_similarity(a: str, b: str) -> float:
    """Trigram Jaccard benzerliği: |A∩B| / |A∪B| (0–1). İkisi de boşsa 0."""
    ta = set(trigrams(a))
    tb = trigrams(b)
    if not ta and not tb:
        return 0.0
    common = sum(1 for gram in tb if gram in ta)
    return common / (len(ta) + len(tb) - common)


def _edit_similarity(a: str, b: str) -> float:
    longest = max(len(a), len(b))
    return 0.0 if longest == 0 else 1 - damerau_levenshtein(a, b) / longest


def fuzzy_score(query: str, target: str) -> float:
    """Sorgunun hedefe benzerlik puanı (0–1); kurallar dosya başında."""
    q = normalize_text(query)
    t = normalize_text(target)
    if not q or not t:
        return 0.0
    if q == t:
        return 1.0
    ratio = len(q) / len(t)
    if t.startswith(q):
        return 0.9 + 0.09 * ratio
    words = t.split(" ")
    if any(word.startswith(q) for word in words):
        return 0.8 + 0.09 * ratio
    if q in t:
        return 0.7 + 0.09 * ratio
    best = _edit_similarity(q, t)
    for word in words:
        best = max(best, _edit_similarity(q, word))
    return max(best, trigram_similarity(q, t)) * 0.7


def fuzzy_search(
    query: str,
    items: Sequence[T],
    *,
    key: Callable[[T], str] | None = None,
    limit: int = 10,
    threshold: float = 0.3,
) -> list[FuzzyResult[T]]:
    """Listede arar; puanı `threshold`'dan yüksek olanları puana göre (eşitlikte liste sırasıyla) döner."""
    get = key or str
    scored = [
        FuzzyResult(item, fuzzy_score(query, get(item)), index) for index, item in enumerate(items)
    ]
    hits = [result for result in scored if result.score >= threshold]
    hits.sort(key=lambda result: (-result.score, result.index))
    return hits[:limit]
