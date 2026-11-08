"""Kural tabanlı kategori atama.

Anahtar kelimeler kelime sınırında aranır ("HM" yalnızca ayrı kelime olarak eşleşir,
"AHMET" içinde eşleşmez).
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
import yaml

from .metin import sade

# Kart ekstresi de varsa bu kategorideki hareketler iç transferdir, gelir/gider sayılmaz
IC_TRANSFER_KATEGORILERI = {"Kredi Kartı Ödemesi"}


def kurallari_yukle(yol: Path) -> list[dict]:
    with open(yol, encoding="utf-8") as f:
        kurallar = yaml.safe_load(f) or []
    for k in kurallar:
        anahtarlar = [sade(a) for a in k.get("anahtarlar", []) if sade(a)]
        k["_desen"] = re.compile(r"\b(?:" + "|".join(re.escape(a) for a in anahtarlar) + r")\b") if anahtarlar else None
    return kurallar


def kural_bul(aciklama_sade: str, yon: str, kurallar: list[dict]) -> dict | None:
    """Uyan ilk kuralı döndürür, uyan yoksa None."""
    for k in kurallar:
        if k.get("yon") and k["yon"] != yon:
            continue
        if k["_desen"] is not None and k["_desen"].search(aciklama_sade):
            return k
    return None


def kural_kategorisi(aciklama_sade: str, yon: str, kurallar: list[dict]) -> str | None:
    k = kural_bul(aciklama_sade, yon, kurallar)
    return k["kategori"] if k else None


def kurum_ima_eder(aciklama_sade: str, yon: str, kurallar: list[dict]) -> bool:
    """Uyan kural karşı tarafın kurum olduğunu söylüyor mu?

    Kuralda `karsi_taraf: belirsiz` yazıyorsa (ör. Kira: ev sahibi kişi olabilir)
    karar ad tahminine bırakılır; yazmıyorsa kurum kabul edilir.
    """
    k = kural_bul(aciklama_sade, yon, kurallar)
    return bool(k) and k.get("karsi_taraf", "kurum") == "kurum"


def kategorile(tablo: pd.DataFrame, kurallar: list[dict], kart_var: bool) -> pd.DataFrame:
    """kategori ve sayilir sütunlarını ekler. karsi_taraf_turu önceden dolmuş olmalı."""
    tablo = tablo.copy()
    sadeler = tablo["aciklama"].map(sade)
    kategoriler = []
    for s, y, t in zip(sadeler, tablo["yon"], tablo["karsi_taraf_turu"]):
        k = kural_kategorisi(s, y, kurallar)
        if k is None:
            k = "Kişi Transferi" if t == "kisi" else "Diğer"
        kategoriler.append(k)
    tablo["kategori"] = kategoriler
    tablo["sayilir"] = ~(tablo["kategori"].isin(IC_TRANSFER_KATEGORILERI) & kart_var)
    return tablo
