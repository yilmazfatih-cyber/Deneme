"""LLM motoru: seçimi, başlatma, durdurma ve hazır olma beklemesi.

Seçim (`AIP_LLM_ENGINE=auto`): NVIDIA GPU + Docker GPU çalışma zamanı → **vLLM** (`vllm/vllm-openai`), yoksa Ollama
kuruluysa **Ollama**, yoksa **llama-server** (PATH'teki `llama-server` ya da `python -m llama_cpp.server`).
Hepsi OpenAI uyumlu `/v1` sunar. Motor çalışınca `settings.llm_base_url` güncellenir ve `data_dir/llm_engine.json`
dosyasına yazılır; platform yeniden başladığında bu dosyadan okunur (`restore_engine_state`).
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import shutil
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel

from ..catalog.schema import ModelArtifact, ModelSpec, Runtime
from ..config import Settings, get_settings
from ..hardware.probe import HardwareProfile
from . import process

log = logging.getLogger("aiplatform.engine")

EngineName = Literal["llamacpp", "vllm", "ollama"]
LLM_PROCESS = "llm"
VLLM_CONTAINER = "aip-vllm"
VLLM_IMAGE = "vllm/vllm-openai:latest"
OLLAMA_BASE = "http://127.0.0.1:11434"
STATE_FILE = "llm_engine.json"
LogCb = Callable[[str], None]


class EngineError(RuntimeError):
    pass


class EngineHandle(BaseModel):
    engine: EngineName
    base_url: str
    model_name: str
    model_id: str | None = None
    artifact_id: str | None = None
    pid: int | None = None
    container_id: str | None = None
    started_at: float | None = None


# ───────────────────────────── seçim ─────────────────────────────


def choose_engine(profile: HardwareProfile, settings: Settings | None = None) -> EngineName:
    s = settings or get_settings()
    if s.llm_engine != "auto":
        return s.llm_engine
    if profile.has_nvidia and profile.docker.gpu_runtime:
        return "vllm"
    if profile.ollama.available:
        return "ollama"
    return "llamacpp"


def engine_for_artifact(
    artifact: ModelArtifact, profile: HardwareProfile, settings: Settings | None = None
) -> EngineName:
    """Artifact biçimine uygun motor: safetensors (vllm) → vLLM; GGUF → Ollama (etiketi varsa ve seçiliyse) ya da llama.cpp."""
    if artifact.runtime == Runtime.vllm:
        return "vllm"
    if artifact.runtime != Runtime.llamacpp:
        raise EngineError(f"'{artifact.runtime.value}' biçimi bir LLM motoru ile sunulmaz")
    preferred = choose_engine(profile, settings)
    if preferred == "ollama" and artifact.ollama_tag:
        return "ollama"
    if (
        preferred == "vllm"
        and profile.ollama.available
        and artifact.ollama_tag
        and (settings or get_settings()).llm_engine == "auto"
    ):
        return "ollama"
    return "llamacpp"


# ───────────────────────────── durum dosyası ─────────────────────────────


def _state_path(settings: Settings | None = None) -> Path:
    return (settings or get_settings()).data_dir / STATE_FILE


def save_state(handle: EngineHandle, settings: Settings | None = None) -> None:
    s = settings or get_settings()
    s.llm_base_url = handle.base_url
    _state_path(s).write_text(handle.model_dump_json(indent=2), encoding="utf-8")


def load_state(settings: Settings | None = None) -> EngineHandle | None:
    p = _state_path(settings)
    if not p.exists():
        return None
    try:
        return EngineHandle.model_validate(json.loads(p.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        log.warning("LLM motor durum dosyası okunamadı: %s", p)
        return None


def clear_state(settings: Settings | None = None) -> None:
    try:
        _state_path(settings).unlink()
    except FileNotFoundError:
        pass


def restore_engine_state(settings: Settings | None = None, restart: bool = True) -> EngineHandle | None:
    """Yeniden başlatmada: kayıtlı motorun adresini ayarlara yazar; süreç ölmüşse yeniden başlatır."""
    s = settings or get_settings()
    h = load_state(s)
    if h is None:
        return None
    s.llm_base_url = h.base_url
    if restart and h.engine == "llamacpp":
        try:
            if process.restart_if_dead(LLM_PROCESS):
                h.pid = process.pid_of(LLM_PROCESS)
                save_state(h, s)
        except Exception as e:  # noqa: BLE001
            log.warning("LLM motoru yeniden başlatılamadı: %s", e)
    return h


# ───────────────────────────── yardımcılar ─────────────────────────────


def find_gguf(path: Path) -> tuple[Path, Path | None]:
    """Klasördeki ana GGUF dosyası ve (varsa) mmproj dosyası."""
    ggufs = sorted(Path(path).rglob("*.gguf"))
    ggufs = [g for g in ggufs if ".cache" not in g.parts]
    mmproj = next((g for g in ggufs if g.name.lower().startswith("mmproj")), None)
    main = [g for g in ggufs if not g.name.lower().startswith("mmproj")]
    if not main:
        raise EngineError(f"GGUF dosyası bulunamadı: {path}")
    # Bölünmüş GGUF'larda (…-00001-of-0000N.gguf) ilk parça verilir
    return main[0], mmproj


def _context(artifact: ModelArtifact, settings: Settings) -> int:
    ctx = settings.llm_context_length
    if artifact.context_length:
        ctx = min(ctx, artifact.context_length)
    return ctx


def llamacpp_command(
    model: ModelSpec, artifact: ModelArtifact, path: Path, settings: Settings, profile: HardwareProfile
) -> list[str]:
    gguf, mmproj = find_gguf(path)
    ctx = _context(artifact, settings)
    ngl = settings.llm_gpu_layers if profile.has_gpu else 0
    exe = shutil.which("llama-server")
    if exe:
        cmd = [exe, "-m", str(gguf)]
        if mmproj:
            cmd += ["--mmproj", str(mmproj)]
        cmd += [
            "-c",
            str(ctx),
            "-ngl",
            str(ngl),
            "--port",
            str(settings.llm_port),
            "--host",
            "127.0.0.1",
            "--jinja",
            "--alias",
            model.id,
        ]
        return cmd
    if importlib.util.find_spec("llama_cpp") is not None:
        return [
            sys.executable,
            "-m",
            "llama_cpp.server",
            "--model",
            str(gguf),
            "--n_ctx",
            str(ctx),
            "--n_gpu_layers",
            str(ngl),
            "--port",
            str(settings.llm_port),
            "--host",
            "127.0.0.1",
            "--model_alias",
            model.id,
        ]
    raise EngineError(
        "llama.cpp sunucusu bulunamadı: PATH'e 'llama-server' kurun ya da 'pip install \"aiplatform[llamacpp]\"' çalıştırın."
    )


def vllm_command(model: ModelSpec, artifact: ModelArtifact, path: Path, settings: Settings) -> list[str]:
    models_dir = settings.models_dir.resolve()
    path = Path(path).resolve()
    try:
        rel = path.relative_to(models_dir)
        mount, inner = f"{models_dir}:/models", f"/models/{rel.as_posix()}"
    except ValueError:
        mount, inner = f"{path}:/model", "/model"
    return [
        "docker",
        "run",
        "-d",
        "--gpus",
        "all",
        "-v",
        mount,
        "-p",
        f"{settings.llm_port}:8000",
        "--name",
        VLLM_CONTAINER,
        VLLM_IMAGE,
        "--model",
        inner,
        "--served-model-name",
        model.id,
        "--max-model-len",
        str(_context(artifact, settings)),
    ]


async def _stream_cmd(cmd: list[str], log_cb: LogCb | None) -> int:
    say = log_cb or (lambda line: log.info(line))
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    assert proc.stdout is not None
    last = ""
    try:
        async for raw in proc.stdout:
            # ollama ilerlemeyi \r ile yazar; tekrar eden satırları azalt
            for part in raw.decode("utf-8", errors="replace").replace("\r", "\n").splitlines():
                part = part.strip()
                if part and part != last:
                    say(part)
                    last = part
        return await proc.wait()
    except asyncio.CancelledError:
        proc.kill()
        raise


async def _ollama_up(timeout: float = 2.0) -> bool:
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(f"{OLLAMA_BASE}/api/version")
            return r.status_code == 200
    except httpx.HTTPError:
        return False


async def ensure_ollama_server(log_cb: LogCb | None = None) -> None:
    if await _ollama_up():
        return
    if shutil.which("ollama") is None:
        raise EngineError("Ollama kurulu değil (https://ollama.com).")
    (log_cb or log.info)("Ollama sunucusu başlatılıyor (ollama serve)")
    process.start("ollama", ["ollama", "serve"])
    for _ in range(30):
        if await _ollama_up():
            return
        await asyncio.sleep(1)
    raise EngineError("Ollama sunucusu başlatılamadı (11434 portu yanıt vermiyor).")


async def ollama_pull(tag: str, log_cb: LogCb | None = None) -> None:
    await ensure_ollama_server(log_cb)
    rc = await _stream_cmd(["ollama", "pull", tag], log_cb)
    if rc != 0:
        raise EngineError(f"'ollama pull {tag}' başarısız oldu (çıkış kodu {rc}).")


# ───────────────────────────── başlat / durdur / bekle ─────────────────────────────


async def start_llm(
    model: ModelSpec,
    artifact: ModelArtifact,
    path: Path | None,
    settings: Settings | None = None,
    profile: HardwareProfile | None = None,
    log_cb: LogCb | None = None,
) -> EngineHandle:
    """Motoru başlatır (hazır olmasını beklemez; `wait_ready` kullanın) ve durumu kaydeder."""
    s = settings or get_settings()
    if profile is None:
        from ..hardware.probe import probe

        profile = probe()
    say = log_cb or (lambda line: log.info(line))
    engine = engine_for_artifact(artifact, profile, s)
    await stop_llm(settings=s)  # aynı anda tek motor (port çakışmasın)

    if engine == "ollama":
        assert artifact.ollama_tag
        await ollama_pull(artifact.ollama_tag, say)
        handle = EngineHandle(
            engine="ollama",
            base_url=f"{OLLAMA_BASE}/v1",
            model_name=artifact.ollama_tag,
            model_id=model.id,
            artifact_id=artifact.id,
            pid=process.pid_of("ollama"),
            started_at=time.time(),
        )
    elif engine == "vllm":
        if path is None:
            raise EngineError("vLLM için model klasörü gerekli")
        await asyncio.to_thread(
            subprocess.run,
            ["docker", "rm", "-f", VLLM_CONTAINER],
            capture_output=True,
            timeout=60,
            check=False,
        )
        cmd = vllm_command(model, artifact, path, s)
        say("Çalıştırılıyor: " + " ".join(cmd))
        p = await asyncio.to_thread(
            subprocess.run, cmd, capture_output=True, text=True, timeout=600, check=False
        )
        if p.returncode != 0:
            raise EngineError(f"vLLM kapsayıcısı başlatılamadı: {p.stderr.strip()[-500:]}")
        handle = EngineHandle(
            engine="vllm",
            base_url=f"http://127.0.0.1:{s.llm_port}/v1",
            model_name=model.id,
            model_id=model.id,
            artifact_id=artifact.id,
            container_id=p.stdout.strip()[:64],
            started_at=time.time(),
        )
    else:
        if path is None:
            raise EngineError("llama.cpp için GGUF klasörü gerekli")
        cmd = llamacpp_command(model, artifact, path, s, profile)
        say("Çalıştırılıyor: " + " ".join(cmd))
        pid = process.start(LLM_PROCESS, cmd)
        handle = EngineHandle(
            engine="llamacpp",
            base_url=f"http://127.0.0.1:{s.llm_port}/v1",
            model_name=model.id,
            model_id=model.id,
            artifact_id=artifact.id,
            pid=pid,
            started_at=time.time(),
        )
    save_state(handle, s)
    say(f"LLM motoru: {handle.engine} → {handle.base_url} (model: {handle.model_name})")
    return handle


async def stop_llm(handle: EngineHandle | None = None, settings: Settings | None = None) -> bool:
    """Çalışan motoru durdurur ve durum dosyasını siler. Durdurulacak motor yoksa False."""
    s = settings or get_settings()
    h = handle or load_state(s)
    if h is None:
        return False
    try:
        if h.engine == "llamacpp":
            await asyncio.to_thread(process.stop, LLM_PROCESS)
        elif h.engine == "vllm" and shutil.which("docker"):
            await asyncio.to_thread(
                subprocess.run,
                ["docker", "rm", "-f", VLLM_CONTAINER],
                capture_output=True,
                timeout=120,
                check=False,
            )
        elif h.engine == "ollama" and shutil.which("ollama"):
            await asyncio.to_thread(
                subprocess.run, ["ollama", "stop", h.model_name], capture_output=True, timeout=30, check=False
            )
    except (OSError, subprocess.SubprocessError) as e:
        log.warning("LLM motoru durdurulurken hata: %s", e)
    clear_state(s)
    return True


async def wait_ready(base_url: str, timeout: float = 600.0, interval: float = 2.0) -> bool:
    """`GET {base_url}/models` 200 dönene kadar bekler. Süre dolarsa False."""
    url = base_url.rstrip("/") + "/models"
    deadline = time.monotonic() + timeout
    async with httpx.AsyncClient(timeout=5.0) as c:
        while True:
            try:
                r = await c.get(url)
                if r.status_code == 200:
                    return True
            except httpx.HTTPError:
                pass
            if time.monotonic() >= deadline:
                return False
            await asyncio.sleep(interval)


async def llm_health(base_url: str | None = None, timeout: float = 2.0) -> dict:
    """LLM sunucusunun durumu (`/models`), sistem sağlık uç noktası için."""
    url = (base_url or get_settings().llm_base_url).rstrip("/") + "/models"
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(url)
        if r.status_code == 200:
            data = r.json()
            models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
            return {"ok": True, "url": url, "models": models}
        return {"ok": False, "url": url, "error": f"HTTP {r.status_code}"}
    except (httpx.HTTPError, ValueError) as e:
        return {"ok": False, "url": url, "error": str(e) or e.__class__.__name__}
