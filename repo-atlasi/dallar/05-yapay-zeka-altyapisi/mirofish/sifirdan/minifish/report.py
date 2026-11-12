"""Aşama 4 — Metrikler, rapor ajanı ve "tek koşu tahmin değildir" topluluk (ensemble) analizi.

MiroFish karşılıkları:
  - report_agent.py: ReportAgent önce bir taslak (outline) planlar, sonra her bölüm için ReACT döngüsünde
    araç çağırır (InsightForge, PanoramaSearch, QuickSearch, InterviewAgents; zep_tools.py) ve
    "Final Answer:" ile bölüm metnini yazar. Araç çağrıları <tool_call>{...}</tool_call> biçimindedir.
  - simulation_runner.py: get_timeline, get_agent_stats (tur ve ajan istatistikleri).
"""

from __future__ import annotations

import json
import statistics

from .llm import parse_tool_calls


def metrics(result, top=3):
    """Simülasyon kaydından özet ölçüler."""
    received = {a.agent_id: 0 for a in result.agents}
    for p in result.posts:
        received[p.author_id] += p.likes + 2 * p.reposts + p.comments
    by_type = {}
    for e in result.log:
        by_type[e["action"]] = by_type.get(e["action"], 0) + 1
    first, last = result.rounds[0], result.rounds[-1]
    influencers = sorted(result.agents, key=lambda a: (-received[a.agent_id], a.agent_id))[:top]
    named = [a for a in result.agents if a.named]
    return {
        "tur_sayisi": len(result.rounds),
        "eylem_sayisi": by_type,
        "baslangic": {k: first[k] for k in ("mean_stance", "support", "oppose", "polarization")},
        "son": {k: last[k] for k in ("mean_stance", "support", "oppose", "polarization")},
        "en_etkili": [{"ajan_id": a.agent_id, "ad": a.name, "etkilesim": received[a.agent_id]} for a in influencers],
        "en_buyuk_yayilim": max((p.reposts for p in result.posts), default=0),
        "fikir_degistiren_adli_aktorler": [a.name for a in named if (a.initial_stance > 0.2) != (a.stance > 0.2)],
    }


def interview(result, agent_id, question="Plan hakkında ne düşünüyorsunuz?"):
    """Ajanla "röportaj": persona + tutum + bellekten cevap. (MiroFish'te OASIS ortamına INTERVIEW eylemi
    gönderilir ve ajanın LLM'i persona ve geçmişiyle cevap verir.)"""
    a = next(x for x in result.agents if x.agent_id == agent_id)
    view = "destekliyorum" if a.stance > 0.2 else "karşıyım" if a.stance < -0.2 else "kararsızım"
    seen = a.memory[-1] if a.memory else "henüz bir şey görmedim"
    return f"{a.name}: '{question}' sorusuna cevap: Plana {view} (tutum {a.stance:+.2f}). Son gördüğüm: {seen}"


def search(result, query, limit=5):
    """Grafik belleğinde basit anahtar sözcük araması (MiroFish: QuickSearch/Zep graph.search)."""
    words = query.lower().split()
    hits = [ep for ep in result.episodes if all(w in ep.lower() for w in words)]
    return hits[:limit]


REPORT_SYSTEM = (
    "[GÖREV:rapor] Simülasyon sonuçlarını yorumlayan bir analistsin. Araçlar: istatistik(), "
    "roportaj(ajan_id), ara(sorgu). Araç çağırmak için <tool_call>{\"name\": ..., \"parameters\": {...}}</tool_call> "
    "yaz. Bitirince 'Final Answer:' ile başlayan metni döndür."
)


def react_section(llm, result, task, max_tool_calls=3):
    """Tek bölüm için ReACT döngüsü: düşün -> araç çağır -> gözlem -> ... -> Final Answer."""
    tools = {
        "istatistik": lambda: json.dumps(metrics(result), ensure_ascii=False),
        "roportaj": lambda ajan_id: interview(result, int(ajan_id)),
        "ara": lambda sorgu: json.dumps(search(result, sorgu), ensure_ascii=False),
    }
    messages = [{"role": "system", "content": REPORT_SYSTEM}, {"role": "user", "content": task}]
    trace = []
    for _ in range(max_tool_calls + 1):
        reply = llm.complete(messages)
        calls = parse_tool_calls(reply)
        if not calls:
            answer = reply.split("Final Answer:", 1)[-1].strip()
            return answer, trace
        call = calls[0]  # MiroFish de tur başına bir aracı işler
        if call["name"] not in tools:
            observation = f"bilinmeyen araç {call['name']}"
        else:
            try:
                observation = tools[call["name"]](**call["parameters"])
            except (TypeError, ValueError, StopIteration) as e:
                observation = f"araç hatası: {e}"
        trace.append({"arac": call["name"], "parametreler": call["parameters"]})
        messages += [{"role": "assistant", "content": reply}, {"role": "user", "content": "Gözlem: " + observation}]
    return "Araç çağrı sınırına ulaşıldı.", trace


def ensemble(make_simulation, seeds, rounds):
    """Aynı senaryoyu farklı tohumlarla koşturur; sonuçların yayılımı belirsizliğin kabaca ölçüsüdür."""
    finals = [make_simulation(seed).run(rounds).rounds[-1] for seed in seeds]

    def spread(key):
        values = [f[key] for f in finals]
        return {"ortalama": round(statistics.fmean(values), 4), "std": round(statistics.pstdev(values), 4),
                "min": min(values), "max": max(values)}

    return {"kosu": len(finals), "mean_stance": spread("mean_stance"), "support": spread("support"),
            "polarization": spread("polarization")}


LIMITATIONS = """## Sınırlılıklar (bu bir kehanet değildir)

- Bu çıktı, **verilen tohum metin ve varsayımlar altında** olası bir gidişatın simülasyonudur;
  gerçek dünyaya kalibre edilmemiş, geçmiş verilerle doğrulanmamıştır.
- Ajan davranışları kural tabanlıdır (ya da bir LLM'in tahminidir); gerçek insanların temsilî bir örneği değildir.
- Sonuç tohuma (rastgelelik) ve parametrelere (açıklık, güven eşiği, akış ağırlıkları) duyarlıdır:
  tek koşu yerine topluluk sonuçlarına ve yayılımına bakın.
- Tohum metinde geçmeyen aktörler ve dış olaylar modelde yoktur.
"""


def write_report(result, llm=None, ensemble_summary=None, title="Simülasyon raporu"):
    """Markdown rapor. llm verilirse "Aktör görüşleri" bölümü ReACT döngüsüyle yazılır."""
    m = metrics(result)
    lines = [f"# {title}", "", "## Özet", ""]
    b, s = m["baslangic"], m["son"]
    lines.append(f"- Ortalama tutum: {b['mean_stance']:+.2f} → {s['mean_stance']:+.2f} ({m['tur_sayisi']} tur)")
    lines.append(f"- Destek / karşı payı: %{100 * s['support']:.0f} / %{100 * s['oppose']:.0f}")
    lines.append(f"- Kutuplaşma (tutumların standart sapması): {b['polarization']:.2f} → {s['polarization']:.2f}")
    lines += ["", "## Etkili aktörler", ""]
    lines += [f"- {x['ad']}: {x['etkilesim']} etkileşim" for x in m["en_etkili"]]
    lines += ["", "## Etkinlik", "", f"- Eylem dağılımı: {m['eylem_sayisi']}", f"- En büyük yayılım: {m['en_buyuk_yayilim']} paylaşım"]
    if m["fikir_degistiren_adli_aktorler"]:
        lines.append(f"- Fikir değiştiren adlı aktörler: {', '.join(m['fikir_degistiren_adli_aktorler'])}")
    if llm is not None:
        answer, trace = react_section(llm, result, "En etkili aktörün görüşünü özetle.")
        lines += ["", "## Aktör görüşleri", "", answer, "", f"_Araç izi: {trace}_"]
    if ensemble_summary:
        e = ensemble_summary
        lines += ["", "## Belirsizlik (topluluk)", "",
                  f"- {e['kosu']} koşu: son ortalama tutum {e['mean_stance']['ortalama']:+.2f} ± {e['mean_stance']['std']:.2f} "
                  f"(aralık {e['mean_stance']['min']:+.2f} … {e['mean_stance']['max']:+.2f})"]
    lines += ["", LIMITATIONS]
    return "\n".join(lines)
