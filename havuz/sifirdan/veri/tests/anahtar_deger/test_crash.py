"""Çökme testleri: yazmanın HER adımında süreç ölür ya da güç kesilir; yeniden açılışta ne
görülmeli?

Yöntem: önce çökmesiz bir koşuda dosya sistemi adımları sayılır; sonra her k için SimFS(crash_at=k)
ile aynı iş yükü koşulur, çökme anındaki disk görüntüsüyle depo yeniden açılır ve içeriği modelle
karşılaştırılır.

Güvenceler (sync=True):
- Onaylanan (write_batch'i dönmüş) hiçbir toplu yazma kaybolmaz.
- Çökme anında yarıda kalan toplu yazma ya bütünüyle görünür ya hiç görünmez (yarım kayıt atılır).
Güvence (sync=False, güç kesintisi): son yazmalar kaybolabilir ama görülen durum hep bir ÖNEKtir.
"""

from __future__ import annotations

import contextlib
import random

import pytest

import anahtar_deger.store as store_module
from anahtar_deger import CrashError, KVStore, Options, SimFS
from anahtar_deger.fs import FileSystem
from anahtar_deger.manifest import Manifest, encode
from anahtar_deger.wal import Op, WalWriter, encode_record
from tests.yardimci import seed_count

OPTIONS = Options(memtable_limit=160, block_size=48, compaction_trigger=3)


def make_workload(seed: int, count: int) -> list[list[Op]]:
    rng = random.Random(seed)
    keys = [f"k{i}".encode() for i in range(10)]
    batches: list[list[Op]] = []
    for _ in range(count):
        batch: list[Op] = []
        for _ in range(rng.randint(1, 3)):
            key = rng.choice(keys)
            value = None if rng.random() < 0.25 else rng.randbytes(rng.randint(0, 20))
            batch.append((key, value))
        batches.append(batch)
    return batches


def model_after(batches: list[list[Op]], count: int) -> dict[bytes, bytes]:
    state: dict[bytes, bytes] = {}
    for batch in batches[:count]:
        for key, value in batch:
            if value is None:
                state.pop(key, None)
            else:
                state[key] = value
    return state


def run_until_crash(fs: SimFS, batches: list[list[Op]], options: Options) -> int:
    """İş yükünü koşar; çökme olursa o ana dek onaylanan toplu yazma sayısını döndürür."""
    acked = 0
    try:
        db = KVStore.open(fs, options)
        for batch in batches:
            db.write_batch(batch)
            acked += 1
        db.close()
    except CrashError:
        pass
    return acked


def recovered_state(image: SimFS, options: Options) -> dict[bytes, bytes]:
    """Çökme görüntüsünden depoyu açar; açılamıyorsa bu da bir kalıcılık hatasıdır."""
    try:
        db = KVStore.open(image, options)
        state = dict(db.scan())
        db.close()
    except Exception as error:
        raise AssertionError(f"çökmeden sonra depo açılamadı: {error!r}") from error
    return state


def total_steps(batches: list[list[Op]], options: Options) -> int:
    fs = SimFS()
    assert run_until_crash(fs, batches, options) == len(batches)
    return fs.steps


def check_every_crash_point(seed: int, count: int, options: Options) -> int:
    batches = make_workload(seed, count)
    steps = total_steps(batches, options)
    for crash_at in range(steps + 1):
        fs = SimFS(crash_at=crash_at, seed=crash_at)
        acked = run_until_crash(fs, batches, options)
        allowed = [model_after(batches, acked), model_after(batches, acked + 1)]
        for mode in ("process", "power"):
            image = fs.crash_image(mode, seed=crash_at)
            state = recovered_state(image, options)
            assert state in allowed, f"tohum={seed} adım={crash_at} kip={mode} onaylı={acked}"
            # İkinci çökme: kurtarmanın kendisi de yarıda kesilebilir; ardından yine aynı sonuç.
            for recovery_crash in range(4):
                again = fs.crash_image(mode, seed=crash_at)
                again.crash_at = recovery_crash
                with contextlib.suppress(CrashError):
                    KVStore.open(again, options).close()
                assert recovered_state(again.crash_image(mode), options) == state
    return steps


def test_workload_actually_flushes_and_compacts() -> None:
    fs = SimFS()
    db = KVStore.open(fs, OPTIONS)
    flushed = compacted = False
    for batch in make_workload(1, 60):
        db.write_batch(batch)
        flushed = flushed or any(name.endswith(".sst") for name in fs.list_dir())
        compacted = compacted or (
            flushed and db.stats()["tables"] == 1 and db.stats()["memtable_entries"] == 0
        )
    assert flushed and compacted


@pytest.mark.parametrize("seed", range(seed_count(2, 2)))
def test_no_acknowledged_write_is_lost_at_any_crash_point(seed: int) -> None:
    steps = check_every_crash_point(seed, 45, OPTIONS)
    assert steps > 100  # gerçekten çok sayıda çökme noktası denendi


@pytest.mark.uzun
@pytest.mark.parametrize("seed", range(10, 30))
def test_no_acknowledged_write_is_lost_long(seed: int) -> None:
    check_every_crash_point(seed, 120, OPTIONS)


def test_without_fsync_power_loss_keeps_a_prefix() -> None:
    options = Options(memtable_limit=160, block_size=48, compaction_trigger=3, sync=False)
    batches = make_workload(5, 50)
    steps = total_steps(batches, options)
    prefixes = [model_after(batches, n) for n in range(len(batches) + 1)]
    lost_something = False
    for crash_at in range(steps + 1):
        fs = SimFS(crash_at=crash_at, seed=crash_at)
        acked = run_until_crash(fs, batches, options)
        # Süreç ölümünde işletim sistemi tamponları yaşar: onaylı yazma kaybolmaz.
        process_state = recovered_state(fs.crash_image("process", seed=crash_at), options)
        assert process_state in (prefixes[acked], prefixes[min(acked + 1, len(batches))])
        power_state = recovered_state(fs.crash_image("power", seed=crash_at), options)
        assert power_state in prefixes
        lost_something = lost_something or power_state not in (prefixes[acked], prefixes[-1])
    assert lost_something  # fsync'siz kipte kayıp gerçekten olabiliyor (README bunu söylüyor)


# ── Denetleyicinin dişleri var mı? Bilerek bozulmuş depo sürümleri YAKALANMALI.
# ────────────────────


def test_checker_catches_missing_wal_fsync(monkeypatch: pytest.MonkeyPatch) -> None:
    def append_without_sync(self: WalWriter, ops: list[Op]) -> None:
        self._file.write(encode_record(ops))

    monkeypatch.setattr(WalWriter, "append", append_without_sync)
    with pytest.raises(AssertionError):
        check_every_crash_point(0, 45, OPTIONS)


def test_checker_catches_non_atomic_manifest(monkeypatch: pytest.MonkeyPatch) -> None:
    def save_in_place(fs: FileSystem, manifest: Manifest) -> None:
        if fs.exists("MANIFEST"):
            fs.remove("MANIFEST")
        handle = fs.create("MANIFEST")
        handle.write(encode(manifest))
        handle.sync()
        handle.close()
        fs.sync_dir()

    monkeypatch.setattr(store_module, "save_manifest", save_in_place)
    with pytest.raises(AssertionError):
        check_every_crash_point(0, 45, OPTIONS)
