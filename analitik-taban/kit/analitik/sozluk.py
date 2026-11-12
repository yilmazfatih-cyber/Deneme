"""Yerel olay sözlüğü (yerel/sozluk.json): olay adı, 30 günlük hacim, açıklama, sık özellikler.

Model olay/özellik adlarını API'yi dolaşarak değil buradan arar (`mp.py ara`): bir kez kurulur, her oturumda
token ve sorgu kotası kazandırır. Kaynak: Query API + Lexicon, ya da MCP/CSV ile hazırlanmış bir dosya.
"""

from __future__ import annotations

import datetime as dt
import difflib
import json
from pathlib import Path
from typing import Dict, List, Optional

from . import csvoku, metin
from .ayarlar import Ayarlar

# Her olayda bulunan, analizde bilgi taşımayan teknik özellikler: sözlükte gösterilmez.
GURULTU = frozenset(
    """distinct_id time $insert_id mp_lib $lib_version $mp_api_endpoint $mp_api_timestamp_ms mp_processing_time_ms
    $device_id $user_id $distinct_id_before_identity $had_persisted_distinct_id token $import mp_sent_by_lib_version
    $mp_replay_id $mp_autocapture""".split()
)


def ozellik_sirala(ozellikler: List[str]) -> List[str]:
    """Gürültüyü atar; projeye özel özellikler ($ / mp_ ile başlamayanlar) önce gelir."""
    temiz = [o for o in dict.fromkeys(ozellikler) if o not in GURULTU]
    return [o for o in temiz if not o.startswith(("$", "mp_"))] + [o for o in temiz if o.startswith(("$", "mp_"))]


def yol(ayar: Ayarlar) -> Path:
    return ayar.dizin / "sozluk.json"


def yukle(ayar: Ayarlar) -> Optional[Dict]:
    dosya = yol(ayar)
    if not dosya.exists():
        return None
    try:
        return json.loads(dosya.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def kaydet(ayar: Ayarlar, sozluk: Dict) -> Path:
    dosya = yol(ayar)
    dosya.parent.mkdir(parents=True, exist_ok=True)
    for o in sozluk["olaylar"]:
        o["ozellikler"] = ozellik_sirala(o.get("ozellikler") or [])
    sozluk["olaylar"].sort(key=lambda o: (-(o.get("hacim") or 0), o["ad"]))
    dosya.write_text(json.dumps(sozluk, ensure_ascii=False, indent=1), encoding="utf-8")
    return dosya


def _parcala(liste: List[str], boyut: int):
    for i in range(0, len(liste), boyut):
        yield liste[i : i + boyut]


def kur_api(mp, ozellik_olay_sayisi: int = 20, olay_limiti: int = 400) -> Dict:
    """Query API (+ varsa Lexicon) ile sözlük. Kota: ~ 1 + olay/80 + ozellik_olay_sayisi sorgu."""
    adlar = mp.olay_adlari(limit=olay_limiti)
    bit = mp.bugun - dt.timedelta(days=1)
    bas = bit - dt.timedelta(days=29)
    hacim: Dict[str, float] = {}
    for parca in _parcala(adlar, 80):
        for ad, seri in mp.olay_serisi(parca, "general", "month", bas, bit).items():
            hacim[ad] = sum(seri.values())
    olaylar = {ad: {"ad": ad, "hacim": int(hacim.get(ad, 0)), "aciklama": "", "ozellikler": []} for ad in adlar}
    sirali = sorted(adlar, key=lambda a: -hacim.get(a, 0))
    for ad in sirali[:ozellik_olay_sayisi]:
        olaylar[ad]["ozellikler"] = list(mp.ozellik_isimleri(ad, limit=25).keys())
    kaynak = "api"
    if mp.service_account or mp.ayar.demo:
        try:
            for sema in mp.semalar():
                if sema.get("entityType") != "event":
                    continue
                ad = sema.get("name")
                govde = sema.get("schemaJson") or {}
                kayit = olaylar.setdefault(ad, {"ad": ad, "hacim": 0, "aciklama": "", "ozellikler": []})
                kayit["aciklama"] = (govde.get("description") or "")[:160]
                ozellikler = list((govde.get("properties") or {}).keys())
                kayit["ozellikler"] = list(dict.fromkeys(kayit["ozellikler"] + ozellikler))[:40]
            kaynak = "api+lexicon"
        except Exception:  # noqa: BLE001 - Lexicon isteğe bağlı; yetki yoksa Query API yeter
            pass
    return {
        "olusturma": dt.datetime.now().isoformat(timespec="seconds"),
        "kaynak": kaynak,
        "olaylar": list(olaylar.values()),
    }


def _ilk_eslesen(basliklar: List[str], adaylar: List[str]) -> Optional[str]:
    kucukler = {metin.kucuk(b): b for b in basliklar}
    for aday in adaylar:
        for k, b in kucukler.items():
            if k == aday:
                return b
    for aday in adaylar:
        for k, b in kucukler.items():
            if aday in k:
                return b
    return None


def ice_aktar(dosya: Path) -> Dict:
    """MCP ile ya da Lexicon dışa aktarımıyla hazırlanmış CSV/JSON'dan sözlük.

    CSV: olay/event/name sütunu zorunlu; hacim/volume/count, ozellik/property, aciklama/description isteğe bağlı.
    Aynı olay birden çok satırda olabilir (her satırda bir özellik).
    JSON: ["Olay", ...] ya da [{"ad"|"name": ..., "hacim", "ozellikler", "aciklama"}].
    """
    olaylar: Dict[str, Dict] = {}

    def ekle(ad, hacim=None, ozellik=None, aciklama=None):
        ad = str(ad or "").strip()
        if not ad:
            return
        kayit = olaylar.setdefault(ad, {"ad": ad, "hacim": 0, "aciklama": "", "ozellikler": []})
        if hacim not in (None, ""):
            sayi = csvoku.sayiya(str(hacim))
            if sayi is not None:
                kayit["hacim"] = max(kayit["hacim"], int(sayi))
        for oz in ozellik if isinstance(ozellik, list) else [ozellik]:
            if oz and str(oz).strip() and str(oz).strip() not in kayit["ozellikler"]:
                kayit["ozellikler"].append(str(oz).strip())
        if aciklama and not kayit["aciklama"]:
            kayit["aciklama"] = str(aciklama)[:160]

    if dosya.suffix.lower() == ".json":
        veri = json.loads(dosya.read_text(encoding="utf-8-sig"))
        if isinstance(veri, dict):
            veri = veri.get("olaylar") or veri.get("events") or []
        for oge in veri:
            if isinstance(oge, str):
                ekle(oge)
            else:
                ekle(
                    oge.get("ad") or oge.get("name") or oge.get("event"),
                    oge.get("hacim") or oge.get("volume"),
                    oge.get("ozellikler") or oge.get("properties"),
                    oge.get("aciklama") or oge.get("description"),
                )
    else:
        basliklar, satirlar = csvoku.oku(dosya)
        olay_s = _ilk_eslesen(basliklar, ["olay", "event", "event name", "entity name", "name", "ad"])
        if not olay_s:
            raise ValueError(f"Olay adı sütunu bulunamadı. Sütunlar: {', '.join(basliklar[:12])}")
        hacim_s = _ilk_eslesen(basliklar, ["hacim", "volume", "count", "sayı", "30 day volume"])
        oz_s = _ilk_eslesen(basliklar, ["ozellik", "özellik", "property", "property name"])
        ac_s = _ilk_eslesen(basliklar, ["aciklama", "açıklama", "description"])
        tur_s = _ilk_eslesen(basliklar, ["entity type", "type", "tür"])
        for s in satirlar:
            kayit = dict(zip(basliklar, s))
            if tur_s and metin.kucuk(kayit.get(tur_s, "")) not in ("", "event", "olay", "custom event"):
                continue
            ekle(
                kayit.get(olay_s),
                kayit.get(hacim_s) if hacim_s else None,
                kayit.get(oz_s) if oz_s else None,
                kayit.get(ac_s) if ac_s else None,
            )
    return {
        "olusturma": dt.datetime.now().isoformat(timespec="seconds"),
        "kaynak": f"ice-aktar:{dosya.name}",
        "olaylar": list(olaylar.values()),
    }


def ara(sozluk: Dict, terim: str, limit: int = 12) -> Dict[str, List]:
    """Olay adı/açıklaması ve özellik adlarında Türkçe duyarsız arama; bulamazsa en yakın adları önerir."""
    t = metin.kucuk(terim.strip())
    olay_puanlari = []
    ozellik_olaylari: Dict[str, List[str]] = {}
    for o in sozluk.get("olaylar", []):
        ad = metin.kucuk(o["ad"])
        if ad == t:
            puan = 3
        elif ad.startswith(t):
            puan = 2
        elif t in ad or t in metin.kucuk(o.get("aciklama", "")):
            puan = 1
        else:
            puan = 0
        if puan:
            olay_puanlari.append((-puan, -(o.get("hacim") or 0), o["ad"], o))
        for oz in o.get("ozellikler", []):
            if t in metin.kucuk(oz):
                ozellik_olaylari.setdefault(oz, []).append(o["ad"])
    olay_puanlari.sort()
    oneriler: List[str] = []
    if not olay_puanlari and not ozellik_olaylari:
        adlar = [o["ad"] for o in sozluk.get("olaylar", [])]
        kucuk_adlar = {metin.kucuk(a): a for a in adlar}
        oneriler = [kucuk_adlar[k] for k in difflib.get_close_matches(t, list(kucuk_adlar), n=5, cutoff=0.5)]
    return {
        "olaylar": [x[3] for x in olay_puanlari[:limit]],
        "ozellikler": sorted(ozellik_olaylari.items(), key=lambda kv: -len(kv[1]))[:limit],
        "oneriler": oneriler,
    }


def olay(sozluk: Optional[Dict], ad: str) -> Optional[Dict]:
    if not sozluk:
        return None
    for o in sozluk.get("olaylar", []):
        if o["ad"] == ad:
            return o
    return None
