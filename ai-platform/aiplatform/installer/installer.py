"""Tek tık modül kurulumu ve kaldırma.

Kurulum adımları (`docs/MIMARI.md` sırasıyla, her biri ilerleme yazar):
bağımlılık modülleri → uygunluk (fail ise iptal) → `pip install aiplatform[extras]` → sistem paketi uyarısı →
Hugging Face indirme (`models_dir/<model>/<artifact>`) → LLM ise motoru başlat ve `/v1/models` bekle →
`installed_models` / `installed_modules` kaydı → modül `health()`.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

from sqlalchemy import select

from ..catalog import get_catalog
from ..catalog.schema import Catalog, ModelArtifact, ModelSpec, Runtime
from ..config import get_settings
from ..db import init_db, session_scope
from ..hardware.compat import CompatibilityReport, check_module, is_llm
from ..hardware.probe import HardwareProfile, cached_probe
from . import engine, hf, pip_extras
from .jobs import JobContext, get_job_manager
from .models import InstalledModel, InstalledModule, utcnow

log = logging.getLogger("aiplatform.installer")

# Kurulum içi ilerleme dilimleri (yüzde)
P_COMPAT = (0, 5)
P_PIP = (5, 20)
P_SYSPKG = (20, 25)
P_DOWNLOAD = (25, 85)
P_ENGINE = (85, 95)
P_RECORD = (95, 100)


class InstallError(Exception):
    """Kullanıcıya gösterilebilir kurulum hatası. `result` iş kaydına yazılır (ör. uygunluk raporu)."""

    def __init__(
        self, message: str, *, code: str = "install_failed", result: Any = None, hint: str | None = None
    ):
        super().__init__(message)
        self.code = code
        self.result = result
        self.hint = hint


class _NullJob:
    """İş kuyruğu dışında (doğrudan çağrı) kullanılan sessiz bağlam."""

    cancelled = False

    def progress(self, pct: float, step: str | None = None) -> None:
        if step:
            log.info("[%3d%%] %s", int(pct), step)

    def step(self, text: str, pct: float | None = None) -> None:
        log.info(text)

    def log(self, line: str) -> None:
        log.info(line)

    def set_result(self, result: Any) -> None:
        pass

    def raise_if_cancelled(self) -> None:
        pass

    def scaled(self, lo: float, hi: float) -> _NullJob:
        return self


# ───────────────────────────── kurulu durum sorguları ─────────────────────────────


def installed_pairs() -> set[tuple[str, str]]:
    init_db()
    with session_scope() as s:
        return {(r.model_id, r.artifact_id) for r in s.scalars(select(InstalledModel)).all()}


def installed_module_ids() -> set[str]:
    init_db()
    with session_scope() as s:
        return set(s.scalars(select(InstalledModule.module_id)).all())


def _module_config(row: InstalledModule) -> dict:
    try:
        return json.loads(row.config_json or "{}")
    except ValueError:
        return {}


def list_installed() -> list[dict]:
    """Kurulu modüller: kimlik, ad, hedef, etkinlik, kurulum zamanı, bileşenler."""
    init_db()
    cat = get_catalog()
    out = []
    with session_scope() as s:
        for r in s.scalars(select(InstalledModule).order_by(InstalledModule.module_id)).all():
            spec = cat.modules.get(r.module_id)
            cfg = _module_config(r)
            out.append(
                {
                    "module_id": r.module_id,
                    "name": spec.name if spec else r.module_id,
                    "target": r.target,
                    "enabled": r.enabled,
                    "installed": True,
                    "installed_at": r.installed_at.isoformat() if r.installed_at else None,
                    "components": cfg.get("components", []),
                    "with_optional": cfg.get("with_optional", False),
                }
            )
    return out


def list_installed_models() -> list[dict]:
    init_db()
    with session_scope() as s:
        return [
            {
                "model_id": r.model_id,
                "artifact_id": r.artifact_id,
                "path": r.path,
                "size_gb": r.size_gb,
                "runtime": r.runtime,
                "installed_at": r.installed_at.isoformat() if r.installed_at else None,
            }
            for r in s.scalars(select(InstalledModel).order_by(InstalledModel.model_id)).all()
        ]


def set_enabled(module_id: str, enabled: bool) -> bool:
    init_db()
    with session_scope() as s:
        row = s.get(InstalledModule, module_id)
        if row is None:
            return False
        row.enabled = enabled
        return True


# ───────────────────────────── doğrulama ─────────────────────────────


def validate_install_request(
    module_id: str, artifacts: dict[str, str] | None, catalog: Catalog | None = None
) -> None:
    cat = catalog or get_catalog()
    if module_id not in cat.modules:
        raise InstallError(
            f"Bilinmeyen modül: '{module_id}'", code="not_found", hint="GET /api/catalog/modules"
        )
    mod = cat.modules[module_id]
    for role, art_id in (artifacts or {}).items():
        comp = next((c for c in mod.components if c.role == role), None)
        if comp is None or comp.model is None:
            raise InstallError(f"'{module_id}' modülünde model bileşeni '{role}' yok", code="bad_request")
        try:
            cat.models[comp.model].artifact(art_id)
        except KeyError:
            ids = ", ".join(a.id for a in cat.models[comp.model].artifacts)
            raise InstallError(
                f"'{comp.model}' için '{art_id}' biçimi yok (seçenekler: {ids})", code="bad_request"
            ) from None


# ───────────────────────────── kurulum ─────────────────────────────


def _model_dir(model_id: str, artifact_id: str) -> Path:
    return get_settings().models_dir / model_id / artifact_id


def _record_model(model: ModelSpec, art: ModelArtifact, path: str, size_gb: float) -> None:
    with session_scope() as s:
        row = s.get(InstalledModel, (model.id, art.id))
        if row is None:
            row = InstalledModel(model_id=model.id, artifact_id=art.id)
            s.add(row)
        row.path = path
        row.size_gb = size_gb
        row.runtime = art.runtime.value
        row.installed_at = utcnow()


def _priority(model_id: str | None) -> int:
    prio = get_settings().llm_model_priority
    return prio.index(model_id) if model_id in prio else len(prio) + 1


async def _download_step(
    cat: Catalog, report: CompatibilityReport, profile: HardwareProfile, job: Any
) -> list[dict]:
    """Seçilen bileşenlerin artifact'lerini indirir ve `installed_models`'e yazar."""
    done_pairs = installed_pairs()
    todo = []
    for sel in report.selected:
        if sel.delegated or not sel.model or not sel.artifact:
            continue
        if (sel.model, sel.artifact) in done_pairs or any(
            (t[0].id, t[1].id) == (sel.model, sel.artifact) for t in todo
        ):
            continue
        model = cat.models[sel.model]
        todo.append((model, model.artifact(sel.artifact), sel))
    results: list[dict] = []
    if not todo:
        job.step("İndirilecek yeni model yok (paylaşılan modeller zaten kurulu)", 100)
        return results

    weights = [max(a.disk_gb, 0.05) for _, a, _ in todo]
    total_w = sum(weights)
    start = 0.0
    for (model, art, sel), w in zip(todo, weights, strict=True):
        job.raise_if_cancelled()
        lo, hi = start / total_w * 100, (start + w) / total_w * 100
        start += w
        sub = job.scaled(lo, hi)
        llm_engine = None
        if is_llm(cat_component(cat, report.module_id, sel.role), model) and art.runtime in (
            Runtime.llamacpp,
            Runtime.vllm,
        ):
            llm_engine = engine.engine_for_artifact(art, profile)

        if llm_engine == "ollama" and art.ollama_tag:
            sub.step(f"{model.name}: Ollama ile çekiliyor ({art.ollama_tag})", 0)
            await engine.ollama_pull(art.ollama_tag, sub.log)
            _record_model(model, art, f"ollama:{art.ollama_tag}", art.disk_gb)
            results.append(
                {
                    "model": model.id,
                    "artifact": art.id,
                    "path": f"ollama:{art.ollama_tag}",
                    "size_gb": art.disk_gb,
                }
            )
            sub.progress(100)
            continue
        if not art.hf_repo:
            sub.step(f"{model.name}: indirilecek ağırlık yok (kütüphane/sistem bileşeni)", 100)
            _record_model(model, art, "", 0.0)
            results.append({"model": model.id, "artifact": art.id, "path": "", "size_gb": 0.0})
            continue

        dest = _model_dir(model.id, art.id)
        sub.step(f"{model.name} indiriliyor ({art.hf_repo}, ≈{art.disk_gb} GB)", 0)
        last_logged = [-10]

        def cb(done: int, total: int, _sub=sub, _name=model.name, _last=last_logged) -> None:
            if total > 0:
                pct = min(done / total * 100, 100.0)
                _sub.progress(pct)
                if pct - _last[0] >= 10:
                    _last[0] = int(pct)
                    _sub.log(f"{_name}: %{int(pct)} ({done / 1024**3:.2f}/{total / 1024**3:.2f} GB)")

        await hf.download_artifact(model, art, dest, cb)
        size = await asyncio.to_thread(hf.artifact_size_on_disk, dest)
        _record_model(model, art, str(dest), size)
        results.append({"model": model.id, "artifact": art.id, "path": str(dest), "size_gb": size})
        sub.progress(100, f"{model.name} indirildi ({size} GB)")
    return results


def cat_component(cat: Catalog, module_id: str, role: str):
    return next(c for c in cat.modules[module_id].components if c.role == role)


async def _engine_step(
    cat: Catalog, report: CompatibilityReport, profile: HardwareProfile, job: Any
) -> dict | None:
    """Modülün LLM bileşeni varsa motoru başlatır (daha öncelikli bir model zaten çalışıyorsa korur)."""
    llm_sel = None
    for sel in report.selected:
        if sel.delegated or not sel.model or not sel.artifact:
            continue
        comp = cat_component(cat, report.module_id, sel.role)
        model = cat.models[sel.model]
        is_engine_llm = is_llm(comp, model) and sel.runtime in (Runtime.llamacpp.value, Runtime.vllm.value)
        if is_engine_llm and (llm_sel is None or comp.role == "llm"):
            llm_sel = sel
    if llm_sel is None:
        job.step("LLM motoru gerekmiyor", 100)
        return None

    s = get_settings()
    model = cat.models[llm_sel.model]
    art = model.artifact(llm_sel.artifact)
    current = engine.load_state(s)
    if current is not None:
        health = await engine.llm_health(current.base_url)
        if health.get("ok"):
            if (current.model_id, current.artifact_id) == (model.id, art.id):
                job.step(f"LLM motoru zaten çalışıyor ({current.engine}, {current.model_name})", 100)
                return {"engine": current.model_dump(), "started": False}
            if _priority(current.model_id) <= _priority(model.id):
                job.step(f"Daha öncelikli LLM ({current.model_id}) çalışıyor; motor değiştirilmedi", 100)
                return {"engine": current.model_dump(), "started": False}

    job.step(f"LLM motoru başlatılıyor: {model.name}", 10)
    with session_scope() as sess:
        row = sess.get(InstalledModel, (model.id, art.id))
        path = Path(row.path) if row and row.path and not row.path.startswith("ollama:") else None
    try:
        handle = await engine.start_llm(model, art, path, s, profile, log_cb=job.log)
    except engine.EngineError as e:
        job.log(f"UYARI: LLM motoru başlatılamadı: {e}")
        return {"engine": None, "started": False, "error": str(e)}
    job.step(f"LLM motoru hazır olması bekleniyor ({handle.base_url})", 40)
    ready = await engine.wait_ready(handle.base_url, timeout=900)
    if not ready:
        job.log("UYARI: LLM motoru zaman aşımında hazır olmadı; günlüğe bakın (logs/llm.log).")
    job.progress(100, "LLM motoru hazır" if ready else "LLM motoru hazır değil")
    return {"engine": handle.model_dump(), "started": True, "ready": ready}


async def _health_step(module_id: str, job: Any) -> dict | None:
    try:
        importlib.import_module("aiplatform.modules.runtimes")
    except Exception as e:  # noqa: BLE001 — çalışma zamanı paketi henüz yazılmamış olabilir
        job.log(f"Modül çalışma zamanları yüklenemedi: {e}")
    try:
        from ..modules.base import get_runtime

        h = await get_runtime(module_id).health()
        job.log(f"Sağlık denetimi: {json.dumps(h, ensure_ascii=False, default=str)}")
        return h
    except Exception as e:  # noqa: BLE001 — sağlık denetimi kurulumu başarısız saymaz
        job.log(f"Sağlık denetimi yapılamadı: {e}")
        return {"module": module_id, "ready": False, "error": str(e)}


async def install_module(
    module_id: str,
    target: str = "auto",
    artifacts_override: dict[str, str] | None = None,
    with_optional: bool = False,
    job: JobContext | None = None,
    *,
    profile: HardwareProfile | None = None,
    _stack: tuple[str, ...] = (),
) -> dict:
    """Modülü (ve eksik bağımlılıklarını) kurar; özet sözlük döner. Uygunluk fail ise `InstallError`."""
    j: Any = job or _NullJob()
    cat = get_catalog()
    validate_install_request(module_id, artifacts_override, cat)
    if module_id in _stack:
        raise InstallError(f"Döngüsel bağımlılık: {' → '.join(_stack + (module_id,))}")
    init_db()
    profile = profile or cached_probe()
    mod = cat.modules[module_id]

    # 1) Bağımlılıklar
    missing = [d for d in mod.depends_on if d not in installed_module_ids()]
    me = j
    if missing:
        j.step(f"Önce bağımlı modüller kuruluyor: {', '.join(missing)}", 0)
        dep_span = 40.0
        for i, dep in enumerate(missing):
            sub = j.scaled(dep_span * i / len(missing), dep_span * (i + 1) / len(missing))
            sub.log(f"— Bağımlılık: {dep} —")
            await install_module(dep, target, None, False, sub, profile=profile, _stack=_stack + (module_id,))
        me = j.scaled(dep_span, 100)
    else:
        j.step("Bağımlılık modülleri tamam", 1)

    # 2) Uygunluk
    me.step(f"{mod.name}: donanım uygunluğu denetleniyor", P_COMPAT[0])
    report = check_module(
        cat,
        module_id,
        profile,
        installed_pairs(),
        target,  # type: ignore[arg-type]
        artifacts=artifacts_override,
        with_optional=with_optional,
        installed_modules=installed_module_ids(),
    )
    for c in report.checks:
        if c.status != "ok":
            me.log(f"{'HATA' if c.status == 'fail' else 'UYARI'} [{c.id}]: {c.message}")
    if report.status == "fail":
        raise InstallError(
            f"Uygunluk denetimi başarısız: {report.recommendation}",
            code="incompatible",
            result={"report": report.model_dump()},
        )
    me.progress(P_COMPAT[1], f"Uygunluk: {report.status} — {report.recommendation}")

    # 3) Python ekleri
    me.raise_if_cancelled()
    extras: list[str] = []
    sys_pkgs: list[str] = []
    for sel in report.selected:
        if sel.delegated:
            continue
        comp = cat_component(cat, module_id, sel.role)
        extras += comp.pip_extras
        sys_pkgs += comp.system_packages
        if sel.model and sel.artifact:
            art = cat.models[sel.model].artifact(sel.artifact)
            extras += art.pip_extras
            sys_pkgs += art.system_packages
    extras = list(dict.fromkeys(extras))
    if extras:
        me.step(f"Python ekleri kuruluyor: {', '.join(extras)}", P_PIP[0])
        await pip_extras.install_extras(extras, me.log)
    me.progress(P_PIP[1], "Python ekleri hazır")

    # 4) Sistem paketleri (otomatik kurulmaz)
    hint = pip_extras.system_package_hint(sys_pkgs)
    warnings: list[str] = []
    if hint:
        msg = f"UYARI: Sistem paketleri otomatik kurulmaz. Gerekirse şunu çalıştırın: {hint}"
        me.log(msg)
        warnings.append(msg)
    me.progress(P_SYSPKG[1], "Sistem paketleri denetlendi")

    # 5) İndirme
    me.raise_if_cancelled()
    downloaded = await _download_step(cat, report, profile, me.scaled(*P_DOWNLOAD))

    # 6) LLM motoru
    me.raise_if_cancelled()
    # (sunucuya devredilen bileşenler `delegated` olduğundan istemcide yalnız yerel LLM'ler başlatılır)
    engine_info = await _engine_step(cat, report, profile, me.scaled(*P_ENGINE))
    if engine_info and engine_info.get("error"):
        warnings.append(f"LLM motoru başlatılamadı: {engine_info['error']}")

    # 7) Kayıt
    me.progress(P_RECORD[0], "Kurulum kaydediliyor")
    config = {
        "components": [
            {
                "role": s.role,
                "model": s.model,
                "artifact": s.artifact,
                "delegated": s.delegated,
                "optional": s.optional,
            }
            for s in report.selected
        ],
        "with_optional": with_optional,
        "artifacts": artifacts_override or {},
    }
    with session_scope() as sess:
        row = sess.get(InstalledModule, module_id)
        if row is None:
            row = InstalledModule(module_id=module_id)
            sess.add(row)
        row.target = report.target
        row.enabled = True
        row.installed_at = utcnow()
        row.config_json = json.dumps(config, ensure_ascii=False)

    # 8) Sağlık
    me.progress(98, "Modül sağlık denetimi")
    health = await _health_step(module_id, me)
    me.progress(100, f"{mod.name} kuruldu")
    result = {
        "module_id": module_id,
        "target": report.target,
        "status": report.status,
        "recommendation": report.recommendation,
        "downloaded": downloaded,
        "engine": engine_info,
        "warnings": warnings,
        "health": health,
        "dependencies_installed": missing,
    }
    if job is not None and not _stack:
        job.set_result(result)
    return result


def submit_install(
    module_id: str, target: str = "auto", artifacts: dict[str, str] | None = None, with_optional: bool = False
) -> str:
    """Kurulumu iş kuyruğuna alır, job_id döner (çalışan olay döngüsü içinden çağrılır)."""
    validate_install_request(module_id, artifacts)

    async def run(job: JobContext) -> dict:
        return await install_module(module_id, target, artifacts, with_optional, job)

    return get_job_manager().submit("install", module_id, run)


# ───────────────────────────── kaldırma ─────────────────────────────


def _pairs_of(row: InstalledModule) -> set[tuple[str, str]]:
    cfg = _module_config(row)
    return {
        (c["model"], c["artifact"])
        for c in cfg.get("components", [])
        if c.get("model") and c.get("artifact") and not c.get("delegated")
    }


async def uninstall_module(module_id: str, force: bool = False) -> dict:
    """Modülü kaldırır; paylaşılan modelleri yalnız başka kurulu modül kullanmıyorsa siler."""
    init_db()
    cat = get_catalog()
    s = get_settings()
    with session_scope() as sess:
        row = sess.get(InstalledModule, module_id)
        if row is None:
            raise InstallError(f"'{module_id}' kurulu değil", code="not_installed")
        others = [r for r in sess.scalars(select(InstalledModule)).all() if r.module_id != module_id]
        dependents = [
            r.module_id
            for r in others
            if r.module_id in cat.modules and module_id in cat.modules[r.module_id].depends_on
        ]
        if dependents and not force:
            raise InstallError(
                f"Bu modüle bağlı kurulu modüller var: {', '.join(dependents)}",
                code="has_dependents",
                hint="Önce bağlı modülleri kaldırın ya da force=true gönderin",
            )
        mine = _pairs_of(row)
        used_elsewhere: set[tuple[str, str]] = set()
        for r in others:
            used_elsewhere |= _pairs_of(r)
        sess.delete(row)

    removed, kept = [], []
    state = engine.load_state(s)
    models_root = s.models_dir.resolve()
    for pair in sorted(mine):
        if pair in used_elsewhere:
            kept.append({"model": pair[0], "artifact": pair[1]})
            continue
        if state is not None and (state.model_id, state.artifact_id) == pair:
            await engine.stop_llm(state, s)
            state = None
        with session_scope() as sess:
            m = sess.get(InstalledModel, pair)
            path = m.path if m else ""
            if m is not None:
                sess.delete(m)
        if path.startswith("ollama:"):
            if shutil.which("ollama"):
                await asyncio.to_thread(
                    subprocess.run,
                    ["ollama", "rm", path[len("ollama:") :]],
                    capture_output=True,
                    timeout=60,
                    check=False,
                )
        elif path:
            p = Path(path).resolve()
            # güvenlik: yalnız models_dir altındaki klasörler silinir
            if p != models_root and models_root in p.parents and p.exists():
                await asyncio.to_thread(shutil.rmtree, p, True)
                parent = p.parent
                if parent != models_root and parent.exists() and not any(parent.iterdir()):
                    parent.rmdir()
        removed.append({"model": pair[0], "artifact": pair[1]})
    return {"module_id": module_id, "removed_models": removed, "kept_models": kept}


# ───────────────────────────── başlangıç ─────────────────────────────

_boot_key: tuple | None = None


def bootstrap(restart_engine: bool = True) -> None:
    """Süreç başına bir kez: tablolar, yarım işlerin kurtarılması, kayıtlı LLM motor adresinin yüklenmesi.
    (Mimar `api/app.py` lifespan'ına eklerse burada tekrar çalışmaz.)"""
    global _boot_key
    s = get_settings()
    key = (id(s), str(s.db_path))
    if _boot_key == key:
        return
    _boot_key = key
    init_db()
    get_job_manager()
    try:
        engine.restore_engine_state(s, restart=restart_engine)
    except Exception as e:  # noqa: BLE001
        log.warning("LLM motor durumu yüklenemedi: %s", e)


def reset_bootstrap() -> None:
    global _boot_key
    _boot_key = None
