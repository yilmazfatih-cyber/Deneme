"""Donanım tarama: alt süreç çıktıları taklit edilir, gerçek donanıma bağımlı değildir."""

from __future__ import annotations

from collections import namedtuple

import pytest

from aiplatform.hardware import probe as hw
from aiplatform.hardware.probe import GPUInfo, cached_probe, parse_nvidia_smi, reset_probe_cache, tier
from tests.profiles import apple_m4_max, make_profile, t0, t1, t2

NVIDIA_CSV = "NVIDIA GeForce RTX 4090, 24564, 1024, 550.54.15\n"
NVIDIA_HEADER = "| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4 |"
VM = namedtuple("VM", "total available")


def _fake_run(outputs: dict[str, str | None]):
    def run(cmd, timeout=5.0):
        key = " ".join(cmd)
        for prefix, out in outputs.items():
            if key.startswith(prefix):
                return out
        return None

    return run


@pytest.fixture
def linux(monkeypatch):
    monkeypatch.setattr(hw.platform, "system", lambda: "Linux")
    monkeypatch.setattr(hw.platform, "machine", lambda: "x86_64")
    monkeypatch.setattr(hw.psutil, "virtual_memory", lambda: VM(64 * hw.GB, 50 * hw.GB))
    reset_probe_cache()


def test_parse_nvidia_smi_multi_gpu():
    gpus = parse_nvidia_smi(NVIDIA_CSV + "NVIDIA H100 80GB HBM3, 81559, 0, 550.54.15\nbozuk satır\n")
    assert [g.name for g in gpus] == ["NVIDIA GeForce RTX 4090", "NVIDIA H100 80GB HBM3"]
    assert gpus[0].vram_gb == pytest.approx(23.99, abs=0.01)
    assert gpus[0].vram_used_gb == pytest.approx(1.0)
    assert gpus[1].driver == "550.54.15"


def test_probe_nvidia_docker_ollama(monkeypatch, linux):
    monkeypatch.setattr(hw.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(
        hw,
        "_run",
        _fake_run(
            {
                "nvidia-smi --query-gpu": NVIDIA_CSV,
                "nvidia-smi": NVIDIA_HEADER,
                "docker info": '{"io.containerd.runc.v2":{"path":"runc"},"nvidia":{"path":"nvidia-container-runtime"}}',
                "ollama --version": "ollama version is 0.12.3",
            }
        ),
    )
    p = hw.probe()
    assert p.gpus and p.gpus[0].vendor == "nvidia"
    assert p.gpus[0].cuda == "12.4"
    assert p.docker.available and p.docker.gpu_runtime
    assert p.ollama.available and p.ollama.version == "0.12.3"
    assert p.ram_gb.total == 64
    assert p.tier == "T1"
    assert p.role == "server"
    assert p.disk_gb.free > 0


def test_probe_without_tools(monkeypatch, linux):
    monkeypatch.setattr(hw.shutil, "which", lambda name: None)
    monkeypatch.setattr(hw, "_run", lambda cmd, timeout=5.0: None)
    p = hw.probe()
    assert p.gpus == [] and p.tier == "T0"
    assert not p.docker.available and not p.docker.gpu_runtime
    assert not p.ollama.available
    assert p.unified_memory is False


def test_probe_apple_silicon_unified_memory(monkeypatch):
    monkeypatch.setattr(hw.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(hw.platform, "machine", lambda: "arm64")
    monkeypatch.setattr(hw.psutil, "virtual_memory", lambda: VM(64 * hw.GB, 40 * hw.GB))
    monkeypatch.setattr(hw.shutil, "which", lambda name: "/usr/sbin/sysctl" if name == "sysctl" else None)
    monkeypatch.setattr(hw, "_run", _fake_run({"sysctl -n machdep.cpu.brand_string": "Apple M4 Max\n"}))
    p = hw.probe()
    assert p.unified_memory is True
    assert p.gpus[0].vendor == "apple" and p.gpus[0].vram_gb == 64
    assert p.npu.present
    assert p.tier == "T1"


def test_run_swallows_timeout_and_missing_binary():
    assert hw._run(["bu-komut-yok-xyz"]) is None
    assert hw._run(["sleep", "5"], timeout=0.2) is None


def test_role_from_settings(monkeypatch, linux):
    monkeypatch.setenv("AIP_ROLE", "client")
    from aiplatform.config import reset_settings

    reset_settings()
    monkeypatch.setattr(hw, "_run", lambda cmd, timeout=5.0: None)
    monkeypatch.setattr(hw.shutil, "which", lambda name: None)
    assert hw.probe().role == "client"


def test_cached_probe(monkeypatch):
    calls = []
    monkeypatch.setattr(hw, "probe", lambda: calls.append(1) or t0())
    reset_probe_cache()
    cached_probe()
    cached_probe()
    assert len(calls) == 1
    reset_probe_cache()


@pytest.mark.parametrize(
    "profile,expected",
    [
        (t0(), "T0"),
        (t1(), "T1"),
        (t2(), "T2"),
        (apple_m4_max(), "T1"),
        (
            make_profile(ram=128, gpus=[GPUInfo(vendor="apple", name="M3 Ultra", vram_gb=128)], unified=True),
            "T2",
        ),
        (make_profile(gpus=[GPUInfo(vendor="nvidia", name="H200", vram_gb=141)]), "T3"),
        (make_profile(gpus=[GPUInfo(vendor="nvidia", name="4090", vram_gb=24)] * 2), "T3"),
        (make_profile(gpus=[GPUInfo(vendor="nvidia", name="A6000", vram_gb=40)]), "T2"),
    ],
)
def test_tier(profile, expected):
    assert tier(profile) == expected
