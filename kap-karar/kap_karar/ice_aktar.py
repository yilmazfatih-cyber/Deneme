"""Yatırım ajanının bilgi tabanını (yatirim-ajani/bilgi_kaynak/*.json) bu veritabanına aktarır.

Oradaki olaylar fiyat hareketi (yukselis / dusus / sok) ve anlatı içeren makro olaylardır.
Burada her biri bir karar ağacına eşlenir: fiyat hareketleri → piyasa_hareketi; makro türler → ilgili ağaç;
eşleşmeyenler → genel_haber.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .sema import Olay
from .sinif import parametre_cikar, tur_bul

TUR_ESLEME: dict[str, str] = {
    "yukselis": "piyasa_hareketi", "dusus": "piyasa_hareketi", "sok": "piyasa_hareketi",
    "derecelendirme": "kredi_notu_ulke", "kredi_notu": "kredi_notu_ulke",
    "enflasyon": "enflasyon_verisi", "faiz": "tcmb_faiz_karari", "ppk": "tcmb_faiz_karari",
    "siyasi": "siyasi_belirsizlik", "secim": "siyasi_belirsizlik",
    "savas": "jeopolitik_sok", "jeopolitik": "jeopolitik_sok",
    "bilanço": "finansal_rapor", "bilanco": "finansal_rapor",
    "ihale": "ihale", "temettu": "temettu", "sozlesme": "yeni_sozlesme",
    "kur": "kur_hareketi", "rezerv": "kur_hareketi", "fed": "fed_karari",
    "buyume": "buyume_verisi", "butce": "maliye_butce_ovp", "ovp": "maliye_butce_ovp", "vergi": "maliye_butce_ovp",
    "enerji": "enerji_fiyat_duzenlemesi", "duzenleme": "sektor_duzenlemesi", "regulasyon": "sektor_duzenlemesi",
}

VARSAYILAN_KAYNAK_DIZINI = Path(__file__).resolve().parent.parent.parent / "yatirim-ajani" / "bilgi_kaynak"


def _tur_sec(o: dict[str, Any]) -> str:
    t = TUR_ESLEME.get(o.get("tur", "").lower())
    if t:
        return t
    adaylar = tur_bul(o.get("baslik", "") + " " + o.get("anlam", ""))
    makro = [a for a in adaylar if a[0] not in ("piyasa_hareketi",)]
    return makro[0][0] if makro else "genel_haber"


def donustur(o: dict[str, Any], kaynak_dosya: str) -> Olay:
    tur = _tur_sec(o)
    metin = f"{o.get('baslik', '')}. {o.get('anlam', '')}"
    if tur == "piyasa_hareketi":
        getiri = o.get("getiri")
        p: dict[str, Any] = {
            "getiri": round(getiri * 100, 2) if getiri is not None else None,
            "endekse_gore": round(o["endekse_gore"] * 100, 2) if o.get("endekse_gore") is not None else None,
            "hacim_z": o.get("hacim_z"),
            "neden_biliniyor": bool(o.get("anlam")) and o.get("onden_gorulebilir") in ("evet", "kismen"),
        }
    elif tur == "genel_haber":
        p = {"yon": o.get("yon", "notr"), "kalici": o.get("tur") in ("rejim",)}
    else:
        p, _ = parametre_cikar(tur, metin)
    kapsam = o.get("kapsam", "yerel_makro")
    kaynak = "kap" if kapsam == "sirket" and o.get("tur") in ("bilanço", "ihale", "temettu", "sozlesme") else ("gundem" if kapsam == "sirket" else ("kuresel" if kapsam == "kuresel" else "makro"))
    kod = f"YA-{o['baslangic']}-{(o.get('hisse') or o.get('sektor') or kapsam)}-{o.get('tur')}"
    etiketler = list(o.get("etiketler", [])) + [kaynak_dosya, o.get("tur", "")]
    return Olay(
        kod=kod, tarih=o["baslangic"], kaynak=kaynak, kapsam=kapsam, tur=tur,  # type: ignore[arg-type]
        baslik=o["baslik"][:200], ozet=(o.get("anlam", "") + (" — Tepki: " + o["tepki_aciklama"] if o.get("tepki_aciklama") else ""))[:1200],
        hisse=o.get("hisse"), sektor=o.get("sektor"), yon=o.get("yon", "notr"),
        parametreler={k: v for k, v in p.items() if v is not None}, etiketler=[e for e in etiketler if e],
        kaynaklar=list(o.get("kaynaklar", [])), guven=float(o.get("guven", 0.5)),
    )


def yukle(dizin: Path | None = None) -> list[Olay]:
    dizin = Path(dizin) if dizin else VARSAYILAN_KAYNAK_DIZINI
    sonuc: list[Olay] = []
    if not dizin.exists():
        return sonuc
    for dosya in sorted(dizin.glob("*.json")):
        veri = json.loads(dosya.read_text(encoding="utf-8"))
        for o in veri.get("olaylar", []):
            try:
                sonuc.append(donustur(o, dosya.stem))
            except (KeyError, TypeError, ValueError):
                continue
    return sonuc
