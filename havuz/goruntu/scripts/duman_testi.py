"""Ağ isteyen duman testini koşturur: gerçek küçük modeller indirilir, CPU'da kısa eğitim ve ölçüm yapılır.

Kullanım (temel klasöründen; ilk koşu ~2,2 GB indirir, makine yüküne göre birkaç dakika sürer):
    .venv/bin/python scripts/duman_testi.py
    .venv/bin/python scripts/duman_testi.py --rapor ciktilar/duman_raporu.json

Ne denetlenir: `tests/test_ag_duman.py` — MobileNetV3 ve ViT-Tiny (timm) ile sentetik şekil kümesinde baş eğitimi +
ONNX/int8 + PyTorch eşdeğerliği; CLIP ve SigLIP 2 ile görüntü→görüntü recall@k, Türkçe ve İngilizce
metinle arama, sıfır atışlı sınıflandırma. Sonuçlar JSON'a yazılır; `docs/DENEME_KAYDI.md`'ye elle işlenir.

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
    parser = argparse.ArgumentParser(description="goruntu ağlı duman testi")
    parser.add_argument(
        "--rapor", default="ciktilar/duman_raporu.json", help="ölçümlerin yazılacağı JSON"
    )
    args = parser.parse_args()
    report = ROOT / args.rapor
    report.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GORUNTU_AG": "1", "GORUNTU_DUMAN_RAPOR": str(report)}
    env.setdefault("HF_HUB_DISABLE_XET", "1")
    env.setdefault("OMP_NUM_THREADS", "2")
    env.setdefault("GORUNTU_IS_PARCACIGI", "2")
    command = [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_ag_duman.py",
        "-v",
        "-s",
        "--durations=0",
    ]
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    print(f"\nölçümler: {report}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
