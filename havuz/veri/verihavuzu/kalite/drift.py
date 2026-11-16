"""İki veri kümesi arasında kayma: PSI (sayısal ve kategorik) ve iki örneklem KS testi — sıfırdan.

PSI = Σ (y_i − r_i) · ln(y_i / r_i); r: referans, y: yeni oranlar. Sayısal sütunda kutu sınırları
REFERANS kümenin yüzdeliklerinden alınır; boş kutu oranı ``eps`` ile kırpılır.
Yorum için yaygın kural (kesin eşik değildir): < 0,1 küçük · 0,1–0,25 orta · > 0,25 büyük kayma.
KS: D = sup |F₁(x) − F₂(x)|; p-değeri asimptotik Kolmogorov dağılımından (Numerical Recipes,
``ks_pvalue``) — küçük örneklemde yaklaşıktır. Testler elle hesaplanmış örneklerle karşılaştırır.
Genişletme: yeni bir ölçü (ör. Wasserstein) için ayrı bir işlev yazın ve ``drift_report`` içinde
sayısal dala ekleyin.
"""

from __future__ import annotations

import bisect
import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from itertools import pairwise
from typing import Any

from verihavuzu.kalite.profile import infer_type, quantile
from verihavuzu.kalite.values import is_missing, parse_number


@dataclass
class PsiResult:
    psi: float
    kutular: list[dict[str, Any]]
    yorum: str


@dataclass
class KsResult:
    d: float
    p_degeri: float
    n_referans: int
    n_yeni: int


def interpret_psi(value: float) -> str:
    if value < 0.1:
        return "küçük"
    return "orta" if value < 0.25 else "büyük"


def _psi_terms(
    ref: Sequence[float], new: Sequence[float], labels: Sequence[str], eps: float
) -> PsiResult:
    total, bins = 0.0, []
    for label, r, y in zip(labels, ref, new, strict=True):
        r_c, y_c = max(r, eps), max(y, eps)
        term = (y_c - r_c) * math.log(y_c / r_c)
        total += term
        bins.append({"kutu": label, "referans_orani": r, "yeni_oran": y, "katki": term})
    return PsiResult(total, bins, interpret_psi(total))


def psi_numeric(
    reference: Sequence[float], new: Sequence[float], *, bins: int = 10, eps: float = 1e-4
) -> PsiResult:
    """Sayısal PSI. Kutu sınırları referansın eşit aralıklı yüzdelikleri (yinelenenler atılır)."""
    if not reference or not new:
        raise ValueError("PSI için iki küme de boş olmamalı.")
    ordered = sorted(reference)
    edges = sorted({quantile(ordered, k / bins) for k in range(1, bins)})

    def shares(values: Sequence[float]) -> list[float]:
        counts = Counter(bisect.bisect_left(edges, v) for v in values)
        return [counts[i] / len(values) for i in range(len(edges) + 1)]

    labels = [f"≤ {edges[0]:g}"] + [f"({a:g}, {b:g}]" for a, b in pairwise(edges)]
    labels += [f"> {edges[-1]:g}"] if edges else []
    if not edges:
        labels = ["tümü"]
    return _psi_terms(shares(reference), shares(new), labels, eps)


def psi_categorical(
    reference: Sequence[str], new: Sequence[str], *, eps: float = 1e-4
) -> PsiResult:
    """Kategorik PSI: her kategori bir kutudur (yalnız bir kümede görülenler de dahil)."""
    if not reference or not new:
        raise ValueError("PSI için iki küme de boş olmamalı.")
    ref_counts, new_counts = Counter(reference), Counter(new)
    categories = sorted(set(ref_counts) | set(new_counts))
    return _psi_terms(
        [ref_counts[c] / len(reference) for c in categories],
        [new_counts[c] / len(new) for c in categories],
        categories,
        eps,
    )


def ks_statistic(first: Sequence[float], second: Sequence[float]) -> float:
    """İki örneklem KS istatistiği D (eşit değerler doğru işlenir)."""
    a, b = sorted(first), sorted(second)
    i = j = 0
    d = 0.0
    while i < len(a) and j < len(b):
        value = min(a[i], b[j])
        while i < len(a) and a[i] == value:
            i += 1
        while j < len(b) and b[j] == value:
            j += 1
        d = max(d, abs(i / len(a) - j / len(b)))
    return d


def ks_pvalue(d: float, n: int, m: int) -> float:
    """Asimptotik p-değeri: Q_KS(λ) = 2 Σ (−1)^(k−1) e^(−2k²λ²), λ = (√nₑ + 0,12 + 0,11/√nₑ)·D."""
    effective = math.sqrt(n * m / (n + m))
    lam = (effective + 0.12 + 0.11 / effective) * d
    if lam < 0.2:
        return 1.0
    total, sign = 0.0, 1.0
    for k in range(1, 101):
        term = sign * math.exp(-2.0 * k * k * lam * lam)
        total += term
        if abs(term) < 1e-12:
            break
        sign = -sign
    return max(0.0, min(1.0, 2.0 * total))


def ks_test(reference: Sequence[float], new: Sequence[float]) -> KsResult:
    if not reference or not new:
        raise ValueError("KS testi için iki küme de boş olmamalı.")
    d = ks_statistic(reference, new)
    return KsResult(d, ks_pvalue(d, len(reference), len(new)), len(reference), len(new))


def _numbers(values: Sequence[Any]) -> list[float]:
    parsed = (parse_number(str(v)) for v in values if not is_missing(v))
    return [float(n) for n in parsed if n is not None]


def drift_report(
    reference: Sequence[dict[str, Any]],
    new: Sequence[dict[str, Any]],
    columns: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Ortak sütunlar için kayma özeti: tür, eksik oranı farkı, PSI, (sayısalsa) KS."""
    names = list(columns) if columns else [c for c in reference[0] if c in new[0]]
    result: list[dict[str, Any]] = []
    for name in names:
        ref_values = [row.get(name) for row in reference]
        new_values = [row.get(name) for row in new]
        present = [str(v) for v in ref_values if not is_missing(v)]
        kind, _ = infer_type(present)
        item: dict[str, Any] = {
            "sutun": name,
            "tur": kind,
            "eksik_referans": sum(map(is_missing, ref_values)) / len(ref_values),
            "eksik_yeni": sum(map(is_missing, new_values)) / len(new_values),
        }
        if kind in ("tam_sayi", "ondalik"):
            ref_numbers, new_numbers = _numbers(ref_values), _numbers(new_values)
            item["psi"] = asdict(psi_numeric(ref_numbers, new_numbers))
            item["ks"] = asdict(ks_test(ref_numbers, new_numbers))
        elif kind in ("metin", "mantiksal", "kod") and len(set(present)) <= 50:
            item["psi"] = asdict(
                psi_categorical(present, [str(v) for v in new_values if not is_missing(v)])
            )
        else:
            item["not"] = "çok fazla farklı değer ya da tarih: PSI hesaplanmadı"
        result.append(item)
    return {"referans_satir": len(reference), "yeni_satir": len(new), "sutunlar": result}
