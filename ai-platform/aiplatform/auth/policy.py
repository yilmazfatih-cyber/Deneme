"""Rol politikası: hangi uç hangi rolü ister.

Roller artan yetkiyle: kullanici < onaylayici < yonetici.
- kullanici: modül çalıştırma, okuma, sohbet geçidi, KVKK maskeleme
- onaylayici: + insan onayı kararları (ERP'ye yazan işlemler)
- yonetici: + modül kurma/kaldırma, ERP bağlantıları, kullanıcı ve anahtar yönetimi, denetim günlüğü
"""

from __future__ import annotations

import re

ROLES = ("kullanici", "onaylayici", "yonetici")
_RANK = {r: i for i, r in enumerate(ROLES)}

ROLE_LABELS = {"kullanici": "Kullanıcı", "onaylayici": "Onaylayıcı", "yonetici": "Yönetici"}

# Kimlik istemeyen uçlar (yöntem, yol deseni)
PUBLIC: list[tuple[str, re.Pattern[str]]] = [
    ("GET", re.compile(r"^/api/system/health$")),
    ("POST", re.compile(r"^/api/auth/login$")),
    ("GET", re.compile(r"^/api/auth/me$")),
    ("POST", re.compile(r"^/api/auth/logout$")),
    ("POST", re.compile(r"^/api/erp/webhooks/[^/]+$")),  # HMAC imzasıyla korunur
]

# Sıra önemli: ilk eşleşen kural uygulanır; hiçbiri eşleşmezse "kullanici"
RULES: list[tuple[set[str], re.Pattern[str], str]] = [
    # yönetim
    ({"POST"}, re.compile(r"^/api/modules/[^/]+/(install|uninstall|enable|disable)$"), "yonetici"),
    ({"POST"}, re.compile(r"^/api/jobs/[^/]+/cancel$"), "yonetici"),
    ({"POST", "PATCH", "PUT", "DELETE"}, re.compile(r"^/api/erp/connections(/.*)?$"), "yonetici"),
    ({"GET"}, re.compile(r"^/api/erp/connections/[^/]+/(schema|query)$"), "yonetici"),
    ({"POST"}, re.compile(r"^/api/demo/setup$"), "yonetici"),
    ({"GET", "POST", "PATCH", "DELETE"}, re.compile(r"^/api/auth/(users|tokens)(/.*)?$"), "yonetici"),
    ({"GET"}, re.compile(r"^/api/audit(/.*)?$"), "yonetici"),
    ({"GET"}, re.compile(r"^/api/erp/webhooks$"), "yonetici"),
    # onay kararı
    ({"POST"}, re.compile(r"^/api/approvals/[^/]+/decide$"), "onaylayici"),
]


def is_public(method: str, path: str) -> bool:
    return any(m == method and p.match(path) for m, p in PUBLIC)


def required_role(method: str, path: str) -> str:
    for methods, pattern, role in RULES:
        if method in methods and pattern.match(path):
            return role
    return "kullanici"


def has_role(actual: str, required: str) -> bool:
    return _RANK.get(actual, -1) >= _RANK[required]


def valid_role(role: str) -> bool:
    return role in _RANK
