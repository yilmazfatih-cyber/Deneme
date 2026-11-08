"""Model çalışma zamanları: LLM istemcisi (OpenAI uyumlu), gömme + vektör deposu, tembel yükleyici.

`model_dir()` kurulu bir modelin artifact klasörünü çözer: `settings.models_dir/<model_id>/<artifact_id>`.
"""

from __future__ import annotations

from pathlib import Path

from ..config import get_settings


def model_dir(model_id: str, artifact_id: str | None = None) -> Path | None:
    """Kurulu artifact klasörünü döner; yoksa None.

    artifact_id verilmezse önce katalogdaki artifact sırası, sonra klasördeki ilk alt dizin denenir.
    """
    base = get_settings().models_dir / model_id
    if artifact_id:
        p = base / artifact_id
        return p if p.exists() else None
    if not base.exists():
        return None
    try:
        from ..catalog import get_catalog

        spec = get_catalog().models.get(model_id)
        if spec:
            for a in spec.artifacts:
                if (base / a.id).exists():
                    return base / a.id
    except Exception:  # katalog okunamazsa klasöre bakılır
        pass
    subdirs = sorted(p for p in base.iterdir() if p.is_dir())
    return subdirs[0] if subdirs else None


def is_model_installed(model_id: str, artifact_id: str | None = None) -> bool:
    return model_dir(model_id, artifact_id) is not None
