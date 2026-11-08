"""Maskeleme ve geri açma.

    r = mask("TCKN 1234... olan Ali'ye ...")   → r.masked_text = "TCKN <TCKN_1> olan <KISI_1>'ye ..."
    unmask(llm_cevabi, r.mapping_id)            → yer tutucular özgün değerlerle değişir

Aynı değer aynı yer tutucuyu alır (`<KISI_1>` metin boyunca aynı kişi). Eşleme `mask_mappings` tablosunda
saklanır: `cryptography` kuruluysa `data_dir/kvkk.key` anahtarıyla Fernet şifreli, değilse düz JSON
(`encrypted=False`). Eşlemeler `settings.audit_retention_days` gün sonra `purge_expired()` ile silinir.
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
import threading
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from ..config import get_settings
from ..db import session_scope
from .models import MaskMapping, ensure_tables, utcnow
from .recognizers import DEFAULT_THRESHOLD, scan_text

log = logging.getLogger("aiplatform.kvkk")

# Varlık tipi → yer tutucu etiketi (Türkçe, ASCII)
PLACEHOLDER_LABELS: dict[str, str] = {
    "TR_TCKN": "TCKN",
    "TR_VKN": "VKN",
    "TR_IBAN": "IBAN",
    "TR_PHONE": "TELEFON",
    "TR_PLATE": "PLAKA",
    "EMAIL_ADDRESS": "EPOSTA",
    "DATE_OF_BIRTH": "DOGUM_TARIHI",
    "PERSON": "KISI",
    "ADDRESS": "ADRES",
    "LOCATION": "ADRES",
    "ORGANIZATION": "KURUM",
    "HEALTH": "SAGLIK",
}
PLACEHOLDER_RE = re.compile(r"<([A-Z][A-Z_]*_\d+)>")


def _label(entity_type: str) -> str:
    return PLACEHOLDER_LABELS.get(entity_type, re.sub(r"[^A-Z_]", "", entity_type.upper()) or "VARLIK")


def _norm_value(value: str) -> str:
    """Aynı değerin farklı yazımları (boşluklu IBAN, büyük/küçük e-posta) aynı yer tutucuyu alsın."""
    return re.sub(r"\s+", " ", value.strip()).casefold()


@dataclass
class MaskResult:
    masked_text: str
    mapping_id: str
    findings: list[dict]
    meta: dict = field(default_factory=dict)

    @property
    def count(self) -> int:
        return len(self.findings)

    def to_dict(self) -> dict:
        return {
            "masked_text": self.masked_text,
            "mapping_id": self.mapping_id,
            "findings": self.findings,
            "meta": self.meta,
        }


# ----------------------------------------------------------------------------- şifreleme

_fernet_lock = threading.Lock()


def _key_file():
    return get_settings().data_dir / "kvkk.key"


def _fernet():
    """Fernet nesnesi; `cryptography` yoksa None."""
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        return None
    path = _key_file()
    with _fernet_lock:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            key = Fernet.generate_key()
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(key)
        key = path.read_bytes().strip()
    return Fernet(key)


def _encode(mapping: dict) -> tuple[str, bool]:
    raw = json.dumps(mapping, ensure_ascii=False)
    f = _fernet()
    if f is None:
        return raw, False
    return f.encrypt(raw.encode("utf-8")).decode("ascii"), True


def _decode(stored: str, encrypted: bool) -> dict:
    if not encrypted:
        return json.loads(stored)
    f = _fernet()
    if f is None:
        raise RuntimeError("Eşleme şifreli ama 'cryptography' paketi kurulu değil")
    return json.loads(f.decrypt(stored.encode("ascii")).decode("utf-8"))


# ----------------------------------------------------------------------------- eşleme deposu


def _save_mapping(mapping_id: str, mapping: dict) -> None:
    ensure_tables()
    stored, encrypted = _encode(mapping)
    with session_scope() as s:
        row = s.get(MaskMapping, mapping_id)
        if row is None:
            s.add(
                MaskMapping(
                    mapping_id=mapping_id, mapping_json=stored, encrypted=encrypted, created_at=utcnow()
                )
            )
        else:
            row.mapping_json = stored
            row.encrypted = encrypted


def load_mapping(mapping_id: str) -> dict | None:
    ensure_tables()
    with session_scope() as s:
        row = s.get(MaskMapping, mapping_id)
        if row is None:
            return None
        return _decode(row.mapping_json, row.encrypted)


def delete_mapping(mapping_id: str) -> bool:
    ensure_tables()
    with session_scope() as s:
        row = s.get(MaskMapping, mapping_id)
        if row is None:
            return False
        s.delete(row)
        return True


def purge_expired(days: int | None = None) -> int:
    """Saklama süresi dolan eşlemeleri siler; silinen kayıt sayısını döner."""
    ensure_tables()
    keep = get_settings().audit_retention_days if days is None else days
    cutoff = utcnow() - timedelta(days=keep)
    with session_scope() as s:
        n = s.query(MaskMapping).filter(MaskMapping.created_at < cutoff).delete()
    return int(n or 0)


# ----------------------------------------------------------------------------- maskeleyici


class Masker:
    """Bir istek boyunca birden çok metni aynı eşlemeyle maskeler (aynı değer → aynı yer tutucu).

    `persist=False` iken eşleme yalnız bellekte tutulur (ör. akış yanıtı aynı süreçte geri açılacaksa).
    """

    def __init__(self, mapping_id: str | None = None, *, entities=None, threshold: float = DEFAULT_THRESHOLD):
        self.mapping_id = mapping_id or f"m_{uuid.uuid4().hex}"
        self.entities = list(entities) if entities else None
        self.threshold = threshold
        self.placeholders: dict[str, str] = {}  # yer tutucu → özgün değer
        self._by_value: dict[str, str] = {}  # (etiket|normalize değer) → yer tutucu
        self._counters: dict[str, int] = {}
        self.findings: list[dict] = []
        self.meta: dict = {}
        if mapping_id:
            existing = load_mapping(mapping_id)
            if existing:
                self._restore(existing)

    def _restore(self, data: dict) -> None:
        self.placeholders = dict(data.get("placeholders", {}))
        self._by_value = dict(data.get("by_value", {}))
        self._counters = {k: int(v) for k, v in data.get("counters", {}).items()}

    def to_mapping(self) -> dict:
        return {"placeholders": self.placeholders, "by_value": self._by_value, "counters": self._counters}

    def _placeholder_for(self, entity_type: str, value: str) -> str:
        label = _label(entity_type)
        key = f"{label}|{_norm_value(value)}"
        ph = self._by_value.get(key)
        if ph is None:
            n = self._counters.get(label, 0) + 1
            self._counters[label] = n
            ph = f"<{label}_{n}>"
            self._by_value[key] = ph
            self.placeholders[ph] = value
        return ph

    def mask_text(self, text: str) -> str:
        if not text:
            return text
        findings, meta = scan_text(text, self.entities, self.threshold)
        self.meta = meta
        out: list[str] = []
        pos = 0
        for f in findings:
            ph = self._placeholder_for(f.entity_type, f.text)
            out.append(text[pos : f.start])
            out.append(ph)
            pos = f.end
            rec = f.public()
            rec["placeholder"] = ph
            self.findings.append(rec)
        out.append(text[pos:])
        return "".join(out)

    def unmask_text(self, text: str) -> str:
        return unmask_with(text, self.placeholders)

    @property
    def count(self) -> int:
        return len(self.findings)

    def save(self) -> str:
        _save_mapping(self.mapping_id, self.to_mapping())
        return self.mapping_id


def unmask_with(text: str, placeholders: dict[str, str]) -> str:
    if not text or not placeholders:
        return text
    return PLACEHOLDER_RE.sub(lambda m: placeholders.get(f"<{m.group(1)}>", m.group(0)), text)


# ----------------------------------------------------------------------------- dış API


def mask(
    text: str,
    entities: list[str] | None = None,
    *,
    mapping_id: str | None = None,
    threshold: float = DEFAULT_THRESHOLD,
) -> MaskResult:
    """Metni maskeler, eşlemeyi kaydeder. `mapping_id` verilirse var olan eşleme genişletilir."""
    m = Masker(mapping_id, entities=entities, threshold=threshold)
    masked = m.mask_text(text)
    m.save()
    return MaskResult(masked_text=masked, mapping_id=m.mapping_id, findings=m.findings, meta=m.meta)


def unmask(text: str, mapping_id: str) -> str:
    mapping = load_mapping(mapping_id)
    if mapping is None:
        raise KeyError(f"Eşleme bulunamadı veya süresi doldu: {mapping_id}")
    return unmask_with(text, mapping.get("placeholders", {}))


def scan(
    text: str,
    entities: list[str] | None = None,
    threshold: float = DEFAULT_THRESHOLD,
    include_text: bool = False,
) -> dict:
    findings, meta = scan_text(text, entities, threshold)
    return {"findings": [f.public(include_text) for f in findings], "meta": meta}


# ----------------------------------------------------------------------------- yapısal veri


_SKIP_KEYS = {"image", "file", "audio", "mapping_id", "image_url", "url", "data"}
_B64_RE = re.compile(r"^[A-Za-z0-9+/=\s]+$")


def _skip_string(key: str | None, value: str) -> bool:
    if key in _SKIP_KEYS:
        return True
    return len(value) > 256 and " " not in value[:256] and bool(_B64_RE.match(value[:4096]))


def mask_structure(obj: Any, masker: Masker, key: str | None = None) -> Any:
    """Sözlük/liste içindeki bütün metin değerlerini maskeler (base64 ve dosya alanları hariç)."""
    if isinstance(obj, str):
        return obj if _skip_string(key, obj) else masker.mask_text(obj)
    if isinstance(obj, dict):
        return {k: mask_structure(v, masker, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [mask_structure(v, masker, key) for v in obj]
    return obj


def unmask_structure(obj: Any, placeholders: dict[str, str]) -> Any:
    if isinstance(obj, str):
        return unmask_with(obj, placeholders)
    if isinstance(obj, dict):
        return {k: unmask_structure(v, placeholders) for k, v in obj.items()}
    if isinstance(obj, list):
        return [unmask_structure(v, placeholders) for v in obj]
    return obj


class StreamUnmasker:
    """Akış (SSE) yanıtında parça parça gelen metni geri açar; bölünmüş yer tutucuyu tamponda bekletir."""

    _MAX_PENDING = 40

    def __init__(self, placeholders: dict[str, str]):
        self.placeholders = placeholders
        self._buf = ""

    def feed(self, chunk: str) -> str:
        self._buf += chunk or ""
        cut = self._buf.rfind("<")
        if cut != -1 and ">" not in self._buf[cut:] and len(self._buf) - cut < self._MAX_PENDING:
            ready, self._buf = self._buf[:cut], self._buf[cut:]
        else:
            ready, self._buf = self._buf, ""
        return unmask_with(ready, self.placeholders)

    def flush(self) -> str:
        ready, self._buf = self._buf, ""
        return unmask_with(ready, self.placeholders)


def new_secret_token() -> str:  # yardımcı: tahmin edilemez kimlikler
    return secrets.token_hex(16)


__all__ = [
    "PLACEHOLDER_LABELS",
    "MaskResult",
    "Masker",
    "StreamUnmasker",
    "delete_mapping",
    "load_mapping",
    "mask",
    "mask_structure",
    "purge_expired",
    "scan",
    "unmask",
    "unmask_structure",
    "unmask_with",
]
