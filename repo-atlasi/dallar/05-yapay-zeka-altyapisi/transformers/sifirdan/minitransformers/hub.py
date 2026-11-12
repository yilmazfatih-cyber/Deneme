"""Model adını bir klasöre çeviren çözümleyici (çevrimdışı).

Gerçekte src/transformers/utils/hub.py içindeki cached_file / cached_files, huggingface_hub'ın
hf_hub_download ve snapshot_download fonksiyonlarıyla Hub'dan indirip yerel önbelleğe koyar.
Burada yalnızca yerel bir "hub" klasörü vardır: <hub_dir>/<kurum>/<model>/
"""

from __future__ import annotations

import os

ENV_VAR = "MINI_HF_HOME"


def resolve(name_or_path, hub_dir=None):
    if os.path.isdir(name_or_path):
        return name_or_path
    hub_dir = hub_dir or os.environ.get(ENV_VAR)
    if hub_dir:
        candidate = os.path.join(hub_dir, *name_or_path.split("/"))
        if os.path.isdir(candidate):
            return candidate
    raise OSError(
        f"'{name_or_path}' bulunamadı. Bu mini sürüm internete çıkmaz: bir klasör yolu verin "
        f"ya da hub_dir / {ENV_VAR} ile yerel hub klasörünü gösterin."
    )


def publish(model, tokenizer, repo_id, hub_dir):
    """push_to_hub karşılığı: modeli yerel hub klasörüne 'yayınlar'."""
    target = os.path.join(hub_dir, *repo_id.split("/"))
    model.save_pretrained(target)
    if tokenizer is not None:
        tokenizer.save_pretrained(target)
    return target
