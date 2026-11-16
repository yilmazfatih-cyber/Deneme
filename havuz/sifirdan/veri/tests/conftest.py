"""Bütün testlerin ortak ayarı: Hypothesis profilleri.

- "hizli" (varsayılan): az örnek, belirlenimci (derandomize), süre sınırı yok (makine paylaşımlı
  olabilir).
- "uzun": `SIFIRDAN_UZUN=1` iken (yani `python scripts/check.py --uzun`) çok daha fazla örnek.

Genişletme: bir testte örnek sayısını elle sabitlemeyin; profil belirlesin. Uzun rastgele döngüler
için `tests/yardimci.py` içindeki `seed_count` işlevini kullanın.
"""

from __future__ import annotations

import os

from hypothesis import HealthCheck, settings

_COMMON = {
    "deadline": None,
    "derandomize": True,
    "database": None,
    "suppress_health_check": [HealthCheck.too_slow, HealthCheck.data_too_large],
}

settings.register_profile("hizli", max_examples=40, **_COMMON)  # type: ignore[arg-type]
settings.register_profile("uzun", max_examples=400, **_COMMON)  # type: ignore[arg-type]
settings.load_profile("uzun" if os.environ.get("SIFIRDAN_UZUN") == "1" else "hizli")
