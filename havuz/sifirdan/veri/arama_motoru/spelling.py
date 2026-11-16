"""Yazım önerisi ("bunu mu demek istediniz?") ve otomatik tamamlama.

Düzenleme uzaklığı: en iyi hizalama (OSA) — ekleme, silme, değiştirme ve YAN YANA iki harfin yer
değiştirmesi 1 sayılır ("kitpa" → "kitap" = 1). Sınır aşılınca hesap erken kesilir.

Genişletme: çok büyük sözlüklerde her sözcüğe bakmak yavaşlar; BK-ağacı ya da "silme komşuluğu"
(SymSpell) dizini kurun. Türkçe klavyeye özgü karışıklıklar (ı/i, ş/s) için değiştirme bedelini
0.5 yapan ağırlıklı bir uzaklık deneyin.
"""

from __future__ import annotations

from collections import Counter

from .text import lower_tr


def edit_distance(a: str, b: str, limit: int | None = None) -> int:
    """OSA uzaklığı; `limit` verilirse ve aşılırsa limit + 1 döner (erken kesme)."""
    if limit is not None and abs(len(a) - len(b)) > limit:
        return limit + 1
    previous_previous: list[int] = []
    previous = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        current = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                current[j] = min(current[j], previous_previous[j - 2] + 1)
        if limit is not None and min(current) > limit:
            return limit + 1
        previous_previous, previous = previous, current
    if limit is not None and previous[-1] > limit:
        return limit + 1  # erken kesme tetiklenmese de sözleşme aynı: "sınırı aştı"
    return previous[-1]


def closest_word(
    word: str, words: Counter[str], stems: dict[str, tuple[str, int]] | None = None
) -> str | None:
    """Sözlükteki en yakın sözcük (önce uzaklık, sonra sıklık, sonra alfabe); yoksa None.

    `stems` (kök → (en sık yüzey biçimi, sıklık)) verilirse köklere de bakılır: "kitpa" yüzey
    sözcüklerin hiçbirine yakın değilse bile "kitap" köküne yakındır → "kitaplar" önerilir.
    """
    word = lower_tr(word)
    limit = 1 if len(word) <= 4 else 2
    candidates = [(candidate, candidate, count) for candidate, count in words.items()]
    candidates += [(stem, surface, count) for stem, (surface, count) in (stems or {}).items()]
    best: tuple[int, int, str] | None = None
    for compared, surface, count in candidates:
        distance = edit_distance(word, compared, limit)
        if 0 < distance <= limit:
            key = (distance, -count, surface)
            if best is None or key < best:
                best = key
    return None if best is None else best[2]


def completions(prefix: str, words: Counter[str], limit: int = 5) -> list[str]:
    """Ön eki tutan sözcükler, en sık önce."""
    prefix = lower_tr(prefix)
    matches = [(count, word) for word, count in words.items() if word.startswith(prefix)]
    matches.sort(key=lambda item: (-item[0], item[1]))
    return [word for _, word in matches[:limit]]
