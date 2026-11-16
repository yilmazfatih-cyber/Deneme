"""Dosya sistemi soyutlaması: deponun diske dokunduğu TEK yer.

Depo (store.py) dosyalara doğrudan `open()` ile erişmez; bu küçük arayüzü kullanır. Böylece testler
gerçek disk yerine `sim_fs.SimFS` (bellek içi, çökme benzetimli) verebilir.
`RealFS` gerçek diske yazar; `sync()` = `os.fsync`, `sync_dir()` = klasörün fsync'i.

Genişletme: yeni bir dosya işlemi gerekiyorsa önce `FileSystem` protokolüne, sonra hem `RealFS`'e hem
`sim_fs.SimFS`'e ekleyin; SimFS'te değiştiren her işlem `_step()` çağırmalıdır (çökme noktası olur).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol


class WritableFile(Protocol):
    """Yalnız sona eklenen dosya tanıtıcısı."""

    def write(self, data: bytes) -> None: ...

    def sync(self) -> None:
        """Yazılanları kalıcı kıl (fsync). Dönmeden önce veri diskte olmalıdır."""

    def close(self) -> None: ...


class FileSystem(Protocol):
    """Tek bir klasör içindeki düz dosyalar. Adlar yalın dosya adıdır (alt klasör yok)."""

    def create(self, name: str) -> WritableFile:
        """Boş bir dosya oluşturur (varsa içeriğini siler) ve yazmak için açar."""

    def open_append(self, name: str) -> WritableFile:
        """Var olan dosyayı sonuna eklemek için açar."""

    def read(self, name: str, offset: int = 0, size: int = -1) -> bytes:
        """`offset`ten başlayarak `size` bayt okur (`size=-1`: sona kadar)."""

    def size(self, name: str) -> int: ...

    def exists(self, name: str) -> bool: ...

    def list_dir(self) -> list[str]: ...

    def rename(self, src: str, dst: str) -> None:
        """Atomik yeniden adlandırma; `dst` varsa yerine geçer."""

    def remove(self, name: str) -> None: ...

    def truncate(self, name: str, size: int) -> None:
        """Dosyayı `size` bayta kısaltır ve kısaltmayı kalıcı kılar."""

    def sync_dir(self) -> None:
        """Klasör girdilerini (yeni dosya, yeniden adlandırma, silme) kalıcı kılar."""


class _RealFile:
    def __init__(self, fd: int) -> None:
        self._fd = fd

    def write(self, data: bytes) -> None:
        view = memoryview(data)
        while view:  # os.write kısmi yazabilir; hepsi gidene dek sürdür
            written = os.write(self._fd, view)
            view = view[written:]

    def sync(self) -> None:
        os.fsync(self._fd)

    def close(self) -> None:
        if self._fd >= 0:
            os.close(self._fd)
            self._fd = -1


class RealFS:
    """Gerçek disk üstünde `FileSystem`."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        if "/" in name or "\\" in name or name in {"", ".", ".."}:
            raise ValueError(f"Geçersiz dosya adı: {name!r}")
        return self.root / name

    def create(self, name: str) -> WritableFile:
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        return _RealFile(os.open(self._path(name), flags, 0o644))

    def open_append(self, name: str) -> WritableFile:
        return _RealFile(os.open(self._path(name), os.O_WRONLY | os.O_APPEND))

    def read(self, name: str, offset: int = 0, size: int = -1) -> bytes:
        with self._path(name).open("rb") as handle:
            handle.seek(offset)
            return handle.read(size)

    def size(self, name: str) -> int:
        return self._path(name).stat().st_size

    def exists(self, name: str) -> bool:
        return self._path(name).exists()

    def list_dir(self) -> list[str]:
        return sorted(entry.name for entry in self.root.iterdir() if entry.is_file())

    def rename(self, src: str, dst: str) -> None:
        os.replace(self._path(src), self._path(dst))

    def remove(self, name: str) -> None:
        self._path(name).unlink()

    def truncate(self, name: str, size: int) -> None:
        fd = os.open(self._path(name), os.O_WRONLY)
        try:
            os.ftruncate(fd, size)
            os.fsync(fd)
        finally:
            os.close(fd)

    def sync_dir(self) -> None:
        if os.name == "nt":  # Windows klasör fsync'ini desteklemez
            return
        fd = os.open(self.root, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
