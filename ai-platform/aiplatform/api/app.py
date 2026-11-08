"""FastAPI uygulaması — kontrol düzlemi + modül çalıştırma + OpenAI uyumlu geçit.

Yönlendirici dosyaları ayrı paketlerce yazılır; burada yalnız bir araya getirilir:
  system, catalog, modules, jobs   → aiplatform/api/routers/{system,catalog,modules,jobs}.py   (çekirdek)
  run, gateway, kvkk                → aiplatform/api/routers/{run,gateway,kvkk}.py                   (modüller + KVKK)
  erp, audit, approvals             → aiplatform/api/routers/{erp,audit,approvals}.py           (ERP entegrasyonu)
Statik yönetim arayüzü: aiplatform/web/ → "/"
"""

from __future__ import annotations

import importlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    "aiplatform.api.routers.kvkk",
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
    try:  # yarım işleri kurtar, kayıtlı LLM motor adresini yükle, ölmüş llama-server'ı yeniden başlat
        from ..installer.installer import bootstrap

        bootstrap()
    except Exception as e:  # noqa: BLE001 — kurulum paketi eksikse platform yine de açılır
        log.warning("kurulum durumu yüklenemedi: %s", e)
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
    # Sözleşme: tüm hatalar {"error": {"code", "message", "hint"}} biçiminde döner
    @app.exception_handler(HTTPException)
    async def _http_error(_, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            return JSONResponse(status_code=exc.status_code, content=detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": f"http_{exc.status_code}", "message": str(detail), "hint": None}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "İstek gövdesi veya parametreler şemaya uymuyor",
                    "hint": "; ".join(f"{'.'.join(str(x) for x in e.get('loc', []))}: {e.get('msg')}" for e in exc.errors()[:5]),
                }
            },
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
