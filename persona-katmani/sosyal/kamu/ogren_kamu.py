"""Kamu verisinden öğrenme (ADR-010): ilgi endeksi ve ses payı, marka/rakip duygu karşılaştırması, piyasa yaratıcı çarpanı."""
from __future__ import annotations

import json
import math
import statistics
from datetime import date, datetime, timedelta
from pathlib import Path

from sosyal.ortak import DEPO

Z95 = 1.96
UZUN_GUN = 30  # "uzun yaşayan reklam" eşiği
CARPAN_ARALIK = (0.7, 1.4)


def wilson(x: float, n: int) -> tuple[float, float]:
    if n <= 0:
        return (0.0, 1.0)
    p = x / n
    d = 1 + Z95**2 / n
    m = (p + Z95**2 / (2 * n)) / d
    h = Z95 * math.sqrt(p * (1 - p) / n + Z95**2 / (4 * n * n)) / d
    return (max(0.0, m - h), min(1.0, m + h))


def _sorgular(c, kiraci: str, tur: str | None = None) -> list:
    q = "SELECT id, etiket, tur FROM kamu_sorgu WHERE kiraci_id=? AND aktif=1"
    a: list = [kiraci]
    if tur:
        q += " AND tur=?"
        a.append(tur)
    return c.execute(q + " ORDER BY id", a).fetchall()


def ilgi_endeksi(c, kiraci: str) -> dict:
    """Kategori ilgi endeksi (son 7 gün / önceki 21 gün), günlük log-doğrusal eğim ve marka/rakip ses payı (son 7 gün sayım payı)."""
    kategoriler: dict = {}
    for s in _sorgular(c, kiraci, "kategori"):
        seri = [(r[0], r[1]) for r in c.execute("SELECT tarih, hacim FROM sosyal_konu_hacmi WHERE platform='x' AND konu=? ORDER BY tarih", (s[0],))]
        if len(seri) < 7:
            kategoriler[s[1]] = {"gun_sayisi": len(seri), "not": "en az 7 gün sayım gerekir (counts/recent günlük çalıştırılarak birikir)"}
            continue
        hacim = [h for _, h in seri]
        son7 = statistics.fmean(hacim[-7:])
        onceki = hacim[-28:-7] if len(hacim) >= 14 else hacim[:-7] or hacim[:7]
        endeks = son7 / statistics.fmean(onceki) if onceki and statistics.fmean(onceki) > 0 else None
        xs = list(range(len(hacim)))
        ys = [math.log(h + 1) for h in hacim]
        xm, ym = statistics.fmean(xs), statistics.fmean(ys)
        egim = sum((x - xm) * (y - ym) for x, y in zip(xs, ys)) / max(1e-9, sum((x - xm) ** 2 for x in xs))
        kategoriler[s[1].removeprefix("kategori:")] = {"gun_sayisi": len(hacim), "son7_ort": round(son7, 1),
                                                         "endeks": round(endeks, 3) if endeks else None, "egim_gunluk": round(math.expm1(egim), 4)}
    ses: dict[str, int] = {}
    for s in [*_sorgular(c, kiraci, "marka"), *_sorgular(c, kiraci, "rakip")]:
        r = c.execute("SELECT COALESCE(SUM(hacim),0) FROM (SELECT hacim FROM sosyal_konu_hacmi WHERE platform='x' AND konu=? ORDER BY tarih DESC LIMIT 7)", (s[0],)).fetchone()
        ses[s[1]] = int(r[0])
    toplam = sum(ses.values())
    ses_payi = {k: round(v / toplam, 4) for k, v in ses.items()} if toplam else {}
    return {"kategoriler": kategoriler, "sesPayi": ses_payi, "sesSayim7": ses}


def marka_duygu(c, kiraci: str, gun: int = 30) -> list[dict]:
    """Marka ve rakipler için ağırlıklı olumlu/olumsuz oranı, olumsuz için %95 Wilson GA, öne çıkan şikâyet konuları; markaya göre fark."""
    sinir = (date.today() - timedelta(days=gun)).isoformat()
    satirlar = []
    for s in [*_sorgular(c, kiraci, "marka"), *_sorgular(c, kiraci, "rakip")]:
        kay = c.execute("SELECT ornek_n, olumlu, olumsuz, one_cikan_konular, ort_etkilesim FROM kamu_duygu WHERE sorgu_id=? AND tarih>=?", (s[0], sinir)).fetchall()
        n = sum(k[0] for k in kay)
        if n == 0:
            continue
        olumlu = sum(k[0] * k[1] for k in kay) / n
        olumsuz = sum(k[0] * k[2] for k in kay) / n
        konu: dict[str, float] = {}
        for k in kay:
            for ad, oran in (json.loads(k[3]) if k[3] else {}).items():
                konu[ad] = konu.get(ad, 0) + oran * k[0] / n
        alt, ust = wilson(olumsuz * n, n)
        satirlar.append({"etiket": s[1], "tur": s[2], "n": n, "olumlu": round(olumlu, 4), "olumsuz": round(olumsuz, 4),
                         "net": round(olumlu - olumsuz, 4), "olumsuzGA": [round(alt, 4), round(ust, 4)],
                         "konular": {k: round(v, 4) for k, v in sorted(konu.items(), key=lambda x: -x[1])[:5]}})
    marka = next((r for r in satirlar if r["tur"] == "marka"), None)
    if marka:
        for r in satirlar:
            if r is marka:
                continue
            fark = r["olumsuz"] - marka["olumsuz"]
            se = math.sqrt(r["olumsuz"] * (1 - r["olumsuz"]) / r["n"] + marka["olumsuz"] * (1 - marka["olumsuz"]) / marka["n"])
            r["olumsuzFarkMarkaya"] = round(fark, 4)
            r["farkGA"] = [round(fark - Z95 * se, 4), round(fark + Z95 * se, 4)]
            r["anlamli"] = (fark - Z95 * se) > 0 or (fark + Z95 * se) < 0
    return satirlar


def rakip_yaratici(c, kiraci: str, bugun: date | None = None) -> dict:
    """Piyasada uzun yaşayan reklamların yaratıcı türü → zayıf yaratıcı çarpanı.

    Sansür: hâlâ yayında ve UZUN_GUN'den genç reklamın sonucu bilinmez, hesaba girmez.
    Çarpan = (türün uzun yaşayanlar içindeki payı / türün tüm payı), shrinkage w = n/(n+20), 0.7–1.4 kırpılı.
    """
    bugun = bugun or date.today()
    kay = c.execute("SELECT yaratici_turu, baslangic, bitis, aktif_gun, yas_erisim, rol FROM rakip_reklam WHERE kiraci_id=? AND yaratici_turu IS NOT NULL",
                    (kiraci,)).fetchall()
    bilinen = []
    for tur, bas, bit, gun, _, _ in kay:
        if gun is None:
            continue
        if bit is None and bas and (bugun - datetime.fromisoformat(bas[:10]).date()).days < UZUN_GUN:
            continue  # sansürlü
        bilinen.append((tur, gun >= UZUN_GUN, gun))
    toplam = len(bilinen)
    uzun = sum(1 for b in bilinen if b[1])
    turler: dict = {}
    for tur in sorted({b[0] for b in bilinen}):
        g = [b for b in bilinen if b[0] == tur]
        n, u = len(g), sum(1 for b in g if b[1])
        ham = ((u / uzun) / (n / toplam)) if uzun and n else 1.0
        w = n / (n + 20)
        carpan = math.exp(w * math.log(max(ham, 1e-3)))
        turler[tur] = {"n": n, "pay": round(n / toplam, 4), "uzunPayi": round(u / n, 4) if n else 0,
                       "medyanGun": statistics.median(b[2] for b in g), "piyasaCarpani": round(min(CARPAN_ARALIK[1], max(CARPAN_ARALIK[0], carpan)), 3)}
    # AB yaş erişimi (rakipler)
    yas: dict[str, float] = {}
    m = 0
    for _, _, _, _, ye, rol in kay:
        if ye and rol == "rakip":
            m += 1
            for b, v in json.loads(ye).items():
                yas[b] = yas.get(b, 0) + v
    return {"toplamReklam": len(kay), "sonucuBilinen": toplam, "uzunYasayan": uzun, "turler": turler,
            "rakipYasErisim": {b: round(v / m, 4) for b, v in sorted(yas.items())} if m else {},
            "guven": "orta" if toplam >= 60 else "dusuk", "uyari": "Yayın süresi performansın vekilidir, kanıtı değildir."}


def kuru_mu(c, kiraci: str) -> bool:
    if c.execute("SELECT 1 FROM rakip_reklam WHERE kiraci_id=? AND id LIKE '%kuru-%' LIMIT 1", (kiraci,)).fetchone():
        return True
    return bool(c.execute("SELECT 1 FROM sosyal_konu_hacmi h JOIN kamu_sorgu s ON s.id=h.konu WHERE s.kiraci_id=? AND h.kaynak='kuru' LIMIT 1", (kiraci,)).fetchone())


def disa_aktar_sim(c, kiraci: str, hedef: Path | None = None) -> dict:
    hedef = hedef or (DEPO / "persona-sim" / "public" / "ogrenilen" / "kamu.json")
    ry = rakip_yaratici(c, kiraci)
    veri = {"surum": date.today().isoformat(), "kaynak": "kamu (Meta Reklam Kütüphanesi, X)", "kiraci": kiraci, "kuruVeri": kuru_mu(c, kiraci),
            "ilgi": ilgi_endeksi(c, kiraci), "duygu": marka_duygu(c, kiraci), "yaratici": ry["turler"], "rakipYasErisim": ry["rakipYasErisim"],
            "guven": ry["guven"], "uyari": ry["uyari"]}
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")
    return veri
