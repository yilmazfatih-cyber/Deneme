"""Bellek içi, çökme benzetimli dosya sistemi (hata enjektörü).

İki şeyi modeller:
1. **Süreç ölümü:** Değiştiren her işlem (create/write/sync/rename/remove/truncate/sync_dir) bir "adım"dır.
   `crash_at=k` verilirse k. adımda `CrashError` fırlar; yazma adımıysa verinin rastgele bir ön eki
   yazılmış olabilir (yarım kayıt).
2. **Güç kesintisi:** `sync()` edilmemiş baytlar ve `sync_dir()` edilmemiş klasör değişiklikleri
   kaybolabilir. `crash_image("power")` yalnız kalıcı olduğu KESİN olanı (artı sync edilmemiş kuyruğun
   rastgele, belki bozuk bir ön ekini) taşıyan yeni bir dosya sistemi döndürür.

Model bilinçli olarak kötümserdir (gerçek diskler çoğu zaman daha fazlasını korur) ama şunları
modellemez: aynı adla yeniden `create` edilen dosyanın eski içeriğinin yok olması, sektör düzeyinde
bozulma, yalan söyleyen diskler (fsync dönüp yazmayan).

Genişletme: yeni bir hata türü (ör. dolu disk) için `_step` içine koşul ekleyin ve `OSError` fırlatın.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .fs import WritableFile


class CrashError(Exception):
    """Benzetimde sürecin öldüğü an. Bu hatadan sonra aynı SimFS kullanılamaz."""


@dataclass
class _Inode:
    data: bytearray = field(default_factory=bytearray)
    synced: int = 0  # kalıcı olduğu kesin olan bayt sayısı


class _SimFile:
    def __init__(self, fs: SimFS, inode: _Inode) -> None:
        self._fs = fs
        self._inode = inode

    def write(self, data: bytes) -> None:
        self._fs._step(torn=(self._inode, data))
        self._inode.data += data

    def sync(self) -> None:
        self._fs._step()
        self._inode.synced = len(self._inode.data)

    def close(self) -> None:
        return None


class SimFS:
    """`fs.FileSystem` protokolünü bellekte gerçekler; adım sayar ve istenen adımda "ölür"."""

    def __init__(self, *, crash_at: int | None = None, seed: int = 0) -> None:
        self.live: dict[str, _Inode] = {}  # çalışan sürecin gördüğü klasör
        self.durable: dict[str, _Inode] = {}  # güç kesintisinden sonra kalacak klasör
        self.steps = 0
        self.crash_at = crash_at
        self.crashed = False
        self._rng = random.Random(seed)

    def _step(self, torn: tuple[_Inode, bytes] | None = None) -> None:
        if self.crashed:
            raise CrashError("süreç zaten öldü")
        if self.crash_at is not None and self.steps == self.crash_at:
            self.crashed = True
            if torn is not None:  # yarım yazma: verinin rastgele bir ön eki diske ulaşmış olabilir
                inode, data = torn
                inode.data += data[: self._rng.randrange(len(data) + 1)]
            raise CrashError(f"{self.steps}. adımda çökme")
        self.steps += 1

    def _inode(self, name: str) -> _Inode:
        try:
            return self.live[name]
        except KeyError:
            raise FileNotFoundError(name) from None

    def create(self, name: str) -> WritableFile:
        self._step()
        inode = _Inode()
        self.live[name] = inode
        return _SimFile(self, inode)

    def open_append(self, name: str) -> WritableFile:
        return _SimFile(self, self._inode(name))

    def read(self, name: str, offset: int = 0, size: int = -1) -> bytes:
        data = self._inode(name).data
        end = len(data) if size < 0 else offset + size
        return bytes(data[offset:end])

    def size(self, name: str) -> int:
        return len(self._inode(name).data)

    def exists(self, name: str) -> bool:
        return name in self.live

    def list_dir(self) -> list[str]:
        return sorted(self.live)

    def rename(self, src: str, dst: str) -> None:
        self._step()
        self.live[dst] = self.live.pop(src)

    def remove(self, name: str) -> None:
        self._step()
        del self.live[name]

    def truncate(self, name: str, size: int) -> None:
        self._step()
        inode = self._inode(name)
        del inode.data[size:]
        inode.synced = len(inode.data)

    def sync_dir(self) -> None:
        self._step()
        self.durable = dict(self.live)

    def crash_image(self, mode: str, seed: int = 0) -> SimFS:
        """Çökmeden sonra diskte kalanı yeni bir SimFS olarak döndürür.

        mode="process": süreç öldü, işletim sistemi ayakta → yazılan her şey durur.
        mode="power":   güç kesildi → yalnız sync edilenler kesin; gerisinin rastgele ön eki kalır.
        """
        if mode not in {"process", "power"}:
            raise ValueError("mode 'process' ya da 'power' olmalı")
        rng = random.Random(seed)
        image = SimFS()
        source = self.live if mode == "process" else self.durable
        for name, inode in source.items():
            data = bytes(inode.data)
            if mode == "power":
                tail = bytearray(data[inode.synced :])
                del tail[rng.randint(0, len(tail)) :]
                if tail and rng.random() < 0.5:
                    tail[-1] ^= 0xFF  # son bayt çöp olabilir
                data = data[: inode.synced] + bytes(tail)
            survivor = _Inode(bytearray(data), synced=len(data))
            image.live[name] = survivor
            image.durable[name] = survivor
        return image
