"""N11 Metin Sınıflandırma — sıfır-atış (mDeBERTa XNLI, transformers) veya eğitilmiş hafif sınıflandırıcı.

`train`: gömme (sentence-transformers) + scikit-learn LogisticRegression; model `data_dir/classifiers/<id>.pkl`.
`classify`: `model_id` verilirse eğitilmiş sınıflandırıcı, verilmezse sıfır-atış (`labels` zorunlu).
Not: pickle yalnız platformun kendi ürettiği dosyalar için kullanılır; dışarıdan .pkl yüklemeyin.
"""

from __future__ import annotations

import asyncio
import pickle
import re
import uuid
from collections import Counter

from ...runtimes import model_dir
from ...runtimes.embeddings import default_embedder, embed_sync
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import (
    BaseRuntime,
    ModuleError,
    RunContext,
    get_settings,
    has_package,
    model_not_installed,
    not_ready,
    note,
    require,
)

ZERO_SHOT = "mdeberta-v3-xnli"
HYPOTHESIS = "Bu metin {} ile ilgilidir."
_PIPES = LazyRegistry()


def _clf_path(model_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", model_id or ""):
        raise ModuleError("Geçersiz sınıflandırıcı kimliği")
    return get_settings().data_dir / "classifiers" / f"{model_id}.pkl"


def zero_shot(text: str, labels: list[str], multi_label: bool) -> dict:  # pragma: no cover - transformers yok
    from transformers import pipeline

    path = model_dir(ZERO_SHOT)
    pipe = _PIPES.get(
        str(path), lambda: pipeline("zero-shot-classification", model=str(path), tokenizer=str(path))
    )
    r = pipe(text, candidate_labels=labels, multi_label=multi_label, hypothesis_template=HYPOTHESIS)
    return {"labels": list(r["labels"]), "scores": [round(float(s), 4) for s in r["scores"]]}


def train_classifier(examples: list[dict], model_id: str, embedder: str) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score

    texts = [str(e["text"]) for e in examples]
    labels = [str(e["label"]) for e in examples]
    counts = Counter(labels)
    if len(counts) < 2:
        raise ModuleError("En az iki farklı etiket gerekli")
    X = embed_sync(texts, embedder, kind="passage")
    clf = LogisticRegression(max_iter=2000, class_weight="balanced")
    cv = None
    folds = min(5, min(counts.values()))
    if folds >= 2:
        cv = float(cross_val_score(clf, X, labels, cv=folds).mean())
    clf.fit(X, labels)
    path = _clf_path(model_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        pickle.dump({"clf": clf, "embedder": embedder, "labels": sorted(counts)}, f)
    return {
        "model_id": model_id,
        "labels": sorted(counts),
        "examples": len(texts),
        "cv_accuracy": None if cv is None else round(cv, 4),
        "embedder": embedder,
    }


def predict_classifier(model_id: str, text: str) -> dict:
    path = _clf_path(model_id)
    if not path.exists():
        raise ModuleError(f"Sınıflandırıcı bulunamadı: {model_id} (önce 'train' çalıştırın)")
    with path.open("rb") as f:
        bundle = pickle.load(f)
    X = embed_sync([text], bundle["embedder"], kind="passage")
    probs = bundle["clf"].predict_proba(X)[0]
    order = sorted(range(len(probs)), key=lambda i: -probs[i])
    classes = list(bundle["clf"].classes_)
    return {"labels": [classes[i] for i in order], "scores": [round(float(probs[i]), 4) for i in order]}


@register("metin-siniflandirma")
class MetinSiniflandirma(BaseRuntime):
    requires = ("transformers",)

    async def do_classify(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        text = str(payload["text"])
        if payload.get("model_id"):
            if not (has_package("sklearn") and has_package("sentence_transformers")):
                raise not_ready("scikit-learn / sentence-transformers", "metin-siniflandirma")
            res = await asyncio.to_thread(predict_classifier, str(payload["model_id"]), text)
            note(ctx, model=str(payload["model_id"]), engine="egitilmis")
            return res
        require(payload, "labels")
        labels = [str(x) for x in payload["labels"]]
        if not has_package("transformers"):
            raise not_ready("transformers", "metin-siniflandirma")
        if model_dir(ZERO_SHOT) is None:
            raise model_not_installed(ZERO_SHOT, "metin-siniflandirma")
        res = await asyncio.to_thread(zero_shot, text, labels, bool(payload.get("multi_label")))
        note(ctx, model=ZERO_SHOT, engine="sifir-atis")
        return res

    async def do_train(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "examples")
        ex = payload["examples"]
        if not isinstance(ex, list) or not all(
            isinstance(e, dict) and e.get("text") and e.get("label") for e in ex
        ):
            raise ModuleError("'examples' {text, label} nesnelerinden oluşan bir liste olmalı")
        if len(ex) < 4:
            raise ModuleError("En az 4 örnek gerekli (etiket başına 2+ önerilir)")
        if not has_package("sklearn"):
            raise not_ready("scikit-learn", "metin-siniflandirma")
        if not has_package("sentence_transformers"):
            raise not_ready("sentence-transformers", "metin-siniflandirma")
        embedder = payload.get("embedder") or default_embedder(["multilingual-e5-small"])
        model_id = payload.get("model_id") or f"sinif-{uuid.uuid4().hex[:8]}"
        res = await asyncio.to_thread(train_classifier, ex, model_id, embedder)
        note(ctx, model=embedder, engine="logistic-regression")
        return res
