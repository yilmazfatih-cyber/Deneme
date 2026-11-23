"""Kimlik uçları (/api/auth): giriş/çıkış, oturum bilgisi, parola değişimi, kullanıcı ve anahtar yönetimi.

Rol denetimi ara katmanda (auth/policy.py) yapılır; burada yalnız iş kuralları var.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...auth import policy, service
from ...auth.middleware import SESSION_COOKIE
from ...auth.service import AuthError
from ...config import get_settings

router = APIRouter(prefix="/api/auth", tags=["kimlik"])


def _err(e: AuthError) -> JSONResponse:
    return JSONResponse(
        status_code=e.status_code, content={"error": {"code": e.code, "message": e.message, "hint": e.hint}}
    )


def _principal(request: Request):
    return getattr(request.state, "principal", None)


def _audit(user: str, action: str, status: str = "ok", error: str | None = None) -> None:
    try:
        from ...kvkk import audit

        audit.record(user, "kimlik", action, status=status, error=error)
    except Exception as e:  # noqa: BLE001 — denetim yazılamasa da kimlik işlemi sürer
        logging.getLogger("aiplatform.auth").warning("kimlik denetim kaydı yazılamadı: %s", e)


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


class UserIn(BaseModel):
    username: str
    password: str
    role: Literal["kullanici", "onaylayici", "yonetici"] = "kullanici"
    display_name: str | None = None


class UserPatch(BaseModel):
    role: Literal["kullanici", "onaylayici", "yonetici"] | None = None
    disabled: bool | None = None
    password: str | None = None
    display_name: str | None = None


class TokenIn(BaseModel):
    username: str
    name: str = Field(min_length=1, max_length=128)
    delegate: bool = False
    days: int | None = Field(default=365, ge=1, le=3650, description="Boşsa süresiz")


@router.get("/me")
def me(request: Request):
    s = get_settings()
    p = _principal(request)
    return {
        "auth_enabled": s.auth_enabled,
        "user": p.to_dict() if p else None,
        "roles": [{"id": r, "label": policy.ROLE_LABELS[r]} for r in policy.ROLES],
        "needs_setup": s.auth_enabled and service.count_users() == 0,
    }


@router.post("/login")
def login(body: LoginIn, request: Request):
    s = get_settings()
    if not s.auth_enabled:
        return _err(AuthError("auth_disabled", "Kimlik doğrulama kapalı; giriş gerekmiyor.", status_code=400))
    ip = request.client.host if request.client else ""
    try:
        user = service.authenticate(body.username, body.password, client_ip=ip)
    except AuthError as e:
        _audit(body.username[:64] or "?", "giris", status="error", error=e.code)
        return _err(e)
    raw = service.create_session(user["username"])
    _audit(user["username"], "giris")
    resp = JSONResponse({"user": {**user, "via": "session"}})
    resp.set_cookie(
        SESSION_COOKIE,
        raw,
        max_age=s.session_hours * 3600,
        httponly=True,
        samesite="strict",
        secure=request.url.scheme == "https",
        path="/",
    )
    return resp


@router.post("/logout")
def logout(request: Request):
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        service.revoke_raw(raw)
    p = _principal(request)
    if p:
        _audit(p.username, "cikis")
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


@router.post("/password")
def change_password(body: PasswordIn, request: Request):
    p = _principal(request)
    if p is None or p.via == "local":
        return _err(AuthError("auth_disabled", "Kimlik doğrulama kapalıyken parola yoktur."))
    if p.via == "delegated":
        return _err(
            AuthError("forbidden", "İstemci düğümü üzerinden parola değiştirilemez.", status_code=403)
        )
    try:
        service.authenticate(p.username, body.current_password)
        service.update_user(p.username, password=body.new_password)
    except AuthError as e:
        if e.code == "invalid_credentials":
            e = AuthError("invalid_credentials", "Mevcut parola hatalı.", status_code=400)
        return _err(e)
    _audit(p.username, "parola_degisti")
    return {"ok": True, "message": "Parola değişti; diğer tarayıcı oturumlarınız kapatıldı."}


# ------------------------------------------------------------------ kullanıcılar (yönetici)


@router.get("/users")
def users():
    return {"items": service.list_users()}


@router.post("/users", status_code=201)
def add_user(body: UserIn, request: Request):
    try:
        u = service.create_user(body.username, body.password, body.role, body.display_name)
    except AuthError as e:
        return _err(e)
    _audit(_principal(request).username, f"kullanici_ekle:{u['username']}:{u['role']}")
    return u


@router.patch("/users/{username}")
def patch_user(username: str, body: UserPatch, request: Request):
    actor = _principal(request).username
    try:
        u = service.update_user(
            username,
            role=body.role,
            disabled=body.disabled,
            password=body.password,
            display_name=body.display_name,
            acting=actor,
        )
    except AuthError as e:
        return _err(e)
    changed = ",".join(k for k, v in body.model_dump().items() if v is not None and k != "password")
    if body.password is not None:
        changed = (changed + ",parola").strip(",")
    _audit(actor, f"kullanici_guncelle:{username}:{changed}")
    return u


# ------------------------------------------------------------------ API anahtarları (yönetici)


@router.get("/tokens")
def tokens():
    return {"items": service.list_tokens()}


@router.post("/tokens", status_code=201)
def add_token(body: TokenIn, request: Request):
    try:
        raw, rec = service.create_token(
            body.username,
            body.name,
            delegate=body.delegate,
            ttl=timedelta(days=body.days) if body.days else None,
        )
    except AuthError as e:
        return _err(e)
    _audit(_principal(request).username, f"anahtar_olustur:{body.username}:{body.name}")
    return {**rec, "token": raw, "message": "Anahtar yalnız bu kez gösterilir; güvenli bir yere kaydedin."}


@router.delete("/tokens/{token_id}")
def delete_token(token_id: str, request: Request):
    try:
        service.revoke_token(token_id)
    except AuthError as e:
        return _err(e)
    _audit(_principal(request).username, f"anahtar_iptal:{token_id}")
    return {"ok": True}
