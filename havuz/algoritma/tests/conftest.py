"""Ortak test ayarları: hypothesis profilleri.

Özellik testleri belirlenimcidir (`derandomize=True`: tohum, test fonksiyonundan türetilir), yani
aynı kod her koşuda aynı örnekleri görür. `python scripts/check.py --uzun` daha çok örnek dener
(`ALGORITMA_HYPOTHESIS=uzun`).
Genişletme: yeni profil gerekiyorsa aşağıya bir `register_profile` çağrısı ekleyin.
"""

from __future__ import annotations

import os

from hypothesis import HealthCheck, settings

_QUIET = [HealthCheck.too_slow, HealthCheck.data_too_large, HealthCheck.filter_too_much]

settings.register_profile(
    "hizli",
    max_examples=40,
    derandomize=True,
    deadline=None,
    database=None,
    suppress_health_check=_QUIET,
)
settings.register_profile(
    "uzun",
    max_examples=300,
    derandomize=True,
    deadline=None,
    database=None,
    suppress_health_check=_QUIET,
)
settings.load_profile(os.environ.get("ALGORITMA_HYPOTHESIS", "hizli"))
