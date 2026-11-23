"""Dosya yardımcıları: JSON okuma/yazma (atomik), SHA-256, güvenli dosya adı.

Kim kullanır: eğitim çıktıları, dizin (arama) dosyaları, raporlar, sunucu.
Atomik yazma: önce yanına geçici dosya yazılır, sonra `replace` ile yerine konur; yarıda kesilen bir
yazma eski dosyayı bozmaz (dizin ve paket dosyaları için önemli).

Genişletme: yeni bir dosya türü için buraya küçük bir işlev ekleyin; hata iletisi `messages.py`'de.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from goruntu.errors import UserError
from goruntu.messages import t


def write_bytes_atomic(path: Path, data: bytes) -> None:
    """Baytları atomik yazar (aynı klasörde geçici dosya + replace)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.gecici")
    temporary.write_bytes(data)
    temporary.replace(path)


def write_json(path: Path, payload: Any) -> None:
    """Okunaklı JSON yazar (Türkçe karakterler kaçışsız, sonda satır sonu), atomik."""
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    write_bytes_atomic(path, text.encode("utf-8"))


def read_json(path: Path) -> Any:
    """JSON dosyası okur; yoksa ya da bozuksa yol gösteren hata verir."""
    if not path.is_file():
        raise UserError(t("dosya.yok", yol=path))
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise UserError(t("dosya.json_bozuk", yol=path, ayrinti=exc.msg)) from exc
    except UnicodeDecodeError as exc:
        raise UserError(t("dosya.json_bozuk", yol=path, ayrinti=str(exc))) from exc


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    """Tek satır ekler (uzun eğitimde yarıda kesilince eldekiler kaybolmasın)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    """Dosyanın SHA-256 özeti (birebir kopya ve dizin kimliği için)."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_file_name(name: str | None, fallback: str = "goruntu") -> str:
    """Yüklenen dosya adından yol parçalarını ve gizli dosya noktasını atar ("../../x.jpg" → "x.jpg")."""
    cleaned = Path((name or fallback).replace("\\", "/")).name.strip()
    return cleaned.lstrip(".") or fallback
