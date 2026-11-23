"""Kullanıcıya gösterilen hatalar ve Pydantic hatalarının Türkçe açıklaması.

Kim kullanır: paketin her yeri. `UserError` komut satırında iz sürme (traceback) basılmadan
"HATA: …" biçiminde gösterilir; beklenmeyen hatalar olduğu gibi yükselir ki hata metni bir
modele yapıştırılabilsin. Kaynak: `havuz/ince-ayar/ince_ayar/errors.py` (kopyalanıp uyarlandı).

Genişletme: Pydantic'in yeni bir hata türünü Türkçeleştirmek için `_PYDANTIC_TR` sözlüğüne satır
ekleyin (anahtar: Pydantic'in `type` kodu).
"""

from __future__ import annotations

from pydantic import ValidationError


class UserError(Exception):
    """Kullanıcının düzeltebileceği durum: ileti Türkçedir ve ne yapılacağını söyler."""


class ImageRejectedError(UserError):
    """Görüntü güvenlik ya da biçim denetiminden geçmedi (bozuk, çok büyük, desteklenmeyen…).

    `reason` makine okur kısa koddur (ör. "piksel_siniri"); rapor dosyalarında ve sunucuda kullanılır.
    """

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


# Pydantic hata türü kodu → Türkçe açıklama. `{ctx}` içindeki alanlar Pydantic'in verdiği bağlamdır.
_PYDANTIC_TR: dict[str, str] = {
    "missing": "zorunlu alan eksik",
    "extra_forbidden": "tanınmayan alan (yazım hatası olabilir)",
    "string_type": "metin olmalı",
    "string_too_short": "boş olamaz",
    "int_type": "tam sayı olmalı",
    "int_parsing": "tam sayı olmalı",
    "float_type": "sayı olmalı",
    "float_parsing": "sayı olmalı",
    "bool_type": "true ya da false olmalı",
    "bool_parsing": "true ya da false olmalı",
    "list_type": "liste olmalı",
    "dict_type": "nesne (anahtar-değer) olmalı",
    "model_type": "nesne (anahtar-değer) olmalı",
    "too_short": "en az {min_length} öğe içermeli",
    "literal_error": "şunlardan biri olmalı: {expected}",
    "greater_than": "{gt} değerinden büyük olmalı",
    "greater_than_equal": "en az {ge} olmalı",
    "less_than": "{lt} değerinden küçük olmalı",
    "less_than_equal": "en çok {le} olmalı",
}


def _format_location(loc: tuple[int | str, ...]) -> str:
    """('egitim', 'yigin') → 'egitim.yigin'; liste sırası köşeli ayraçla: 'etiketler[2]'."""
    text = ""
    for part in loc:
        if isinstance(part, int):
            text += f"[{part}]"
        else:
            text += f".{part}" if text else str(part)
    return text


def explain_validation_error(exc: ValidationError) -> list[str]:
    """Pydantic doğrulama hatasını satır satır Türkçe açıklamalara çevirir."""
    lines: list[str] = []
    for err in exc.errors():
        where = _format_location(tuple(err.get("loc", ())))
        kind = str(err.get("type", ""))
        template = _PYDANTIC_TR.get(kind)
        if template is None:
            # Kendi doğrulayıcılarımızın iletisi zaten Türkçedir (ValueError).
            message = str(err.get("msg", "geçersiz değer")).removeprefix("Value error, ")
        else:
            try:
                message = template.format(**(err.get("ctx") or {}))
            except (KeyError, IndexError):
                message = template
        lines.append(f"`{where}` {message}" if where else message)
    return lines
