"""Aşama 2b — PreTrainedModel: her modelin ortak "kaydet / yükle" iskeleti.

Gerçek karşılığı: src/transformers/modeling_utils.py (class PreTrainedModel; save_pretrained, from_pretrained).
Ağırlıklar burada numpy .npz dosyasına yazılır ve allow_pickle=False ile okunur: tıpkı safetensors gibi
"yüklerken kod çalıştırmayan" bir biçim. (HF v5 artık safe_serialization=False'u desteklemiyor.)
"""

from __future__ import annotations

import os

import numpy as np

from . import hub
from .configuration_utils import PretrainedConfig
from .generation_utils import GenerationMixin

WEIGHTS_NAME = "model.npz"  # HF: model.safetensors (+ büyük modellerde model.safetensors.index.json)


class LoadingReport(dict):
    """missing / unexpected / mismatched anahtarları (HF'nin yükleme raporu gibi)."""


class PreTrainedModel(GenerationMixin):
    config_class: type[PretrainedConfig] | None = None

    def __init__(self, config):
        self.config = config
        self.params: dict[str, np.ndarray] = {}

    # ------------------------------------------------------------ ağırlık sözlüğü
    def state_dict(self):
        return {k: v.copy() for k, v in self.params.items()}

    def load_state_dict(self, state, strict=True):
        own = self.params
        report = LoadingReport(
            missing=sorted(set(own) - set(state)),
            unexpected=sorted(set(state) - set(own)),
            mismatched=sorted(k for k in set(own) & set(state) if own[k].shape != state[k].shape),
        )
        if strict and any(report.values()):
            raise RuntimeError(f"Ağırlıklar modele uymuyor: {dict(report)}")
        for k in set(own) & set(state):
            if own[k].shape == state[k].shape:
                own[k] = np.array(state[k], dtype=own[k].dtype)
        return report

    def num_parameters(self):
        return int(sum(v.size for v in self.params.values()))

    # ------------------------------------------------------------ kaydet / yükle
    def save_pretrained(self, save_directory):
        os.makedirs(save_directory, exist_ok=True)
        self.config.architectures = [type(self).__name__]
        self.config.save_pretrained(save_directory)
        np.savez(os.path.join(save_directory, WEIGHTS_NAME), **self.params)

    @classmethod
    def from_pretrained(cls, name_or_path, hub_dir=None, strict=True):
        path = hub.resolve(name_or_path, hub_dir)
        config = cls.config_class.from_pretrained(path)
        model = cls(config)  # rastgele başlatılır, sonra üzerine yazılır (HF v5: önce "meta" cihazda boş kurar)
        with np.load(os.path.join(path, WEIGHTS_NAME), allow_pickle=False) as data:
            model.loading_report = model.load_state_dict({k: data[k] for k in data.files}, strict=strict)
        return model
