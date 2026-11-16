"""Çatının HTTP hataları: işleyicide `abort(404)` → hata sınırı uygun hata sayfasını döndürür.

Genişletme: hata sayfası metinleri `texts.py` içindedir; uygulamaya özgü sayfa için
`@app.error_page(404)`.
"""

from __future__ import annotations

from typing import NoReturn

from http_sunucu.headers import Headers


class HttpStatusError(Exception):
    def __init__(self, status: int, message: str = "", headers: Headers | None = None) -> None:
        super().__init__(message or str(status))
        self.status = status
        self.message = message
        self.headers = headers or Headers()


def abort(status: int, message: str = "") -> NoReturn:
    raise HttpStatusError(status, message)
