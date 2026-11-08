"""N26 Konu Çıkarma — BERTopic (kuruluysa) veya scikit-learn TF-IDF + NMF; anahtar kelimeler KeyBERT /
TF-IDF / saf Python sıklık (her zaman çalışır)."""

from __future__ import annotations

import asyncio
import re
from collections import Counter

from ...runtimes import model_dir
from ..base import register
from ._common import BaseRuntime, ModuleError, ModuleNotReady, RunContext, has_package, note, require

STOPWORDS = set(
    [
        "acaba",
        "ama",
        "ancak",
        "artık",
        "aslında",
        "az",
        "bana",
        "bazen",
        "bazı",
        "belki",
        "ben",
        "beni",
        "benim",
        "beri",
        "bile",
        "bir",
        "birçok",
        "biri",
        "birkaç",
        "birşey",
        "biz",
        "bize",
        "bizi",
        "bizim",
        "bu",
        "buna",
        "bunda",
        "bundan",
        "bunlar",
        "bunları",
        "bunların",
        "bunu",
        "bunun",
        "burada",
        "böyle",
        "çok",
        "çünkü",
        "da",
        "daha",
        "dahi",
        "de",
        "defa",
        "diye",
        "diğer",
        "dolayı",
        "edilen",
        "eden",
        "en",
        "gibi",
        "göre",
        "hem",
        "hep",
        "hepsi",
        "her",
        "herhangi",
        "hiç",
        "için",
        "ile",
        "ilgili",
        "ise",
        "işte",
        "kadar",
        "karşın",
        "kendi",
        "ki",
        "kim",
        "kimse",
        "mi",
        "mu",
        "mü",
        "mı",
        "nasıl",
        "ne",
        "neden",
        "nerede",
        "niçin",
        "o",
        "olan",
        "olarak",
        "oldu",
        "olduğu",
        "olduğunu",
        "olmak",
        "olmayan",
        "olup",
        "olur",
        "ona",
        "onlar",
        "onları",
        "onların",
        "onu",
        "onun",
        "öyle",
        "pek",
        "rağmen",
        "sadece",
        "sanki",
        "siz",
        "şey",
        "şu",
        "şuna",
        "şunda",
        "şundan",
        "şunu",
        "tarafından",
        "tüm",
        "üzere",
        "var",
        "ve",
        "veya",
        "ya",
        "yani",
        "yapılan",
        "yine",
        "yoksa",
        "zaten",
        "the",
        "and",
        "of",
        "to",
        "in",
        "for",
        "on",
        "with",
        "is",
        "are",
        "was",
        "be",
        "by",
        "as",
        "at",
        "this",
        "that",
    ]
)
EMBEDDER = "multilingual-e5-small"


def tokens(text: str) -> list[str]:
    low = text.replace("İ", "i").replace("I", "ı").lower()
    return [w for w in re.findall(r"[a-zçğıöşü0-9]{3,}", low) if w not in STOPWORDS and not w.isdigit()]


def simple_keywords(text: str, top_n: int) -> list[dict]:
    words = tokens(text)
    if not words:
        return []
    uni = Counter(words)
    bi = Counter(f"{a} {b}" for a, b in zip(words, words[1:]))
    scored = {w: c for w, c in uni.items()}
    scored.update({b: c * 1.5 for b, c in bi.items() if c >= 2})
    top = sorted(scored.items(), key=lambda kv: -kv[1])[:top_n]
    mx = top[0][1] if top else 1
    return [{"keyword": k, "score": round(v / mx, 4)} for k, v in top]


def tfidf_keywords(text: str, top_n: int) -> list[dict]:
    from sklearn.feature_extraction.text import TfidfVectorizer

    sents = [s for s in re.split(r"(?<=[.!?\n])\s+", text) if s.strip()] or [text]
    vec = TfidfVectorizer(tokenizer=tokens, lowercase=False, ngram_range=(1, 2), token_pattern=None)
    try:
        m = vec.fit_transform(sents)
    except ValueError:
        return []
    scores = m.sum(axis=0).A1
    terms = vec.get_feature_names_out()
    order = scores.argsort()[::-1][:top_n]
    mx = float(scores[order[0]]) if len(order) else 1.0
    return [{"keyword": str(terms[i]), "score": round(float(scores[i]) / mx, 4)} for i in order]


def nmf_topics(texts: list[str], n_topics: int, top_n: int) -> dict:
    from sklearn.decomposition import NMF
    from sklearn.feature_extraction.text import TfidfVectorizer

    vec = TfidfVectorizer(
        tokenizer=tokens, lowercase=False, ngram_range=(1, 2), min_df=1, max_df=0.95, token_pattern=None
    )
    X = vec.fit_transform(texts)
    k = max(1, min(n_topics, X.shape[0], X.shape[1]))
    nmf = NMF(n_components=k, init="nndsvda", random_state=42, max_iter=400)
    W = nmf.fit_transform(X)
    terms = vec.get_feature_names_out()
    topics = []
    assign = W.argmax(axis=1)
    for t in range(k):
        idx = nmf.components_[t].argsort()[::-1][:top_n]
        topics.append(
            {"topic": t, "keywords": [str(terms[i]) for i in idx], "size": int((assign == t).sum())}
        )
    return {"topics": topics, "assignments": [int(a) for a in assign]}


def bertopic_topics(
    texts: list[str], n_topics: int | None, top_n: int
) -> dict:  # pragma: no cover - bertopic yok
    from bertopic import BERTopic
    from sentence_transformers import SentenceTransformer

    path = model_dir(EMBEDDER)
    emb = SentenceTransformer(str(path)) if path else None
    model = BERTopic(embedding_model=emb, language="multilingual", nr_topics=n_topics, top_n_words=top_n)
    assign, _ = model.fit_transform(texts)
    topics = []
    for _, row in model.get_topic_info().iterrows():
        tid = int(row["Topic"])
        words = [w for w, _ in (model.get_topic(tid) or [])][:top_n]
        topics.append({"topic": tid, "keywords": words, "size": int(row["Count"]), "outlier": tid == -1})
    return {"topics": topics, "assignments": [int(a) for a in assign]}


@register("konu-cikarma")
class KonuCikarma(BaseRuntime):
    requires = ()

    async def do_topics(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "texts")
        texts = [str(t) for t in payload["texts"] if str(t).strip()]
        if len(texts) < 2:
            raise ModuleError("Konu çıkarmak için en az 2 metin gerekli")
        n_topics = int(payload.get("n_topics") or 5)
        top_n = int(payload.get("top_n") or 8)
        if has_package("bertopic") and len(texts) >= 20:
            try:  # pragma: no cover
                res = await asyncio.to_thread(bertopic_topics, texts, payload.get("n_topics"), top_n)
                note(ctx, engine="bertopic")
                return res
            except Exception as e:  # pragma: no cover
                note(ctx, bertopic_error=str(e)[:200])
        if has_package("sklearn"):
            res = await asyncio.to_thread(nmf_topics, texts, n_topics, top_n)
            note(ctx, engine="tfidf-nmf")
            return res
        raise ModuleNotReady(
            "'bertopic' veya 'scikit-learn' kurulu değil — modül mağazasından 'konu-cikarma' kurun"
        )

    async def do_keywords(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        text = str(payload["text"])
        top_n = int(payload.get("top_n") or 10)
        if has_package("keybert") and has_package("sentence_transformers") and model_dir(EMBEDDER):
            try:  # pragma: no cover
                from keybert import KeyBERT
                from sentence_transformers import SentenceTransformer

                kw = KeyBERT(model=SentenceTransformer(str(model_dir(EMBEDDER))))
                pairs = await asyncio.to_thread(
                    kw.extract_keywords,
                    text,
                    keyphrase_ngram_range=(1, 2),
                    stop_words=list(STOPWORDS),
                    top_n=top_n,
                )
                note(ctx, engine="keybert")
                return {"keywords": [{"keyword": k, "score": round(float(s), 4)} for k, s in pairs]}
            except Exception as e:  # pragma: no cover
                note(ctx, keybert_error=str(e)[:200])
        if has_package("sklearn"):
            res = await asyncio.to_thread(tfidf_keywords, text, top_n)
            if res:
                note(ctx, engine="tfidf")
                return {"keywords": res}
        note(ctx, engine="siklik")
        return {"keywords": simple_keywords(text, top_n)}
