"""Kurulum motoru, iş kuyruğu, pip ekleri, LLM motoru ve süreç yönetimi — ağa çıkmadan."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest

from aiplatform.catalog import get_catalog
from aiplatform.config import get_settings
from aiplatform.db import init_db, session_scope
from aiplatform.installer import engine, hf, installer, pip_extras, process
from aiplatform.installer.jobs import JobManager, get_job_manager, reset_job_manager
from aiplatform.installer.models import InstalledModel, InstalledModule, Job
from tests.fakes import install_fakes
from tests.profiles import t0, t1, t2

QWEN = ("qwen3.5-35b-a3b", "q4_k_m")


@pytest.fixture(autouse=True)
def _fresh():
    reset_job_manager()
    installer.reset_bootstrap()
    yield
    reset_job_manager()


async def _install(module_id: str, **kw) -> dict:
    jm = get_job_manager()
    job_id = installer.submit_install(module_id, **kw)
    return await jm.wait(job_id, timeout=20)


# ───────────── kurulum akışı


async def test_install_with_dependencies_and_engine(monkeypatch):
    calls = install_fakes(monkeypatch, t2())
    job = await _install("ana-model")
    assert job["status"] == "done", job
    assert job["progress"] == 100
    assert installer.installed_module_ids() == {"kvkk-kalkani", "ana-model"}
    pairs = installer.installed_pairs()
    assert QWEN in pairs and ("gliner-multi-pii-v1", "default") in pairs
    assert ("presidio", "default") in pairs  # indirilecek ağırlık yok ama kayıtlı
    assert ("granite-guardian-3.1-2b", "bf16") not in pairs  # isteğe bağlı bileşen kurulmaz
    assert ("presidio", "default") not in calls.download
    assert calls.start == [QWEN]
    s = get_settings()
    assert s.llm_base_url == "http://127.0.0.1:65530/v1"
    assert json.loads((s.data_dir / "llm_engine.json").read_text(encoding="utf-8"))["model_id"] == QWEN[0]
    qdir = s.models_dir / QWEN[0] / QWEN[1]
    assert (qdir / "Qwen3.5-35B-A3B-Q4_K_M.gguf").exists()
    with session_scope() as sess:
        row = sess.get(InstalledModel, QWEN)
        assert row.path == str(qdir) and row.runtime == "llamacpp"
        mod = sess.get(InstalledModule, "ana-model")
        cfg = json.loads(mod.config_json)
        assert mod.enabled and mod.target == "server"
        assert {
            "role": "llm",
            "model": QWEN[0],
            "artifact": QWEN[1],
            "delegated": False,
            "optional": False,
        } in cfg["components"]
    assert ["kvkk"] in calls.pip
    assert job["result"]["dependencies_installed"] == ["kvkk-kalkani"]
    assert any("Bağımlılık: kvkk-kalkani" in line for line in get_job_manager()._states[job["id"]].lines)


async def test_install_incompatible_fails_with_report(monkeypatch):
    install_fakes(monkeypatch, t1())
    job = await _install("ana-model")
    assert job["status"] == "failed"
    assert "Uygunluk denetimi başarısız" in job["error"]
    assert job["result"]["report"]["status"] == "fail"
    assert "ana-model" not in installed_ids()


def installed_ids() -> set[str]:
    return installer.installed_module_ids()


async def test_shared_model_downloaded_once(monkeypatch):
    calls = install_fakes(monkeypatch, t2())
    assert (await _install("ana-model"))["status"] == "done"

    async def healthy(base_url=None, timeout=2.0):
        return {"ok": True, "url": str(base_url), "models": [QWEN[0]]}

    monkeypatch.setattr(engine, "llm_health", healthy)
    job = await _install("gorsel-anlama")
    assert job["status"] == "done", job
    assert calls.download.count(QWEN) == 1
    assert len(calls.start) == 1  # aynı model sağlıklı çalışıyor → motor yeniden başlatılmaz
    assert job["result"]["engine"]["started"] is False


async def test_client_install_skips_server_components(monkeypatch):
    calls = install_fakes(monkeypatch, t0(role="client"))
    job = await _install("ozetleme", target="client")
    assert job["status"] == "done", job
    # ozetleme'nin LLM'i 'either' → istemcide yerel çalışır
    assert ("qwen3.5-4b", "q4_k_m") in calls.download
    calls.download.clear()
    job = await _install("gorsel-anlama", target="client")
    assert job["status"] == "done", job
    assert QWEN not in calls.download  # sunucu bileşeni devredildi


async def test_uninstall_keeps_shared_and_respects_dependents(monkeypatch):
    install_fakes(monkeypatch, t2())
    assert (await _install("ana-model"))["status"] == "done"
    assert (await _install("gorsel-anlama"))["status"] == "done"
    s = get_settings()
    qdir = s.models_dir / QWEN[0] / QWEN[1]

    with pytest.raises(installer.InstallError) as e:
        await installer.uninstall_module("kvkk-kalkani")
    assert e.value.code == "has_dependents"

    res = await installer.uninstall_module("gorsel-anlama")
    assert {"model": QWEN[0], "artifact": QWEN[1]} in res["kept_models"]
    assert qdir.exists()

    res = await installer.uninstall_module("ana-model")
    assert {"model": QWEN[0], "artifact": QWEN[1]} in res["removed_models"]
    assert not qdir.exists()
    assert QWEN not in installer.installed_pairs()
    assert not (s.data_dir / "llm_engine.json").exists()  # motor durduruldu

    with pytest.raises(installer.InstallError) as e:
        await installer.uninstall_module("ana-model")
    assert e.value.code == "not_installed"


async def test_validate_install_request():
    with pytest.raises(installer.InstallError) as e:
        installer.validate_install_request("yok-boyle-modul", None)
    assert e.value.code == "not_found"
    with pytest.raises(installer.InstallError) as e:
        installer.validate_install_request("ana-model", {"llm": "q2"})
    assert e.value.code == "bad_request"
    installer.validate_install_request("ana-model", {"llm": "fp8"})


async def test_enable_disable(monkeypatch):
    install_fakes(monkeypatch, t2())
    assert (await _install("kvkk-kalkani"))["status"] == "done"
    assert installer.set_enabled("kvkk-kalkani", False)
    assert installer.list_installed()[0]["enabled"] is False
    assert not installer.set_enabled("ana-model", True)


# ───────────── iş kuyruğu


async def test_job_cancel_running():
    jm = get_job_manager()
    started = asyncio.Event()

    async def slow(job):
        job.progress(10, "uzun iş")
        started.set()
        await asyncio.sleep(30)

    job_id = jm.submit("test", None, slow)
    await asyncio.wait_for(started.wait(), 5)
    assert jm.cancel(job_id)
    job = await jm.wait(job_id, 5)
    assert job["status"] == "cancelled"
    assert not jm.cancel(job_id)


async def test_jobs_run_one_at_a_time_and_cancel_queued():
    jm = get_job_manager()
    order: list[str] = []

    def make(name):
        async def f(job):
            order.append(f"{name}-başla")
            await asyncio.sleep(0.05)
            order.append(f"{name}-bitir")
            return {"ad": name}

        return f

    a = jm.submit("test", None, make("a"))
    b = jm.submit("test", None, make("b"))
    c = jm.submit("test", None, make("c"))
    assert jm.cancel(c)
    await jm.wait(b, 5)
    assert order == ["a-başla", "a-bitir", "b-başla", "b-bitir"]
    assert jm.get(a)["result"] == {"ad": "a"}
    assert jm.get(c)["status"] == "cancelled"


async def test_job_failure_and_events():
    jm = get_job_manager()

    async def bad(job):
        job.step("adım 1", 30)
        job.log("satır")
        raise RuntimeError("bir şey bozuldu")

    job_id = jm.submit("test", "kvkk-kalkani", bad)
    events = [ev async for ev in jm.subscribe(job_id)]
    assert events[0]["type"] == "snapshot"
    assert events[-1] == {"type": "end", "status": "failed", "error": "bir şey bozuldu", "result": None}
    assert any(ev["type"] == "log" and ev["line"] == "satır" for ev in events)
    assert any(ev["type"] == "progress" and ev["progress"] == 30 for ev in events)
    # veritabanına da yazıldı
    with session_scope() as s:
        row = s.get(Job, job_id)
        assert row.status == "failed" and "satır" in row.log_text
    assert jm.list(module_id="kvkk-kalkani")[0]["id"] == job_id


def test_recover_marks_unfinished_jobs_failed():
    init_db()
    with session_scope() as s:
        s.add(Job(id="j1", kind="install", module_id="x", status="running"))
        s.add(Job(id="j2", kind="install", module_id="x", status="done"))
    jm = JobManager()
    assert jm.get("j1")["status"] == "failed"
    assert jm.get("j1")["error"] == "süreç yeniden başlatıldı"
    assert jm.get("j2")["status"] == "done"


async def test_scaled_progress():
    jm = get_job_manager()

    async def f(job):
        sub = job.scaled(50, 100)
        sub.progress(50)
        assert jm._states[job.id].progress == 75
        sub.scaled(0, 50).progress(100)
        assert jm._states[job.id].progress == 75

    job_id = jm.submit("test", None, f)
    assert (await jm.wait(job_id, 5))["status"] == "done"


# ───────────── hf indirme (snapshot_download taklit)


async def test_download_artifact_progress(monkeypatch, tmp_path):
    import huggingface_hub

    seen = {}

    def fake_snapshot(repo_id, **kw):
        seen.update(kw, repo_id=repo_id)
        Path(kw["local_dir"], "Qwen3.5-4B-Q4_K_M.gguf").write_bytes(b"\0" * 4096)
        return str(kw["local_dir"])

    monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_snapshot)
    monkeypatch.setattr(hf, "expected_total_bytes", lambda artifact: 4096)
    model = get_catalog().models["qwen3.5-4b"]
    art = model.artifact("q4_k_m")
    progress = []
    dest = await hf.download_artifact(model, art, tmp_path / "m", lambda d, t: progress.append((d, t)))
    assert seen["repo_id"] == art.hf_repo
    assert seen["allow_patterns"] == art.hf_files
    assert seen["local_dir"] == tmp_path / "m"
    assert progress[-1] == (4096, 4096)
    assert hf.artifact_size_on_disk(dest) == pytest.approx(4096 / 1024**3, abs=1e-3)


# ───────────── pip ekleri ve sistem paketleri


def test_extra_requirements_and_missing():
    reqs = pip_extras.extra_requirements("kvkk")
    assert reqs and any(r.startswith("presidio-analyzer") for r in reqs)
    assert pip_extras.requirement_satisfied("pytest>=1") is True
    assert pip_extras.requirement_satisfied("bu-paket-kesin-yok-xyz") is False
    assert pip_extras.missing_extras(["bilinmeyen-extra"]) == ["bilinmeyen-extra"]


def test_pip_command_from_source_tree():
    cmd = pip_extras.pip_command(["text2sql"])
    assert cmd[:4] == [sys.executable, "-m", "pip", "install"]


@pytest.mark.parametrize(
    "system,which,expected",
    [
        ("Linux", {"apt-get"}, "sudo apt install tesseract-ocr tesseract-ocr-tur"),
        ("Darwin", set(), "brew install tesseract tesseract-lang"),
    ],
)
def test_system_package_hint(monkeypatch, system, which, expected):
    monkeypatch.setattr(pip_extras.platform, "system", lambda: system)
    monkeypatch.setattr(pip_extras.shutil, "which", lambda n: f"/usr/bin/{n}" if n in which else None)
    assert pip_extras.system_package_hint(["tesseract-ocr", "tesseract-ocr-tur"]) == expected


def test_system_package_hint_windows_and_empty(monkeypatch):
    monkeypatch.setattr(pip_extras.platform, "system", lambda: "Windows")
    assert "Windows" in pip_extras.system_package_hint(["tesseract-ocr"])
    assert pip_extras.system_package_hint([]) is None


# ───────────── LLM motoru


def test_choose_engine(monkeypatch):
    s = get_settings()
    assert engine.choose_engine(t2(), s) == "vllm"
    assert engine.choose_engine(t1(), s) == "llamacpp"
    assert engine.choose_engine(t0(ollama=True), s) == "ollama"
    s.llm_engine = "llamacpp"
    assert engine.choose_engine(t2(), s) == "llamacpp"


def test_engine_for_artifact():
    m = get_catalog().models["qwen3.5-35b-a3b"]
    s = get_settings()
    assert engine.engine_for_artifact(m.artifact("fp8"), t2(), s) == "vllm"
    assert engine.engine_for_artifact(m.artifact("q4_k_m"), t2(), s) == "llamacpp"
    assert engine.engine_for_artifact(m.artifact("q4_k_m"), t0(ollama=True), s) == "ollama"


def test_llamacpp_command(monkeypatch, tmp_path):
    (tmp_path / "Qwen3.5-4B-Q4_K_M.gguf").write_bytes(b"x")
    (tmp_path / "mmproj-F16.gguf").write_bytes(b"x")
    m = get_catalog().models["qwen3.5-4b"]
    s = get_settings()
    monkeypatch.setattr(
        engine.shutil, "which", lambda n: "/usr/local/bin/llama-server" if n == "llama-server" else None
    )
    cmd = engine.llamacpp_command(m, m.artifact("q4_k_m"), tmp_path, s, t1())
    assert cmd[0] == "/usr/local/bin/llama-server"
    assert cmd[cmd.index("-m") + 1].endswith("Qwen3.5-4B-Q4_K_M.gguf")
    assert cmd[cmd.index("--mmproj") + 1].endswith("mmproj-F16.gguf")
    assert cmd[cmd.index("-ngl") + 1] == "-1"
    assert cmd[cmd.index("-c") + 1] == str(s.llm_context_length)
    assert "--jinja" in cmd and cmd[cmd.index("--host") + 1] == "127.0.0.1"
    cpu = engine.llamacpp_command(m, m.artifact("q4_k_m"), tmp_path, s, t0())
    assert cpu[cpu.index("-ngl") + 1] == "0"


def test_llamacpp_command_python_fallback(monkeypatch, tmp_path):
    (tmp_path / "a.gguf").write_bytes(b"x")
    m = get_catalog().models["qwen3.5-4b"]
    monkeypatch.setattr(engine.shutil, "which", lambda n: None)
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda n: object() if n == "llama_cpp" else None)
    cmd = engine.llamacpp_command(m, m.artifact("q4_k_m"), tmp_path, get_settings(), t0())
    assert cmd[:3] == [sys.executable, "-m", "llama_cpp.server"]
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda n: None)
    with pytest.raises(engine.EngineError):
        engine.llamacpp_command(m, m.artifact("q4_k_m"), tmp_path, get_settings(), t0())


def test_vllm_command():
    s = get_settings()
    m = get_catalog().models["qwen3.5-35b-a3b"]
    path = s.models_dir / m.id / "fp8"
    path.mkdir(parents=True)
    cmd = engine.vllm_command(m, m.artifact("fp8"), path, s)
    assert cmd[:4] == ["docker", "run", "-d", "--gpus"]
    assert f"{s.models_dir.resolve()}:/models" in cmd
    assert cmd[cmd.index("--model") + 1] == f"/models/{m.id}/fp8"
    assert cmd[cmd.index("--served-model-name") + 1] == m.id
    assert f"{s.llm_port}:8000" in cmd


def test_engine_state_roundtrip():
    s = get_settings()
    h = engine.EngineHandle(engine="vllm", base_url="http://127.0.0.1:8001/v1", model_name="x", model_id="x")
    engine.save_state(h, s)
    s.llm_base_url = "http://baska/v1"
    restored = engine.restore_engine_state(s, restart=False)
    assert restored == h and s.llm_base_url == h.base_url
    engine.clear_state(s)
    assert engine.load_state(s) is None


async def test_wait_ready_times_out_quickly():
    assert await engine.wait_ready("http://127.0.0.1:9/v1", timeout=0.3, interval=0.1) is False


# ───────────── süreç yönetimi


def test_process_start_stop():
    name = "test-uyku"
    pid = process.start(
        name, [sys.executable, "-c", "import time; print('hazır', flush=True); time.sleep(30)"]
    )
    assert pid > 0 and process.is_running(name)
    assert process.stop(name, timeout=5)
    assert not process.is_running(name)
    assert process.read_info(name) is None
    assert any("başlatılıyor" in line for line in process.tail_log(name))
