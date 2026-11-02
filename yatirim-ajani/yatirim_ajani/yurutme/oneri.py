"""Midas için emir önerisi: ajan önerir, karar ve emir sizindir.

Midas'ın herkese açık bir emir API'si olmadığı için sistem gerçek emir göndermez. Onaylanan her
sanal işlem, Midas'ta elle girebileceğiniz bir limit emir önerisine dönüşür.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd

from ..ayarlar import Piyasa
from ..motor import AdimSonucu


def limit_fiyat(yon: str, fiyat: float, piyasa: Piyasa) -> float:
    pay = piyasa.spread_bps / 10_000
    return round(fiyat * (1 + pay) if yon == "AL" else fiyat * (1 - pay), 2)


def onerileri_kaydet(
    db: sqlite3.Connection,
    piyasa: Piyasa,
    sonuclar: list[AdimSonucu],
    an: datetime,
    klasor: str | Path,
) -> Path | None:
    onayli = [s for s in sonuclar if s.karar.emir is not None]
    if not onayli and not sonuclar:
        return None
    yerel = pd.Timestamp(an).tz_convert(piyasa.saat_dilimi)
    birim = "lot" if not piyasa.kesirli_hisse else "adet"
    satirlar = [
        f"# Emir önerileri — {piyasa.kod.upper()} — {yerel:%Y-%m-%d %H:%M}",
        "",
        "Bu bir yatırım tavsiyesi değildir. Emri vermeden önce fiyatı Midas'ta kontrol edin;",
        "dakika seviyesindeki öneriler birkaç dakika içinde geçerliliğini yitirir.",
        "",
    ]
    if onayli:
        satirlar += ["| Hisse | İşlem | Miktar | Limit fiyat | Gerekçe |", "|---|---|---|---|---|"]
        for s in onayli:
            e = s.karar.emir
            assert e is not None
            limit = limit_fiyat(e.yon, e.referans_fiyat, piyasa)
            db.execute(
                "INSERT INTO oneriler (zaman, piyasa, hisse, yon, adet, limit_fiyat, gerekce) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (yerel.isoformat(), piyasa.kod, e.hisse, e.yon, e.adet, limit, e.neden),
            )
            satirlar.append(
                f"| {e.hisse} | {e.yon} | {e.adet:g} {birim} | {limit:,.2f} {piyasa.para_birimi} | {e.neden} |"
            )
        db.commit()
    reddedilen = [s for s in sonuclar if s.karar.emir is None]
    if reddedilen:
        satirlar += ["", "## Risk bekçisinin durdurdukları", ""]
        satirlar += [f"- {s.emir.hisse} {s.emir.yon}: {s.karar.gerekce}" for s in reddedilen]

    yol = Path(klasor) / f"oneri-{piyasa.kod}-{yerel:%Y%m%d-%H%M}.md"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text("\n".join(satirlar) + "\n", encoding="utf-8")
    return yol
