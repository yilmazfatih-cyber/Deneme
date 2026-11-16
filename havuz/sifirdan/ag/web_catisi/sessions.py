"""İmzalı çerez oturumu (HMAC-SHA256), süre sınırı, anahtar dönüşümü, flash iletileri, CSRF
belirteci.

Çerez biçimi:  base64url(JSON) "." zaman-damgası "." base64url(HMAC(anahtar, "veri.zaman"))
    - Veri ŞİFRELENMEZ, yalnız imzalanır: kullanıcı okuyabilir ama değiştiremez. Parola/sır
      koymayın.
    - İmza `hmac.compare_digest` ile sabit zamanda karşılaştırılır; süre aşımı imza tutsa bile
      reddeder.
    - Anahtar dönüşümü: `secret_keys=[yeni, eski]` → yenisiyle imzalanır, ikisiyle de doğrulanır.
Oturum sabitleme: girişte `session.regenerate()` çağrılır → veri ve CSRF belirteci sıfırlanır, yeni
oturum kimliği üretilir; saldırganın önceden yerleştirdiği çerez oturum açmış hâle gelmez.
Genişletme: sunucu tarafı iptal (çıkışta tüm cihazlar) için oturuma kullanıcının "oturum sürümü"nü
koyun
ve her istekte veritabanındakiyle karşılaştırın (örnek: `ornek/uygulama.py`).
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Callable
from typing import Any

from web_catisi.request import Request
from web_catisi.response import Response

Middleware = Callable[[Request, Callable[[Request], Response]], Response]
MAX_COOKIE = 4096


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class SessionSigner:
    def __init__(
        self,
        secret_keys: list[bytes],
        max_age: int = 14 * 24 * 3600,
        clock: Callable[[], float] = time.time,
        salt: bytes = b"web_catisi.oturum",
    ) -> None:
        if not secret_keys or any(len(k) < 32 for k in secret_keys):
            raise ValueError("Her gizli anahtar en az 32 bayt olmalı: secrets.token_bytes(32).")
        # Anahtar ayrımı: aynı ana anahtar başka amaçla da kullanılsa imzalar birbirine geçmesin.
        self._keys = [hmac.new(k, salt, hashlib.sha256).digest() for k in secret_keys]
        self.max_age = max_age
        self.clock = clock

    def _signature(self, key: bytes, message: str) -> str:
        return _b64(hmac.new(key, message.encode("ascii"), hashlib.sha256).digest())

    def sign(self, data: dict[str, Any]) -> str:
        payload = _b64(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        message = f"{payload}.{int(self.clock())}"
        value = f"{message}.{self._signature(self._keys[0], message)}"
        if len(value) > MAX_COOKIE:
            raise ValueError("Oturum verisi çerez sınırını (4 KB) aşıyor; daha az veri saklayın.")
        return value

    def unsign(self, value: str) -> dict[str, Any] | None:
        """İmza ve süre tutuyorsa veri; aksi hâlde None (hiçbir durumda istisna sızmaz)."""
        if len(value) > MAX_COOKIE or value.count(".") != 2:
            return None
        payload, stamp, signature = value.split(".")
        message = f"{payload}.{stamp}"
        if not any(hmac.compare_digest(self._signature(k, message), signature) for k in self._keys):
            return None
        if not (stamp.isascii() and stamp.isdigit()):
            return None
        age = self.clock() - int(stamp)
        if age > self.max_age or age < -60:
            return None
        try:
            data = json.loads(_unb64(payload).decode("utf-8"))
        except (binascii.Error, ValueError):
            return None
        return data if isinstance(data, dict) else None


class Session:
    """Sözlük gibi davranır; değiştirildiyse yanıtta çerez yeniden yazılır."""

    def __init__(self, data: dict[str, Any] | None = None) -> None:
        self.data: dict[str, Any] = dict(data or {})
        self.new = data is None
        self.modified = False

    def __getitem__(self, key: str) -> Any:
        return self.data[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.data[key] = value
        self.modified = True

    def __contains__(self, key: object) -> bool:
        return key in self.data

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def pop(self, key: str, default: Any = None) -> Any:
        self.modified = self.modified or key in self.data
        return self.data.pop(key, default)

    def clear(self) -> None:
        self.data.clear()
        self.modified = True

    def regenerate(self) -> None:
        """Yetki değişiminde (giriş/çıkış) çağrılır: tüm veri ve CSRF belirteci yenilenir."""
        self.data = {"sid": secrets.token_urlsafe(16)}
        self.modified = True

    @property
    def csrf_token(self) -> str:
        token = self.data.get("_csrf")
        if not isinstance(token, str):
            token = secrets.token_urlsafe(32)
            self["_csrf"] = token
        return token

    def flash(self, message: str, category: str = "bilgi") -> None:
        """Bir sonraki sayfada BİR KEZ gösterilecek ileti (ör. "Not kaydedildi.")."""
        self["_flash"] = [*self.data.get("_flash", []), [category, message]]

    def pop_flashes(self) -> list[tuple[str, str]]:
        return [(c, m) for c, m in self.pop("_flash", [])]


def session_middleware(
    signer: SessionSigner, cookie_name: str = "oturum", secure: bool | None = None
) -> Middleware:
    def middleware(request: Request, call_next: Callable[[Request], Response]) -> Response:
        raw = request.cookies.get(cookie_name)
        request.session = Session(signer.unsign(raw) if raw else None)
        response = call_next(request)
        session = request.session
        if session.modified:
            if session.data:
                response.set_cookie(
                    cookie_name,
                    signer.sign(session.data),
                    max_age=signer.max_age,
                    secure=request.is_secure if secure is None else secure,
                )
            elif raw:
                response.delete_cookie(cookie_name)
        return response

    return middleware
