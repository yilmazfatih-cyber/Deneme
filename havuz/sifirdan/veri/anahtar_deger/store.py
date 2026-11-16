"""LSM anahtar-değer deposu: yazma yolu, okuma yolu, boşaltma (flush), birleştirme ve kurtarma.

Yazma: WAL'a ekle (+fsync) → bellek tablosuna koy → tablo büyüdüyse SSTable'a boşalt.
Okuma: bellek tablosu → SSTable'lar (yeniden eskiye); ilk bulunan kazanır, silme işareti "yok"
demektir. Kurtarma: MANIFEST'i oku, manifest dışı (yarım kalmış) dosyaları sil, kalan WAL'ları
oynat. Her adımın çökme güvenliği tests/anahtar_deger/test_crash.py'de adım adım sınanır.

Genişletme: arka plan boşaltması (ayrı iş parçacığı + değişmez bellek tablosu) ya da seviyeli
birleştirme; ikisinde de dosyaların silinme sırası (önce manifest, sonra silme) korunmalıdır.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from .fs import FileSystem, RealFS
from .manifest import Manifest, file_number, load_manifest, save_manifest
from .memtable import MemTable
from .merge import merge_newest_first
from .sstable import SSTableReader, write_sstable
from .wal import Op, WalWriter, replay


@dataclass(frozen=True)
class Options:
    """Depo ayarları. Varsayılanlar küçük ve güvenlidir."""

    memtable_limit: int = 1 << 20  # bellek tablosu bu kadar bayta varınca SSTable'a boşaltılır
    block_size: int = 4096  # SSTable veri bloğu hedef boyutu
    bloom_bits_per_key: int = 10  # ≈ %1 yanlış pozitif
    compaction_trigger: int = 4  # bu kadar SSTable birikince hepsi tek tabloya birleştirilir
    sync: bool = (
        True  # True: her yazma fsync'li (güç kesintisine dayanıklı); False: yalnız süreç ölümüne
    )


class StoreClosedError(Exception):
    """Kapatılmış depo kullanılmaya çalışıldı. `KVStore.open(...)` ile yeniden açın."""


class KVStore:
    """Kalıcı, sıralı anahtar-değer deposu. Anahtar ve değerler `bytes`tır. Tek iş parçacığı
    içindir."""

    def __init__(self, fs: FileSystem, options: Options) -> None:
        self._fs = fs
        self._options = options
        self._memtable = MemTable()
        self._tables: list[SSTableReader] = []  # yeniden eskiye
        self._manifest = Manifest()
        self._wal: WalWriter | None = None
        self._closed = False

    @classmethod
    def open(cls, target: FileSystem | str | Path, options: Options | None = None) -> KVStore:
        """Klasördeki depoyu açar (yoksa oluşturur) ve çökme sonrası kurtarmayı yapar."""
        fs: FileSystem = RealFS(target) if isinstance(target, str | Path) else target
        store = cls(fs, options or Options())
        store._recover()
        return store

    # ── Kurtarma ────────────────────────────────────────────────────────────────────────────────

    def _recover(self) -> None:
        fs = self._fs
        for name in fs.list_dir():
            if name.endswith(".tmp"):  # yarım kalmış SSTable ya da manifest
                fs.remove(name)
        manifest = load_manifest(fs) or Manifest()
        live = set(manifest.tables)
        numbered = [n for n in fs.list_dir() if n.endswith((".sst", ".log"))]
        for name in numbered:
            orphan_table = name.endswith(".sst") and name not in live
            old_wal = name.endswith(".log") and file_number(name) < manifest.wal
            if orphan_table or old_wal:
                fs.remove(name)
        manifest.next_file = max([manifest.next_file, *(file_number(n) + 1 for n in numbered)])
        self._manifest = manifest
        self._tables = [SSTableReader(fs, name) for name in manifest.tables]
        wal_names = sorted(n for n in fs.list_dir() if n.endswith(".log"))
        for name in wal_names:
            for ops in replay(fs, name):
                for key, value in ops:
                    self._memtable.put(key, value)
        if wal_names:
            current = wal_names[-1]
        else:
            current = self._new_file_name(".log")
            fs.create(current).close()
        fs.sync_dir()  # silmeler ve yeni WAL'ın adı kalıcı olsun
        self._wal = WalWriter(fs, current, sync=self._options.sync)

    def _new_file_name(self, suffix: str) -> str:
        number = self._manifest.next_file
        self._manifest.next_file += 1
        return f"{number:06d}{suffix}"

    # ── Yazma yolu ──────────────────────────────────────────────────────────────────────────────

    def put(self, key: bytes, value: bytes) -> None:
        self.write_batch([(key, value)])

    def delete(self, key: bytes) -> None:
        self.write_batch([(key, None)])

    def write_batch(self, ops: Sequence[Op]) -> None:
        """İşlemleri atomik olarak uygular: çökmeden sonra ya hepsi görünür ya hiçbiri.

        Dönüş = onay: `sync=True` ise kayıt fsync edilmiştir.
        """
        wal = self._require_open()
        checked: list[Op] = []
        for key, value in ops:
            if not isinstance(key, bytes) or not (value is None or isinstance(value, bytes)):
                raise TypeError("Anahtar ve değer bytes olmalı (metin için .encode() kullanın).")
            checked.append((key, value))
        if not checked:
            return
        wal.append(checked)
        for key, value in checked:
            self._memtable.put(key, value)
        if self._memtable.size_bytes >= self._options.memtable_limit:
            self.flush()

    def flush(self) -> None:
        """Bellek tablosunu yeni bir SSTable'a yazar ve yeni bir WAL'a geçer."""
        old_wal = self._require_open()
        if len(self._memtable) == 0:
            return
        fs = self._fs
        table_name = self._new_file_name(".sst")
        write_sstable(
            fs,
            table_name,
            self._memtable.items(),
            block_size=self._options.block_size,
            bits_per_key=self._options.bloom_bits_per_key,
        )
        wal_name = self._new_file_name(".log")
        fs.create(wal_name).close()
        fs.sync_dir()  # SSTable'ın ve yeni WAL'ın adları kalıcı
        self._manifest.tables.insert(0, table_name)
        self._manifest.wal = file_number(wal_name)
        save_manifest(fs, self._manifest)  # dönüm noktası: bundan sonra eski WAL gereksiz
        old_wal.close()
        for name in fs.list_dir():
            if name.endswith(".log") and file_number(name) < self._manifest.wal:
                fs.remove(name)
        self._wal = WalWriter(fs, wal_name, sync=self._options.sync)
        self._tables.insert(0, SSTableReader(fs, table_name))
        self._memtable = MemTable()
        if len(self._tables) >= self._options.compaction_trigger:
            self.compact()

    def compact(self) -> None:
        """Bütün SSTable'ları tek tabloya birleştirir; gölgelenen sürümleri ve silmeleri atar."""
        self._require_open()
        if not self._tables:
            return
        fs = self._fs
        old_tables = self._tables
        # Hepsi birleştiği için bu en alt seviyedir: silme işaretinin gölgeleyeceği eski veri
        # kalmaz.
        merged = (
            (key, value)
            for key, value in merge_newest_first([table.scan() for table in old_tables])
            if value is not None
        )
        table_name = self._new_file_name(".sst")
        count = write_sstable(
            fs,
            table_name,
            merged,
            block_size=self._options.block_size,
            bits_per_key=self._options.bloom_bits_per_key,
        )
        if count == 0:  # her şey silinmiş: boş tabloyu tutmaya gerek yok
            fs.remove(table_name)
        fs.sync_dir()
        self._manifest.tables = [table_name] if count else []
        save_manifest(fs, self._manifest)  # dönüm noktası: eski tablolar artık gereksiz
        for table in old_tables:
            table.obsolete = True
            fs.remove(table.name)
        self._tables = [SSTableReader(fs, table_name)] if count else []

    # ── Okuma yolu ──────────────────────────────────────────────────────────────────────────────

    def get(self, key: bytes) -> bytes | None:
        """Anahtarın değeri; yoksa (ya da silinmişse) None."""
        self._require_open()
        found, value = self._memtable.get(key)
        if found:
            return value
        for table in self._tables:
            found, value = table.get(key)
            if found:
                return value
        return None

    def scan(self, start: bytes = b"", end: bytes | None = None) -> Iterator[tuple[bytes, bytes]]:
        """[start, end) aralığındaki canlı çiftler, anahtar sırasıyla.

        Bellek tablosunun o anki kopyası alınır; tarama sürerken yazmak serbesttir ama bir
        birleştirme tabloları silerse tarama açık bir hatayla durur.
        """
        self._require_open()
        sources: list[Iterator[tuple[bytes, bytes | None]]] = [
            iter(self._memtable.items(start, end))
        ]
        sources += [table.scan(start, end) for table in self._tables]
        for key, value in merge_newest_first(list(sources)):
            if value is not None:
                yield key, value

    # ── Yaşam döngüsü ───────────────────────────────────────────────────────────────────────────

    def close(self) -> None:
        """WAL'ı fsync edip kapatır (sync=False iken de temiz kapanışta veri kaybolmaz)."""
        if self._closed or self._wal is None:
            return
        self._wal.sync()
        self._wal.close()
        self._closed = True

    def stats(self) -> dict[str, int]:
        return {
            "memtable_entries": len(self._memtable),
            "memtable_bytes": self._memtable.size_bytes,
            "tables": len(self._tables),
            "table_entries": sum(table.entry_count for table in self._tables),
        }

    def _require_open(self) -> WalWriter:
        if self._closed or self._wal is None:
            raise StoreClosedError("Depo kapalı. `KVStore.open(klasör)` ile yeniden açın.")
        return self._wal

    def __enter__(self) -> KVStore:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
