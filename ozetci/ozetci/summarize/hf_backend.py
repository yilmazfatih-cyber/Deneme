"""Hugging Face transformers arka ucu (CPU/GPU). Varsayılan model: Qwen/Qwen3-0.6B.

Qwen3 için "düşünme" (thinking) kapatılır: özetlemede gereksiz belirteç üretir ve
CPU'da yavaşlatır. Tokenizer sohbet şablonu yoksa düz birleştirme kullanılır.
"""

from __future__ import annotations

import os
from typing import Optional

from .output_parse import strip_thinking


class HFGenerator:
    def __init__(
        self,
        model_id: str,
        device: str = "cpu",
        dtype: Optional[str] = None,
        threads: Optional[int] = None,
        n_ctx: int = 8192,
        chars_per_token: float = 3.0,
        trust_remote_code: bool = False,
        local_files_only: bool = False,
        attn_implementation: Optional[str] = None,
    ) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if threads:
            torch.set_num_threads(threads)
        self.model_id = model_id
        self.name = f"hf:{os.path.basename(model_id.rstrip('/'))}"
        self.device = device
        torch_dtype = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}.get(dtype or "", None)
        if torch_dtype is None:
            torch_dtype = torch.float32 if device == "cpu" else torch.bfloat16
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=trust_remote_code, local_files_only=local_files_only)
        extra = {"attn_implementation": attn_implementation} if attn_implementation else {}
        self.model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=torch_dtype, trust_remote_code=trust_remote_code, local_files_only=local_files_only, **extra
        )
        self.model.to(device)
        self.model.eval()
        if self.tokenizer.pad_token_id is None and self.tokenizer.eos_token_id is not None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.n_ctx = n_ctx
        self.chars_per_token = chars_per_token
        self.max_input_chars = int(max(n_ctx - 1024, 256) * chars_per_token)  # istem + yanıt payı
        arch = str(getattr(self.model.config, "model_type", "") or "").lower()
        self._is_qwen3 = arch.startswith("qwen3") or "qwen3" in model_id.lower()

    def _encode(self, messages: list[dict]):
        tok = self.tokenizer
        template = getattr(tok, "chat_template", None)
        if template:
            kwargs = {"enable_thinking": False} if self._is_qwen3 else {}
            try:
                return tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True, **kwargs)
            except TypeError:
                return tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True)
        text = "\n\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\n\nASSISTANT:"
        return tok(text, return_tensors="pt")

    def generate(self, messages: list[dict], max_new_tokens: int = 350) -> str:
        import torch

        enc = self._encode(messages)
        input_ids = enc["input_ids"].to(self.device)
        attention = enc.get("attention_mask")
        if attention is not None:
            attention = attention.to(self.device)
        with torch.inference_mode():
            out = self.model.generate(
                input_ids=input_ids,
                attention_mask=attention,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                repetition_penalty=1.05,
                pad_token_id=self.tokenizer.pad_token_id,
            )
        new_tokens = out[0][input_ids.shape[1]:]
        text = self.tokenizer.decode(new_tokens, skip_special_tokens=True)
        return strip_thinking(text)
