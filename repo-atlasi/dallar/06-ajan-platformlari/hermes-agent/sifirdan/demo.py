"""Uçtan uca gösterim: ajan bir işi yapar → beceri yazar → sonraki oturumda beceriyi bulup kullanır;
ardından mesajlaşma geçidi (DM eşleştirme) ve zamanlanmış iş. Model sahte ve senaryoludur, ağ yoktur.

Çalıştır:  python3 demo.py            (geçici bir HERMES_HOME klasörü kullanır)
"""

from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path

from asama1_hafiza import SessionDB
from asama3_beceriler import SkillStore  # noqa: F401  (içe aktarma beceri araçlarını kaydeder)
from asama4_dongu import AIAgent, LLMResponse, ScriptedLLM, arac
from asama5_gecit import GatewayRunner, InMemoryAdapter
from asama6_zamanlayici import CronScheduler, JobStore

BECERI = """---
name: kdv-hesaplama
description: Bir tutarın KDV'sini ve KDV dahil toplamını hesaplama yöntemi
---
1. KDV = tutar × oran (oran yüzde ise 100'e böl).
2. KDV dahil toplam = tutar + KDV.
3. Sonucu 'KDV: X TL, toplam: Y TL' biçiminde ver.
"""


def baslik(metin: str) -> None:
    print(f"\n=== {metin} ===")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="hermes-mini-") as gecici:  # iş bitince silinir
        calistir(Path(gecici))


def calistir(home: Path) -> None:
    db = SessionDB(home / "state.db")
    print(f"HERMES_HOME (geçici): {home}  |  FTS5: {db.use_fts}")

    baslik("Oturum 1: iş yapılır, tur sonunda gözden geçirme beceri yazar")
    model = ScriptedLLM(
        [
            arac("c1", "hesapla", ifade="1000*0.20"),
            arac("c2", "hesapla", ifade="1000+200"),
            LLMResponse("KDV: 200 TL, toplam: 1200 TL."),
        ]
    )
    gozden_geciren = ScriptedLLM(
        [
            arac("r1", "skill_manage", action="create", name="kdv-hesaplama", content=BECERI, category="finans"),
            arac("r2", "memory", action="add", target="user", content="Fiyatları TL ve KDV dahil görmek istiyor."),
            LLMResponse("Beceri ve kullanıcı notu kaydedildi."),
        ]
    )
    ajan1 = AIAgent(model, home, db, skill_nudge_interval=3, memory_nudge_interval=1, review_llm=gozden_geciren)
    sonuc = ajan1.run_conversation("1000 TL'lik faturanın %20 KDV'si ve KDV dahil toplamı ne?")
    print(
        f"Cevap: {sonuc['final_response']}  (model çağrısı: {sonuc['api_calls']}, gözden geçirme: {sonuc['reviewed']})"
    )
    print("Diskteki beceriler:", [s["name"] for s in SkillStore(home / "skills").list()])

    baslik("Oturum 2: yeni sistem istemi beceri dizinini içerir; model önce beceriyi okur")
    model2 = ScriptedLLM(
        [
            arac("d1", "skill_view", name="kdv-hesaplama"),
            arac("d2", "hesapla", ifade="500*0.20"),
            LLMResponse("KDV: 100 TL, toplam: 600 TL."),
        ]
    )
    ajan2 = AIAgent(model2, home, db)
    print("Sistem isteminden bir kesit:\n  " + "\n  ".join(ajan2.system_prompt.splitlines()[-4:]))
    print("Cevap:", ajan2.chat("500 TL için aynısını yapar mısın?"))

    baslik("Oturum 3: geçmiş oturumlarda tam metin arama (FTS5)")
    model3 = ScriptedLLM([arac("e1", "session_search", query="KDV fatura"), LLMResponse("Geçen sefer KDV hesapladık.")])
    ajan3 = AIAgent(model3, home, db)
    ajan3.chat("Geçen sefer ne hesaplamıştık?")
    print("Aracın döndürdüğü:", model3.istekler[-1]["messages"][-1]["content"][:160], "…")

    baslik("Geçit: bilinmeyen Telegram kullanıcısı → eşleştirme kodu → onay → cevap")
    telegram = InMemoryAdapter("telegram")
    gecit = GatewayRunner(home, lambda anahtar, kaynak: AIAgent(ScriptedLLM([LLMResponse("Merhaba Ayşe!")]), home, db))
    gecit.add_adapter(telegram)
    telegram.simulate("555", "ayse-tg", "selam")
    kod = telegram.outbox[-1][1].split()[-1]
    print("Bot cevabı:", telegram.outbox[-1][1])
    print("Onaylanan:", gecit.pairing.approve("telegram", kod))
    telegram.simulate("555", "ayse-tg", "selam")
    print("Bot cevabı:", telegram.outbox[-1][1])

    baslik("Zamanlanmış iş: her gün, çıktısı Telegram'a")
    isler = JobStore(home)
    isler.create("Bugünkü döviz kurlarını özetle.", "every 1d", datetime(2026, 11, 9, 8, 0), deliver="telegram:555")
    zamanlayici = CronScheduler(
        isler,
        lambda is_: AIAgent(
            ScriptedLLM([LLMResponse("Kur özeti: (sahte veri)")]), home, db, platform="cron", skip_memory=True
        ),
        gecit.deliver,
    )
    print("08:30 tick:", zamanlayici.tick(datetime(2026, 11, 9, 8, 30)))
    print("Ertesi gün 08:00 tick:", [k["delivered"] for k in zamanlayici.tick(datetime(2026, 11, 10, 8, 0))])
    print("Telegram'a giden son mesaj:", telegram.outbox[-1])
    db.db.close()


if __name__ == "__main__":
    main()
