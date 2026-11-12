"""Aşama 5b — pipeline(): "görev adı + model adı" ile tek satırlık kullanım.

Gerçek karşılıkları: src/transformers/pipelines/__init__.py (pipeline, SUPPORTED_TASKS),
src/transformers/pipelines/base.py (Pipeline: preprocess -> _forward -> postprocess),
src/transformers/pipelines/text_generation.py (TextGenerationPipeline).
"""

from __future__ import annotations

from . import hub
from .models.auto import AutoModelForCausalLM, AutoTokenizer


class Pipeline:
    def __init__(self, model, tokenizer):
        self.model, self.tokenizer = model, tokenizer

    def _sanitize_parameters(self, **kwargs):
        """Kullanıcı parametrelerini üç aşamaya dağıtır: (preprocess, forward, postprocess)."""
        return {}, kwargs, {}

    def __call__(self, inputs, **kwargs):
        pre, fwd, post = self._sanitize_parameters(**kwargs)
        if isinstance(inputs, list):
            return [self(i, **kwargs) for i in inputs]
        return self.postprocess(self._forward(self.preprocess(inputs, **pre), **fwd), **post)


class TextGenerationPipeline(Pipeline):
    def _sanitize_parameters(self, return_full_text=True, **generate_kwargs):
        return {}, generate_kwargs, {"return_full_text": return_full_text}

    def preprocess(self, text):
        return {"prompt": text, "input_ids": self.tokenizer.encode(text)}

    def _forward(self, model_inputs, **generate_kwargs):
        generate_kwargs.setdefault("eos_token_id", self.tokenizer.eos_token_id)
        out = self.model.generate(model_inputs["input_ids"], **generate_kwargs)
        return {**model_inputs, "output_ids": out[0]}

    def postprocess(self, model_outputs, return_full_text=True):
        ids = model_outputs["output_ids"]
        if not return_full_text:
            ids = ids[len(model_outputs["input_ids"]) :]
        return [{"generated_text": self.tokenizer.decode(ids, skip_special_tokens=True)}]


SUPPORTED_TASKS = {
    "text-generation": {"impl": TextGenerationPipeline, "model": AutoModelForCausalLM},
}


def pipeline(task, model, tokenizer=None, hub_dir=None):
    if task not in SUPPORTED_TASKS:
        raise KeyError(f"Bilinmeyen görev '{task}'. Desteklenenler: {sorted(SUPPORTED_TASKS)}")
    spec = SUPPORTED_TASKS[task]
    if isinstance(model, str):
        path = hub.resolve(model, hub_dir)
        model = spec["model"].from_pretrained(path)
        tokenizer = tokenizer or AutoTokenizer.from_pretrained(path)
    if tokenizer is None:
        raise ValueError("Model nesnesi verildiyse tokenizer da verilmeli.")
    return spec["impl"](model, tokenizer)
