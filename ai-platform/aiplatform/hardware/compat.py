"""Donanım uygunluk denetimi ve kapasite planı.

`check_module` bir modülün bu donanımda kurulup kurulamayacağını hesaplar ve `CompatibilityReport` döner
(alan adları `docs/MIMARI.md` sözleşmesiyle aynıdır). Kurallar:

* `gpu_required` bileşen ve GPU yok → **fail**; GPU yok ama bileşen GPU'dan yararlanıyorsa → **warn** + `cpu_note`.
* `shared=True` ve aynı model/artifact zaten kuruluysa disk ve bellek **0** sayılır.
* LLM bileşenlerine KV önbellek payı eklenir: `0.25 GB × eş zamanlı kullanıcı` (GPU varsa VRAM'e, yoksa RAM'e).
* Kurulu kullanım + yeni gereksinim kapasiteye oranlanır: > %90 → fail, > %75 → warn.
* İstemci rolünde, hedefi `server` olan bileşenler yerelde sayılmaz (`delegated: true`): sunucuda çalışır.

Bellek hesabı: GPU'da çalışan bileşen VRAM'e `vram_gb`, RAM'e yalnız `ram_gb - vram_gb` (konak payı) yazar;
CPU'da çalışan bileşen RAM'e `ram_gb` yazar. Apple birleşik bellekte RAM ve VRAM aynı havuzdur; RAM denetimi ikisinin
toplamıyla yapılır.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel, Field

from ..catalog.schema import Catalog, Component, ModelArtifact, ModelSpec, ModuleSpec, Runtime
from .probe import HardwareProfile

Status = Literal["ok", "warn", "fail"]
TargetArg = Literal["auto", "server", "client"]

KV_GB_PER_USER = 0.25
FAIL_PCT = 90.0
WARN_PCT = 75.0
_ORDER = {"ok": 0, "warn": 1, "fail": 2}


# ───────────────────────────── rapor tipleri ─────────────────────────────


class SelectedComponent(BaseModel):
    role: str
    model: str | None = None
    artifact: str | None = None
    runtime: str | None = None
    disk_gb: float = 0.0
    ram_gb: float = 0.0
    vram_gb: float = 0.0
    kv_cache_gb: float = 0.0
    on_gpu: bool = False
    shared_already_installed: bool = False
    delegated: bool = False
    optional: bool = False
    gpu_required: bool = False
    cpu_note: str | None = None
    note: str | None = None


class AfterInstall(BaseModel):
    vram_used_gb: float = 0.0
    vram_total_gb: float = 0.0
    vram_pct: float = 0.0
    ram_used_gb: float = 0.0
    ram_total_gb: float = 0.0
    ram_pct: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    disk_pct: float = 0.0


class Totals(BaseModel):
    disk_gb: float = 0.0
    ram_gb: float = 0.0
    vram_gb: float = 0.0
    after_install: AfterInstall = Field(default_factory=AfterInstall)


class Check(BaseModel):
    id: str
    status: Status
    message: str
    required: float | None = None
    available: float | None = None


class CompatibilityReport(BaseModel):
    module_id: str
    target: Literal["server", "client"]
    status: Status
    selected: list[SelectedComponent] = Field(default_factory=list)
    totals: Totals = Field(default_factory=Totals)
    checks: list[Check] = Field(default_factory=list)
    missing_dependencies: list[str] = Field(default_factory=list)
    skipped_optional: list[str] = Field(
        default_factory=list, description="with_optional=False iken sayılmayan roller"
    )
    recommendation: str = ""
    profile_tier: str = "T0"
    module_tier: str = "T0"


# ───────────────────────────── yardımcılar ─────────────────────────────


def fmt_gb(x: float) -> str:
    """Türkçe sayı biçimi: 26 → '26', 26.5 → '26,5'."""
    r = round(x, 1)
    if abs(r - round(r)) < 1e-9:
        return str(round(r))
    return f"{r:.1f}".replace(".", ",")


def _pct(used: float, total: float) -> float:
    return round(used / total * 100, 1) if total > 0 else 0.0


def _worst(statuses: Iterable[str]) -> Status:
    w: Status = "ok"
    for s in statuses:
        if _ORDER[s] > _ORDER[w]:
            w = s  # type: ignore[assignment]
    return w


def resolve_target(target: str, profile: HardwareProfile) -> Literal["server", "client"]:
    if target in ("server", "client"):
        return target  # type: ignore[return-value]
    return profile.role


def is_llm(component: Component, model: ModelSpec | None) -> bool:
    return component.role == "llm" or (model is not None and "chat" in model.capabilities)


def vllm_capable(profile: HardwareProfile) -> bool:
    return profile.has_nvidia and profile.docker.gpu_runtime


def artifact_usage(artifact: ModelArtifact, profile: HardwareProfile) -> tuple[float, float, bool]:
    """(ram_gb, vram_gb, on_gpu): bu donanımda artifact'in kaba bellek kullanımı (KV payı hariç)."""
    on_gpu = profile.has_gpu and artifact.vram_gb > 0
    if artifact.runtime == Runtime.vllm and not profile.has_nvidia:
        on_gpu = False
    if on_gpu:
        return max(artifact.ram_gb - artifact.vram_gb, 0.0), artifact.vram_gb, True
    return artifact.ram_gb, 0.0, False


def candidate_artifacts(model: ModelSpec, profile: HardwareProfile, target: str) -> list[ModelArtifact]:
    """Tercih sırası: sunucu + NVIDIA + Docker GPU varsa vLLM, sonra llama.cpp, sonra diğerleri.
    vLLM yapılamıyorsa vLLM artifact'leri, GPU yoksa gpu_required olanlar sona atılır."""
    arts = list(model.artifacts)
    order: list[ModelArtifact] = []
    if resolve_target(target, profile) == "server" and vllm_capable(profile):
        order += [a for a in arts if a.runtime == Runtime.vllm]
    order += [a for a in arts if a.runtime == Runtime.llamacpp and a not in order]
    order += [a for a in arts if a not in order]

    def penalty(a: ModelArtifact) -> int:
        p = 0
        if a.runtime == Runtime.vllm and not vllm_capable(profile):
            p += 1
        if a.gpu_required and not profile.has_gpu:
            p += 1
        return p

    return sorted(order, key=penalty)  # sorted kararlıdır: aynı cezada sıra korunur


def select_artifact(
    model: ModelSpec, component: Component, profile: HardwareProfile, target: str = "auto"
) -> ModelArtifact:
    """Bileşen için artifact seçer: katalogda sabitlenmişse o, yoksa donanıma göre ilk tercih."""
    if component.artifact:
        return model.artifact(component.artifact)
    return candidate_artifacts(model, profile, target)[0]


def _runnable(a: ModelArtifact, profile: HardwareProfile) -> bool:
    if a.gpu_required and not profile.has_gpu:
        return False
    return not (a.runtime == Runtime.vllm and not vllm_capable(profile))


def infer_installed_modules(catalog: Catalog, installed: set[tuple[str, str]]) -> set[str]:
    """Kurulu modül listesi verilmediğinde: zorunlu model bileşenlerinin hepsi kurulu olan modüller."""
    models_installed = {m for m, _ in installed}
    out: set[str] = set()
    for mod in catalog.modules.values():
        needed = [c for c in mod.components if c.model and not c.optional]
        if needed and all(c.model in models_installed for c in needed):
            out.add(mod.id)
    return out


# ───────────────────────────── kapasite ─────────────────────────────


def _pair_usage(
    catalog: Catalog, model_id: str, artifact_id: str, profile: HardwareProfile, concurrent_users: int
) -> tuple[float, float, float]:
    """(disk, ram, vram) — kurulu bir model/artifact çiftinin kullanımı (LLM ise KV payı dahil)."""
    model = catalog.models.get(model_id)
    if model is None:
        return 0.0, 0.0, 0.0
    try:
        art = model.artifact(artifact_id)
    except KeyError:
        return 0.0, 0.0, 0.0
    ram, vram, on_gpu = artifact_usage(art, profile)
    if "chat" in model.capabilities:
        kv = KV_GB_PER_USER * concurrent_users
        if on_gpu:
            vram += kv
        else:
            ram += kv
    return art.disk_gb, ram, vram


def capacity(
    catalog: Catalog, profile: HardwareProfile, installed: set[tuple[str, str]], concurrent_users: int = 8
) -> dict:
    """Kurulu bileşenlerin toplam RAM/VRAM/disk kullanımı ve kalan kapasite yüzdeleri."""
    disk = ram = vram = 0.0
    items = []
    for model_id, artifact_id in sorted(installed):
        d, r, v = _pair_usage(catalog, model_id, artifact_id, profile, concurrent_users)
        disk, ram, vram = disk + d, ram + r, vram + v
        items.append(
            {
                "model": model_id,
                "artifact": artifact_id,
                "disk_gb": d,
                "ram_gb": round(r, 2),
                "vram_gb": round(v, 2),
            }
        )
    ram_total = profile.ram_gb.total
    vram_total = profile.vram_total_gb
    ram_used = ram + (vram if profile.unified_memory else 0.0)
    return {
        "installed": items,
        "used": {"disk_gb": round(disk, 2), "ram_gb": round(ram, 2), "vram_gb": round(vram, 2)},
        "total": {"disk_gb": profile.disk_gb.total, "ram_gb": ram_total, "vram_gb": vram_total},
        "free_disk_gb": profile.disk_gb.free,
        "pct": {
            "ram": _pct(ram_used, ram_total),
            "vram": _pct(vram, vram_total),
            "disk": _pct(profile.disk_gb.total - profile.disk_gb.free, profile.disk_gb.total),
        },
        "remaining": {
            "ram_gb": round(max(ram_total - ram_used, 0), 2),
            "vram_gb": round(max(vram_total - vram, 0), 2),
            "disk_gb": profile.disk_gb.free,
        },
        "unified_memory": profile.unified_memory,
        "tier": profile.tier,
    }


# ───────────────────────────── bileşen çözümleme ─────────────────────────────


def _resolve_components(
    catalog: Catalog,
    module: ModuleSpec,
    profile: HardwareProfile,
    target: Literal["server", "client"],
    installed: set[tuple[str, str]],
    artifacts: dict[str, str] | None,
    with_optional: bool,
    concurrent_users: int,
    reserved_vram: float,
) -> tuple[list[SelectedComponent], list[str]]:
    selected: list[SelectedComponent] = []
    skipped: list[str] = []
    counted: set[tuple[str, str]] = set(installed)
    vram_budget_used = reserved_vram
    vram_total = profile.vram_total_gb
    artifacts = artifacts or {}

    for comp in module.components:
        if comp.optional and not with_optional:
            skipped.append(comp.role)
            continue
        if target == "client" and comp.target.value == "server":
            selected.append(
                SelectedComponent(
                    role=comp.role,
                    model=comp.model,
                    artifact=comp.artifact,
                    delegated=True,
                    optional=comp.optional,
                    note="Bu bileşen sunucuda çalışır; bu bilgisayara kurulmaz.",
                )
            )
            continue
        if comp.model is None:
            selected.append(
                SelectedComponent(
                    role=comp.role,
                    runtime=Runtime.python.value,
                    ram_gb=comp.ram_gb,
                    optional=comp.optional,
                    note=comp.note,
                )
            )
            continue

        model = catalog.models[comp.model]
        llm = is_llm(comp, model)
        kv = KV_GB_PER_USER * concurrent_users if llm else 0.0
        override = artifacts.get(comp.role)
        if override:
            art = model.artifact(override)
        elif comp.artifact:
            art = model.artifact(comp.artifact)
        else:
            # Önce kurulu (paylaşılan) bir artifact varsa onu kullan; yoksa sığan ilk aday.
            cands = candidate_artifacts(model, profile, target)
            already = [a for a in cands if (model.id, a.id) in counted and comp.shared]
            art = already[0] if already else None
            if art is None:
                for a in cands:
                    if not _runnable(a, profile):
                        continue
                    _, v, on_gpu = artifact_usage(a, profile)
                    if (
                        on_gpu
                        and vram_total > 0
                        and (vram_budget_used + v + kv) > vram_total * FAIL_PCT / 100
                    ):
                        continue
                    art = a
                    break
            if art is None:
                art = cands[0]

        pair = (model.id, art.id)
        if comp.shared and pair in counted:
            selected.append(
                SelectedComponent(
                    role=comp.role,
                    model=model.id,
                    artifact=art.id,
                    runtime=art.runtime.value,
                    shared_already_installed=True,
                    optional=comp.optional,
                    gpu_required=art.gpu_required,
                    note="Model zaten kurulu; yeniden indirilmez."
                    if pair in installed
                    else "Aynı model bu planda bir kez sayılır.",
                )
            )
            continue
        ram, vram, on_gpu = artifact_usage(art, profile)
        if on_gpu:
            vram += kv
        else:
            ram += kv
        vram_budget_used += vram
        counted.add(pair)
        selected.append(
            SelectedComponent(
                role=comp.role,
                model=model.id,
                artifact=art.id,
                runtime=art.runtime.value,
                disk_gb=art.disk_gb,
                ram_gb=round(ram, 2),
                vram_gb=round(vram, 2),
                kv_cache_gb=kv,
                on_gpu=on_gpu,
                optional=comp.optional,
                gpu_required=art.gpu_required,
                cpu_note=art.cpu_note if (art.vram_gb > 0 and not on_gpu) else None,
                note=comp.note,
            )
        )
    return selected, skipped


# ───────────────────────────── denetimler ─────────────────────────────


def _evaluate(
    selected: list[SelectedComponent],
    profile: HardwareProfile,
    base: dict,
    catalog: Catalog,
) -> tuple[list[Check], Totals]:
    """Seçilen bileşenleri kurulu kullanımla birlikte kapasiteye oranlar."""
    need_disk = round(sum(s.disk_gb for s in selected), 2)
    need_ram = round(sum(s.ram_gb for s in selected), 2)
    need_vram = round(sum(s.vram_gb for s in selected), 2)

    used_ram = base["used"]["ram_gb"]
    used_vram = base["used"]["vram_gb"]
    ram_total = profile.ram_gb.total
    vram_total = profile.vram_total_gb
    disk_total = profile.disk_gb.total
    disk_free = profile.disk_gb.free
    disk_used = disk_total - disk_free

    ram_after = used_ram + need_ram + ((used_vram + need_vram) if profile.unified_memory else 0.0)
    vram_after = used_vram + need_vram
    checks: list[Check] = []

    # --- GPU / VRAM
    local = [s for s in selected if not s.delegated and not s.shared_already_installed]
    needs_gpu = [s for s in local if s.gpu_required]
    wants_gpu = [s for s in local if not s.on_gpu and s.cpu_note]
    if not profile.has_gpu:
        if needs_gpu:
            names = ", ".join(f"{s.role} ({s.model})" for s in needs_gpu)
            checks.append(
                Check(
                    id="vram",
                    status="fail",
                    message=f"GPU yok; şu bileşenler yalnız GPU'da çalışır: {names}.",
                    required=0,
                    available=0,
                )
            )
        elif wants_gpu:
            checks.append(
                Check(
                    id="vram",
                    status="warn",
                    message=f"GPU yok: {wants_gpu[0].cpu_note}",
                    required=0,
                    available=0,
                )
            )
        else:
            checks.append(
                Check(id="vram", status="ok", message="Bu modül GPU gerektirmez.", required=0, available=0)
            )
    else:
        vllm_bad = [s for s in local if s.runtime == Runtime.vllm.value and not vllm_capable(profile)]
        if vllm_bad:
            checks.append(
                Check(
                    id="runtime",
                    status="fail",
                    message="vLLM için NVIDIA GPU ve Docker GPU çalışma zamanı (nvidia-container-toolkit) gerekir.",
                )
            )
        pct = _pct(vram_after, vram_total)
        st: Status = "fail" if pct > FAIL_PCT else "warn" if pct > WARN_PCT else "ok"
        msg = f"{fmt_gb(need_vram)} GB VRAM gerekir; kurulu modellerle birlikte {fmt_gb(vram_after)}/{fmt_gb(vram_total)} GB (%{fmt_gb(pct)})."
        checks.append(
            Check(
                id="vram",
                status=st,
                message=msg,
                required=need_vram,
                available=round(vram_total - used_vram, 2),
            )
        )

    # --- RAM
    ram_pct = _pct(ram_after, ram_total)
    st = "fail" if ram_pct > FAIL_PCT else "warn" if ram_pct > WARN_PCT else "ok"
    label = "birleşik bellek" if profile.unified_memory else "RAM"
    need_ram_shown = need_ram + (need_vram if profile.unified_memory else 0.0)
    checks.append(
        Check(
            id="ram",
            status=st,
            message=f"{fmt_gb(need_ram_shown)} GB {label} gerekir; kurulu modellerle birlikte {fmt_gb(ram_after)}/{fmt_gb(ram_total)} GB (%{fmt_gb(ram_pct)}).",
            required=round(need_ram_shown, 2),
            available=round(ram_total - (ram_after - need_ram_shown), 2),
        )
    )

    # --- Disk
    disk_pct = _pct(disk_used + need_disk, disk_total)
    if need_disk > disk_free:
        st = "fail"
        msg = f"Yetersiz disk: {fmt_gb(need_disk)} GB gerekir, {fmt_gb(disk_free)} GB boş."
    else:
        st = "warn" if disk_pct > FAIL_PCT else "ok"
        msg = f"{fmt_gb(need_disk)} GB disk gerekir, {fmt_gb(disk_free)} GB boş."
    checks.append(Check(id="disk", status=st, message=msg, required=need_disk, available=disk_free))

    totals = Totals(
        disk_gb=need_disk,
        ram_gb=need_ram,
        vram_gb=need_vram,
        after_install=AfterInstall(
            vram_used_gb=round(vram_after, 2),
            vram_total_gb=vram_total,
            vram_pct=_pct(vram_after, vram_total),
            ram_used_gb=round(ram_after, 2),
            ram_total_gb=ram_total,
            ram_pct=ram_pct,
            disk_used_gb=round(disk_used + need_disk, 2),
            disk_total_gb=disk_total,
            disk_pct=disk_pct,
        ),
    )
    return checks, totals


def _recommendation(report: CompatibilityReport, module: ModuleSpec, profile: HardwareProfile) -> str:
    by_id = {c.id: c for c in report.checks}
    t = report.totals
    fails = [c for c in report.checks if c.status == "fail"]
    if fails:
        c = fails[0]
        if c.id == "vram" and profile.has_gpu:
            # kurulu + yeni kullanım %90 sınırının altında kalmalı
            need = math.ceil(t.after_install.vram_used_gb / (FAIL_PCT / 100))
            return f"Bu modül için en az {need} GB VRAM'li GPU gerekir ({module.tier})."
        if c.id == "vram":
            return f"Bu modül için GPU gerekir ({module.tier} katmanı): {c.message}"
        if c.id == "runtime":
            return "vLLM gerektiren bileşen için NVIDIA GPU ve Docker GPU desteği kurun ya da GGUF (llama.cpp) biçimini seçin."
        if c.id == "ram":
            return f"Yetersiz bellek: {fmt_gb(c.required or 0)} GB gerekir, {fmt_gb(max(c.available or 0, 0))} GB kullanılabilir."
        return c.message
    if by_id.get("vram") and by_id["vram"].status == "warn" and not profile.has_gpu:
        return by_id["vram"].message
    warns = [c for c in report.checks if c.status == "warn"]
    if warns:
        c = warns[0]
        if c.id == "dependencies":
            return f"Kurulabilir; önce şu modüller kurulacak: {', '.join(report.missing_dependencies)}."
        if c.id == "tier":
            return c.message
        return f"Kurulabilir ama kapasite sınırda: {c.message}"
    if all(
        s.delegated or s.shared_already_installed or (s.disk_gb == 0 and s.ram_gb == 0)
        for s in report.selected
    ) and any(s.delegated for s in report.selected):
        return f"Kurulabilir: ağır bileşenler sunucuda çalışır, bu bilgisayara {fmt_gb(t.disk_gb)} GB iner."
    if t.vram_gb > 0:
        return f"Kurulabilir: {fmt_gb(t.vram_gb)} GB VRAM gerekir, {fmt_gb(profile.vram_total_gb)} GB mevcut."
    return f"Kurulabilir: {fmt_gb(t.ram_gb)} GB RAM ve {fmt_gb(t.disk_gb)} GB disk gerekir."


_TIER_ORDER = {"T0": 0, "T1": 1, "T2": 2, "T3": 3}


def check_module(
    catalog: Catalog,
    module_id: str,
    profile: HardwareProfile,
    installed: set[tuple[str, str]],
    target: TargetArg = "auto",
    concurrent_users: int = 8,
    *,
    artifacts: dict[str, str] | None = None,
    with_optional: bool = False,
    installed_modules: set[str] | None = None,
) -> CompatibilityReport:
    """Bir modülün bu donanıma uygunluğunu hesaplar."""
    module = catalog.modules[module_id]
    tgt = resolve_target(target, profile)
    installed = set(installed)
    base = capacity(catalog, profile, installed, concurrent_users)
    selected, skipped = _resolve_components(
        catalog,
        module,
        profile,
        tgt,
        installed,
        artifacts,
        with_optional,
        concurrent_users,
        base["used"]["vram_gb"],
    )
    checks, totals = _evaluate(selected, profile, base, catalog)

    if installed_modules is None:
        installed_modules = infer_installed_modules(catalog, installed)
    missing = [d for d in module.depends_on if d not in installed_modules]
    if missing:
        checks.append(
            Check(
                id="dependencies",
                status="warn",
                message=f"Önce kurulması gereken modüller: {', '.join(missing)}.",
            )
        )
    if tgt == "server" and _TIER_ORDER[profile.tier] < _TIER_ORDER[module.tier]:
        checks.append(
            Check(
                id="tier",
                status="warn",
                message=f"Tam kalite için {module.tier} katmanı önerilir; bu makine {profile.tier}.",
            )
        )

    report = CompatibilityReport(
        module_id=module_id,
        target=tgt,
        status=_worst(c.status for c in checks),
        selected=selected,
        totals=totals,
        checks=checks,
        missing_dependencies=missing,
        skipped_optional=skipped,
        profile_tier=profile.tier,
        module_tier=module.tier,
    )
    report.recommendation = _recommendation(report, module, profile)
    return report


def dependency_closure(catalog: Catalog, module_ids: Iterable[str]) -> list[str]:
    """Bağımlılıklar önce gelecek biçimde modül listesi (topolojik sıra)."""
    order: list[str] = []
    seen: set[str] = set()

    def visit(mid: str, stack: tuple[str, ...] = ()) -> None:
        if mid in seen:
            return
        if mid in stack:
            raise ValueError(f"döngüsel bağımlılık: {' → '.join(stack + (mid,))}")
        for d in catalog.modules[mid].depends_on:
            visit(d, stack + (mid,))
        seen.add(mid)
        order.append(mid)

    for m in module_ids:
        visit(m)
    return order


def plan_all(
    catalog: Catalog,
    profile: HardwareProfile,
    module_ids: Iterable[str],
    target: TargetArg = "auto",
    concurrent_users: int = 8,
    *,
    installed: set[tuple[str, str]] | None = None,
    include_dependencies: bool = True,
    with_optional: bool = False,
) -> dict:
    """Bir modül kümesinin toplam gereksinimi (paylaşılan modeller bir kez sayılır) — kapasite planı."""
    installed = set(installed or set())
    ids = dependency_closure(catalog, module_ids) if include_dependencies else list(dict.fromkeys(module_ids))
    tgt = resolve_target(target, profile)
    base = capacity(catalog, profile, installed, concurrent_users)
    planned: set[tuple[str, str]] = set(installed)
    all_selected: list[SelectedComponent] = []
    per_module = []
    vram_reserved = base["used"]["vram_gb"]
    for mid in ids:
        sel, _ = _resolve_components(
            catalog,
            catalog.modules[mid],
            profile,
            tgt,
            planned,
            None,
            with_optional,
            concurrent_users,
            vram_reserved,
        )
        for s in sel:
            if s.model and s.artifact and not s.delegated:
                planned.add((s.model, s.artifact))
        vram_reserved += sum(s.vram_gb for s in sel)
        all_selected.extend(sel)
        per_module.append(
            {
                "module_id": mid,
                "disk_gb": round(sum(s.disk_gb for s in sel), 2),
                "ram_gb": round(sum(s.ram_gb for s in sel), 2),
                "vram_gb": round(sum(s.vram_gb for s in sel), 2),
                "components": [s.model_dump() for s in sel],
            }
        )
    checks, totals = _evaluate(all_selected, profile, base, catalog)
    status = _worst(c.status for c in checks)
    unique_models = sorted(
        {
            (s.model, s.artifact)
            for s in all_selected
            if s.model and not s.delegated and not s.shared_already_installed
        }
    )
    return {
        "target": tgt,
        "modules": ids,
        "status": status,
        "per_module": per_module,
        "unique_models": [{"model": m, "artifact": a} for m, a in unique_models],
        "totals": totals.model_dump(),
        "checks": [c.model_dump() for c in checks],
        "profile_tier": profile.tier,
        "required_tier": max(
            (catalog.modules[m].tier for m in ids), key=lambda t: _TIER_ORDER[t], default="T0"
        ),
    }
