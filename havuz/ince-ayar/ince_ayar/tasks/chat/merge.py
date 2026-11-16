"""LoRA bağdaştırıcısını taban modele katar ("birleştirir") ve tek parça model olarak kaydeder.

Kim kullanır: `python -m ince_ayar sohbet birlestir`. GGUF/Ollama'ya aktarmadan önce gereklidir
(llama.cpp dönüştürücüsü bağdaştırıcı değil, tam model okur).

- Birleştirme taban modelin kendi duyarlığında (`oto`) ya da istenen duyarlıkta yapılır.
  `safe_merge=True`: birleşen ağırlıkta NaN çıkarsa durur.
- Kaydedilen modelin `generation_config` bitiş belirteçlerine şablonun tur kapatan belirteci de
  eklenir (ör. `<|im_end|>`); böylece transformers ile üretim kendiliğinden durur.
- `--dogrula`: aynı girdide birleşik model ile bağdaştırıcılı modelin logitlerini karşılaştırır.

Genişletme: birden çok bağdaştırıcıyı birleştirmek gerekirse PEFT'in `add_weighted_adapter`
yöntemine bakın; bu dosya tek bağdaştırıcı içindir.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Literal

from ince_ayar import console
from ince_ayar.errors import UserError
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.tasks.chat.modeling import (
    adapter_base,
    find_model_dir,
    load_tokenizer,
    stop_token_ids,
)

MERGE_RECORD = "birlestirme.json"
Dtype = Literal["oto", "fp32", "fp16", "bf16"]
_DTYPES = {"fp32": "float32", "fp16": "float16", "bf16": "bfloat16"}


def max_logit_difference(left: Any, right: Any, input_ids: list[int]) -> float:
    """İki modelin aynı girdideki logitleri arasındaki en büyük mutlak fark."""
    import torch

    ids = torch.tensor([input_ids])
    with torch.no_grad():
        first = left(input_ids=ids).logits.float()
        second = right(input_ids=ids).logits.float()
    return float((first - second).abs().max())


def merge_adapter(
    adapter_path: Path,
    out_dir: Path,
    base_override: str | None = None,
    dtype: Dtype = "oto",
    verify: bool = False,
) -> Path:
    """Bağdaştırıcıyı birleştirip `out_dir` içine kaydeder; klasör yolunu döndürür."""
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM

    directory, is_adapter = find_model_dir(adapter_path)
    if not is_adapter:
        raise UserError(t("birlestir.bagdastirici_degil", yol=adapter_path))
    base = adapter_base(directory, base_override)
    torch_dtype: Any = "auto" if dtype == "oto" else getattr(torch, _DTYPES[dtype])
    console.info(t("birlestir.basliyor", taban=base, bagdastirici=directory))
    base_model = AutoModelForCausalLM.from_pretrained(base, dtype=torch_dtype)
    adapted = PeftModel.from_pretrained(base_model, str(directory)).eval()
    tokenizer = load_tokenizer(str(directory))
    probe: list[int] = []
    reference = None
    if verify:
        probe = list(tokenizer("Merhaba, bu bir doğrulama cümlesidir.")["input_ids"])[:32]
        with torch.no_grad():
            reference = adapted(input_ids=torch.tensor([probe])).logits.float()
    merged = adapted.merge_and_unload(safe_merge=True)
    merged.generation_config.eos_token_id = stop_token_ids(tokenizer, merged)
    out_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    record: dict[str, Any] = {
        "taban": base,
        "bagdastirici": str(directory),
        "duyarlik": dtype,
        "tarih": date.today().isoformat(),
    }
    if reference is not None:
        with torch.no_grad():
            merged_logits = merged(input_ids=torch.tensor([probe])).logits.float()
        record["en_buyuk_logit_farki"] = float((merged_logits - reference).abs().max())
        console.result(t("birlestir.dogrulama", fark=f"{record['en_buyuk_logit_farki']:.2e}"))
        weight_dtype = str(next(merged.parameters()).dtype).removeprefix("torch.")
        if weight_dtype != "float32":
            console.warn(t("birlestir.dusuk_duyarlik", duyarlik=weight_dtype))
    write_json(out_dir / MERGE_RECORD, record)
    console.result(t("birlestir.bitti", yol=out_dir))
    return out_dir
