"""Komut satırı gösterimi: bir graf JSON'unu verilen girişlerle çalıştırır ve kayıtları basar.

Kullanım:
    python3 calistir.py                                   # ornek_graf.json, tutarlar=[120, 40, 300]
    python3 calistir.py ornek_graf.json '{"tutarlar": [5, 500]}'
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import asama4_kimlik  # noqa: F401  (içe aktarmak LLMCallBlock'u kayda sokar)
from asama1_blok import block_catalog
from asama2_graf import Graph, topological_order
from asama3_yurutucu import Executor


def main(argv: list[str]) -> int:
    yol = Path(argv[1]) if len(argv) > 1 else Path(__file__).with_name("ornek_graf.json")
    girisler = json.loads(argv[2]) if len(argv) > 2 else {"tutarlar": [120, 40, 300]}
    graf = Graph.from_json(yol.read_text(encoding="utf-8"))

    print(f"Kayıtlı blok sayısı: {len(block_catalog())}")
    print(f"Graf: {graf.name}  |  topolojik sıra: {' → '.join(topological_order(graf))}")
    yurutucu = Executor()  # varsayılan: bellek içi sqlite
    sonuc = yurutucu.run(graf, girisler)
    print(f"Durum: {sonuc.status.value}")
    for ad, degerler in sonuc.outputs.items():
        print(f"  çıkış {ad}: {degerler}")
    print("Düğüm yürütmeleri (sqlite'tan):")
    for kayit in yurutucu.store.node_executions(sonuc.graph_exec_id):
        print(f"  {kayit['node_id']:<12} {kayit['status']:<11} {kayit['error'] or ''}")
    return 0 if sonuc.status.value == "COMPLETED" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
