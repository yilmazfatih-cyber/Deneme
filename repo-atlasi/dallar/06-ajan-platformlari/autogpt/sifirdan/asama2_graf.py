"""Aşama 2 — Graf: düğümler (blok örnekleri) + bağlantılar (pin → pin), JSON ve doğrulama.

Gerçek karşılığı: autogpt_platform/backend/backend/data/graph.py (Node, Link, GraphModel,
_validate_graph_structure) ve data/dynamic_fields.py (_#_ / _$_ ayraçları).

Bir graf JSON'u şöyle görünür:
    {"id": "g1", "name": "...", "nodes": [{"id": "n1", "block_id": "<uuid>", "input_default": {...}}],
     "links": [{"source_id": "n1", "source_name": "result", "sink_id": "n2", "sink_name": "a"}]}
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any

from asama1_blok import Block, BlockType, get_block, tipler_uyumlu

DICT_SPLIT = "_#_"  # "values_#_ad"  → values["ad"]
LIST_SPLIT = "_$_"  # "items_$_0"    → items[0]


def base_pin(ad: str) -> str:
    """Dinamik pin adının kök alanını döndürür: 'values_#_ad' → 'values'."""
    for ayrac in (DICT_SPLIT, LIST_SPLIT):
        if ayrac in ad:
            return ad.split(ayrac, 1)[0]
    return ad


class GraphValidationError(ValueError):
    def __init__(self, hatalar: list[str]):
        super().__init__("; ".join(hatalar))
        self.hatalar = hatalar


@dataclass
class Link:
    source_id: str
    source_name: str
    sink_id: str
    sink_name: str
    is_static: bool = False


@dataclass
class Node:
    id: str
    block_id: str
    input_default: dict[str, Any] = field(default_factory=dict)
    input_links: list[Link] = field(default_factory=list, repr=False)
    output_links: list[Link] = field(default_factory=list, repr=False)

    @property
    def block(self) -> Block | None:
        return get_block(self.block_id)


@dataclass
class Graph:
    id: str
    name: str
    nodes: list[Node]
    links: list[Link]
    version: int = 1

    def __post_init__(self) -> None:
        self._index = {n.id: n for n in self.nodes}
        for dugum in self.nodes:
            dugum.input_links = [b for b in self.links if b.sink_id == dugum.id]
            dugum.output_links = [b for b in self.links if b.source_id == dugum.id]

    # ---------------------------------------------------------------- JSON
    @classmethod
    def from_json(cls, veri: str | dict[str, Any]) -> "Graph":
        if isinstance(veri, str):
            veri = json.loads(veri)
        return cls(
            id=veri["id"],
            name=veri.get("name", ""),
            version=veri.get("version", 1),
            nodes=[Node(n["id"], n["block_id"], dict(n.get("input_default", {}))) for n in veri["nodes"]],
            links=[Link(**b) for b in veri.get("links", [])],
        )

    def to_json(self) -> str:
        return json.dumps(
            {
                "id": self.id,
                "name": self.name,
                "version": self.version,
                "nodes": [{"id": n.id, "block_id": n.block_id, "input_default": n.input_default} for n in self.nodes],
                "links": [asdict(b) for b in self.links],
            },
            ensure_ascii=False,
            indent=2,
        )

    # ---------------------------------------------------------------- sorgular
    def node(self, node_id: str) -> Node:
        return self._index[node_id]

    def has_node(self, node_id: str) -> bool:
        return node_id in self._index

    def input_nodes(self) -> list[Node]:
        return [n for n in self.nodes if (b := n.block) and b.block_type == BlockType.INPUT]

    def starting_nodes(self) -> list[Node]:
        """Hiç gelen bağlantısı olmayan düğümler + giriş blokları (gerçek: GraphModel.starting_nodes)."""
        return [n for n in self.nodes if not n.input_links or n in self.input_nodes()]


def topological_order(graf: Graph) -> list[str]:
    """Kahn algoritması. Döngü varsa ValueError. Yürütücü bunu KULLANMAZ (veri akışıyla çalışır);
    doğrulamada ve görselleştirmede işe yarar."""
    giren = {n.id: 0 for n in graf.nodes}
    for b in graf.links:
        if b.sink_id in giren:
            giren[b.sink_id] += 1
    kuyruk = deque(sorted(nid for nid, d in giren.items() if d == 0))
    sira: list[str] = []
    while kuyruk:
        nid = kuyruk.popleft()
        sira.append(nid)
        for b in graf.node(nid).output_links:
            if b.sink_id not in giren:
                continue  # var olmayan düğüme giden bağlantıyı doğrulama ayrıca raporlar
            giren[b.sink_id] -= 1
            if giren[b.sink_id] == 0:
                kuyruk.append(b.sink_id)
    # len(graf.nodes) değil: yinelenen id'ler `giren` sözlüğünde teke iner; onlar döngü değildir
    # (yinelenen id'yi validate_graph ayrıca raporlar).
    if len(sira) != len(giren):
        kalan = sorted(set(giren) - set(sira))
        raise ValueError(f"grafta döngü var: {', '.join(kalan)}")
    return sira


def validate_graph(graf: Graph, *, for_run: bool = False, inputs: dict[str, Any] | None = None) -> None:
    """Tüm hataları toplayıp tek seferde GraphValidationError olarak fırlatır."""
    hatalar: list[str] = []
    gorulen: set[str] = set()
    for dugum in graf.nodes:
        if dugum.id in gorulen:
            hatalar.append(f"yinelenen düğüm id: {dugum.id}")
        gorulen.add(dugum.id)
        if dugum.block is None:
            hatalar.append(f"{dugum.id}: bilinmeyen blok {dugum.block_id}")

    for b in graf.links:
        onek = f"bağlantı {b.source_id}.{b.source_name} → {b.sink_id}.{b.sink_name}"
        if not (graf.has_node(b.source_id) and graf.has_node(b.sink_id)):
            hatalar.append(f"{onek}: düğüm yok")
            continue
        kaynak_blok, hedef_blok = graf.node(b.source_id).block, graf.node(b.sink_id).block
        if kaynak_blok is None or hedef_blok is None:
            continue
        cikis = kaynak_blok.output_schema.fields().get(base_pin(b.source_name))
        giris = hedef_blok.input_schema.fields().get(base_pin(b.sink_name))
        if cikis is None:
            hatalar.append(f"{onek}: '{b.source_name}' {kaynak_blok.name} çıkışlarında yok")
        if giris is None:
            hatalar.append(f"{onek}: '{b.sink_name}' {hedef_blok.name} girişlerinde yok")
        dinamik = b.source_name != base_pin(b.source_name) or b.sink_name != base_pin(b.sink_name)
        if cikis and giris and not dinamik and not tipler_uyumlu(cikis.type, giris.type):
            hatalar.append(f"{onek}: tip uyumsuz ({cikis.type.__name__} → {giris.type.__name__})")
        if kaynak_blok.static_output:
            b.is_static = True  # sabit bloktan çıkan her bağlantı statiktir

    for dugum in graf.nodes:
        blok = dugum.block
        if blok is None:
            continue
        bagli = {base_pin(b.sink_name) for b in dugum.input_links}
        for alan in sorted(blok.input_schema.required_fields()):
            if alan in dugum.input_default or alan in bagli:
                continue
            if blok.input_schema.fields()[alan].credentials_provider and not for_run:
                continue  # kimlik bilgisi kayıt anında boş olabilir, çalıştırmada zorunlu
            hatalar.append(f"{dugum.id}: zorunlu '{alan}' girişi ne varsayılanda ne bağlantıda")
        if for_run and blok.block_type == BlockType.INPUT:
            ad = dugum.input_default.get("name")
            if dugum.input_default.get("value") is None and ad not in (inputs or {}):
                hatalar.append(f"{dugum.id}: '{ad}' girişi için değer verilmedi")

    try:
        topological_order(graf)
    except ValueError as e:
        hatalar.append(str(e))  # mini sürüm döngüye izin vermez (gerçek sistem bunu denetlemez)
    if hatalar:
        raise GraphValidationError(hatalar)
