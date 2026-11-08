"""Podyum → raf gecikmesinin ölçümü (ilke 4: gecikme öğrenilir, varsayılmaz).

Bir (eksen, değer) için: podyumda eşiği aşan sinyal veren sezonların her biri bir aday başlangıçtır; segmentin rafında
ilk görülme tarihinden ÖNCEKİ en yakın podyum sezonu eşleşir. Podyum tarihi `defile` tablosundaki en erken defile
tarihidir; yoksa sezonun nominal tarihidir (SS: önceki yılın 25 Eylül'ü, FW: aynı yılın 25 Şubat'ı).
Gecikme gün cinsinden `gecikme_olcum` tablosuna yazılır; `ozet_gecikme` medyan ve çeyrekleri verir.
"""

from __future__ import annotations

import statistics
from datetime import date

ESIK_VARSAYILAN = 0.02  # podyum payı bu değerin altındaki sinyaller başlangıç sayılmaz
EN_UZUN_GUN = 3 * 365  # bundan uzun "gecikme" ilgisiz eşleşmedir


def nominal_podyum_tarihi(sezon: str) -> date:
    yil = 2000 + int(sezon[2:])
    return date(yil - 1, 9, 25) if sezon.startswith("SS") else date(yil, 2, 25)


def podyum_tarihi(depo, sezon: str) -> date:
    tarihler = depo.defile_tarihleri(sezon)
    return min(tarihler) if tarihler else nominal_podyum_tarihi(sezon)


def olc(
    depo, segment: str, kategori: str, *, ulke: str = "TR", esik: float = ESIK_VARSAYILAN, bugun: date | None = None
) -> list[dict]:
    """Ölçümleri hesaplar ve `gecikme_olcum`'a yazar (tek transaction). Yazılan satırları döndürür."""
    bugun = bugun or date.today()
    baslangic: dict[tuple[str, str], list[tuple[date, str]]] = {}
    for s in depo.sinyaller():
        if s.podyum_payi >= esik:
            baslangic.setdefault((s.nitelik_ekseni, s.nitelik_degeri), []).append(
                (podyum_tarihi(depo, s.sezon), s.sezon)
            )
    # aynı (eksen, değer) için segmentin bütün markalarındaki en erken raf görülmesi
    raf: dict[tuple[str, str], date] = {}
    for g in depo.gozlemler(ulke, segment, kategori):
        a = (g.nitelik_ekseni, g.nitelik_degeri)
        raf[a] = min(raf.get(a, g.ilk_gorulme), g.ilk_gorulme)
    satirlar = []
    for a, raf_tarihi in sorted(raf.items()):
        adaylar = sorted((t, sz) for t, sz in set(baslangic.get(a, [])) if t <= raf_tarihi)
        if not adaylar:
            continue
        p_tarih, sezon = adaylar[-1]
        gun = (raf_tarihi - p_tarih).days
        if gun > EN_UZUN_GUN:
            continue
        satirlar.append(
            {
                "segment": segment,
                "kategori": kategori,
                "eksen": a[0],
                "deger": a[1],
                "sezon": sezon,
                "podyum_tarihi": p_tarih.isoformat(),
                "raf_tarihi": raf_tarihi.isoformat(),
                "gecikme_gun": gun,
                "olcum_tarihi": bugun.isoformat(),
            }
        )
    with depo.baglanti:
        depo.baglanti.executemany(
            "INSERT OR REPLACE INTO gecikme_olcum (segment, kategori, eksen, deger, sezon, podyum_tarihi, raf_tarihi, "
            "gecikme_gun, olcum_tarihi) VALUES (:segment, :kategori, :eksen, :deger, :sezon, :podyum_tarihi, "
            ":raf_tarihi, :gecikme_gun, :olcum_tarihi)",
            satirlar,
        )
    return satirlar


def ozet_gecikme(depo, segment: str, kategori: str, eksen: str | None = None) -> dict:
    """Gün cinsinden medyan, çeyrekler ve n; ayrıca sezon cinsinden medyan (1 sezon ≈ 182,5 gün)."""
    sql = "SELECT gecikme_gun FROM gecikme_olcum WHERE segment=? AND kategori=?"
    prm: list = [segment, kategori]
    if eksen:
        sql += " AND eksen=?"
        prm.append(eksen)
    gunler = sorted(r[0] for r in depo.baglanti.execute(sql, prm))
    n = len(gunler)
    if n == 0:
        return {"segment": segment, "kategori": kategori, "n": 0, "medyan": None, "q1": None, "q3": None}
    if n == 1:
        q1 = q3 = float(gunler[0])
    else:
        q1, _, q3 = statistics.quantiles(gunler, n=4, method="inclusive")
    medyan = float(statistics.median(gunler))
    return {
        "segment": segment,
        "kategori": kategori,
        "n": n,
        "medyan": medyan,
        "q1": float(q1),
        "q3": float(q3),
        "en_az": gunler[0],
        "en_cok": gunler[-1],
        "medyan_sezon": round(medyan / 182.5, 2),
    }
