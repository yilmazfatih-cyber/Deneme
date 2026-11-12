"""CLAUDE.local.md: her oturumda modele giden, şirkete özel kısa bağlam (yerel/ayarlar.json + sözlükten üretilir)."""

from __future__ import annotations

import sys
from pathlib import Path

from . import ayarlar as A
from . import sozluk


def yol() -> Path:
    return A.yerel_dizin().parent / "CLAUDE.local.md"


def metin(ayar: A.Ayarlar) -> str:
    mp = ayar["mixpanel"]
    hj = ayar["hotjar"]
    satirlar = [
        "# Yerel bağlam",
        "",
        "Otomatik üretildi (`python3 kit/kurulum.py baglam`); elle değil yerel/ayarlar.json üzerinden değiştirin.",
        "",
    ]
    kaynak = "demo (sentetik veri, şirket verisi değil)" if ayar.demo else mp.get("kaynak", "api")
    satirlar.append(
        f"- Proje: {ayar.get('proje_adi') or '?'} · Mixpanel kaynağı: {kaynak} (bölge {mp.get('bolge', 'us')}) · "
        f"Hotjar: {hj.get('kaynak', 'csv')} · Saat: UTC{ayar.ofset:+g} · Python: `{Path(sys.executable).stem}`"
    )
    s = sozluk.yukle(ayar)
    if s and s.get("olaylar"):
        olaylar = sorted(s["olaylar"], key=lambda o: -(o.get("hacim") or 0))
        adlar = ", ".join(o["ad"] for o in olaylar[:15])
        satirlar.append(f"- Sık olaylar: {adlar} (sözlükte {len(olaylar)} olay; `python3 kit/mp.py ara <terim>`)")
    else:
        satirlar.append("- Olay sözlüğü yok: `python3 kit/mp.py sozluk` (bir kez)")
    if ayar.get("boyutlar"):
        satirlar.append("- Kırılım boyutları: " + ", ".join(ayar["boyutlar"]))
    kpiler = []
    for k in ayar.get("kpiler") or []:
        tip = "tekil" if k.get("tip", "general") == "unique" else "toplam"
        tanim = f"{k['pay']}/{k['payda']}" if k.get("pay") else k.get("olay", "?")
        kpiler.append(f"{k['ad']}={tanim} ({tip})")
    if kpiler:
        satirlar.append("- KPI: " + "; ".join(kpiler))
    if ayar.get("huniler"):
        satirlar.append("- Kayıtlı huniler: " + ", ".join(f"{ad}={i}" for ad, i in ayar["huniler"].items()))
    d = ayar.get("deney") or {}
    satirlar.append(
        f"- Deney: maruz olay `{d.get('maruz_olay')}`, deney özelliği `{d.get('deney_ozelligi')}`, "
        f"grup `{d.get('grup_ozelligi')}`"
    )
    satirlar.append("- Tanımlar: yerel/metrikler.md · Sürüm/kampanya günlüğü: yerel/notlar.md")
    if mp.get("kaynak") == "mcp" and not ayar.demo:
        satirlar.append("- Mixpanel verisi MCP ile: veri çekmeyi her zaman `veri-cekici` alt ajanına ver.")
    return "\n".join(satirlar) + "\n"


def yaz(ayar: A.Ayarlar) -> Path:
    hedef = yol()
    hedef.write_text(metin(ayar), encoding="utf-8")
    return hedef
