"""Ayarlar: piyasalar, maliyetler ve risk sınırları.

Tüm sayılar `ayarlar.toml` dosyasından geçersiz kılınabilir. Varsayılanlar bilinçli olarak
temkinlidir; gevşetmeden önce sanal işlemde en az birkaç ay sonuç görün.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields, replace
from datetime import time
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Piyasa:
    kod: str  # "bist" | "abd"
    para_birimi: str
    sembol_eki: str  # Yahoo sembol eki: BIST için ".IS"
    gosterge: str  # Karşılaştırma ölçütü (al-tut)
    saat_dilimi: str
    acilis: time
    kapanis: time
    # İşlem maliyetleri (Midas tarifesine göre kendiniz güncelleyin)
    komisyon_orani: float  # işlem tutarının oranı (0.0004 = binde 0,4)
    sabit_komisyon: float  # işlem başına sabit ücret (para biriminde)
    spread_bps: float  # alış-satış farkının yarısı, baz puan
    kayma_bps: float  # piyasa emrinde beklenen ek kayma, baz puan
    kesirli_hisse: bool  # Midas ABD'de kesirli hisse alınabilir; BIST'te lot tam sayıdır

    def sembol(self, hisse: str) -> str:
        hisse = hisse.strip().upper()
        if self.sembol_eki and not hisse.endswith(self.sembol_eki) and not hisse.startswith("^"):
            return hisse + self.sembol_eki
        return hisse


PIYASALAR: dict[str, Piyasa] = {
    "bist": Piyasa(
        kod="bist",
        para_birimi="TRY",
        sembol_eki=".IS",
        gosterge="XU100.IS",
        saat_dilimi="Europe/Istanbul",
        acilis=time(10, 0),
        kapanis=time(18, 0),
        komisyon_orani=0.0,  # Midas BIST'te komisyonsuz duyurdu; değişirse güncelleyin
        sabit_komisyon=0.0,
        spread_bps=10.0,
        kayma_bps=5.0,
        kesirli_hisse=False,
    ),
    "abd": Piyasa(
        kod="abd",
        para_birimi="USD",
        sembol_eki="",
        gosterge="SPY",
        saat_dilimi="America/New_York",
        acilis=time(9, 30),
        kapanis=time(16, 0),
        komisyon_orani=0.0,
        sabit_komisyon=1.0,  # Midas ABD işlem ücretini kendi tarifenize göre girin
        spread_bps=3.0,
        kayma_bps=2.0,
        kesirli_hisse=True,
    ),
}


@dataclass(frozen=True)
class RiskAyarlari:
    max_pozisyon_orani: float = 0.10  # tek hisse, toplam varlığın en fazla %10'u
    max_hisse_orani: float = 0.80  # en az %20 nakit kalır
    gunluk_zarar_limiti: float = 0.02  # gün içi %2 kayıpta yeni alım durur
    max_dusus_limiti: float = 0.15  # zirveden %15 düşüşte her şey durur (elle sıfırlanır)
    zarar_kes_orani: float = 0.07  # pozisyon maliyetin %7 altına inerse sat önerisi
    min_islem_tutari: float = 100.0
    max_gunluk_islem: int = 10  # dakika seviyesinde aşırı işlemi engeller
    min_tez_olasiligi: float = 0.55  # araştırma ajanının "AL" olasılığı bunun altındaysa işlem yok


@dataclass(frozen=True)
class AjanAyarlari:
    model: str = "claude-opus-5-5"
    efor: str = "high"  # low | medium | high | xhigh | max
    max_tur: int = 12  # araç çağrısı döngüsü üst sınırı
    web_arama: bool = True  # yalnız canlı modda; zaman kilitli modda her zaman kapalı


@dataclass(frozen=True)
class Ayarlar:
    baslangic_nakit: dict[str, float] = field(
        default_factory=lambda: {"bist": 100_000.0, "abd": 5_000.0}
    )
    evren: dict[str, list[str]] = field(
        default_factory=lambda: {
            "bist": ["THYAO", "ASELS", "BIMAS", "KCHOL", "TUPRS", "SISE", "FROTO", "EREGL"],
            "abd": ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "JPM", "KO", "XOM"],
        }
    )
    risk: RiskAyarlari = field(default_factory=RiskAyarlari)
    ajan: AjanAyarlari = field(default_factory=AjanAyarlari)
    veritabani: str = "veri/ajan.db"
    rapor_klasoru: str = "raporlar"


def _birlestir(nesne: Any, sozluk: dict[str, Any]) -> Any:
    gecerli = {f.name for f in fields(nesne)}
    bilinmeyen = set(sozluk) - gecerli
    if bilinmeyen:
        raise ValueError(f"Bilinmeyen ayar(lar): {', '.join(sorted(bilinmeyen))}")
    return replace(nesne, **sozluk)


def ayarlari_yukle(yol: str | Path | None = None) -> Ayarlar:
    ayarlar = Ayarlar()
    if yol is None:
        yol = Path("ayarlar.toml")
        if not yol.exists():
            return ayarlar
    with open(yol, "rb") as f:
        ham = tomllib.load(f)
    risk = _birlestir(ayarlar.risk, ham.pop("risk", {}))
    ajan = _birlestir(ayarlar.ajan, ham.pop("ajan", {}))
    ayarlar = _birlestir(ayarlar, ham)
    return replace(ayarlar, risk=risk, ajan=ajan)
