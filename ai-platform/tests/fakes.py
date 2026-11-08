"""Kurulum testleri için sahte indirme / pip / LLM motoru (ağa çıkmaz, model indirmez)."""

from __future__ import annotations

from pathlib import Path

from aiplatform.installer import engine, hf, installer, pip_extras
from aiplatform.installer.engine import EngineHandle


class Calls:
    def __init__(self) -> None:
        self.download: list[tuple[str, str]] = []
        self.pip: list[list[str]] = []
        self.start: list[tuple[str, str]] = []


def install_fakes(monkeypatch, profile) -> Calls:
    calls = Calls()

    async def fake_download(model, artifact, dest, progress_cb=None):
        dest = Path(dest)
        dest.mkdir(parents=True, exist_ok=True)
        pattern = artifact.hf_files[0] if artifact.hf_files else "model.safetensors"
        name = pattern if "*" not in pattern else "model.bin"
        (dest / name).write_bytes(b"\0" * 2048)
        if progress_cb:
            progress_cb(1024, 2048)
            progress_cb(2048, 2048)
        calls.download.append((model.id, artifact.id))
        return dest

    async def fake_pip(extras, progress_cb=None):
        calls.pip.append(list(extras))
        if progress_cb:
            progress_cb("sahte pip: " + ",".join(extras))
        return list(extras)

    async def fake_start(model, artifact, path, settings=None, profile=None, log_cb=None):
        h = EngineHandle(
            engine="llamacpp",
            base_url="http://127.0.0.1:65530/v1",
            model_name=model.id,
            model_id=model.id,
            artifact_id=artifact.id,
        )
        engine.save_state(h, settings)
        calls.start.append((model.id, artifact.id))
        return h

    async def fake_ready(base_url, timeout=600.0, interval=2.0):
        return True

    async def fake_health(base_url=None, timeout=2.0):
        return {"ok": False, "url": str(base_url), "error": "sahte"}

    monkeypatch.setattr(hf, "download_artifact", fake_download)
    monkeypatch.setattr(pip_extras, "install_extras", fake_pip)
    monkeypatch.setattr(engine, "start_llm", fake_start)
    monkeypatch.setattr(engine, "wait_ready", fake_ready)
    monkeypatch.setattr(engine, "llm_health", fake_health)
    monkeypatch.setattr(installer, "cached_probe", lambda: profile)
    return calls
