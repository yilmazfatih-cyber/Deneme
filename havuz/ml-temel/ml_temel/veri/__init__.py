"""veri — tohumlu sentetik veri üreteçleri (örnekler ve testler için; ağ gerekmez).

Genişletme: yeni üreteci `synthetic.py`'ye yazıp aşağıya ekleyin.
"""

from ml_temel.veri.synthetic import (
    make_blobs,
    make_churn_table,
    make_circles,
    make_classification,
    make_moons,
    make_regression,
    make_shapes,
)

__all__ = [
    "make_blobs",
    "make_churn_table",
    "make_circles",
    "make_classification",
    "make_moons",
    "make_regression",
    "make_shapes",
]
