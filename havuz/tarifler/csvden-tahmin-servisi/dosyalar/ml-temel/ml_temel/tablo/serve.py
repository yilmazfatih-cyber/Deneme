"""Tahmin servisi: kayıtlı tablo modelini (model.npz, pickle'sız) küçük bir HTTP sunucusuyla sunar.

    python -m ml_temel sun --model ciktilar/x/model.npz            # http://127.0.0.1:8445
Uçlar (JSON, UTF-8):
  GET  /saglik   {"durum": "ok", "gorev", "hedef", "siniflar"}      — anahtarsız da açık
  GET  /sema     girdi alanları ve türleri (serve_schema.InputSchema.describe)
  POST /tahmin   {"satirlar": [{...}, ...]} → {"tahminler": [{"_kimlik", "tahmin", "olasiliklar"}]}
Hata gövdesi: {"hata": {"kod", "ileti", "ayrintilar"}}; kodlar: dogrulama (400), anahtar (401),
bulunamadi (404), yontem (405), uzunluk (411), buyuk (413), json_degil (415), ic (500).
Güvenlik: varsayılan yalnız 127.0.0.1; ML_TEMEL_ANAHTAR tanımlıysa `Authorization: Bearer <anahtar>`
zorunlu (ağa açmak için şart; cli.py denetler); gövde en çok 1 MiB ve 1000 satır; CORS yok.
Neden stdlib `http.server` (FastAPI değil): paketin tek bağımlılığı numpy kalsın (KARARLAR K01).
Genişletme: yeni uç → `do_GET`/`do_POST` içine dal + messages.py metni + tests/test_serve.py.
"""

from __future__ import annotations

import hmac
import json
import sys
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import numpy as np

from ml_temel.persistence import load_model
from ml_temel.tablo.messages import t
from ml_temel.tablo.model import TabularModel
from ml_temel.tablo.schema import label_text
from ml_temel.tablo.serve_schema import InputError, InputSchema

MAX_BODY_BYTES = 1024 * 1024
KEY_VARIABLE = "ML_TEMEL_ANAHTAR"


class PredictionService:
    """Model + girdi şeması + kilit. HTTP'den bağımsızdır (testler doğrudan çağırır)."""

    def __init__(self, model: TabularModel, extra: dict[str, Any]) -> None:
        self.model = model
        self.schema = InputSchema.from_model(model, extra)
        self._lock = threading.Lock()  # tahminler sırayla: aynı model nesnesi paylaşılıyor

    @classmethod
    def from_file(cls, path: str, threshold: float | None = None) -> PredictionService:
        model, extra = load_model(path)
        if not isinstance(model, TabularModel):
            raise ValueError(t("sunucu_model_degil", yol=path))
        if threshold is not None:
            model.threshold = threshold
        return cls(model, extra)

    def class_names(self) -> list[str] | None:
        if self.model.classes is None:
            return None
        return [label_text(c) for c in self.model.classes.tolist()]

    def health(self) -> dict[str, Any]:
        return {
            "durum": "ok",
            "gorev": self.model.task,
            "hedef": self.model.target,
            "siniflar": self.class_names(),
        }

    def predict(self, body: Any) -> dict[str, Any]:
        table, ids = self.schema.validate(body)
        with self._lock:
            if self.model.task == "regresyon":
                values = self.model.predict(table).tolist()
                rows = [
                    {"_kimlik": i, "tahmin": float(v)} for i, v in zip(ids, values, strict=True)
                ]
                return {"tahminler": rows}
            labels = [label_text(value) for value in self.model.predict(table).tolist()]
            probabilities = np.round(self.model.predict_proba(table), 6).tolist()
        names = self.class_names() or []
        results = []
        for row_id, label, row in zip(ids, labels, probabilities, strict=True):
            chances = {name: float(p) for name, p in zip(names, row, strict=True)}
            results.append({"_kimlik": row_id, "tahmin": label, "olasiliklar": chances})
        return {"tahminler": results}


class HttpError(Exception):
    def __init__(
        self, status: int, code: str, message: str, details: list[dict[str, str]] | None = None
    ) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details or []


def make_handler(service: PredictionService, key: str | None) -> type[BaseHTTPRequestHandler]:
    """Servise ve (varsa) API anahtarına bağlı istek işleyici sınıfı."""

    class Handler(BaseHTTPRequestHandler):
        server_version = "ml-temel"
        sys_version = ""

        def _send_json(self, status: int, data: dict[str, Any]) -> None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _send_error(self, error: HttpError) -> None:
            detail = {"kod": error.code, "ileti": error.message, "ayrintilar": error.details}
            self._send_json(error.status, {"hata": detail})

        def _check_key(self) -> None:
            if key is None:
                return
            header = self.headers.get("Authorization", "")
            given = header[7:].strip() if header[:7] in ("Bearer ", "bearer ") else ""
            if not hmac.compare_digest(given.encode(), key.encode()):
                raise HttpError(401, "anahtar", t("sunucu_anahtar"))

        def _read_body(self) -> Any:
            if "application/json" not in self.headers.get("Content-Type", ""):
                raise HttpError(415, "json_degil", t("sunucu_json_degil"))
            length = self.headers.get("Content-Length", "")
            if not length.isdigit():
                raise HttpError(411, "uzunluk", t("sunucu_uzunluk"))
            if int(length) > MAX_BODY_BYTES:
                raise HttpError(413, "buyuk", t("sunucu_buyuk", sinir=MAX_BODY_BYTES // 1024))
            raw = self.rfile.read(int(length))
            try:
                return json.loads(raw.decode("utf-8"), parse_constant=_reject_constant)
            except (UnicodeDecodeError, ValueError) as error:
                raise HttpError(400, "dogrulama", t("sunucu_json_bozuk")) from error

        def _run(self, work: Callable[[], dict[str, Any]]) -> None:
            try:
                self._send_json(200, work())
            except HttpError as error:
                self._send_error(error)
            except InputError as error:
                self._send_error(HttpError(400, "dogrulama", str(error), error.details))
            except Exception as error:  # beklenmeyen: ayrıntı yalnız sunucu günlüğüne
                print(t("sunucu_beklenmeyen", hata=repr(error)), file=sys.stderr)
                self._send_error(HttpError(500, "ic", t("sunucu_ic_hata")))

        def _schema(self) -> dict[str, Any]:
            self._check_key()
            return service.schema.describe()

        def _predict(self) -> dict[str, Any]:
            self._check_key()  # anahtar gövde okunmadan önce denetlenir
            return service.predict(self._read_body())

        def do_GET(self) -> None:
            if self.path == "/saglik":
                self._run(service.health)
            elif self.path == "/sema":
                self._run(self._schema)
            else:
                self._send_error(HttpError(404, "bulunamadi", t("sunucu_yol_yok")))

        def do_POST(self) -> None:
            if self.path == "/tahmin":
                self._run(self._predict)
            else:
                self._send_error(HttpError(404, "bulunamadi", t("sunucu_yol_yok")))

        def do_PUT(self) -> None:
            self._send_error(HttpError(405, "yontem", t("sunucu_yontem")))

        def do_PATCH(self) -> None:
            self.do_PUT()

        def do_DELETE(self) -> None:
            self.do_PUT()

    return Handler


def _reject_constant(value: str) -> Any:
    """JSON'daki NaN/Infinity yazımlarını reddeder (standart JSON'da yoktur)."""
    raise ValueError(value)


def make_server(
    service: PredictionService, host: str, port: int, key: str | None
) -> ThreadingHTTPServer:
    """Dinlemeye hazır sunucu (testler kapı 0 verip gerçek kapıyı `server_address`'ten okur)."""
    server = ThreadingHTTPServer((host, port), make_handler(service, key))
    server.daemon_threads = True
    return server
