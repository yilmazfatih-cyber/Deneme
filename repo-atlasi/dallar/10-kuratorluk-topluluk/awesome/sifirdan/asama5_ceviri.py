"""Aşama 5 — Çeviri kapsama raporu.

Çok dilli içerik depoları iki sorunla boğuşur:
1. Eksik çeviri: free-programming-books'ta docs/ altında HOWTO-tr.md ve
   CODE_OF_CONDUCT-tr.md var ama CONTRIBUTING-tr.md yok.
2. Bayat çeviri: 996.ICU'nun i18n/ klasöründeki 35 çeviri, ana README değiştikçe
   geride kalır; hangi bölümün eksik olduğunu kimse bilmez.

Bu modül iki soruya cevap verir:
- dil_matrisi(): "AD-dil.md" adlandırmasından hangi belgenin hangi dilde olduğunu çıkarır.
- karsilastir(): bir çeviriyi temel metinle yapısal olarak kıyaslar (başlık, bağlantı,
  madde sayısı ve çevrilmeden bırakılmış satır oranı). Anlamı denetlemez; yalnızca
  "gözden geçir" işareti koyar. Gerçek projeler (ör. Crowdin, Weblate) bunu kaynak
  dizgeleri tek tek izleyerek yapar.
"""

from __future__ import annotations

import re
from collections import defaultdict

from asama1_ayristirici import ayristir

DIL_EKI_RE = re.compile(r"^(?P<ad>.+?)(?:-(?P<dil>[a-z]{2,3}(?:_[A-Z]{2})?))?\.md$")
BAGLANTI_RE = re.compile(r"\]\([^)]+\)")


def dil_matrisi(dosya_adlari: list[str], temel_dil: str = "en", haric: tuple = ("README",)) -> dict[str, set[str]]:
    """{'HOWTO': {'en', 'tr', ...}, ...}. Ekin yoksa dosya temel dildedir."""
    matris: dict[str, set[str]] = defaultdict(set)
    for ad in dosya_adlari:
        m = DIL_EKI_RE.match(ad.rsplit("/", 1)[-1])
        if m and m.group("ad") not in haric:
            matris[m.group("ad")].add(m.group("dil") or temel_dil)
    return dict(matris)


def eksikler(matris: dict[str, set[str]]) -> dict[str, list[str]]:
    """Her dil için eksik belgeler. Yalnızca en az bir belgesi olan diller sayılır."""
    tum_diller = set().union(*matris.values()) if matris else set()
    sonuc = {}
    for dil in sorted(tum_diller):
        eksik = sorted(belge for belge, diller in matris.items() if dil not in diller)
        if eksik:
            sonuc[dil] = eksik
    return sonuc


def _ozet(metin: str) -> dict[str, int]:
    belge = ayristir(metin)
    madde = len(belge.girdiler) + len(belge.maddeler)
    return {"baslik": len(belge.basliklar), "baglanti": len(BAGLANTI_RE.findall(metin)), "madde": madde}


def karsilastir(temel: str, ceviri: str, esik: float = 0.8) -> dict:
    """Yapısal karşılaştırma. 'uyarilar' boşsa çeviri temel metinle aynı iskelete sahip."""
    a, b = _ozet(temel), _ozet(ceviri)
    temel_satirlar = {s.strip() for s in temel.splitlines() if len(s.strip()) > 20}
    ceviri_satirlar = [s.strip() for s in ceviri.splitlines() if len(s.strip()) > 20]
    ayni = sum(1 for s in ceviri_satirlar if s in temel_satirlar)
    oran = ayni / len(ceviri_satirlar) if ceviri_satirlar else 0.0
    uyarilar = []
    for alan, ad in (("baslik", "başlık"), ("baglanti", "bağlantı"), ("madde", "madde")):
        if a[alan] and b[alan] < a[alan] * esik:
            uyarilar.append(f"{ad} sayısı düşük: {b[alan]}/{a[alan]} (eksik bölüm olabilir)")
    if oran > 0.3:
        uyarilar.append(f"satırların %{round(oran * 100)}'i temel metinle aynı (çevrilmemiş olabilir)")
    return {"temel": a, "ceviri": b, "ayni_satir_orani": round(oran, 2), "uyarilar": uyarilar}
