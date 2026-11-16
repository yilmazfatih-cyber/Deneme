"""Permütasyon önemi: "bu sütunu karıştırırsam model ne kadar kötüleşir?"

Fikir: model eğitildikten sonra SINAMA verisinde bir sütunun değerlerini satırlar arasında rastgele
karıştırırız; sütunun hedefle ilişkisi kopar ama dağılımı aynı kalır. Ana ölçütteki kötüleşme o
sütunun modele katkısıdır. Ağaçların "bölme kazancı" öneminin aksine çok kategorili sütunları
kayırmaz ve her model türünde aynı anlama gelir. Ham (CSV'deki) sütunlar karıştırılır; tarih
sütunundan türetilen sütunlar da birlikte bozulur.

Not: birbirine çok benzeyen iki sütun varsa biri karıştırıldığında model diğerini kullanır; ikisi
de önemsiz görünebilir. Bu yüzden önem "modelin neye dayandığını" gösterir, nedenselliği değil.
Genişletme: gerekmez; başka bir ölçüt için `metric` adını değiştirin.
"""

from __future__ import annotations

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.tablo.evaluation import TargetInfo, higher_is_better, model_output, score
from ml_temel.tablo.model import TabularModel


def permutation_importance(
    model: TabularModel,
    table: Table,
    y: Array,
    metric: str,
    info: TargetInfo,
    n_repeats: int,
    seed: int,
) -> list[dict[str, float | str]]:
    """Her girdi sütunu için (ortalama kötüleşme, standart sapma); büyükten küçüğe sıralı."""
    rng = np.random.default_rng(seed)
    sign = 1.0 if higher_is_better(metric) else -1.0
    base = score(metric, y, model_output(model, table, info), info)
    results: list[dict[str, float | str]] = []
    for column in model.input_columns:
        drops = []
        for _ in range(n_repeats):
            shuffled = table.with_column(column, table[column][rng.permutation(len(table))])
            value = score(metric, y, model_output(model, shuffled, info), info)
            drops.append(sign * (base - value))
        results.append({"sutun": column, "ort": float(np.mean(drops)), "std": float(np.std(drops))})
    return sorted(results, key=lambda item: -float(item["ort"]))
