"""Hugging Face'ten model biçimi (artifact) indirme.

`huggingface_hub.snapshot_download(repo_id, allow_patterns=hf_files, local_dir=dest)` ayrı thread'de çalışır;
ilerleme, indirme öncesi `HfApi().model_info(files_metadata=True)` ile öğrenilen toplam boyuta karşı hedef klasörün
periyodik ölçülen boyutuyla hesaplanır.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
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

    await with_xet_fallback(artifact.hf_repo, _run)
    if progress_cb:
        done = dir_size_bytes(dest)
        progress_cb(done, max(total, done))
    return dest


def _xet_marker() -> Path:
    return get_settings().data_dir / "hf_xet_devre_disi"


async def with_xet_fallback(label: str, run: Callable[[], Awaitable[object]]) -> object:
    """`run()`'ı çalıştırır; Xet depolamasına ulaşılamazsa Xet'i kapatıp bir kez daha dener."""
    if get_settings().hf_disable_xet or _xet_marker().exists():
        set_xet_enabled(False)
    try:
        return await run()
    except Exception as e:  # yalnız Xet kaynaklı hatada yeniden denenir, diğerleri aynen yükselir
        if not (is_xet_error(e) and set_xet_enabled(False)):
            raise
        try:  # bu ağda Xet çalışmıyor: sonraki kurulumlar baştan klasik indirmeyle başlasın (~2 dk kazanç)
            _xet_marker().write_text("Xet depolamasına ulaşılamadı; klasik HTTP indirmesi kullanılıyor.\n")
        except OSError:
            log.debug("Xet işareti yazılamadı", exc_info=True)
        log.warning(
            "%s: Hugging Face Xet depolama sunucusuna ulaşılamadı (%s); klasik HTTP indirmeyle yeniden deneniyor. "
            "Kalıcı yapmak için AIP_HF_DISABLE_XET=true.",
            label,
            str(e)[:160],
        )
        return await run()


# ---------------------------------------------------------------- çalışma anı varlıkları (çevrimdışı çalışma)


def hf_cache_dir() -> Path:
    """Yardımcı depoların indirildiği platform önbelleği. Yükleyiciler `cache_dir=` ile yalnız buradan okur."""
    return get_settings().models_dir / "_hf_cache"


def docling_artifacts_dir() -> Path:
    return get_settings().models_dir / "docling" / "default"


async def download_aux(artifact: ModelArtifact, log_cb: Callable[[str], None] | None = None) -> list[str]:
    """Artifact'in `aux_repos` dosyalarını platform önbelleğine indirir; indirilen depo adlarını döner."""
    if not artifact.aux_repos:
        return []
    from huggingface_hub import snapshot_download

    s = get_settings()
    cache = hf_cache_dir()
    cache.mkdir(parents=True, exist_ok=True)
    done: list[str] = []
    for aux in artifact.aux_repos:
        if log_cb:
            log_cb(f"Yardımcı dosyalar indiriliyor: {aux.repo} ({', '.join(aux.files) or 'tümü'})")

        def _dl(repo=aux.repo, files=aux.files) -> str:
            return snapshot_download(
                repo, allow_patterns=files or None, cache_dir=cache, token=s.hf_token, endpoint=s.hf_endpoint
            )

        async def _run(_dl=_dl) -> str:
            return await asyncio.to_thread(_dl)

        await with_xet_fallback(aux.repo, _run)
        done.append(aux.repo)
    return done


def docling_ready() -> bool:
    d = docling_artifacts_dir()
    return d.is_dir() and any(d.iterdir())


async def prefetch(artifact: ModelArtifact, log_cb: Callable[[str], None] | None = None) -> str | None:
    """Kütüphanenin kendi indiricisiyle çalışma anı modellerini önceden indirir. Hedef klasörü döner."""
    if artifact.prefetch != "docling":
        return None
    dest = docling_artifacts_dir()
    dest.mkdir(parents=True, exist_ok=True)
    if log_cb:
        log_cb("Docling düzen ve tablo modelleri indiriliyor (yalnız kurulumda)")

    def _dl() -> None:
        import inspect

        from docling.utils.model_downloader import download_models

        wanted = {
            "with_layout": True,
            "with_tableformer": True,
            "with_code_formula": False,
            "with_picture_classifier": False,
            "with_rapidocr": False,
            "with_easyocr": False,
        }
        params = inspect.signature(download_models).parameters
        download_models(output_dir=dest, progress=False, **{k: v for k, v in wanted.items() if k in params})

    async def _run() -> None:
        await asyncio.to_thread(_dl)

    await with_xet_fallback("docling", _run)
    return str(dest)
