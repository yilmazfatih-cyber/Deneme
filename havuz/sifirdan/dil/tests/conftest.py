"""Tüm testler için ortak ayar: hypothesis profilleri.

Hızlı denetimde (varsayılan) her özellik testi az sayıda ama belirlenimci örnekle koşar;
`python scripts/check.py --uzun` HAVUZ_UZUN=1 verir ve örnek sayısı artar.
`database=None`: hypothesis klasöre örnek veritabanı (.hypothesis/) yazmaz.
Genişletme: yeni bir profil gerekiyorsa aşağıya `register_profile` satırı ekleyin.
"""

from __future__ import annotations

import os

from hypothesis import HealthCheck, settings

settings.register_profile(
    "hizli",
    max_examples=150,
    derandomize=True,
    database=None,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.register_profile(
    "uzun",
    max_examples=2000,
    derandomize=True,
    database=None,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile("uzun" if os.environ.get("HAVUZ_UZUN") == "1" else "hizli")
