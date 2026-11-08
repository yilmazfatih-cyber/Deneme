"""FastAPI uygulaması — kontrol düzlemi + modül çalıştırma + OpenAI uyumlu geçit.

Yönlendirici dosyaları ayrı paketlerce yazılır; burada yalnız bir araya getirilir:
  system, catalog, modules, jobs   → aiplatform/api/routers/{system,catalog,modules,jobs}.py   (çekirdek)
  run, gateway                      → aiplatform/api/routers/{run,gateway}.py                   (modüller + KVKK)
  erp, audit, approvals             → aiplatform/api/routers/{erp,audit,approvals}.py           (ERP entegrasyonu)
Statik yönetim arayüzü: aiplatform/web/ → "/"
"""

from __future__ import annotations

import importlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ..config import get_settings
from ..db import init_db

log = logging.getLogger("aiplatform")

ROUTERS = [
    "aiplatform.api.routers.system",
    "aiplatform.api.routers.catalog",
    "aiplatform.api.routers.modules",
    "aiplatform.api.routers.jobs",
    "aiplatform.api.routers.run",
    "aiplatform.api.routers.gateway",
    "aiplatform.api.routers.erp",
    "aiplatform.api.routers.audit",
    "aiplatform.api.routers.approvals",
]

# Modül çalışma zamanlarının kayıt olması için içe aktarılır (her biri @register kullanır)
RUNTIME_PACKAGES = ["aiplatform.modules.runtimes"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_dirs()
    init_db()
    for pkg in RUNTIME_PACKAGES:
        try:
            importlib.import_module(pkg)
        except ModuleNotFoundError as e:
            log.warning("çalışma zamanı paketi yüklenemedi: %s (%s)", pkg, e)
    log.info("aiplatform %s rolünde %s:%s", settings.role, settings.host, settings.port)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Yerel AI Platformu",
        version="0.1.0",
        description="ERP'ye eklenti olarak çalışan, modül modül kurulan, KVKK uyumlu yerel yapay zekâ platformu",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # ERP arayüzü farklı kaynaktan çağırabilir; üretimde daraltın
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for mod in ROUTERS:
        try:
            m = importlib.import_module(mod)
        except ModuleNotFoundError as e:
            log.warning("yönlendirici eksik: %s (%s)", mod, e)
            continue
        app.include_router(m.router)

    web_dir = Path(__file__).resolve().parents[1] / "web"
    if web_dir.exists():
        app.mount("/", StaticFiles(directory=str(web_dir), html=True), name="web")
    return app


app = create_app()
