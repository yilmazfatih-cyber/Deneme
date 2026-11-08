"""Katalog uç noktaları: modül kartları, modül ayrıntısı, gereksinim raporu, model kayıtları, kapasite planı."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from ...catalog import get_catalog
from ...hardware.compat import check_module, plan_all
from ...hardware.probe import cached_probe
from ...installer import installer
from ._errors import error_response, not_found

router = APIRouter(prefix="/api/catalog", tags=["katalog"])

TargetQ = Literal["auto", "server", "client"]


@router.get("/modules")
def list_modules() -> list[dict]:
    """Mağaza kartları; her kart için uygunluk özeti (profil 60 sn önbellekli)."""
    installer.bootstrap()
    cat = get_catalog()
    profile = cached_probe()
    pairs = installer.installed_pairs()
    inst = {m["module_id"]: m for m in installer.list_installed()}
    inst_ids = set(inst)
    cards = []
    for m in cat.modules.values():
        r = check_module(cat, m.id, profile, pairs, installed_modules=inst_ids)
        cards.append(
            {
                "id": m.id,
                "niche_code": m.niche_code,
                "name": m.name,
                "tagline": m.tagline,
                "package": m.package,
                "tier": m.tier,
                "status": m.status,
                "installed": m.id in inst,
                "enabled": inst[m.id]["enabled"] if m.id in inst else False,
                "compat": {
                    "status": r.status,
                    "recommendation": r.recommendation,
                    "disk_gb": r.totals.disk_gb,
                    "ram_gb": r.totals.ram_gb,
                    "vram_gb": r.totals.vram_gb,
                },
            }
        )
    return cards


@router.get("/modules/{module_id}")
def get_module(module_id: str, target: TargetQ = "auto"):
    installer.bootstrap()
    cat = get_catalog()
    if module_id not in cat.modules:
        return not_found(f"modül '{module_id}'", "GET /api/catalog/modules")
    m = cat.modules[module_id]
    r = check_module(
        cat,
        module_id,
        cached_probe(),
        installer.installed_pairs(),
        target,
        with_optional=True,
        installed_modules=installer.installed_module_ids(),
    )
    resolved = []
    for sel in r.selected:
        item = sel.model_dump()
        if sel.model and sel.artifact:
            art = cat.models[sel.model].artifact(sel.artifact)
            item.update(
                hf_repo=art.hf_repo,
                hf_files=art.hf_files,
                catalog_disk_gb=art.disk_gb,
                catalog_ram_gb=art.ram_gb,
                catalog_vram_gb=art.vram_gb,
            )
        resolved.append(item)
    return {
        **m.model_dump(mode="json"),
        "installed": module_id in installer.installed_module_ids(),
        "resolved_components": resolved,
    }


@router.get("/modules/{module_id}/requirements")
def get_requirements(
    module_id: str,
    target: TargetQ = "auto",
    with_optional: bool = False,
    concurrent_users: int = Query(8, ge=1, le=1000),
):
    installer.bootstrap()
    cat = get_catalog()
    if module_id not in cat.modules:
        return not_found(f"modül '{module_id}'", "GET /api/catalog/modules")
    r = check_module(
        cat,
        module_id,
        cached_probe(),
        installer.installed_pairs(),
        target,
        concurrent_users,
        with_optional=with_optional,
        installed_modules=installer.installed_module_ids(),
    )
    return r.model_dump()


def _model_card(model, installed: dict) -> dict:
    d = model.model_dump(mode="json")
    d["installed_artifacts"] = [
        installed[(model.id, a.id)] for a in model.artifacts if (model.id, a.id) in installed
    ]
    return d


@router.get("/models")
def list_models() -> list[dict]:
    installer.bootstrap()
    inst = {(r["model_id"], r["artifact_id"]): r for r in installer.list_installed_models()}
    return [_model_card(m, inst) for m in get_catalog().models.values()]


@router.get("/models/{model_id}")
def get_model(model_id: str):
    installer.bootstrap()
    cat = get_catalog()
    if model_id not in cat.models:
        return not_found(f"model '{model_id}'", "GET /api/catalog/models")
    inst = {(r["model_id"], r["artifact_id"]): r for r in installer.list_installed_models()}
    return _model_card(cat.models[model_id], inst)


@router.get("/plan")
def get_plan(modules: str, target: TargetQ = "auto", concurrent_users: int = Query(8, ge=1, le=1000)):
    """Toplu kapasite planı: `?modules=a,b,c` (bağımlılıklar dahil, paylaşılan modeller bir kez)."""
    installer.bootstrap()
    cat = get_catalog()
    ids = [x.strip() for x in modules.split(",") if x.strip()]
    unknown = [x for x in ids if x not in cat.modules]
    if not ids or unknown:
        return error_response(
            400, "bad_request", f"Bilinmeyen ya da boş modül listesi: {', '.join(unknown) or '-'}"
        )
    return plan_all(cat, cached_probe(), ids, target, concurrent_users, installed=installer.installed_pairs())
