"""LoRA (düşük ranklı uyarlama), sıfırdan: doğrusal katmana küçük, eğitilebilir bir ek.

Çıktı: y = W x + (alpha / r) * B (A x). W donuktur; yalnız A (r x giriş) ve B (çıkış x r)
eğitilir. B sıfırla başladığı için eğitim başında model değişmez. `merge` eki W'nin içine
katar (W' = W + (alpha / r) B A): çıkarımda ek maliyet kalmaz, model sıradan modele döner.
Kayıt: yalnız bağdaştırıcı (A, B ve ayarlar) birkaç yüz KB tutar (`save_adapter`).

Genişletme: Başka katmanlara uygulamak için `LoRAConfig.targets` listesine katman adının sonunu
ekleyin (ör. "head"); birleştir/ayır eşitlik testi (tests/test_lora.py) geçmeli.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import torch
from safetensors.torch import load_file, save_file
from torch import Tensor, nn

ADAPTER_CONFIG = "adapter_config.json"
ADAPTER_WEIGHTS = "adapter.safetensors"
DEFAULT_TARGETS = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


@dataclass(frozen=True)
class LoRAConfig:
    rank: int = 8
    alpha: float = 16.0
    dropout: float = 0.0
    targets: tuple[str, ...] = field(default=DEFAULT_TARGETS)

    def __post_init__(self) -> None:
        if self.rank < 1:
            raise ValueError("LoRA rankı en az 1 olmalı.")
        if self.alpha <= 0:
            raise ValueError("LoRA alfası pozitif olmalı.")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("LoRA dropout'u 0 ile 1 arasında olmalı.")
        if not self.targets:
            raise ValueError("En az bir hedef katman adı verin (ör. q_proj).")


class LoRALinear(nn.Module):
    """Donuk bir `nn.Linear`ı saran LoRA katmanı."""

    def __init__(self, base: nn.Linear, config: LoRAConfig) -> None:
        super().__init__()
        self.base = base
        self.base.weight.requires_grad_(False)
        self.scale = config.alpha / config.rank
        self.lora_a = nn.Parameter(torch.empty(config.rank, base.in_features))
        self.lora_b = nn.Parameter(torch.zeros(base.out_features, config.rank))
        nn.init.kaiming_uniform_(self.lora_a, a=math.sqrt(5))  # nn.Linear ile aynı başlangıç
        self.drop = nn.Dropout(config.dropout)
        self.merged = False

    def delta(self) -> Tensor:
        """W'ye eklenecek fark: (alpha / r) * B @ A."""
        return (self.lora_b @ self.lora_a) * self.scale

    def forward(self, x: Tensor) -> Tensor:
        out: Tensor = self.base(x)
        if not self.merged:
            out = out + (self.drop(x) @ self.lora_a.t() @ self.lora_b.t()) * self.scale
        return out

    @torch.no_grad()
    def merge(self) -> None:
        if not self.merged:
            self.base.weight += self.delta().to(self.base.weight.dtype)
            self.merged = True

    @torch.no_grad()
    def unmerge(self) -> None:
        if self.merged:
            self.base.weight -= self.delta().to(self.base.weight.dtype)
            self.merged = False


def _targets(model: nn.Module, config: LoRAConfig) -> list[tuple[nn.Module, str, nn.Linear]]:
    found = []
    for name, module in model.named_modules():
        for child_name, child in module.named_children():
            full = f"{name}.{child_name}" if name else child_name
            if isinstance(child, nn.Linear) and full.endswith(config.targets):
                found.append((module, child_name, child))
    return found


def apply_lora(model: nn.Module, config: LoRAConfig) -> list[str]:
    """Hedef katmanları LoRA ile sarar, diğer parametreleri dondurur; sarılan adları döndürür."""
    for param in model.parameters():
        param.requires_grad_(False)
    targets = _targets(model, config)
    if not targets:
        raise ValueError(f"LoRA hedefi bulunamadı: {', '.join(config.targets)}")
    for parent, name, linear in targets:
        layer = LoRALinear(linear, config).to(linear.weight.device)
        setattr(parent, name, layer)
    return sorted(name for name, module in model.named_modules() if isinstance(module, LoRALinear))


def lora_layers(model: nn.Module) -> dict[str, LoRALinear]:
    return {name: m for name, m in model.named_modules() if isinstance(m, LoRALinear)}


def merge_lora(model: nn.Module) -> None:
    """Bütün LoRA eklerini ağırlıklara katar (çıktı değişmez, ek maliyet kalkar)."""
    for layer in lora_layers(model).values():
        layer.merge()


def unmerge_lora(model: nn.Module) -> None:
    for layer in lora_layers(model).values():
        layer.unmerge()


def remove_lora(model: nn.Module) -> None:
    """Ekleri katıp LoRA katmanlarını özgün `nn.Linear`larla değiştirir (sıradan model kalır)."""
    for name, layer in lora_layers(model).items():
        layer.merge()
        parent_name, _, child_name = name.rpartition(".")
        parent = model.get_submodule(parent_name) if parent_name else model
        setattr(parent, child_name, layer.base)
    for param in model.parameters():
        param.requires_grad_(True)


def adapter_tensors(model: nn.Module) -> dict[str, Tensor]:
    tensors: dict[str, Tensor] = {}
    for name, layer in lora_layers(model).items():
        tensors[f"{name}.lora_a"] = layer.lora_a.detach().cpu().contiguous()
        tensors[f"{name}.lora_b"] = layer.lora_b.detach().cpu().contiguous()
    return tensors


def save_adapter(
    out_dir: str | Path, model: nn.Module, config: LoRAConfig, info: dict[str, Any]
) -> Path:
    """Yalnız bağdaştırıcıyı kaydeder (temel model ağırlıkları yazılmaz)."""
    if any(layer.merged for layer in lora_layers(model).values()):
        raise ValueError("Birleştirilmiş LoRA kaydedilemez; önce unmerge_lora(model) çağırın.")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    save_file(adapter_tensors(model), str(out / ADAPTER_WEIGHTS))
    data = {"lora": {**asdict(config), "targets": list(config.targets)}, "info": info}
    (out / ADAPTER_CONFIG).write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8"
    )
    return out


def load_adapter(model: nn.Module, adapter_dir: str | Path) -> LoRAConfig:
    """Bağdaştırıcıyı temel modele uygular (model LoRA katmanlarıyla sarılır)."""
    root = Path(adapter_dir)
    if not (root / ADAPTER_CONFIG).is_file():
        raise FileNotFoundError(
            f"{root / ADAPTER_CONFIG} bulunamadı; ince-ayar çıktısındaki 'adaptor' klasörünü verin."
        )
    raw = json.loads((root / ADAPTER_CONFIG).read_text(encoding="utf-8"))["lora"]
    config = LoRAConfig(**{**raw, "targets": tuple(raw["targets"])})
    apply_lora(model, config)
    tensors = load_file(str(root / ADAPTER_WEIGHTS))
    layers = lora_layers(model)
    expected = {f"{name}.{part}" for name in layers for part in ("lora_a", "lora_b")}
    if set(tensors) != expected:
        raise ValueError(
            "Bağdaştırıcı bu modelle uyuşmuyor (katman adları farklı). Aynı temel modeli kullanın."
        )
    with torch.no_grad():
        for name, layer in layers.items():
            layer.lora_a.copy_(tensors[f"{name}.lora_a"])
            layer.lora_b.copy_(tensors[f"{name}.lora_b"])
    return config
