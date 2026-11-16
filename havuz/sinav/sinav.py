#!/usr/bin/env python3
"""Kod ajanı sınavı — komut satırı girişi. Yalnız Python standart kütüphanesi (3.11+) gerekir.

Kullanım (depo kökünden):
  python havuz/sinav/sinav.py liste
  python havuz/sinav/sinav.py hazirla <gorev> <klasor>
  python havuz/sinav/sinav.py puanla <klasor> --etiket <model>
  python havuz/sinav/sinav.py rapor
  python havuz/sinav/sinav.py dogrula

Ayrıntı: README.md (sahibi için), AGENTS.md (yeni görev eklemek için).
Genişletme: komutlar exam/cli.py'dedir; bu dosya yalnız onu çağırır.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from exam.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
