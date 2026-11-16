"""Manifest: deponun "hangi dosyalar canlı" kaydı ve atomik güncellenmesi.

MANIFEST iki satırlık bir metin dosyasıdır:

    {"next_file": 9, "tables": ["000008.sst", "000005.sst"], "version": 1, "wal": 7}
    crc32=1a2b3c4d

`tables` yeniden eskiye sıralıdır; `wal` hâlâ gereken en eski WAL dosyasının numarasıdır.
Güncelleme: MANIFEST.tmp yaz → fsync → MANIFEST adına taşı (atomik) → klasörü fsync. Böylece çökmede
ya eski ya yeni manifest görülür, yarım manifest asla.

Genişletme: seviyeli birleştirme için `tables` yerine seviye başına liste tutun (`levels:
list[list[str]]`).
"""

from __future__ import annotations

import json
import zlib
from dataclasses import dataclass, field

from .fs import FileSystem

MANIFEST = "MANIFEST"
_TMP = "MANIFEST.tmp"


class ManifestError(Exception):
    """MANIFEST okunamadı; elle düzeltme gerekir (veri dosyalarına dokunmadan önce yedek alın)."""


@dataclass
class Manifest:
    wal: int = 0
    next_file: int = 1
    tables: list[str] = field(default_factory=list)


def file_number(name: str) -> int:
    """'000012.sst' → 12."""
    return int(name.split(".", 1)[0])


def encode(manifest: Manifest) -> bytes:
    body = json.dumps(
        {
            "version": 1,
            "wal": manifest.wal,
            "next_file": manifest.next_file,
            "tables": manifest.tables,
        },
        sort_keys=True,
    ).encode()
    return body + b"\ncrc32=" + f"{zlib.crc32(body):08x}".encode() + b"\n"


def decode(data: bytes) -> Manifest:
    lines = data.split(b"\n")
    if len(lines) < 2 or lines[1] != b"crc32=" + f"{zlib.crc32(lines[0]):08x}".encode():
        raise ManifestError("MANIFEST sağlama toplamı tutmadı")
    raw = json.loads(lines[0])
    return Manifest(
        wal=int(raw["wal"]), next_file=int(raw["next_file"]), tables=list(raw["tables"])
    )


def load_manifest(fs: FileSystem) -> Manifest | None:
    if not fs.exists(MANIFEST):
        return None
    return decode(fs.read(MANIFEST))


def save_manifest(fs: FileSystem, manifest: Manifest) -> None:
    """Manifest'i atomik olarak değiştirir ve kalıcı kılar."""
    handle = fs.create(_TMP)
    handle.write(encode(manifest))
    handle.sync()
    handle.close()
    fs.rename(_TMP, MANIFEST)
    fs.sync_dir()
