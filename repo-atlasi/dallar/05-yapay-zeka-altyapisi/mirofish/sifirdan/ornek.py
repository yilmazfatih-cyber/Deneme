"""Uçtan uca örnek: tohum -> ajanlar -> 72 saatlik simülasyon -> "ya şöyle olursa?" karşılaştırması -> rapor.

Çalıştır: python3 ornek.py   (internet ve gerçek LLM gerekmez)
"""

import os

import minifish as mf

KOK = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(KOK, "veri", "tohum.txt"), encoding="utf-8") as f:
    tohum = f.read()

varliklar, iliskiler = mf.extract(tohum)
print("Ontoloji:", mf.build_ontology(varliklar, iliskiler))
for v in varliklar.values():
    print(f"  {v.name:24s} {v.type:17s} tutum={v.stance:+.1f} {v.role}")

OLAY = [mf.Event(30, "Kıyı Postası", "Belediye esnafa ücretsiz ring servisi ve otopark sözü verdi.", 0.7)]


def senaryo(seed, olaylar=()):
    llm = mf.KuralliLLM()  # gerçek sistemde OpenAI uyumlu bir API (MiroFish: LLM_BASE_URL)
    ajanlar = mf.build_agents(varliklar, llm=llm, n_citizens=40, seed=seed)
    mf.build_follow_graph(ajanlar, iliskiler, seed=seed)
    return mf.Simulation(ajanlar, seed=seed, events=olaylar)


sonuc = senaryo(0, OLAY).run(72)
print("\nTur özeti (her 12 saatte bir):")
for r in sonuc.rounds[::12]:
    print(f"  tur {r['round']:2d} saat {r['hour']:02d}  etkin={r['active']:2d}  ort.tutum={r['mean_stance']:+.3f}  "
          f"destek=%{100 * r['support']:.0f} karşı=%{100 * r['oppose']:.0f}")

tohumlar = range(12)
temel = mf.ensemble(lambda s: senaryo(s), tohumlar, 72)
olayli = mf.ensemble(lambda s: senaryo(s, OLAY), tohumlar, 72)
print("\nYa şöyle olursa? (12 koşu, son ortalama tutum)")
print(f"  olaysız : {temel['mean_stance']['ortalama']:+.3f} ± {temel['mean_stance']['std']:.3f}")
print(f"  olaylı  : {olayli['mean_stance']['ortalama']:+.3f} ± {olayli['mean_stance']['std']:.3f}")
print("\n" + mf.write_report(sonuc, llm=mf.KuralliLLM(), ensemble_summary=olayli, title="Yalıkent sahil yolu: senaryo raporu"))
