"""Testlerde ortak: kısa graf kurucular ve blok kimlikleri."""

import json
from pathlib import Path

from asama1_blok import (
    AddNumbersBlock,
    AgentInputBlock,
    AgentOutputBlock,
    ConditionBlock,
    StepThroughItemsBlock,
    StoreValueBlock,
    TextFormatBlock,
)
from asama2_graf import Graph

GIRIS, CIKIS, SABIT = AgentInputBlock.id, AgentOutputBlock.id, StoreValueBlock.id
TOPLA, METIN, KOSUL, GEZ = AddNumbersBlock.id, TextFormatBlock.id, ConditionBlock.id, StepThroughItemsBlock.id
ORNEK = Path(__file__).resolve().parent.parent / "ornek_graf.json"


def graf(dugumler, baglantilar, gid="test"):
    """dugumler: [(id, block_id, input_default)], baglantilar: [(kaynak, pin, hedef, pin)]"""
    return Graph.from_json(
        {
            "id": gid,
            "name": gid,
            "nodes": [{"id": i, "block_id": b, "input_default": d} for i, b, d in dugumler],
            "links": [
                {"source_id": a, "source_name": ap, "sink_id": h, "sink_name": hp} for a, ap, h, hp in baglantilar
            ],
        }
    )


def ornek_graf():
    return Graph.from_json(json.loads(ORNEK.read_text(encoding="utf-8")))
