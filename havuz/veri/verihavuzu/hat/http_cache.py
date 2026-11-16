"""Dosya tabanlı HTTP önbelleği: gövde + üst bilgi (ETag, Last-Modified, alınma zamanı).

Her adres için ``<klasör>/<sha256(adres)>.govde`` ve ``.json`` dosyaları tutulur. Getirici
(``fetch.py``) bu bilgilerle koşullu istek atar (If-None-Match / If-Modified-Since); sunucu
304 dönerse gövde önbellekten verilir. Önbellek klasörü depoya girmez (``calisma/``).
Genişletme: süre sonu (expiry) politikası gerekiyorsa ``CacheEntry.age_seconds`` ile karar verin;
bu dosyaya yeni alan eklerseniz eski kayıtların o alanı taşımayabileceğini unutmayın.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from verihavuzu.files import write_text_atomic


@dataclass
class CacheEntry:
    url: str
    status: int
    etag: str | None
    last_modified: str | None
    content_type: str | None
    fetched_at: str  # ISO 8601 (UTC)
    body: bytes = b""

    def age_seconds(self, now: datetime) -> float:
        return (now - datetime.fromisoformat(self.fetched_at)).total_seconds()


class HttpCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)

    def _paths(self, url: str) -> tuple[Path, Path]:
        name = hashlib.sha256(url.encode()).hexdigest()
        return self.directory / f"{name}.govde", self.directory / f"{name}.json"

    def get(self, url: str) -> CacheEntry | None:
        body_path, meta_path = self._paths(url)
        if not (body_path.is_file() and meta_path.is_file()):
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta.pop("body", None)
        return CacheEntry(**meta, body=body_path.read_bytes())

    def put(self, entry: CacheEntry) -> None:
        body_path, meta_path = self._paths(entry.url)
        temp = body_path.with_name(body_path.name + ".gecici")
        temp.write_bytes(entry.body)
        temp.replace(body_path)
        meta = asdict(entry)
        meta.pop("body")
        write_text_atomic(meta_path, json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    def touch(self, url: str, fetched_at: str) -> None:
        """304 yanıtından sonra alınma zamanını günceller."""
        entry = self.get(url)
        if entry is not None:
            entry.fetched_at = fetched_at
            self.put(entry)
