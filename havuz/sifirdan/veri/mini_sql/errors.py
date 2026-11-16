"""mini_sql hata türü: kullanıcıya dönük bütün hatalar Türkçe ve tek türdendir.

Genişletme: hata türü ayrımı gerekirse (ör. kısıt ihlali) `SqlError`'dan türetin; mesajı Türkçe
tutun.
"""

from __future__ import annotations


class SqlError(Exception):
    """Sözdizimi, ad çözümleme, tür ya da kısıt hatası. İleti ne yapılacağını söyler."""


class ConstraintError(SqlError):
    """NOT NULL ya da UNIQUE/PRIMARY KEY kısıtı ihlal edildi; deyimin hiçbir etkisi kalmaz."""
