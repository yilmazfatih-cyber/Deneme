"""Sahte donanım profilleri (testlerde ortak kullanılır)."""

from __future__ import annotations

from aiplatform.hardware.probe import (
    CPUInfo,
    DiskInfo,
    DockerInfo,
    GPUInfo,
    HardwareProfile,
    MemoryInfo,
    OllamaInfo,
    tier,
)


def make_profile(
    *,
    ram: float = 16,
    gpus: list[GPUInfo] | None = None,
    unified: bool = False,
    docker_gpu: bool = False,
    ollama: bool = False,
    disk_free: float = 400,
    role: str = "server",
) -> HardwareProfile:
    p = HardwareProfile(
        os="Darwin" if unified else "Linux",
        cpu=CPUInfo(model="Test CPU", cores=8, threads=16, avx2=True),
        ram_gb=MemoryInfo(total=ram, available=ram * 0.8),
        gpus=gpus or [],
        unified_memory=unified,
        disk_gb=DiskInfo(total=1000, free=disk_free, path="/veri"),
        docker=DockerInfo(available=docker_gpu, gpu_runtime=docker_gpu),
        ollama=OllamaInfo(available=ollama, version="0.12.0" if ollama else None),
        role=role,  # type: ignore[arg-type]
        hostname="test",
    )
    p.tier = tier(p)
    return p


def t0(ram: float = 16, **kw) -> HardwareProfile:
    return make_profile(ram=ram, **kw)


def t1(**kw) -> HardwareProfile:
    return make_profile(
        ram=64,
        gpus=[GPUInfo(vendor="nvidia", name="NVIDIA GeForce RTX 4090", vram_gb=24, driver="550")],
        **kw,
    )


def t2(**kw) -> HardwareProfile:
    kw.setdefault("docker_gpu", True)
    return make_profile(
        ram=128,
        gpus=[GPUInfo(vendor="nvidia", name="NVIDIA RTX 6000 Ada Generation", vram_gb=48, driver="550")],
        **kw,
    )


def apple_m4_max(**kw) -> HardwareProfile:
    return make_profile(
        ram=64, gpus=[GPUInfo(vendor="apple", name="Apple M4 Max", vram_gb=64)], unified=True, **kw
    )
