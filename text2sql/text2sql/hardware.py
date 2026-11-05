"""GPU algılama ve bellek miktarına göre model/niceleme önerisi."""

from __future__ import annotations

import platform
import shutil
import subprocess
from dataclasses import dataclass


@dataclass
class GPU:
    name: str
    vram_mib: int | None  # Apple Silicon'da birleşik bellek (toplam RAM)
    kind: str  # "nvidia" | "apple" | "amd"


def _run(cmd: list[str], timeout: float = 5.0) -> str | None:
    if not shutil.which(cmd[0]):
        return None
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def parse_nvidia_smi(text: str) -> list[GPU]:
    """'NVIDIA GeForce RTX 3060, 12288 MiB' satırlarını çözer."""
    gpus = []
    for line in text.strip().splitlines():
        if "," not in line:
            continue
        name, mem = line.rsplit(",", 1)
        digits = "".join(ch for ch in mem if ch.isdigit())
        gpus.append(GPU(name.strip(), int(digits) if digits else None, "nvidia"))
    return gpus


def detect_gpus() -> list[GPU]:
    out = _run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"])
    if out:
        return parse_nvidia_smi(out)
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        mem = _run(["sysctl", "-n", "hw.memsize"])
        mib = int(mem.strip()) // (1024 * 1024) if mem and mem.strip().isdigit() else None
        return [GPU("Apple Silicon (Metal, birleşik bellek)", mib, "apple")]
    out = _run(["rocm-smi", "--showproductname"])
    if out:
        return [GPU("AMD GPU (ROCm)", None, "amd")]
    return []


@dataclass
class Recommendation:
    tag: str
    size: str
    note: str
    profile: str = "qwen"


# docs/MODEL_SECIMI.md bölüm 3 ile uyumlu. Etiketler Ollama kütüphanesindeki adlardır (bu ortamdan doğrulanamadı).
# Eşikler, nvidia-smi'nin bildirdiği toplam bellekten biraz düşük tutuldu (ör. "8 GB" kart ≈ 8188 MiB bildirir).
RECOMMENDATIONS = [
    # (en az VRAM MiB, öneri)
    (11000, Recommendation("Arctic-Text2SQL-R1-7B Q8_0 (topluluk GGUF'u)", "≈ 8 GB", "en yüksek SQL kalitesi; profil 'buyuk'", "buyuk")),
    (7500, Recommendation("qwen2.5-coder:1.5b-instruct-fp16", "≈ 3,1 GB", "ya da profil 'buyuk' (7B Q4_K_M ≈ 4,7 GB)")),
    (5500, Recommendation("qwen2.5-coder:1.5b-instruct-q8_0", "≈ 1,6 GB", "fp16 (≈ 3,1 GB) de sığar")),
    (3500, Recommendation("qwen2.5-coder:1.5b-instruct-q8_0", "≈ 1,6 GB", "Q4_K_M (varsayılan) da olur; profil 'slm-sql' de sığar")),
    (0, Recommendation("qwen2.5-coder:1.5b", "≈ 1,0 GB", "Q4_K_M (varsayılan); bellek azsa katmanların bir kısmı CPU'da çalışır")),
]
CPU_RECOMMENDATION = Recommendation(
    "qwen2.5-coder:1.5b", "≈ 1,0 GB", "GPU yok: CPU'da çalışır (8 GB RAM yeter), soru başına birkaç saniye; daha hızlısı qwen2.5-coder:0.5b"
)


def recommend(vram_mib: int | None) -> Recommendation:
    if vram_mib is None:
        return CPU_RECOMMENDATION
    for min_mib, rec in RECOMMENDATIONS:
        if vram_mib >= min_mib:
            return rec
    return CPU_RECOMMENDATION
