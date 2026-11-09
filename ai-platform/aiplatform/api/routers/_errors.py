"""Sözleşmedeki hata gövdesi: {"error": {"code", "message", "hint"}}."""

from __future__ import annotations

from fastapi.responses import JSONResponse


def error_response(status: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message, "hint": hint}}
    )


def not_found(what: str, hint: str | None = None) -> JSONResponse:
    return error_response(404, "not_found", f"Bulunamadı: {what}", hint)


# InstallError.code → HTTP durum kodu
INSTALL_ERROR_STATUS = {
    "not_found": 404,
    "bad_request": 400,
    "not_installed": 409,
    "has_dependents": 409,
    "incompatible": 409,
}


def from_install_error(e) -> JSONResponse:  # e: installer.InstallError
    return error_response(INSTALL_ERROR_STATUS.get(e.code, 400), e.code, str(e), getattr(e, "hint", None))
