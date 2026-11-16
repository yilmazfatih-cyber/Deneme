"""Kimlik doğrulama: parola özeti, rol politikası, giriş/oturum, API anahtarı, istemci düğümü, dört göz, kimlik sahteciliği."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from aiplatform.auth import policy, service
from aiplatform.auth.security import hash_password, verify_password
from aiplatform.config import reset_settings

PW = "Cok-Gizli-Parola-1"


@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setenv("AIP_AUTH_MODE", "on")
    reset_settings()
    service.reset_login_limits()
    yield
    service.reset_login_limits()


@pytest.fixture
def client(auth_on):
    from aiplatform.api.app import create_app

    with TestClient(create_app()) as c:
        yield c


def _login(c: TestClient, username: str, password: str = PW):
    return c.post("/api/auth/login", json={"username": username, "password": password})


def _err(r, status, code):
    assert r.status_code == status, r.text
    assert r.json()["error"]["code"] == code
    return r.json()["error"]


# ------------------------------------------------------------------ birim


def test_password_hash_roundtrip():
    h = hash_password("doğru-parola-123")
    assert h.startswith("scrypt$") and "doğru" not in h
    assert verify_password("doğru-parola-123", h)
    assert not verify_password("yanlis-parola-123", h)
    assert not verify_password("x", "bozuk$kayit")


def test_policy_roles():
    assert policy.required_role("POST", "/api/modules/ana-model/install") == "yonetici"
    assert policy.required_role("POST", "/api/modules/finans-hesap/run/payback") == "kullanici"
    assert policy.required_role("POST", "/api/approvals/abc/decide") == "onaylayici"
    assert policy.required_role("GET", "/api/audit/summary") == "yonetici"
    assert policy.required_role("POST", "/api/auth/users") == "yonetici"
    assert policy.is_public("GET", "/api/system/health")
    assert policy.is_public("POST", "/api/erp/webhooks/evrak")
    assert not policy.is_public("GET", "/api/catalog/modules")
    assert policy.has_role("yonetici", "onaylayici") and not policy.has_role("kullanici", "onaylayici")


def test_auto_mode_follows_bind_address(monkeypatch):
    from aiplatform.config import get_settings

    monkeypatch.setenv("AIP_AUTH_MODE", "auto")
    monkeypatch.setenv("AIP_HOST", "127.0.0.1")
    reset_settings()
    assert get_settings().auth_enabled is False
    monkeypatch.setenv("AIP_HOST", "0.0.0.0")
    reset_settings()
    assert get_settings().auth_enabled is True


def test_user_rules():
    service.create_user("admin", PW, "yonetici")
    with pytest.raises(service.AuthError) as e:
        service.create_user("ayşe", PW)
    assert e.value.code == "bad_username"
    with pytest.raises(service.AuthError) as e:
        service.create_user("kisa", "123")
    assert e.value.code == "weak_password"
    with pytest.raises(service.AuthError) as e:
        service.update_user("admin", role="kullanici")
    assert e.value.code == "last_admin"
    with pytest.raises(service.AuthError) as e:
        service.update_user("admin", disabled=True, acting="admin")
    assert e.value.code == "self_disable"


# ------------------------------------------------------------------ kimlik kapalı (yerel tek kullanıcı)


def test_auth_off_keeps_local_behaviour():
    from aiplatform.api.app import create_app

    with TestClient(create_app()) as c:
        me = c.get("/api/auth/me").json()
        assert me["auth_enabled"] is False and me["user"]["role"] == "yonetici"
        assert c.get("/api/catalog/modules").status_code == 200
        _err(c.post("/api/auth/login", json={"username": "x", "password": "y"}), 400, "auth_disabled")


# ------------------------------------------------------------------ kimlik açık


def test_unauthenticated_is_rejected_but_public_and_static_pass(client):
    _err(client.get("/api/catalog/modules"), 401, "unauthenticated")
    _err(client.post("/v1/chat/completions", json={"messages": []}), 401, "unauthenticated")
    assert client.get("/api/system/health").status_code == 200
    me = client.get("/api/auth/me").json()
    assert me["auth_enabled"] is True and me["user"] is None and me["needs_setup"] is True
    r = client.get("/")
    assert r.status_code == 200 and "Yerel AI Platformu" in r.text


def test_login_session_and_logout(client):
    service.create_user("ali", PW, "kullanici", "Ali Veli")
    _err(_login(client, "ali", "yanlis-parola"), 401, "invalid_credentials")
    _err(_login(client, "yok-boyle-biri"), 401, "invalid_credentials")
    r = _login(client, "ali")
    assert r.status_code == 200 and r.json()["user"]["username"] == "ali"
    assert "aip_session" in r.cookies
    assert (
        "httponly" in r.headers["set-cookie"].lower() and "samesite=strict" in r.headers["set-cookie"].lower()
    )
    assert client.get("/api/auth/me").json()["user"]["username"] == "ali"
    assert client.get("/api/catalog/modules").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.clear()
    _err(client.get("/api/catalog/modules"), 401, "unauthenticated")


def test_bruteforce_lockout(client):
    service.create_user("ali", PW)
    for _ in range(5):
        _err(_login(client, "ali", "yanlis-parola"), 401, "invalid_credentials")
    _err(_login(client, "ali"), 429, "too_many_attempts")  # doğru parola da kilit süresince reddedilir


def test_role_enforcement(client):
    service.create_user("ali", PW, "kullanici")
    _login(client, "ali")
    _err(client.post("/api/modules/finans-hesap/install", json={}), 403, "forbidden")
    _err(client.get("/api/auth/users"), 403, "forbidden")
    _err(client.post("/api/approvals/x/decide", json={"decision": "approve"}), 403, "forbidden")
    _err(client.get("/api/audit"), 403, "forbidden")


def test_admin_manages_users_and_tokens(client):
    service.create_user("admin", PW, "yonetici")
    _login(client, "admin")
    r = client.post("/api/auth/users", json={"username": "veli", "password": PW, "role": "onaylayici"})
    assert r.status_code == 201 and r.json()["role"] == "onaylayici"
    _err(client.post("/api/auth/users", json={"username": "veli", "password": PW}), 409, "user_exists")
    r = client.post("/api/auth/tokens", json={"username": "veli", "name": "erp-entegrasyon", "days": 30})
    assert r.status_code == 201
    raw, tid = r.json()["token"], r.json()["id"]
    assert raw.startswith("aip_")
    listed = client.get("/api/auth/tokens").json()["items"]
    assert [t["id"] for t in listed] == [tid] and "token" not in listed[0]

    with TestClient(client.app) as api_client:  # çerezsiz, yalnız anahtarla
        h = {"Authorization": f"Bearer {raw}"}
        me = api_client.get("/api/auth/me", headers=h).json()["user"]
        assert me["username"] == "veli" and me["via"] == "token"
        assert api_client.get("/api/catalog/modules", headers=h).status_code == 200
        client.delete(f"/api/auth/tokens/{tid}")
        _err(api_client.get("/api/catalog/modules", headers=h), 401, "unauthenticated")


def test_disabling_user_revokes_tokens(client):
    service.create_user("admin", PW, "yonetici")
    service.create_user("ali", PW)
    raw, _ = service.create_token("ali", "betik")
    h = {"Authorization": f"Bearer {raw}"}
    assert client.get("/api/catalog/modules", headers=h).status_code == 200
    service.update_user("ali", disabled=True, acting="admin")
    _err(client.get("/api/catalog/modules", headers=h), 401, "unauthenticated")
    _err(_login(client, "ali"), 401, "invalid_credentials")


def test_spoofed_user_header_is_replaced(client):
    """Kullanıcının gönderdiği X-AIP-User yok sayılır; denetim günlüğüne doğrulanmış ad yazılır."""
    service.create_user("ali", PW)
    raw, _ = service.create_token("ali", "betik")
    r = client.post(
        "/api/kvkk/scan",
        json={"text": "e-posta: a@b.com"},
        headers={"Authorization": f"Bearer {raw}", "X-AIP-User": "genel-mudur", "X-User": "genel-mudur"},
    )
    assert r.status_code == 200
    from sqlalchemy import select

    from aiplatform.db import session_scope
    from aiplatform.kvkk.models import AuditLog

    with session_scope() as s:
        users = {a.user for a in s.scalars(select(AuditLog))}
    assert "ali" in users and "genel-mudur" not in users


def test_delegated_node_token_acts_for_employee_with_user_role_only(client):
    service.create_user("admin", PW, "yonetici")
    service.create_user("muhasebe-pc-03", PW, "yonetici")  # düğüm hesabı yönetici olsa bile
    raw, _ = service.create_token("muhasebe-pc-03", "düğüm", delegate=True)
    h = {"Authorization": f"Bearer {raw}", "X-AIP-User": "ayse.yilmaz"}
    me = client.get("/api/auth/me", headers=h).json()["user"]
    assert me == {
        "username": "ayse.yilmaz",
        "role": "kullanici",
        "role_label": "Kullanıcı",
        "via": "delegated",
    }
    assert client.get("/api/catalog/modules", headers=h).status_code == 200
    _err(client.post("/api/modules/ana-model/install", json={}, headers=h), 403, "forbidden")
    # delegate olmayan anahtar başlıktaki adı kullanamaz
    raw2, _ = service.create_token("admin", "betik")
    me2 = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {raw2}", "X-AIP-User": "ayse.yilmaz"}
    ).json()
    assert me2["user"]["username"] == "admin"


def test_four_eyes_and_body_identity_ignored(client):
    from aiplatform.erp.approvals import create_approval, get_approval

    service.create_user("ali", PW, "onaylayici")
    service.create_user("veli", PW, "onaylayici")
    aid = create_approval("fatura-cikarim", "propose_entry", {"fields": {}}, requested_by="ali")

    _login(client, "ali")
    _err(
        client.post(f"/api/approvals/{aid}/decide", json={"decision": "approve", "decided_by": "veli"}),
        403,
        "four_eyes",
    )
    assert get_approval(aid)["status"] == "pending"
    client.post("/api/auth/logout")
    client.cookies.clear()

    _login(client, "veli")
    r = client.post(f"/api/approvals/{aid}/decide", json={"decision": "reject", "decided_by": "baskasi"})
    assert r.status_code == 200, r.text
    assert get_approval(aid)["decided_by"] == "veli"


def test_password_change_revokes_other_sessions(client):
    service.create_user("ali", PW)
    _login(client, "ali")
    other = TestClient(client.app)
    other.post("/api/auth/login", json={"username": "ali", "password": PW})
    assert other.get("/api/catalog/modules").status_code == 200
    _err(
        client.post(
            "/api/auth/password", json={"current_password": "yanlis", "new_password": "Yeni-Parola-123"}
        ),
        400,
        "invalid_credentials",
    )
    r = client.post("/api/auth/password", json={"current_password": PW, "new_password": "Yeni-Parola-123"})
    assert r.status_code == 200
    _err(other.get("/api/catalog/modules"), 401, "unauthenticated")
    other.close()
