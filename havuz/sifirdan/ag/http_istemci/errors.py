"""İstemcinin fırlattığı hatalar — hepsi `HttpClientError`'dan türer, iletiler Türkçe ve yol
gösterir.

Genişletme: yeni bir hata türü gerekiyorsa buraya ekleyin ve `__init__.py`'den dışa aktarın.
"""

from __future__ import annotations


class HttpClientError(Exception):
    """Tüm istemci hatalarının atası."""


class InvalidUrlError(HttpClientError, ValueError):
    """Adres ayrıştırılamadı ya da desteklenmeyen biçimde."""


class ConnectError(HttpClientError):
    """Sunucuya bağlanılamadı (kapalı kapı, DNS, TLS doğrulama hatası…)."""


class RequestTimeoutError(HttpClientError):
    """Bağlanma ya da okuma süresi aşıldı."""


class RemoteDisconnectedError(HttpClientError):
    """Sunucu yanıt vermeden bağlantıyı kapattı."""


class ProtocolViolationError(HttpClientError):
    """Sunucunun yanıtı HTTP/1.1 kurallarına uymuyor."""


class TooManyRedirectsError(HttpClientError):
    """Yönlendirme sınırı aşıldı (döngü olabilir)."""


class InsecureRedirectError(HttpClientError):
    """https → http yönlendirmesi engellendi."""


class ResponseTooLargeError(HttpClientError):
    """Yanıt gövdesi (ya da açılmış hâli) izin verilen boyutu aşıyor."""
