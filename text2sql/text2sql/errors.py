"""Kullanıcıya gösterilen hatalar. Mesajlar Türkçe, kısa ve ne yapılacağını söyler."""

from __future__ import annotations


class Text2SQLError(Exception):
    """Tüm beklenen hataların tabanı; CLI bunları iz göstermeden yazar."""

    exit_code = 1


class ConfigError(Text2SQLError):
    exit_code = 2


class MissingExtraError(ConfigError):
    def __init__(self, extra: str, what: str) -> None:
        super().__init__(f"{what} için ek paket gerekiyor: pip install -e \".[{extra}]\"")


class BackendError(Text2SQLError):
    """Model sunucusuna ulaşılamadı, model yok, zaman aşımı vb."""


class SchemaError(Text2SQLError):
    exit_code = 2


class SQLNotFoundError(Text2SQLError):
    """Model yanıtında SQL bulunamadı."""


class ReadOnlyError(Text2SQLError):
    """Yazma sorgusu --yaz olmadan ya da çoklu ifade reddedildi. ``sql``: reddedilen sorgu (kullanıcıya gösterilir)."""

    exit_code = 3

    def __init__(self, message: str, sql: str = "") -> None:
        super().__init__(message)
        self.sql = sql


class ExecutionError(Text2SQLError):
    """Veritabanı sorguyu çalıştıramadı."""
