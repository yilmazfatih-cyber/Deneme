"""Depo içi yollar. Her şey `ml/` klasörüne göre çözülür; indirilen medya, ağırlıklar ve öznitelik önbelleği
`ml/.cache` altındadır (git'e girmez)."""

from __future__ import annotations

import os
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
ROOT = ML_DIR.parent
CONTENT_DIR = ROOT / "content"
SHOTS_DIR = CONTENT_DIR / "shots"
TITLES_DIR = CONTENT_DIR / "titles"
MODEL_OUT_DIR = CONTENT_DIR / "models" / "mediafm-mini"

CACHE_DIR = Path(os.environ.get("MEDIAFM_CACHE", ML_DIR / ".cache"))
MEDIA_DIR = CACHE_DIR / "media"
ENCODER_DIR = CACHE_DIR / "encoders"
FEATURE_DIR = CACHE_DIR / "features"
STILLS_DIR = CACHE_DIR / "stills"
RUNS_DIR = CACHE_DIR / "runs"
INPUTS_FILE = CACHE_DIR / "inputs.json"

# Ağa çıkan her istekte kullanılan genel tanıtıcı (kişisel veri içermez; Wikimedia User-Agent politikasına uygun).
USER_AGENT = (
    "TVPlusMediaFMMini/0.1 (research prototype; https://meta.wikimedia.org/wiki/User-Agent_policy) python-urllib"
)
