"""Kullanıcı, oturum ve API anahtarı işlemleri."""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, update

from ..config import get_settings
from ..db import init_db, session_scope
from . import policy
from .models import ApiToken, User, utcnow
from .security import hash_password, new_token, password_problem, token_hash, verify_dummy, verify_password

USERNAME_MAX = 64
_USERNAME_RE = re.compile(r"^[A-Za-z0-9._@-]{1,64}$")


class AuthError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, hint: str | None = None):
        super().__init__(message)
        self.code, self.message, self.status_code, self.hint = code, message, status_code, hint


@dataclass(frozen=True)
class Principal:
    username: str
    role: str
    via: str  # "session" | "token" | "delegated" | "local"
    token_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "username": self.username,
            "role": self.role,
            "role_label": policy.ROLE_LABELS.get(self.role, self.role),
            "via": self.via,
        }


# ------------------------------------------------------------------ kullanıcılar


def _normalize(username: str) -> str:
    u = (username or "").strip()
    if not _USERNAME_RE.match(u):
        raise AuthError(
            "bad_username",
            "Kullanıcı adı yalnız İngilizce harf, rakam ve . _ @ - içerebilir (en çok 64 karakter).",
            hint="Türkçe ad soyadı 'görünen ad' alanına yazın; ör. kullanıcı adı ayse.yilmaz.",
        )
    return u


def _user_dict(u: User) -> dict:
    return {
        "username": u.username,
        "display_name": u.display_name,
        "role": u.role,
        "role_label": policy.ROLE_LABELS.get(u.role, u.role),
        "disabled": u.disabled,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


def count_users() -> int:
    init_db()
    with session_scope() as s:
        return s.scalar(select(func.count()).select_from(User)) or 0


def list_users() -> list[dict]:
    init_db()
    with session_scope() as s:
        return [_user_dict(u) for u in s.scalars(select(User).order_by(User.username))]


def create_user(
    username: str, password: str, role: str = "kullanici", display_name: str | None = None
) -> dict:
    init_db()
    username = _normalize(username)
    if not policy.valid_role(role):
        raise AuthError("bad_role", f"Geçersiz rol: '{role}'", hint="Geçerli: " + ", ".join(policy.ROLES))
    if problem := password_problem(password):
        raise AuthError("weak_password", problem)
    with session_scope() as s:
        if s.get(User, username) is not None:
            raise AuthError("user_exists", f"'{username}' kullanıcısı zaten var.", status_code=409)
        u = User(
            username=username, role=role, display_name=display_name, password_hash=hash_password(password)
        )
        s.add(u)
        s.flush()
        return _user_dict(u)


def update_user(
    username: str,
    *,
    role: str | None = None,
    disabled: bool | None = None,
    password: str | None = None,
    display_name: str | None = None,
    acting: str | None = None,
) -> dict:
    init_db()
    with session_scope() as s:
        u = s.get(User, username)
        if u is None:
            raise AuthError("user_not_found", f"'{username}' kullanıcısı yok.", status_code=404)
        if role is not None:
            if not policy.valid_role(role):
                raise AuthError(
                    "bad_role", f"Geçersiz rol: '{role}'", hint="Geçerli: " + ", ".join(policy.ROLES)
                )
            if u.role == "yonetici" and role != "yonetici" and _active_admins(s) <= 1:
                raise AuthError("last_admin", "Son etkin yöneticinin rolü düşürülemez.", status_code=409)
            u.role = role
        if disabled is not None:
            if disabled and acting == username:
                raise AuthError(
                    "self_disable", "Kendi hesabınızı devre dışı bırakamazsınız.", status_code=409
                )
            if disabled and u.role == "yonetici" and not u.disabled and _active_admins(s) <= 1:
                raise AuthError("last_admin", "Son etkin yönetici devre dışı bırakılamaz.", status_code=409)
            u.disabled = disabled
            if disabled:  # açık oturumlar ve anahtarlar hemen geçersiz
                s.execute(update(ApiToken).where(ApiToken.username == username).values(revoked=True))
        if password is not None:
            if problem := password_problem(password):
                raise AuthError("weak_password", problem)
            u.password_hash = hash_password(password)
            s.execute(
                update(ApiToken)
                .where(ApiToken.username == username, ApiToken.kind == "session")
                .values(revoked=True)
            )
        if display_name is not None:
            u.display_name = display_name or None
        return _user_dict(u)


def _active_admins(s) -> int:
    return (
        s.scalar(
            select(func.count()).select_from(User).where(User.role == "yonetici", User.disabled.is_(False))
        )
        or 0
    )


# ------------------------------------------------------------------ giriş denemesi sınırı

_FAIL_LIMIT = 5
_LOCK_SECONDS = 300
_fails: dict[str, list[float]] = {}
_fails_lock = threading.Lock()


def _locked(key: str) -> bool:
    now = time.monotonic()
    with _fails_lock:
        recent = [t for t in _fails.get(key, []) if now - t < _LOCK_SECONDS]
        _fails[key] = recent
        return len(recent) >= _FAIL_LIMIT


def _note_fail(key: str) -> None:
    with _fails_lock:
        _fails.setdefault(key, []).append(time.monotonic())


def _clear_fails(key: str) -> None:
    with _fails_lock:
        _fails.pop(key, None)


def reset_login_limits() -> None:
    with _fails_lock:
        _fails.clear()


# ------------------------------------------------------------------ oturum ve anahtarlar


def authenticate(username: str, password: str, client_ip: str = "") -> dict:
    """Doğruysa kullanıcı sözlüğü döner; değilse AuthError. Başarısız denemeler sınırlanır."""
    init_db()
    key = f"{(username or '').strip().lower()}|{client_ip}"
    if _locked(key):
        raise AuthError(
            "too_many_attempts",
            "Çok fazla başarısız deneme. 5 dakika sonra yeniden deneyin.",
            status_code=429,
        )
    with session_scope() as s:
        u = s.get(User, (username or "").strip())
        if u is None:
            verify_dummy(password or "")
            ok = False
        else:
            ok = verify_password(password or "", u.password_hash) and not u.disabled
        if not ok:
            _note_fail(key)
            raise AuthError("invalid_credentials", "Kullanıcı adı veya parola hatalı.", status_code=401)
        u.last_login_at = utcnow()
        _clear_fails(key)
        return _user_dict(u)


def create_token(
    username: str,
    name: str,
    *,
    kind: str = "api",
    delegate: bool = False,
    ttl: timedelta | None = None,
) -> tuple[str, dict]:
    """(ham_anahtar, kayıt) döner. Ham anahtar yalnız bu anda görünür."""
    init_db()
    if kind not in {"api", "session"}:
        raise AuthError("bad_kind", "Anahtar türü 'api' veya 'session' olmalı.")
    with session_scope() as s:
        u = s.get(User, username)
        if u is None or u.disabled:
            raise AuthError("user_not_found", f"'{username}' etkin bir kullanıcı değil.", status_code=404)
        raw = new_token()
        t = ApiToken(
            token_hash=token_hash(raw),
            username=username,
            name=(name or "").strip()[:128] or kind,
            kind=kind,
            delegate=bool(delegate),
            expires_at=(utcnow() + ttl) if ttl else None,
        )
        s.add(t)
        s.flush()
        return raw, _token_dict(t)


def create_session(username: str) -> str:
    raw, _ = create_token(
        username, "tarayıcı oturumu", kind="session", ttl=timedelta(hours=get_settings().session_hours)
    )
    return raw


def _token_dict(t: ApiToken) -> dict:
    return {
        "id": t.id,
        "username": t.username,
        "name": t.name,
        "kind": t.kind,
        "delegate": t.delegate,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        "revoked": t.revoked,
    }


def list_tokens(include_sessions: bool = False) -> list[dict]:
    init_db()
    with session_scope() as s:
        q = select(ApiToken).where(ApiToken.revoked.is_(False))
        if not include_sessions:
            q = q.where(ApiToken.kind == "api")
        return [_token_dict(t) for t in s.scalars(q.order_by(ApiToken.created_at.desc()))]


def revoke_token(token_id: str) -> None:
    init_db()
    with session_scope() as s:
        t = s.get(ApiToken, token_id)
        if t is None:
            raise AuthError("token_not_found", "Anahtar bulunamadı.", status_code=404)
        t.revoked = True


def revoke_raw(raw: str) -> None:
    init_db()
    with session_scope() as s:
        s.execute(update(ApiToken).where(ApiToken.token_hash == token_hash(raw)).values(revoked=True))


def resolve_token(raw: str, forwarded_user: str | None = None) -> Principal | None:
    """Geçerli, süresi dolmamış, iptal edilmemiş anahtarı kimliğe çevirir."""
    if not raw or not raw.startswith("aip_"):
        return None
    with session_scope() as s:
        t = s.scalar(select(ApiToken).where(ApiToken.token_hash == token_hash(raw)))
        if t is None or t.revoked or (t.expires_at is not None and t.expires_at < utcnow()):
            return None
        u = s.get(User, t.username)
        if u is None or u.disabled:
            return None
        now = utcnow()
        if t.last_used_at is None or (now - t.last_used_at).total_seconds() > 60:
            t.last_used_at = now  # her istekte yazmamak için dakikada bir
        if t.delegate and forwarded_user:
            name = forwarded_user.strip()[:USERNAME_MAX]
            if name:
                # İstemci düğümü kişi adına çalışır; yetki her zaman 'kullanici' ile sınırlı
                return Principal(username=name, role="kullanici", via="delegated", token_id=t.id)
        return Principal(
            username=u.username, role=u.role, via="session" if t.kind == "session" else "token", token_id=t.id
        )
