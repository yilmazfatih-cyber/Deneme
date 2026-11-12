"""Aşama 3 — Çok turlu sosyal medya simülasyonu.

Her tur = 1 simüle saat. Turda:
  1. Etkin ajanlar seçilir: etkinlik düzeyi x saat çarpanı (gece neredeyse kimse yok, akşam yoğun).
  2. Her etkin ajan bir akış (feed) görür: tazelik + popülerlik + izleme ilişkisi + yazarın etkisi.
  3. Gördüklerini belleğine yazar; tutumu "sınırlı güven" (bounded confidence) kuralıyla yakın
     görüşlere doğru biraz kayar.
  4. Bir eylem seçer: CREATE_POST, LIKE_POST, REPOST, CREATE_COMMENT, DO_NOTHING (politikaya göre).

MiroFish karşılıkları: backend/scripts/run_parallel_simulation.py (get_active_agents_for_round, tur
döngüsü), eylemleri seçen OASIS (camel-oasis; her ajan LLMAction ile LLM'e karar verdirir),
simulation_config_generator.py (saat çarpanları, PlatformConfig ağırlıkları), action_logger.py
(actions.jsonl) ve zep_graph_memory_updater.py (eylemleri Zep grafiğine "bölüm" olarak yazar).
"""

from __future__ import annotations

import dataclasses
import json
import math
import random
import statistics

from .llm import parse_json

ACTIONS = ("CREATE_POST", "LIKE_POST", "REPOST", "CREATE_COMMENT", "DO_NOTHING")


def hour_multiplier(hour):
    """MiroFish'in varsayılan günlük ritmi (simulation_config_generator.py, CHINA_TIMEZONE_CONFIG)."""
    if hour <= 5:
        return 0.05
    if hour <= 8:
        return 0.4
    if hour <= 18:
        return 0.7
    if hour <= 22:
        return 1.5
    return 0.5


TEXTS = {
    1: ["Sahil yolu yayalara açılınca kent nefes alacak.", "Bisikletle sahile inmek artık güvenli olacak.",
        "Hafta sonu sahil herkesin olmalı, arabaların değil."],
    -1: ["Müşteri araçla geliyor, bu karar esnafı batırır.", "Otopark sorunu çözülmeden yol kapatılmamalı.",
         "Kimse bize sormadan karar verildi, kabul etmiyoruz."],
    0: ["Plan hakkında daha fazla bilgi bekliyoruz.", "İki tarafın da haklı olduğu noktalar var.",
        "Belediye uygulamayı önce deneme olarak yapabilir."],
}


@dataclasses.dataclass
class Post:
    id: int
    round: int
    author_id: int
    text: str
    stance: float
    parent_id: int | None = None
    likes: int = 0
    reposts: int = 0
    comments: int = 0
    boost: float = 0.0  # olay enjeksiyonu: akışta öne çıkarma


@dataclasses.dataclass
class Event:
    """Belirli turda belirli bir ajan adına yayınlanan gönderi ("tanrı bakışı" değişkeni)."""

    round: int
    author: str
    text: str
    stance: float
    boost: float = 3.0


class RulePolicy:
    """Olasılıklı karar: güçlü görüşlü olan daha çok yazar; hemfikirse beğenir/paylaşır, değilse tartışır."""

    def decide(self, agent, feed, rng):
        if not feed or rng.random() < 0.1 + 0.3 * abs(agent.stance):
            return "CREATE_POST", None
        top = feed[0]
        agree = 1 - abs(top.stance - agent.stance) / 2  # 0 (zıt) .. 1 (aynı)
        p_like, p_repost, p_comment = 0.6 * agree**2, 0.25 * agree**3, 0.5 * (1 - agree)
        r = rng.random()
        if r < p_like:
            return "LIKE_POST", top
        if r < p_like + p_repost:
            return "REPOST", top
        if r < p_like + p_repost + p_comment:
            return "CREATE_COMMENT", top
        return "DO_NOTHING", None


class LLMPolicy:
    """Kararı LLM'e verdiren politika (OASIS'teki LLMAction'ın küçük karşılığı).
    Yanıt ayrıştırılamazsa ya da geçersizse kural tabanlı politikaya düşer."""

    SYSTEM = ('[GÖREV:eylem] Bir sosyal medya kullanıcısını canlandırıyorsun. Yalnızca JSON döndür: '
              '{"eylem": "CREATE_POST|LIKE_POST|REPOST|CREATE_COMMENT|DO_NOTHING", "gonderi": id}')

    def __init__(self, llm, fallback=None):
        self.llm, self.fallback = llm, fallback or RulePolicy()
        self.fallbacks = 0

    def decide(self, agent, feed, rng):
        ctx = {"ad": agent.name, "tutum": round(agent.stance, 2), "bellek": agent.memory[-5:],
               "akis": [{"id": p.id, "tutum": round(p.stance, 2), "metin": p.text} for p in feed]}
        msgs = [{"role": "system", "content": self.SYSTEM}, {"role": "user", "content": json.dumps(ctx, ensure_ascii=False)}]
        try:
            data = parse_json(self.llm.complete(msgs))
            action = data["eylem"]
            if action not in ACTIONS:
                raise ValueError(action)
            target = next((p for p in feed if p.id == data.get("gonderi")), None)
            if action in ("LIKE_POST", "REPOST", "CREATE_COMMENT") and target is None:
                raise ValueError("hedef gönderi yok")
            return action, target
        except (ValueError, KeyError, TypeError):
            self.fallbacks += 1
            return self.fallback.decide(agent, feed, rng)


@dataclasses.dataclass
class SimulationResult:
    agents: list
    posts: list
    log: list  # her eylem bir sözlük (MiroFish: actions.jsonl satırları)
    rounds: list  # tur özetleri
    episodes: list  # grafik belleğine yazılan metinler (MiroFish: Zep'e giden bölümler)


def summarize_stances(stances):
    n = len(stances)
    return {
        "mean_stance": round(statistics.fmean(stances), 4),
        "support": round(sum(s > 0.2 for s in stances) / n, 4),
        "oppose": round(sum(s < -0.2 for s in stances) / n, 4),
        "polarization": round(statistics.pstdev(stances), 4),
    }


class Simulation:
    def __init__(self, agents, seed=0, events=(), policy=None, feed_size=5, memory_size=8, start_hour=8,
                 mu=0.25, confidence=0.8, weights=(0.4, 0.3, 0.3)):
        self.agents = agents
        self.by_id = {a.agent_id: a for a in agents}
        self.by_name = {a.name: a for a in agents}
        self.rng = random.Random(seed)
        self.events = sorted(events, key=lambda e: e.round)
        self.policy = policy or RulePolicy()
        self.feed_size, self.memory_size, self.start_hour = feed_size, memory_size, start_hour
        self.mu, self.confidence = mu, confidence
        self.w_recency, self.w_popularity, self.w_relevance = weights
        self.posts: list[Post] = []
        self.log: list[dict] = []
        self.rounds: list[dict] = []
        self.episodes: list[str] = []

    def _post(self, rnd, author, text, stance, parent=None, boost=0.0):
        p = Post(len(self.posts), rnd, author.agent_id, text, stance, parent.id if parent else None, boost=boost)
        self.posts.append(p)
        return p

    def _record(self, rnd, hour, agent, action, post=None, target=None):
        self.log.append({"round": rnd, "hour": hour, "agent_id": agent.agent_id, "agent_name": agent.name,
                         "action": action, "post_id": post.id if post else None,
                         "target_id": target.id if target else None, "stance": round(agent.stance, 3)})
        if action != "DO_NOTHING":
            what = (post or target).text if (post or target) else ""
            self.episodes.append(f"[tur {rnd}, saat {hour:02d}] {agent.name} {action}: {what}")

    def feed(self, agent, rnd):
        """Akış sıralaması (MiroFish PlatformConfig: recency/popularity/relevance ağırlıkları)."""
        scored = []
        for p in self.posts:
            if p.author_id == agent.agent_id or rnd - p.round > 6:
                continue
            recency = 1.0 / (1 + rnd - p.round)
            popularity = math.log1p(p.likes + 2 * p.reposts + p.comments) / 3
            relevance = 1.0 if p.author_id in agent.following else 0.2
            influence = self.by_id[p.author_id].influence / 3
            score = (self.w_recency * recency + self.w_popularity * popularity + self.w_relevance * relevance
                     + 0.2 * influence + p.boost / (1 + rnd - p.round))
            scored.append((score, -p.id, p))
        scored.sort(reverse=True)
        return [p for _, _, p in scored[: self.feed_size]]

    def _update_opinion(self, agent, feed):
        """Sınırlı güven: yalnızca yeterince yakın görüşler etkiler (Deffuant-Weisbuch tipi)."""
        for p in feed:
            diff = p.stance - agent.stance
            if abs(diff) < self.confidence:
                weight = self.by_id[p.author_id].influence / 3
                agent.stance = max(-1.0, min(1.0, agent.stance + agent.openness * self.mu * weight * diff))

    def step(self, rnd):
        hour = (self.start_hour + rnd) % 24
        for ev in self.events:
            if ev.round == rnd and ev.author in self.by_name:
                author = self.by_name[ev.author]
                self._record(rnd, hour, author, "CREATE_POST", self._post(rnd, author, ev.text, ev.stance, boost=ev.boost))
        mult = hour_multiplier(hour)
        active = [a for a in self.agents if hour in a.active_hours and self.rng.random() < min(1.0, a.activity_level * mult)]
        self.rng.shuffle(active)
        for agent in active:
            feed = self.feed(agent, rnd)
            agent.memory = (agent.memory + [f"tur {rnd}: {p.text}" for p in feed])[-self.memory_size :]
            self._update_opinion(agent, feed)
            action, target = self.policy.decide(agent, feed, self.rng)
            post = None
            if action == "CREATE_POST":
                sign = 1 if agent.stance > 0.2 else -1 if agent.stance < -0.2 else 0
                post = self._post(rnd, agent, self.rng.choice(TEXTS[sign]), agent.stance)
            elif action == "CREATE_COMMENT":
                sign = 1 if agent.stance > 0.2 else -1 if agent.stance < -0.2 else 0
                author = self.by_id[target.author_id].name
                post = self._post(rnd, agent, f"@{author} {self.rng.choice(TEXTS[sign])}", agent.stance, parent=target)
                target.comments += 1
            elif action == "LIKE_POST":
                target.likes += 1
            elif action == "REPOST":
                target.reposts += 1
            self._record(rnd, hour, agent, action, post, target)
        summary = {"round": rnd, "hour": hour, "active": len(active),
                   "actions": sum(1 for e in self.log if e["round"] == rnd and e["action"] != "DO_NOTHING")}
        summary.update(summarize_stances([a.stance for a in self.agents]))
        self.rounds.append(summary)

    def run(self, rounds):
        for rnd in range(rounds):
            self.step(rnd)
        return SimulationResult(self.agents, self.posts, self.log, self.rounds, self.episodes)
