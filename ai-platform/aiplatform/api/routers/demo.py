"""Demo ERP uçları (/api/demo/...) — satış demolarında "ERP ekranları" için gerçek çalışan arka uç.

Veri kaynağı örnek ERP'dir (`erp/mock_erp.py`, bağlantı kimliği "ornek-erp"). Okumalar `run_readonly` üzerinden
salt-okunur SQL'dir. AI düğmeleri platformun modül çalışma zamanlarını `POST /api/modules/{id}/run/{action}` ile aynı
kurallarla çağırır: kurulu değilse 409 `not_installed`, hazır değilse 503, LLM yoksa sunucunun Türkçe hatası aynen döner.
Hiçbir yanıt uydurulmaz; hazır SQL sorguları "Hazır sorgu" etiketi taşır, AI gibi sunulmaz.

Gelen evrak kuyruğu `data_dir/demo/evrak.db` (SQLite) içindedir; ERP veritabanını kirletmez.
"""

from __future__ import annotations

import asyncio
import functools
import inspect
import json
import logging
import re
import shutil
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from ...config import get_settings
from ...erp.connector import ErpError
from ._errors import error_response, not_found

log = logging.getLogger("aiplatform.api.demo")

router = APIRouter(prefix="/api/demo", tags=["demo"])

DEMO_CONN = "ornek-erp"
DEMO_MODULES = [
    "fatura-cikarim",
    "dogal-dil-sql",
    "kayit-eslestirme",
    "finans-hesap",
    "ozetleme",
    "yazma-asistani",
    "kvkk-kalkani",
    "zaman-serisi",
    "pdf-ayristirma",
]
WRITE_TOOL = "fatura_oneri_olustur"
EVRAK_STATES = ("bekliyor", "okundu", "onerildi")
REPO_ASSETS = Path(__file__).resolve().parents[3] / "docs" / "demo"

# Kasıtlı benzer (mükerrer) cari kayıtları: başka bir kullanıcı aynı firmayı farklı yazımla yeniden açmış gibi.
# VKN'ler sağlama algoritmasıyla üretilmiş sentetik numaralardır.
DUPLICATE_CARI = [
    {"unvan": "MÜŞTERİ 07 LTD ŞTİ", "ilk9": "246955730", "il": "Manisa", "risk_sinifi": "D"},
    {"unvan": "TEDARİKÇİ 03 ANONİM ŞİRKETİ", "ilk9": "923991630", "il": "Antalya", "risk_sinifi": "B"},
]


class DemoError(Exception):
    def __init__(self, status: int, code: str, message: str, hint: str | None = None, **extra: Any):
        super().__init__(message)
        self.status, self.code, self.message, self.hint, self.extra = status, code, message, hint, extra

    def response(self) -> JSONResponse:
        resp = error_response(self.status, self.code, self.message, self.hint)
        if self.extra:
            body = json.loads(resp.body)
            body.update(self.extra)
            resp = JSONResponse(status_code=self.status, content=body)
        return resp


def _from_erp(e: ErpError) -> DemoError:
    if e.code == "connection_not_found":
        return DemoError(
            409,
            "demo_not_ready",
            "Demo verisi henüz kurulmadı.",
            '"Demo verisini kur" düğmesine basın (POST /api/demo/setup).',
        )
    return DemoError(e.status_code, e.code, e.message, e.hint)


def guarded(fn):
    """DemoError / ErpError → sözleşme biçiminde hata gövdesi."""
    if inspect.iscoroutinefunction(fn):

        @functools.wraps(fn)
        async def aw(*a, **kw):
            try:
                return await fn(*a, **kw)
            except DemoError as e:
                return e.response()
            except ErpError as e:
                return _from_erp(e).response()

        return aw

    @functools.wraps(fn)
    def w(*a, **kw):
        try:
            return fn(*a, **kw)
        except DemoError as e:
            return e.response()
        except ErpError as e:
            return _from_erp(e).response()

    return w


def _user(request: Request | None) -> str:
    if request is None:
        return "demo"
    return (request.headers.get("x-aip-user") or request.headers.get("x-user") or "demo")[:128]


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


# ----------------------------------------------------------------------------- yollar ve evrak veritabanı


def demo_dir() -> Path:
    d = get_settings().data_dir / "demo"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _docs_dir() -> Path:
    return demo_dir() / "belgeler"


def _evrak_con() -> sqlite3.Connection:
    con = sqlite3.connect(demo_dir() / "evrak.db")
    con.row_factory = sqlite3.Row
    con.execute(
        """CREATE TABLE IF NOT EXISTS evrak_kuyrugu (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             dosya_adi TEXT NOT NULL UNIQUE,
             yol TEXT NOT NULL,
             tur TEXT NOT NULL,
             durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor','okundu','onerildi')),
             cikarim_json TEXT,
             created_at TEXT NOT NULL,
             goruntu_yol TEXT,
             aciklama TEXT,
             approval_id TEXT,
             oneri_json TEXT
           )"""
    )
    return con


def _evrak_row(eid: int) -> dict:
    con = _evrak_con()
    try:
        r = con.execute("SELECT * FROM evrak_kuyrugu WHERE id = ?", (eid,)).fetchone()
    finally:
        con.close()
    if r is None:
        raise DemoError(404, "not_found", f"Bulunamadı: evrak {eid}", "GET /api/demo/evrak")
    return dict(r)


def _evrak_update(eid: int, **cols: Any) -> None:
    con = _evrak_con()
    try:
        sets = ", ".join(f"{k} = ?" for k in cols)
        con.execute(f"UPDATE evrak_kuyrugu SET {sets} WHERE id = ?", (*cols.values(), eid))
        con.commit()
    finally:
        con.close()


def _approval_brief(aid: str | None) -> dict | None:
    if not aid:
        return None
    try:
        from ...erp.approvals import get_approval

        a = get_approval(aid)
    except Exception:  # noqa: BLE001 - onay kaydı silinmiş olabilir
        return None
    res = a.get("result") or {}
    return {"id": a["id"], "status": a["status"], "result": res.get("result") if res.get("ok") else None}


def _evrak_public(r: dict, full: bool = False) -> dict:
    out = {
        "id": r["id"],
        "dosya_adi": r["dosya_adi"],
        "tur": r["tur"],
        "durum": r["durum"],
        "aciklama": r["aciklama"],
        "goruntu": bool(r["goruntu_yol"]),
        "created_at": r["created_at"],
        "has_cikarim": bool(r["cikarim_json"]),
        "approval_id": r["approval_id"],
        "approval": _approval_brief(r["approval_id"]),
    }
    if full:
        out["cikarim"] = json.loads(r["cikarim_json"]) if r["cikarim_json"] else None
        out["oneri"] = json.loads(r["oneri_json"]) if r["oneri_json"] else None
    return out


# ----------------------------------------------------------------------------- örnek ERP


def _ensure_connection() -> tuple[dict, bool]:
    """Örnek ERP bağlantısını kurar (varsa dokunmaz). Dönüş: (bağlantı, yeni_mi)."""
    from ...db import session_scope
    from ...erp.models import ErpConnection
    from . import erp as erp_router

    with session_scope() as s:
        existed = s.get(ErpConnection, DEMO_CONN) is not None
    res = erp_router.create_demo_connection()
    if isinstance(res, JSONResponse):
        body = json.loads(res.body)
        err = body.get("error", {})
        raise DemoError(
            res.status_code,
            err.get("code", "erp_error"),
            err.get("message", "Örnek ERP kurulamadı"),
            err.get("hint"),
        )
    return res, not existed


def _mock_db_path() -> Path:
    from ...erp.connector import get_connector

    url = getattr(get_connector(DEMO_CONN), "url", "")
    if not url.startswith("sqlite:///"):
        raise DemoError(409, "demo_not_mock", "'ornek-erp' bağlantısı SQLite örnek ERP'si değil.")
    return Path(url[len("sqlite:///") :])


def _seed_duplicates(db: Path) -> int:
    """Kayıt eşleştirme demosu için benzer yazımlı iki cari ekler (yoksa). Örnek ERP'nin kendi dosyasına yazar."""
    from ...erp.mock_erp import vkn_check_digit

    con = sqlite3.connect(db)
    added = 0
    try:
        for d in DUPLICATE_CARI:
            if con.execute("SELECT 1 FROM cari WHERE unvan = ?", (d["unvan"],)).fetchone():
                continue
            vkn = d["ilk9"] + vkn_check_digit(d["ilk9"])
            if con.execute("SELECT 1 FROM cari WHERE vkn = ?", (vkn,)).fetchone():
                continue
            con.execute(
                "INSERT INTO cari (unvan, vkn, il, risk_sinifi) VALUES (?,?,?,?)",
                (d["unvan"], vkn, d["il"], d["risk_sinifi"]),
            )
            added += 1
        con.commit()
    finally:
        con.close()
    return added


def _q(sql: str, max_rows: int = 200) -> dict:
    from ...erp.connector import run_readonly

    res = run_readonly(DEMO_CONN, sql, timeout_s=10, max_rows=max_rows)
    cols = res["columns"]
    return {
        "rows": [dict(zip(cols, row)) for row in res["rows"]],
        "columns": cols,
        "truncated": res.get("truncated", False),
        "sql": res.get("sql", sql),
    }


# ----------------------------------------------------------------------------- belgeler


def _copy_assets() -> list[dict]:
    """docs/demo/ altındaki örnek belgeleri data_dir/demo/belgeler/ içine kopyalar; yoksa yerinde üretir."""
    dst = _docs_dir()
    dst.mkdir(parents=True, exist_ok=True)
    src_manifest = REPO_ASSETS / "manifest.json"
    if src_manifest.exists():
        manifest = json.loads(src_manifest.read_text(encoding="utf-8"))
        for it in manifest["belgeler"]:
            for name in filter(None, [it["dosya_adi"], it.get("goruntu")]):
                s, d = REPO_ASSETS / name, dst / name
                if s.exists() and (not d.exists() or d.stat().st_size != s.stat().st_size):
                    shutil.copyfile(s, d)
        (dst / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return manifest["belgeler"]
    try:
        from ...erp.demo_assets import generate

        return generate(dst)["belgeler"]
    except (ImportError, FileNotFoundError) as e:
        raise DemoError(
            500,
            "demo_assets_missing",
            f"Örnek belgeler bulunamadı ve üretilemedi: {e}",
            "python -m aiplatform.erp.demo_assets docs/demo/",
        ) from e


def _fill_queue(docs: list[dict]) -> int:
    con = _evrak_con()
    added = 0
    try:
        for it in docs:
            path = _docs_dir() / it["dosya_adi"]
            if not path.exists():
                continue
            png = _docs_dir() / it["goruntu"] if it.get("goruntu") else None
            cur = con.execute(
                "INSERT OR IGNORE INTO evrak_kuyrugu (dosya_adi, yol, tur, durum, created_at, goruntu_yol, aciklama) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    it["dosya_adi"],
                    str(path),
                    it["tur"],
                    "bekliyor",
                    _now(),
                    str(png) if png and png.exists() else None,
                    it.get("aciklama"),
                ),
            )
            added += cur.rowcount
        con.commit()
    finally:
        con.close()
    return added


def _evrak_count() -> int:
    con = _evrak_con()
    try:
        return con.execute("SELECT COUNT(*) FROM evrak_kuyrugu").fetchone()[0]
    finally:
        con.close()


# ----------------------------------------------------------------------------- modül çağırma (run.py ile aynı kurallar)


async def run_module(
    module_id: str, action: str, payload: dict, files: dict[str, bytes] | None = None, user: str = "demo"
) -> tuple[int, dict]:
    """`POST /api/modules/{id}/run/{action}` ile aynı kurallar: kurulum denetimi, istemci→sunucu iletimi, denetim günlüğü.

    Dönüş: (HTTP durum kodu, gövde). Gövde başarıda {"result", "meta"}, hatada {"error": {...}}.
    """
    from ...catalog import get_catalog
    from ...kvkk.audit import audit_call
    from ...modules.base import ApprovalRequired, ModuleError, ModuleNotReady, RunContext, get_runtime
    from . import run as run_router

    files = files or {}
    spec = get_catalog().modules.get(module_id)
    if spec is None:
        return 404, {
            "error": {"code": "unknown_module", "message": f"Bilinmeyen modül: '{module_id}'", "hint": None}
        }
    forward = run_router.should_forward(spec)
    if not forward:
        status = run_router.installed_status(module_id)
        if status == "not_installed":
            return 409, {
                "error": {
                    "code": "not_installed",
                    "message": f"'{spec.name}' modülü kurulu değil",
                    "hint": f"POST /api/modules/{module_id}/install",
                },
                "module": module_id,
            }
        if status == "disabled":
            return 409, {
                "error": {
                    "code": "module_disabled",
                    "message": f"'{spec.name}' modülü devre dışı",
                    "hint": f"POST /api/modules/{module_id}/enable",
                },
                "module": module_id,
            }
    ctx = RunContext(user=user, role=get_settings().role, files=files, request_id=uuid.uuid4().hex)
    rec = None
    server_meta: dict = {}
    try:
        async with audit_call(user, module_id, action, payload) as rec:
            if forward:
                result, server_meta, masked = await run_router.forward_to_server(
                    spec, action, payload, files, user
                )
                rec.model = server_meta.get("model")
                rec.masked_entities = masked
            else:
                run_router._ensure_runtimes()
                result = await get_runtime(module_id).run(action, payload, ctx)
                rec.model = ctx.extra.get("model")
                rec.masked_entities = int(ctx.extra.get("masked_entities", 0))
    except ApprovalRequired as e:
        return 202, {
            "approval_id": e.approval_id,
            "message": str(e),
            "meta": {"module": module_id, "action": action},
        }
    except ModuleNotReady as e:
        return 503, {
            "error": {
                "code": "not_ready",
                "message": str(e),
                "hint": f"POST /api/modules/{module_id}/install",
            },
            "module": module_id,
        }
    except ModuleError as e:
        return 400, {"error": {"code": "module_error", "message": str(e), "hint": None}, "module": module_id}
    except run_router._ForwardError as e:
        return e.status, e.body
    except Exception as e:
        log.exception("demo modül çağrısı başarısız: %s/%s", module_id, action)
        return 500, {
            "error": {
                "code": "internal_error",
                "message": f"Beklenmeyen hata: {type(e).__name__}: {e}",
                "hint": "Sunucu günlüğüne bakın",
            }
        }
    meta = {
        "module": module_id,
        "action": action,
        "model": rec.model,
        "duration_ms": rec.duration_ms,
        "masked_entities": rec.masked_entities,
    }
    if forward:
        meta["executed_on"] = "sunucu"
    meta.update({k: v for k, v in (ctx.extra.get("meta") or {}).items() if k not in meta})
    return 200, {"result": result, "meta": meta}


def _module_states() -> dict[str, str]:
    from . import run as run_router

    return {m: run_router.installed_status(m) for m in DEMO_MODULES}


async def _llm_state() -> dict:
    try:
        from ...installer import engine

        h = await engine.llm_health(get_settings().llm_base_url, timeout=1.5)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
    return {
        "ok": bool(h.get("ok")),
        "models": h.get("models") or [],
        "url": h.get("url"),
        "error": h.get("error"),
    }


# ----------------------------------------------------------------------------- kurulum ve durum


def _company() -> dict:
    from ...erp.demo_assets import COMPANY

    return COMPANY


@router.post("/setup")
@guarded
async def setup():
    """Örnek ERP bağlantısını kurar, örnek belgeleri kopyalar, evrak kuyruğunu doldurur. İdempotenttir."""
    conn, created = await asyncio.to_thread(_ensure_connection)
    dup = await asyncio.to_thread(_seed_duplicates, await asyncio.to_thread(_mock_db_path))
    docs = await asyncio.to_thread(_copy_assets)
    added = await asyncio.to_thread(_fill_queue, docs)
    return {
        "connection_id": conn["id"],
        "connection_created": created,
        "evrak_sayisi": await asyncio.to_thread(_evrak_count),
        "eklenen_evrak": added,
        "eklenen_benzer_cari": dup,
        "modules": await asyncio.to_thread(_module_states),
        "llm": await _llm_state(),
        "sirket": _company(),
    }


@router.get("/durum")
@guarded
async def status():
    """Yan etkisiz durum: demo kurulu mu, hangi modüller kurulu, LLM sağlığı."""
    from ...erp.connector import list_connections

    ready = any(c["id"] == DEMO_CONN for c in await asyncio.to_thread(list_connections))
    return {
        "ready": ready and (demo_dir() / "evrak.db").exists(),
        "connection_id": DEMO_CONN if ready else None,
        "evrak_sayisi": await asyncio.to_thread(_evrak_count) if (demo_dir() / "evrak.db").exists() else 0,
        "modules": await asyncio.to_thread(_module_states),
        "llm": await _llm_state(),
        "sirket": _company(),
    }


# ----------------------------------------------------------------------------- gelen evrak


@router.get("/evrak")
@guarded
def list_evrak():
    con = _evrak_con()
    try:
        rows = [dict(r) for r in con.execute("SELECT * FROM evrak_kuyrugu ORDER BY id")]
    finally:
        con.close()
    return {"items": [_evrak_public(r) for r in rows], "total": len(rows)}


@router.get("/evrak/{eid}")
@guarded
def get_evrak(eid: int):
    r = _evrak_row(eid)
    return {**_evrak_public(r, full=True), "sayfa_sayisi": _page_count(Path(r["yol"]))}


def _page_count(path: Path) -> int | None:
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return None
    try:
        doc = pdfium.PdfDocument(str(path))
    except Exception:  # noqa: BLE001
        return None
    try:
        return len(doc)
    finally:
        doc.close()


def _safe_path(p: str | None) -> Path:
    if not p:
        raise DemoError(404, "not_found", "Bulunamadı: bu evrakın görüntüsü yok")
    path = Path(p).resolve()
    if demo_dir().resolve() not in path.parents or not path.exists():
        raise DemoError(404, "not_found", "Bulunamadı: evrak dosyası", "Demo verisini yeniden kurun.")
    return path


@router.get("/evrak/{eid}/file")
@guarded
def evrak_file(eid: int, goruntu: bool = False):
    r = _evrak_row(eid)
    path = _safe_path(r["goruntu_yol"] if goruntu else r["yol"])
    media = "image/png" if path.suffix.lower() == ".png" else "application/pdf"
    return FileResponse(path, media_type=media, filename=path.name, content_disposition_type="inline")


@router.get("/evrak/{eid}/sayfa/{page}.png")
@guarded
def evrak_page_png(eid: int, page: int):
    """PDF sayfasının önizleme görüntüsü (pypdfium2; tarayıcının PDF görüntüleyicisi olmadan da önizleme için)."""
    r = _evrak_row(eid)
    path = _safe_path(r["yol"])
    out = demo_dir() / "onizleme" / f"{eid}_{page}.png"
    if not out.exists():
        try:
            import pypdfium2 as pdfium
        except ImportError as e:
            raise DemoError(
                503, "not_ready", "PDF önizleme için 'pypdfium2' kurulu değil", "pip install pypdfium2"
            ) from e
        doc = pdfium.PdfDocument(str(path))
        try:
            if not 1 <= page <= len(doc):
                raise DemoError(404, "not_found", f"Bulunamadı: sayfa {page}")
            img = doc[page - 1].render(scale=1.6).to_pil()
        finally:
            doc.close()
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, optimize=True)
    return FileResponse(out, media_type="image/png")


class OkuIn(BaseModel):
    kaynak: str = Field(default="pdf", pattern="^(pdf|goruntu)$")


@router.post("/evrak/{eid}/oku")
@guarded
async def evrak_oku(eid: int, request: Request, body: OkuIn | None = None):
    """fatura-cikarim/extract'ı evrak dosyasıyla çağırır; sonucu kuyruğa yazar. Hata aynen iletilir (409/503/400)."""
    body = body or OkuIn()
    r = await asyncio.to_thread(_evrak_row, eid)
    if r["tur"] not in ("fatura", "irsaliye"):
        raise DemoError(
            400,
            "unsupported_type",
            "Bu evrak fatura veya irsaliye değil; alan çıkarımı uygulanmaz.",
            'Sözleşme için "Özetle" düğmesini kullanın.',
        )
    path = _safe_path(r["goruntu_yol"] if body.kaynak == "goruntu" else r["yol"])
    data = await asyncio.to_thread(path.read_bytes)
    code, res = await run_module(
        "fatura-cikarim",
        "extract",
        {"schema_id": r["tur"], "filename": path.name},
        {"file": data},
        _user(request),
    )
    if code != 200:
        return JSONResponse(status_code=code, content=res)
    stored = {**res["result"], "meta": res["meta"], "kaynak": body.kaynak, "okundu_at": _now()}
    await asyncio.to_thread(
        _evrak_update,
        eid,
        cikarim_json=json.dumps(stored, ensure_ascii=False),
        durum="okundu" if r["durum"] == "bekliyor" else r["durum"],
    )
    return {**res, "evrak": _evrak_public(await asyncio.to_thread(_evrak_row, eid))}


def _pdf_text(path: Path) -> str:
    try:
        import pdfplumber
    except ImportError as e:
        raise DemoError(
            503, "not_ready", "'pdfplumber' kurulu değil — modül mağazasından 'pdf-ayristirma' kurun"
        ) from e
    with pdfplumber.open(path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


@router.post("/evrak/{eid}/ozetle")
@guarded
async def evrak_ozetle(eid: int, request: Request):
    """PDF metin katmanını (AI değil, pdfplumber) okuyup özetleme modülüne verir."""
    r = await asyncio.to_thread(_evrak_row, eid)
    text = await asyncio.to_thread(_pdf_text, _safe_path(r["yol"]))
    code, res = await run_module(
        "ozetleme", "summarize", {"text": text, "style": "yonetici", "max_words": 160}, None, _user(request)
    )
    if code != 200:
        return JSONResponse(status_code=code, content=res)
    return {**res, "kaynak_metin_uzunlugu": len(text)}


class OnerIn(BaseModel):
    fields: dict[str, Any] | None = None
    lines: list[dict[str, Any]] | None = None


_URN = re.compile(r"\bURN-\d{4}\b", re.IGNORECASE)


def _iso_date(v: Any) -> str | None:
    s = str(v or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return s
    m = re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def map_to_erp(fields: dict, lines: list[dict]) -> tuple[dict, dict, list[str]]:
    """Çıkarılan (veya elle girilen) alanları örnek ERP yazma aracının argümanlarına çevirir.

    Cari: satıcı VKN'si → cari.vkn (yoksa unvan benzerliği ≥ 90). Kalem: açıklamadaki ürün kodu (URN-xxxx),
    yoksa stok adı benzerliği ≥ 85. Dönüş: (args, eşleşme ayrıntısı, sorunlar).
    """
    from ...modules.runtimes.fatura_cikarim import to_number

    cariler = _q("SELECT id, unvan, vkn FROM cari ORDER BY id", 1000)["rows"]
    stoklar = _q("SELECT urun_kodu, ad, birim_fiyat FROM stok ORDER BY urun_kodu", 1000)["rows"]
    problems: list[str] = []
    eslesme: dict[str, Any] = {"cari": None, "kalemler": []}

    vkn = re.sub(r"\D", "", str(fields.get("satici_vkn") or fields.get("gonderen_vkn") or ""))
    unvan = str(fields.get("satici_unvan") or fields.get("gonderen_unvan") or "").strip()
    cari = next((c for c in cariler if vkn and c["vkn"] == vkn), None)
    if cari:
        eslesme["cari"] = {**cari, "yontem": "VKN"}
    elif unvan:
        try:
            from rapidfuzz import fuzz, process

            from ...modules.runtimes.kayit_eslestirme import normalize_name

            best = process.extractOne(
                normalize_name(unvan),
                {c["id"]: normalize_name(c["unvan"]) for c in cariler},
                scorer=fuzz.token_set_ratio,
            )
            if best and best[1] >= 90:
                cari = next(c for c in cariler if c["id"] == best[2])
                eslesme["cari"] = {**cari, "yontem": f"unvan benzerliği %{best[1]:.0f}"}
        except ImportError:
            pass
    if cari is None:
        problems.append(f"Satıcı ERP'de bulunamadı (VKN: {vkn or '—'}, unvan: {unvan or '—'}).")

    kalemler = []
    names = {s["urun_kodu"]: s["ad"] for s in stoklar}
    for i, ln in enumerate(lines or [], 1):
        text = " ".join(str(ln.get(k) or "") for k in ("urun_kodu", "aciklama"))
        m = _URN.search(text)
        kod, yontem = (m.group(0).upper(), "ürün kodu") if m and m.group(0).upper() in names else (None, None)
        if kod is None and text.strip():
            try:
                from rapidfuzz import fuzz, process

                best = process.extractOne(
                    text.lower(), {k: v.lower() for k, v in names.items()}, scorer=fuzz.token_set_ratio
                )
                if best and best[1] >= 85:
                    kod, yontem = best[2], f"ad benzerliği %{best[1]:.0f}"
            except ImportError:
                pass
        miktar = to_number(ln.get("miktar"))
        fiyat = to_number(ln.get("birim_fiyat"))
        if kod is None:
            problems.append(f'{i}. kalem stokta eşlenemedi: "{text.strip() or "—"}".')
            continue
        if not miktar or miktar < 1:
            problems.append(f"{i}. kalemde miktar yok veya 1'den küçük.")
            continue
        k: dict[str, Any] = {"urun_kodu": kod, "miktar": round(miktar)}
        if fiyat is not None and fiyat >= 0:
            k["birim_fiyat"] = round(fiyat, 2)
        kalemler.append(k)
        eslesme["kalemler"].append({**k, "ad": names[kod], "yontem": yontem})
    if not lines:
        problems.append("Kalem yok.")
    args: dict[str, Any] = {"cari_id": cari["id"] if cari else None, "kalemler": kalemler}
    tarih = _iso_date(fields.get("tarih"))
    if tarih:
        args["tarih"] = tarih
    return args, eslesme, problems


@router.post("/evrak/{eid}/oner")
@guarded
async def evrak_oner(eid: int, request: Request, body: OnerIn | None = None):
    """ERP'ye öneri fatura kaydı: örnek ERP'nin onaylı yazma aracı için insan onayı kaydı açar (202 + approval_id).

    Gövdede `fields`/`lines` verilirse (arayüzde düzeltilmiş form) onlar kullanılır; yoksa kayıtlı çıkarım.
    Onaylanınca `fatura` tablosuna 'onay_bekliyor' durumunda kayıt düşer. Onaysız hiçbir şey yazılmaz.
    """
    from ...erp.approvals import create_approval

    body = body or OnerIn()
    r = await asyncio.to_thread(_evrak_row, eid)
    if r["tur"] != "fatura":
        raise DemoError(400, "unsupported_type", "Yalnız faturalar ERP'ye öneri kayıt olarak açılabilir.")
    if r["approval_id"]:
        brief = _approval_brief(r["approval_id"])
        if brief and brief["status"] in ("pending", "approved", "executed"):
            raise DemoError(
                409,
                "already_proposed",
                "Bu evrak için zaten bir öneri kaydı var.",
                f"Onay kutusuna bakın (onay: {r['approval_id']}).",
                approval_id=r["approval_id"],
            )
    stored = json.loads(r["cikarim_json"]) if r["cikarim_json"] else None
    manuel = body.fields is not None and stored is None
    fields = body.fields if body.fields is not None else (stored or {}).get("fields")
    lines = body.lines if body.lines is not None else (stored or {}).get("lines")
    if not fields:
        raise DemoError(
            400,
            "no_extraction",
            "Önce evrakı okuyun veya alanları elle doldurun.",
            '"AI ile oku" düğmesi (fatura-cikarim modülü) ya da formu elle doldurun.',
        )
    args, eslesme, problems = await asyncio.to_thread(map_to_erp, fields, lines or [])
    if problems:
        raise DemoError(
            422,
            "mapping_incomplete",
            "Öneri kaydı ERP kayıtlarıyla eşlenemedi.",
            " ".join(problems),
            sorunlar=problems,
            eslesme=eslesme,
        )
    validation = None
    try:
        from ...modules.runtimes.fatura_cikarim import validate

        validation = validate(fields, lines or [])
    except Exception as e:  # noqa: BLE001 - doğrulama yalnız bilgi amaçlı; öneri yine açılır
        log.debug("öneri doğrulaması hesaplanamadı: %s", e)
    payload = {
        "connection_id": DEMO_CONN,
        "args": args,
        "kaynak": {
            "evrak_id": eid,
            "dosya_adi": r["dosya_adi"],
            "belge_no": fields.get("belge_no"),
            "satici_unvan": fields.get("satici_unvan"),
            "genel_toplam": fields.get("genel_toplam"),
            "giris": "elle girildi (AI kullanılmadı)" if manuel else "AI çıkarımı + insan kontrolü",
            "dogrulama": {
                "ok": validation["ok"],
                "passed": validation["passed"],
                "total": validation["total"],
            }
            if validation
            else None,
        },
    }
    aid = await asyncio.to_thread(create_approval, "erp", WRITE_TOOL, payload, _user(request))
    await asyncio.to_thread(
        _evrak_update,
        eid,
        durum="onerildi",
        approval_id=aid,
        oneri_json=json.dumps({"args": args, "eslesme": eslesme, "manuel": manuel}, ensure_ascii=False),
    )
    return JSONResponse(
        status_code=202,
        content={
            "approval_id": aid,
            "message": "Öneri kayıt insan onayına gönderildi. Onaylanınca ERP'ye 'onay_bekliyor' durumunda yazılır.",
            "args": args,
            "eslesme": eslesme,
            "manuel": manuel,
        },
    )


# ----------------------------------------------------------------------------- cari, fatura, stok, satış


def _fold(s: Any) -> str:
    return str(s or "").replace("İ", "i").replace("I", "ı").casefold()


CARI_SQL = (
    "SELECT c.id, c.unvan, c.vkn, c.il, c.risk_sinifi, "
    "ROUND(COALESCE(SUM(CASE WHEN f.durum <> 'iptal' THEN f.toplam END), 0), 2) AS toplam_ciro, "
    "COUNT(f.id) AS fatura_sayisi "
    "FROM cari c LEFT JOIN fatura f ON f.cari_id = c.id GROUP BY c.id, c.unvan, c.vkn, c.il, c.risk_sinifi ORDER BY c.id"
)


@router.get("/cari")
@guarded
def list_cari(q: str = "", limit: int = 200):
    res = _q(CARI_SQL, 1000)
    rows = res["rows"]
    if q.strip():
        needle = _fold(q.strip())
        rows = [r for r in rows if any(needle in _fold(r[k]) for k in ("unvan", "vkn", "il"))]
    return {"items": rows[: max(1, min(limit, 500))], "total": len(rows), "sql": res["sql"]}


@router.get("/cari/{cid}")
@guarded
def get_cari(cid: int):
    c = _q(f"SELECT id, unvan, vkn, il, risk_sinifi FROM cari WHERE id = {int(cid)}", 1)["rows"]
    if not c:
        raise DemoError(404, "not_found", f"Bulunamadı: cari {cid}")
    faturalar = _q(
        f"SELECT id, tarih, tutar, kdv, toplam, durum FROM fatura WHERE cari_id = {int(cid)} ORDER BY tarih DESC, id DESC LIMIT 50",
        50,
    )
    aylik = _q(
        "SELECT substr(tarih, 1, 7) AS ay, ROUND(SUM(toplam), 2) AS toplam, COUNT(*) AS adet FROM fatura "
        f"WHERE cari_id = {int(cid)} AND durum <> 'iptal' GROUP BY substr(tarih, 1, 7) ORDER BY ay DESC LIMIT 12",
        12,
    )
    ozet = _q(
        "SELECT durum, COUNT(*) AS adet, ROUND(SUM(toplam), 2) AS toplam FROM fatura "
        f"WHERE cari_id = {int(cid)} GROUP BY durum ORDER BY durum",
        20,
    )
    return {
        "cari": c[0],
        "faturalar": faturalar["rows"],
        "aylik": list(reversed(aylik["rows"])),
        "durum_ozeti": ozet["rows"],
    }


def _cari_text(d: dict) -> str:
    c = d["cari"]
    lines = [
        f"Cari kart: {c['unvan']} (VKN {c['vkn']}, {c['il']}, risk sınıfı {c['risk_sinifi']}).",
        "Fatura durumu özeti: "
        + "; ".join(f"{o['durum']}: {o['adet']} adet, {o['toplam']} TL" for o in d["durum_ozeti"])
        + ".",
        "Son 12 ay aylık toplamlar (KDV dahil): "
        + "; ".join(f"{a['ay']}: {a['toplam']} TL ({a['adet']} fatura)" for a in d["aylik"])
        + ".",
        "Son faturalar: "
        + "; ".join(f"#{f['id']} {f['tarih']} {f['toplam']} TL {f['durum']}" for f in d["faturalar"][:15])
        + ".",
    ]
    return "\n".join(lines)


@router.post("/cari/{cid}/ozetle")
@guarded
async def cari_ozetle(cid: int, request: Request):
    """Cari kartı ve faturaları metne çevirir (SQL, AI değil), metni özetleme modülüne verir."""
    d = await asyncio.to_thread(get_cari.__wrapped__, cid)
    text = _cari_text(d)
    code, res = await run_module(
        "ozetleme", "summarize", {"text": text, "style": "yonetici", "max_words": 120}, None, _user(request)
    )
    if code != 200:
        return JSONResponse(status_code=code, content={**res, "kaynak_metin": text})
    return {**res, "kaynak_metin": text}


class MukerrerIn(BaseModel):
    threshold: float = Field(default=95, ge=50, le=100)


@router.post("/cari/mukerrer")
@guarded
async def cari_mukerrer(request: Request, body: MukerrerIn | None = None):
    """Cari unvanlarında mükerrer adayları: kayit-eslestirme/find_duplicates (RapidFuzz; model gerekmez)."""
    body = body or MukerrerIn()
    rows = (await asyncio.to_thread(_q, "SELECT id, unvan, vkn, il FROM cari ORDER BY id", 5000))["rows"]
    records = [{"id": r["id"], "unvan": r["unvan"]} for r in rows]
    code, res = await run_module(
        "kayit-eslestirme",
        "find_duplicates",
        {"records": records, "threshold": body.threshold, "fields": ["unvan"]},
        None,
        _user(request),
    )
    if code != 200:
        return JSONResponse(status_code=code, content=res)
    by_id = {r["id"]: r for r in rows}
    pairs = [
        {**p, "a_cari": by_id.get(p["a"]), "b_cari": by_id.get(p["b"])}
        for p in res["result"].get("pairs", [])
    ]
    return {"result": {**res["result"], "pairs": pairs}, "meta": res["meta"]}


FATURA_FILTERS = {
    "tumu": "",
    "onay_bekliyor": "f.durum = 'onay_bekliyor'",
    "odenmemis": "f.durum IN ('acik', 'vadesi_gecti')",
    "acik": "f.durum = 'acik'",
    "vadesi_gecti": "f.durum = 'vadesi_gecti'",
    "odendi": "f.durum = 'odendi'",
    "iptal": "f.durum = 'iptal'",
}


@router.get("/fatura")
@guarded
def list_fatura(durum: str = "tumu", cari_id: int | None = None, limit: int = 100):
    if durum not in FATURA_FILTERS:
        raise DemoError(
            400, "bad_filter", f"Geçersiz durum filtresi: '{durum}'", "Geçerli: " + ", ".join(FATURA_FILTERS)
        )
    conds = [
        c for c in (FATURA_FILTERS[durum], f"f.cari_id = {int(cari_id)}" if cari_id is not None else "") if c
    ]
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    n = max(1, min(int(limit), 300))
    res = _q(
        "SELECT f.id, f.tarih, c.unvan, f.tutar, f.kdv, f.toplam, f.durum FROM fatura f JOIN cari c ON c.id = f.cari_id"
        f"{where} ORDER BY CASE WHEN f.durum = 'onay_bekliyor' THEN 0 ELSE 1 END, f.tarih DESC, f.id DESC LIMIT {n}",
        n,
    )
    counts = _q("SELECT durum, COUNT(*) AS adet FROM fatura GROUP BY durum ORDER BY durum", 20)["rows"]
    return {
        "items": res["rows"],
        "counts": {c["durum"]: c["adet"] for c in counts},
        "truncated": res["truncated"],
        "sql": res["sql"],
    }


@router.get("/stok")
@guarded
def list_stok():
    res = _q("SELECT urun_kodu, ad, miktar, birim_fiyat FROM stok ORDER BY urun_kodu LIMIT 200", 200)
    return {"items": res["rows"]}


@router.get("/satis-aylik")
@guarded
def satis_aylik():
    res = _q("SELECT ay, tutar, adet FROM satis_aylik ORDER BY ay LIMIT 120", 120)
    return {"items": res["rows"]}


# ----------------------------------------------------------------------------- hazır sorgular (AI DEĞİL)

HAZIR_SORGULAR = [
    {
        "id": "ciro-ilk10-2025",
        "baslik": "2025'te ciroya göre ilk 10 müşteri",
        "aciklama": "İptal hariç satış faturaları, KDV hariç tutar.",
        "sql": "SELECT c.unvan, c.il, ROUND(SUM(f.tutar), 2) AS ciro_kdv_haric, COUNT(*) AS fatura_sayisi "
        "FROM fatura f JOIN cari c ON c.id = f.cari_id "
        "WHERE f.tarih >= '2025-01-01' AND f.tarih < '2026-01-01' AND f.durum <> 'iptal' AND c.unvan NOT LIKE 'Tedarikçi%' "
        "GROUP BY c.id, c.unvan, c.il ORDER BY ciro_kdv_haric DESC LIMIT 10",
    },
    {
        "id": "odenmemis",
        "baslik": "Ödenmemiş faturalar",
        "aciklama": "Açık ve vadesi geçmiş faturalar, en eskisi üstte.",
        "sql": "SELECT f.id, f.tarih, c.unvan, f.toplam, f.durum FROM fatura f JOIN cari c ON c.id = f.cari_id "
        "WHERE f.durum IN ('acik', 'vadesi_gecti') ORDER BY f.tarih LIMIT 200",
    },
    {
        "id": "son-12-ay",
        "baslik": "Son 12 ay aylık satış",
        "aciklama": "satis_aylik tablosu, en yeni ay üstte.",
        "sql": "SELECT ay, tutar, adet FROM satis_aylik ORDER BY ay DESC LIMIT 12",
    },
    {
        "id": "kritik-stok",
        "baslik": "Kritik stok (150 adetten az)",
        "aciklama": "Stok miktarı 150'nin altındaki ürünler.",
        "sql": "SELECT urun_kodu, ad, miktar, birim_fiyat FROM stok WHERE miktar < 150 ORDER BY miktar LIMIT 100",
    },
    {
        "id": "riskli-acik",
        "baslik": "C ve D risk sınıfındaki carilerin açık bakiyesi",
        "aciklama": "Açık + vadesi geçmiş faturaların KDV dahil toplamı.",
        "sql": "SELECT c.unvan, c.risk_sinifi, COUNT(f.id) AS fatura, ROUND(SUM(f.toplam), 2) AS acik_bakiye "
        "FROM cari c JOIN fatura f ON f.cari_id = c.id WHERE c.risk_sinifi IN ('C', 'D') "
        "AND f.durum IN ('acik', 'vadesi_gecti') GROUP BY c.id, c.unvan, c.risk_sinifi ORDER BY acik_bakiye DESC LIMIT 50",
    },
]


@router.get("/hazir-sorgular")
def list_hazir():
    return {
        "etiket": "Hazır sorgu",
        "not": "Bu sorgular önceden yazılmış SQL'dir; yapay zekâ üretmez.",
        "items": [{**s, "etiket": "Hazır sorgu"} for s in HAZIR_SORGULAR],
    }


@router.post("/hazir-sorgular/{qid}/calistir")
@guarded
def run_hazir(qid: str):
    s = next((x for x in HAZIR_SORGULAR if x["id"] == qid), None)
    if s is None:
        return not_found(f"hazır sorgu '{qid}'", "GET /api/demo/hazir-sorgular")
    from ...erp.connector import run_readonly

    res = run_readonly(DEMO_CONN, s["sql"], timeout_s=10, max_rows=200)
    return {"sorgu": {**s, "etiket": "Hazır sorgu"}, **res}
