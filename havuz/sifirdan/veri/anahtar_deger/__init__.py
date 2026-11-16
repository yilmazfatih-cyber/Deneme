"""anahtar_deger: LSM ağacı tasarımında kalıcı anahtar-değer deposu (yalnız standart kitaplık).

Kullanım:
    from anahtar_deger import KVStore
    with KVStore.open("veri_klasoru") as db:
        db.put(b"elma", b"kirmizi")
        db.get(b"elma")              # b"kirmizi"
        list(db.scan(b"a", b"f"))    # [(b"elma", b"kirmizi")]

Genişletme: yeni bir genel API ekleyince buraya da ekleyin ve README'deki "Dosya haritası"nı
güncelleyin.
"""

from .fs import FileSystem, RealFS
from .sim_fs import CrashError, SimFS
from .sstable import CorruptionError
from .store import KVStore, Options, StoreClosedError

__all__ = [
    "CorruptionError",
    "CrashError",
    "FileSystem",
    "KVStore",
    "Options",
    "RealFS",
    "SimFS",
    "StoreClosedError",
]
