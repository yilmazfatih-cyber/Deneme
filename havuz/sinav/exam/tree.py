"""Görev kopyasının dosya ağacı: özet listesi (manifest), başlangıç anlık görüntüsü, desen eşleme.

`build_manifest` her dosyanın SHA-256 özetini çıkarır (bağımlılık ve önbellek klasörleri hariç);
`write_snapshot` aynı dosyaları sıkıştırılmış bir arşive koyar ki puanlamada "başlangıçta ne vardı"
satır satır karşılaştırılabilsin ve `restore` kopyayı başlangıç durumuna geri götürebilsin.

Desenler (`matches`): `**` sıfır ya da daha çok klasör, `*` tek klasör adı içinde her şey, `?` tek karakter.
Genişletme: yeni bir dışlama gerekiyorsa `foundations.EXCLUDED_DIRS`'e ekleyin.
"""

from __future__ import annotations

import hashlib
import io
import os
import re
import tarfile
from collections.abc import Iterable, Iterator
from functools import lru_cache
from pathlib import Path

from exam.foundations import EXCLUDED_DIRS, EXCLUDED_SUFFIXES

Manifest = dict[str, str]


@lru_cache(maxsize=512)
def _glob_regex(pattern: str) -> re.Pattern[str]:
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        elif pattern[i] == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(out + r"\Z")


def matches(path: str, patterns: Iterable[str]) -> bool:
    """Göreli yol (`a/b/c.py`) desenlerden birine uyuyor mu?"""
    return any(_glob_regex(pattern).match(path) for pattern in patterns)


def _excluded(name: str) -> bool:
    return name in EXCLUDED_DIRS or name.endswith(EXCLUDED_SUFFIXES)


def iter_files(root: Path) -> Iterator[str]:
    """Kökteki dosyaların göreli yolları (sıralı; dışlanan klasörlere girilmez)."""
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not _excluded(d))
        base = Path(current).relative_to(root)
        for name in sorted(files):
            if not _excluded(name):
                yield (base / name).as_posix()


def file_digest(path: Path) -> str:
    if path.is_symlink():
        return "baglanti:" + os.readlink(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_manifest(root: Path) -> Manifest:
    return {rel: file_digest(root / rel) for rel in iter_files(root)}


def write_snapshot(root: Path, manifest: Manifest, target: Path) -> None:
    """Özet listesindeki dosyaları `target` (.tar.gz) arşivine yazar."""
    with tarfile.open(target, "w:gz", compresslevel=6) as archive:
        for rel in manifest:
            archive.add(root / rel, arcname=rel, recursive=False)


class Snapshot:
    """Başlangıç arşivinden dosya içeriği okur (ihtiyaç olduğunda, bir kez)."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._cache: dict[str, bytes | None] = {}
        self._archive: tarfile.TarFile | None = None

    def read(self, rel: str) -> bytes | None:
        if rel not in self._cache:
            if self._archive is None:
                # Arşiv birçok okuma boyunca açık kalır; `close()` kapatır (bağlam yöneticisi uymaz).
                self._archive = tarfile.open(self.path, "r:gz")  # noqa: SIM115
            try:
                member = self._archive.getmember(rel)
            except KeyError:
                self._cache[rel] = None
            else:
                handle = self._archive.extractfile(member)
                self._cache[rel] = handle.read() if handle else None
        return self._cache[rel]

    def close(self) -> None:
        if self._archive is not None:
            self._archive.close()
            self._archive = None


def text_of(data: bytes | None) -> str | None:
    """UTF-8 metin ise içeriği, ikili ya da yoksa None."""
    if data is None:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def restore(root: Path, manifest: Manifest, snapshot: Snapshot) -> int:
    """Kopyayı başlangıç durumuna döndürür: yeni dosyaları siler, değişeni geri yazar. Değişen sayısı."""
    changed = 0
    current = set(iter_files(root))
    for rel in sorted(current - set(manifest)):
        (root / rel).unlink()
        changed += 1
        parent = (root / rel).parent
        while parent != root and not any(parent.iterdir()):
            parent.rmdir()  # yeni dosyayla açılan boş klasör de gitsin
            parent = parent.parent
    for rel, digest in manifest.items():
        path = root / rel
        if rel in current and file_digest(path) == digest:
            continue
        data = snapshot.read(rel)
        if data is None:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_symlink():
            path.unlink()
        path.write_bytes(data)
        changed += 1
    return changed


def snapshot_bytes(files: dict[str, bytes]) -> bytes:
    """Testler için: verilen dosyalardan bellekte .tar.gz üretir."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for rel, data in files.items():
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()
