"""Hugging Face'ten model biçimi (artifact) indirme.

`huggingface_hub.snapshot_download(repo_id, allow_patterns=hf_files, local_dir=dest)` ayrı thread'de çalışır;
ilerleme, indirme öncesi `HfApi().model_info(files_metadata=True)` ile öğrenilen toplam boyuta karşı hedef klasörün
periyodik ölçülen boyutuyla hesaplanır.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable
from pathlib import Path

from ..catalog.schema import ModelArtifact, ModelSpec
from ..config import get_settings

log = logging.getLogger("aiplatform.hf")

ProgressCb = Callable[[int, int], None]  # (indirilen bayt, toplam bayt; bilinmiyorsa 0)
POLL_SECONDS = 1.0


def dir_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def artifact_size_on_disk(dest: Path) -> float:
    """Klasörün diskteki boyutu, GB."""
    return round(dir_size_bytes(Path(dest)) / 1024**3, 3)


def expected_total_bytes(artifact: ModelArtifact) -> int:
    """Depodaki eşleşen dosyaların toplam boyutu (bayt). Ağ hatasında 0 döner (ilerleme bilinmez)."""
    from huggingface_hub import HfApi
    from huggingface_hub.utils import filter_repo_objects

    s = get_settings()
    try:
        info = HfApi(endpoint=s.hf_endpoint, token=s.hf_token).model_info(
            artifact.hf_repo, revision=artifact.hf_revision, files_metadata=True, timeout=20
        )
    except Exception as e:  # noqa: BLE001
        log.warning("model bilgisi alınamadı (%s): %s", artifact.hf_repo, e)
        return 0
    siblings = info.siblings or []
    files = list(
        filter_repo_objects(siblings, allow_patterns=artifact.hf_files or None, key=lambda x: x.rfilename)
    )
    return sum(int(getattr(f, "size", 0) or 0) for f in files)


# Hugging Face büyük dosyaları Xet depolamasından (cas-server / cas-bridge.xethub.hf.co) verir. Şirket güvenlik
# duvarları çoğu zaman yalnız huggingface.co'ya izin verir; o zaman Xet kapatılınca klasik HTTP indirmesi
# (huggingface.co → hf.co CDN) çalışır.
_XET_MARKERS = ("xethub", "cas client", "cas-server", "cas-bridge", "file reconstruction error", "hf_xet")


def is_xet_error(e: BaseException) -> bool:
    text = f"{type(e).__name__}: {e}".lower()
    return any(m in text for m in _XET_MARKERS)


def set_xet_enabled(enabled: bool) -> bool:
    """Xet'i süreç genelinde aç/kapat. Kapatılırken önceden açıksa True döner (yeniden denemeye değer)."""
    os.environ["HF_HUB_DISABLE_XET"] = "0" if enabled else "1"
    try:
        from huggingface_hub import constants
    except ImportError:
        return False
    was_disabled = bool(getattr(constants, "HF_HUB_DISABLE_XET", False))
    constants.HF_HUB_DISABLE_XET = not enabled
    return (not enabled) and not was_disabled


async def download_artifact(
    model: ModelSpec, artifact: ModelArtifact, dest: Path, progress_cb: ProgressCb | None = None
) -> Path:
    """Artifact'i `dest` klasörüne indirir ve klasör yolunu döner."""
    if not artifact.hf_repo:
        raise ValueError(f"{model.id}/{artifact.id}: hf_repo tanımlı değil, indirilecek dosya yok")
    from huggingface_hub import snapshot_download

    s = get_settings()
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    total = await asyncio.to_thread(expected_total_bytes, artifact)
    if progress_cb:
        progress_cb(dir_size_bytes(dest), total)

    def _download() -> str:
        return snapshot_download(
            artifact.hf_repo,
            revision=artifact.hf_revision,
            allow_patterns=artifact.hf_files or None,
            local_dir=dest,
            token=s.hf_token,
            endpoint=s.hf_endpoint,
        )

    async def _run() -> None:
        task = asyncio.ensure_future(asyncio.to_thread(_download))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=POLL_SECONDS)
                if progress_cb:
                    done = await asyncio.to_thread(dir_size_bytes, dest)
                    progress_cb(done, total)
            await task
        except asyncio.CancelledError:
            task.cancel()  # thread durdurulamaz; dosyalar sonraki denemede kaldığı yerden devam eder
            raise

    if s.hf_disable_xet:
        set_xet_enabled(False)
    try:
        await _run()
    except Exception as e:  # yalnız Xet kaynaklı hatada yeniden denenir, diğerleri aynen yükselir
        if not (is_xet_error(e) and set_xet_enabled(False)):
            raise
        log.warning(
            "%s: Hugging Face Xet depolama sunucusuna ulaşılamadı (%s); klasik HTTP indirmeyle yeniden deneniyor. "
            "Kalıcı yapmak için AIP_HF_DISABLE_XET=true.",
            artifact.hf_repo,
            str(e)[:160],
        )
        await _run()
    if progress_cb:
        done = dir_size_bytes(dest)
        progress_cb(done, max(total, done))
    return dest
