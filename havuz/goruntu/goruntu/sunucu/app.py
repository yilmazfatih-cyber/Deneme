"""FastAPI uygulaması: görüntü sınıflandırma, metinle arama, benzer görüntü.

Uçlar:
    GET  /saglik        {"durum": "ok", "siniflandirici": bool, "dizin": öğe sayısı | null}
    POST /siniflandir   çok parçalı form, alan `dosya` → etiket, güven, emin_degil, ilk
    POST /ara           JSON {"metin": "...", "k": 5} → sonuclar [{yol, kimlik, benzerlik}]
    POST /benzer        çok parçalı form, alan `dosya`, sorgu `?k=5` → sonuclar (birebir aynı dosya hariç)
Güvenlik (`gate.py`): gövde sınırı okunmadan önce; yerel kipte Host/Origin; isteğe bağlı API anahtarı.
Görüntüler `load_rgb` ile açılır: piksel sınırı, biçim beyaz listesi, EXIF yönü. Hata iletileri Türkçe
JSON (`{"hata": …, "neden": …}`); iz sürme dışarı verilmez. Belgeler (/docs) kapalı.
Uçlar eşzamanlı (`def`): model çalışırken olay döngüsü bloklanmaz (FastAPI iş parçacığı havuzu).

Kim kullanır: `sun` komutu, `tests/test_server.py`.
Genişletme: yeni uç → bu dosyaya ekleyin; dosya yüklüyorsa `gate.UPLOAD_PATHS`'e yolunu yazın.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from goruntu.errors import ImageRejectedError, UserError
from goruntu.hazirlik.loader import load_rgb
from goruntu.io_utils import sha256_bytes
from goruntu.messages import t
from goruntu.sunucu.gate import RequestGate
from goruntu.sunucu.state import ServerState


class SearchBody(BaseModel):
    metin: str = Field(min_length=1, max_length=500)
    k: int = Field(5, ge=1, le=50)


def _read_upload(state: ServerState, upload: UploadFile) -> bytes:
    limit = state.limits.max_bytes
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, t("sunucu.govde_buyuk", mb=f"{limit / 1024 / 1024:.1f}"))
    return data


def _results(
    state: ServerState, query: Any, k: int, exclude: set[str] | None = None
) -> dict[str, Any]:
    results = state.index.search(query, k, exclude) if state.index is not None else []
    return {
        "sonuclar": [
            {"yol": item.yol, "kimlik": item.kimlik, "benzerlik": round(score, 6)}
            for item, score in results
        ]
    }


def create_app(state: ServerState) -> FastAPI:
    app = FastAPI(title="goruntu", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(RequestGate, state=state)

    @app.exception_handler(ImageRejectedError)
    def rejected(_request: Request, error: ImageRejectedError) -> JSONResponse:
        return JSONResponse({"hata": str(error), "neden": error.reason}, status_code=400)

    @app.exception_handler(UserError)
    def user_error(_request: Request, error: UserError) -> JSONResponse:
        return JSONResponse({"hata": str(error)}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    def http_error(_request: Request, error: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"hata": str(error.detail)}, status_code=error.status_code)

    def need(component: Any, message: str) -> None:
        if component is None:
            raise HTTPException(503, message)

    @app.get("/saglik")
    def health() -> dict[str, Any]:
        size = len(state.index) if state.index is not None else None
        return {"durum": "ok", "siniflandirici": state.classifier is not None, "dizin": size}

    @app.post("/siniflandir")
    def classify(dosya: UploadFile = File(...)) -> dict[str, Any]:  # noqa: B008
        need(state.classifier, t("sunucu.model_yok"))
        image = load_rgb(_read_upload(state, dosya), state.limits)
        return dict(state.classifier.predict([image], 3)[0].to_dict())  # type: ignore[union-attr]

    @app.post("/ara")
    def search(body: SearchBody) -> dict[str, Any]:
        need(state.index, t("sunucu.dizin_yok"))
        if not state.embedder.supports_text:  # type: ignore[union-attr]
            raise HTTPException(400, t("arama.metin_desteklenmiyor", model=state.embedder.name))  # type: ignore[union-attr]
        return _results(state, state.embedder.embed_texts([body.metin]), body.k)  # type: ignore[union-attr]

    @app.post("/benzer")
    def similar(dosya: UploadFile = File(...), k: int = Query(5, ge=1, le=50)) -> dict[str, Any]:  # noqa: B008
        need(state.index, t("sunucu.dizin_yok"))
        data = _read_upload(state, dosya)
        query = state.embedder.embed_images([load_rgb(data, state.limits)])  # type: ignore[union-attr]
        return _results(state, query, k, exclude={sha256_bytes(data)})  # birebir aynı dosya hariç

    return app
