#!/usr/bin/env python
"""Ağırlık-uzayı birleştirme: mevcut ağırlıkları günceller, yeni (LoRA) ağırlıklar ekler.

Fikir "weight-space programming" ile aynı: eğitim döngüsü çalıştırmadan, doğrudan ağırlık tensörleri üzerinde
aritmetik yaparız. Üç işlem, hepsi isteğe bağlı ve birleştirilebilir:

  1. Görev vektörü (task vector)  W ← W + λ · (W_donör − W_taban)
     Donör, tabandan türemiş uzman bir modeldir (ör. Snowflake Arctic-Text2SQL-R1-7B, tabanı Qwen2.5-Coder-7B-Instruct).
     Fark vektörü "SQL uzmanlığı"dır; λ ile dozu ayarlanır.
  2. TIES budaması  |Δ| en büyük `density` oranındaki girdiler kalır, kalanı sıfırlanır (gürültü taşınmaz).
  3. LoRA ekleme    W ← W + (α / r) · B · A   (train_lora.py çıktısı; "yeni ağırlıklar")

Çıktı: HF biçiminde safetensors klasörü (config/tokenizer dosyaları tabandan kopyalanır) + `merge_report.json`
(kaç tensör değişti, parametrelerin yüzde kaçı değişti, λ, density). Sonra `llama.cpp convert_hf_to_gguf.py` ile
GGUF'a çevrilip `catalog/models.yaml`'a yerel biçim olarak eklenebilir.

Kullanım:
  python scripts/text2sql/merge_weights.py --base Qwen/Qwen2.5-Coder-7B-Instruct \\
      --donor Snowflake/Arctic-Text2SQL-R1-7B --lam 0.7 --density 0.3 \\
      --lora out/lora-text2sql --out out/koprusql-7b

Bellek: tensör tensör çalışır (safetensors `safe_open`); 7B için ~2× tek tensör boyutu yeter.
torch varsa bf16 dahil her tip; yoksa numpy ile fp16/fp32 (ml_dtypes kuruluysa bf16).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

try:
    import torch  # type: ignore

    _TORCH = True
except ImportError:  # pragma: no cover - ortama bağlı
    torch = None
    _TORCH = False

import numpy as np

_COPY_FILES = (
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.json",
    "merges.txt",
    "added_tokens.json",
    "chat_template.jinja",
)


# ---------------------------------------------------------------------------- dosya yerleşimi
def resolve_dir(path_or_repo: str, cache: str | None = None) -> Path:
    """Yerel klasör ya da HF depo kimliği (huggingface_hub ile indirilir)."""
    p = Path(path_or_repo)
    if p.is_dir():
        return p
    try:
        from huggingface_hub import snapshot_download
    except ImportError as e:  # pragma: no cover
        raise SystemExit(f"'{path_or_repo}' yerel klasör değil ve huggingface_hub kurulu değil") from e
    return Path(
        snapshot_download(
            path_or_repo,
            cache_dir=cache,
            allow_patterns=["*.safetensors", "*.json", "*.txt", "*.jinja"],
        )
    )


def shard_files(model_dir: Path) -> list[Path]:
    idx = model_dir / "model.safetensors.index.json"
    if idx.exists():
        weight_map = json.loads(idx.read_text(encoding="utf-8"))["weight_map"]
        return [model_dir / f for f in sorted(set(weight_map.values()))]
    files = sorted(model_dir.glob("*.safetensors"))
    if not files:
        raise SystemExit(f"{model_dir}: safetensors dosyası yok")
    return files


def tensor_locations(model_dir: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    from safetensors import safe_open

    for f in shard_files(model_dir):
        with safe_open(str(f), framework="np") as fh:
            for k in fh.keys():  # noqa: SIM118 - safe_open .keys() bir yöntem
                out[k] = f
    return out


# ---------------------------------------------------------------------------- tensör arka ucu
class Backend:
    """torch (bf16 dahil) ya da numpy. Tüm aritmetik fp32'de yapılır, çıktı hedef tipe çevrilir."""

    def __init__(self, out_dtype: str):
        self.out_dtype = out_dtype
        self.framework = "pt" if _TORCH else "np"

    def load(self, fh, key: str):
        t = fh.get_tensor(key)
        if _TORCH:
            return t.to(torch.float32)
        if t.dtype == np.float32:
            return t
        return t.astype(np.float32)

    def to_out(self, t):
        if _TORCH:
            dt = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[self.out_dtype]
            return t.to(dt).contiguous()
        if self.out_dtype == "bf16":
            try:
                import ml_dtypes  # type: ignore

                return t.astype(ml_dtypes.bfloat16)
            except ImportError as e:
                raise SystemExit(
                    "numpy arka ucunda bf16 için `pip install ml_dtypes` gerekir (veya torch kurun)"
                ) from e
        return t.astype({"fp16": np.float16, "fp32": np.float32}[self.out_dtype])

    @staticmethod
    def abs_quantile(t, q: float) -> float:
        if _TORCH:
            flat = t.abs().flatten()
            if flat.numel() > 2_000_000:  # kantil için örnekle (torch.quantile bellek sınırı)
                idx = torch.randint(0, flat.numel(), (2_000_000,))
                flat = flat[idx]
            return float(torch.quantile(flat, q))
        flat = np.abs(t).ravel()
        if flat.size > 2_000_000:
            flat = np.random.default_rng(0).choice(flat, 2_000_000, replace=False)
        return float(np.quantile(flat, q))

    @staticmethod
    def count_changed(a, b) -> int:
        if _TORCH:
            return int((a != b).sum().item())
        return int(np.count_nonzero(a != b))

    @staticmethod
    def numel(t) -> int:
        return int(t.numel()) if _TORCH else int(t.size)

    @staticmethod
    def matmul(b, a):
        return b @ a  # torch ve numpy'de aynı

    @staticmethod
    def where_keep(delta, thr):
        if _TORCH:
            return torch.where(delta.abs() >= thr, delta, torch.zeros_like(delta))
        return np.where(np.abs(delta) >= thr, delta, 0.0)


# ---------------------------------------------------------------------------- LoRA
def load_lora(lora_dir: Path, backend: Backend) -> tuple[dict[str, tuple[Any, Any]], float]:
    """{'model.layers.0.self_attn.q_proj.weight': (A, B)} ve ölçek α/r."""
    from safetensors import safe_open

    cfg = json.loads((lora_dir / "adapter_config.json").read_text(encoding="utf-8"))
    r = float(cfg.get("r", 8))
    alpha = float(cfg.get("lora_alpha", r))
    scale = alpha / r
    if cfg.get("use_rslora"):
        scale = alpha / (r**0.5)
    files = sorted(lora_dir.glob("adapter_model*.safetensors"))
    if not files:
        raise SystemExit(f"{lora_dir}: adapter_model.safetensors yok")
    pairs: dict[str, dict[str, Any]] = {}
    for f in files:
        with safe_open(str(f), framework=backend.framework) as fh:
            for k in fh.keys():  # noqa: SIM118
                if ".lora_A." in k:
                    base, which = k.split(".lora_A."), "A"
                elif ".lora_B." in k:
                    base, which = k.split(".lora_B."), "B"
                else:
                    continue
                target = base[0].replace("base_model.model.", "", 1) + ".weight"
                pairs.setdefault(target, {})[which] = backend.load(fh, k)
    out = {k: (v["A"], v["B"]) for k, v in pairs.items() if "A" in v and "B" in v}
    if not out:
        raise SystemExit("LoRA dosyasında lora_A/lora_B çifti bulunamadı")
    return out, scale


# ---------------------------------------------------------------------------- birleştirme
def merge(
    base_dir: Path,
    out_dir: Path,
    *,
    donor_dir: Path | None = None,
    lora_dir: Path | None = None,
    lam: float = 1.0,
    density: float = 1.0,
    out_dtype: str = "bf16",
    only: list[str] | None = None,
    log=print,
) -> dict:
    from safetensors import safe_open
    from safetensors.numpy import save_file as np_save

    if donor_dir is None and lora_dir is None:
        raise SystemExit("En az biri gerekli: --donor (görev vektörü) veya --lora (yeni ağırlıklar)")
    backend = Backend(out_dtype)
    base_loc = tensor_locations(base_dir)
    donor_loc = tensor_locations(donor_dir) if donor_dir else {}
    lora, lora_scale = load_lora(lora_dir, backend) if lora_dir else ({}, 0.0)

    out_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "base": str(base_dir),
        "donor": str(donor_dir) if donor_dir else None,
        "lora": str(lora_dir) if lora_dir else None,
        "lambda": lam,
        "density": density,
        "dtype": out_dtype,
        "tensors_total": len(base_loc),
        "tensors_task_vector": 0,
        "tensors_lora": 0,
        "tensors_skipped_shape": 0,
        "params_total": 0,
        "params_changed": 0,
        "lora_unmatched": sorted(k for k in lora if k not in base_loc),
    }
    weight_map: dict[str, str] = {}
    shards = shard_files(base_dir)
    for shard in shards:
        out_name = shard.name
        tensors_out: dict[str, Any] = {}
        with safe_open(str(shard), framework=backend.framework) as fh:
            keys = list(fh.keys())
            donor_fh_cache: dict[Path, Any] = {}
            for key in keys:
                w = backend.load(fh, key)
                orig = w.clone() if _TORCH else w.copy()
                selected = only is None or any(s in key for s in only)
                if selected and key in donor_loc:
                    dpath = donor_loc[key]
                    if dpath not in donor_fh_cache:
                        donor_fh_cache[dpath] = safe_open(str(dpath), framework=backend.framework)
                    d = backend.load(donor_fh_cache[dpath], key)
                    if tuple(d.shape) != tuple(w.shape):
                        report["tensors_skipped_shape"] += 1
                        log(f"  atlandı (boyut farklı): {key} {tuple(w.shape)} vs {tuple(d.shape)}")
                    else:
                        delta = d - w
                        if 0 < density < 1:
                            thr = backend.abs_quantile(delta, 1 - density)
                            delta = backend.where_keep(delta, thr)
                        w = w + lam * delta
                        report["tensors_task_vector"] += 1
                if selected and key in lora:
                    a, b = lora[key]
                    upd = backend.matmul(b, a) * lora_scale
                    if tuple(upd.shape) != tuple(w.shape):
                        report["tensors_skipped_shape"] += 1
                        log(f"  LoRA atlandı (boyut farklı): {key}")
                    else:
                        w = w + upd
                        report["tensors_lora"] += 1
                report["params_total"] += backend.numel(w)
                report["params_changed"] += backend.count_changed(w, orig)
                tensors_out[key] = backend.to_out(w)
                weight_map[key] = out_name
        if _TORCH:
            from safetensors.torch import save_file as pt_save

            pt_save(tensors_out, str(out_dir / out_name), metadata={"format": "pt"})
        else:
            np_save(tensors_out, str(out_dir / out_name), metadata={"format": "pt"})
        log(f"yazıldı: {out_name} ({len(tensors_out)} tensör)")

    if len(shards) > 1:
        (out_dir / "model.safetensors.index.json").write_text(
            json.dumps({"metadata": {}, "weight_map": weight_map}, indent=2), encoding="utf-8"
        )
    for name in _COPY_FILES:
        src = base_dir / name
        if src.exists():
            shutil.copy2(src, out_dir / name)
    report["params_changed_pct"] = (
        round(100 * report["params_changed"] / report["params_total"], 4) if report["params_total"] else 0
    )
    (out_dir / "merge_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log(
        f"bitti: {report['tensors_task_vector']} tensör görev vektörüyle, {report['tensors_lora']} tensör LoRA ile "
        f"güncellendi; parametrelerin %{report['params_changed_pct']} kadarı değişti"
    )
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--base",
        required=True,
        help="taban model: yerel klasör veya HF depo (Qwen/Qwen2.5-Coder-7B-Instruct)",
    )
    ap.add_argument(
        "--donor", help="görev vektörü kaynağı: tabandan türemiş uzman (Snowflake/Arctic-Text2SQL-R1-7B)"
    )
    ap.add_argument("--lora", help="train_lora.py çıktısı (adapter_config.json + adapter_model.safetensors)")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lam", type=float, default=1.0, help="görev vektörü ölçeği λ (0.5-1.0 tipik)")
    ap.add_argument(
        "--density", type=float, default=1.0, help="TIES: |Δ| en büyük bu oran kalır (1.0 = budama yok)"
    )
    ap.add_argument("--dtype", default="bf16", choices=["bf16", "fp16", "fp32"])
    ap.add_argument(
        "--only", action="append", help="yalnız adı bunu içeren tensörler (ör. --only mlp --only self_attn)"
    )
    ap.add_argument("--cache", default=None, help="HF indirme önbelleği")
    a = ap.parse_args(argv)
    base = resolve_dir(a.base, a.cache)
    donor = resolve_dir(a.donor, a.cache) if a.donor else None
    lora = Path(a.lora) if a.lora else None
    merge(
        base,
        a.out,
        donor_dir=donor,
        lora_dir=lora,
        lam=a.lam,
        density=a.density,
        out_dtype=a.dtype,
        only=a.only,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
