"""Ağ isteyen duman testlerini koşturur: gerçek küçük modeller indirilir, CPU'da birkaç adım eğitilir.

Kullanım (temel klasöründen; ilk koşu ~350 MB indirir, birkaç dakika sürer):
    .venv/bin/python scripts/duman_testi.py
    .venv/bin/python scripts/duman_testi.py --rapor ciktilar/duman_raporu.json

Ne denetlenir: `tests/test_ag_duman.py` (SmolLM2-135M-Instruct ile sohbet LoRA + birleştirme +
Modelfile; Türkçe ELECTRA ile sınıflandırma + ONNX/int8; gömme + ONNX; GPU hazır ayarlarının kuru
çalıştırması). Sonuçlar `docs/DENEME_KAYDI.md` dosyasına elle işlenir.

Genişletme: yeni bir gerçek model denemesi için `tests/test_ag_duman.py` içine test ekleyin.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(description="ince_ayar ağlı duman testleri")
    parser.add_argument(
        "--rapor", default="ciktilar/duman_raporu.json", help="ölçümlerin yazılacağı JSON"
    )
    args = parser.parse_args()
    env = {**os.environ, "INCE_AYAR_AG": "1", "INCE_AYAR_DUMAN_RAPOR": str(ROOT / args.rapor)}
    env.setdefault("HF_HUB_DISABLE_XET", "1")
    env.setdefault("OMP_NUM_THREADS", "2")
    (ROOT / args.rapor).parent.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, "-m", "pytest", "tests/test_ag_duman.py", "-v", "--durations=0"]
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    print(f"\nölçümler: {args.rapor}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
