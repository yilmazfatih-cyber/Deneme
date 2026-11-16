"""Örneklerin ortak yardımcısı: betik hangi klasörden çalıştırılırsa çalıştırılsın paketi bulur.

Kullanım (her örneğin başında):  import _setup_path  # noqa: F401
`pip install -e .` ile kurulmuş ortamda gerekmez; kurulmadan da çalışsın diye vardır.
Genişletme: örneklerin paylaştığı yeni bir yardımcı (ör. ortak yazdırma biçimi) buraya eklenir.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
