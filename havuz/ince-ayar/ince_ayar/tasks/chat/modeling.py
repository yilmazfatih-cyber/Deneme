"""Sohbet modeli yükleme: tokenizer, taban model (duyarlık / 4-bit), LoRA ayarı, çıkarım ve üretim.

Kim kullanır: `tasks/chat/train.py`, `evaluate.py`, `merge.py`, `predict.py`.

Kararlar:
- Dolgu belirteci yoksa bitiş belirteci (eos) dolgu olarak kullanılır; **yeni belirteç eklenmez**.
  Böylece gömme tablosu büyümez ve bağdaştırıcı her zaman taban modelle uyumlu kalır.
- LoRA hedefi varsayılan olarak `all-linear`'dır (çıkış katmanı hariç bütün doğrusal katmanlar);
  modül adı ezberlemek gerekmez.
- Üretim, şablondan bulunan bitiş belirteçlerinde de durur (ör. `<end_of_turn>`); yalnız eos'a
  güvenmek bazı modellerde yanıtın uzamasına yol açar.

Genişletme: yeni bir PEFT yöntemi için `lora_config` işlevini örnek alın.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ince_ayar.config import TINY_MODEL
from ince_ayar.errors import UserError
from ince_ayar.hardware import Hardware, Precision, four_bit_config
from ince_ayar.messages import t
from ince_ayar.tasks.chat.config import ChatModelSection, LoraSection
from ince_ayar.tasks.chat.masking import Messages, encode_chat, generation_prompt
from ince_ayar.tiny import create_tiny_chat_model

ADAPTER_DIR = "bagdastirici"
FULL_MODEL_DIR = "model"
TINY_DIR = "taban"
_THINK_BLOCK = re.compile(r"^\s*<think>.*?</think>\s*", re.DOTALL)
_PROBE: Messages = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]


def resolve_base(base: str, texts: list[str], out_dir: Path, seed: int) -> str:
    """`minik-rastgele` ise minik modeli `out_dir/taban` içine kurar; değilse kimliği aynen döndürür."""
    if base != TINY_MODEL:
        return base
    target = out_dir / TINY_DIR
    if not (target / "config.json").is_file():
        create_tiny_chat_model(texts, target, seed)
    return str(target)


def load_tokenizer(base: str, settings: ChatModelSection | None = None) -> Any:
    """Tokenizer'ı yükler, dolgu belirtecini ve (verildiyse) özel sohbet şablonunu ayarlar."""
    from transformers import AutoTokenizer

    kwargs: dict[str, Any] = {}
    if settings is not None:
        kwargs["trust_remote_code"] = settings.uzak_kod
        if settings.surum:
            kwargs["revision"] = settings.surum
    try:
        tokenizer = AutoTokenizer.from_pretrained(base, **kwargs)
    except OSError as exc:
        raise UserError(t("model.yuklenemedi", model=base, ayrinti=str(exc).splitlines()[0])) from exc
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    if settings is not None and settings.sohbet_sablonu:
        tokenizer.chat_template = Path(settings.sohbet_sablonu).read_text(encoding="utf-8")
    return tokenizer


def load_base_model(
    base: str, settings: ChatModelSection, hardware: Hardware, precision: Precision
) -> Any:
    """Taban modeli seçilen duyarlıkla (ve istenirse 4-bit) yükler."""
    import torch
    from transformers import AutoModelForCausalLM

    kwargs: dict[str, Any] = {
        "dtype": getattr(torch, precision.weight_dtype),
        "trust_remote_code": settings.uzak_kod,
    }
    if settings.surum:
        kwargs["revision"] = settings.surum
    if settings.dort_bit:
        kwargs["quantization_config"] = four_bit_config(hardware, precision)
        kwargs["device_map"] = {"": 0}
    try:
        return AutoModelForCausalLM.from_pretrained(base, **kwargs)
    except OSError as exc:
        raise UserError(t("model.yuklenemedi", model=base, ayrinti=str(exc).splitlines()[0])) from exc


def lora_config(settings: LoraSection) -> Any:
    """Yapılandırmadaki LoRA ayarını PEFT nesnesine çevirir."""
    from peft import LoraConfig

    return LoraConfig(
        r=settings.r,
        lora_alpha=settings.alpha,
        lora_dropout=settings.dropout,
        target_modules=settings.hedef_moduller,
        use_rslora=settings.rslora,
        bias="none",
        task_type="CAUSAL_LM",
    )


def find_model_dir(path: Path) -> tuple[Path, bool]:
    """Çıktı klasöründen modeli bulur: (klasör, bağdaştırıcı mı). Doğrudan model klasörü de olur."""
    for candidate in (path, path / ADAPTER_DIR):
        if (candidate / "adapter_config.json").is_file():
            return candidate, True
    for candidate in (path, path / FULL_MODEL_DIR):
        if (candidate / "config.json").is_file():
            return candidate, False
    raise UserError(t("model.klasor_yok", yol=path))


def adapter_base(adapter_dir: Path, override: str | None = None) -> str:
    """Bağdaştırıcının taban modelini bulur: açık seçenek > kayıtlı yol > yandaki `taban/` klasörü."""
    from ince_ayar.io_utils import read_json

    if override:
        return override
    recorded = str(read_json(adapter_dir / "adapter_config.json").get("base_model_name_or_path", ""))
    sibling = adapter_dir.parent / TINY_DIR
    if recorded and (Path(recorded).is_dir() or not sibling.is_dir()):
        return recorded
    if sibling.is_dir():
        return str(sibling)
    raise UserError(t("model.taban_bilinmiyor", yol=adapter_dir))


def load_for_inference(model: str, device: str = "cpu") -> tuple[Any, Any]:
    """Çıkarım için model + tokenizer. `model`: çıktı klasörü, model klasörü ya da Hub kimliği."""
    import torch
    from transformers import AutoModelForCausalLM

    path = Path(model)
    dtype = torch.float32 if device == "cpu" else torch.float16
    if not path.exists():  # Hub kimliği (ör. taban modeli karşılaştırma için değerlendirmek)
        tokenizer = load_tokenizer(model)
        loaded = AutoModelForCausalLM.from_pretrained(model, dtype=dtype)
        return loaded.to(device).eval(), tokenizer
    directory, is_adapter = find_model_dir(path)
    tokenizer = load_tokenizer(str(directory))
    if not is_adapter:
        loaded = AutoModelForCausalLM.from_pretrained(str(directory), dtype=dtype)
        return loaded.to(device).eval(), tokenizer
    from peft import PeftModel

    base = AutoModelForCausalLM.from_pretrained(adapter_base(directory), dtype=dtype)
    return PeftModel.from_pretrained(base, str(directory)).to(device).eval(), tokenizer


def stop_token_ids(tokenizer: Any, model: Any) -> list[int]:
    """Üretimi durduracak belirteçler: modelin eos'ları + şablonun asistan turunu kapatan belirteç."""
    found: list[int] = []
    configured = getattr(model.generation_config, "eos_token_id", None)
    for value in configured if isinstance(configured, list) else [configured]:
        if isinstance(value, int) and value not in found:
            found.append(value)
    if tokenizer.eos_token_id is not None and tokenizer.eos_token_id not in found:
        found.append(tokenizer.eos_token_id)
    for value in encode_chat(tokenizer, _PROBE).stop_ids:
        if value not in found:
            found.append(value)
    return found


def clean_reply(text: str) -> str:
    """Yanıtın başındaki boş/dolu `<think>…</think>` bloğunu ve uç boşlukları atar."""
    return _THINK_BLOCK.sub("", text).strip()


def generate_reply(
    model: Any, tokenizer: Any, messages: Messages, max_new_tokens: int, stop_ids: list[int]
) -> str:
    """Sohbetin son asistan yanıtını modele ürettirir (açgözlü çözümleme; belirlenimci)."""
    import torch

    prompt = generation_prompt(tokenizer, messages)
    input_ids = torch.tensor([prompt], device=model.device)
    with torch.no_grad():
        output = model.generate(
            input_ids=input_ids,
            attention_mask=torch.ones_like(input_ids),
            max_new_tokens=max_new_tokens,
            do_sample=False,
            eos_token_id=stop_ids or None,
            pad_token_id=tokenizer.pad_token_id,
        )
    new_tokens = output[0][len(prompt) :]
    return clean_reply(tokenizer.decode(new_tokens, skip_special_tokens=True))
