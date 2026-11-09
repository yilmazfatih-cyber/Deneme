"""N24 Güvenlik Denetimi — istem enjeksiyonu / jailbreak / zararlı istek denetimi.

Granite Guardian 3.1 (transformers) kuruluysa model kararı kullanılır (model kartındaki `guardian_config` ile
"Yes"/"No" üretimi). Kurulu değilse kural tabanlı Türkçe/İngilizce kalıp tarayıcı çalışır ve meta'da
"model: kural-tabanlı" yazar. Geçit (`/v1/chat/completions`) bu modül kuruluysa son kullanıcı mesajını denetler.
"""

from __future__ import annotations

import asyncio
import re

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import BaseRuntime, RunContext, has_package, note, require

GUARD_MODEL = "granite-guardian-3.1-2b"
_MODELS = LazyRegistry()

# (kalıp, risk türü, ağırlık)
RULES: list[tuple[str, str, float]] = [
    (
        r"(önceki|yukarıdaki|tüm|bütün)\s+(talimat|komut|yönerge|kural)\w*\s+(yoksay|unut|görmezden gel|dikkate alma|iptal)",
        "jailbreak",
        0.9,
    ),
    (r"(talimat|komut|yönerge|kural)\w*\s+(yoksay|unut|görmezden gel)", "jailbreak", 0.8),
    (
        r"ignore\s+(all\s+|the\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directions)",
        "jailbreak",
        0.9,
    ),
    (r"disregard\s+(all\s+|the\s+)?(previous|prior|above)\s+\w+", "jailbreak", 0.85),
    (r"forget\s+(all\s+|everything\s+|your\s+)(previous\s+)?(instructions|rules)", "jailbreak", 0.85),
    (r"(system\s+prompt|sistem\s+istem\w*|sistem\s+mesaj\w*|gizli\s+talimat\w*)", "prompt_leak", 0.6),
    (
        r"(reveal|print|show|repeat)\s+(your|the)\s+(system|hidden|initial)\s+(prompt|instructions)",
        "prompt_leak",
        0.85,
    ),
    (r"\b(DAN|do anything now|developer mode|geliştirici modu)\b", "jailbreak", 0.75),
    (r"(you are now|artık sen)\s+.{0,40}(unrestricted|sınırsız|kısıtlamasız|filtresiz)", "jailbreak", 0.85),
    (
        r"(rol\s+yap|pretend|act as)\s+.{0,40}(kural(sız|ı yok)|no rules|without restrictions)",
        "jailbreak",
        0.8,
    ),
    (r"(bomba|patlayıcı|silah)\s+(nasıl\s+)?(yap|üret|imal)", "harm", 0.9),
    (r"how\s+to\s+(make|build)\s+(a\s+)?(bomb|explosive|weapon)", "harm", 0.9),
    (r"(şifre|parola|password)\w*\s+(çal|kır|crack|steal)", "harm", 0.7),
    (r"(drop\s+table|delete\s+from|truncate\s+table|;\s*--)", "sql_injection", 0.6),
]
BLOCK_THRESHOLD = 0.75


def rule_check(text: str) -> dict:
    scores: dict[str, float] = {}
    hits = []
    for pat, risk, weight in RULES:
        m = re.search(pat, text or "", re.IGNORECASE)
        if m:
            scores[risk] = max(scores.get(risk, 0.0), weight)
            hits.append({"risk": risk, "match": m.group(0)[:80], "weight": weight})
    top = max(scores.values(), default=0.0)
    risk = max(scores, key=scores.get) if scores else "yok"
    return {
        "risk": risk,
        "scores": scores,
        "blocked": top >= BLOCK_THRESHOLD,
        "hits": hits,
        "model": "kural-tabanlı",
    }


def _load_guardian(path):  # pragma: no cover - transformers/model yok
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(str(path))
    model = AutoModelForCausalLM.from_pretrained(str(path), torch_dtype="auto")
    model.eval()
    return tok, model


def guardian_check(text: str, context: str | None, risks=("jailbreak", "harm")) -> dict:  # pragma: no cover
    import torch

    path = model_dir(GUARD_MODEL)
    tok, model = _MODELS.get(str(path), lambda: _load_guardian(path))
    scores: dict[str, float] = {}
    for risk in risks:
        messages = [{"role": "user", "content": text}]
        if context:
            messages.insert(0, {"role": "system", "content": context})
        ids = tok.apply_chat_template(
            messages, guardian_config={"risk_name": risk}, add_generation_prompt=True, return_tensors="pt"
        ).to(model.device)
        with torch.no_grad():
            out = model.generate(
                ids, do_sample=False, max_new_tokens=5, return_dict_in_generate=True, output_scores=True
            )
        label = tok.decode(out.sequences[0][ids.shape[1] :], skip_special_tokens=True).strip().lower()
        probs = torch.softmax(out.scores[0][0], dim=-1)
        yes_ids = tok.encode("Yes", add_special_tokens=False)
        p_yes = float(probs[yes_ids[0]]) if yes_ids else 0.0
        if label.startswith("yes"):  # üretilen etiket "Yes" ise olasılık en az 0,5 sayılır
            p_yes = max(p_yes, 0.5)
        scores[risk] = round(p_yes, 4)
    top = max(scores.values(), default=0.0)
    return {
        "risk": max(scores, key=scores.get) if top >= 0.5 else "yok",
        "scores": scores,
        "blocked": top >= 0.5,
        "model": GUARD_MODEL,
    }


def guard_ready() -> bool:
    return has_package("transformers") and has_package("torch") and model_dir(GUARD_MODEL) is not None


async def check_text(text: str, context: str | None = None) -> dict:
    """Geçidin de kullandığı birleşik denetim (kural + varsa model)."""
    rules = rule_check(text)
    if not guard_ready():
        return rules
    try:  # pragma: no cover
        model_res = await asyncio.to_thread(guardian_check, text, context)
    except Exception as e:  # pragma: no cover
        rules["model_error"] = str(e)[:200]
        return rules
    merged = dict(model_res["scores"])  # pragma: no cover
    for k, v in rules["scores"].items():  # pragma: no cover
        merged[k] = max(merged.get(k, 0.0), v)
    return {
        "risk": model_res["risk"] if model_res["blocked"] else rules["risk"],
        "scores": merged,  # pragma: no cover
        "blocked": model_res["blocked"] or rules["blocked"],
        "hits": rules["hits"],
        "model": GUARD_MODEL,
    }


@register("guvenlik-denetimi")
class GuvenlikDenetimi(BaseRuntime):
    async def do_check(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        res = await check_text(str(payload["text"]), payload.get("context"))
        note(ctx, model=res["model"] if res["model"] != "kural-tabanlı" else None, engine=res["model"])
        if res["model"] == "kural-tabanlı":
            note(ctx, model_note="model: kural-tabanlı")
        return res

    async def health(self) -> dict:
        return {
            "module": self.module_id,
            "ready": True,
            "model": GUARD_MODEL if guard_ready() else "kural-tabanlı",
        }
