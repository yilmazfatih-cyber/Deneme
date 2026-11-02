"""llama.cpp (GGUF) arka ucu — CPU'da en hızlı ve en az bellek kullanan yol.

Örnek: ``huggingface-cli download Qwen/Qwen3-0.6B-GGUF Qwen3-0.6B-Q8_0.gguf --local-dir models``

Sohbet şablonu GGUF üst verisinden okunup Jinja ile **bizim tarafımızda** işlenir; böylece Qwen3'te
``enable_thinking=False`` HF arka ucuyla birebir aynı istemi üretir (eğitimdeki istemle de aynı).
Şablon işlenemezse ``create_chat_completion`` + ``/no_think`` yedeğine düşülür; ``<think>`` blokları
her durumda ayıklanır.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from .output_parse import strip_thinking

log = logging.getLogger("ozetci.gguf")


class LlamaCppGenerator:
    def __init__(self, model_path: str, n_ctx: int = 8192, threads: Optional[int] = None, chars_per_token: float = 3.0, verbose: bool = False) -> None:
        from llama_cpp import Llama

        self.model_path = model_path
        self.name = f"gguf:{os.path.basename(model_path)}"
        self.llm = Llama(model_path=model_path, n_ctx=n_ctx, n_threads=threads or max(1, (os.cpu_count() or 4) - 1), verbose=verbose)
        self.n_ctx = n_ctx
        self.chars_per_token = chars_per_token
        self.max_input_chars = int(max(n_ctx - 1024, 256) * chars_per_token)  # istem + yanıt payı
        meta = getattr(self.llm, "metadata", None) or {}
        arch = str(meta.get("general.architecture", "")).lower()
        self._is_qwen3 = arch.startswith("qwen3") or "qwen3" in os.path.basename(model_path).lower()
        self._template = meta.get("tokenizer.chat_template") or None
        self._eos = meta.get("tokenizer.ggml.eos_token_id")
        self._jinja = self._build_template(self._template) if self._template else None

    @staticmethod
    def _build_template(source: str):
        try:
            import jinja2
            from jinja2.sandbox import ImmutableSandboxedEnvironment
        except ImportError:  # pragma: no cover
            return None
        # Şablon model dosyasından gelir: sandbox'sız Jinja ile keyfi kod çalışabilirdi
        env = ImmutableSandboxedEnvironment(trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True)

        def raise_exception(message):
            raise jinja2.TemplateError(message)

        env.globals["raise_exception"] = raise_exception
        try:
            return env.from_string(source)
        except Exception as exc:  # şablon desteklenmiyor
            log.debug("GGUF sohbet şablonu işlenemedi: %s", exc)
            return None

    def _render(self, messages: list[dict]) -> Optional[str]:
        if self._jinja is None:
            return None
        kwargs = {"messages": messages, "add_generation_prompt": True}
        if self._is_qwen3:
            kwargs["enable_thinking"] = False
        try:
            return self._jinja.render(**kwargs)
        except Exception as exc:
            log.debug("şablon işleme hatası, chat_completion yedeğine düşülüyor: %s", exc)
            return None

    def generate(self, messages: list[dict], max_new_tokens: int = 350) -> str:
        prompt = self._render(messages)
        if prompt is not None:
            out = self.llm.create_completion(prompt=prompt, max_tokens=max_new_tokens, temperature=0.0, repeat_penalty=1.05,
                                             stop=["<|im_end|>", "<|endoftext|>", "<end_of_turn>", "<|eot_id|>"])
            text = out["choices"][0]["text"] or ""
            return strip_thinking(text)
        msgs = [dict(m) for m in messages]
        if self._is_qwen3 and msgs and msgs[-1]["role"] == "user" and "/no_think" not in msgs[-1]["content"]:
            msgs[-1]["content"] = msgs[-1]["content"].rstrip() + "\n/no_think"
        out = self.llm.create_chat_completion(messages=msgs, max_tokens=max_new_tokens, temperature=0.0, repeat_penalty=1.05)
        text = out["choices"][0]["message"]["content"] or ""
        return strip_thinking(text)
