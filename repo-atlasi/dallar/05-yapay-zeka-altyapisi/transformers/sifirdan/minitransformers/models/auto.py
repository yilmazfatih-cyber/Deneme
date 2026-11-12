"""Aşama 5a — Auto sınıfları: config.json'daki model_type'tan doğru sınıfı bulan tembel kayıt.

Gerçek karşılıkları:
  - src/transformers/models/auto/auto_mappings.py   (CONFIG_MAPPING_NAMES: model_type -> sınıf ADI; otomatik üretilir)
  - src/transformers/models/auto/configuration_auto.py (AutoConfig, _LazyConfigMapping)
  - src/transformers/models/auto/modeling_auto.py   (MODEL_FOR_CAUSAL_LM_MAPPING_NAMES, AutoModelForCausalLM)
  - src/transformers/models/auto/auto_factory.py    (_BaseAutoModelClass, _LazyAutoMapping)
Sınıflar ad (string) olarak tutulur ve ilk kullanımda içe aktarılır: 500+ modelin hepsini
`import transformers` anında yüklememek için.
"""

from __future__ import annotations

import importlib
import json
import os

from .. import hub
from ..configuration_utils import CONFIG_NAME
from ..tokenization_bpe import TOKENIZER_CONFIG_FILE

CONFIG_MAPPING_NAMES = {"mini-gpt": "minitransformers.models.gpt:GPTConfig"}
MODEL_FOR_CAUSAL_LM_MAPPING_NAMES = {"mini-gpt": "minitransformers.models.gpt:GPTForCausalLM"}
TOKENIZER_MAPPING_NAMES = {"ByteLevelBPETokenizer": "minitransformers.tokenization_bpe:ByteLevelBPETokenizer"}


class _LazyMapping:
    def __init__(self, names):
        self._names = dict(names)
        self._extra = {}  # register() ile eklenen sınıflar
        self._loaded = {}

    def __getitem__(self, key):
        if key in self._extra:
            return self._extra[key]
        if key not in self._loaded:
            if key not in self._names:
                raise KeyError(f"'{key}' tanınmıyor. Bilinenler: {sorted(set(self._names) | set(self._extra))}")
            module, _, attr = self._names[key].partition(":")
            self._loaded[key] = getattr(importlib.import_module(module), attr)
        return self._loaded[key]

    def __contains__(self, key):
        return key in self._names or key in self._extra

    def register(self, key, cls, exist_ok=False):
        if key in self and not exist_ok:
            raise ValueError(f"'{key}' zaten kayıtlı")
        self._extra[key] = cls


CONFIG_MAPPING = _LazyMapping(CONFIG_MAPPING_NAMES)
MODEL_FOR_CAUSAL_LM_MAPPING = _LazyMapping(MODEL_FOR_CAUSAL_LM_MAPPING_NAMES)
TOKENIZER_MAPPING = _LazyMapping(TOKENIZER_MAPPING_NAMES)


def _read_json(path, name):
    with open(os.path.join(path, name), encoding="utf-8") as f:
        return json.load(f)


class AutoConfig:
    @staticmethod
    def from_pretrained(name_or_path, hub_dir=None):
        path = hub.resolve(name_or_path, hub_dir)
        data = _read_json(path, CONFIG_NAME)
        return CONFIG_MAPPING[data["model_type"]].from_dict(data)

    @staticmethod
    def for_model(model_type, **kwargs):
        return CONFIG_MAPPING[model_type](**kwargs)

    @staticmethod
    def register(model_type, config_cls, exist_ok=False):
        if config_cls.model_type != model_type:
            raise ValueError("config_cls.model_type, kayıt anahtarıyla aynı olmalı")
        CONFIG_MAPPING.register(model_type, config_cls, exist_ok)


class AutoModelForCausalLM:
    def __init__(self):
        raise EnvironmentError("AutoModelForCausalLM doğrudan kurulmaz; from_pretrained veya from_config kullanın.")

    @staticmethod
    def from_config(config):
        return MODEL_FOR_CAUSAL_LM_MAPPING[config.model_type](config)

    @staticmethod
    def from_pretrained(name_or_path, hub_dir=None, **kwargs):
        path = hub.resolve(name_or_path, hub_dir)
        config = AutoConfig.from_pretrained(path)
        return MODEL_FOR_CAUSAL_LM_MAPPING[config.model_type].from_pretrained(path, **kwargs)

    @staticmethod
    def register(config_cls, model_cls, exist_ok=False):
        if model_cls.config_class is not config_cls:
            raise ValueError("model_cls.config_class, config_cls ile aynı olmalı")
        MODEL_FOR_CAUSAL_LM_MAPPING.register(config_cls.model_type, model_cls, exist_ok)


class AutoTokenizer:
    @staticmethod
    def from_pretrained(name_or_path, hub_dir=None):
        path = hub.resolve(name_or_path, hub_dir)
        cls_name = _read_json(path, TOKENIZER_CONFIG_FILE)["tokenizer_class"]
        return TOKENIZER_MAPPING[cls_name].from_pretrained(path)
