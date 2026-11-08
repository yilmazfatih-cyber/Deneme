"""Donanım tarama: işletim sistemi, CPU, RAM, GPU, disk, Docker, Ollama ve NPU bilgisini toplar.

Tüm alt süreç çağrıları zaman aşımlıdır ve hata yutar: araç yoksa ya da yanıt vermezse "yok" sayılır.
Uygunluk denetimi (`compat.py`) ve kurulum motoru bu profili kullanır.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Literal

import psutil
from pydantic import BaseModel, Field

from ..config import get_settings

log = logging.getLogger("aiplatform.hardware")

GB = 1024**3
Tier = Literal["T0", "T1", "T2", "T3"]


class CPUInfo(BaseModel):
    model: str = "bilinmiyor"
    cores: int = 1  # fiziksel çekirdek
    threads: int = 1  # mantıksal çekirdek
    arch: str = ""
    avx2: bool = False
    avx512: bool = False


class MemoryInfo(BaseModel):
    total: float = 0.0
    available: float = 0.0


class GPUInfo(BaseModel):
    vendor: str  # nvidia | apple | amd | intel
    name: str
    vram_gb: float
    vram_used_gb: float = 0.0
    driver: str | None = None
    cuda: str | None = None


class DiskInfo(BaseModel):
    total: float = 0.0
    free: float = 0.0
    path: str = ""


class DockerInfo(BaseModel):
    available: bool = False
    gpu_runtime: bool = False


class OllamaInfo(BaseModel):
    available: bool = False
    version: str | None = None


class NPUInfo(BaseModel):
    present: bool = False
    name: str | None = None


class HardwareProfile(BaseModel):
    os: str
    os_version: str = ""
    cpu: CPUInfo = Field(default_factory=CPUInfo)
    ram_gb: MemoryInfo = Field(default_factory=MemoryInfo)
    gpus: list[GPUInfo] = Field(default_factory=list)
    unified_memory: bool = False
    disk_gb: DiskInfo = Field(default_factory=DiskInfo)
    docker: DockerInfo = Field(default_factory=DockerInfo)
    ollama: OllamaInfo = Field(default_factory=OllamaInfo)
    npu: NPUInfo = Field(default_factory=NPUInfo)
    role: Literal["server", "client"] = "server"
    tier: Tier = "T0"
    hostname: str = ""

    # ---- yardımcılar (uygunluk hesaplarında kullanılır)
    @property
    def has_gpu(self) -> bool:
        return bool(self.gpus)

    @property
    def has_nvidia(self) -> bool:
        return any(g.vendor == "nvidia" for g in self.gpus)

    @property
    def vram_total_gb(self) -> float:
        return round(sum(g.vram_gb for g in self.gpus), 2)


# ───────────────────────────── alt süreç yardımcısı ─────────────────────────────


def _run(cmd: list[str], timeout: float = 5.0) -> str | None:
    """Komutu çalıştırır; başarısızsa / yoksa / zaman aşımında None döner."""
    if shutil.which(cmd[0]) is None:
        return None
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        log.debug("komut çalıştırılamadı %s: %s", cmd, e)
        return None
    if p.returncode != 0:
        log.debug("komut hata kodu %s döndü: %s", p.returncode, cmd)
        return None
    return p.stdout


def _gb(n: float) -> float:
    return round(n / GB, 2)


# ───────────────────────────── CPU ─────────────────────────────


def _cpu_info() -> CPUInfo:
    system = platform.system()
    model = platform.processor() or ""
    flags: set[str] = set()
    if system == "Linux":
        try:
            text = Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"^model name\s*:\s*(.+)$", text, re.MULTILINE)
            if m:
                model = m.group(1).strip()
            fm = re.search(r"^(flags|Features)\s*:\s*(.+)$", text, re.MULTILINE)
            if fm:
                flags = set(fm.group(2).split())
        except OSError:
            pass
    elif system == "Darwin":
        out = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
        if out:
            model = out.strip()
        feats = _run(["sysctl", "-n", "machdep.cpu.leaf7_features"]) or ""
        flags = {f.lower() for f in feats.split()}
    elif system == "Windows":
        model = platform.processor() or model
    physical = psutil.cpu_count(logical=False) or 1
    logical = psutil.cpu_count(logical=True) or physical
    return CPUInfo(
        model=model or "bilinmiyor",
        cores=physical,
        threads=logical,
        arch=platform.machine(),
        avx2="avx2" in flags,
        avx512=any(f.startswith("avx512") for f in flags),
    )


# ───────────────────────────── GPU ─────────────────────────────


def parse_nvidia_smi(csv_text: str) -> list[GPUInfo]:
    """`nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv,noheader,nounits`
    çıktısını ayrıştırır (bellek MiB cinsinden)."""
    gpus: list[GPUInfo] = []
    for line in csv_text.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 4:
            continue
        name, total, used, driver = parts[0], parts[1], parts[2], parts[3]
        try:
            total_gb = round(float(total) / 1024, 2)
            used_gb = round(float(used) / 1024, 2)
        except ValueError:
            continue
        gpus.append(
            GPUInfo(vendor="nvidia", name=name, vram_gb=total_gb, vram_used_gb=used_gb, driver=driver)
        )
    return gpus


def _nvidia_gpus() -> list[GPUInfo]:
    out = _run(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.used,driver_version",
            "--format=csv,noheader,nounits",
        ]
    )
    if not out:
        return []
    gpus = parse_nvidia_smi(out)
    header = _run(["nvidia-smi"]) or ""
    m = re.search(r"CUDA Version:\s*([\d.]+)", header)
    if m:
        for g in gpus:
            g.cuda = m.group(1)
    return gpus


def _is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() in ("arm64", "aarch64")


# ───────────────────────────── disk, docker, ollama, npu ─────────────────────────────


def _disk_info(path: Path) -> DiskInfo:
    p = path
    while not p.exists() and p != p.parent:
        p = p.parent
    try:
        du = shutil.disk_usage(p)
    except OSError:
        return DiskInfo(path=str(path))
    return DiskInfo(total=_gb(du.total), free=_gb(du.free), path=str(path))


def _docker_info() -> DockerInfo:
    if shutil.which("docker") is None:
        return DockerInfo()
    out = _run(["docker", "info", "--format", "{{json .Runtimes}}"], timeout=8)
    if out is None:
        # binary var ama daemon erişilemiyor olabilir
        out_plain = _run(["docker", "info"], timeout=8)
        if out_plain is None:
            return DockerInfo(available=False)
        return DockerInfo(available=True, gpu_runtime="nvidia" in out_plain.lower())
    return DockerInfo(available=True, gpu_runtime="nvidia" in out.lower())


def _ollama_info() -> OllamaInfo:
    if shutil.which("ollama") is None:
        return OllamaInfo()
    out = _run(["ollama", "--version"], timeout=5) or ""
    m = re.search(r"(\d+\.\d+(?:\.\d+)?)", out)
    return OllamaInfo(available=True, version=m.group(1) if m else None)


def _npu_info() -> NPUInfo:
    system = platform.system()
    if system == "Linux":
        devs = sorted(Path("/dev").glob("accel*"))
        if devs:
            return NPUInfo(present=True, name=devs[0].name)
    elif system == "Darwin" and _is_apple_silicon():
        return NPUInfo(present=True, name="Apple Neural Engine")
    return NPUInfo()


# ───────────────────────────── katman ─────────────────────────────


def tier(profile: HardwareProfile) -> Tier:
    """Donanım katmanı: T0 GPU'suz, T1 tek GPU <40 GB, T2 40-100 GB, T3 >100 GB veya 2+ GPU.
    Apple birleşik bellekte ≥96 GB T2, altı T1 sayılır."""
    if not profile.gpus:
        return "T0"
    if profile.unified_memory or any(g.vendor == "apple" for g in profile.gpus):
        return "T2" if profile.gpus[0].vram_gb >= 96 else "T1"
    if len(profile.gpus) >= 2:
        return "T3"
    v = profile.gpus[0].vram_gb
    if v > 100:
        return "T3"
    if v >= 40:
        return "T2"
    return "T1"


def probe() -> HardwareProfile:
    """Bu makinenin donanım profilini çıkarır."""
    s = get_settings()
    vm = psutil.virtual_memory()
    ram_total = _gb(vm.total)
    gpus = _nvidia_gpus()
    unified = False
    if not gpus and _is_apple_silicon():
        chip = _run(["sysctl", "-n", "machdep.cpu.brand_string"]) or "Apple Silicon"
        gpus = [GPUInfo(vendor="apple", name=chip.strip(), vram_gb=ram_total)]
        unified = True
    profile = HardwareProfile(
        os=platform.system(),
        os_version=platform.release(),
        cpu=_cpu_info(),
        ram_gb=MemoryInfo(total=ram_total, available=_gb(vm.available)),
        gpus=gpus,
        unified_memory=unified,
        disk_gb=_disk_info(s.data_dir),
        docker=_docker_info(),
        ollama=_ollama_info(),
        npu=_npu_info(),
        role=s.role,
        hostname=socket.gethostname() or os.environ.get("COMPUTERNAME", ""),
    )
    profile.tier = tier(profile)
    return profile


# ───────────────────────────── önbellekli tarama ─────────────────────────────

_cache: tuple[float, HardwareProfile] | None = None


def cached_probe(max_age: float = 60.0) -> HardwareProfile:
    """Tarama birkaç alt süreç çalıştırdığı için API'de 60 sn önbelleklenir."""
    global _cache
    import time

    now = time.monotonic()
    if _cache is not None and now - _cache[0] < max_age:
        return _cache[1]
    prof = probe()
    _cache = (now, prof)
    return prof


def reset_probe_cache() -> None:
    global _cache
    _cache = None
