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
    if progress_cb:
        done = dir_size_bytes(dest)
        progress_cb(done, max(total, done))
    return dest
