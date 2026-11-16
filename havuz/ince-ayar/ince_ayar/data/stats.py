"""Belirteç (token) uzunluğu istatistikleri ve kırpma uyarısı.

Kim kullanır: her görevin `dogrula` ve `egit --kuru` eylemi. Görev, örneklerinin belirteç
sayılarını kendi tokenizer'ıyla hesaplar; bu dosya yalnız sayıları özetler ve "azami uzunluğu
kaç yapmalıyım" sorusuna yanıt önerir.

Yüzdelikler "en yakın sıra" yöntemiyle hesaplanır (ara değer üretmez; sonuç her zaman veride
gerçekten bulunan bir uzunluktur).

Genişletme: yeni bir özet alanı için `LengthStats` içine alan, `length_stats` içine hesap ekleyin.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ince_ayar.console import format_table
from ince_ayar.messages import t

ROUND_TO = 32


@dataclass(frozen=True)
class LengthStats:
    count: int
    minimum: int
    mean: float
    p50: int
    p90: int
    p95: int
    p99: int
    maximum: int
    limit: int | None
    over_limit: int
    suggested_limit: int

    @property
    def over_ratio(self) -> float:
        return self.over_limit / self.count if self.count else 0.0


def percentile(sorted_values: list[int], q: float) -> int:
    """En yakın sıra yüzdeliği: q ∈ (0, 100]. Liste artan sırada olmalıdır."""
    if not sorted_values:
        return 0
    rank = max(1, math.ceil(q / 100.0 * len(sorted_values)))
    return sorted_values[rank - 1]


def suggest_limit(p99: int) -> int:
    """Örneklerin %99'unu sığdıran, 32'nin katına yuvarlanmış uzunluk."""
    return max(ROUND_TO, math.ceil(p99 / ROUND_TO) * ROUND_TO)


def length_stats(lengths: list[int], limit: int | None = None) -> LengthStats:
    """Belirteç sayılarını özetler; `limit` verilirse onu aşan örnekleri sayar."""
    ordered = sorted(lengths)
    count = len(ordered)
    p99 = percentile(ordered, 99)
    return LengthStats(
        count=count,
        minimum=ordered[0] if ordered else 0,
        mean=sum(ordered) / count if count else 0.0,
        p50=percentile(ordered, 50),
        p90=percentile(ordered, 90),
        p95=percentile(ordered, 95),
        p99=p99,
        maximum=ordered[-1] if ordered else 0,
        limit=limit,
        over_limit=sum(1 for value in ordered if limit is not None and value > limit),
        suggested_limit=suggest_limit(p99),
    )


def render_stats(stats: LengthStats, title: str) -> str:
    """İstatistikleri tablo + (gerekiyorsa) kırpma uyarısı olarak yazar."""
    table = format_table(
        ["örnek", "en az", "ortalama", "p50", "p90", "p95", "p99", "en çok"],
        [
            [
                stats.count,
                stats.minimum,
                f"{stats.mean:.1f}",
                stats.p50,
                stats.p90,
                stats.p95,
                stats.p99,
                stats.maximum,
            ]
        ],
    )
    lines = [title, table]
    if stats.limit is not None and stats.over_limit:
        lines.append(
            t(
                "istatistik.kirpma",
                sayi=stats.over_limit,
                oran=f"{stats.over_ratio:.1%}",
                sinir=stats.limit,
                oneri=stats.suggested_limit,
            )
        )
    elif stats.limit is not None:
        lines.append(t("istatistik.sigiyor", sinir=stats.limit))
    return "\n".join(lines)
