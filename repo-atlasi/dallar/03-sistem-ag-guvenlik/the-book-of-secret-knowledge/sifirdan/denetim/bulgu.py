"""Bulgu modeli ve raporlama: her denetim aynı biçimde bulgu üretir."""

import json
from dataclasses import asdict, dataclass

ONEM_SIRASI = {"bilgi": 0, "dusuk": 1, "orta": 2, "yuksek": 3, "kritik": 4}
ONEM_ETIKETI = {"bilgi": "BİLGİ", "dusuk": "DÜŞÜK", "orta": "ORTA", "yuksek": "YÜKSEK", "kritik": "KRİTİK"}


@dataclass(frozen=True)
class Bulgu:
    onem: str  # bilgi | dusuk | orta | yuksek | kritik
    kural: str  # ör. SSH-001
    baslik: str
    ayrinti: str
    oneri: str
    konum: str = ""  # dosya:satır, ip:port ...


def sirala(bulgular):
    return sorted(bulgular, key=lambda b: (-ONEM_SIRASI[b.onem], b.kural, b.konum))


def rapor(bulgular, bicim="metin"):
    bulgular = sirala(bulgular)
    if bicim == "json":
        return json.dumps([asdict(b) for b in bulgular], ensure_ascii=False, indent=2)
    if not bulgular:
        return "Bulgu yok."
    satirlar = []
    for b in bulgular:
        konum = f" ({b.konum})" if b.konum else ""
        satirlar.append(f"[{ONEM_ETIKETI[b.onem]}] {b.kural} {b.baslik}{konum}")
        satirlar.append(f"    {b.ayrinti}")
        satirlar.append(f"    Öneri: {b.oneri}")
    sayac = {o: sum(1 for b in bulgular if b.onem == o) for o in ONEM_SIRASI}
    ozet = ", ".join(f"{ONEM_ETIKETI[o]}: {n}" for o, n in sorted(sayac.items(), key=lambda x: -ONEM_SIRASI[x[0]]) if n)
    satirlar.append(f"Özet: {ozet}")
    return "\n".join(satirlar)


def cikis_kodu(bulgular, esik="yuksek"):
    """CI'da kullanmak için: eşik ve üstünde bulgu varsa 1."""
    return 1 if any(ONEM_SIRASI[b.onem] >= ONEM_SIRASI[esik] for b in bulgular) else 0
