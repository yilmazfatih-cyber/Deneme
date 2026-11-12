"""Aşama 2 — Varlıklardan ajan (persona) üretimi ve sosyal grafik.

MiroFish karşılıkları:
  - oasis_profile_generator.py: her varlık için LLM ile ayrıntılı persona (bio, yaş, MBTI, ilgi alanları);
    LLM başarısız olursa _generate_profile_rule_based ile kural tabanlı yedek. Çıktı OASIS'in Twitter
    (CSV) ve Reddit (JSON) profil biçimlerine yazılır.
  - simulation_config_generator.py: ajan başına etkinlik düzeyi, aktif saatler, tutum (stance),
    etki ağırlığı (influence_weight) gibi simülasyon parametreleri (AgentActivityConfig).
"""

from __future__ import annotations

import dataclasses
import json
import random

from .llm import parse_json, stable_hash

TYPE_DEFAULTS = {  # tip -> (etkinlik, etki, açıklık, aktif saatler)
    "MediaOutlet": (0.9, 3.0, 0.05, range(7, 24)),
    "GovernmentAgency": (0.5, 2.5, 0.05, range(9, 19)),
    "University": (0.3, 1.5, 0.2, range(9, 18)),
    "NGO": (0.6, 1.5, 0.15, range(8, 23)),
    "Company": (0.4, 1.5, 0.1, range(9, 19)),
    "Person": (0.5, 1.0, 0.3, range(8, 24)),
}


@dataclasses.dataclass
class Agent:
    agent_id: int
    name: str
    type: str
    stance: float  # -1 karşı ... +1 destek
    activity_level: float  # bir saatte etkin olma olasılığı (saat çarpanından önce)
    influence: float  # gönderilerinin akışta öne çıkma ağırlığı
    openness: float  # gördüğü görüşlere göre fikrini ne kadar değiştirir (0 = hiç)
    active_hours: tuple
    bio: str = ""
    role: str = ""
    named: bool = True  # tohum metinden gelen adlı aktör mü, anonim sakin mi
    following: set = dataclasses.field(default_factory=set)
    memory: list = dataclasses.field(default_factory=list)  # son gözlemler (sınırlı)
    initial_stance: float = 0.0


def rule_based(entity, agent_id):
    act, infl, openness, hours = TYPE_DEFAULTS.get(entity.type, TYPE_DEFAULTS["Person"])
    return Agent(agent_id, entity.name, entity.type, entity.stance, act, infl, openness, tuple(hours),
                 bio=f"{entity.role or entity.type}: {entity.name}", role=entity.role)


PERSONA_SYSTEM = (
    "[GÖREV:persona] Sen bir sosyal simülasyon için persona tasarlıyorsun. Verilen varlık için yalnızca "
    'JSON döndür: {"bio": str, "activity_level": 0-1, "openness": 0-1}.'
)


def from_llm(entity, agent_id, llm):
    """LLM ile persona; JSON bozuksa veya alanlar geçersizse kural tabanlı yedeğe düşer."""
    agent = rule_based(entity, agent_id)
    if llm is None:
        return agent
    user = json.dumps({"name": entity.name, "type": entity.type, "role": entity.role}, ensure_ascii=False)
    try:
        data = parse_json(llm.complete([{"role": "system", "content": PERSONA_SYSTEM}, {"role": "user", "content": user}]))
        activity, openness = float(data["activity_level"]), float(data["openness"])
        if not (0 <= activity <= 1 and 0 <= openness <= 1):
            raise ValueError("aralık dışı değer")
        agent.bio, agent.activity_level, agent.openness = str(data.get("bio", agent.bio)), activity, openness
    except (ValueError, KeyError, TypeError):
        pass  # MiroFish de LLM hatasında kural tabanlı profile döner
    return agent


def build_agents(entities, llm=None, n_citizens=30, seed=0):
    """Adlı aktörler + (isteğe bağlı) anonim sakinler.

    Not: MiroFish'te ajanlar yalnızca grafikteki varlıklardır. Kalabalık dinamiğini göstermek için
    mini sürüm, tutumları tohumdaki dağılımdan türeyen anonim sakinler ekleyebilir.
    """
    rng = random.Random(seed)
    agents = [from_llm(e, i, llm) for i, e in enumerate(entities.values())]
    for a in agents:
        a.initial_stance = a.stance
    base = sum(a.stance for a in agents) / max(len(agents), 1)
    for k in range(n_citizens):
        stance = max(-1.0, min(1.0, rng.gauss(base * 0.3, 0.45)))
        agents.append(Agent(len(agents), f"sakin_{k + 1}", "Person", stance, rng.uniform(0.2, 0.6), 0.5,
                            rng.uniform(0.2, 0.5), tuple(range(rng.choice([7, 8, 9]), 24)), named=False,
                            initial_stance=stance))
    return agents


def build_follow_graph(agents, relations, seed=0, k_random=4):
    """Kim kimi izliyor: herkes medya hesaplarını izler, ilişkili varlıklar birbirini izler,
    ayrıca benzer tutumlu hesapları izleme olasılığı daha yüksektir (homofili)."""
    rng = random.Random(seed)
    by_name = {a.name: a for a in agents}
    for a in agents:
        for b in agents:
            if b is not a and b.type == "MediaOutlet":
                a.following.add(b.agent_id)
    for r in relations:
        if r.source in by_name and r.target in by_name:
            by_name[r.source].following.add(by_name[r.target].agent_id)
            by_name[r.target].following.add(by_name[r.source].agent_id)
    for a in agents:
        others = [b for b in agents if b is not a]
        weights = [1.0 + 2.0 * (1 - abs(a.stance - b.stance) / 2) + b.influence for b in others]
        for b in rng.choices(others, weights=weights, k=k_random):
            a.following.add(b.agent_id)
    return {a.agent_id: sorted(a.following) for a in agents}


def describe(agent):
    """Hash'e dayalı kısa bir kimlik notu (tekrarlanabilir)."""
    tone = ["temkinli", "hevesli", "sakin", "öfkeli", "meraklı"][stable_hash(agent.name) % 5]
    return f"{agent.name} ({agent.role or agent.type}, {tone})"
