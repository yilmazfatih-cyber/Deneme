"""Aşama 2a — Yapılandırma (config): modelin mimarisini tarif eden, JSON'a yazılabilen nesne.

Gerçek karşılığı: src/transformers/configuration_utils.py (class PreTrainedConfig).
Kural: model sınıfı yalnızca config'e bakarak kurulabilmelidir; ağırlıklar ayrı dosyadadır.
"""

from __future__ import annotations

import json
import os

CONFIG_NAME = "config.json"


class PretrainedConfig:
    model_type = ""  # Auto sınıfları bu anahtarla doğru sınıfı bulur

    def __init__(self, **kwargs):
        self.architectures = kwargs.pop("architectures", None)
        self.bos_token_id = kwargs.pop("bos_token_id", None)
        self.eos_token_id = kwargs.pop("eos_token_id", None)
        for key, value in kwargs.items():  # bilinmeyen alanlar kaybolmaz (ileri uyumluluk)
            setattr(self, key, value)

    def to_dict(self):
        out = dict(sorted(vars(self).items()))
        out["model_type"] = self.model_type
        return out

    def to_json_string(self):
        return json.dumps(self.to_dict(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"

    def save_pretrained(self, save_directory):
        os.makedirs(save_directory, exist_ok=True)
        with open(os.path.join(save_directory, CONFIG_NAME), "w", encoding="utf-8") as f:
            f.write(self.to_json_string())

    @classmethod
    def from_dict(cls, data):
        data = dict(data)
        model_type = data.pop("model_type", None)
        if cls.model_type and model_type and model_type != cls.model_type:
            raise ValueError(f"config.json model_type='{model_type}', fakat {cls.__name__} '{cls.model_type}' bekliyor")
        return cls(**data)

    @classmethod
    def from_pretrained(cls, path):
        with open(os.path.join(path, CONFIG_NAME), encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    def __eq__(self, other):
        return type(self) is type(other) and self.to_dict() == other.to_dict()

    def __repr__(self):
        return f"{type(self).__name__} {self.to_json_string()}"
