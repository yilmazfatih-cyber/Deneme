"""Ortak çekirdeği (anthropic-skills/sifirdan/beceri_kiti) içe aktarılabilir kılar.

Çekirdeği kopyalamak yerine ona yol veriyoruz: bu dalın derslerinden biri "tek doğruluk
kaynağı" (single source of truth). Yol sona eklenir; bu klasördeki modülleri gölgelemez.
"""

import sys
from pathlib import Path

CEKIRDEK = Path(__file__).resolve().parents[2] / 'anthropic-skills' / 'sifirdan'
if str(CEKIRDEK) not in sys.path:
    sys.path.append(str(CEKIRDEK))
