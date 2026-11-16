"""Kişisel veri bulma ve maskeleme: TCKN, VKN, IBAN, telefon, e-posta, kart numarası.

Bulma, düzenli ifade + SAĞLAMA denetimiyle yapılır (11 haneli her sayı TCKN sayılmaz). VKN'de
rastgele 10 haneli sayıların ~%10'u sağlamayı tuttuğu için serbest metinde yalnız yakınında
"vkn"/"vergi" sözcüğü geçiyorsa VKN sayılır (``vkn_context=False`` ile kapatılabilir).
Yöntemler: ``maskele`` (son haneler kalır: ``•••••••••46``), ``sil`` (``[TCKN]``), ``takma_ad``
(aynı değer → aynı belirteç: ``[TCKN-1a2b3c4d]``) ve ``bicimli`` (aynı değer → aynı, sağlaması
GEÇERLİ ama uydurma değer). Son ikisi gizli bir anahtarla HMAC-SHA256 kullanır; anahtar yoksa
hata verir — anahtarı kaybederseniz eşleşme bozulur, sızarsa takma adlar geri çözülebilir.
UYARI: Takma adlandırılmış veri KVKK açısından hâlâ kişisel veridir (bkz. docs/KVKK_NOTLARI.md).
Genişletme: yeni tür için ``_PATTERNS``e desen + ``_VALID``e denetim + ``_fake_like``a biçimli
karşılık ekleyin; ``tests/test_pii.py``ye örnek yazın.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from verihavuzu import geo, ids
from verihavuzu.kalite.validators import is_email

Kind = Literal["iban", "kart_no", "tckn", "telefon", "vkn", "eposta"]
Method = Literal["maskele", "sil", "takma_ad", "bicimli"]
KEY_ENV = "VERIHAVUZU_TAKMA_AD_ANAHTARI"

_PATTERNS: list[tuple[Kind, re.Pattern[str]]] = [  # sıra = öncelik (çakışmada önce gelen kazanır)
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")),
    ("eposta", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")),
    ("tckn", re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)")),
    ("kart_no", re.compile(r"(?<![\d+])\d(?:[ \-]?\d){12,18}(?!\d)")),
    ("vkn", re.compile(r"(?<!\d)\d{10}(?!\d)")),  # serbest metinde bağlam sözcüğü ister
    (
        "telefon",
        re.compile(
            r"(?<![\d+])(?:\+90[ \-.]?|0090[ \-.]?)?\(?0?[2-5]\d{2}\)?"
            r"[ \-.]?\d{3}[ \-.]?\d{2}[ \-.]?\d{2}(?!\d)"
        ),
    ),
]
_VKN_CONTEXT = re.compile(r"(vkn|v\.k\.n|vergi)", re.IGNORECASE)
LABELS = {
    "iban": "IBAN",
    "kart_no": "KART",
    "tckn": "TCKN",
    "telefon": "TELEFON",
    "vkn": "VKN",
    "eposta": "EPOSTA",
}


def normalize_phone(text: str) -> str | None:
    """Telefonu +90XXXXXXXXXX biçimine çevirir; alan kodu geçersizse ``None``."""
    digits = re.sub(r"\D", "", text)
    if digits.startswith("0090"):
        digits = digits[4:]
    elif digits.startswith("90") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    if digits[0] == "5" or geo.province_of_area_code(int(digits[:3])) is not None:
        return "+90" + digits
    return None


def _valid(kind: Kind, text: str) -> bool:
    compact = ids.compact(text)
    if kind == "iban":
        return ids.is_valid_iban(compact)
    if kind == "kart_no":  # ödeme kartları 2–6 ya da 9 ile başlar (ISO/IEC 7812 sektör hanesi)
        return compact[:1] in ("2", "3", "4", "5", "6", "9") and ids.is_valid_card_number(compact)
    if kind == "tckn":
        return ids.is_valid_tckn(compact)
    if kind == "telefon":
        return normalize_phone(text) is not None
    if kind == "vkn":
        return ids.is_valid_vkn(compact)
    return is_email(text)


@dataclass(frozen=True)
class Finding:
    tur: Kind
    bas: int
    son: int
    deger: str


def find_pii(text: str, *, vkn_context: bool = True) -> list[Finding]:
    """Metindeki kişisel veri parçalarını bulur (çakışanlarda öncelikli tür kazanır)."""
    found: list[Finding] = []
    taken: list[tuple[int, int]] = []
    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            start, end = match.span()
            if any(start < t_end and t_start < end for t_start, t_end in taken):
                continue
            if not _valid(kind, match.group()):
                continue
            if (
                kind == "vkn"
                and vkn_context
                and not _VKN_CONTEXT.search(text[max(0, start - 30) : start])
            ):
                continue
            found.append(Finding(kind, start, end, match.group()))
            taken.append((start, end))
    return sorted(found, key=lambda f: f.bas)


class Pseudonymizer:
    """Gizli anahtarla tutarlı takma ad ve biçimli uydurma değer üretir."""

    def __init__(self, key: bytes) -> None:
        if len(key) < 16:
            raise ValueError("Takma ad anahtarı en az 16 bayt olmalı.")
        self.key = key

    def digest(self, kind: str, value: str) -> bytes:
        return hmac.new(self.key, f"{kind}:{value}".encode(), hashlib.sha256).digest()

    def token(self, kind: Kind, value: str) -> str:
        return f"[{LABELS[kind]}-{self.digest(kind, value).hex()[:8]}]"

    def fake_like(self, kind: Kind, value: str) -> str:
        """Aynı türden, sağlaması geçerli uydurma değer (aynı girdi → aynı çıktı)."""
        digits = "".join(str(b % 10) for b in self.digest(kind, value) * 2)
        if kind == "tckn":
            body = str(int(digits[0]) % 9 + 1) + digits[1:9]
            return body + ids.tckn_check_digits(body)
        if kind == "vkn":
            return digits[:9] + ids.vkn_check_digit(digits[:9])
        if kind == "iban":
            compact = ids.compact(value)
            bban = (compact[4:10] if compact.startswith("TR") else "000610") + digits[:16]
            return "TR" + ids.iban_check_digits("TR", bban) + bban
        if kind == "kart_no":
            body = "4" + digits[:14]
            return body + ids.luhn_check_digit(body)
        if kind == "telefon":
            return "+905" + digits[:9]
        return f"kisi_{self.digest(kind, value).hex()[:10]}@ornek.example"


def _replacement(finding: Finding, method: Method, pseudo: Pseudonymizer | None) -> str:
    value = finding.deger
    if method == "sil":
        return f"[{LABELS[finding.tur]}]"
    if method in ("takma_ad", "bicimli"):
        if pseudo is None:
            raise ValueError(
                f"'{method}' yöntemi gizli anahtar ister: {KEY_ENV} ortam değişkenini ayarlayın "
                '(örnek: python -c "import secrets; print(secrets.token_hex(32))").'
            )
        normal = normalize_phone(value) if finding.tur == "telefon" else ids.compact(value)
        key = normal or value
        return (
            pseudo.token(finding.tur, key)
            if method == "takma_ad"
            else pseudo.fake_like(finding.tur, key)
        )
    if finding.tur == "eposta":
        local, _, domain = value.partition("@")
        return f"{local[:1]}•••@{domain}"
    keep = 4 if finding.tur in ("kart_no", "iban") else 2
    compact = ids.compact(value)
    prefix = compact[:2] if finding.tur == "iban" else ""
    return prefix + "•" * (len(compact) - keep - len(prefix)) + compact[-keep:]


def mask_text(
    text: str,
    method: Method = "maskele",
    pseudo: Pseudonymizer | None = None,
    *,
    vkn_context: bool = True,
) -> tuple[str, list[Finding]]:
    """Metindeki kişisel verileri seçilen yöntemle değiştirir."""
    findings = find_pii(text, vkn_context=vkn_context)
    result = text
    for finding in reversed(findings):
        result = (
            result[: finding.bas] + _replacement(finding, method, pseudo) + result[finding.son :]
        )
    return result, findings


def mask_rows(
    rows: Sequence[dict[str, Any]],
    method: Method = "maskele",
    pseudo: Pseudonymizer | None = None,
    *,
    columns: Sequence[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, int]]]:
    """Tablodaki (seçili) metin sütunlarını maskeler. Dönüş: (yeni satırlar, sütun → tür → sayı).

    Bir hücrenin TAMAMI 10 haneli geçerli VKN ise bağlam sözcüğü aranmaz (sütun değeri sayılır).
    """
    counts: dict[str, Counter[str]] = {}
    masked: list[dict[str, Any]] = []
    for row in rows:
        new_row = dict(row)
        for column, value in row.items():
            if value is None or (columns is not None and column not in columns):
                continue
            text = str(value)
            whole_vkn = len(text.strip()) == 10 and ids.is_valid_vkn(text.strip())
            new_value, findings = mask_text(text, method, pseudo, vkn_context=not whole_vkn)
            if findings:
                new_row[column] = new_value
                counts.setdefault(column, Counter()).update(f.tur for f in findings)
        masked.append(new_row)
    return masked, {column: dict(counter) for column, counter in counts.items()}


def scan_rows(rows: Sequence[dict[str, Any]]) -> dict[str, dict[str, int]]:
    """Yalnız tarar (değiştirmez): sütun → tür → bulunan sayısı."""
    _, counts = mask_rows(rows, "sil")
    return counts
