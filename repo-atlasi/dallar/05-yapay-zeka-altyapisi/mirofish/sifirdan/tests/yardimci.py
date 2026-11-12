"""Testlerde ortak kurulum: tohum metinden simülasyon üret."""

import os

import minifish as mf

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(KOK, "veri", "tohum.txt"), encoding="utf-8") as f:
    TOHUM = f.read()
VARLIKLAR, ILISKILER = mf.extract(TOHUM)


def kur(seed=0, events=(), llm=None, policy=None, n_citizens=30):
    agents = mf.build_agents(VARLIKLAR, llm=llm, n_citizens=n_citizens, seed=seed)
    mf.build_follow_graph(agents, ILISKILER, seed=seed)
    return mf.Simulation(agents, seed=seed, events=events, policy=policy)


class BozukLLM:
    """Her zaman geçersiz yanıt veren LLM: yedek yolların sınanması için."""

    def complete(self, messages):
        return "Elbette! İşte cevabım: {bozuk json"
