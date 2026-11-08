"""Etiket uyumu: eksen başına Cohen κ (ADR-004 hedefi κ ≥ 0,80) ve denetim örneklemi."""

from __future__ import annotations

import math
import random
from collections import Counter
from collections.abc import Sequence

from moda_radar.sema import NitelikKaydi

HEDEF_KAPPA = 0.80


def cohen_kappa(a: Sequence[str], b: Sequence[str]) -> float:
    """İki etiketleyicinin aynı öğelere verdiği etiketler için Cohen κ. Boş girdi → nan.

    Beklenen uyum 1 ise (iki taraf da hep aynı tek değeri vermiş) gözlenen uyum tamsa 1, değilse 0 döner.
    """
    if len(a) != len(b):
        raise ValueError("etiket listeleri aynı uzunlukta olmalı")
    n = len(a)
    if n == 0:
        return math.nan
    po = sum(x == y for x, y in zip(a, b, strict=True)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in ca) / (n * n)
    if pe >= 1.0:
        return 1.0 if po == 1.0 else 0.0
    return (po - pe) / (1 - pe)


def ciftler(
    kayitlar_a: Sequence[NitelikKaydi], kayitlar_b: Sequence[NitelikKaydi]
) -> list[tuple[NitelikKaydi, NitelikKaydi]]:
    """Aynı (kaynak URL, parca_id) taşıyan kayıt çiftleri; A sırasıyla."""
    b_dizin = {(k.kaynak.url, k.parca_id): k for k in kayitlar_b}
    return [(k, b_dizin[(k.kaynak.url, k.parca_id)]) for k in kayitlar_a if (k.kaynak.url, k.parca_id) in b_dizin]


def eksen_uyumu(kayitlar_a: Sequence[NitelikKaydi], kayitlar_b: Sequence[NitelikKaydi]) -> dict[str, float]:
    """Eksen başına κ (aynı parca_id'li çiftler üzerinden). Çift yoksa boş sözlük."""
    eslesen = ciftler(kayitlar_a, kayitlar_b)
    if not eslesen:
        return {}
    eksenler = list(eslesen[0][0].eksen_degerleri())
    return {
        e: cohen_kappa([x.eksen_degerleri()[e] for x, _ in eslesen], [y.eksen_degerleri()[e] for _, y in eslesen])
        for e in eksenler
    }


def denetim_ornekle[T](kayitlar: Sequence[T], oran: float = 0.05, tohum: int = 7) -> list[T]:
    """Tekrarlanabilir rastgele örneklem; boş değilse en az 1 öğe. Girdi sırası korunur."""
    if not kayitlar or oran <= 0:
        return []
    n = min(len(kayitlar), max(1, round(len(kayitlar) * oran)))
    secilen = set(random.Random(tohum).sample(range(len(kayitlar)), n))
    return [k for i, k in enumerate(kayitlar) if i in secilen]
