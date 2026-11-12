"""minitransformers — Hugging Face Transformers'ın iskeletini öğretmek için numpy tabanlı küçük yeniden yazım.

Aşama 1: tokenization_bpe.py      bayt düzeyinde BPE (eğit, kodla, çöz, kaydet)
Aşama 2: configuration_utils.py   PretrainedConfig  + modeling_utils.py  PreTrainedModel (save/from_pretrained)
Aşama 3: models/gpt/              GPTConfig + GPTForCausalLM (nedensel öz-dikkat, KV önbelleği)
Aşama 4: generation_utils.py      generate(): açgözlü, örnekleme, sıcaklık, top-k, top-p
Aşama 5: models/auto.py + pipelines.py   Auto sınıfları (tembel kayıt) ve pipeline()
Aşama 6: trainer.py               elle geri yayılım + AdamW
"""

from .configuration_utils import PretrainedConfig
from .generation_utils import GenerationConfig
from .modeling_utils import PreTrainedModel
from .models.auto import AutoConfig, AutoModelForCausalLM, AutoTokenizer
from .models.gpt import GPTConfig, GPTForCausalLM
from .pipelines import pipeline
from .tokenization_bpe import ByteLevelBPETokenizer
from .trainer import Trainer, TrainingArguments

__all__ = [
    "AutoConfig",
    "AutoModelForCausalLM",
    "AutoTokenizer",
    "ByteLevelBPETokenizer",
    "GPTConfig",
    "GPTForCausalLM",
    "GenerationConfig",
    "PreTrainedModel",
    "PretrainedConfig",
    "Trainer",
    "TrainingArguments",
    "pipeline",
]
