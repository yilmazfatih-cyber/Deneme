"""Üretim tarifleri: öğretmene ne sorulacağı, yanıtın nasıl ayrıştırılacağı, satıra nasıl çevrileceği.

Kim kullanır: `synth/pipeline.py`.
- `talimat`: belge/konu → (kullanıcı sorusu, asistan yanıtı) çiftleri → sohbet JSONL satırı.
- `sorgu`  : belge → arama sorguları → gömme çifti satırı (`sorgu`, `olumlu` = belge).

İstem dosyaları `synth/istemler/<tarif>-v<N>.txt` içindedir; yer tutucular `$konu`, `$belge`,
`$sayi` (Python `string.Template`; JSON örneğindeki süslü parantezlerle çakışmaz). İstem sürümü =
dosya adı + içerik özeti; istemi değiştirdiğinizde yeni sürüm adıyla kaydedin (`talimat-v2.txt`).

Genişletme: yeni tarif için `parse_*` ve `*_row` işlevlerini yazıp `RECIPES` sözlüğüne ekleyin.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from string import Template
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from ince_ayar.io_utils import sha256_text
from ince_ayar.synth.config import SeedRow

PROMPT_DIR = Path(__file__).with_name("istemler")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)

Candidate = dict[str, str]


class _InstructionPair(BaseModel):
    talimat: str = Field(min_length=1)
    yanit: str = Field(min_length=1)


class _InstructionResponse(BaseModel):
    ornekler: list[_InstructionPair] = Field(min_length=1)


class _QueryResponse(BaseModel):
    sorgular: list[str] = Field(min_length=1)


@dataclass(frozen=True)
class Prompt:
    template: str
    version: str  # ör. "talimat-v1"
    digest: str  # "sha256:…" (ilk 16 hane)

    def render(self, seed: SeedRow, count: int) -> str:
        return Template(self.template).safe_substitute(
            konu=seed.konu or "-", belge=seed.belge or "-", sayi=count
        )


def load_prompt(recipe: str, custom_path: str = "") -> Prompt:
    path = Path(custom_path) if custom_path else PROMPT_DIR / f"{recipe}-v1.txt"
    text = path.read_text(encoding="utf-8")
    return Prompt(text, path.stem, "sha256:" + sha256_text(text)[:16])


def extract_json(text: str) -> Any:
    """Model çıktısından ilk JSON nesnesini çıkarır: <think> bloğu, ``` çitleri ve önsöz atılır."""
    cleaned = _THINK.sub("", text).strip()
    fenced = _FENCE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        if start < 0:
            raise
        value, _ = json.JSONDecoder().raw_decode(cleaned[start:])
        return value


def parse_instructions(value: Any) -> list[Candidate]:
    parsed = _InstructionResponse.model_validate(value)
    return [{"talimat": p.talimat.strip(), "yanit": p.yanit.strip()} for p in parsed.ornekler]


def parse_queries(value: Any) -> list[Candidate]:
    parsed = _QueryResponse.model_validate(value)
    return [{"sorgu": query.strip()} for query in parsed.sorgular]


def instruction_row(candidate: Candidate, seed: SeedRow, system: str) -> dict[str, Any]:
    messages = [{"role": "system", "content": system}] if system else []
    messages += [
        {"role": "user", "content": candidate["talimat"]},
        {"role": "assistant", "content": candidate["yanit"]},
    ]
    return {"messages": messages, "grup": seed.kimlik}


def query_row(candidate: Candidate, seed: SeedRow, system: str) -> dict[str, Any]:
    del system
    return {"sorgu": candidate["sorgu"], "olumlu": seed.belge.strip(), "grup": seed.kimlik}


@dataclass(frozen=True)
class RecipeSpec:
    parse: Callable[[Any], list[Candidate]]
    to_row: Callable[[Candidate, SeedRow, str], dict[str, Any]]
    dedup_field: str  # yinelemesi denetlenecek alan
    needs_document: bool


RECIPES: dict[str, RecipeSpec] = {
    "talimat": RecipeSpec(parse_instructions, instruction_row, "talimat", needs_document=False),
    "sorgu": RecipeSpec(parse_queries, query_row, "sorgu", needs_document=True),
    # YENİ TARİF BURAYA
}


def parse_candidates(recipe: str, text: str) -> tuple[list[Candidate], str | None]:
    """Yanıtı ayrıştırır: (adaylar, hata nedeni). Hata varsa aday listesi boştur."""
    try:
        return RECIPES[recipe].parse(extract_json(text)), None
    except (json.JSONDecodeError, ValueError, ValidationError) as exc:
        return [], f"{type(exc).__name__}: {str(exc)[:200]}"
