"""minifish — MiroFish'in hattını (tohum -> ajanlar -> simülasyon -> rapor) öğretmek için küçük yeniden yazım.

Aşama 1: seed.py        tohum metinden varlık/ilişki/tutum çıkarımı + ontoloji
Aşama 2: persona.py     varlıktan ajana (LLM'li veya kural tabanlı) + izleme grafiği
Aşama 3: simulation.py  saat saat tur döngüsü, akış sıralaması, bellek, tutum güncelleme, eylemler
Aşama 4: report.py      metrikler, ReACT rapor ajanı, topluluk (ensemble) belirsizliği
llm.py                  LLM arayüzü + deterministik sahte LLM
"""

from .llm import KuralliLLM, parse_json, parse_tool_calls
from .persona import build_agents, build_follow_graph
from .report import ensemble, metrics, write_report
from .seed import build_ontology, extract
from .simulation import Event, LLMPolicy, RulePolicy, Simulation

__all__ = [
    "Event",
    "KuralliLLM",
    "LLMPolicy",
    "RulePolicy",
    "Simulation",
    "build_agents",
    "build_follow_graph",
    "build_ontology",
    "ensemble",
    "extract",
    "metrics",
    "parse_json",
    "parse_tool_calls",
    "write_report",
]
